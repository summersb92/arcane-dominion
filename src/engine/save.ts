// Save system — ONE portable, versioned JSON format used by every transport:
// localStorage autosave, clipboard export/import string, and save-to-file /
// load-from-file (.aasave). The browser and the CLI reuse these exact functions,
// so a file the browser downloads loads via `cli load` and vice-versa.
// No DOM, no Svelte — the DOM download/upload is a thin UI adapter over this.

import { STARTING } from '../content/config';
import { EQUIP_POSITIONS, HOME_ITEM_BY_ID } from '../content/home';
import {
  ELEMENTS,
  SAVE_VERSION,
  freshAffinity,
  freshEquipment,
  type ElementId,
  type GameState,
  type ResourceId,
} from './state';

export const SAVE_MAGIC = 'arcane-academy-save';
export const SAVE_FILE_EXT = '.aasave';
export const LOCALSTORAGE_KEY = 'aa-save';

interface SaveEnvelope {
  magic: string;
  version: number;
  state: GameState;
}

export interface LoadResult {
  ok: boolean;
  state?: GameState;
  error?: string;
  migratedFrom?: number;
}

/** Serialize to the portable string. `pretty` for human-readable files. */
export function serialize(state: GameState, pretty = false): string {
  const envelope: SaveEnvelope = { magic: SAVE_MAGIC, version: state.version, state };
  return JSON.stringify(envelope, null, pretty ? 2 : 0);
}

/**
 * Parse + validate + migrate. THROWS on any corruption — callers that must not
 * lose the existing save should use `safeLoad` instead.
 */
export function deserialize(text: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Save is not valid JSON.');
  }
  if (!isEnvelope(parsed)) throw new Error('Unrecognized save format (missing magic/state).');

  let state = parsed.state;
  if (parsed.version < SAVE_VERSION) state = migrate(state, parsed.version);
  else if (parsed.version > SAVE_VERSION) {
    throw new Error(`Save is from a newer version (${parsed.version} > ${SAVE_VERSION}).`);
  }

  // Backfill missing structure FIRST (so read models never see `undefined`), then
  // reject anything left that is structurally present but garbage (NaN / wrong type).
  normalize(state);
  validate(state);
  return state;
}

/** Never throws. On failure returns ok:false and leaves the caller's save intact. */
export function safeLoad(text: string | null | undefined): LoadResult {
  if (!text || !text.trim()) return { ok: false, error: 'No save data.' };
  try {
    const parsedVersion = peekVersion(text);
    const state = deserialize(text);
    return {
      ok: true,
      state,
      migratedFrom: parsedVersion !== undefined && parsedVersion < SAVE_VERSION ? parsedVersion : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Versioned migration ladder — one `vN → vN+1` step per rung, applied in order.
 * Real (not a no-op) even though only v1 ships today: a pre-current (v0) envelope
 * upgrades through migrate0to1. `normalize()` runs AFTER this to backfill anything
 * a step didn't touch, so each rung only needs to handle its own shape delta.
 */
export function migrate(state: GameState, fromVersion: number): GameState {
  let s = state;
  let v = fromVersion;
  if (v < 1) {
    s = migrate0to1(s);
    v = 1;
  }
  if (v === 1) {
    s = migrate1to2(s);
    v = 2;
  }
  if (v === 2) {
    s = migrate2to3(s);
    v = 3;
  }
  if (v === 3) {
    s = migrate3to4(s);
    v = 4;
  }
  if (v === 4) {
    s = migrate4to5(s);
    v = 5;
  }
  void v;
  s.version = SAVE_VERSION;
  return s;
}

/** v0 → v1: the pre-release format predates the Task/Activity system (T-004).
 *  Establish its containers so v1 read models resolve; normalize() fills the rest. */
function migrate0to1(s: GameState): GameState {
  const run = (s.run ??= {} as GameState['run']);
  run.tasks ??= {};
  if (typeof run.activitySlots !== 'number') run.activitySlots = STARTING.activitySlots;
  return s;
}

/** v1 → v2 (v0.1.1): Gold + material caps become first-class, the lair becomes
 *  housing-tier + items, and two display settings arrive. Establish the new shape;
 *  normalize() below fills anything this rung leaves untouched. */
function migrate1to2(s: GameState): GameState {
  const run = (s.run ??= {} as GameState['run']);
  const caps = (run.caps ??= {} as GameState['run']['caps']);
  if (typeof caps.gold !== 'number') caps.gold = STARTING.goldCap;
  if (typeof caps.insight !== 'number') caps.insight = STARTING.insightCap;
  if (typeof caps.moonpetal !== 'number') caps.moonpetal = STARTING.materialCap;
  if (typeof caps.ironOre !== 'number') caps.ironOre = STARTING.materialCap;
  if (typeof caps.spiritDust !== 'number') caps.spiritDust = STARTING.materialCap;
  if (!run.home || typeof run.home !== 'object') {
    run.home = { tier: 'vagrant', owned: [], equipped: [], equipment: freshEquipment(), beltItems: [] };
  }
  const st = (s.settings ??= {} as GameState['settings']);
  if (typeof st.chronicleLines !== 'number') st.chronicleLines = 8;
  if (typeof st.font !== 'string') st.font = 'mono';
  return s;
}

/** v2 → v3 (v0.1.2): Scroll becomes a first-class crafting currency and the character
 *  gains a name + title. Establish the new shape; normalize() below fills anything this
 *  rung leaves untouched (a pre-v3 save has no Scroll → backfill 0, no name → unnamed). */
function migrate2to3(s: GameState): GameState {
  const run = (s.run ??= {} as GameState['run']);
  if (run.resources && typeof run.resources === 'object' && typeof run.resources.scroll !== 'number') {
    run.resources.scroll = 0;
  }
  if (typeof run.name !== 'string') run.name = '';
  if (typeof run.title !== 'string') run.title = 'Waif';
  return s;
}

/** v3 → v4 (v0.1.3): the paper-doll EQUIPMENT system arrives. Establish the two new
 *  home containers (equipment: all eleven positions → null, beltItems: []); normalize()
 *  below fills anything this rung leaves untouched. Old owned/equipped are preserved. */
function migrate3to4(s: GameState): GameState {
  const run = (s.run ??= {} as GameState['run']);
  const home = (run.home ??= { tier: 'vagrant', owned: [], equipped: [], equipment: freshEquipment(), beltItems: [] });
  if (!home.equipment || typeof home.equipment !== 'object') home.equipment = freshEquipment();
  if (!Array.isArray(home.beltItems)) home.beltItems = [];
  if (!Array.isArray(home.owned)) home.owned = [];
  if (!Array.isArray(home.equipped)) home.equipped = [];
  // Several v0.1.2 GENERIC items (tool-belt, herbalist-kit, charm-of-vigor, mana-crystal)
  // became paper-doll GEAR in v0.1.3. A v3 save may hold such an id in the generic
  // `equipped[]`; left there, its mods would be counted a SECOND time once the player
  // re-equips it on the doll (activeMods sums both lists). Pull every now-gear id out of
  // `equipped[]` and return it to `owned` (no loss — the player re-equips it on the doll).
  const nowGear = home.equipped.filter((id) => HOME_ITEM_BY_ID[id]?.slot);
  if (nowGear.length) {
    home.equipped = home.equipped.filter((id) => !HOME_ITEM_BY_ID[id]?.slot);
    for (const id of nowGear) if (!home.owned.includes(id)) home.owned.push(id);
  }
  return s;
}

/** v4 → v5 (v0.1.4): the Strength stat + hidden elemental affinity arrive. Establish the
 *  three new run containers (strengthXp: 0, affinity: all elements → 0, affinityElement:
 *  null); normalize() below fills anything this rung leaves untouched. */
function migrate4to5(s: GameState): GameState {
  const run = (s.run ??= {} as GameState['run']);
  if (typeof run.strengthXp !== 'number') run.strengthXp = 0;
  if (!run.affinity || typeof run.affinity !== 'object') run.affinity = freshAffinity();
  if (run.affinityElement === undefined) run.affinityElement = null;
  return s;
}

// --- clipboard export/import (same portable format, compact) ---
export const exportString = (state: GameState): string => serialize(state, false);
export const importString = (text: string): GameState => deserialize(text);

// --- file helpers the UI download/upload and the CLI both reuse (pretty JSON) ---
export const toFileString = (state: GameState): string => serialize(state, true);
export const fromFileString = (text: string): GameState => deserialize(text);

// --- internals ---
function isEnvelope(v: unknown): v is SaveEnvelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as SaveEnvelope).magic === SAVE_MAGIC &&
    typeof (v as SaveEnvelope).version === 'number' &&
    typeof (v as SaveEnvelope).state === 'object' &&
    (v as SaveEnvelope).state !== null
  );
}

function peekVersion(text: string): number | undefined {
  try {
    const p = JSON.parse(text) as { version?: unknown };
    return typeof p.version === 'number' ? p.version : undefined;
  } catch {
    return undefined;
  }
}

const RESOURCE_IDS: ResourceId[] = ['gold', 'insight', 'renown', 'moonpetal', 'ironOre', 'spiritDust', 'scroll'];
const CAP_IDS = ['gold', 'insight', 'moonpetal', 'ironOre', 'spiritDust'] as const;
const VITAL_IDS = ['life', 'stamina', 'mana'] as const;

// Match the sim's affordability tolerance (systems/tasks.ts canAfford) so a resource or
// vital that legitimately SETTLED within a float epsilon of its clamp boundary in play
// isn't falsely rejected as corruption on reload.
const EPS = 1e-9;

/**
 * Fill defaults for every `run.*` field a read model touches, so `toView()` (which
 * runs on the initial setState/publish, BEFORE the first tick's self-heal) never
 * dereferences `undefined`. Only fills *absent* containers/keys — a present-but-
 * malformed value (e.g. a `{}` vital) is left for `validate()` to reject, never
 * silently guessed. Idempotent on a complete save. Exported for the migrate ladder
 * and tests.
 */
export function normalize(state: GameState): void {
  if (!state || typeof state !== 'object') return; // nothing to backfill (validate rejects)

  // settings — setState()/System.svelte read state.settings.notation on boot, BEFORE the
  // first run-based render AND outside safeLoad's guard, so a save that parses+validates
  // but lacks settings (the migrate v0 target, or a foreign/hand-edited .aasave) would
  // otherwise throw a TypeError on import/boot. Default it alongside the run.* backfills.
  state.settings ??= { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' };
  state.settings.notation ??= 'suffix';
  state.settings.theme ??= 'system';
  if (typeof state.settings.chronicleLines !== 'number') state.settings.chronicleLines = 8;
  if (typeof state.settings.font !== 'string') state.settings.font = 'mono';

  const run = state.run;
  if (!run || typeof run !== 'object') return; // validate() will reject a missing run

  // containers the read models iterate/spread — undefined here would throw on render
  run.tasks ??= {};
  run.flags ??= {};
  run.skills ??= [];
  run.chronicle ??= [];
  if (run.phase === undefined) run.phase = 'origin';
  if (typeof run.act !== 'number') run.act = 1;
  if (typeof run.activitySlots !== 'number') run.activitySlots = STARTING.activitySlots;

  // character model (v0.1.2) — read models spread run.name/title on render (Player view).
  if (typeof run.name !== 'string') run.name = '';
  if (typeof run.title !== 'string') run.title = 'Waif';

  // home (v0.1.1) — read models spread run.home.equipped/owned on render, so back it up.
  if (!run.home || typeof run.home !== 'object') {
    run.home = { tier: 'vagrant', owned: [], equipped: [], equipment: freshEquipment(), beltItems: [] };
  }
  if (typeof run.home.tier !== 'string') run.home.tier = 'vagrant';
  if (!Array.isArray(run.home.owned)) run.home.owned = [];
  if (!Array.isArray(run.home.equipped)) run.home.equipped = [];
  // Paper-doll equipment (v0.1.3) — read models iterate every position + beltItems on
  // render, so backfill ABSENT containers. A present-but-garbage value is left to validate().
  if (!run.home.equipment || typeof run.home.equipment !== 'object') run.home.equipment = freshEquipment();
  for (const pos of EQUIP_POSITIONS) {
    if (!(pos in run.home.equipment)) run.home.equipment[pos] = null;
  }
  if (!Array.isArray(run.home.beltItems)) run.home.beltItems = [];
  // Reconcile the belt sub-slot count with the equipped belt: beltItems must be exactly
  // as long as the worn belt grants (0 with no belt). A mismatch (hand-edited save, or a
  // belt whose beltSlots changed in content) would otherwise render phantom pouches and
  // count phantom mods. Overflow sub-items fall back to `owned` (never dropped).
  {
    const beltId = run.home.equipment.belt;
    const beltSlots = beltId ? (HOME_ITEM_BY_ID[beltId]?.beltSlots ?? 0) : 0;
    if (run.home.beltItems.length > beltSlots) {
      for (const id of run.home.beltItems.slice(beltSlots)) {
        if (id && !run.home.owned.includes(id)) run.home.owned.push(id);
      }
      run.home.beltItems.length = beltSlots;
    }
    while (run.home.beltItems.length < beltSlots) run.home.beltItems.push(null);
  }

  // Backfill ABSENT (undefined) cap keys only — a present-but-garbage value (e.g. a
  // null from a serialized Infinity/NaN) is left for validate() to reject, never healed.
  run.caps ??= {} as GameState['run']['caps'];
  if (run.caps.gold === undefined) run.caps.gold = STARTING.goldCap;
  if (run.caps.insight === undefined) run.caps.insight = STARTING.insightCap;
  if (run.caps.moonpetal === undefined) run.caps.moonpetal = STARTING.materialCap;
  if (run.caps.ironOre === undefined) run.caps.ironOre = STARTING.materialCap;
  if (run.caps.spiritDust === undefined) run.caps.spiritDust = STARTING.materialCap;

  run.resources ??= {} as GameState['run']['resources'];
  for (const id of RESOURCE_IDS) run.resources[id] ??= 0;

  if (!run.vitals || typeof run.vitals !== 'object') {
    run.vitals = { life: { ...STARTING.life }, stamina: { ...STARTING.stamina }, mana: { ...STARTING.mana } };
  } else {
    run.vitals.life ??= { ...STARTING.life };
    run.vitals.stamina ??= { ...STARTING.stamina };
    run.vitals.mana ??= { ...STARTING.mana };
  }

  if (!run.essence || typeof run.essence !== 'object') {
    run.essence = {} as GameState['run']['essence'];
  }
  for (const id of ELEMENTS as ElementId[]) {
    if (!run.essence[id] || typeof run.essence[id] !== 'object') {
      run.essence[id] = { amount: 0, awakened: false };
    }
  }

  // Strength + hidden affinity (v0.1.4) — read models spread run.strengthXp / run.affinity
  // and stores derives Strength from them, so backfill ABSENT containers (a present-but-
  // garbage value is left to validate()). Ensure every element key exists on affinity.
  if (typeof run.strengthXp !== 'number') run.strengthXp = 0;
  if (!run.affinity || typeof run.affinity !== 'object') run.affinity = freshAffinity();
  for (const id of ELEMENTS as ElementId[]) {
    if (typeof run.affinity[id] !== 'number') run.affinity[id] = 0;
  }
  // affinityElement: null until awakening, else a valid ElementId. Backfill absent → null;
  // an out-of-domain string (hand-edited/foreign save) is normalized back to null.
  if (run.affinityElement !== null && !(ELEMENTS as string[]).includes(run.affinityElement as string)) {
    run.affinityElement = null;
  }

  // Progressive resource reveal (v0.1.6) — no SAVE_VERSION bump: handled purely here.
  // Backfill the container, always show Gold, and seed discovery for anything an existing
  // save already holds (> 0) so a loaded run immediately shows what it has earned.
  run.discovered ??= {};
  run.discovered.gold = true;
  if (run.resources && typeof run.resources === 'object') {
    for (const id of RESOURCE_IDS) {
      if ((run.resources[id] ?? 0) > EPS) run.discovered[id] = true;
    }
  }
}

/** Structural + finiteness check — guards against NaN/garbage silently loading. */
function validate(state: GameState): void {
  const run = state?.run;
  if (!run || typeof run !== 'object') throw new Error('Save missing run state.');

  if (typeof run.name !== 'string') throw new Error('Save run.name is not a string.');
  if (typeof run.title !== 'string') throw new Error('Save run.title is not a string.');

  if (!run.resources || typeof run.resources !== 'object') throw new Error('Save missing resources.');
  for (const [k, val] of Object.entries(run.resources)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new Error(`Resource "${k}" is not a finite number.`);
    }
    // Resources are gated by canAfford and never clamp below 0 in play, so a materially
    // negative amount is corruption — reject (fail-safe) rather than silently loading a
    // broken run. Tolerate a sub-EPS undershoot (float settling), matching canAfford's EPS.
    if (val < -EPS) throw new Error(`Resource "${k}" is negative (${val}).`);
  }

  if (!run.vitals?.life || !run.vitals?.stamina || !run.vitals?.mana) {
    throw new Error('Save missing vitals.');
  }
  for (const key of VITAL_IDS) {
    const v = run.vitals[key];
    for (const field of ['cur', 'max', 'regen'] as const) {
      if (typeof v[field] !== 'number' || !Number.isFinite(v[field])) {
        throw new Error(`Vital "${key}.${field}" is not a finite number.`);
      }
    }
    // `cur` is always clamped to [0, max] in play (addPool + regen), so a materially out-of-
    // range value is corruption. Reject it — consistent with the negative-resource fail-safe,
    // including the same EPS tolerance for a value that settled on a boundary.
    if (v.cur < -EPS || v.cur > v.max + EPS) {
      throw new Error(`Vital "${key}" cur ${v.cur} out of range [0, ${v.max}].`);
    }
  }

  if (!run.caps || typeof run.caps !== 'object') throw new Error('Save missing caps.');
  for (const capId of CAP_IDS) {
    const c = run.caps[capId];
    if (typeof c !== 'number' || !Number.isFinite(c)) {
      throw new Error(`Save has an invalid ${capId} cap.`);
    }
  }

  if (!run.home || typeof run.home !== 'object') throw new Error('Save missing home.');
  if (typeof run.home.tier !== 'string') throw new Error('Save home.tier is not a string.');
  if (!Array.isArray(run.home.owned) || !Array.isArray(run.home.equipped)) {
    throw new Error('Save home.owned/equipped must be arrays.');
  }
  // Paper-doll equipment (v0.1.3): equipment is an object of string|null; beltItems an array.
  if (!run.home.equipment || typeof run.home.equipment !== 'object' || Array.isArray(run.home.equipment)) {
    throw new Error('Save home.equipment must be an object.');
  }
  for (const [pos, val] of Object.entries(run.home.equipment)) {
    if (val !== null && typeof val !== 'string') {
      throw new Error(`Save home.equipment["${pos}"] must be a string or null.`);
    }
  }
  if (!Array.isArray(run.home.beltItems)) throw new Error('Save home.beltItems must be an array.');
  for (const val of run.home.beltItems) {
    if (val !== null && typeof val !== 'string') throw new Error('Save home.beltItems entries must be a string or null.');
  }
  // Disjointness: an item id must never be worn on the paper doll AND held in the generic
  // `equipped[]` at once — activeMods sums both, so an overlap double-counts its mods.
  // Reject it as corruption (migrate3to4 keeps legitimate saves clean of this).
  {
    const onDoll = new Set<string>();
    for (const val of Object.values(run.home.equipment)) if (typeof val === 'string') onDoll.add(val);
    for (const val of run.home.beltItems) if (typeof val === 'string') onDoll.add(val);
    for (const id of run.home.equipped) {
      if (onDoll.has(id)) throw new Error(`Save has "${id}" equipped in two places (doll + generic slot).`);
    }
  }

  if (run.essence && typeof run.essence === 'object') {
    for (const [id, e] of Object.entries(run.essence)) {
      if (!e || typeof e.amount !== 'number' || !Number.isFinite(e.amount)) {
        throw new Error(`Essence "${id}" amount is not a finite number.`);
      }
    }
  }

  // Strength + affinity (v0.1.4).
  if (typeof run.strengthXp !== 'number' || !Number.isFinite(run.strengthXp) || run.strengthXp < -EPS) {
    throw new Error('Save run.strengthXp is not a finite, non-negative number.');
  }
  if (!run.affinity || typeof run.affinity !== 'object') throw new Error('Save missing affinity.');
  for (const [id, v] of Object.entries(run.affinity)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`Affinity "${id}" is not a finite number.`);
    }
  }
  if (run.affinityElement !== null && !(ELEMENTS as string[]).includes(run.affinityElement as string)) {
    throw new Error('Save run.affinityElement must be null or a valid element id.');
  }

  if (typeof state.playtime !== 'number' || !Number.isFinite(state.playtime)) {
    throw new Error('Save has invalid playtime.');
  }
  if (typeof state.lastSaved !== 'number' || !Number.isFinite(state.lastSaved)) {
    throw new Error('Save has invalid lastSaved.');
  }

  if (!state.settings || typeof state.settings !== 'object') throw new Error('Save missing settings.');
  if (typeof state.settings.chronicleLines !== 'number' || !Number.isFinite(state.settings.chronicleLines)) {
    throw new Error('Save has invalid chronicleLines setting.');
  }
  if (typeof state.settings.font !== 'string') throw new Error('Save has invalid font setting.');
}

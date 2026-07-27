// Save system — ONE portable, versioned JSON format used by every transport:
// localStorage autosave, clipboard export/import string, and save-to-file /
// load-from-file (.adsave). The browser and the CLI reuse these exact functions.
// No DOM, no Svelte — the DOM download/upload is a thin UI adapter over this.
//
// SAVE_VERSION is 13. `migrate` brings an older save's shape up to current (v1 → v2 added
// the `culture` resource; v2 → v3 added the `furs` luxury resource; v3 → v4 added the
// `manaCrystals` mined resource; v4 → v5 added the `iron` mined resource; v5 → v6 added the
// `coal`/`steel` materials + the converter `active` toggle map; v6 → v7 made `active` per-recipe
// arrays; v7 → v8 added the industrial goods `tools`/`engines`/`furniture`; v8 → v9 added the
// knowledge-chain goods `parchment`/`books`/`compendiums`); `normalize` then backfills
// every run.* container the read models touch so a partial/foreign save never dereferences
// undefined; `validate` finally rejects anything structurally garbage (NaN, wrong type,
// out-of-range) rather than loading a broken run.

import { JOB_IDS } from '../content/jobs';
import { currentSeasonOrdinal } from './systems/calendar';
import { MUNDANE_RESOURCE_IDS, RESOURCE_IDS, type MundaneResourceId } from '../content/resources';
import {
  SAVE_VERSION,
  freshCaps,
  freshResources,
  type GameState,
} from './state';

export const SAVE_MAGIC = 'arcane-dominion-save';
export const SAVE_FILE_EXT = '.adsave';
export const LOCALSTORAGE_KEY = 'ad-save';

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
 * Parse + validate + migrate. THROWS on any corruption — callers that must not lose the
 * existing save should use `safeLoad` instead.
 */
export function deserialize(text: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Save is not valid JSON.');
  }
  if (!isEnvelope(parsed)) throw new Error('Unrecognized save format (missing magic/state).');

  const state = parsed.state;
  if (parsed.version > SAVE_VERSION) {
    throw new Error(`Save is from a newer version (${parsed.version} > ${SAVE_VERSION}).`);
  }
  migrate(state, typeof parsed.version === 'number' ? parsed.version : SAVE_VERSION);

  normalize(state);
  validate(state);
  state.version = SAVE_VERSION;
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

// --- clipboard export/import (same portable format, compact) ---
export const exportString = (state: GameState): string => serialize(state, false);
export const importString = (text: string): GameState => deserialize(text);

// --- file helpers the UI download/upload and the CLI both reuse (pretty JSON) ---
export const toFileString = (state: GameState): string => serialize(state, true);
export const fromFileString = (text: string): GameState => deserialize(text);

/**
 * Migration ladder — bring an older save's SHAPE up to the current SAVE_VERSION before
 * normalize/validate run. Each rung is idempotent and only touches what changed.
 *   v1 → v2: added the `culture` resource. It defaults to 0; normalize's per-id backfill
 *            (over RESOURCE_IDS) fills it, so this rung only documents the bump. Research
 *            and happiness became DERIVED (a cap and a read model) — no persistent fields.
 *   v2 → v3: added the `furs` luxury resource (held → +happiness). It defaults to 0, and its
 *            storage cap defaults to the base 200; normalize's RESOURCE_IDS + MUNDANE_RESOURCE_IDS
 *            backfills both, so this rung only documents the bump.
 *   v3 → v4: added the `manaCrystals` mined resource (a path to discovering magic). It defaults
 *            to 0, and its storage cap defaults to the base 200; normalize's RESOURCE_IDS +
 *            MUNDANE_RESOURCE_IDS backfills both, so this rung only documents the bump.
 *   v4 → v5: added the `iron` mined resource (the Miner + Mine now yield iron, not stone). It
 *            defaults to 0, and its storage cap defaults to the base 200; normalize's RESOURCE_IDS +
 *            MUNDANE_RESOURCE_IDS backfills both, so this rung only documents the bump.
 *   v5 → v6: added the `coal` + `steel` materials and the converter `active` toggle map. Resources
 *            default to 0 and caps to 200 (normalize's RESOURCE_IDS + MUNDANE_RESOURCE_IDS); the
 *            `active` map backfills to {} (absent entries read as all-on). Documents the bump.
 *   v6 → v7: the converter `active` map became PER-RECIPE arrays (multi-fuel Steelworks). Any old
 *            scalar count is wrapped into a one-element array here (its copies keep running recipe 0).
 *   v7 → v8: added the industrial goods `tools`/`engines`/`furniture` (Age of Steam). Each defaults
 *            to 0 and its cap to 200 (normalize's RESOURCE_IDS + MUNDANE_RESOURCE_IDS). Documents the bump.
 *   v8 → v9: added the knowledge-chain goods `parchment`/`books`/`compendiums`. Each defaults to 0 and
 *            its cap to 200 (normalize's RESOURCE_IDS + MUNDANE_RESOURCE_IDS). Documents the bump.
 *   v9 → v10: added `policies` (active governance edicts). Backfills to [] (normalize). Documents the bump.
 *   v10 → v11: added the four prismatic essences + Prismatic Mana. Each defaults to 0; the essence
 *            caps default to 100 (normalize's RESOURCE_IDS + MUNDANE_RESOURCE_IDS). Documents the bump.
 *   v11 → v12: added `curriculum` (the Arcanum's chosen discipline). Backfills to null (normalize).
 *   v12 → v13: added the `gold` treasury (the Currency line). Uncapped; backfills to 0 (normalize).
 *   v13 → v14: added `alchemical` components (Naturalism teaches Hunters + Ranches to save them).
 *            Defaults to 0 with a 200 cap; normalize's RESOURCE_IDS + MUNDANE_RESOURCE_IDS loops
 *            backfill both, so this rung only documents the bump.
 *   v14 → v15: added `seasonTally` (the per-season birth/death roll-up the chronicle reports).
 *            Backfilled by normalize to the season the save's playtime actually falls in, so a
 *            loaded save doesn't immediately flush a phantom "season turned" line.
 *   v15 → v16: added `vacancies` (posts emptied by starvation, refilled as citizens return).
 *            Backfills to {} — an older save simply has no remembered posts, which is exactly
 *            right: nothing was recorded while it was being played.
 */
function migrate(state: GameState, fromVersion: number): void {
  if (!state || typeof state !== 'object') return;
  const hasResources =
    state.run && typeof state.run === 'object' && state.run.resources && typeof state.run.resources === 'object';
  if (fromVersion < 2) {
    // culture backfilled to 0 by normalize (RESOURCE_IDS loop). Nothing else to rewrite.
    if (hasResources) state.run.resources.culture ??= 0;
  }
  if (fromVersion < 3) {
    // furs backfilled to 0 (RESOURCE_IDS loop) and its cap to 200 (MUNDANE_RESOURCE_IDS loop)
    // by normalize. Nothing else to rewrite.
    if (hasResources) state.run.resources.furs ??= 0;
  }
  if (fromVersion < 4) {
    // manaCrystals backfilled to 0 (RESOURCE_IDS loop) and its cap to 200 (MUNDANE_RESOURCE_IDS
    // loop) by normalize. Nothing else to rewrite.
    if (hasResources) state.run.resources.manaCrystals ??= 0;
  }
  if (fromVersion < 5) {
    // iron backfilled to 0 (RESOURCE_IDS loop) and its cap to 200 (MUNDANE_RESOURCE_IDS loop)
    // by normalize. The Miner/Mine now yield iron instead of stone; old saves keep whatever
    // stone they had and simply start iron at 0. Nothing else to rewrite.
    if (hasResources) state.run.resources.iron ??= 0;
  }
  if (fromVersion < 6) {
    // coal/steel backfilled to 0 (RESOURCE_IDS loop) and their caps to 200 (MUNDANE_RESOURCE_IDS
    // loop) by normalize; the converter `active` map is backfilled to {} by normalize (absent
    // entries read as all-on). Nothing else to rewrite.
    if (hasResources) {
      state.run.resources.coal ??= 0;
      state.run.resources.steel ??= 0;
    }
  }
  if (fromVersion < 7) {
    // The converter `active` map went from a single count per building to a PER-RECIPE array.
    // Wrap any old scalar count into a one-element array (its copies keep running recipe 0).
    const active = state.run?.active;
    if (active && typeof active === 'object') {
      for (const [k, v] of Object.entries(active)) {
        if (typeof v === 'number') (active as Record<string, number[]>)[k] = [v];
      }
    }
  }
  if (fromVersion < 8) {
    // Industrial goods (tools/engines/furniture) backfilled to 0 (RESOURCE_IDS loop) and their
    // caps to 200 (MUNDANE_RESOURCE_IDS loop) by normalize. Nothing else to rewrite.
    if (hasResources) {
      state.run.resources.tools ??= 0;
      state.run.resources.engines ??= 0;
      state.run.resources.furniture ??= 0;
    }
  }
  if (fromVersion < 9) {
    // Knowledge-chain goods (parchment/books/compendiums) backfilled to 0 (RESOURCE_IDS loop) and
    // their caps to 200 (MUNDANE_RESOURCE_IDS loop) by normalize. Nothing else to rewrite.
    if (hasResources) {
      state.run.resources.parchment ??= 0;
      state.run.resources.books ??= 0;
      state.run.resources.compendiums ??= 0;
    }
  }
  if (fromVersion < 10) {
    // Active policies backfilled to [] by normalize. Nothing else to rewrite.
    if (state.run && typeof state.run === 'object') state.run.policies ??= [];
  }
  if (fromVersion < 13) {
    // gold backfilled to 0 by normalize (RESOURCE_IDS loop). Uncapped, so no cap entry.
    if (hasResources) state.run.resources.gold ??= 0;
  }
  if (fromVersion < 12) {
    // curriculum backfilled to null by normalize (no discipline chosen yet).
    if (state.run && typeof state.run === 'object' && state.run.curriculum === undefined) {
      state.run.curriculum = null;
    }
  }
  if (fromVersion < 11) {
    // Prismatic essences + Prismatic Mana backfilled to 0 (RESOURCE_IDS loop) and the essence
    // caps to 100 (MUNDANE_RESOURCE_IDS loop) by normalize. Nothing else to rewrite.
    if (hasResources) {
      state.run.resources.airEssence ??= 0;
      state.run.resources.earthEssence ??= 0;
      state.run.resources.fireEssence ??= 0;
      state.run.resources.waterEssence ??= 0;
      state.run.resources.prismatic ??= 0;
    }
  }
}

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

// Match the sim's affordability tolerance so a value that legitimately settled within a
// float epsilon of a clamp boundary isn't falsely rejected as corruption on reload.
const EPS = 1e-9;

/**
 * Fill defaults for every `run.*` field a read model touches, so read models never
 * dereference `undefined`. Only fills *absent* containers/keys — a present-but-malformed
 * value (e.g. a NaN resource) is left for `validate()` to reject, never silently guessed.
 * Idempotent on a complete save. Exported for tests.
 */
export function normalize(state: GameState): void {
  if (!state || typeof state !== 'object') return; // nothing to backfill (validate rejects)

  // settings — read on boot before the first run-based render, outside safeLoad's guard.
  state.settings ??= { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono', fontScale: 100 };
  state.settings.notation ??= 'suffix';
  state.settings.theme ??= 'system';
  if (typeof state.settings.chronicleLines !== 'number') state.settings.chronicleLines = 8;
  if (typeof state.settings.font !== 'string') state.settings.font = 'mono';
  // UI scale: backfilled for saves written before the setting existed, and clamped here so a
  // hand-edited save can never leave the app zoomed to something unreadable.
  const fs = state.settings.fontScale;
  state.settings.fontScale =
    typeof fs === 'number' && Number.isFinite(fs) ? Math.max(80, Math.min(160, Math.round(fs))) : 100;

  const run = state.run;
  if (!run || typeof run !== 'object') return; // validate() will reject a missing run

  // Containers the read models iterate/spread — undefined here would throw on render.
  run.flags ??= {};
  run.chronicle ??= [];
  if (!Array.isArray(run.tech)) run.tech = [];
  if (typeof run.growthProgress !== 'number') run.growthProgress = 0;
  if (typeof run.popCap !== 'number') run.popCap = 0;

  // Resources — backfill the whole ledger, then any absent individual id.
  if (!run.resources || typeof run.resources !== 'object') run.resources = freshResources();
  for (const id of RESOURCE_IDS) run.resources[id] ??= 0;

  // Caps (mundane only) — backfill absent keys; a present-but-garbage value is left to validate().
  if (!run.caps || typeof run.caps !== 'object') run.caps = freshCaps();
  const defCaps = freshCaps();
  for (const id of MUNDANE_RESOURCE_IDS) {
    if (run.caps[id] === undefined) run.caps[id] = defCaps[id];
    // A stored cap is the BASE plus whatever Storehouses have added, so it can never
    // legitimately sit below the current base. Floor it — that way a base-cap rebalance
    // reaches saves already in flight without ever shrinking someone's hard-won storage.
    else if (typeof run.caps[id] === 'number' && run.caps[id] < defCaps[id]) run.caps[id] = defCaps[id];
  }

  // Population — backfill the container + the jobs map (absent job ids → 0).
  if (!run.population || typeof run.population !== 'object') {
    run.population = { total: 0, jobs: {} as GameState['run']['population']['jobs'] };
  }
  if (typeof run.population.total !== 'number') run.population.total = 0;
  if (!run.population.jobs || typeof run.population.jobs !== 'object') {
    run.population.jobs = {} as GameState['run']['population']['jobs'];
  }
  for (const id of JOB_IDS) run.population.jobs[id] ??= 0;

  // Remembered posts — absent (or garbage) means the settlement is holding none open.
  if (!run.vacancies || typeof run.vacancies !== 'object') run.vacancies = {};
  for (const [id, n] of Object.entries(run.vacancies)) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) delete run.vacancies[id as never];
  }

  // Buildings map — backfill the container (individual counts stay sparse/optional).
  if (!run.buildings || typeof run.buildings !== 'object') run.buildings = {};

  // Converter activation map — backfill the container. Absent per-building entries mean "all on"
  // (activeCount defaults missing → count), so old saves keep their converters running.
  if (!run.active || typeof run.active !== 'object') run.active = {};

  // Active policies — backfill the list (absent → none enacted).
  if (!Array.isArray(run.policies)) run.policies = [];

  // Curriculum — absent means no discipline chosen (general studies).
  if (run.curriculum === undefined) run.curriculum = null;

  // Season tally — seed it to the season this save's playtime ACTUALLY sits in, so a v14
  // save doesn't report a season turning the instant it loads.
  const t = run.seasonTally;
  if (!t || typeof t !== 'object' || typeof t.index !== 'number' || !Number.isFinite(t.index)) {
    run.seasonTally = { index: currentSeasonOrdinal(state.playtime ?? 0), born: 0, died: 0 };
  } else {
    if (typeof t.born !== 'number' || !Number.isFinite(t.born) || t.born < 0) t.born = 0;
    if (typeof t.died !== 'number' || !Number.isFinite(t.died) || t.died < 0) t.died = 0;
  }
}

/** Structural + finiteness check — guards against NaN/garbage silently loading. */
function validate(state: GameState): void {
  const run = state?.run;
  if (!run || typeof run !== 'object') throw new Error('Save missing run state.');

  if (!run.resources || typeof run.resources !== 'object') throw new Error('Save missing resources.');
  for (const [k, val] of Object.entries(run.resources)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new Error(`Resource "${k}" is not a finite number.`);
    }
    if (val < -EPS) throw new Error(`Resource "${k}" is negative (${val}).`);
  }

  if (!run.caps || typeof run.caps !== 'object') throw new Error('Save missing caps.');
  for (const capId of MUNDANE_RESOURCE_IDS) {
    const c = run.caps[capId as MundaneResourceId];
    if (typeof c !== 'number' || !Number.isFinite(c)) throw new Error(`Save has an invalid ${capId} cap.`);
    if (c < -EPS) throw new Error(`Save ${capId} cap is negative (${c}).`);
  }

  if (!run.population || typeof run.population !== 'object') throw new Error('Save missing population.');
  if (typeof run.population.total !== 'number' || !Number.isFinite(run.population.total) || run.population.total < -EPS) {
    throw new Error('Save population.total is not a finite, non-negative number.');
  }
  if (!run.population.jobs || typeof run.population.jobs !== 'object') throw new Error('Save missing population.jobs.');
  let assigned = 0;
  for (const [job, n] of Object.entries(run.population.jobs)) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < -EPS) {
      throw new Error(`Job assignment "${job}" is not a finite, non-negative number.`);
    }
    assigned += n;
  }
  // Assigned workers can never exceed the total citizen count — that would mean phantom labour.
  if (assigned > run.population.total + EPS) {
    throw new Error(`Save assigns ${assigned} workers but only ${run.population.total} citizens exist.`);
  }

  if (typeof run.popCap !== 'number' || !Number.isFinite(run.popCap) || run.popCap < -EPS) {
    throw new Error('Save run.popCap is not a finite, non-negative number.');
  }
  if (typeof run.growthProgress !== 'number' || !Number.isFinite(run.growthProgress)) {
    throw new Error('Save run.growthProgress is not a finite number.');
  }

  if (!run.buildings || typeof run.buildings !== 'object') throw new Error('Save missing buildings.');
  for (const [id, n] of Object.entries(run.buildings)) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < -EPS) {
      throw new Error(`Building count "${id}" is not a finite, non-negative number.`);
    }
  }

  if (!Array.isArray(run.tech)) throw new Error('Save run.tech must be an array.');

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

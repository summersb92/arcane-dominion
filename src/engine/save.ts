// Save system — ONE portable, versioned JSON format used by every transport:
// localStorage autosave, clipboard export/import string, and save-to-file /
// load-from-file (.adsave). The browser and the CLI reuse these exact functions.
// No DOM, no Svelte — the DOM download/upload is a thin UI adapter over this.
//
// SAVE_VERSION is 7. `migrate` brings an older save's shape up to current (v1 → v2 added
// the `culture` resource; v2 → v3 added the `furs` luxury resource; v3 → v4 added the
// `manaCrystals` mined resource; v4 → v5 added the `iron` mined resource; v5 → v6 added the
// `coal`/`steel` materials + the converter `active` toggle map; v6 → v7 made `active` per-recipe
// arrays); `normalize` then backfills
// every run.* container the read models touch so a partial/foreign save never dereferences
// undefined; `validate` finally rejects anything structurally garbage (NaN, wrong type,
// out-of-range) rather than loading a broken run.

import { JOB_IDS } from '../content/jobs';
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
  state.settings ??= { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' };
  state.settings.notation ??= 'suffix';
  state.settings.theme ??= 'system';
  if (typeof state.settings.chronicleLines !== 'number') state.settings.chronicleLines = 8;
  if (typeof state.settings.font !== 'string') state.settings.font = 'mono';

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

  // Buildings map — backfill the container (individual counts stay sparse/optional).
  if (!run.buildings || typeof run.buildings !== 'object') run.buildings = {};

  // Converter activation map — backfill the container. Absent per-building entries mean "all on"
  // (activeCount defaults missing → count), so old saves keep their converters running.
  if (!run.active || typeof run.active !== 'object') run.active = {};
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
  // Assigned workers can never exceed the total settler count — that would mean phantom labour.
  if (assigned > run.population.total + EPS) {
    throw new Error(`Save assigns ${assigned} workers but only ${run.population.total} settlers exist.`);
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

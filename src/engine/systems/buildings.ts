// Buildings — pay a (possibly escalating) resource cost to raise a structure, then
// apply its IMMEDIATE effects (popCap / storage caps) once. ONGOING effects (job
// capacity, construct production, mana upkeep) are NOT applied here — they are derived
// each tick from the building count (systems/jobs.ts, systems/production.ts). Requirement
// gates (tech + affordability) are enforced before any resource is spent. Pure engine.

import { BUILDINGS, BUILDING_BY_ID, type BuildingDef, type BuildingId } from '../../content/buildings';
import { MUNDANE_RESOURCE_IDS, type ResourceId } from '../../content/resources';
import type { GameState } from '../state';
import { logEvent } from './chronicle';

const EPS = 1e-9;

/** True if a building is a CONVERTER (has a `convert` effect) — toggled N-of-M via run.active. */
export function isConverter(def: BuildingDef): boolean {
  return def.effects.some((e) => e.kind === 'convert');
}

/** How many copies of `id` are switched ON. Absent from run.active → all copies (backwards-compat
 *  for old saves and buildings never toggled). Always clamped to [0, count]. */
export function activeCount(state: GameState, id: BuildingId): number {
  const count = state.run.buildings[id] ?? 0;
  const a = state.run.active?.[id];
  if (a === undefined) return count;
  return Math.max(0, Math.min(count, Math.floor(a)));
}

/** Switch `n` copies of a converter ON (clamped to [0, count]). Used by the UI toggle. */
export function setActive(state: GameState, id: BuildingId, n: number): void {
  const count = state.run.buildings[id] ?? 0;
  state.run.active ??= {};
  state.run.active[id] = Math.max(0, Math.min(count, Math.floor(n)));
}

/** Current cost of the NEXT copy of a building (escalates by costGrowth^count). */
export function buildingCost(state: GameState, id: BuildingId): Partial<Record<ResourceId, number>> {
  const def = BUILDING_BY_ID[id];
  const count = state.run.buildings[id] ?? 0;
  const growth = def.costGrowth ?? 1;
  const mult = growth === 1 ? 1 : Math.pow(growth, count);
  const out: Partial<Record<ResourceId, number>> = {};
  for (const [res, amt] of Object.entries(def.cost)) {
    out[res as ResourceId] = growth === 1 ? (amt as number) : Math.ceil((amt as number) * mult);
  }
  return out;
}

/** True once the building's prerequisites (tech + prerequisite building) are satisfied.
 *  The building-prereq keeps the opening board minimal: only the Hut shows at the very
 *  start; Storehouse/workplaces reveal once a Hut exists, the Study once foraging is up. */
export function isUnlocked(state: GameState, def: BuildingDef): boolean {
  if (def.requiresTech && !state.run.tech.includes(def.requiresTech as never)) return false;
  // Discovery-gated buildings (the magic constructs) require a run flag rather than a tech.
  if (def.requiresFlag && state.run.flags[def.requiresFlag] !== true) return false;
  if (def.requiresBuilding && (state.run.buildings[def.requiresBuilding] ?? 0) < 1) return false;
  return true;
}

/** True if the current cost is affordable right now. */
export function canAfford(state: GameState, id: BuildingId): boolean {
  const cost = buildingCost(state, id);
  for (const [res, amt] of Object.entries(cost)) {
    if ((state.run.resources[res as ResourceId] ?? 0) < (amt as number) - EPS) return false;
  }
  return true;
}

/**
 * Build one copy of `id`. Enforces tech gate, per-building max, and affordability;
 * on success pays the cost, increments the count, and applies immediate effects.
 * Returns true if built. No mutation on refusal.
 */
export function build(state: GameState, id: BuildingId): boolean {
  const def = BUILDING_BY_ID[id];
  if (!def) return false;
  if (!isUnlocked(state, def)) return false;
  const count = state.run.buildings[id] ?? 0;
  if (def.max !== undefined && count >= def.max) return false;
  if (!canAfford(state, id)) return false;

  const cost = buildingCost(state, id);
  for (const [res, amt] of Object.entries(cost)) {
    state.run.resources[res as ResourceId] -= amt as number;
  }
  state.run.buildings[id] = count + 1;

  // Converter buildings track how many copies are switched ON. A freshly raised copy starts
  // active (absent → treat as all-on, so `?? count` covers old/never-toggled state).
  if (isConverter(def)) {
    state.run.active ??= {};
    state.run.active[id] = (state.run.active[id] ?? count) + 1;
  }

  // Immediate, permanent stat bumps.
  for (const eff of def.effects) {
    if (eff.kind === 'popCap') state.run.popCap += eff.amount;
    else if (eff.kind === 'cap') {
      // Raise EACH capped material (mundane materials + furs) by the same amount.
      for (const capId of MUNDANE_RESOURCE_IDS) {
        state.run.caps[capId] += eff.amount;
      }
    } else if (eff.kind === 'capExceptFood') {
      // Raise every capped material EXCEPT food (the Warehouse; food has its own Granary).
      for (const capId of MUNDANE_RESOURCE_IDS) {
        if (capId === 'food') continue;
        state.run.caps[capId] += eff.amount;
      }
    } else if (eff.kind === 'foodCap') {
      state.run.caps.food += eff.amount;
    }
  }

  logEvent(state, `Built ${def.name}.`);
  // Magic-tier milestone: the first construct raised is a story beat.
  if (def.construct && state.run.flags.firstConstruct !== true) {
    state.run.flags.firstConstruct = true;
    logEvent(state, `${def.name} stirs to life — labour without hands.`, 'ev');
  }
  return true;
}

export interface BuildingView {
  id: BuildingId;
  name: string;
  blurb: string;
  count: number;
  cost: Partial<Record<ResourceId, number>>;
  unlocked: boolean;
  affordable: boolean;
  maxed: boolean;
  construct: boolean;
  converter: boolean; // has a convert effect → toggled N-of-M
  active: number; // how many copies are switched ON (converters only; else = count)
}

/** Read model: every building's count, current cost, and buildability. */
export function buildingsView(state: GameState): BuildingView[] {
  return BUILDINGS.map((def) => {
    const count = state.run.buildings[def.id] ?? 0;
    const maxed = def.max !== undefined && count >= def.max;
    const converter = isConverter(def);
    return {
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      count,
      cost: buildingCost(state, def.id),
      unlocked: isUnlocked(state, def),
      affordable: canAfford(state, def.id),
      maxed,
      construct: def.construct === true,
      converter,
      active: converter ? activeCount(state, def.id) : count,
    };
  });
}

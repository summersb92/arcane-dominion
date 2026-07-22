// Buildings — pay a (possibly escalating) resource cost to raise a structure, then
// apply its IMMEDIATE effects (popCap / storage caps) once. ONGOING effects (job
// capacity, construct production, mana upkeep) are NOT applied here — they are derived
// each tick from the building count (systems/jobs.ts, systems/production.ts). Requirement
// gates (tech + affordability) are enforced before any resource is spent. Pure engine.

import { BUILDINGS, BUILDING_BY_ID, type BuildingDef, type BuildingEffect, type BuildingId } from '../../content/buildings';
import { MUNDANE_RESOURCE_IDS, type ResourceId } from '../../content/resources';
import type { GameState } from '../state';
import { logEvent } from './chronicle';

const EPS = 1e-9;

export type ConvertEffect = Extract<BuildingEffect, { kind: 'convert' }>;

/** A converter building's RECIPES — one per `convert` effect (e.g. the Steelworks has Wood + Coal). */
export function convertEffects(def: BuildingDef): ConvertEffect[] {
  return def.effects.filter((e): e is ConvertEffect => e.kind === 'convert');
}

/** True if a building is a CONVERTER (has ≥1 `convert` effect) — toggled per-recipe via run.active. */
export function isConverter(def: BuildingDef): boolean {
  return def.effects.some((e) => e.kind === 'convert');
}

/** How many copies run EACH recipe, aligned to convertEffects order. The sum never exceeds the
 *  built count. Absent from run.active → all copies on the FIRST recipe (a fresh converter runs
 *  its basic recipe; also the backwards-compat default for old saves). */
export function activeRecipes(state: GameState, id: BuildingId): number[] {
  const def = BUILDING_BY_ID[id];
  const recipes = def ? convertEffects(def).length : 0;
  const count = state.run.buildings[id] ?? 0;
  const arr = new Array<number>(Math.max(recipes, 1)).fill(0);
  if (recipes === 0) return arr;
  const raw = state.run.active?.[id];
  if (!Array.isArray(raw)) {
    arr[0] = count; // absent → all copies on the first (basic) recipe
    return arr;
  }
  let sum = 0;
  for (let i = 0; i < recipes; i++) {
    let v = Math.max(0, Math.floor(Number(raw[i] ?? 0)) || 0);
    if (sum + v > count) v = Math.max(0, count - sum); // never allocate more copies than exist
    arr[i] = v;
    sum += v;
  }
  return arr;
}

/** Total copies of `id` switched ON across all recipes. */
export function activeCount(state: GameState, id: BuildingId): number {
  return activeRecipes(state, id).reduce((s, n) => s + n, 0);
}

/** Set recipe `r` of a converter to run `n` copies (clamped so the total never exceeds count). */
export function setRecipeActive(state: GameState, id: BuildingId, r: number, n: number): void {
  const count = state.run.buildings[id] ?? 0;
  const arr = activeRecipes(state, id);
  if (r < 0 || r >= arr.length) return;
  const others = arr.reduce((s, v, i) => (i === r ? s : s + v), 0);
  arr[r] = Math.max(0, Math.min(count - others, Math.floor(n)));
  state.run.active ??= {};
  state.run.active[id] = arr;
}

/** Switch `n` copies of a single-recipe converter ON (recipe 0). Convenience for simple toggles. */
export function setActive(state: GameState, id: BuildingId, n: number): void {
  setRecipeActive(state, id, 0, n);
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

  // Converter buildings track how many copies run each recipe. Snapshot the pre-build allocation,
  // then start the freshly raised copy on the FIRST (basic) recipe — the player can re-allocate it.
  const preRecipes = isConverter(def) ? activeRecipes(state, id) : null;
  state.run.buildings[id] = count + 1;
  if (preRecipes) {
    preRecipes[0] += 1;
    state.run.active ??= {};
    state.run.active[id] = preRecipes;
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
  converter: boolean; // has ≥1 convert effect → toggled per-recipe
  active: number; // total copies switched ON (converters only; else = count)
  recipes: { label: string; active: number }[]; // per-recipe running counts (converters; else [])
}

/** Read model: every building's count, current cost, and buildability. */
export function buildingsView(state: GameState): BuildingView[] {
  return BUILDINGS.map((def) => {
    const count = state.run.buildings[def.id] ?? 0;
    const maxed = def.max !== undefined && count >= def.max;
    const converter = isConverter(def);
    const recipeRuns = converter ? activeRecipes(state, def.id) : [];
    const recipes = converter
      ? convertEffects(def).map((e, i) => ({ label: e.label ?? 'Active', active: recipeRuns[i] ?? 0 }))
      : [];
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
      recipes,
    };
  });
}

// Buildings — pay a (possibly escalating) resource cost to raise a structure, then
// apply its IMMEDIATE effects (popCap / storage caps) once. ONGOING effects (job
// capacity, construct production, mana upkeep) are NOT applied here — they are derived
// each tick from the building count (systems/jobs.ts, systems/production.ts). Requirement
// gates (tech + affordability) are enforced before any resource is spent. Pure engine.

import {
  BUILDINGS,
  BUILDING_BY_ID,
  type BuildingCategory,
  type BuildingDef,
  type BuildingEffect,
  type BuildingId,
} from '../../content/buildings';
import type { JobId } from '../../content/jobs';
import { MUNDANE_RESOURCE_IDS, type ResourceId } from '../../content/resources';
import type { GameState } from '../state';
import { logEvent } from './chronicle';

// Affordability tolerance. Resources accumulate as floats (rate × dt summed over thousands of
// ticks), so a stock the player believes is "exactly 15" can land on 14.999999999999998. That
// must never block a build: the tolerance is far below anything the UI renders (2 decimals) but
// comfortably above accumulated float drift.
const EPS = 1e-6;

export type ConvertEffect = Extract<BuildingEffect, { kind: 'convert' }>;

/** A converter building's RECIPES — one per `convert` effect (e.g. the Steelworks has Wood + Coal). */
export function convertEffects(def: BuildingDef): ConvertEffect[] {
  return def.effects.filter((e): e is ConvertEffect => e.kind === 'convert');
}

/** True if a building is a CONVERTER (has ≥1 `convert` effect) — toggled per-recipe via run.active. */
export function isConverter(def: BuildingDef): boolean {
  return def.effects.some((e) => e.kind === 'convert');
}

/** Is this recipe available yet? A tech-gated recipe (the elemental attunements) does not
 *  exist for the player until its tech is in — it neither runs nor shows a toggle. */
export function recipeUnlocked(state: GameState, c: ConvertEffect): boolean {
  return !c.requiresTech || state.run.tech.includes(c.requiresTech as never);
}

/** True once a building has at least one recipe the player can actually run. */
export function isLiveConverter(state: GameState, def: BuildingDef): boolean {
  return convertEffects(def).some((c) => recipeUnlocked(state, c));
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
    // Absent → all copies on the first recipe the player can actually run. A TECH-GATED
    // recipe is skipped here, so unlocking an attunement never silently switches every
    // Quarry over to burning mana — you have to turn it on yourself.
    const effects = convertEffects(def!);
    const first = effects.findIndex((c) => recipeUnlocked(state, c) && !c.requiresTech);
    if (first >= 0) arr[first] = count;
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
  // A late-arriving EXTRA cost (the Ward Stone's iron, from the sixth copy on). It escalates
  // from the copy it first applies to, so the sixth pays the base and the seventh pays growth×.
  const extra = def.extraCostAfter;
  if (extra && count >= extra.count) {
    const extraMult = growth === 1 ? 1 : Math.pow(growth, count - extra.count);
    for (const [res, amt] of Object.entries(extra.cost)) {
      const add = growth === 1 ? (amt as number) : Math.ceil((amt as number) * extraMult);
      out[res as ResourceId] = (out[res as ResourceId] ?? 0) + add;
    }
  }
  return out;
}

/** True once the building's prerequisites (tech + prerequisite building) are satisfied.
 *  The building-prereq keeps the opening board minimal: only the Hut shows at the very
 *  start; Storehouse/workplaces reveal once a Hut exists; the rest gate on tech. */
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

  // Converter buildings track how many copies run each recipe. Snapshot the pre-build
  // allocation, then start the freshly raised copy on the first BASIC recipe — the player can
  // re-allocate it. A tech-gated attunement is never auto-started: opting in to spending mana
  // is always a deliberate act, so a new Quarry doesn't quietly begin draining the pool.
  const preRecipes = isConverter(def) ? activeRecipes(state, id) : null;
  const startOn = preRecipes ? convertEffects(def).findIndex((c) => !c.requiresTech) : -1;
  state.run.buildings[id] = count + 1;
  if (preRecipes) {
    if (startOn >= 0) preRecipes[startOn] += 1;
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
    } else if (eff.kind === 'resourceCap') {
      state.run.caps[eff.resource] += eff.amount;
    }
  }

  // The FIRST of a building is a story beat. Repeats are NOT logged at all — the chronicle
  // is a record of what happened to the settlement, not a receipt for every hut raised.
  const quip = count === 0 ? FIRST_BUILD_QUIPS[id] : undefined;
  if (quip) logEvent(state, quip, 'ev');
  // Magic-tier milestone: the first construct raised is a story beat (skipped when the
  // building already told its own first-build story above).
  if (def.construct && state.run.flags.firstConstruct !== true) {
    state.run.flags.firstConstruct = true;
    if (!quip) logEvent(state, `${def.name} stirs to life — labour without hands.`, 'ev');
  }
  return true;
}

/** One-line chronicle beats for the FIRST copy of a building (dry wit + quiet wonder).
 *  Buildings without an entry fall back to the plain `Built X.` receipt. */
const FIRST_BUILD_QUIPS: Partial<Record<BuildingId, string>> = {
  hut: 'The first house stands. It leans, but it stands.',
  'farm-house': 'A farm house rises among the rows. Commuting is measured in strides.',
  apartments: 'The apartments open. Neighbours discover one another, audibly.',
  mansion: 'A mansion crowns the hill. Everyone pretends not to covet it.',
  storehouse: 'A storehouse rises. Ownership disputes begin the same afternoon.',
  'forager-hut': 'The first field is sown. Now comes the waiting.',
  ranch: 'The first pasture is fenced. The animals inspect it and approve.',
  'hunters-lodge': 'The lodge opens. Dinner improves; the stories inflate.',
  quarry: 'The quarry opens. The hill begins its long surrender.',
  granary: 'The granary is sealed. The mice regroup.',
  library: 'The library opens. Most visitors come for the quiet.',
  academy: 'The academy opens its doors and raises its fees.',
  observatory: 'The observatory is finished. The sky, at last, is being watched back.',
  aqueduct: 'Water arrives on its own. Buckets are quietly retired.',
  windmill: 'The sails catch and the millstones turn. Bread gets easier.',
  harbor: 'The first boats put out. The sea, it turns out, has been right there all along.',
  seaport: 'Deep berths open. Ships arrive that nobody in the valley has names for.',
  market: 'The market opens. Within an hour there is a dispute about the scales.',
  bank: 'The bank opens its ledgers. The coin stops sleeping under floorboards.',
  ironworks: 'The ironworks lights up, and every trade in town quietly upgrades its tools.',
  monastery: 'The monastery is founded. The copying begins; so does the silence.',
  theatre: 'The theatre opens. The first play is a triumph, or so the playbills insist.',
  mine: 'The mine strikes iron. The dark, on occasion, strikes back.',
  'coal-mine': 'The colliery opens. Coal catches — hotter, longer, dirtier.',
  'charcoal-ground': 'The first charring pit smoulders. Wood goes in; patience comes out.',
  steelworks: 'The furnace is lit. The blacksmith affects not to be impressed.',
  toolworks: 'The toolworks starts up. Machines making tools for making machines.',
  'engine-works': 'The first engine turns over. No two settlers agree on what the noise is.',
  factory: 'The factory opens. The word "shift" acquires a new and ominous meaning.',
  'steam-works': 'The steam works thunders on. Every trade moves a little faster, a little louder.',
  tannery: 'The tannery opens, downwind, by unanimous vote.',
  scriptorium: 'The scriptorium opens. Silence, punctuated by scratching.',
  archive: 'The archive opens. Somewhere, at last, to put the arguments.',
  amphitheater: 'The amphitheater opens. The settlement discovers applause.',
  'sacred-grove': 'A grove is set aside and tended. The wild takes note.',
  'arcane-font': 'The font wells up with mana. It never runs dry, which worries the sensible.',
  'animated-tools': 'The axes fell timber unattended. The woodcutters watch, and do not applaud.',
  'ley-grove': 'The ley grove is sung awake. The land hums back.',
  'standing-stones': 'The stones stand. On the next solstice, they are warm to the touch.',
  'golem-works': 'The golem shoulders its first load. The miners take an unusually long lunch.',
  'arcane-foundry': 'Steel from nothing but mana and nerve. The smelters have questions.',
  'wind-spire': 'The spire hums, and the air leaves something behind.',
  'deep-cairn': 'The cairn settles. Something under the hill settles with it.',
  'ember-forge': 'The ember forge takes its first breath of coal and asks for another.',
  'tide-basin': 'The basin fills, then keeps a tide nobody scheduled.',
  'storm-sails': 'The sails fell a tree with no hand on the rope.',
  'stone-titan': 'The titan stands, considers the quarry, and gets to work.',
  'flame-wardens': 'The wardens kindle. Steel now arrives without the coal cart.',
  'rain-engine': 'It rains on the fields, precisely, at four in the afternoon.',
  'prism-nexus': 'Four tempers enter the lens. Light comes out the other side.',
  'prismatic-spire': 'The spire lights, and every trade in the valley quickens.',
};

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
  category: BuildingCategory; // Build-tab section this building files under
  converter: boolean; // has ≥1 convert effect → toggled per-recipe
  active: number; // total copies switched ON (converters only; else = count)
  /** Per-recipe running counts + per-copy trade rates (converters; else []). */
  recipes: {
    /** Index into the building's convert effects — NOT the array position, since locked
     *  recipes are filtered out. setRecipeActive keys off this. */
    index: number;
    label: string;
    active: number;
    consume: Partial<Record<ResourceId, number>>;
    produce: Partial<Record<ResourceId, number>>;
    requiresWorker?: JobId;
  }[];
}

/** Read model: every building's count, current cost, and buildability. */
export function buildingsView(state: GameState): BuildingView[] {
  return BUILDINGS.map((def) => {
    const count = state.run.buildings[def.id] ?? 0;
    const maxed = def.max !== undefined && count >= def.max;
    const converter = isLiveConverter(state, def);
    const recipeRuns = converter ? activeRecipes(state, def.id) : [];
    const recipes = converter
      ? convertEffects(def)
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => recipeUnlocked(state, e))
          .map(({ e, i }) => ({
            index: i,
            label: e.label ?? 'Active',
            active: recipeRuns[i] ?? 0,
            consume: e.consume,
            produce: e.produce,
            requiresWorker: e.requiresWorker,
          }))
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
      category: def.category,
      converter,
      active: converter ? activeCount(state, def.id) : count,
      recipes,
    };
  });
}

// The canonical GameState — one serializable object is the whole game.
// No DOM, no Svelte. Everything the sim, save, and CLI touch lives here.

import { STARTING } from '../content/config';
import type { BuildingId } from '../content/buildings';
import type { JobId } from '../content/jobs';
import { RESOURCE_IDS, type MundaneResourceId, type ResourceId } from '../content/resources';
import type { TechId } from '../content/tech';
import type { PolicyId } from '../content/policies';
import type { CurriculumId } from '../content/education';
import { seedFrom } from './rng';

export const SAVE_VERSION = 15; // v15: added `seasonTally` (per-season birth/death chronicle roll-up)

// Re-export the content-owned resource types so engine/save/cli import them from state
// (the historical import site) without reaching into content directly.
export type { ResourceId, MundaneResourceId } from '../content/resources';

/** Population: total settlers + how many are assigned to each job. idle = total − Σ jobs. */
export interface Population {
  total: number;
  jobs: Record<JobId, number>;
}

export interface ChronicleEntry {
  at: number; // simulated-playtime seconds
  text: string;
  /** 'season' is a DIVIDER, not an event — the dated rule between two stretches of the log
   *  (only written once the Calendar tech makes dates meaningful). */
  kind?: 'ev' | 'found' | 'season';
}

/** Births and deaths for the season currently underway. The chronicle reports the SEASON,
 *  not the settler: individual arrivals are noise, "four born, one lost" is a story. Flushed
 *  into a single line when the season turns (systems/chronicle.ts runChronicleWatch). */
export interface SeasonTally {
  /** Absolute season ordinal since the run began (not the 0..3 index within a year). */
  index: number;
  born: number;
  died: number;
}

export interface RunState {
  /** All currencies. mana/research/culture start 0. mana/culture are uncapped; research is
   *  capped by a derived cap (systems/caps.ts). */
  resources: Record<ResourceId, number>;
  /** Storage caps for the three MUNDANE materials only (research uses a derived cap; mana/
   *  culture are uncapped). */
  caps: Record<MundaneResourceId, number>;
  population: Population;
  popCap: number; // housing capacity
  buildings: Partial<Record<BuildingId, number>>; // count built per building
  /** Per-RECIPE running copy counts for CONVERTER buildings (aligned to the building's convert
   *  effects — e.g. the Steelworks' [wood, coal]). The sum per building never exceeds its count.
   *  Absent → all copies on the first recipe (see systems/buildings.ts activeRecipes). */
  active: Partial<Record<BuildingId, number[]>>;
  tech: TechId[]; // unlocked tech ids
  /** Active governance POLICIES (systems/government.ts). Each drains culture upkeep per
   *  second; all suspend while the culture jar is empty. Limited by policy slots. */
  policies: PolicyId[];
  /** The Arcanum's chosen DISCIPLINE (systems/education.ts). null = a general curriculum:
   *  no specialization bonus and no penalty. */
  curriculum: CurriculumId | null;
  /** Signed accumulator (seconds) driving deterministic pop growth (+) / starvation (−). */
  growthProgress: number;
  flags: Record<string, boolean>;
  chronicle: ChronicleEntry[];
  /** Births/deaths accumulating for the season underway (see SeasonTally). */
  seasonTally: SeasonTally;
}

export interface Settings {
  notation: 'suffix' | 'full' | 'scientific';
  theme: string;
  chronicleLines: number; // how many Chronicle lines to show (clamped 5..10)
  font: string; // UI font family key ('mono' default)
  fontScale: number; // UI scale as a PERCENT (100 = default), clamped 80..160
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  run: RunState;
  settings: Settings;
  playtime: number; // seconds of simulated time
  lastSaved: number; // epoch ms
}

/** A brand-new resource ledger (every id present). Exported for save normalize. */
export function freshResources(): Record<ResourceId, number> {
  const r = {} as Record<ResourceId, number>;
  for (const id of RESOURCE_IDS) r[id] = 0;
  r.wood = STARTING.wood;
  r.food = STARTING.food;
  r.stone = STARTING.stone;
  r.iron = STARTING.iron;
  r.coal = STARTING.coal;
  r.steel = STARTING.steel;
  r.tools = STARTING.tools;
  r.engines = STARTING.engines;
  r.furniture = STARTING.furniture;
  r.parchment = STARTING.parchment;
  r.books = STARTING.books;
  r.compendiums = STARTING.compendiums;
  r.furs = STARTING.furs;
  r.alchemical = STARTING.alchemical;
  r.manaCrystals = STARTING.manaCrystals;
  r.mana = STARTING.mana;
  r.airEssence = STARTING.airEssence;
  r.earthEssence = STARTING.earthEssence;
  r.fireEssence = STARTING.fireEssence;
  r.waterEssence = STARTING.waterEssence;
  r.prismatic = STARTING.prismatic;
  r.gold = STARTING.gold;
  r.research = STARTING.research;
  r.culture = STARTING.culture;
  return r;
}

/** A brand-new capped-material ledger (mundane materials + furs + mana crystals). Exported for save normalize. */
export function freshCaps(): Record<MundaneResourceId, number> {
  return {
    wood: STARTING.woodCap,
    food: STARTING.foodCap,
    stone: STARTING.stoneCap,
    iron: STARTING.ironCap,
    coal: STARTING.coalCap,
    steel: STARTING.steelCap,
    tools: STARTING.toolsCap,
    engines: STARTING.enginesCap,
    furniture: STARTING.furnitureCap,
    parchment: STARTING.parchmentCap,
    books: STARTING.booksCap,
    compendiums: STARTING.compendiumsCap,
    furs: STARTING.fursCap,
    alchemical: STARTING.alchemicalCap,
    manaCrystals: STARTING.manaCrystalsCap,
    airEssence: STARTING.essenceCap,
    earthEssence: STARTING.essenceCap,
    fireEssence: STARTING.essenceCap,
    waterEssence: STARTING.essenceCap,
  };
}

/** Opening chronicle lines — one is picked per run (deterministic by seed), so each new
 *  settlement starts its story a little differently. */
const OPENINGS = [
  "A handful of settlers make camp at the forest's edge.",
  'A handful of settlers, a forest, and a plan that is mostly optimism.',
  "The wagons stop at the forest's edge. Nobody remembers deciding that.",
  'They came for the timber. They stayed because the wagon broke.',
  "The forest's edge. Home, pending further notice.",
  'Someone plants a stake in the ground and calls it a settlement. The ground disagrees.',
];

/** A brand-new settlement: settlers make camp with a little food and nothing else. */
export function newGame(seed: number = seedFrom(Date.now())): GameState {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    seed,
    rngState: seed >>> 0,
    run: {
      resources: freshResources(),
      caps: freshCaps(),
      population: { total: 0, jobs: {} as Record<JobId, number> },
      popCap: STARTING.popCap,
      buildings: {},
      active: {},
      tech: [],
      policies: [],
      curriculum: null,
      growthProgress: 0,
      flags: {},
      chronicle: [{ at: 0, text: OPENINGS[(seed >>> 0) % OPENINGS.length] }],
      seasonTally: { index: 0, born: 0, died: 0 },
    },
    settings: { notation: 'suffix', theme: 'kittens', chronicleLines: 8, font: 'mono', fontScale: 100 },
    playtime: 0,
    lastSaved: now,
  };
}

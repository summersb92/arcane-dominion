// The canonical GameState — one serializable object is the whole game.
// No DOM, no Svelte. Everything the sim, save, and CLI touch lives here.

import { STARTING } from '../content/config';
import type { BuildingId } from '../content/buildings';
import type { JobId } from '../content/jobs';
import { RESOURCE_IDS, type MundaneResourceId, type ResourceId } from '../content/resources';
import type { TechId } from '../content/tech';
import { seedFrom } from './rng';

export const SAVE_VERSION = 1; // fresh game — no legacy migration ladder yet

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
  kind?: 'ev' | 'found';
}

export interface RunState {
  /** All five currencies. mana/research start 0 and are uncapped. */
  resources: Record<ResourceId, number>;
  /** Storage caps for the three MUNDANE materials only (mana/research uncapped). */
  caps: Record<MundaneResourceId, number>;
  population: Population;
  popCap: number; // housing capacity
  buildings: Partial<Record<BuildingId, number>>; // count built per building
  tech: TechId[]; // unlocked tech ids
  /** Signed accumulator (seconds) driving deterministic pop growth (+) / starvation (−). */
  growthProgress: number;
  flags: Record<string, boolean>;
  chronicle: ChronicleEntry[];
}

export interface Settings {
  notation: 'suffix' | 'full' | 'scientific';
  theme: string;
  chronicleLines: number; // how many Chronicle lines to show (clamped 5..10)
  font: string; // UI font family key ('mono' default)
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
  r.mana = STARTING.mana;
  r.research = STARTING.research;
  return r;
}

/** A brand-new mundane-cap ledger. Exported for save normalize. */
export function freshCaps(): Record<MundaneResourceId, number> {
  return { wood: STARTING.woodCap, food: STARTING.foodCap, stone: STARTING.stoneCap };
}

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
      tech: [],
      growthProgress: 0,
      flags: {},
      chronicle: [{ at: 0, text: "A handful of settlers make camp at the forest's edge." }],
    },
    settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
    playtime: 0,
    lastSaved: now,
  };
}

// Building catalogue (pure data). A BUILDING is a repeatable structure you pay
// resources to raise. Its EFFECTS split into two kinds:
//   * IMMEDIATE stat bumps  — popCap / storage caps. Applied once, at build time
//     (systems/buildings.ts), mutating RunState directly. NOT re-derived.
//   * ONGOING effects       — job capacity, passive production, mana upkeep. NOT
//     stored; derived each read/tick from the building count (systems/jobs.ts,
//     systems/production.ts). This split avoids double-counting.
//
// The MAGIC HOOK lives here: `animated-tools` is an arcane construct that produces
// wood with NO population and NO food — only a small mana upkeep. It is the first
// piece of mundane labour that sorcery fully automates.
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

import type { JobId } from './jobs';
import type { ResourceId } from './resources';

export type BuildingId =
  | 'hut'
  | 'storehouse'
  | 'woodcutters-lodge'
  | 'forager-hut'
  | 'quarry'
  | 'scholars-study'
  | 'arcane-font'
  | 'animated-tools';

export type BuildingEffect =
  // IMMEDIATE (applied at build time, permanent):
  | { kind: 'popCap'; amount: number } // +N housing capacity
  | { kind: 'cap'; amount: number } // +N to EACH mundane storage cap
  // ONGOING (derived per tick from building count):
  | { kind: 'jobCapacity'; job: JobId; slots: number } // +slots assignable to a job
  | { kind: 'produce'; resource: ResourceId; perSec: number } // passive construct output
  | { kind: 'manaUpkeep'; perSec: number }; // mana drained per second

export interface BuildingDef {
  id: BuildingId;
  name: string;
  blurb: string;
  cost: Partial<Record<ResourceId, number>>;
  /** Per-existing-count cost multiplier (default 1 = flat). Only Hut escalates. */
  costGrowth?: number;
  effects: BuildingEffect[];
  /** Tech id that must be researched before this can be built. */
  requiresTech?: string;
  /** Building id that must exist (count ≥ 1) before this is revealed — keeps the early
   *  board minimal (only the Hut at the very start; the rest unlock as you build). */
  requiresBuilding?: BuildingId;
  /** Optional hard cap on how many can be built (undefined = unlimited). */
  max?: number;
  /** True for arcane constructs (magic tier) — surfaced separately in the UI. */
  construct?: boolean;
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'hut',
    name: 'Hut',
    blurb: 'Simple shelter. Houses settlers (+2 population cap). Cost rises with each hut.',
    cost: { wood: 15 },
    costGrowth: 1.5,
    effects: [{ kind: 'popCap', amount: 2 }],
  },
  {
    id: 'storehouse',
    name: 'Storehouse',
    blurb: 'Raises storage for every mundane material (+50 to each cap).',
    cost: { wood: 20, stone: 10 },
    requiresBuilding: 'hut',
    effects: [{ kind: 'cap', amount: 50 }],
  },
  {
    id: 'woodcutters-lodge',
    name: "Woodcutter's Lodge",
    blurb: 'A base for fellers. Opens +2 Woodcutter job slots.',
    cost: { wood: 25 },
    requiresBuilding: 'hut',
    effects: [{ kind: 'jobCapacity', job: 'woodcutter', slots: 2 }],
  },
  {
    id: 'forager-hut',
    name: 'Forager Hut',
    blurb: 'A gathering post. Opens +2 Forager job slots.',
    cost: { wood: 20 },
    requiresBuilding: 'hut',
    effects: [{ kind: 'jobCapacity', job: 'forager', slots: 2 }],
  },
  {
    id: 'quarry',
    name: 'Quarry',
    blurb: 'A worked stone pit. Opens +2 Quarry Worker job slots.',
    cost: { wood: 20, stone: 5 },
    requiresTech: 'masonry',
    effects: [{ kind: 'jobCapacity', job: 'quarry-worker', slots: 2 }],
  },
  {
    id: 'scholars-study',
    name: "Scholar's Study",
    blurb: 'A place of learning. Opens +2 Scholar job slots (produce research).',
    cost: { wood: 30, stone: 15 },
    requiresBuilding: 'forager-hut',
    effects: [{ kind: 'jobCapacity', job: 'scholar', slots: 2 }],
  },
  {
    id: 'arcane-font',
    name: 'Arcane Font',
    blurb: 'A wellspring of raw magic. Produces mana passively (+0.5/s).',
    cost: { stone: 40 },
    requiresTech: 'awakening',
    construct: true,
    effects: [{ kind: 'produce', resource: 'mana', perSec: 0.5 }],
  },
  {
    id: 'animated-tools',
    name: 'Animated Tools',
    blurb: 'Enchanted axes that fell timber on their own — wood with NO settlers and NO food, only mana upkeep (0.1/s).',
    cost: { wood: 30, mana: 10 },
    requiresTech: 'animation',
    construct: true,
    effects: [
      { kind: 'produce', resource: 'wood', perSec: 0.5 },
      { kind: 'manaUpkeep', perSec: 0.1 },
    ],
  },
];

export const BUILDING_IDS: BuildingId[] = BUILDINGS.map((b) => b.id);

export const BUILDING_BY_ID: Record<BuildingId, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b]),
) as Record<BuildingId, BuildingDef>;

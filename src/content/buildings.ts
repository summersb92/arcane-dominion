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
  | 'hunters-lodge'
  | 'quarry'
  | 'granary'
  | 'library'
  | 'mine'
  | 'workshop'
  | 'forge'
  | 'amphitheater'
  | 'sacred-grove'
  | 'arcane-font'
  | 'animated-tools';

export type BuildingEffect =
  // IMMEDIATE (applied at build time, permanent):
  | { kind: 'popCap'; amount: number } // +N housing capacity
  | { kind: 'cap'; amount: number } // +N to EACH mundane storage cap
  | { kind: 'foodCap'; amount: number } // +N to the FOOD storage cap only (Granary)
  // ONGOING (derived per tick / per read from building count):
  | { kind: 'jobCapacity'; job: JobId; slots: number } // +slots assignable to a job
  | { kind: 'jobOutputMult'; amount: number } // +fraction to EVERY worker's output (Workshop/Forge)
  // Passive construct output. An optional `requiresTech` gates the output: production only
  // flows once that tech is researched (e.g. the Mine's mana-crystal trickle behind Crystallurgy).
  | { kind: 'produce'; resource: ResourceId; perSec: number; requiresTech?: string }
  | { kind: 'manaUpkeep'; perSec: number } // mana drained per second
  | { kind: 'researchCap'; amount: number } // +N to the RESEARCH cap (science buildings; caps.ts)
  | { kind: 'happiness'; amount: number }; // +N happiness (luxury buildings; systems/happiness.ts)

export interface BuildingDef {
  id: BuildingId;
  name: string;
  blurb: string;
  cost: Partial<Record<ResourceId, number>>;
  /** Per-existing-count cost multiplier (default 1 = flat). Every normal building
   *  escalates (costs more per copy); only the "special" magic constructs stay flat. */
  costGrowth?: number;
  effects: BuildingEffect[];
  /** Tech id that must be researched before this can be built. */
  requiresTech?: string;
  /** Run flag that must be true before this can be built (e.g. 'magicDiscovered'). The magic
   *  buildings are now discovery-gated by this flag rather than by a tech (see systems/magic.ts). */
  requiresFlag?: string;
  /** Building id that must exist (count ≥ 1) before this is revealed — keeps the early
   *  board minimal (only the Hut at the very start; the rest unlock as you build). */
  requiresBuilding?: BuildingId;
  /** Optional hard cap on how many can be built (undefined = unlimited). */
  max?: number;
  /** True for arcane constructs (magic tier) — surfaced separately in the UI. */
  construct?: boolean;
}

// Small storage-cap bump most structures add on TOP of their main effect (a settlement
// stores a little more with every building it raises). Dedicated storage (Storehouse/
// Granary) and the magic constructs are excluded.
const STRUCT_CAP = 20;

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'hut',
    name: 'House',
    blurb: 'Simple shelter. +2 population cap, +20 storage. Cost rises with each house.',
    cost: { wood: 15 },
    costGrowth: 1.5,
    effects: [{ kind: 'popCap', amount: 2 }, { kind: 'cap', amount: STRUCT_CAP }],
  },
  {
    id: 'storehouse',
    name: 'Storehouse',
    blurb: 'Raises storage for every mundane material (+50 to each cap). Cost rises with each.',
    cost: { wood: 20, stone: 10 },
    costGrowth: 1.5,
    requiresBuilding: 'hut',
    effects: [{ kind: 'cap', amount: 50 }],
  },
  {
    id: 'woodcutters-lodge',
    name: "Woodcutter's Lodge",
    blurb: 'A base for fellers. +1 Woodcutter job slot, +20 storage.',
    cost: { wood: 25 },
    costGrowth: 1.3,
    requiresBuilding: 'hut',
    effects: [{ kind: 'jobCapacity', job: 'woodcutter', slots: 1 }, { kind: 'cap', amount: STRUCT_CAP }],
  },
  {
    id: 'forager-hut',
    name: 'Farm',
    blurb: 'Tilled fields and pens. +1 Farmer job slot, +20 storage.',
    cost: { wood: 20 },
    costGrowth: 1.3,
    requiresTech: 'agriculture',
    effects: [{ kind: 'jobCapacity', job: 'forager', slots: 1 }, { kind: 'cap', amount: STRUCT_CAP }],
  },
  {
    id: 'hunters-lodge',
    name: "Hunter's Lodge",
    blurb: 'A lodge for trackers and trappers. +1 Hunter job slot (food + furs), +20 storage.',
    cost: { wood: 25 },
    costGrowth: 1.3,
    requiresTech: 'archery',
    effects: [{ kind: 'jobCapacity', job: 'hunter', slots: 1 }, { kind: 'cap', amount: STRUCT_CAP }],
  },
  {
    id: 'quarry',
    name: 'Quarry',
    blurb: 'A worked stone pit. +1 Stonecutter job slot, +20 storage.',
    cost: { wood: 20, stone: 5 },
    costGrowth: 1.3,
    requiresTech: 'masonry',
    effects: [{ kind: 'jobCapacity', job: 'quarry-worker', slots: 1 }, { kind: 'cap', amount: STRUCT_CAP }],
  },
  {
    id: 'granary',
    name: 'Granary',
    blurb: 'Dry, sealed storage for grain. Raises the Food cap (+150). Cost rises with each.',
    cost: { wood: 30, stone: 10 },
    costGrowth: 1.5,
    requiresTech: 'pottery',
    effects: [{ kind: 'foodCap', amount: 150 }],
  },
  {
    id: 'library',
    name: 'Library',
    blurb: 'Shelves of scrolls. +1 Scholar slot, +0.1 research/s, +100 research cap, +20 storage.',
    cost: { wood: 40, stone: 20 },
    costGrowth: 1.3,
    requiresTech: 'writing',
    effects: [
      { kind: 'jobCapacity', job: 'scholar', slots: 1 },
      { kind: 'produce', resource: 'research', perSec: 0.1 },
      { kind: 'researchCap', amount: 100 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'mine',
    name: 'Mine',
    blurb: 'A deep shaft for iron ore. +1 Miner slot, +0.2 iron/s, +20 storage. With Crystallurgy, also trickles Mana Crystals (+0.05/s).',
    cost: { wood: 40, stone: 20 },
    costGrowth: 1.3,
    requiresTech: 'mining',
    effects: [
      { kind: 'jobCapacity', job: 'miner', slots: 1 },
      { kind: 'produce', resource: 'iron', perSec: 0.2 },
      // Proto-magic material from the deep rock — but only once Crystallurgy is understood.
      // Reaching 20 held is one path to discovering magic (systems/magic.ts).
      { kind: 'produce', resource: 'manaCrystals', perSec: 0.05, requiresTech: 'crystallurgy' },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'workshop',
    name: 'Workshop',
    blurb: 'Carts, gears, and better technique. +10% to EVERY worker’s output, +20 storage.',
    cost: { wood: 50, stone: 30 },
    costGrowth: 1.3,
    requiresTech: 'the-wheel',
    effects: [{ kind: 'jobOutputMult', amount: 0.1 }, { kind: 'cap', amount: STRUCT_CAP }],
  },
  {
    id: 'forge',
    name: 'Forge',
    blurb: 'A blacksmith’s hearth. +15% worker output, +20 storage.',
    cost: { wood: 50, stone: 40 },
    costGrowth: 1.3,
    requiresTech: 'iron-working',
    effects: [{ kind: 'jobOutputMult', amount: 0.15 }, { kind: 'cap', amount: STRUCT_CAP }],
  },
  {
    id: 'amphitheater',
    name: 'Amphitheater',
    blurb: 'A stage for song and spectacle. +1 Bard slot (Culture), +10 happiness, +20 storage. Cost rises with each.',
    cost: { wood: 40, stone: 30 },
    costGrowth: 1.3,
    requiresTech: 'the-arts',
    effects: [
      { kind: 'jobCapacity', job: 'bard', slots: 1 },
      { kind: 'happiness', amount: 10 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'sacred-grove',
    name: 'Sacred Grove',
    blurb: 'A tended grove of ancient trees. +5 happiness, +20 storage. Its deep tending is one path to magic.',
    cost: { wood: 60 },
    costGrowth: 1.3,
    requiresTech: 'naturalism',
    effects: [
      { kind: 'happiness', amount: 5 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'arcane-font',
    name: 'Arcane Font',
    blurb: 'A wellspring of raw magic. Produces mana passively (+0.5/s).',
    cost: { stone: 40 },
    requiresFlag: 'magicDiscovered',
    construct: true,
    effects: [{ kind: 'produce', resource: 'mana', perSec: 0.5 }],
  },
  {
    id: 'animated-tools',
    name: 'Animated Tools',
    blurb: 'Enchanted axes that fell timber on their own — wood with NO settlers and NO food, only mana upkeep (0.1/s).',
    cost: { wood: 30, mana: 10 },
    requiresFlag: 'magicDiscovered',
    requiresBuilding: 'arcane-font',
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

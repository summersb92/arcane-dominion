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
  | 'warehouse'
  | 'woodcutters-lodge'
  | 'forager-hut'
  | 'hunters-lodge'
  | 'quarry'
  | 'granary'
  | 'library'
  | 'academy'
  | 'observatory'
  | 'aqueduct'
  | 'forum'
  | 'sewers'
  | 'shrine'
  | 'ley-grove'
  | 'standing-stones'
  | 'golem-works'
  | 'arcane-foundry'
  | 'mine'
  | 'coal-mine'
  | 'charcoal-ground'
  | 'steelworks'
  | 'toolworks'
  | 'engine-works'
  | 'factory'
  | 'steam-works'
  | 'tannery'
  | 'scriptorium'
  | 'archive'
  | 'workshop'
  | 'forge'
  | 'amphitheater'
  | 'sacred-grove'
  | 'arcane-font'
  | 'animated-tools';

export type BuildingEffect =
  // IMMEDIATE (applied at build time, permanent):
  | { kind: 'popCap'; amount: number } // +N housing capacity
  | { kind: 'cap'; amount: number } // +N to EACH mundane storage cap (Storehouse; includes food)
  | { kind: 'capExceptFood'; amount: number } // +N to every mundane cap EXCEPT food (Warehouse)
  | { kind: 'foodCap'; amount: number } // +N to the FOOD storage cap only (Granary)
  // ONGOING (derived per tick / per read from building count):
  | { kind: 'jobCapacity'; job: JobId; slots: number } // +slots assignable to a job
  | { kind: 'jobOutputMult'; amount: number } // +fraction to EVERY worker's output (Workshop/Forge)
  // Passive construct output. An optional `requiresTech` gates the output: production only
  // flows once that tech is researched (e.g. the Mine's mana-crystal trickle behind Crystallurgy).
  | { kind: 'produce'; resource: ResourceId; perSec: number; requiresTech?: string }
  // CONVERTER: each ACTIVE copy consumes `consume` and yields `produce` per second (a toggled,
  // N-of-M building — see run.active + systems/production.ts). If `requiresWorker` is set, a copy
  // only runs when backed by an assigned worker of that job (the Steelworks needs a Smelter);
  // converters with no `requiresWorker` run on activation alone (the Charcoal Ground).
  // A building may carry SEVERAL convert effects — one per selectable RECIPE (e.g. the Steelworks'
  // Wood vs Coal fuel). `label` names the recipe in the UI toggle; copies are allocated per recipe.
  | {
      kind: 'convert';
      label?: string;
      consume: Partial<Record<ResourceId, number>>;
      produce: Partial<Record<ResourceId, number>>;
      requiresWorker?: JobId;
    }
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
    id: 'warehouse',
    name: 'Warehouse',
    blurb: 'Bulk stores for goods and ore. Raises every material cap EXCEPT food (+100 each). Cost rises with each.',
    cost: { wood: 60, stone: 40 },
    costGrowth: 1.5,
    requiresTech: 'masonry',
    effects: [{ kind: 'capExceptFood', amount: 100 }],
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
    id: 'academy',
    name: 'Academy',
    blurb: 'A hall of higher learning. +2 Scholar slots, +0.5 research/s, +600 research cap, +20 storage. The reservoir that makes the costliest research reachable.',
    cost: { wood: 150, stone: 120 },
    costGrowth: 1.4,
    requiresTech: 'writing',
    effects: [
      { kind: 'jobCapacity', job: 'scholar', slots: 2 },
      { kind: 'produce', resource: 'research', perSec: 0.5 },
      { kind: 'researchCap', amount: 600 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'observatory',
    name: 'Observatory',
    blurb: 'Charts the heavens. +1 Scholar slot, +0.3 research/s, +400 research cap, +20 storage.',
    cost: { wood: 120, stone: 100 },
    costGrowth: 1.4,
    requiresTech: 'mathematics',
    effects: [
      { kind: 'jobCapacity', job: 'scholar', slots: 1 },
      { kind: 'produce', resource: 'research', perSec: 0.3 },
      { kind: 'researchCap', amount: 400 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'aqueduct',
    name: 'Aqueduct',
    blurb: 'Carries clean water into the settlement. +5 population cap, +4 happiness, +20 storage.',
    cost: { wood: 80, stone: 120 },
    costGrowth: 1.4,
    requiresTech: 'construction',
    effects: [
      { kind: 'popCap', amount: 5 },
      { kind: 'happiness', amount: 4 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'forum',
    name: 'Forum',
    blurb: 'A public square for debate and performance. +1 Bard slot, +0.3 culture/s, +5 happiness, +20 storage.',
    cost: { wood: 100, stone: 100 },
    costGrowth: 1.4,
    requiresTech: 'philosophy',
    effects: [
      { kind: 'jobCapacity', job: 'bard', slots: 1 },
      { kind: 'produce', resource: 'culture', perSec: 0.3 },
      { kind: 'happiness', amount: 5 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'sewers',
    name: 'Sewers',
    blurb: 'Drains and cisterns for a great settlement. +12 population cap, +6 happiness, +20 storage.',
    cost: { stone: 200, iron: 40 },
    costGrowth: 1.4,
    requiresTech: 'sanitation',
    effects: [
      { kind: 'popCap', amount: 12 },
      { kind: 'happiness', amount: 6 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'shrine',
    name: 'Shrine',
    blurb: 'A place of rite and reflection. +0.2 culture/s, +4 happiness, +20 storage.',
    cost: { wood: 60, stone: 40 },
    costGrowth: 1.4,
    requiresTech: 'mysticism',
    effects: [
      { kind: 'produce', resource: 'culture', perSec: 0.2 },
      { kind: 'happiness', amount: 4 },
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
    id: 'coal-mine',
    name: 'Coal Mine',
    blurb: 'A colliery working the coal seams. +1 Coal Miner slot, +0.2 coal/s, +20 storage.',
    cost: { wood: 45, stone: 25 },
    costGrowth: 1.3,
    requiresTech: 'coal-mining',
    effects: [
      { kind: 'jobCapacity', job: 'coal-miner', slots: 1 },
      { kind: 'produce', resource: 'coal', perSec: 0.2 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'charcoal-ground',
    name: 'Charcoal Ground',
    blurb: 'A charring pit — each ACTIVE ground burns wood into coal (−0.5 wood → +0.4 coal /s). Toggle how many run. No settlers needed.',
    cost: { wood: 30, stone: 10 },
    costGrowth: 1.3,
    requiresTech: 'coal-mining',
    effects: [{ kind: 'convert', consume: { wood: 0.5 }, produce: { coal: 0.4 } }],
  },
  {
    id: 'steelworks',
    name: 'Steelworks',
    blurb: 'A furnace that refines steel — each ACTIVE works is staffed by one Smelter and burns a fuel. Toggle how many run on WOOD (−0.3 wood, −0.3 iron → +0.2 steel /s) vs COAL (−0.3 coal, −0.3 iron → +0.3 steel /s — more steel per iron). +1 Smelter slot.',
    cost: { wood: 60, stone: 40, iron: 20 },
    costGrowth: 1.3,
    requiresTech: 'steelmaking',
    effects: [
      { kind: 'jobCapacity', job: 'smelter', slots: 1 },
      // Recipe 0 = Wood fuel (the basic recipe a fresh Steelworks starts on).
      { kind: 'convert', label: 'Wood', consume: { wood: 0.3, iron: 0.3 }, produce: { steel: 0.2 }, requiresWorker: 'smelter' },
      // Recipe 1 = Coal fuel — hotter burn, more steel per iron.
      { kind: 'convert', label: 'Coal', consume: { coal: 0.3, iron: 0.3 }, produce: { steel: 0.3 }, requiresWorker: 'smelter' },
    ],
  },
  {
    id: 'toolworks',
    name: 'Toolworks',
    blurb: 'A steam-driven tool shop — each active works, staffed by a Machinist, forges Tools (−0.3 iron, −0.3 coal → +0.3 tools /s). +1 Machinist slot.',
    cost: { wood: 100, stone: 80, iron: 40 },
    costGrowth: 1.4,
    requiresTech: 'steam-power',
    effects: [
      { kind: 'jobCapacity', job: 'machinist', slots: 1 },
      { kind: 'convert', consume: { iron: 0.3, coal: 0.3 }, produce: { tools: 0.3 }, requiresWorker: 'machinist' },
    ],
  },
  {
    id: 'engine-works',
    name: 'Engine Works',
    blurb: 'Assembles steam Engines — each active works, staffed by an Engineer, builds Engines (−0.2 steel, −0.3 coal → +0.2 engines /s). Costs Tools to build. +1 Engineer slot.',
    cost: { wood: 120, stone: 100, tools: 30 },
    costGrowth: 1.4,
    requiresTech: 'precision-engineering',
    effects: [
      { kind: 'jobCapacity', job: 'engineer', slots: 1 },
      { kind: 'convert', consume: { steel: 0.2, coal: 0.3 }, produce: { engines: 0.2 }, requiresWorker: 'engineer' },
    ],
  },
  {
    id: 'factory',
    name: 'Factory',
    blurb: 'Turns out consumer Furniture — each active factory, staffed by a Machinist, makes Furniture (−0.5 wood, −0.3 tools → +0.3 furniture /s). Held furniture raises happiness. Costs Engines to build. +1 Machinist slot.',
    cost: { wood: 150, stone: 120, engines: 20 },
    costGrowth: 1.4,
    requiresTech: 'industrialization',
    effects: [
      { kind: 'jobCapacity', job: 'machinist', slots: 1 },
      { kind: 'convert', consume: { wood: 0.5, tools: 0.3 }, produce: { furniture: 0.3 }, requiresWorker: 'machinist' },
    ],
  },
  {
    id: 'steam-works',
    name: 'Steam Works',
    blurb: 'MECHANIZATION — each active works burns Coal + Engines to drive machines across the settlement: +20% to EVERY worker’s output while fuelled (−0.5 coal, −0.1 engines /s). Toggle how many run. Costs Engines to build.',
    cost: { stone: 150, steel: 60, engines: 20 },
    costGrowth: 1.4,
    requiresTech: 'industrialization',
    effects: [
      { kind: 'jobOutputMult', amount: 0.2 },
      // Fuel upkeep (no product). While its inputs are in stock the +20% applies (see globalJobMult).
      { kind: 'convert', consume: { coal: 0.5, engines: 0.1 }, produce: {} },
    ],
  },
  {
    id: 'tannery',
    name: 'Tannery',
    blurb: 'Cures hides into Parchment — each active tannery converts furs into parchment (−0.4 furs → +0.3 parchment /s). No settlers needed. (Furs spent here are furs not kept for happiness.)',
    cost: { wood: 40, stone: 20 },
    costGrowth: 1.3,
    requiresTech: 'bookbinding',
    effects: [{ kind: 'convert', consume: { furs: 0.4 }, produce: { parchment: 0.3 } }],
  },
  {
    id: 'scriptorium',
    name: 'Scriptorium',
    blurb: 'Binds Books from parchment — each active scriptorium, staffed by a Scribe, turns parchment + research into books (−0.3 parchment, −0.5 research → +0.1 books /s). Held books raise research per settler. +1 Scribe slot.',
    cost: { wood: 60, stone: 40 },
    costGrowth: 1.3,
    requiresTech: 'bookbinding',
    effects: [
      { kind: 'jobCapacity', job: 'scribe', slots: 1 },
      { kind: 'convert', consume: { parchment: 0.3, research: 0.5 }, produce: { books: 0.1 }, requiresWorker: 'scribe' },
    ],
  },
  {
    id: 'archive',
    name: 'Archive',
    blurb: 'Compiles Compendiums — each active archive, staffed by a Scribe, turns books + research into compendiums (−0.2 books, −1 research → +0.05 compendiums /s). Held compendiums raise the research cap and yield mana per settler. +1 Scribe slot.',
    cost: { wood: 80, stone: 60, tools: 10 },
    costGrowth: 1.3,
    requiresTech: 'compendia',
    effects: [
      { kind: 'jobCapacity', job: 'scribe', slots: 1 },
      { kind: 'convert', consume: { books: 0.2, research: 1 }, produce: { compendiums: 0.05 }, requiresWorker: 'scribe' },
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
  // NATURE magic (Druidry / Seasonal Rites) — mana and life drawn from the living land.
  {
    id: 'ley-grove',
    name: 'Ley Grove',
    blurb: 'A grove sung along the ley lines — draws mana from the living land (+0.6 mana/s), no settlers.',
    cost: { wood: 80, stone: 40 },
    costGrowth: 1.3,
    requiresTech: 'druidry',
    construct: true,
    effects: [{ kind: 'produce', resource: 'mana', perSec: 0.6 }],
  },
  {
    id: 'standing-stones',
    name: 'Standing Stones',
    blurb: 'A ring aligned to the seasons — +0.4 mana/s, +0.5 food/s, and +8 happiness.',
    cost: { stone: 150 },
    costGrowth: 1.3,
    requiresTech: 'seasonal-rites',
    construct: true,
    effects: [
      { kind: 'produce', resource: 'mana', perSec: 0.4 },
      { kind: 'produce', resource: 'food', perSec: 0.5 },
      { kind: 'happiness', amount: 8 },
    ],
  },
  // CRYSTAL magic (Enchantment / Runecraft) — mana worked through crystals into labour.
  {
    id: 'golem-works',
    name: 'Golem Works',
    blurb: 'Crystal-bound golems that mine on their own — iron + stone with NO settlers, only mana upkeep (0.3/s).',
    cost: { stone: 100, manaCrystals: 20 },
    requiresTech: 'enchantment',
    construct: true,
    effects: [
      { kind: 'produce', resource: 'iron', perSec: 0.4 },
      { kind: 'produce', resource: 'stone', perSec: 0.4 },
      { kind: 'manaUpkeep', perSec: 0.3 },
    ],
  },
  {
    id: 'arcane-foundry',
    name: 'Arcane Foundry',
    blurb: 'Runes forge steel from raw magic — steel with NO coal, NO iron, NO settlers, only mana upkeep (0.5/s).',
    cost: { stone: 120, manaCrystals: 40 },
    requiresTech: 'runecraft',
    construct: true,
    effects: [
      { kind: 'produce', resource: 'steel', perSec: 0.3 },
      { kind: 'manaUpkeep', perSec: 0.5 },
    ],
  },
];

export const BUILDING_IDS: BuildingId[] = BUILDINGS.map((b) => b.id);

export const BUILDING_BY_ID: Record<BuildingId, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b]),
) as Record<BuildingId, BuildingDef>;

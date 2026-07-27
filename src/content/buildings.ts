// Building catalogue (pure data). A BUILDING is a repeatable structure you pay
// resources to raise. Its EFFECTS split into two kinds:
//   * IMMEDIATE stat bumps  — popCap / storage caps. Applied once, at build time
//     (systems/buildings.ts), mutating RunState directly. NOT re-derived.
//   * ONGOING effects       — job capacity, passive production, mana upkeep. NOT
//     stored; derived each read/tick from the building count (systems/jobs.ts,
//     systems/production.ts). This split avoids double-counting.
//
// The MAGIC HOOK lives here: the `arcane-font` opens a Mage's post, and the
// `enchanted-grove` spends that mana on food the weather cannot touch. It is the first
// place sorcery buys a settlement out of a constraint the mundane economy cannot.
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

import type { JobId } from './jobs';
import type { MundaneResourceId, ResourceId } from './resources';

export type BuildingId =
  | 'hut'
  | 'farm-house'
  | 'apartments'
  | 'mansion'
  | 'storehouse'
  | 'warehouse'
  | 'woodcutters-lodge'
  | 'forager-hut'
  | 'ranch'
  | 'hunters-lodge'
  | 'quarry'
  | 'granary'
  | 'library'
  | 'academy'
  | 'observatory'
  | 'arcanum'
  | 'aqueduct'
  | 'windmill'
  | 'harbor'
  | 'seaport'
  | 'market'
  | 'bank'
  | 'ironworks'
  | 'monastery'
  | 'theatre'
  | 'forum'
  | 'wayside-shrine'
  | 'ward-stone'
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
  | 'paper-mill'
  | 'guild-hall'
  | 'blast-furnace'
  | 'workshop'
  | 'forge'
  | 'amphitheater'
  | 'sacred-grove'
  | 'arcane-font'
  | 'enchanted-grove'
  | 'quickwood-stand'
  | 'stone-garden'
  | 'alembic'
  // Prismatic: four ATTUNEMENTS (income, one mechanic each) + four ELEMENTAL constructs
  // (sinks) + the two convergence works.
  | 'wind-spire'
  | 'deep-cairn'
  | 'ember-forge'
  | 'tide-basin'
  | 'storm-sails'
  | 'stone-titan'
  | 'flame-wardens'
  | 'rain-engine'
  | 'prism-nexus'
  | 'prismatic-spire';

export type BuildingEffect =
  // IMMEDIATE (applied at build time, permanent):
  | { kind: 'popCap'; amount: number } // +N housing capacity
  | { kind: 'cap'; amount: number } // +N to EACH mundane storage cap (Storehouse; includes food)
  | { kind: 'capExceptFood'; amount: number } // +N to every mundane cap EXCEPT food (Warehouse)
  | { kind: 'foodCap'; amount: number } // +N to the FOOD storage cap only (Granary)
  // ONGOING (derived per tick / per read from building count):
  | { kind: 'jobCapacity'; job: JobId; slots: number } // +slots assignable to a job
  | { kind: 'jobOutputMult'; amount: number } // +fraction to EVERY worker's output (Workshop/Forge)
  | { kind: 'jobBoost'; job: JobId; amount: number } // +fraction to ONE job's output per copy (Aqueduct → Farmer)
  // +fraction to MAGICAL yield per copy — elemental essences and/or Prismatic Mana, whatever
  // produced them (attunement, converter, or nexus). The Arcanum's whole purpose.
  | { kind: 'yieldBoost'; target: 'essence' | 'prismatic'; amount: number }
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
      /** Recipe hidden until this tech is researched — the elemental ATTUNEMENTS. A gated
       *  recipe also defaults to OFF, so unlocking one never silently starts draining mana. */
      requiresTech?: string;
    }
  | { kind: 'manaUpkeep'; perSec: number } // mana drained per second
  // +N to the RESEARCH cap (science buildings; caps.ts). An optional `requiresTech` gates the
  // bonus, which is how the Decimal System DOUBLES the Library: a second, gated +50.
  | { kind: 'researchCap'; amount: number; requiresTech?: string }
  // +N to the CULTURE cap. Culture is remembered, not stored in a barn — the works that
  // keep it (a Temple's records, a Forum's archive) are what let a settlement hold more.
  | { kind: 'cultureCap'; amount: number }
  // +N to the MANA cap. Mana is otherwise carried in people (one per citizen) — these are
  // the works that give it somewhere else to sit.
  | { kind: 'manaCap'; amount: number }
  // +N to the GOLD cap. Gold is uncapped until Currency is researched; from then on the
  // treasury only holds what your housing can hold (caps.ts goldCap).
  | { kind: 'coinCap'; amount: number }
  // +N to ONE material's cap — a workplace stores what it produces, and nothing else.
  | { kind: 'resourceCap'; resource: MundaneResourceId; amount: number }
  | { kind: 'happiness'; amount: number }; // +N happiness (luxury buildings; systems/happiness.ts)

/** Build-tab section a building files under. Constructs render in their own "Arcane
 *  Constructs" section regardless; their category is 'arcane' for completeness. */
export type BuildingCategory = 'housing' | 'storage' | 'production' | 'science' | 'civic' | 'industry' | 'arcane';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  /** ONE flavor sentence (dry wit + quiet wonder). NO stats or rates here — the tooltip
   *  derives every mechanical line from `effects`/`cost` (see stores.ts effectLines). One
   *  short mechanical clause is allowed only when the mechanic is choice-bearing. */
  blurb: string;
  category: BuildingCategory;
  cost: Partial<Record<ResourceId, number>>;
  /** Per-existing-count cost multiplier (default 1 = flat). Every normal building
   *  escalates (costs more per copy); only the "special" magic constructs stay flat. */
  costGrowth?: number;
  /** An ADDITIONAL cost that only applies once `count` copies already stand — a building
   *  whose price CHANGES IN KIND partway up the ladder, not merely in size (the Ward Stone
   *  starts as plain masonry and begins demanding iron from the sixth onward). Escalates by
   *  the same costGrowth, counted from the first copy it applies to. */
  extraCostAfter?: { count: number; cost: Partial<Record<ResourceId, number>> };
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
/** The three BASE gather workplaces (Farm, Woodcutter's Lodge, Quarry) double as storage
 *  for THEIR OWN yield — a granary of grain, a woodpile, a stoneyard. */
const BASE_WORKPLACE_CAP = 100;

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'hut',
    name: 'House',
    blurb: 'Four walls, a roof, and opinions about both. Citizens insist on all three.',
    category: 'housing',
    cost: { wood: 10 },
    costGrowth: 1.5,
    // Housing and a strongbox — a house is somewhere to live and somewhere to keep coin,
    // not a warehouse for timber and grain.
    effects: [
      { kind: 'popCap', amount: 1 },
      { kind: 'coinCap', amount: 100 },
    ],
  },
  {
    id: 'wayside-shrine',
    name: 'Shrine',
    blurb: 'Stacked stones at the roadside. People leave things; something keeps them.',
    category: 'civic',
    cost: { stone: 30 },
    costGrowth: 1.25,
    // Still no TECH — the only source of Culture before The Arts, and Folk Lore later teaches
    // it to draw mana as well. But it waits for a working settlement: people raise a shrine
    // once they are housed, fed and cutting timber, not on the first afternoon.
    requiresBuilding: 'woodcutters-lodge',
    effects: [
      { kind: 'produce', resource: 'culture', perSec: 0.02 },
      { kind: 'produce', resource: 'mana', perSec: 0.02, requiresTech: 'folk-lore' },
      { kind: 'cultureCap', amount: 10 },
    ],
  },
  {
    id: 'ward-stone',
    name: 'Ward Stone',
    blurb: 'A carved stone that drinks the ambient magic and gives back a quiet, steady calm.',
    category: 'civic',
    cost: { stone: 100 },
    costGrowth: 1.3,
    // Past the fifth stone the easy ley-sites are taken; the rest need banded iron to hold
    // a ward at all. Escalates from the copy it first applies to, like any other cost.
    extraCostAfter: { count: 5, cost: { iron: 25 } },
    requiresTech: 'warding',
    // A converter with no output: the mana IS the cost and the calm IS the product. Being a
    // converter is what gives it the active-copies toggle — a settlement should be able to
    // stand its wards down when the pool runs low.
    effects: [
      { kind: 'convert', consume: { mana: 0.2 }, produce: {} },
      { kind: 'happiness', amount: 3 },
    ],
  },
  {
    id: 'farm-house',
    name: 'Farm House',
    blurb: 'A home with its boots already muddy. The fields are right outside.',
    category: 'housing',
    cost: { wood: 50, stone: 5 },
    costGrowth: 1.4,
    requiresTech: 'agriculture',
    // Housing and a Farm slot only — a farmhouse is somewhere to live and work, not a store.
    effects: [
      { kind: 'popCap', amount: 1 },
      { kind: 'jobCapacity', job: 'forager', slots: 1 },
    ],
  },
  {
    id: 'apartments',
    name: 'Apartments',
    blurb: 'Homes stacked on homes. The stairs are nobody’s favourite.',
    category: 'housing',
    cost: { wood: 60, stone: 40 },
    costGrowth: 1.4,
    requiresTech: 'construction',
    effects: [{ kind: 'popCap', amount: 4 }, { kind: 'cap', amount: STRUCT_CAP }],
  },
  {
    id: 'mansion',
    name: 'Mansion',
    blurb: 'More rooms than residents, and proud of it.',
    category: 'housing',
    cost: { wood: 120, stone: 80, furniture: 10 },
    costGrowth: 1.4,
    requiresTech: 'sanitation',
    effects: [
      { kind: 'popCap', amount: 5 },
      { kind: 'happiness', amount: 3 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'storehouse',
    name: 'Storehouse',
    blurb: 'Shelves, hooks, and a door that locks. Everything keeps better indoors.',
    category: 'storage',
    // Storage is a real building project, priced like one — and it gives back in proportion.
    cost: { wood: 60, stone: 30 },
    costGrowth: 1.55,
    // Third rung of the opening chain: a settlement that is housed and fed starts
    // wondering where to put things.
    requiresBuilding: 'forager-hut',
    effects: [{ kind: 'cap', amount: 150 }],
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    blurb: 'Row upon row of crates. The food goes elsewhere, by popular demand.',
    category: 'storage',
    cost: { wood: 180, stone: 120 },
    costGrowth: 1.55,
    requiresTech: 'masonry',
    effects: [{ kind: 'capExceptFood', amount: 300 }],
  },
  {
    id: 'woodcutters-lodge',
    name: "Woodcutter's Lodge",
    blurb: 'A base for fellers. The forest pretends not to notice.',
    category: 'production',
    cost: { wood: 25 },
    costGrowth: 1.25,
    // The first five are timber and rope. Past that the easy stands are cut out and a lodge
    // needs founded stone to sit on — a second resource enters the price, not just a bigger
    // number of the first.
    extraCostAfter: { count: 5, cost: { stone: 20 } },
    // Third rung of the opening chain, alongside the Storehouse: once the fields are in,
    // the settlement can spare hands for the forest.
    requiresBuilding: 'forager-hut',
    effects: [
      { kind: 'jobCapacity', job: 'woodcutter', slots: 1 },
      { kind: 'resourceCap', resource: 'wood', amount: BASE_WORKPLACE_CAP },
      { kind: 'jobBoost', job: 'woodcutter', amount: 0.02 },
    ],
  },
  {
    id: 'forager-hut',
    name: 'Farm',
    blurb: 'Tilled rows and stubborn pens. The waiting is the hard part.',
    category: 'production',
    cost: { wood: 20 },
    costGrowth: 1.25,
    // Second rung of the opening chain: roof first, then something to eat under it.
    // A settlement knows how to plant before it theorizes.
    requiresBuilding: 'hut',
    effects: [
      { kind: 'jobCapacity', job: 'forager', slots: 1 },
      { kind: 'resourceCap', resource: 'food', amount: BASE_WORKPLACE_CAP },
      { kind: 'jobBoost', job: 'forager', amount: 0.02 },
    ],
  },
  {
    id: 'ranch',
    name: 'Ranch',
    blurb: 'Fenced pasture and patient animals. Dinner arrives on its own legs.',
    category: 'production',
    cost: { wood: 60, stone: 20 },
    costGrowth: 1.25,
    requiresTech: 'animal-husbandry',
    // Pasture, not a pantry — no storage of its own. Alchemy teaches the hands to render
    // down what the herd yields besides meat.
    effects: [
      { kind: 'produce', resource: 'food', perSec: 0.4 },
      { kind: 'produce', resource: 'alchemical', perSec: 0.05, requiresTech: 'alchemy' },
    ],
  },
  {
    id: 'hunters-lodge',
    name: "Hunter's Lodge",
    blurb: 'Trackers, trappers, and tall tales with the furs to prove them.',
    category: 'production',
    cost: { wood: 25 },
    costGrowth: 1.25,
    requiresTech: 'archery',
    // Like the other base workplaces, it stores its OWN yield — and a Lodge yields two things.
    effects: [
      { kind: 'jobCapacity', job: 'hunter', slots: 1 },
      { kind: 'resourceCap', resource: 'food', amount: BASE_WORKPLACE_CAP },
      { kind: 'resourceCap', resource: 'furs', amount: BASE_WORKPLACE_CAP },
    ],
  },
  {
    id: 'quarry',
    name: 'Quarry',
    blurb: 'A worked pit where the hill used to be.',
    category: 'production',
    // Timber alone to open a pit — asking for stone to build the thing that MAKES stone is
    // a bootstrapping tax on a settlement still gathering it by hand. Past the fifth, the
    // shallow rock is gone and a working pit needs cut stone of its own.
    cost: { wood: 20 },
    costGrowth: 1.25,
    extraCostAfter: { count: 5, cost: { stone: 20 } },
    requiresTech: 'masonry',
    effects: [
      { kind: 'jobCapacity', job: 'quarry-worker', slots: 1 },
      { kind: 'resourceCap', resource: 'stone', amount: BASE_WORKPLACE_CAP },
      { kind: 'jobBoost', job: 'quarry-worker', amount: 0.02 },
      {
        kind: 'convert',
        label: 'Attune',
        consume: { mana: 0.2 },
        produce: { earthEssence: 0.05 },
        requiresTech: 'earth-attunement',
      },
    ],
  },
  {
    id: 'granary',
    name: 'Granary',
    blurb: 'Dry, sealed, and defended against mice with mixed results.',
    category: 'storage',
    // A barn is the biggest thing an early settlement builds, and the most worth building:
    // against a 3000 base larder it adds a serious fraction, not a rounding error.
    cost: { wood: 90, stone: 30 },
    costGrowth: 1.55,
    requiresTech: 'pottery',
    effects: [{ kind: 'foodCap', amount: 1200 }],
  },
  {
    id: 'library',
    name: 'Library',
    blurb: 'Shelves of scrolls, and one scholar who insists on silence.',
    category: 'science',
    // Timber and shelving, nothing else — a Library is carpentry, not masonry. It opens
    // dear (100 wood) so the first one is a real decision rather than an afterthought.
    cost: { wood: 100 },
    costGrowth: 1.35,
    requiresTech: 'writing',
    effects: [
      { kind: 'jobCapacity', job: 'scholar', slots: 1 },
      { kind: 'produce', resource: 'research', perSec: 0.1 },
      // A Library shelves RESEARCH and nothing else — no general storage.
      { kind: 'researchCap', amount: 50 },
      // The Decimal System doubles what every Library holds — a second +50 per copy.
      { kind: 'researchCap', amount: 50, requiresTech: 'decimal-system' },
    ],
  },
  {
    id: 'academy',
    name: 'Academy',
    blurb: 'Higher learning: the same questions as the Library, asked more expensively.',
    category: 'science',
    cost: { wood: 150, stone: 120 },
    costGrowth: 1.45,
    requiresTech: 'mathematics',
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
    blurb: 'Charts the heavens, which decline to comment.',
    category: 'science',
    cost: { wood: 120, stone: 100 },
    costGrowth: 1.45,
    requiresTech: 'mathematics',
    effects: [
      { kind: 'jobCapacity', job: 'scholar', slots: 1 },
      { kind: 'produce', resource: 'research', perSec: 0.3 },
      { kind: 'researchCap', amount: 400 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'arcanum',
    name: 'Arcanum',
    blurb: 'A school for the four tempers. Its faculty argues in four directions at once.',
    category: 'science',
    cost: { wood: 180, stone: 160, manaCrystals: 30 },
    costGrowth: 1.45,
    requiresTech: 'prismatic-theory',
    effects: [
      { kind: 'yieldBoost', target: 'essence', amount: 0.15 },
      { kind: 'yieldBoost', target: 'prismatic', amount: 0.1 },
      { kind: 'jobCapacity', job: 'scholar', slots: 1 },
      { kind: 'researchCap', amount: 300 },
      { kind: 'manaCap', amount: 100 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'aqueduct',
    name: 'Aqueduct',
    blurb: 'Water walks to the fields on stone legs. The Farmers approve.',
    category: 'production',
    cost: { wood: 80, stone: 120 },
    costGrowth: 1.45,
    requiresTech: 'engineering',
    effects: [
      { kind: 'jobBoost', job: 'forager', amount: 0.1 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'windmill',
    name: 'Windmill',
    blurb: 'Sails turn, stones grind, and the wind works for free.',
    category: 'production',
    cost: { wood: 100, stone: 60, tools: 5 },
    costGrowth: 1.45,
    requiresTech: 'milling',
    effects: [
      { kind: 'jobBoost', job: 'forager', amount: 0.15 },
      {
        kind: 'convert',
        label: 'Attune',
        consume: { mana: 0.2 },
        produce: { airEssence: 0.05 },
        requiresTech: 'air-attunement',
      },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'harbor',
    name: 'Harbour',
    blurb: 'Boats, nets, and a jetty that smells of the tide. Half the town suddenly has business here.',
    category: 'production',
    cost: { wood: 400, stone: 120 },
    costGrowth: 1.25,
    requiresTech: 'sailing',
    effects: [
      { kind: 'produce', resource: 'food', perSec: 0.3 },
      { kind: 'produce', resource: 'gold', perSec: 0.15 },
      {
        kind: 'convert',
        label: 'Attune',
        consume: { mana: 0.2 },
        produce: { waterEssence: 0.05 },
        requiresTech: 'water-attunement',
      },
      // A harbour handles money as well as fish — it holds far more coin than a House.
      { kind: 'coinCap', amount: 250 },
      { kind: 'cap', amount: 40 },
    ],
  },
  {
    id: 'seaport',
    name: 'Seaport',
    blurb: 'Deep berths and a harbourmaster with opinions. The sea route becomes a road.',
    category: 'production',
    cost: { wood: 160, stone: 120, tools: 15 },
    costGrowth: 1.45,
    requiresTech: 'navigation',
    requiresBuilding: 'harbor',
    effects: [
      { kind: 'produce', resource: 'food', perSec: 0.4 },
      { kind: 'produce', resource: 'gold', perSec: 0.5 },
      { kind: 'cap', amount: 60 },
    ],
  },
  {
    id: 'market',
    name: 'Market',
    blurb: 'Stalls, haggling, and a scale everyone privately distrusts.',
    category: 'civic',
    cost: { wood: 90, stone: 60 },
    costGrowth: 1.45,
    requiresTech: 'currency',
    effects: [
      { kind: 'produce', resource: 'gold', perSec: 0.3 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'bank',
    name: 'Bank',
    blurb: 'Other people’s coin, carefully counted and quietly lent.',
    category: 'civic',
    cost: { stone: 150, iron: 50, gold: 150 },
    costGrowth: 1.5,
    requiresTech: 'banking',
    effects: [
      { kind: 'produce', resource: 'gold', perSec: 0.8 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'ironworks',
    name: 'Ironworks',
    blurb: 'Cast, cooled, and finished under one long roof. Every trade collects better tools.',
    category: 'industry',
    cost: { stone: 180, iron: 120 },
    costGrowth: 1.5,
    requiresTech: 'metal-casting',
    effects: [
      { kind: 'jobOutputMult', amount: 0.2 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'monastery',
    name: 'Monastery',
    blurb: 'Quiet cloisters, patient copying, and a garden nobody hurries.',
    category: 'civic',
    cost: { wood: 100, stone: 90 },
    costGrowth: 1.45,
    requiresTech: 'theology',
    effects: [
      { kind: 'produce', resource: 'culture', perSec: 0.25 },
      { kind: 'cultureCap', amount: 100 },
      { kind: 'happiness', amount: 5 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'theatre',
    name: 'Theatre',
    blurb: 'Printed playbills, a paying crowd, and one memorable disaster per season.',
    category: 'civic',
    cost: { wood: 160, stone: 120, parchment: 40 },
    costGrowth: 1.5,
    requiresTech: 'printing-press',
    effects: [
      { kind: 'jobCapacity', job: 'bard', slots: 1 },
      { kind: 'produce', resource: 'culture', perSec: 0.5 },
      { kind: 'cultureCap', amount: 150 },
      { kind: 'produce', resource: 'gold', perSec: 0.2 },
      { kind: 'happiness', amount: 8 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'forum',
    name: 'Forum',
    blurb: 'A public square where everyone is briefly a philosopher.',
    category: 'civic',
    cost: { wood: 100, stone: 100 },
    costGrowth: 1.45,
    requiresTech: 'philosophy',
    effects: [
      { kind: 'jobCapacity', job: 'bard', slots: 1 },
      { kind: 'produce', resource: 'culture', perSec: 0.3 },
      { kind: 'cultureCap', amount: 100 },
      { kind: 'happiness', amount: 5 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    // NB: the id stays `shrine` so existing saves keep their count — only the NAME moved,
    // to make room for the early-game Shrine below.
    id: 'shrine',
    name: 'Temple',
    blurb: 'Rites with a roof, and someone paid to remember the words.',
    category: 'civic',
    cost: { wood: 60, stone: 40 },
    costGrowth: 1.45,
    requiresTech: 'mysticism',
    effects: [
      { kind: 'produce', resource: 'culture', perSec: 0.2 },
      { kind: 'cultureCap', amount: 50 },
      { kind: 'happiness', amount: 4 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'mine',
    name: 'Mine',
    blurb: 'A deep shaft for iron. The dark, on occasion, stares back.',
    category: 'production',
    cost: { wood: 40, stone: 20 },
    costGrowth: 1.25,
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
    blurb: 'A colliery on the seam. Everything nearby turns slowly grey.',
    category: 'production',
    cost: { wood: 45, stone: 25 },
    costGrowth: 1.25,
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
    blurb: 'A smouldering mound that turns wood into coal — slowly, and without complaint.',
    category: 'industry',
    cost: { wood: 30, stone: 10 },
    costGrowth: 1.25,
    requiresTech: 'coal-mining',
    effects: [{ kind: 'convert', consume: { wood: 0.5 }, produce: { coal: 0.4 } }],
  },
  {
    id: 'steelworks',
    name: 'Steelworks',
    blurb: 'A furnace hot enough to make iron reconsider. Feed it wood or coal — coal burns hotter.',
    category: 'industry',
    cost: { wood: 60, stone: 40, iron: 20 },
    costGrowth: 1.25,
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
    blurb: 'Machines that make tools that make machines. Best not to think about it too long.',
    category: 'industry',
    cost: { wood: 100, stone: 80, iron: 40 },
    costGrowth: 1.45,
    requiresTech: 'steam-power',
    effects: [
      { kind: 'jobCapacity', job: 'machinist', slots: 1 },
      { kind: 'convert', consume: { iron: 0.3, coal: 0.3 }, produce: { tools: 0.3 }, requiresWorker: 'machinist' },
    ],
  },
  {
    id: 'engine-works',
    name: 'Engine Works',
    blurb: 'Where steam learns to push. The neighbours were not consulted.',
    category: 'industry',
    cost: { wood: 120, stone: 100, tools: 30 },
    costGrowth: 1.45,
    requiresTech: 'precision-engineering',
    effects: [
      { kind: 'jobCapacity', job: 'engineer', slots: 1 },
      { kind: 'convert', consume: { steel: 0.2, coal: 0.3 }, produce: { engines: 0.2 }, requiresWorker: 'engineer' },
    ],
  },
  {
    id: 'factory',
    name: 'Factory',
    blurb: 'Furniture by the cartload. The settlement discovers wants it never knew it had.',
    category: 'industry',
    cost: { wood: 150, stone: 120, engines: 20 },
    costGrowth: 1.45,
    requiresTech: 'industrialization',
    effects: [
      { kind: 'jobCapacity', job: 'machinist', slots: 1 },
      { kind: 'convert', consume: { wood: 0.5, tools: 0.3 }, produce: { furniture: 0.3 }, requiresWorker: 'machinist' },
    ],
  },
  {
    id: 'steam-works',
    name: 'Steam Works',
    blurb: 'Belts and pistons hurry every trade along — while the coal holds out.',
    category: 'industry',
    cost: { stone: 150, steel: 60, engines: 20 },
    costGrowth: 1.45,
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
    blurb: 'Hides go in; parchment comes out. Nobody asks about the middle part.',
    category: 'industry',
    cost: { wood: 40, stone: 20 },
    costGrowth: 1.25,
    requiresTech: 'bookbinding',
    effects: [{ kind: 'convert', consume: { furs: 0.4 }, produce: { parchment: 0.3 } }],
  },
  {
    id: 'scriptorium',
    name: 'Scriptorium',
    blurb: 'Ink-stained fingers, immaculate letters. Held Books sharpen every citizen’s curiosity.',
    category: 'industry',
    cost: { wood: 60, stone: 40 },
    costGrowth: 1.25,
    requiresTech: 'bookbinding',
    effects: [
      { kind: 'jobCapacity', job: 'scribe', slots: 1 },
      { kind: 'convert', consume: { parchment: 0.3, research: 0.5 }, produce: { books: 0.1 }, requiresWorker: 'scribe' },
    ],
  },
  {
    id: 'archive',
    name: 'Archive',
    blurb: 'Where books go to become bigger books. Held Compendiums raise the research ceiling.',
    category: 'industry',
    cost: { wood: 80, stone: 60, tools: 10 },
    costGrowth: 1.35,
    requiresTech: 'compendia',
    effects: [
      { kind: 'jobCapacity', job: 'scribe', slots: 1 },
      { kind: 'convert', consume: { books: 0.2, research: 1 }, produce: { compendiums: 0.05 }, requiresWorker: 'scribe' },
    ],
  },
  {
    id: 'paper-mill',
    name: 'Paper Mill',
    blurb: 'Pulped timber pressed into pages. The forest, repurposed for arguments.',
    category: 'industry',
    cost: { wood: 80, stone: 40 },
    costGrowth: 1.25,
    requiresTech: 'paper-making',
    effects: [{ kind: 'convert', consume: { wood: 0.6 }, produce: { parchment: 0.25 } }],
  },
  {
    id: 'blast-furnace',
    name: 'Blast Furnace',
    blurb: 'It runs day and night and asks for nothing but fuel.',
    category: 'industry',
    cost: { stone: 120, iron: 60 },
    costGrowth: 1.45,
    requiresTech: 'blast-furnace',
    effects: [{ kind: 'convert', consume: { coal: 0.4, iron: 0.4 }, produce: { steel: 0.15 } }],
  },
  {
    id: 'guild-hall',
    name: 'Guild Hall',
    blurb: 'Dues are collected, standards enforced, apprentices mildly terrorized.',
    category: 'civic',
    cost: { wood: 120, stone: 80 },
    costGrowth: 1.55,
    requiresTech: 'guild-charters',
    effects: [
      { kind: 'jobOutputMult', amount: 0.05 },
      { kind: 'produce', resource: 'culture', perSec: 0.2 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'workshop',
    name: 'Workshop',
    blurb: 'Carts, gears, and better technique all round. Every trade moves a little quicker.',
    category: 'industry',
    cost: { wood: 50, stone: 30 },
    costGrowth: 1.35,
    requiresTech: 'the-wheel',
    effects: [{ kind: 'jobOutputMult', amount: 0.1 }, { kind: 'cap', amount: STRUCT_CAP }],
  },
  {
    id: 'forge',
    name: 'Forge',
    blurb: 'Ringing anvils and honest soot. Everyone works a little sharper.',
    category: 'industry',
    cost: { wood: 50, stone: 40 },
    costGrowth: 1.35,
    requiresTech: 'iron-working',
    effects: [
      { kind: 'jobOutputMult', amount: 0.15 },
      {
        kind: 'convert',
        label: 'Attune',
        consume: { mana: 0.2 },
        produce: { fireEssence: 0.05 },
        requiresTech: 'fire-attunement',
      },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'amphitheater',
    name: 'Amphitheater',
    blurb: 'Song, story, and spectacle — the settlement applauds itself.',
    category: 'civic',
    // Tiered seating and the purse to pay for it — stone and coin, no timber.
    cost: { stone: 120, gold: 40 },
    costGrowth: 1.35,
    requiresTech: 'the-arts',
    // An empty stage lifts nobody: the morale comes from the ENTERTAINERS you staff it with
    // (+5 each, systems/happiness.ts), who draw a fee from the treasury. It stores nothing.
    effects: [
      { kind: 'jobCapacity', job: 'bard', slots: 1 },
      { kind: 'cultureCap', amount: 50 },
    ],
  },
  {
    id: 'sacred-grove',
    name: 'Sacred Grove',
    blurb: 'Old trees, tended well. Something in there tends back.',
    category: 'civic',
    cost: { wood: 60 },
    costGrowth: 1.35,
    requiresTech: 'naturalism',
    effects: [
      { kind: 'happiness', amount: 5 },
      { kind: 'cap', amount: STRUCT_CAP },
    ],
  },
  {
    id: 'arcane-font',
    name: 'Arcane Font',
    blurb: 'A wellspring of raw magic. It gives nothing to an empty room.',
    category: 'arcane',
    cost: { stone: 120 },
    // A Font is no longer something you simply stack: each one is dearer than the last.
    costGrowth: 1.35,
    requiresFlag: 'magicDiscovered',
    construct: true,
    // A Font DEEPENS the pool and opens a post at it — the mana itself is drawn by the MAGE
    // who works it (content/jobs.ts), so an unstaffed Font produces nothing. Without the
    // ceiling this raises, the mana-costed techs would be unreachable: the Arcanum lifts it
    // too, but sits behind Prismatic Theory, which itself costs 200 mana.
    effects: [
      { kind: 'jobCapacity', job: 'mage', slots: 1 },
      { kind: 'manaCap', amount: 25 },
    ],
  },
  {
    id: 'enchanted-grove',
    name: 'Enchanted Grove',
    blurb: 'A stand of trees coaxed into fruiting out of season. The grove keeps its own summer.',
    category: 'arcane',
    cost: { wood: 60, stone: 20 },
    costGrowth: 1.35,
    requiresFlag: 'magicDiscovered',
    requiresBuilding: 'arcane-font',
    construct: true,
    // A CONVERTER, and that is the whole point: converter output is exempt from the season
    // and the weather (systems/weather.ts), so a grove yields the same two food in the depth
    // of winter as it does in spring. Buying your way out of the sky is what magic is for.
    effects: [{ kind: 'convert', consume: { mana: 0.3 }, produce: { food: 2 } }],
  },
  // The Font's other three sinks. Each is worth LESS per citizen than the worker it echoes —
  // a Mage feeding these produces under what a Woodcutter or Stonecutter would. What they buy
  // instead is production that needs no job slot and no roof: a settlement at its housing cap,
  // or out of workplaces to staff, can still grow its output.
  {
    id: 'quickwood-stand',
    name: 'Quickwood Stand',
    blurb: 'A coppice that grows back faster than the axes can take it. The woodcutters find this unnerving.',
    category: 'arcane',
    cost: { wood: 40, stone: 40 },
    costGrowth: 1.35,
    requiresFlag: 'magicDiscovered',
    requiresBuilding: 'arcane-font',
    construct: true,
    effects: [{ kind: 'convert', consume: { mana: 0.3 }, produce: { wood: 0.5 } }],
  },
  {
    id: 'stone-garden',
    name: 'Stone Garden',
    blurb: 'Boulders left to swell overnight, patiently, like bread. Nobody waters them twice.',
    category: 'arcane',
    cost: { wood: 80, stone: 20 },
    costGrowth: 1.35,
    requiresFlag: 'magicDiscovered',
    requiresBuilding: 'arcane-font',
    construct: true,
    effects: [{ kind: 'convert', consume: { mana: 0.3 }, produce: { stone: 0.5 } }],
  },
  {
    id: 'alembic',
    name: 'Alembic',
    blurb: 'Mana, a good dinner and a shelf of jars, distilled to an idea. Usually "try it again".',
    category: 'arcane',
    cost: { wood: 60, stone: 40 },
    costGrowth: 1.35,
    requiresFlag: 'magicDiscovered',
    requiresBuilding: 'arcane-font',
    // Alchemy is the third gate, and it earns its place: this is the first and only thing in
    // the game that SPENDS Alchemical Components, which until now piled up with nothing to do.
    requiresTech: 'alchemy',
    construct: true,
    // The only construct that eats FOOD as well as mana — insight is not conjured out of
    // nothing, and it competes with the people at the table. The components draw is what ties
    // it back to the Hunters and Ranches that render them (each roughly feeds one Alembic).
    effects: [
      { kind: 'convert', consume: { mana: 0.4, food: 1, alchemical: 0.05 }, produce: { research: 0.3 } },
    ],
  },
  // NATURE magic (Druidry / Seasonal Rites) — mana and life drawn from the living land.
  {
    id: 'ley-grove',
    name: 'Ley Grove',
    blurb: 'A grove sung along the ley lines. The land hums, faintly, in tune.',
    category: 'arcane',
    cost: { wood: 80, stone: 40 },
    costGrowth: 1.35,
    requiresTech: 'druidry',
    construct: true,
    effects: [{ kind: 'produce', resource: 'mana', perSec: 0.6 }],
  },
  {
    id: 'standing-stones',
    name: 'Standing Stones',
    blurb: 'A ring aligned to the seasons. On solstice nights nobody walks past alone.',
    category: 'arcane',
    cost: { stone: 150 },
    costGrowth: 1.35,
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
    blurb: 'Stone that digs stone. The golems do not unionize, so far.',
    category: 'arcane',
    cost: { stone: 100, manaCrystals: 20 },
    requiresTech: 'enchantment',
    construct: true,
    effects: [
      { kind: 'produce', resource: 'iron', perSec: 0.4 },
      { kind: 'produce', resource: 'stone', perSec: 0.4 },
      { kind: 'manaUpkeep', perSec: 0.3 },
    ],
  },
  // ---- PRISMATIC ATTUNEMENTS (income) — each element earns its essence a DIFFERENT way. ----
  // AIR is coaxed, not fed: a Wind Spire needs a Windmill's turning sails to catch.
  {
    id: 'wind-spire',
    name: 'Wind Spire',
    blurb: 'A hollow tower that sings when the sails turn. Air gathers where it is invited.',
    category: 'arcane',
    cost: { stone: 80, wood: 60 },
    costGrowth: 1.35,
    requiresTech: 'aeromancy',
    requiresBuilding: 'windmill',
    construct: true,
    effects: [
      { kind: 'produce', resource: 'airEssence', perSec: 0.08 },
      { kind: 'manaUpkeep', perSec: 0.2 },
    ],
  },
  // EARTH is quarried: the Deep Cairn eats raw stone and gives back the hill's temper.
  {
    id: 'deep-cairn',
    name: 'Deep Cairn',
    blurb: 'Stones stacked in an older pattern. The ground answers in kind.',
    category: 'arcane',
    cost: { stone: 140 },
    costGrowth: 1.35,
    requiresTech: 'geomancy',
    construct: true,
    effects: [
      { kind: 'convert', consume: { stone: 0.5 }, produce: { earthEssence: 0.08 } },
      { kind: 'manaUpkeep', perSec: 0.2 },
    ],
  },
  // FIRE is fuelled: the Ember Forge burns coal outright.
  {
    id: 'ember-forge',
    name: 'Ember Forge',
    blurb: 'A hearth kept deliberately hungry. Fire pays only those who feed it.',
    category: 'arcane',
    cost: { stone: 100, iron: 40 },
    costGrowth: 1.35,
    requiresTech: 'pyromancy',
    construct: true,
    effects: [
      { kind: 'convert', consume: { coal: 0.4 }, produce: { fireEssence: 0.1 } },
      { kind: 'manaUpkeep', perSec: 0.2 },
    ],
  },
  // WATER is channelled: a Tide Basin needs an Aqueduct's flow to fill.
  {
    id: 'tide-basin',
    name: 'Tide Basin',
    blurb: 'A still pool that keeps a tide of its own, politely ignoring the moon.',
    category: 'arcane',
    cost: { stone: 120, wood: 40 },
    costGrowth: 1.35,
    requiresTech: 'hydromancy',
    requiresBuilding: 'aqueduct',
    construct: true,
    effects: [
      { kind: 'produce', resource: 'waterEssence', perSec: 0.08 },
      { kind: 'manaUpkeep', perSec: 0.2 },
    ],
  },
  // ---- ELEMENTAL CONSTRUCTS (sinks) — burn one essence for citizen-free labour. ----
  {
    id: 'storm-sails',
    name: 'Storm Sails',
    blurb: 'Canvas that fells timber on a wind of its own making.',
    category: 'arcane',
    cost: { wood: 80, airEssence: 10 },
    costGrowth: 1.35,
    requiresTech: 'aeromancy',
    construct: true,
    effects: [{ kind: 'convert', consume: { airEssence: 0.05 }, produce: { wood: 1.2 } }],
  },
  {
    id: 'stone-titan',
    name: 'Stone Titan',
    blurb: 'It works the quarry it was quarried from, and does not tire.',
    category: 'arcane',
    cost: { stone: 150, earthEssence: 10 },
    costGrowth: 1.35,
    requiresTech: 'geomancy',
    construct: true,
    effects: [{ kind: 'convert', consume: { earthEssence: 0.05 }, produce: { stone: 0.8, iron: 0.5 } }],
  },
  {
    id: 'flame-wardens',
    name: 'Flame Wardens',
    blurb: 'Living furnaces that smelt without ore carts, coal, or complaint.',
    category: 'arcane',
    cost: { iron: 60, fireEssence: 10 },
    costGrowth: 1.35,
    requiresTech: 'pyromancy',
    construct: true,
    effects: [{ kind: 'convert', consume: { fireEssence: 0.05, iron: 0.2 }, produce: { steel: 0.35 } }],
  },
  {
    id: 'rain-engine',
    name: 'Rain Engine',
    blurb: 'It rains on the fields at the hour the fields prefer.',
    category: 'arcane',
    cost: { stone: 100, waterEssence: 10 },
    costGrowth: 1.35,
    requiresTech: 'hydromancy',
    construct: true,
    effects: [{ kind: 'convert', consume: { waterEssence: 0.05 }, produce: { food: 1.5 } }],
  },
  // ---- CONVERGENCE — fuse the four, then spend the light. ----
  {
    id: 'prism-nexus',
    name: 'Prism Nexus',
    blurb: 'Four tempers meet in one lens and agree, briefly, to be light.',
    category: 'arcane',
    cost: { stone: 200, manaCrystals: 60 },
    costGrowth: 1.35,
    requiresTech: 'prismatic-convergence',
    construct: true,
    effects: [
      {
        kind: 'convert',
        consume: { airEssence: 0.05, earthEssence: 0.05, fireEssence: 0.05, waterEssence: 0.05 },
        produce: { prismatic: 0.1 },
      },
    ],
  },
  {
    id: 'prismatic-spire',
    name: 'Prismatic Spire',
    blurb: 'It sheds a light that makes every hand quicker — while the light lasts.',
    category: 'arcane',
    cost: { stone: 250, steel: 100, manaCrystals: 80 },
    costGrowth: 1.45,
    requiresTech: 'prismatic-convergence',
    construct: true,
    effects: [
      { kind: 'jobOutputMult', amount: 0.25 },
      { kind: 'convert', consume: { prismatic: 0.05 }, produce: {} },
    ],
  },
  {
    id: 'arcane-foundry',
    name: 'Arcane Foundry',
    blurb: 'Steel from nothing but mana and nerve. The smelters have questions.',
    category: 'arcane',
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

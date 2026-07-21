// Tech tree (pure data). Research (produced by Scholars + the per-settler curiosity
// trickle) is spent to unlock nodes. Each node lists prerequisite tech ids and a
// human-readable `unlocks` list; the ACTUAL gating lives on the things gated
// (BuildingDef.requiresTech, and the efficiency techs read in systems/production.ts).
//
// The tree is a Civilization-inspired DAG progressing Stone → Bronze → Iron. Iron Working is
// the TOP of the tools tree; MAGIC is no longer a tech. Magic is DISCOVERY-driven (see
// systems/magic.ts): any of three independent paths — Mana Crystals from the mines (which the
// Crystallurgy tech first unlocks), a Sacred Grove (unlocked by the Naturalism tech), or enough
// Culture — sets the `magicDiscovered` flag that opens the Arcane Font + Animated Tools.
// Naturalism and Crystallurgy are the techs that feed the earth/crystal paths.
// The STONE tools are split into three PER-TOOL techs (Stone Axe / Hoe / Pick), each
// boosting only its own gather job; the global tool tiers — Bronze Working < Iron Working
// — stack on all three gather jobs atop them (TECH_BONUS + jobEfficiency, systems/production.ts).
// Techs may also cost MATERIALS (TechDef.resourceCost) — the stone tools consume stone.
//
// All research costs are on the doubled scale (2× the historical v0.1 values).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

import type { ResourceId } from './resources';

export type TechId =
  // Stone Age
  | 'stone-axe'
  | 'stone-hoe'
  | 'stone-pick'
  | 'archery'
  | 'pottery'
  | 'agriculture'
  | 'naturalism'
  | 'masonry'
  | 'writing'
  | 'calendar'
  | 'the-arts'
  // Bronze Age
  | 'mining'
  | 'crystallurgy'
  | 'the-wheel'
  | 'bronze-working'
  // Iron Age
  | 'iron-working';

export interface TechDef {
  id: TechId;
  name: string;
  blurb: string;
  /** Research cost (doubled scale). */
  cost: number;
  /** Optional MATERIAL cost, spent alongside the research cost. `research(techId)` requires
   *  AND spends both; refuses (no mutation) if either the research or any material is short. */
  resourceCost?: Partial<Record<ResourceId, number>>;
  /** Prerequisite tech ids that must already be unlocked. */
  requires?: TechId[];
  /** Human-readable list of what this node opens (for the UI). */
  unlocks: string[];
}

export const TECHS: TechDef[] = [
  // ---- STONE AGE ----
  // The old single "Stone Tools" is split into three per-tool techs, each boosting ONLY
  // its own gather job. Each consumes STONE as well as research (resourceCost).
  {
    id: 'stone-axe',
    name: 'Stone Axe',
    blurb: 'A knapped hand-axe for felling. Woodcutters produce +25%.',
    cost: 10,
    resourceCost: { stone: 10 },
    unlocks: ['+25% Woodcutter output'],
  },
  {
    id: 'stone-hoe',
    name: 'Stone Hoe',
    blurb: 'A stone-bladed hoe to work the soil. Farmers produce +25%.',
    cost: 10,
    resourceCost: { stone: 10 },
    unlocks: ['+25% Farmer output'],
  },
  {
    id: 'stone-pick',
    name: 'Stone Pick',
    blurb: 'A hafted stone pick for breaking rock. Stonecutters produce +25%.',
    cost: 10,
    resourceCost: { stone: 10 },
    unlocks: ['+25% Stonecutter output'],
  },
  {
    id: 'archery',
    name: 'Archery',
    blurb: 'Bow and arrow — the hunt begins. Unlocks the Hunter’s Lodge (food + furs).',
    cost: 15,
    unlocks: ["Hunter's Lodge (building)"],
  },
  {
    id: 'pottery',
    name: 'Pottery',
    blurb: 'Fired clay to store the harvest. Unlocks the Granary (raises the Food cap).',
    cost: 10,
    unlocks: ['Granary (building)'],
  },
  {
    id: 'agriculture',
    name: 'Agriculture',
    blurb: 'Tend the land instead of scavenging it. Farmers produce +50% food.',
    cost: 20,
    requires: ['stone-hoe'],
    unlocks: ['+50% Farmer output'],
  },
  {
    id: 'naturalism',
    name: 'Naturalism',
    blurb: 'Read the living land and tend it as one. Unlocks the Sacred Grove — a haven whose deep tending is one path to magic.',
    cost: 30,
    requires: ['agriculture'],
    unlocks: ['Sacred Grove (building)'],
  },
  {
    id: 'masonry',
    name: 'Masonry',
    blurb: 'Shape stone at scale. Unlocks the Quarry and the Stonecutter job.',
    cost: 30,
    requires: ['stone-pick'],
    unlocks: ['Quarry (building)', 'Stonecutter (job)'],
  },
  {
    id: 'writing',
    name: 'Writing',
    blurb: 'Set knowledge down in ink. Unlocks the Library (Scholar slots + passive research + research cap).',
    cost: 30,
    requires: ['pottery'],
    unlocks: ['Library (building)'],
  },
  {
    id: 'calendar',
    name: 'Calendar',
    blurb: 'Track the turning of the seasons. Reveals the current day, season, and year.',
    cost: 20,
    requires: ['pottery'],
    unlocks: ['The date (day · season · year)'],
  },
  {
    id: 'the-arts',
    name: 'The Arts',
    blurb: 'Song, story, and spectacle. Unlocks the Amphitheater — Culture (Bards) and happiness.',
    cost: 30,
    requires: ['pottery'],
    unlocks: ['Amphitheater (building)', 'Culture (resource)', 'Bard (job)'],
  },

  // ---- BRONZE AGE ----
  {
    id: 'mining',
    name: 'Mining',
    blurb: 'Sink shafts for ore. Unlocks the Mine (Miner job + passive iron).',
    cost: 50,
    requires: ['masonry'],
    unlocks: ['Mine (building)', 'Iron (resource)'],
  },
  {
    id: 'crystallurgy',
    name: 'Crystallurgy',
    blurb: 'Learn to read the glimmer in the deep rock. Mines also trickle Mana Crystals (+0.05/s) — one of the paths to discovering magic.',
    cost: 60,
    requires: ['mining'],
    unlocks: ['Mana Crystals from Mines', 'A path toward magic'],
  },
  {
    id: 'the-wheel',
    name: 'The Wheel',
    blurb: 'Carts, gears, and leverage. Unlocks the Workshop (boosts all worker output).',
    cost: 50,
    requires: ['pottery'],
    unlocks: ['Workshop (building)'],
  },
  {
    id: 'bronze-working',
    name: 'Bronze Working',
    blurb: 'Cast bronze tools — sharper than stone. Another +35% to the gather jobs.',
    cost: 70,
    requires: ['mining'],
    unlocks: ['+35% Woodcutter / Farmer / Stonecutter output'],
  },

  // ---- IRON AGE ----
  {
    id: 'iron-working',
    name: 'Iron Working',
    blurb: 'Forge iron tools — the finest yet. Consumes iron ore. The biggest +50% to the gather jobs; unlocks the Forge.',
    cost: 100,
    resourceCost: { iron: 25 }, // iron ore is smelted into the new tools
    requires: ['bronze-working'],
    unlocks: ['+50% Woodcutter / Farmer / Stonecutter output', 'Forge (building)'],
  },
];

export const TECH_IDS: TechId[] = TECHS.map((t) => t.id);

export const TECH_BY_ID: Record<TechId, TechDef> = Object.fromEntries(
  TECHS.map((t) => [t.id, t]),
) as Record<TechId, TechDef>;

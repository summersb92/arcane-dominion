// Tech tree (pure data). Research (produced by Scholars + the per-settler curiosity
// trickle) is spent to unlock nodes. Each node lists prerequisite tech ids and a
// human-readable `unlocks` list; the ACTUAL gating lives on the things gated
// (BuildingDef.requiresTech, and the efficiency techs read in systems/production.ts).
//
// The tree is a Civilization-inspired DAG progressing Stone → Bronze → Iron, with the
// MAGIC tier gated at the Iron tier: Awakening (opens Mana + the Arcane Font) now sits
// AFTER Iron Working, and Animation (the Animated Tools construct) follows Awakening.
// The three TOOL TIERS — Stone Tools < Bronze Working < Iron Working — stack on the
// gather jobs via TECH_BONUS + jobEfficiency (systems/production.ts).
//
// All research costs are on the doubled scale (2× the historical v0.1 values).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

export type TechId =
  // Stone Age
  | 'stone-tools'
  | 'pottery'
  | 'agriculture'
  | 'masonry'
  | 'writing'
  | 'calendar'
  // Bronze Age
  | 'mining'
  | 'the-wheel'
  | 'bronze-working'
  // Iron Age
  | 'iron-working'
  // Magic tier (gated at Iron)
  | 'awakening'
  | 'animation';

export interface TechDef {
  id: TechId;
  name: string;
  blurb: string;
  /** Research cost (doubled scale). */
  cost: number;
  /** Prerequisite tech ids that must already be unlocked. */
  requires?: TechId[];
  /** Human-readable list of what this node opens (for the UI). */
  unlocks: string[];
}

export const TECHS: TechDef[] = [
  // ---- STONE AGE ----
  {
    id: 'stone-tools',
    name: 'Stone Tools',
    blurb: 'Knapped flint and bone — better tools, more yield. Gather jobs produce +25%.',
    cost: 10,
    unlocks: ['+25% Woodcutter / Farmer / Stonecutter output'],
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
    requires: ['stone-tools'],
    unlocks: ['+50% Farmer output'],
  },
  {
    id: 'masonry',
    name: 'Masonry',
    blurb: 'Shape stone at scale. Unlocks the Quarry and the Stonecutter job.',
    cost: 30,
    requires: ['stone-tools'],
    unlocks: ['Quarry (building)', 'Stonecutter (job)'],
  },
  {
    id: 'writing',
    name: 'Writing',
    blurb: 'Set knowledge down in ink. Unlocks the Library (Scholar slots + passive research).',
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

  // ---- BRONZE AGE ----
  {
    id: 'mining',
    name: 'Mining',
    blurb: 'Sink shafts for ore and rock. Unlocks the Mine (more stone slots + output).',
    cost: 50,
    requires: ['masonry'],
    unlocks: ['Mine (building)'],
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
    blurb: 'Forge iron — the finest tools yet. The biggest +50% to the gather jobs; unlocks the Forge.',
    cost: 100,
    requires: ['bronze-working'],
    unlocks: ['+50% Woodcutter / Farmer / Stonecutter output', 'Forge (building)'],
  },

  // ---- MAGIC TIER (gated at Iron) ----
  {
    id: 'awakening',
    name: 'Awakening',
    blurb: 'With iron mastered, the settlement first touches magic. Unlocks Mana and the Arcane Font.',
    cost: 130,
    requires: ['iron-working'],
    unlocks: ['Mana (resource)', 'Arcane Font (building)'],
  },
  {
    id: 'animation',
    name: 'Animation',
    blurb: 'Bind spirits into tools. Unlocks Animated Tools — labour without settlers.',
    cost: 160,
    requires: ['awakening'],
    unlocks: ['Animated Tools (construct)'],
  },
];

export const TECH_IDS: TechId[] = TECHS.map((t) => t.id);

export const TECH_BY_ID: Record<TechId, TechDef> = Object.fromEntries(
  TECHS.map((t) => [t.id, t]),
) as Record<TechId, TechDef>;

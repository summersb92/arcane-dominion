// Tech tree (pure data). Research (produced by Scholars + the per-settler curiosity
// trickle) is spent to unlock nodes. Each node lists prerequisite tech ids and a
// human-readable `unlocks` list; the ACTUAL gating lives on the things gated
// (BuildingDef.requiresTech, and the efficiency techs read in systems/production.ts).
//
// The tree is a Civilization-inspired DAG progressing Stone → Iron → Steel → Industrial (Age of
// Steam: Steam Power → Precision Engineering → Industrialization, with Victoria-style goods chains —
// Tools, Engines, Furniture). Bronze Working was retired; Iron follows Mining directly. MAGIC is no longer a tech — it is DISCOVERY-driven (see
// systems/magic.ts): any of three independent paths — Mana Crystals from the mines (which the
// Crystallurgy tech first unlocks), a Sacred Grove (unlocked by the Naturalism tech), or enough
// Culture — sets the `magicDiscovered` flag. Once magic is discovered, MANA-COSTED magic techs
// open (TechDef.requiresFlag): a NATURE line in the Bronze era (Naturalism → Druidry →
// Seasonal Rites, plant/season mana) and a CRYSTAL line in the Iron era (Crystallurgy →
// Enchantment → Runecraft). Some knowledge/art techs cost CULTURE (TechDef.resourceCost).
// The STONE and STEEL tools are each split into three PER-TOOL techs (Axe / Hoe / Pick), each
// boosting only its own gather job; Iron Working is the one GLOBAL tier stacking on all gather
// jobs (TECH_BONUS + jobEfficiency, systems/production.ts). Techs may also cost MATERIALS
// (TechDef.resourceCost) — stone tools consume stone, iron/steel tools consume iron/steel.
//
// Research costs ramp STEEPLY: the first techs cost ~300 and each tier climbs toward ~3000 at
// Steelmaking (steel tools beyond). The research CAP scales via the Library (+100) and the
// Academy (+600) to hold those totals (STARTING.researchCap base 300).
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
  | 'masonry'
  | 'writing'
  | 'bookbinding'
  | 'compendia'
  | 'calendar'
  | 'the-arts'
  | 'mathematics'
  | 'construction'
  | 'philosophy'
  | 'mysticism'
  // Bronze Age (early metal + first NATURE mana)
  | 'mining'
  | 'coal-mining'
  | 'the-wheel'
  | 'naturalism'
  | 'druidry'
  | 'seasonal-rites'
  // Iron Age (mana from CRYSTALS)
  | 'iron-working'
  | 'crystallurgy'
  | 'enchantment'
  | 'runecraft'
  | 'steelmaking'
  | 'steel-axe'
  | 'steel-hoe'
  | 'steel-pick'
  | 'sanitation'
  // Industrial Era (Age of Steam)
  | 'steam-power'
  | 'precision-engineering'
  | 'industrialization';

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
  /** Run flag that must be true before this node is available (e.g. 'magicDiscovered' for the
   *  mana-costed magic techs). Mirrors BuildingDef.requiresFlag. */
  requiresFlag?: string;
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
    cost: 300,
    resourceCost: { stone: 10 },
    unlocks: ['+25% Woodcutter output'],
  },
  {
    id: 'stone-hoe',
    name: 'Stone Hoe',
    blurb: 'A stone-bladed hoe to work the soil. Farmers produce +25%.',
    cost: 300,
    resourceCost: { stone: 10 },
    unlocks: ['+25% Farmer output'],
  },
  {
    id: 'stone-pick',
    name: 'Stone Pick',
    blurb: 'A hafted stone pick for breaking rock. Stonecutters produce +25%.',
    cost: 300,
    resourceCost: { stone: 10 },
    unlocks: ['+25% Stonecutter output'],
  },
  {
    id: 'archery',
    name: 'Archery',
    blurb: 'Bow and arrow — the hunt begins. Unlocks the Hunter’s Lodge (food + furs).',
    cost: 350,
    unlocks: ["Hunter's Lodge (building)"],
  },
  {
    id: 'pottery',
    name: 'Pottery',
    blurb: 'Fired clay to store the harvest. Unlocks the Granary (raises the Food cap).',
    cost: 300,
    unlocks: ['Granary (building)'],
  },
  {
    id: 'agriculture',
    name: 'Agriculture',
    blurb: 'Tend the land instead of scavenging it. Farmers produce +50% food.',
    cost: 500,
    requires: ['stone-hoe'],
    unlocks: ['+50% Farmer output'],
  },
  {
    id: 'naturalism',
    name: 'Naturalism',
    blurb: 'Read the living land and tend it as one. Unlocks the Sacred Grove — a haven whose deep tending is one path to magic.',
    cost: 800,
    requires: ['agriculture'],
    unlocks: ['Sacred Grove (building)'],
  },
  // NATURE MAGIC (Bronze era) — mana from plants and seasons. Gated behind discovering magic.
  {
    id: 'druidry',
    name: 'Druidry',
    blurb: 'Draw mana from root, leaf, and turning season. Unlocks the Ley Grove (passive mana from the living land). Requires magic to have been discovered.',
    cost: 1500,
    resourceCost: { mana: 120 },
    requires: ['naturalism', 'mysticism'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Ley Grove (building)'],
  },
  {
    id: 'seasonal-rites',
    name: 'Seasonal Rites',
    blurb: 'Bind the calendar to the craft — solstice and harvest rites. Unlocks the Standing Stones (mana, food, and happiness).',
    cost: 2800,
    resourceCost: { mana: 150, culture: 100 },
    requires: ['druidry', 'calendar'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Standing Stones (building)'],
  },
  {
    id: 'masonry',
    name: 'Masonry',
    blurb: 'Shape stone at scale. Unlocks the Quarry and the Stonecutter job.',
    cost: 550,
    requires: ['stone-pick'],
    unlocks: ['Quarry (building)', 'Stonecutter (job)'],
  },
  {
    id: 'writing',
    name: 'Writing',
    blurb: 'Set knowledge down in ink. Unlocks the Library and the Academy (Scholar slots + passive research + research cap).',
    cost: 500,
    requires: ['pottery'],
    unlocks: ['Library (building)'],
  },
  {
    id: 'bookbinding',
    name: 'Bookbinding',
    blurb: 'Cure hides into parchment and bind books. Unlocks the Tannery (furs → parchment) and the Scriptorium (parchment + research → Books). HELD books raise research gained per settler.',
    cost: 900,
    resourceCost: { culture: 50 }, // a literate culture underwrites the craft
    requires: ['writing'],
    unlocks: ['Tannery + Scriptorium (buildings)', 'Parchment & Books (goods)', 'Scribe (job)'],
  },
  {
    id: 'compendia',
    name: 'Compendia',
    blurb: 'Compile great reference works. Unlocks the Archive (books + research → Compendiums). HELD compendiums raise the research cap and yield a little mana per settler.',
    cost: 2000,
    resourceCost: { culture: 150 },
    requires: ['bookbinding'],
    unlocks: ['Archive (building)', 'Compendiums (good)'],
  },
  {
    id: 'mathematics',
    name: 'Mathematics',
    blurb: 'Number, proof, and measure. Unlocks the Observatory — a science building (research cap + Scholar + passive research).',
    cost: 700,
    requires: ['writing', 'masonry'], // a classic combination tech
    unlocks: ['Observatory (building)'],
  },
  {
    id: 'construction',
    name: 'Construction',
    blurb: 'Arches, aqueducts, and load-bearing works. Unlocks the Aqueduct (more housing + happiness).',
    cost: 800,
    resourceCost: { stone: 50 },
    requires: ['masonry', 'the-wheel'],
    unlocks: ['Aqueduct (building)'],
  },
  {
    id: 'philosophy',
    name: 'Philosophy',
    blurb: 'Reasoned inquiry and civic thought. Unlocks the Forum — Culture, happiness, and Bard slots.',
    cost: 1000,
    resourceCost: { culture: 100 },
    requires: ['writing', 'the-arts'],
    unlocks: ['Forum (building)'],
  },
  {
    id: 'mysticism',
    name: 'Mysticism',
    blurb: 'Rites, omens, and the unseen. Unlocks the Shrine (Culture + happiness) and opens the road to nature magic.',
    cost: 700,
    resourceCost: { culture: 80 },
    requires: ['the-arts'],
    unlocks: ['Shrine (building)', 'Road to Druidry'],
  },
  {
    id: 'calendar',
    name: 'Calendar',
    blurb: 'Track the turning of the seasons. Reveals the current day, season, and year.',
    cost: 450,
    requires: ['pottery'],
    unlocks: ['The date (day · season · year)'],
  },
  {
    id: 'the-arts',
    name: 'The Arts',
    blurb: 'Song, story, and spectacle. Unlocks the Amphitheater — Culture (Bards) and happiness.',
    cost: 550,
    requires: ['pottery'],
    unlocks: ['Amphitheater (building)', 'Culture (resource)', 'Bard (job)'],
  },

  // ---- BRONZE AGE (early metal; NATURE mana arrives via Naturalism → Druidry) ----
  {
    id: 'mining',
    name: 'Mining',
    blurb: 'Sink shafts for ore. Unlocks the Mine (Miner job + passive iron).',
    cost: 900,
    requires: ['masonry'],
    unlocks: ['Mine (building)', 'Iron (resource)'],
  },
  {
    id: 'coal-mining',
    name: 'Coal Mining',
    blurb: 'Dig coal seams and char wood for fuel. Unlocks the Coal Mine (Coal Miner job) and the Charcoal Ground (burns wood into coal).',
    cost: 1400,
    requires: ['mining'],
    unlocks: ['Coal Mine (building)', 'Charcoal Ground (building)', 'Coal (resource)'],
  },
  {
    id: 'the-wheel',
    name: 'The Wheel',
    blurb: 'Carts, gears, and leverage. Unlocks the Workshop (boosts all worker output).',
    cost: 750,
    requires: ['pottery'],
    unlocks: ['Workshop (building)'],
  },

  // ---- IRON AGE (mana now arrives as CRYSTALS: Crystallurgy → Enchantment → Runecraft) ----
  {
    id: 'iron-working',
    name: 'Iron Working',
    blurb: 'Forge iron tools — the finest yet. Consumes iron ore. The one global +50% to every gather job; unlocks the Forge.',
    cost: 1800,
    resourceCost: { iron: 25 }, // iron ore is smelted into the new tools
    requires: ['mining'], // Bronze Working retired — Iron follows Mining directly
    unlocks: ['+50% to every gather job', 'Forge (building)'],
  },
  {
    id: 'crystallurgy',
    name: 'Crystallurgy',
    blurb: 'Learn to read the glimmer in the deep rock. Mines also trickle Mana Crystals (+0.05/s) — the iron-age path to discovering magic.',
    cost: 1300,
    requires: ['mining'],
    unlocks: ['Mana Crystals from Mines', 'A path toward magic'],
  },
  // CRYSTAL MAGIC (Iron era) — mana worked through crystals into constructs. Gated behind discovery.
  {
    id: 'enchantment',
    name: 'Enchantment',
    blurb: 'Bind mana into crystal and metal. Unlocks the Golem Works — a construct that mines iron + stone with no settlers, on mana upkeep.',
    cost: 2200,
    resourceCost: { mana: 120, manaCrystals: 30 },
    requires: ['crystallurgy'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Golem Works (construct)'],
  },
  {
    id: 'runecraft',
    name: 'Runecraft',
    blurb: 'Inscribe runes that work metal by themselves. Unlocks the Arcane Foundry — steel from raw mana, no coal or iron.',
    cost: 4200,
    resourceCost: { mana: 250, manaCrystals: 60 },
    requires: ['enchantment'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Arcane Foundry (construct)'],
  },
  {
    id: 'steelmaking',
    name: 'Steelmaking',
    blurb: 'Refine iron and timber into steel. Unlocks the Steelworks (Smelter job) — a converter that turns wood + iron into steel.',
    cost: 3000,
    requires: ['iron-working'],
    unlocks: ['Steelworks (building)', 'Steel (resource)'],
  },
  // Steel tools — split PER TOOL like the stone tools, each spending steel + research and boosting
  // only its own gather job (+65%). The top per-job tier and a steep steel sink.
  {
    id: 'steel-axe',
    name: 'Steel Axe',
    blurb: 'A keen steel axe head. Woodcutters produce +65% (atop iron). Consumes steel.',
    cost: 3500,
    resourceCost: { steel: 40 },
    requires: ['steelmaking'],
    unlocks: ['+65% Woodcutter output'],
  },
  {
    id: 'steel-hoe',
    name: 'Steel Hoe',
    blurb: 'A steel-bladed hoe. Farmers produce +65% (atop iron). Consumes steel.',
    cost: 3500,
    resourceCost: { steel: 40 },
    requires: ['steelmaking'],
    unlocks: ['+65% Farmer output'],
  },
  {
    id: 'steel-pick',
    name: 'Steel Pick',
    blurb: 'A tempered steel pick. Stonecutters produce +65% (atop iron). Consumes steel.',
    cost: 3500,
    resourceCost: { steel: 40 },
    requires: ['steelmaking'],
    unlocks: ['+65% Stonecutter output'],
  },
  {
    id: 'sanitation',
    name: 'Sanitation',
    blurb: 'Clean water and sewers for a crowded settlement. Unlocks the Sewers — a big lift to housing and happiness.',
    cost: 4000,
    resourceCost: { culture: 200 },
    requires: ['construction', 'compendia'],
    unlocks: ['Sewers (building)'],
  },

  // ---- INDUSTRIAL ERA (Age of Steam) ----
  {
    id: 'steam-power',
    name: 'Steam Power',
    blurb: 'Harness the boiler and piston. Unlocks the Toolworks (Machinist job) — iron + coal into Tools, the first industrial good.',
    cost: 4000,
    requires: ['steelmaking'],
    unlocks: ['Toolworks (building)', 'Tools (good)', 'Machinist (job)'],
  },
  {
    id: 'precision-engineering',
    name: 'Precision Engineering',
    blurb: 'Machined parts to fine tolerances. Consumes Tools. Unlocks the Engine Works (Engineer job) — steel + coal into Engines.',
    cost: 5500,
    resourceCost: { tools: 50 }, // research sink: precision work spends tools
    requires: ['steam-power'],
    unlocks: ['Engine Works (building)', 'Engines (good)', 'Engineer (job)'],
  },
  {
    id: 'industrialization',
    name: 'Industrialization',
    blurb: 'The factory system arrives. Consumes Engines. Unlocks the Factory (consumer Furniture) and the Steam Works (mechanization — spend goods for global output).',
    cost: 7500,
    resourceCost: { engines: 40 }, // research sink: retooling the economy spends engines
    requires: ['precision-engineering'],
    unlocks: ['Factory (building)', 'Furniture (good)', 'Steam Works (building)'],
  },
];

export const TECH_IDS: TechId[] = TECHS.map((t) => t.id);

export const TECH_BY_ID: Record<TechId, TechDef> = Object.fromEntries(
  TECHS.map((t) => [t.id, t]),
) as Record<TechId, TechDef>;

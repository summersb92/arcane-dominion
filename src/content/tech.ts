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
  | 'animal-husbandry'
  | 'irrigation'
  | 'wheelbarrows'
  | 'milling'
  // Governance (forms + policy slots — systems/government.ts)
  | 'code-of-laws'
  | 'monarchy'
  | 'civil-service'
  | 'republic'
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
  // Prismatic magic (the four elemental essences — systems/production.ts, content/resources.ts)
  | 'prismatic-theory'
  | 'aeromancy'
  | 'geomancy'
  | 'pyromancy'
  | 'hydromancy'
  | 'prismatic-convergence'
  | 'bloomery'
  | 'paper-making'
  | 'guild-charters'
  | 'optics'
  | 'blast-furnace'
  | 'steelmaking'
  | 'steel-axe'
  | 'steel-hoe'
  | 'steel-pick'
  | 'sanitation'
  // Industrial Era (Age of Steam)
  | 'steam-power'
  | 'precision-engineering'
  | 'industrialization'
  | 'fertilizer';

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
  // The Farm and the Woodcutter's Lodge need NO tech — a settlement can plant and fell from
  // the first day. The stone tools are the true openers: each boosts ONLY its own gather job
  // and consumes STONE as well as research. The Stone Hoe is the cheapest and opens the
  // farming branch (Agriculture and everything past it).
  {
    id: 'stone-hoe',
    name: 'Stone Hoe',
    blurb: 'A stone blade for the soil. The soil comes around.',
    cost: 100,
    resourceCost: { stone: 40 },
    unlocks: ['+25% Farmer output', 'Agriculture (tech)'],
  },
  {
    id: 'stone-axe',
    name: 'Stone Axe',
    blurb: 'A knapped edge for felling. The trees stop winning.',
    cost: 150,
    resourceCost: { stone: 40 },
    unlocks: ['+25% Woodcutter output'],
  },
  {
    id: 'stone-pick',
    name: 'Stone Pick',
    blurb: 'A hafted pick for breaking rock, and the patience to use it.',
    cost: 150,
    resourceCost: { stone: 40 },
    unlocks: ['+25% Stonecutter output'],
  },
  {
    id: 'archery',
    name: 'Archery',
    blurb: 'Bow and arrow — the hunt begins.',
    cost: 350,
    unlocks: ["Hunter's Lodge (building)"],
  },
  {
    id: 'animal-husbandry',
    name: 'Animal Husbandry',
    blurb: 'Keep the beasts instead of chasing them. They come to you, which is the whole idea.',
    cost: 100,
    requires: ['agriculture'],
    unlocks: ['Ranch (building)', '+25% Hunter output'],
  },
  {
    id: 'pottery',
    name: 'Pottery',
    blurb: 'Fired clay to store the harvest. The mice file a complaint.',
    cost: 300,
    unlocks: ['Granary (building)'],
  },
  // Agriculture is the gateway to the whole farming branch — Farm House, Irrigation,
  // Naturalism, Animal Husbandry and Milling all hang off it. Revealed by the Stone Hoe.
  {
    id: 'agriculture',
    name: 'Agriculture',
    blurb: 'Tend the land instead of scavenging it. The land, eventually, agrees.',
    cost: 150,
    requires: ['stone-hoe'],
    unlocks: ['Farm House (building)', 'The farming branch'],
  },
  {
    id: 'irrigation',
    name: 'Irrigation',
    blurb: 'Ditches and channels — the river is put to work.',
    cost: 700,
    requires: ['agriculture'],
    unlocks: ['+25% Farmer output'],
  },
  {
    id: 'naturalism',
    name: 'Naturalism',
    blurb: 'Read the living land and tend it as one. Something may notice the kindness.',
    cost: 800,
    requires: ['agriculture'],
    unlocks: ['Sacred Grove (building)'],
  },
  // NATURE MAGIC (Bronze era) — mana from plants and seasons. Gated behind discovering magic.
  {
    id: 'druidry',
    name: 'Druidry',
    blurb: 'Draw mana from root, leaf, and turning season.',
    cost: 1500,
    resourceCost: { mana: 120 },
    requires: ['naturalism', 'mysticism'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Ley Grove (construct)'],
  },
  {
    id: 'seasonal-rites',
    name: 'Seasonal Rites',
    blurb: 'Bind the calendar to the craft — solstice and harvest rites.',
    cost: 2800,
    resourceCost: { mana: 150, culture: 100 },
    requires: ['druidry', 'calendar'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Standing Stones (construct)'],
  },
  {
    id: 'masonry',
    name: 'Masonry',
    blurb: 'Shape stone at scale. Walls follow; so do arguments about walls.',
    cost: 550,
    requires: ['stone-pick'],
    unlocks: ['Quarry (building)', 'Stonecutter (job)'],
  },
  {
    id: 'writing',
    name: 'Writing',
    blurb: 'Set knowledge down in ink, where it cannot wander off.',
    cost: 500,
    requires: ['pottery'],
    unlocks: ['Library (building)', 'Academy (building)'],
  },
  {
    id: 'bookbinding',
    name: 'Bookbinding',
    blurb: 'Cure hides into parchment and bind the pages. Held Books sharpen every settler’s curiosity.',
    cost: 900,
    resourceCost: { culture: 50 }, // a literate culture underwrites the craft
    requires: ['writing'],
    unlocks: ['Tannery (building)', 'Scriptorium (building)', 'Parchment (good)', 'Books (good)', 'Scribe (job)'],
  },
  {
    id: 'compendia',
    name: 'Compendia',
    blurb: 'Compile the great reference works. Held Compendiums raise the research ceiling — and stir a little mana.',
    cost: 2000,
    resourceCost: { culture: 150 },
    requires: ['bookbinding'],
    unlocks: ['Archive (building)', 'Compendiums (good)'],
  },
  {
    id: 'mathematics',
    name: 'Mathematics',
    blurb: 'Number, proof, and measure. The heavens are next.',
    cost: 700,
    requires: ['writing', 'masonry'], // a classic combination tech
    unlocks: ['Observatory (building)'],
  },
  {
    id: 'construction',
    name: 'Construction',
    blurb: 'Arches and aqueducts — stone that holds itself up.',
    cost: 800,
    resourceCost: { stone: 50 },
    requires: ['masonry', 'the-wheel'],
    unlocks: ['Aqueduct (building) — waters the Farms', 'Apartments (building)'],
  },
  {
    id: 'philosophy',
    name: 'Philosophy',
    blurb: 'Reasoned inquiry and civic thought. Everyone has opinions now.',
    cost: 1000,
    resourceCost: { culture: 100 },
    requires: ['writing', 'the-arts'],
    unlocks: ['Forum (building)'],
  },
  {
    id: 'mysticism',
    name: 'Mysticism',
    blurb: 'Rites, omens, and the unseen. The road to nature magic opens.',
    cost: 700,
    resourceCost: { culture: 80 },
    requires: ['the-arts'],
    unlocks: ['Shrine (building)', 'Road to Druidry'],
  },
  {
    id: 'calendar',
    name: 'Calendar',
    blurb: 'Track the turning of the seasons. Time was passing anyway; now it has a name.',
    cost: 450,
    requires: ['pottery'],
    unlocks: ['The date (day · season · year)'],
  },
  {
    id: 'the-arts',
    name: 'The Arts',
    blurb: 'Song, story, and spectacle. The settlement learns to applaud.',
    cost: 550,
    requires: ['pottery'],
    unlocks: ['Amphitheater (building)', 'Culture (resource)', 'Bard (job)'],
  },
  {
    id: 'wheelbarrows',
    name: 'Wheelbarrows',
    blurb: 'One wheel, two handles, half the trips.',
    cost: 650,
    requires: ['the-wheel'],
    unlocks: ['+10% to every gather job'],
  },
  {
    id: 'milling',
    name: 'Milling',
    blurb: 'Gears, sails, and grinding stones — the wind is put on the payroll.',
    cost: 1100,
    requires: ['the-wheel', 'agriculture'],
    unlocks: ['Windmill (building) — +15% Farmer output per copy'],
  },
  {
    id: 'code-of-laws',
    name: 'Code of Laws',
    blurb: 'Rules written down, where everyone can argue about them properly.',
    cost: 1200,
    resourceCost: { culture: 100 },
    requires: ['philosophy'],
    unlocks: ['Government — enact policies', 'Council of Elders (form)', '+1 policy slot'],
  },
  {
    id: 'monarchy',
    name: 'Monarchy',
    blurb: 'One crown to settle every argument, mostly by ending it.',
    cost: 2000,
    resourceCost: { culture: 200 },
    requires: ['code-of-laws'],
    unlocks: ['Monarchy (form) — +5% worker output', '+1 policy slot'],
  },
  {
    id: 'civil-service',
    name: 'Civil Service',
    blurb: 'Clerks, ledgers, and stamps. The realm runs on paperwork now.',
    cost: 3200,
    resourceCost: { culture: 250 },
    requires: ['monarchy'],
    unlocks: ['+1 policy slot'],
  },
  {
    id: 'republic',
    name: 'Republic',
    blurb: 'The crown yields to the assembly. The arguing resumes, productively.',
    cost: 4500,
    resourceCost: { culture: 500 },
    requires: ['monarchy'],
    unlocks: ['Republic (form) — +25% Culture, +5 happiness', '+1 policy slot'],
  },
  {
    id: 'guild-charters',
    name: 'Guild Charters',
    blurb: 'The trades organize, print rules, and collect dues.',
    cost: 1600,
    resourceCost: { culture: 120 },
    requires: ['philosophy'],
    unlocks: ['Guild Hall (building)'],
  },
  {
    id: 'paper-making',
    name: 'Paper Making',
    blurb: 'Pulp, press, and patience — pages without the pasture.',
    cost: 1400,
    resourceCost: { culture: 60 },
    requires: ['bookbinding'],
    unlocks: ['Paper Mill (building)'],
  },
  {
    id: 'optics',
    name: 'Optics',
    blurb: 'Ground glass that makes the far near. Scholars see further.',
    cost: 2400,
    requires: ['mathematics'],
    unlocks: ['+25% Scholar output'],
  },

  // ---- BRONZE AGE (early metal; NATURE mana arrives via Naturalism → Druidry) ----
  {
    id: 'mining',
    name: 'Mining',
    blurb: 'Sink shafts for ore. Down is the new frontier.',
    cost: 900,
    requires: ['masonry'],
    unlocks: ['Mine (building)', 'Iron (resource)'],
  },
  {
    id: 'coal-mining',
    name: 'Coal Mining',
    blurb: 'Dig the black seams and char the surplus wood. Fuel, either way.',
    cost: 1400,
    requires: ['mining'],
    unlocks: ['Coal Mine (building)', 'Charcoal Ground (building)', 'Coal (resource)'],
  },
  {
    id: 'the-wheel',
    name: 'The Wheel',
    blurb: 'Carts, gears, and leverage. Suddenly everything rolls.',
    cost: 750,
    requires: ['pottery'],
    unlocks: ['Workshop (building)'],
  },

  // ---- IRON AGE (mana now arrives as CRYSTALS: Crystallurgy → Enchantment → Runecraft) ----
  {
    id: 'iron-working',
    name: 'Iron Working',
    blurb: 'Iron takes an edge that stone never dreamt of. Every trade feels it.',
    cost: 1800,
    resourceCost: { iron: 25 }, // iron ore is smelted into the new tools
    requires: ['mining'], // Bronze Working retired — Iron follows Mining directly
    unlocks: ['+50% to every gather job', 'Forge (building)'],
  },
  // ---- PRISMATIC MAGIC — split light into four elements, each with its own economy. ----
  {
    id: 'prismatic-theory',
    name: 'Prismatic Theory',
    blurb: 'Raw magic, split through a crystal, resolves into four stubborn tempers.',
    cost: 3000,
    resourceCost: { mana: 200, manaCrystals: 50 },
    requires: ['enchantment'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['The four elemental disciplines'],
  },
  {
    id: 'aeromancy',
    name: 'Aeromancy',
    blurb: 'Coax the restless air. It agrees, on its own schedule.',
    cost: 3400,
    resourceCost: { mana: 150 },
    requires: ['prismatic-theory'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Wind Spire (construct)', 'Storm Sails (construct)', 'Air empowers Woodcutters'],
  },
  {
    id: 'geomancy',
    name: 'Geomancy',
    blurb: 'The bones of the hill keep patient time. Learn to ask politely.',
    cost: 3400,
    resourceCost: { mana: 150 },
    requires: ['prismatic-theory'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Deep Cairn (construct)', 'Stone Titan (construct)', 'Earth empowers Miners'],
  },
  {
    id: 'pyromancy',
    name: 'Pyromancy',
    blurb: 'Fire is the most willing element and the least careful.',
    cost: 3400,
    resourceCost: { mana: 150 },
    requires: ['prismatic-theory'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Ember Forge (construct)', 'Flame Wardens (construct)', 'Fire empowers Stonecutters'],
  },
  {
    id: 'hydromancy',
    name: 'Hydromancy',
    blurb: 'Water remembers every shape it has been asked to hold.',
    cost: 3400,
    resourceCost: { mana: 150 },
    requires: ['prismatic-theory'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Tide Basin (construct)', 'Rain Engine (construct)', 'Water empowers Farmers'],
  },
  {
    id: 'prismatic-convergence',
    name: 'Prismatic Convergence',
    blurb: 'Four tempers, one light. The prism is finally read backwards.',
    cost: 8000,
    resourceCost: { airEssence: 40, earthEssence: 40, fireEssence: 40, waterEssence: 40 },
    requires: ['aeromancy', 'geomancy', 'pyromancy', 'hydromancy'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Prism Nexus (construct)', 'Prismatic Spire (construct)', 'Prismatic Mana'],
  },
  {
    id: 'bloomery',
    name: 'Bloomery',
    blurb: 'A clay furnace that coaxes the ore. It gives up its iron more willingly.',
    cost: 1250,
    requires: ['mining'],
    unlocks: ['+25% Miner output'],
  },
  {
    id: 'blast-furnace',
    name: 'Blast Furnace',
    blurb: 'A furnace that never sleeps and barely needs minding.',
    cost: 2400,
    requires: ['iron-working', 'coal-mining'],
    unlocks: ['Blast Furnace (building)'],
  },
  {
    id: 'crystallurgy',
    name: 'Crystallurgy',
    blurb: 'Learn to read the glimmer in the deep rock — one path toward magic.',
    cost: 1300,
    requires: ['mining'],
    unlocks: ['Mana Crystals from Mines', 'A path toward magic'],
  },
  // CRYSTAL MAGIC (Iron era) — mana worked through crystals into constructs. Gated behind discovery.
  {
    id: 'enchantment',
    name: 'Enchantment',
    blurb: 'Bind mana into crystal and metal, and set it to work.',
    cost: 2200,
    resourceCost: { mana: 120, manaCrystals: 30 },
    requires: ['crystallurgy'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Golem Works (construct)'],
  },
  {
    id: 'runecraft',
    name: 'Runecraft',
    blurb: 'Inscribe runes that work metal by themselves.',
    cost: 4200,
    resourceCost: { mana: 250, manaCrystals: 60 },
    requires: ['enchantment'],
    requiresFlag: 'magicDiscovered',
    unlocks: ['Arcane Foundry (construct)'],
  },
  {
    id: 'steelmaking',
    name: 'Steelmaking',
    blurb: 'Refine iron into steel — stronger than the sum of its fires.',
    cost: 3000,
    requires: ['iron-working'],
    unlocks: ['Steelworks (building)', 'Steel (resource)'],
  },
  // Steel tools — split PER TOOL like the stone tools, each spending steel + research and boosting
  // only its own gather job (+65%). The top per-job tier and a steep steel sink.
  {
    id: 'steel-axe',
    name: 'Steel Axe',
    blurb: 'A keen steel axe head. The forest learns respect.',
    cost: 3500,
    resourceCost: { steel: 40 },
    requires: ['steelmaking'],
    unlocks: ['+65% Woodcutter output'],
  },
  {
    id: 'steel-hoe',
    name: 'Steel Hoe',
    blurb: 'A steel-bladed hoe, sharper than the soil deserves.',
    cost: 3500,
    resourceCost: { steel: 40 },
    requires: ['steelmaking'],
    unlocks: ['+65% Farmer output'],
  },
  {
    id: 'steel-pick',
    name: 'Steel Pick',
    blurb: 'A tempered steel pick. The rock loses the argument.',
    cost: 3500,
    resourceCost: { steel: 40 },
    requires: ['steelmaking'],
    unlocks: ['+65% Stonecutter output'],
  },
  {
    id: 'sanitation',
    name: 'Sanitation',
    blurb: 'Clean water in, everything else out. The settlement exhales.',
    cost: 4000,
    resourceCost: { culture: 200 },
    requires: ['construction', 'compendia'],
    unlocks: ['Mansion (building)'],
  },

  // ---- INDUSTRIAL ERA (Age of Steam) ----
  {
    id: 'steam-power',
    name: 'Steam Power',
    blurb: 'Harness the boiler and piston. The first industrial good follows.',
    cost: 4000,
    requires: ['steelmaking'],
    unlocks: ['Toolworks (building)', 'Tools (good)', 'Machinist (job)'],
  },
  {
    id: 'precision-engineering',
    name: 'Precision Engineering',
    blurb: 'Machined parts to tolerances the eye cannot argue with.',
    cost: 5500,
    resourceCost: { tools: 50 }, // research sink: precision work spends tools
    requires: ['steam-power'],
    unlocks: ['Engine Works (building)', 'Engines (good)', 'Engineer (job)'],
  },
  {
    id: 'industrialization',
    name: 'Industrialization',
    blurb: 'The factory system arrives. The settlement will never be quiet again.',
    cost: 7500,
    resourceCost: { engines: 40 }, // research sink: retooling the economy spends engines
    requires: ['precision-engineering'],
    unlocks: ['Factory (building)', 'Furniture (good)', 'Steam Works (building)'],
  },
  {
    id: 'fertilizer',
    name: 'Fertilizer',
    blurb: 'Chemistry meets the field. The field yields.',
    cost: 5000,
    requires: ['industrialization'],
    unlocks: ['+50% Farmer output'],
  },
];

export const TECH_IDS: TechId[] = TECHS.map((t) => t.id);

export const TECH_BY_ID: Record<TechId, TechDef> = Object.fromEntries(
  TECHS.map((t) => [t.id, t]),
) as Record<TechId, TechDef>;

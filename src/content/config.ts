// Gameplay tuning constants (data, not code). Balance lives here; systems read it.
// Framework-agnostic — imported by the engine and the CLI. No DOM, no Svelte.

export const OFFLINE_CAP_MS = 12 * 60 * 60 * 1000; // 12h offline catch-up cap
export const AUTOSAVE_INTERVAL_MS = 30_000;

/** Fresh-game bootstrap: a handful of citizens' worth of food, empty everything else. */
export const STARTING = {
  wood: 0,
  food: 20,
  stone: 0,
  iron: 0,
  coal: 0,
  steel: 0,
  tools: 0,
  engines: 0,
  furniture: 0,
  parchment: 0,
  books: 0,
  compendiums: 0,
  furs: 0,
  alchemical: 0,
  manaCrystals: 0,
  airEssence: 0,
  earthEssence: 0,
  fireEssence: 0,
  waterEssence: 0,
  prismatic: 0,
  gold: 0,
  mana: 0,
  research: 0,
  culture: 0,
  /** BASE storage cap for each mundane material + furs + mana crystals (raised by Storehouses/Granary).
   *  Wood and stone start at a roomier 500 so the opening hand-gathering stretch isn't spent
   *  bumping the ceiling; everything later starts at 200. */
  woodCap: 500,
  /** FOOD starts far higher than anything else. It is the one store whose ceiling decides
   *  whether the settlement lives: a small larder means a good season is thrown away and the
   *  next bad one empties it, which is how early settlements were starving. A deep barn lets
   *  a surplus actually bank into a buffer. */
  foodCap: 3000,
  stoneCap: 500,
  ironCap: 200,
  coalCap: 200,
  steelCap: 200,
  toolsCap: 200,
  enginesCap: 200,
  furnitureCap: 200,
  parchmentCap: 200,
  booksCap: 200,
  compendiumsCap: 200,
  fursCap: 200,
  alchemicalCap: 200,
  manaCrystalsCap: 200,
  /** The four elemental essences are SCARCE — a smaller base cap than the materials. */
  essenceCap: 100,
  /** BASE culture cap. Culture is capped like everything else now; the civic works that
   *  produce it also raise the ceiling (see systems/caps.ts cultureCap). */
  cultureCap: 100,
  /** BASE research cap. Research is capped — this base holds the first (≈300) techs; pricier
   *  techs require science buildings (Library +50 — doubled by the Decimal System — and
   *  Academy +600 each) to raise the ceiling
   *  toward the ~3000 needed by Steelmaking. See systems/caps.ts effectiveCap. */
  researchCap: 300,
  popCap: 0, // no housing yet — build a House to admit citizens
};

/** Happiness (systems/happiness.ts). Happiness is a 0..100 derived read model that gates
 *  population GROWTH: below `growthThreshold` the settlement won't grow. It starts at
 *  `base`, drops with crowding, and rises with assigned Entertainers + luxury buildings. */
export const HAPPINESS = {
  base: 100, // a fresh, empty camp is fully content
  freeBuffer: 5, // the first 5 citizens cost NO happiness — each one past 5 costs 2
  crowdingPerCitizen: 2, // −2 happiness per citizen ABOVE the free buffer
  cultureWorkerBonus: 5, // + morale per assigned Entertainer (the Amphitheater's job)
  growthThreshold: 50, // growth pauses while happiness is below this
  /** LUXURY goods scale with the settlement. The per-point costs below are quoted for a
   *  settlement of this size; a bigger town needs proportionally more of a luxury to feel
   *  the same lift, so a wardrobe that delighted a hamlet barely registers in a city.
   *  At or below this population nothing is scaled up. */
  luxuryPopBaseline: 10,
  /** Furs are a LUXURY: held furs raise happiness — +1 per this many furs held… */
  fursPerHappiness: 10,
  /** …capped at this much total happiness from furs (accumulating more is future trade). */
  fursHappinessMax: 15,
  /** Furniture is a stronger (industrial-era) LUXURY: +1 happiness per this many held… */
  furniturePerHappiness: 5,
  /** …capped at this much total happiness from furniture. */
  furnitureHappinessMax: 25,
};

/** Time / calendar. Days tick at daySeconds each; daysPerSeason days make a season; the
 *  four seasons make a year. Time always advances, but the current day/season is HIDDEN
 *  until the Calendar tech is researched. */
export const CALENDAR = {
  daySeconds: 2, // real/sim seconds per in-game day
  daysPerSeason: 100, // days in a season
  seasons: ['Spring', 'Summer', 'Autumn', 'Winter'] as const, // 4 seasons → a year
};

/** SEASONS bite (systems/weather.ts). Spring is the growing season and lifts EVERY food
 *  source; Winter starves the fields but not the woods — Hunters are exempt, which is the
 *  whole reason to keep a Lodge staffed through the cold. Summer and Autumn are neutral. */
export const SEASON = {
  /** × to all food production in Spring. */
  springFoodMult: 1.5,
  /** × to NON-HUNTER food production in Winter (Hunters keep their full yield). */
  winterFoodMult: 0.5,
};

/** WEATHER (systems/weather.ts) — a short-lived swing on top of the season, derived
 *  deterministically from the seed and the day, so it survives save/load and offline
 *  catch-up without being stored. Most spells are ordinary; the extremes are rare and
 *  worth a chronicle line. Later: elemental-affinity policies that bias the roll. */
export const WEATHER = {
  /** How many in-game DAYS one spell of weather lasts (a season is 100 days). */
  periodDays: 20,
  /** The possible swings, as a ± fraction of food production, in 5% increments. */
  steps: [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15],
  /** Relative likelihood of each step, aligned to `steps` — fair weather dominates. */
  weights: [1, 2, 4, 20, 4, 2, 1],
  /** A swing at least this large is a MAJOR event: it earns a chronicle line. */
  majorThreshold: 0.15,
};

/** Once a resource's storage cap reaches this, hand-gathering that resource is RETIRED
 *  (the manual button turns off) — by then jobs/constructs out-produce a click, so the
 *  bootstrap is no longer needed. Per-resource: each retires as its own cap crosses this.
 *
 *  Held at ~8× the food larder's starting size, the ratio this was originally calibrated at.
 *  It matters most for FOOD: press-and-hold gathers faster than a Farmer works, which makes
 *  it a settlement's best emergency answer to a famine. Retiring that the moment someone
 *  raises their first barn would take the lever away exactly when it is needed. */
export const MANUAL_GATHER_RETIRE_CAP = 12000;

/** Population dynamics (systems/population.ts). Deterministic, tick-driven. */
export const POPULATION = {
  /** Food each citizen consumes per second, regardless of job. Deliberately close to what an
   *  idle citizen forages (4.2) and to a Farmer's output (6): an unemployed citizen barely
   *  feeds themself, and only Farmers build a real surplus. */
  baseFoodUpkeep: 4,
  /** Research each citizen passively generates per second — a curiosity trickle that
   *  begins with your very first citizen, so Research (the tech currency) accrues from
   *  the start, before any Scholars. Scholars add more on top. */
  researchPerCitizen: 0.02,
  /** Mana the settlement can HOLD per citizen. Mana has no warehouse — it is carried in
   *  people, so the pool is only as deep as the population. With nobody home it is zero. */
  manaCapPerCitizen: 1,
  /** Mana each citizen draws per second ONCE the Meditation tech is researched — the first
   *  mana income that doesn't depend on a building. Small on purpose; Shrines still carry it. */
  manaPerCitizen: 0.005,
  /** Food each IDLE (unassigned) citizen forages per second AT FULL HAPPINESS. The actual
   *  yield scales with contentment — a settlement at 50 happiness forages at half rate — so
   *  keeping people happy is itself a food policy (systems/production.ts idleFoodPerCitizen
   *  × happiness/100). */
  idleFoodPerCitizen: 4.2,
  /** A full granary is itself a reason to grow. While the food store sits at or above this
   *  FRACTION of its cap, the settlement keeps growing even on a negative net rate — it is
   *  eating into a surplus it already banked, which is what a surplus is for. Below it,
   *  growth needs a non-negative rate again. */
  growthReserveFraction: 0.25,
  /** Seconds of sustained food surplus (and free housing) to gain one citizen. */
  growthIntervalSec: 8,
  /** Seconds of sustained starvation before one citizen is lost. */
  starveIntervalSec: 12,
};

/** Knowledge chain (furs → parchment → books → compendiums). HELD books/compendiums feed back
 *  into the economy — books raise research gained per citizen; compendiums raise the research cap
 *  and yield a little mana per citizen. Each bonus scales with the held count, up to a cap. */
export const KNOWLEDGE = {
  /** + research/citizen/s per BOOK held… */
  booksResearchPerPop: 0.005,
  /** …capped at this much extra research/citizen/s (reached at ~50 books). */
  booksResearchPerPopMax: 0.25,
  /** + research CAP per COMPENDIUM held… */
  compendiumResearchCap: 15,
  /** …capped at this much extra research cap (reached at 200 compendiums). */
  compendiumResearchCapMax: 3000,
  /** + mana/citizen/s per COMPENDIUM held… */
  compendiumManaPerPop: 0.003,
  /** …capped at this much extra mana/citizen/s (reached at 100 compendiums). */
  compendiumManaPerPopMax: 0.3,
};

/** Prismatic magic (the four elemental essences + the light they fuse into).
 *  Each HELD essence empowers one matching job — Air → Woodcutter, Earth → Miner,
 *  Fire → Stonecutter (fire-setting cracks rock), Water → Farmer — scaling with the amount
 *  held, up to a ceiling. The essences are also burned by elemental constructs, spent on
 *  advanced techs, and fused into Prismatic Mana at the Prism Nexus. */
export const PRISMATIC = {
  /** + fraction to the matching job's output per unit of essence HELD… */
  essenceBoostPerUnit: 0.004,
  /** …capped at this much (reached at 125 essence held). */
  essenceBoostMax: 0.5,
};

/** Education (systems/education.ts). An Arcanum raises ALL magical yield; a CURRICULUM
 *  commits the faculty to one discipline — that element gains a lot while the rest give a
 *  little back, so specializing is the point. */
export const EDUCATION = {
  /** × to the FOCUSED discipline's yield. */
  focusBonus: 0.5,
  /** × to every UNFOCUSED discipline's yield (a real cost — you must choose). */
  unfocusedPenalty: 0.85,
};

/** Elemental OPPOSITION (systems/education.ts). Air opposes Earth; Fire opposes Water. A
 *  stronger opposing element drowns out the weaker one's empowerment — but ASYMPTOTICALLY:
 *  the factor is 1 − maxSuppression × diff/(diff + scale), where diff is how far the
 *  opposing essence EXCEEDS this one. Equal or ahead → no penalty at all (specialists are
 *  safe); far behind → approaches (1 − maxSuppression) without ever reaching zero. */
export const OPPOSITION = {
  /** The deepest possible suppression — 0.9 leaves a 10% floor, so it never fully cancels. */
  maxSuppression: 0.9,
  /** How many units of DIFFERENCE cost half the maximum suppression. */
  scale: 60,
};

/** Efficiency multipliers granted by tech (systems/production.ts).
 *  STONE and STEEL tools are split into THREE per-tool techs each, boosting ONLY their own gather
 *  job: (Stone/Steel) Axe → Woodcutter, Hoe → Farmer, Pick → Stonecutter. Iron Working is the one
 *  GLOBAL tool tier, stacking on all gather jobs (incl. Miners). Bronze Working was retired.
 *  Agriculture and Animal Husbandry are ENABLERS — they open the Farm and the Ranch and
 *  multiply nothing. */
export const TECH_BONUS = {
  /** Per-tool STONE techs — each boosts a single gather job by +25%. */
  stoneAxe: 1.25, // Woodcutter only
  stoneHoe: 1.25, // Farmer only
  stonePick: 1.25, // Stonecutter only
  /** Global tool tier — stacks on all gather jobs. */
  ironWorking: 1.5, // ×, the one global tool tier
  /** Per-tool STEEL techs — the top per-job tier (researched with steel), stack atop iron. */
  steelAxe: 1.65, // Woodcutter only
  steelHoe: 1.65, // Farmer only
  steelPick: 1.65, // Stonecutter only
  /** Mini-step boosts — small per-job wins that fill the cost-ladder gaps. */
  irrigation: 1.25, // Farmer only
  wheelbarrows: 1.1, // × all gather jobs
  bloomery: 1.25, // Miner only
  optics: 1.25, // Scholar only
  fertilizer: 1.5, // Farmer only (industrial era)
};

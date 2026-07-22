// Gameplay tuning constants (data, not code). Balance lives here; systems read it.
// Framework-agnostic — imported by the engine and the CLI. No DOM, no Svelte.

export const OFFLINE_CAP_MS = 12 * 60 * 60 * 1000; // 12h offline catch-up cap
export const AUTOSAVE_INTERVAL_MS = 30_000;

/** Fresh-game bootstrap: a handful of settlers' worth of food, empty everything else. */
export const STARTING = {
  wood: 0,
  food: 20,
  stone: 0,
  iron: 0,
  coal: 0,
  steel: 0,
  furs: 0,
  manaCrystals: 0,
  mana: 0,
  research: 0,
  culture: 0,
  /** BASE storage cap for each mundane material + furs + mana crystals (raised by Storehouses/Granary). */
  woodCap: 200,
  foodCap: 200,
  stoneCap: 200,
  ironCap: 200,
  coalCap: 200,
  steelCap: 200,
  fursCap: 200,
  manaCrystalsCap: 200,
  /** BASE research cap. Research is no longer uncapped — this small base holds the early
   *  Stone-Age techs; pricier techs require science buildings (Scholar's Study / Library,
   *  which add `researchCap` effects). See systems/caps.ts effectiveCap. */
  researchCap: 50,
  popCap: 0, // no housing yet — build a House to admit settlers
};

/** Happiness (systems/happiness.ts). Happiness is a 0..100 derived read model that gates
 *  population GROWTH: below `growthThreshold` the settlement won't grow. It starts at
 *  `base`, drops with crowding, and rises with Culture workers (Bards) + luxury buildings. */
export const HAPPINESS = {
  base: 100, // a fresh, empty camp is fully content
  freeBuffer: 6, // the first N settlers cost NO happiness — crowding only bites beyond this
  crowdingPerSettler: 2, // −2 happiness per settler ABOVE the free buffer
  cultureWorkerBonus: 4, // + per assigned Bard (Culture job)
  growthThreshold: 50, // growth pauses while happiness is below this
  /** Furs are a LUXURY: held furs raise happiness — +1 per this many furs held… */
  fursPerHappiness: 10,
  /** …capped at this much total happiness from furs (accumulating more is future trade). */
  fursHappinessMax: 15,
};

/** Time / calendar. Days tick at daySeconds each; daysPerSeason days make a season; the
 *  four seasons make a year. Time always advances, but the current day/season is HIDDEN
 *  until the Calendar tech is researched. */
export const CALENDAR = {
  daySeconds: 2, // real/sim seconds per in-game day
  daysPerSeason: 100, // days in a season
  seasons: ['Spring', 'Summer', 'Autumn', 'Winter'] as const, // 4 seasons → a year
};

/** Once a resource's storage cap reaches this, hand-gathering that resource is RETIRED
 *  (the manual button turns off) — by then jobs/constructs out-produce a click, so the
 *  bootstrap is no longer needed. Per-resource: each retires as its own cap crosses this. */
export const MANUAL_GATHER_RETIRE_CAP = 1000;

/** Population dynamics (systems/population.ts). Deterministic, tick-driven. */
export const POPULATION = {
  /** Food each settler consumes per second, regardless of job. */
  baseFoodUpkeep: 0.05,
  /** Research each settler passively generates per second — a curiosity trickle that
   *  begins with your very first settler, so Research (the tech currency) accrues from
   *  the start, before any Scholars. Scholars add more on top. */
  researchPerSettler: 0.02,
  /** Food each IDLE (unassigned) settler forages for themselves per second — a small
   *  subsistence trickle that softens their upkeep. Below baseFoodUpkeep, so idle folk
   *  are still a slight net drain; Farmers/Hunters are needed to truly grow. */
  idleFoodPerSettler: 0.03,
  /** Seconds of sustained food surplus (and free housing) to gain one settler. */
  growthIntervalSec: 8,
  /** Seconds of sustained starvation before one settler is lost. */
  starveIntervalSec: 12,
};

/** Efficiency multipliers granted by tech (systems/production.ts).
 *  STONE TOOLS are now split into THREE per-tool techs, each boosting ONLY its own gather
 *  job: Stone Axe → Woodcutter, Stone Hoe → Farmer, Stone Pick → Stonecutter. The GLOBAL
 *  tool tiers (Bronze Working < Iron Working) still stack on ALL three gather jobs, atop
 *  whichever stone tools are owned. Agriculture is a crop bonus that applies to the Farmer only. */
export const TECH_BONUS = {
  /** Per-tool stone techs — each boosts a single gather job by +25%. */
  stoneAxe: 1.25, // Woodcutter only
  stoneHoe: 1.25, // Farmer only
  stonePick: 1.25, // Stonecutter only
  /** Global tool tiers — stack on all three gather jobs. */
  bronzeWorking: 1.35, // ×, stacks atop the stone tools
  ironWorking: 1.5, // ×, stacks atop bronze
  steelTools: 1.65, // ×, the top tool-tier bump (researched with steel), stacks atop iron
  /** Crop tech — Farmer output only. */
  agriculture: 1.5, // +50% Farmer food
};

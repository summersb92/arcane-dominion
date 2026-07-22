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
  tools: 0,
  engines: 0,
  furniture: 0,
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
  toolsCap: 200,
  enginesCap: 200,
  furnitureCap: 200,
  fursCap: 200,
  manaCrystalsCap: 200,
  /** BASE research cap. Research is capped — this base holds the first (≈300) techs; pricier
   *  techs require science buildings (Library +100, Academy +600 each) to raise the ceiling
   *  toward the ~3000 needed by Steelmaking. See systems/caps.ts effectiveCap. */
  researchCap: 300,
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
  researchPerSettler: 0.1,
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
 *  STONE and STEEL tools are split into THREE per-tool techs each, boosting ONLY their own gather
 *  job: (Stone/Steel) Axe → Woodcutter, Hoe → Farmer, Pick → Stonecutter. Iron Working is the one
 *  GLOBAL tool tier, stacking on all gather jobs (incl. Miners). Bronze Working was retired.
 *  Agriculture is a crop bonus that applies to the Farmer only. */
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
  /** Crop tech — Farmer output only. */
  agriculture: 1.5, // +50% Farmer food
};

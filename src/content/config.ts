// Gameplay tuning constants (data, not code). Balance lives here; systems read it.
// Framework-agnostic — imported by the engine and the CLI. No DOM, no Svelte.

export const OFFLINE_CAP_MS = 12 * 60 * 60 * 1000; // 12h offline catch-up cap
export const AUTOSAVE_INTERVAL_MS = 30_000;

/** Fresh-game bootstrap: a handful of settlers' worth of food, empty everything else. */
export const STARTING = {
  wood: 0,
  food: 20,
  stone: 0,
  mana: 0,
  research: 0,
  /** BASE storage cap for each mundane material (raised by Storehouses). */
  woodCap: 50,
  foodCap: 50,
  stoneCap: 50,
  popCap: 0, // no housing yet — build a Hut to admit settlers
};

/** Population dynamics (systems/population.ts). Deterministic, tick-driven. */
export const POPULATION = {
  /** Food each settler consumes per second, regardless of job. */
  baseFoodUpkeep: 0.05,
  /** Seconds of sustained food surplus (and free housing) to gain one settler. */
  growthIntervalSec: 8,
  /** Seconds of sustained starvation before one settler is lost. */
  starveIntervalSec: 12,
};

/** Efficiency multipliers granted by tech (systems/production.ts). */
export const TECH_BONUS = {
  woodworking: 1.5, // Woodcutter output ×
  agriculture: 1.5, // Forager output ×
};

// Weather & seasons — the environmental multiplier on FOOD production.
//
// Two layers stack:
//   * SEASON  — Spring lifts every food source; Winter halves everything EXCEPT the
//     Hunter (the woods keep giving when the fields don't). Summer/Autumn are neutral.
//   * WEATHER — a short spell (WEATHER.periodDays long) worth ±0..15% in 5% steps, most
//     of them fair. It applies to every food source, Hunters included.
//
// Weather is DERIVED, never stored: a pure hash of (seed, period index) picks the spell.
// That keeps it deterministic across save/load, offline catch-up, and the CLI without a
// save-format field, and means two players on the same seed see the same summer.
//
// Pure engine — no DOM, no Svelte.

import { SEASON, WEATHER } from '../../content/config';
import { seedFrom } from '../rng';
import type { GameState } from '../state';
import { dateAt } from './calendar';

export interface WeatherInfo {
  /** Index of the current spell — increments every WEATHER.periodDays days. */
  period: number;
  /** The swing as a signed fraction, e.g. -0.1 for a 10% shortfall. 0 = fair. */
  swing: number;
  /** Human label for the spell ("Fair", "Blight", "Bounty"…). */
  label: string;
  /** True when this spell is one of the extremes — worth a chronicle line. */
  major: boolean;
}

/** Pick this period's swing from the weighted table. Deterministic in (seed, period). */
function swingFor(seed: number, period: number): number {
  const { steps, weights } = WEATHER;
  const total = weights.reduce((s, w) => s + w, 0);
  // seedFrom gives a well-mixed 32-bit hash; map it into [0, total).
  const roll = (seedFrom(`${seed >>> 0}:w:${period}`) / 4294967296) * total;
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    acc += weights[i];
    if (roll < acc) return steps[i];
  }
  return 0;
}

/** Name a spell by its swing, so the header reads as weather rather than a percentage. */
function labelFor(swing: number): string {
  if (swing >= 0.15) return 'Bountiful';
  if (swing >= 0.1) return 'Fine';
  if (swing >= 0.05) return 'Mild';
  if (swing <= -0.15) return 'Blighted';
  if (swing <= -0.1) return 'Harsh';
  if (swing <= -0.05) return 'Poor';
  return 'Fair';
}

/** The weather spell covering an arbitrary point on the playtime clock. Split out so the
 *  season/weather watcher can compare two moments without re-deriving the date twice. */
export function weatherAt(seed: number, playtimeSeconds: number): WeatherInfo {
  const period = Math.floor(dateAt(playtimeSeconds).totalDays / WEATHER.periodDays);
  const swing = swingFor(seed, period);
  return {
    period,
    swing,
    label: labelFor(swing),
    major: Math.abs(swing) >= WEATHER.majorThreshold,
  };
}

/** The weather right now. */
export function weather(state: GameState): WeatherInfo {
  return weatherAt(state.seed, state.playtime);
}

/** The SEASON's multiplier on one food source. Hunters are exempt from Winter only —
 *  Spring's bounty still reaches them. */
export function seasonFoodMult(state: GameState, hunter = false): number {
  const season = dateAt(state.playtime).seasonIndex;
  if (season === 0) return SEASON.springFoodMult; // Spring
  if (season === 3) return hunter ? 1 : SEASON.winterFoodMult; // Winter
  return 1;
}

/**
 * The full environmental multiplier on a food source: season × weather. Applied by
 * systems/production.ts to job output, idle foraging, and buildings' passive food.
 * Converter output (the Rain Engine) is deliberately EXEMPT — the point of buying the
 * weather with magic is that the weather stops mattering.
 */
export function foodEnvMult(state: GameState, hunter = false): number {
  return seasonFoodMult(state, hunter) * (1 + weather(state).swing);
}

/** The season/weather contributions as signed multiplier lines, for the Food tooltip. */
export function foodEnvLines(state: GameState): { label: string; mult: number }[] {
  const out: { label: string; mult: number }[] = [];
  const { seasonIndex, season } = dateAt(state.playtime);
  const seasonal = seasonIndex === 0 ? SEASON.springFoodMult : seasonIndex === 3 ? SEASON.winterFoodMult : 1;
  if (seasonal !== 1) {
    out.push({ label: seasonIndex === 3 ? `${season} (Hunters exempt)` : season, mult: seasonal });
  }
  const w = weather(state);
  if (w.swing !== 0) out.push({ label: `${w.label} weather`, mult: 1 + w.swing });
  return out;
}

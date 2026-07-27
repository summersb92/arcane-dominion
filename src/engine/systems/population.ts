// Population — deterministic settler growth and starvation. Runs AFTER production so
// it sees this tick's fresh food stock + the starving flag. A single signed
// accumulator (run.growthProgress) drives both: it fills toward +growthInterval while
// there is a sustainable food surplus and free housing (→ gain a settler), and drains
// toward −starveInterval while starving (→ lose a settler). When neither condition
// holds it decays back toward zero so a brief blip never banks progress. Pure engine.

import { POPULATION, HAPPINESS } from '../../content/config';
import type { GameState } from '../state';
import { logEvent, tallyBirth, tallyDeath } from './chronicle';
import { foodBalance } from './production';
import { happiness } from './happiness';
import { idleSettlers, removeSettler } from './jobs';
import { effectiveCap } from './caps';

const EPS = 1e-9;

/**
 * Does the FOOD situation permit growth? Either the settlement is running a non-negative
 * net rate, or it is sitting on a deep enough reserve to spend down (POPULATION
 * .growthReserveFraction of the food cap) — a full granary should feed new arrivals, not
 * merely sit there while growth stalls on a rate technicality.
 */
export function foodAllowsGrowth(state: GameState): boolean {
  const food = state.run.resources.food;
  if (food <= EPS) return false;
  if (foodBalance(state) >= -EPS) return true;
  const cap = effectiveCap(state, 'food');
  return Number.isFinite(cap) && cap > 0 && food / cap >= POPULATION.growthReserveFraction;
}

/** Once-per-run chronicle beats for milestone populations (keyed by the new total). */
const POP_MILESTONES: Record<number, string> = {
  10: 'Ten settlers. The camp has started calling itself a village.',
  25: "Twenty-five souls. Someone proposes a committee. It's that kind of place now.",
  50: 'Fifty settlers, and the founders no longer know every face.',
};

/** Move `v` toward 0 by at most `dt`, without overshooting. */
function decayToZero(v: number, dt: number): number {
  if (v > 0) return Math.max(0, v - dt);
  if (v < 0) return Math.min(0, v + dt);
  return 0;
}

/**
 * Advance population by `dt`. Growth needs: free housing (total < popCap), food in
 * stock, and a non-negative net food rate (sustainable). Starvation is driven purely
 * by the production-set `flags.starving`. Both are gated on whole-interval accumulation
 * so the pace is stable regardless of tick size.
 */
export function runPopulation(state: GameState, dt: number): void {
  const run = state.run;
  const starving = run.flags.starving === true;
  const hasRoom = run.population.total < run.popCap;
  const happy = happiness(state).value >= HAPPINESS.growthThreshold;
  const canGrow = hasRoom && foodAllowsGrowth(state) && happy;

  if (starving && run.population.total > 0) {
    run.growthProgress -= dt;
    if (run.growthProgress <= -POPULATION.starveIntervalSec) {
      if (removeSettler(state)) {
        run.growthProgress += POPULATION.starveIntervalSec;
        // Reported as a SEASON total, not one line per loss (systems/chronicle.ts).
        tallyDeath(state);
      } else {
        run.growthProgress = 0;
      }
    }
  } else if (canGrow) {
    run.growthProgress += dt;
    if (run.growthProgress >= POPULATION.growthIntervalSec) {
      run.growthProgress -= POPULATION.growthIntervalSec;
      const wasEmpty = run.population.total === 0;
      run.population.total += 1;
      // Ordinary arrivals are counted, not narrated — the season reports them in one line.
      // Only the FIRST settler and the milestone populations earn their own beat.
      tallyBirth(state);
      const milestone = POP_MILESTONES[run.population.total];
      if (wasEmpty) logEvent(state, 'The first settler joins the camp.', 'ev');
      else if (milestone && run.flags[`popBeat${run.population.total}`] !== true) {
        run.flags[`popBeat${run.population.total}`] = true;
        logEvent(state, milestone, 'ev');
      }
    }
  } else {
    run.growthProgress = decayToZero(run.growthProgress, dt);
  }
}

/** Where the next settler stands. `progress` is 0..1 toward the next event:
 *   growing  → filling toward the next arrival
 *   starving → filling toward the next loss (you're losing settlers)
 *   full     → housing is full; build more to grow
 *   unhappy  → has room + food, but happiness is below the growth threshold — growth paused
 *   stalled  → has room but no food surplus (or no housing yet) — growth paused */
export type GrowthStatus = 'growing' | 'starving' | 'full' | 'unhappy' | 'stalled';
export interface GrowthInfo {
  status: GrowthStatus;
  progress: number; // 0..1
}

/** Read model (no mutation): the next-settler status + progress, for the UI bar. Mirrors
 *  the growth/starve gates in runPopulation so the bar matches what will actually happen. */
export function growthStatus(state: GameState): GrowthInfo {
  const run = state.run;
  const total = run.population.total;
  const starving = run.flags.starving === true;
  const hasRoom = run.popCap > 0 && total < run.popCap;
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

  if (starving && total > 0) {
    return { status: 'starving', progress: clamp01(-run.growthProgress / POPULATION.starveIntervalSec) };
  }
  if (run.popCap > 0 && total >= run.popCap) return { status: 'full', progress: 0 };
  const foodOk = foodAllowsGrowth(state);
  const happy = happiness(state).value >= HAPPINESS.growthThreshold;
  if (hasRoom && foodOk && happy) {
    return { status: 'growing', progress: clamp01(run.growthProgress / POPULATION.growthIntervalSec) };
  }
  // Room + food are fine but the settlement is unhappy — happiness is the sole blocker.
  if (hasRoom && foodOk && !happy) return { status: 'unhappy', progress: 0 };
  return { status: 'stalled', progress: clamp01(run.growthProgress / POPULATION.growthIntervalSec) };
}

// idleSettlers is re-exported so callers/tests can read the derived idle count without
// reaching into systems/jobs directly.
export { idleSettlers };

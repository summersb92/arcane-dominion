// Population — deterministic settler growth and starvation. Runs AFTER production so
// it sees this tick's fresh food stock + the starving flag. A single signed
// accumulator (run.growthProgress) drives both: it fills toward +growthInterval while
// there is a sustainable food surplus and free housing (→ gain a settler), and drains
// toward −starveInterval while starving (→ lose a settler). When neither condition
// holds it decays back toward zero so a brief blip never banks progress. Pure engine.

import { POPULATION } from '../../content/config';
import type { GameState } from '../state';
import { logEvent } from './chronicle';
import { foodBalance } from './production';
import { idleSettlers, removeSettler } from './jobs';

const EPS = 1e-9;

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
  const netFood = foodBalance(state);
  const foodInStock = run.resources.food > EPS;
  const canGrow = hasRoom && foodInStock && netFood >= -EPS;

  if (starving && run.population.total > 0) {
    run.growthProgress -= dt;
    if (run.growthProgress <= -POPULATION.starveIntervalSec) {
      if (removeSettler(state)) {
        run.growthProgress += POPULATION.starveIntervalSec;
        logEvent(state, 'A settler is lost to hunger.');
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
      logEvent(state, wasEmpty ? 'The first settler joins the camp.' : 'A new settler arrives.');
    }
  } else {
    run.growthProgress = decayToZero(run.growthProgress, dt);
  }
}

// idleSettlers is re-exported so callers/tests can read the derived idle count without
// reaching into systems/jobs directly.
export { idleSettlers };

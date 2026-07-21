// Production — the per-tick resource economy. Each tick this system:
//   1. gathers GROSS production from assigned jobs (Σ workers × per-worker output,
//      scaled by any tech efficiency bonus) and from magic CONSTRUCTS (buildings
//      like the Arcane Font and Animated Tools — production with NO population);
//   2. subtracts UPKEEP — per-job food, base per-settler food, and per-construct mana;
//   3. applies the net deltas, clamps every resource to its effective cap, and sets
//      run.flags.starving when food demand outran supply + stock.
//
// It also exposes the per-second NET rate read model (productionRates / foodBalance)
// the CLI and UI show. Pure engine, no DOM.

import { POPULATION, TECH_BONUS } from '../../content/config';
import { BUILDINGS } from '../../content/buildings';
import { JOBS } from '../../content/jobs';
import { RESOURCE_IDS, type ResourceId } from '../../content/resources';
import type { GameState } from '../state';
import { effectiveCap } from './caps';

const EPS = 1e-9;

/** Tech-driven output multiplier for a job (Woodworking / Agriculture). */
function jobEfficiency(state: GameState, jobId: string): number {
  let m = 1;
  if (jobId === 'woodcutter' && state.run.tech.includes('woodworking')) m *= TECH_BONUS.woodworking;
  if (jobId === 'forager' && state.run.tech.includes('agriculture')) m *= TECH_BONUS.agriculture;
  return m;
}

interface Flows {
  /** Gross production per resource (jobs + constructs), before upkeep. */
  gross: Record<ResourceId, number>;
  /** Food consumed per second (job upkeep + base per-settler upkeep). */
  foodUpkeep: number;
  /** Mana consumed per second by constructs. */
  manaUpkeep: number;
}

/** Compute every per-second flow from the current assignment + building counts. */
function flows(state: GameState): Flows {
  const gross = {} as Record<ResourceId, number>;
  for (const id of RESOURCE_IDS) gross[id] = 0;

  const run = state.run;
  let foodUpkeep = POPULATION.baseFoodUpkeep * run.population.total;
  let manaUpkeep = 0;

  // Jobs: Σ workers × per-worker output × efficiency; each worker eats foodUpkeep.
  for (const job of JOBS) {
    const workers = run.population.jobs[job.id] ?? 0;
    if (workers <= 0) continue;
    const eff = jobEfficiency(state, job.id);
    for (const [res, per] of Object.entries(job.produces)) {
      gross[res as ResourceId] += workers * (per as number) * eff;
    }
    foodUpkeep += workers * job.foodUpkeep;
  }

  // Constructs: passive production + mana upkeep, scaled by building count. NO food, NO pop.
  for (const b of BUILDINGS) {
    const count = run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const eff of b.effects) {
      if (eff.kind === 'produce') gross[eff.resource] += count * eff.perSec;
      else if (eff.kind === 'manaUpkeep') manaUpkeep += count * eff.perSec;
    }
  }

  return { gross, foodUpkeep, manaUpkeep };
}

/** Per-second NET rate for every resource (gross − upkeep). The primary "am I producing?" read model. */
export function productionRates(state: GameState): Record<ResourceId, number> {
  const f = flows(state);
  const rates = { ...f.gross };
  rates.food -= f.foodUpkeep;
  rates.mana -= f.manaUpkeep;
  return rates;
}

/** Net food per second (production − all food upkeep). Drives population growth/starvation. */
export function foodBalance(state: GameState): number {
  const f = flows(state);
  return f.gross.food - f.foodUpkeep;
}

/**
 * Advance the economy by `dt`. Mutates resources, clamps to caps, and sets
 * run.flags.starving. Runs BEFORE population so growth/starvation sees fresh stock.
 */
export function runProduction(state: GameState, dt: number): void {
  const run = state.run;
  const f = flows(state);

  // Non-food, non-mana resources: pure additive production.
  run.resources.wood += f.gross.wood * dt;
  run.resources.stone += f.gross.stone * dt;
  run.resources.research += f.gross.research * dt;

  // Mana: production − construct upkeep, clamped at 0 (constructs still run gently when dry).
  run.resources.mana += (f.gross.mana - f.manaUpkeep) * dt;
  if (run.resources.mana < 0) run.resources.mana = 0;

  // Food: production − upkeep. If demand outran supply + stock, that is STARVATION —
  // clamp to 0 and flag it so population.ts can begin losing settlers.
  const nextFood = run.resources.food + (f.gross.food - f.foodUpkeep) * dt;
  if (nextFood < -EPS) {
    run.resources.food = 0;
    run.flags.starving = true;
  } else {
    run.resources.food = Math.max(0, nextFood);
    run.flags.starving = false;
  }

  // Clamp mundane materials to their effective caps (excess is lost); magic is uncapped.
  for (const id of ['wood', 'food', 'stone'] as ResourceId[]) {
    const cap = effectiveCap(state, id);
    if (run.resources[id] > cap) run.resources[id] = cap;
  }
}

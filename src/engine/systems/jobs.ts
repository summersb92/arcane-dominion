// Jobs — assign/unassign settlers to work, and the read model of per-job counts +
// capacity. A job's assignable capacity is the sum over its workplace buildings of
// (count × slots-per-building). Idle settlers = total − Σ assigned. Pure engine, no DOM.

import { BUILDINGS } from '../../content/buildings';
import { JOBS, JOB_BY_ID, type JobId } from '../../content/jobs';
import type { GameState } from '../state';

/** Assignable capacity for a job = Σ (workplace building count × slots granted). */
export function jobCapacity(state: GameState, jobId: JobId): number {
  const job = JOB_BY_ID[jobId];
  if (!job) return 0;
  let cap = 0;
  for (const b of BUILDINGS) {
    const count = state.run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const eff of b.effects) {
      if (eff.kind === 'jobCapacity' && eff.job === jobId) cap += count * eff.slots;
    }
  }
  return cap;
}

/** Total settlers currently assigned to any job. */
export function assignedTotal(state: GameState): number {
  let sum = 0;
  for (const id of Object.keys(state.run.population.jobs) as JobId[]) {
    sum += state.run.population.jobs[id] ?? 0;
  }
  return sum;
}

/** Settlers not assigned to any job. */
export function idleSettlers(state: GameState): number {
  return state.run.population.total - assignedTotal(state);
}

/**
 * Assign up to `n` idle settlers to `jobId`. Guarded by idle availability AND the job's
 * building capacity. Returns the number actually assigned (0 if none could be).
 */
export function assignJob(state: GameState, jobId: JobId, n = 1): number {
  if (!JOB_BY_ID[jobId] || n <= 0) return 0;
  const current = state.run.population.jobs[jobId] ?? 0;
  const room = jobCapacity(state, jobId) - current;
  const can = Math.min(n, idleSettlers(state), room);
  if (can <= 0) return 0;
  state.run.population.jobs[jobId] = current + can;
  // Staffing a post by hand settles the settlement's debt to it — the refill queue must not
  // go on believing the work is still undone.
  clearVacancy(state, jobId, can);
  return can;
}

/** Forget `n` remembered vacancies for a job (the post has been staffed again). */
function clearVacancy(state: GameState, jobId: JobId, n: number): void {
  const open = state.run.vacancies?.[jobId] ?? 0;
  if (open <= 0) return;
  const left = open - n;
  if (left > 0) state.run.vacancies[jobId] = left;
  else delete state.run.vacancies[jobId];
}

/** Per-worker food output, counting the tech-gated extras — the sort key for refilling. */
function foodPerWorker(def: (typeof JOBS)[number]): number {
  return (def.produces.food ?? 0) + (def.producesWithTech?.produces.food ?? 0);
}

/**
 * The order emptied posts are refilled in: the biggest FOOD earner first (Farmer, then
 * Hunter), then everything else in catalogue order. A settlement climbing out of a famine
 * has to eat before it does anything else — putting the first survivors back on the woodpile
 * is how a recovery turns into a second famine.
 */
const REFILL_ORDER: JobId[] = JOBS.map((j, i) => ({ j, i }))
  .sort((a, b) => foodPerWorker(b.j) - foodPerWorker(a.j) || a.i - b.i)
  .map(({ j }) => j.id);

/**
 * Put ONE idle settler back into a post that death emptied, highest priority first. Called
 * as each new settler arrives (systems/population.ts), so a settlement that lost its Farmers
 * to hunger rebuilds itself into the same shape rather than waiting to be re-staffed by hand.
 *
 * A post whose capacity has since been filled (or lost) is quietly forgotten rather than
 * blocking the queue. Returns the job filled, or null.
 */
export function refillVacancy(state: GameState): JobId | null {
  const open = state.run.vacancies;
  if (!open || idleSettlers(state) <= 0) return null;
  for (const id of REFILL_ORDER) {
    if ((open[id] ?? 0) <= 0) continue;
    if (assignJob(state, id, 1) === 1) return id; // assignJob clears the vacancy it filled
    delete open[id]; // no room for it any more — stop holding the place
  }
  return null;
}

/** Unassign up to `n` settlers from `jobId`, returning them to idle. Returns count removed. */
export function unassignJob(state: GameState, jobId: JobId, n = 1): number {
  if (n <= 0) return 0;
  const current = state.run.population.jobs[jobId] ?? 0;
  const can = Math.min(n, current);
  if (can <= 0) return 0;
  state.run.population.jobs[jobId] = current - can;
  return can;
}

/**
 * Remove one settler from the workforce (used by starvation). Prefers an idle settler;
 * failing that, pulls one from a job — and REMEMBERS the post, so the next settler born can
 * take it up again (refillVacancy). Never drives total below 0. Returns true if removed.
 */
export function removeSettler(state: GameState): boolean {
  const pop = state.run.population;
  if (pop.total <= 0) return false;
  if (idleSettlers(state) <= 0) {
    // No idle settler — pull one from the first job that has a worker, and record the
    // post they leave behind. An idle settler dying costs the settlement no work, so
    // there is nothing to remember in that case.
    for (const id of Object.keys(pop.jobs) as JobId[]) {
      if ((pop.jobs[id] ?? 0) > 0) {
        pop.jobs[id] = (pop.jobs[id] ?? 0) - 1;
        state.run.vacancies ??= {};
        state.run.vacancies[id] = (state.run.vacancies[id] ?? 0) + 1;
        break;
      }
    }
  }
  pop.total -= 1;
  return true;
}

/** Read model: every job's assigned/capacity, plus idle + total. */
export function jobsView(state: GameState): {
  total: number;
  idle: number;
  jobs: { id: JobId; name: string; assigned: number; capacity: number }[];
} {
  return {
    total: state.run.population.total,
    idle: idleSettlers(state),
    jobs: JOBS.map((j) => ({
      id: j.id,
      name: j.name,
      assigned: state.run.population.jobs[j.id] ?? 0,
      capacity: jobCapacity(state, j.id),
    })),
  };
}

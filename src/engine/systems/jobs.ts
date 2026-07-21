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
  return can;
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
 * failing that, pulls one from a job. Never drives total below 0. Returns true if removed.
 */
export function removeSettler(state: GameState): boolean {
  const pop = state.run.population;
  if (pop.total <= 0) return false;
  if (idleSettlers(state) <= 0) {
    // No idle settler — pull one from the first job that has a worker.
    for (const id of Object.keys(pop.jobs) as JobId[]) {
      if ((pop.jobs[id] ?? 0) > 0) {
        pop.jobs[id] = (pop.jobs[id] ?? 0) - 1;
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
  jobs: { id: JobId; name: string; assigned: number; capacity: number; foodUpkeep: number }[];
} {
  return {
    total: state.run.population.total,
    idle: idleSettlers(state),
    jobs: JOBS.map((j) => ({
      id: j.id,
      name: j.name,
      assigned: state.run.population.jobs[j.id] ?? 0,
      capacity: jobCapacity(state, j.id),
      foodUpkeep: j.foodUpkeep,
    })),
  };
}

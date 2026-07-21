// Job catalogue (pure data). A JOB is work a settler performs each tick: it PRODUCES
// a resource and consumes FOOD upkeep (on top of every settler's base upkeep, see
// systems/population.ts). A job is only assignable up to the capacity granted by its
// workplace BUILDING (see requiresBuildingCapacity + systems/jobs.ts jobCapacity).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

import type { BuildingId } from './buildings';
import type { ResourceId } from './resources';

export type JobId = 'woodcutter' | 'forager' | 'quarry-worker' | 'scholar';

export interface JobDef {
  id: JobId;
  name: string;
  blurb: string;
  /** Per-worker, per-second gross output. */
  produces: Partial<Record<ResourceId, number>>;
  /** Per-worker, per-second FOOD consumed (added to the base per-settler upkeep). */
  foodUpkeep: number;
  /** The building whose count × slots-per grants this job's assignable capacity. */
  requiresBuildingCapacity: BuildingId;
}

export const JOBS: JobDef[] = [
  {
    id: 'woodcutter',
    name: 'Woodcutter',
    blurb: 'Fells timber at the lodge. Produces wood; eats food.',
    produces: { wood: 0.5 },
    foodUpkeep: 0.1,
    requiresBuildingCapacity: 'woodcutters-lodge',
  },
  {
    id: 'forager',
    name: 'Forager',
    blurb: 'Works the forager huts. Produces food (net-positive after upkeep).',
    produces: { food: 0.5 },
    foodUpkeep: 0.1,
    requiresBuildingCapacity: 'forager-hut',
  },
  {
    id: 'quarry-worker',
    name: 'Quarry Worker',
    blurb: 'Hews stone at the quarry. Produces stone; eats food.',
    produces: { stone: 0.4 },
    foodUpkeep: 0.1,
    requiresBuildingCapacity: 'quarry',
  },
  {
    id: 'scholar',
    name: 'Scholar',
    blurb: 'Studies at the study. Produces research; eats food.',
    produces: { research: 0.2 },
    foodUpkeep: 0.1,
    requiresBuildingCapacity: 'scholars-study',
  },
];

export const JOB_IDS: JobId[] = JOBS.map((j) => j.id);

export const JOB_BY_ID: Record<JobId, JobDef> = Object.fromEntries(
  JOBS.map((j) => [j.id, j]),
) as Record<JobId, JobDef>;

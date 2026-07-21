// Job catalogue (pure data). A JOB is work a settler performs each tick: it PRODUCES
// a resource. Jobs no longer carry a per-worker food cost — the only food consumer is
// the base per-settler upkeep (POPULATION.baseFoodUpkeep, see systems/population.ts),
// which still gates population growth. A job is only assignable up to the capacity
// granted by its workplace BUILDING (see requiresBuildingCapacity + systems/jobs.ts).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

import type { BuildingId } from './buildings';
import type { ResourceId } from './resources';

export type JobId = 'woodcutter' | 'forager' | 'hunter' | 'quarry-worker' | 'miner' | 'scholar' | 'bard';

export interface JobDef {
  id: JobId;
  name: string;
  blurb: string;
  /** Per-worker, per-second gross output. */
  produces: Partial<Record<ResourceId, number>>;
  /** The building whose count × slots-per grants this job's assignable capacity. */
  requiresBuildingCapacity: BuildingId;
}

export const JOBS: JobDef[] = [
  {
    id: 'woodcutter',
    name: 'Woodcutter',
    blurb: 'Fells timber at the lodge. Produces wood.',
    produces: { wood: 0.5 },
    requiresBuildingCapacity: 'woodcutters-lodge',
  },
  {
    id: 'forager',
    name: 'Farmer',
    blurb: 'Works the farm. Produces food.',
    produces: { food: 0.5 },
    requiresBuildingCapacity: 'forager-hut',
  },
  {
    id: 'hunter',
    name: 'Hunter',
    blurb: 'Hunts and traps from the lodge. Produces food and furs (a luxury).',
    produces: { food: 0.3, furs: 0.15 },
    requiresBuildingCapacity: 'hunters-lodge',
  },
  {
    id: 'quarry-worker',
    name: 'Stonecutter',
    blurb: 'Hews stone at the quarry. Produces stone.',
    produces: { stone: 0.4 },
    requiresBuildingCapacity: 'quarry',
  },
  {
    id: 'miner',
    name: 'Miner',
    blurb: 'Digs ore from the mine shaft. Produces iron.',
    produces: { iron: 0.4 },
    requiresBuildingCapacity: 'mine',
  },
  {
    id: 'scholar',
    name: 'Scholar',
    blurb: 'Studies at the Library. Produces research.',
    produces: { research: 0.2 },
    requiresBuildingCapacity: 'library',
  },
  {
    id: 'bard',
    name: 'Bard',
    blurb: 'Performs at the amphitheater. Produces culture — and each Bard raises happiness.',
    produces: { culture: 0.2 },
    requiresBuildingCapacity: 'amphitheater',
  },
];

export const JOB_IDS: JobId[] = JOBS.map((j) => j.id);

export const JOB_BY_ID: Record<JobId, JobDef> = Object.fromEntries(
  JOBS.map((j) => [j.id, j]),
) as Record<JobId, JobDef>;

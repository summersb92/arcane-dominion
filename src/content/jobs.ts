// Job catalogue (pure data). A JOB is work a settler performs each tick: it PRODUCES
// a resource. Jobs no longer carry a per-worker food cost — the only food consumer is
// the base per-settler upkeep (POPULATION.baseFoodUpkeep, see systems/population.ts),
// which still gates population growth. A job is only assignable up to the capacity
// granted by its workplace BUILDING (see requiresBuildingCapacity + systems/jobs.ts).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

import type { BuildingId } from './buildings';
import type { ResourceId } from './resources';

export type JobId =
  | 'woodcutter'
  | 'forager'
  | 'hunter'
  | 'quarry-worker'
  | 'miner'
  | 'coal-miner'
  | 'smelter'
  | 'machinist'
  | 'engineer'
  | 'scribe'
  | 'scholar'
  | 'bard';

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
    blurb: 'Fells timber at the lodge, one honest tree at a time.',
    produces: { wood: 0.5 },
    requiresBuildingCapacity: 'woodcutters-lodge',
  },
  {
    id: 'forager',
    name: 'Farmer',
    blurb: 'Works the Farm and argues with the weather.',
    produces: { food: 6 },
    requiresBuildingCapacity: 'forager-hut',
  },
  {
    id: 'hunter',
    name: 'Hunter',
    blurb: 'Hunts and traps from the lodge. Comes back with dinner and a story.',
    produces: { food: 0.3, furs: 0.15 },
    requiresBuildingCapacity: 'hunters-lodge',
  },
  {
    id: 'quarry-worker',
    name: 'Stonecutter',
    blurb: 'Hews stone at the Quarry. The hill objects, gradually.',
    produces: { stone: 0.4 },
    requiresBuildingCapacity: 'quarry',
  },
  {
    id: 'miner',
    name: 'Miner',
    blurb: 'Digs iron from the shaft and keeps a wary eye on the dark.',
    produces: { iron: 0.4 },
    requiresBuildingCapacity: 'mine',
  },
  {
    id: 'coal-miner',
    name: 'Coal Miner',
    blurb: 'Works the black seams. Washing is a nightly ritual.',
    produces: { coal: 0.4 },
    requiresBuildingCapacity: 'coal-mine',
  },
  {
    id: 'smelter',
    name: 'Smelter',
    blurb: 'Feeds the furnace and knows the exact colour of ready steel.',
    produces: {}, // no direct output; a Smelter POWERS the Steelworks converter (see systems/production.ts)
    requiresBuildingCapacity: 'steelworks',
  },
  {
    id: 'machinist',
    name: 'Machinist',
    blurb: 'Feeds, oils, and occasionally curses one machine. The machine does the rest.',
    produces: {}, // powers the Toolworks / Factory converters
    requiresBuildingCapacity: 'toolworks',
  },
  {
    id: 'engineer',
    name: 'Engineer',
    blurb: 'Tends an engine the way others tend a fussy child.',
    produces: {}, // powers the Engine Works converter
    requiresBuildingCapacity: 'engine-works',
  },
  {
    id: 'scribe',
    name: 'Scribe',
    blurb: 'Copies, binds, and defends the inkwell.',
    produces: {}, // powers the Scriptorium / Archive converters
    requiresBuildingCapacity: 'scriptorium',
  },
  {
    id: 'scholar',
    name: 'Scholar',
    blurb: 'Studies wherever there are shelves. Produces questions, then answers.',
    produces: { research: 0.2 },
    requiresBuildingCapacity: 'library',
  },
  {
    id: 'bard',
    name: 'Bard',
    blurb: 'Performs wherever there is a stage. Each Bard also lifts spirits.',
    produces: { culture: 0.2 },
    requiresBuildingCapacity: 'amphitheater',
  },
];

export const JOB_IDS: JobId[] = JOBS.map((j) => j.id);

export const JOB_BY_ID: Record<JobId, JobDef> = Object.fromEntries(
  JOBS.map((j) => [j.id, j]),
) as Record<JobId, JobDef>;

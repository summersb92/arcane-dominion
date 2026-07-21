// Contract content (spec §3.6 / §5) — the outside world's small jobs. Pure data
// (type-only import of the task types → no runtime cycle with tasks.ts, which
// spreads these into TASKS). A contract is a Running task tagged 'Contract': it spends
// the mage (Stamina + affinity essence + time) and pays Gold.
//
// v0.1.4: Renown + material drops are STRIPPED (Renown is deferred/hidden — see
// config.ts SHOW_RENOWN), so contracts now pay Gold ONLY. Their essence runCost uses
// the 'affinity' sentinel (resolved at runtime to whatever element you awakened), so a
// contract costs your awakened essence rather than a hardcoded Fire. Opt-in — ignoring
// them costs nothing.

import type { Amount, TaskDef } from './tasks';

const A = (pool: Amount['pool'], id: Amount['id'], amount: number): Amount => ({ pool, id, amount });

export const CONTRACTS: TaskDef[] = [
  {
    // Ward a Barn — the first solo livelihood. Needs an awakened essence (Spark) to lay
    // the ward; drains a trickle of it so it's SUSTAINABLE on Spark's 0.2/s alone, with a
    // little headroom. Pays Gold.
    id: 'ward-a-barn',
    name: 'Fulfil: Ward a Barn',
    type: 'running',
    tag: 'Contract',
    cls: 'gold',
    blurb: 'Trace a ward across the beams so the farmer sleeps and the rats do not.',
    length: 12,
    repeatable: true,
    requires: [{ kind: 'skill', id: 'spark' }],
    runCost: [A('vital', 'stamina', 0.3), A('essence', 'affinity', 0.15)],
    output: [A('resource', 'gold', 10)],
  },
  {
    // Cleanse the Old Well — a bigger job, unlocked once you've warded a few barns. Its
    // essence drain (0.2/s) exactly matches Spark's bare trickle, so it slowly starves
    // UNLESS you build a Hearth (+essence) or learn Kindle Focus — a deliberate pull
    // toward the Home fixtures. Pays more Gold. Gate is now Ward-a-Barn ×5 (Renown gone).
    id: 'cleanse-the-old-well',
    name: 'Fulfil: Cleanse the Old Well',
    type: 'running',
    tag: 'Contract',
    cls: 'gold',
    blurb: 'Something foul festers in the dark water. Burn it out and the village remembers your name.',
    length: 20,
    repeatable: true,
    requires: [
      { kind: 'skill', id: 'spark' },
      { kind: 'taskCount', id: 'ward-a-barn', atLeast: 5 },
    ],
    runCost: [A('vital', 'stamina', 0.4), A('essence', 'affinity', 0.2)],
    output: [A('resource', 'gold', 24)],
  },
];

// The Founding (spec §3.11 / §5) — the v0.1 FINALE, modelled as three Limited
// "Housing" tasks (reusing the engine's Limited machinery, not a new system):
//   • secure-charter — a Gold purchase, gated on a little Renown → flag hasCharter
//   • claim-site     — the big Gold sink (the Ruined Tower)        → flag hasSite
//   • found-academy  — the gate itself: hold Gold + Renown AND own a Charter + Site.
//     Completing it sets flag `founded`; systems/progression.ts sees the flag and
//     flips phase → 'founded' + writes the celebratory Chronicle beat.
// All three live on the Home tab, behind the lair beat. Thresholds live in config.

import { FOUNDING } from './config';
import type { Amount, TaskDef } from './tasks';

const A = (pool: Amount['pool'], id: Amount['id'], amount: number): Amount => ({ pool, id, amount });

export const FOUNDING_TASKS: TaskDef[] = [
  {
    id: 'secure-charter',
    name: 'Secure a Guild Charter',
    type: 'limited',
    tag: 'Founding',
    cls: 'gold',
    blurb: 'Seals, signatures, and a suitable fee — the guilds make your ambition official.',
    chip: 'Charter',
    panel: 'home',
    length: 4,
    max: 1,
    requires: [
      { kind: 'flag', flag: 'lairFounded' },
      { kind: 'resource', id: 'renown', atLeast: FOUNDING.charterRenown },
    ],
    startCost: [A('resource', 'gold', FOUNDING.charterCost)],
    effects: [{ kind: 'flag', flag: 'hasCharter' }],
  },
  {
    id: 'claim-site',
    name: 'Claim the Ruined Tower',
    type: 'limited',
    tag: 'Founding',
    cls: 'earth',
    blurb: 'A crumbling tower on a windy hill. Ruined, yes — but yours, and room to dream.',
    chip: 'Site',
    panel: 'home',
    length: 6,
    max: 1,
    requires: [{ kind: 'flag', flag: 'lairFounded' }],
    startCost: [A('resource', 'gold', FOUNDING.siteCost)],
    effects: [{ kind: 'flag', flag: 'hasSite' }],
  },
  {
    // The finale. The gate is expressed entirely as `requires` (a HELD Gold + Renown
    // check plus the two flags) — it spends nothing itself; the spending already
    // happened at the Charter + Site. Completing it flips `founded`.
    id: 'found-academy',
    name: 'Found the Academy',
    type: 'limited',
    tag: 'Founding',
    cls: 'renown',
    blurb: 'Charter in hand, ground underfoot — speak the founding words and Act I closes.',
    chip: 'The Founding',
    panel: 'home',
    length: 8,
    max: 1,
    requires: [
      { kind: 'flag', flag: 'lairFounded' },
      { kind: 'resource', id: 'gold', atLeast: FOUNDING.goldHeld },
      { kind: 'resource', id: 'renown', atLeast: FOUNDING.renown },
      { kind: 'flag', flag: 'hasCharter' },
      { kind: 'flag', flag: 'hasSite' },
    ],
    effects: [{ kind: 'flag', flag: 'founded' }],
  },
];

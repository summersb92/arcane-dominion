// Manual GATHER actions (pure data). These are the BOOTSTRAP loop: instant, click-
// driven resource gains you rely on before you have buildings + population working
// jobs. Each grants a small flat amount, clamped to the resource's storage cap.
//
// DESIGN NOTE (gating): all three gather actions are UNGATED from the start. Stone is
// deliberately hand-gatherable from turn one to avoid a bootstrap deadlock — the
// storehouse and scholar's study both cost stone, and Masonry (which opens the Quarry
// job) is researched from Scholars, who need a study built with stone. Gating stone
// behind Masonry would make the whole tree unreachable. The Quarry BUILDING (bulk,
// job-driven stone) is still the Masonry payoff; hand-quarrying stays slow.

import type { ResourceId } from './resources';

export interface ActionDef {
  id: string;
  name: string;
  blurb: string;
  resource: ResourceId;
  amount: number;
  /** Optional tech gate (unused this slice — all actions ungated). */
  requiresTech?: string;
}

export const ACTIONS: ActionDef[] = [
  { id: 'gather-wood', name: 'Gather Wood', blurb: 'Collect fallen branches by hand.', resource: 'wood', amount: 1 },
  { id: 'forage-food', name: 'Forage', blurb: 'Pick berries and roots.', resource: 'food', amount: 1 },
  { id: 'quarry-stone', name: 'Quarry Stone', blurb: 'Chip loose rock from the outcrop.', resource: 'stone', amount: 1 },
];

export const ACTION_BY_ID: Record<string, ActionDef> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a]),
) as Record<string, ActionDef>;

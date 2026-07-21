// Actions — instant, manual GATHER clicks (the bootstrap before jobs exist). Each
// grants a small flat amount of one resource, clamped to that resource's storage cap.
// Pure engine, no DOM.

import { ACTIONS, ACTION_BY_ID, type ActionDef } from '../../content/actions';
import { MANUAL_GATHER_RETIRE_CAP } from '../../content/config';
import type { GameState } from '../state';
import { clampToCap, effectiveCap } from './caps';

/** True once this resource's storage cap has grown enough that hand-gathering is RETIRED
 *  — production covers it, so the manual button turns off. */
export function isActionRetired(state: GameState, def: ActionDef): boolean {
  return effectiveCap(state, def.resource) >= MANUAL_GATHER_RETIRE_CAP;
}

/** Available = tech gate satisfied AND not yet retired by a large storage cap. */
export function isActionAvailable(state: GameState, def: ActionDef): boolean {
  if (def.requiresTech && !state.run.tech.includes(def.requiresTech as never)) return false;
  if (isActionRetired(state, def)) return false;
  return true;
}

/**
 * Perform a manual gather. Adds the action's amount to its resource (clamped to cap).
 * Returns true if it ran (false for an unknown or gated id). Note: hitting the cap is
 * still a success — the click "worked", the surplus is simply lost.
 */
export function doGather(state: GameState, id: string): boolean {
  const def = ACTION_BY_ID[id];
  if (!def || !isActionAvailable(state, def)) return false;
  const cur = state.run.resources[def.resource] ?? 0;
  state.run.resources[def.resource] = clampToCap(state, def.resource, cur + def.amount);
  return true;
}

export interface ActionView {
  id: string;
  name: string;
  blurb: string;
  resource: string;
  amount: number;
  available: boolean;
  retired: boolean; // storage cap ≥ retire threshold → hand-gathering turned off
}

/** Read model: every gather action + whether it is currently available / retired. */
export function actionsView(state: GameState): ActionView[] {
  return ACTIONS.map((def) => ({
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    resource: def.resource,
    amount: def.amount,
    available: isActionAvailable(state, def),
    retired: isActionRetired(state, def),
  }));
}

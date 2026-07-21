// Storage caps. The three MUNDANE materials (wood/food/stone) have a mutable cap in
// RunState.caps (raised by Storehouses). The two MAGIC currencies (mana/research) are
// uncapped this slice — effectiveCap returns Infinity for them. Pure engine, no DOM.

import { isMagicResource, type MundaneResourceId, type ResourceId } from '../../content/resources';
import type { GameState } from '../state';

/** Effective storage cap for a resource: the mundane cap, or Infinity for magic currencies. */
export function effectiveCap(state: GameState, id: ResourceId): number {
  if (isMagicResource(id)) return Infinity;
  return state.run.caps[id as MundaneResourceId];
}

/** Clamp a held amount into [0, cap] for the given resource. */
export function clampToCap(state: GameState, id: ResourceId, amount: number): number {
  const cap = effectiveCap(state, id);
  if (amount < 0) return 0;
  return amount > cap ? cap : amount;
}

// Trade — the market. Gold's only sink: buy a material outright for coin. Unlocked by the
// Currency tech (and widened by Banking). Instant, click-driven, and clamped to the target
// resource's storage cap exactly like a manual gather. Pure engine, no DOM.

import { PURCHASES, PURCHASE_BY_ID, type PurchaseDef } from '../../content/trade';
import type { GameState } from '../state';
import { clampToCap } from './caps';

// Match the affordability tolerance used for buildings/tech (see systems/buildings.ts).
const EPS = 1e-6;

/** True once the purchase's tech is researched. */
export function isPurchaseUnlocked(state: GameState, def: PurchaseDef): boolean {
  return state.run.tech.includes(def.requiresTech);
}

/** True if the treasury covers the price right now. */
export function canBuy(state: GameState, id: string): boolean {
  const def = PURCHASE_BY_ID[id];
  if (!def || !isPurchaseUnlocked(state, def)) return false;
  return (state.run.resources.gold ?? 0) >= def.price - EPS;
}

/**
 * Buy one lot. Spends the gold and grants the goods (clamped to cap). Returns true if it
 * ran. No mutation on refusal — an unknown id, a locked market, or an empty treasury.
 * Hitting the storage cap still counts as a success: the coin is spent, the surplus lost.
 */
export function buy(state: GameState, id: string): boolean {
  const def = PURCHASE_BY_ID[id];
  if (!def || !canBuy(state, id)) return false;
  state.run.resources.gold -= def.price;
  const cur = state.run.resources[def.resource] ?? 0;
  state.run.resources[def.resource] = clampToCap(state, def.resource, cur + def.amount);
  return true;
}

export interface PurchaseRowView {
  id: string;
  resource: string;
  amount: number;
  price: number;
  affordable: boolean;
}

/** Read model: every UNLOCKED purchase and whether the treasury covers it. */
export function tradeView(state: GameState): PurchaseRowView[] {
  return PURCHASES.filter((def) => isPurchaseUnlocked(state, def)).map((def) => ({
    id: def.id,
    resource: def.resource,
    amount: def.amount,
    price: def.price,
    affordable: canBuy(state, def.id),
  }));
}

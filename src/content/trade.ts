// Market purchases (pure data). Gold's SINK: once the Currency tech is researched, the
// settlement can simply BUY materials outright. Each purchase spends `price` gold and grants
// `amount` of a resource instantly (clamped to that resource's cap, like a manual gather).
//
// Prices rise with how refined the good is — buying steel is far dearer than buying wood —
// so gold is a way to break a specific bottleneck, never a replacement for production.
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

import type { ResourceId } from './resources';
import type { TechId } from './tech';

export interface PurchaseDef {
  id: string;
  /** What the market sells. */
  resource: ResourceId;
  /** How much arrives per purchase. */
  amount: number;
  /** Gold spent per purchase. */
  price: number;
  /** Tech that must be researched before this appears at the market. */
  requiresTech: TechId;
}

export const PURCHASES: PurchaseDef[] = [
  // Currency opens the basic goods market.
  { id: 'buy-wood', resource: 'wood', amount: 25, price: 10, requiresTech: 'currency' },
  { id: 'buy-stone', resource: 'stone', amount: 25, price: 12, requiresTech: 'currency' },
  { id: 'buy-food', resource: 'food', amount: 25, price: 12, requiresTech: 'currency' },
  // Banking brings the ore and metal trade within reach.
  { id: 'buy-iron', resource: 'iron', amount: 10, price: 30, requiresTech: 'banking' },
  { id: 'buy-coal', resource: 'coal', amount: 10, price: 30, requiresTech: 'banking' },
  { id: 'buy-steel', resource: 'steel', amount: 5, price: 60, requiresTech: 'banking' },
];

export const PURCHASE_BY_ID: Record<string, PurchaseDef> = Object.fromEntries(
  PURCHASES.map((p) => [p.id, p]),
) as Record<string, PurchaseDef>;

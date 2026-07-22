// Storage caps. The three MUNDANE materials (wood/food/stone) have a mutable cap in
// RunState.caps (raised by Storehouses). RESEARCH is now capped too — but by a DERIVED
// cap: a small base (STARTING.researchCap) plus the `researchCap` effects of the science
// buildings (Scholar's Study, Library). Mana and culture stay UNCAPPED (Infinity). Pure
// engine, no DOM.

import { STARTING, KNOWLEDGE } from '../../content/config';
import { BUILDINGS } from '../../content/buildings';
import { isUncappedResource, type MundaneResourceId, type ResourceId } from '../../content/resources';
import type { GameState } from '../state';

/** The effective RESEARCH cap: the base cap, every science building's researchCap effect × its
 *  count (Library +100, Academy +600), plus a bonus from HELD compendiums (Archive output). */
export function researchCap(state: GameState): number {
  let cap = STARTING.researchCap;
  for (const b of BUILDINGS) {
    const count = state.run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const eff of b.effects) {
      if (eff.kind === 'researchCap') cap += count * eff.amount;
    }
  }
  // Held compendiums lift the ceiling (capped) — a knowledge-chain payoff.
  const compendiums = state.run.resources.compendiums ?? 0;
  cap += Math.min(KNOWLEDGE.compendiumResearchCapMax, compendiums * KNOWLEDGE.compendiumResearchCap);
  return cap;
}

/** Effective storage cap for a resource: the mundane cap, the derived research cap, or
 *  Infinity for the uncapped currencies (mana / culture). */
export function effectiveCap(state: GameState, id: ResourceId): number {
  if (isUncappedResource(id)) return Infinity;
  if (id === 'research') return researchCap(state);
  return state.run.caps[id as MundaneResourceId];
}

/** Clamp a held amount into [0, cap] for the given resource. */
export function clampToCap(state: GameState, id: ResourceId, amount: number): number {
  const cap = effectiveCap(state, id);
  if (amount < 0) return 0;
  return amount > cap ? cap : amount;
}

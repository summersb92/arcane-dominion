// Essence system — the passive per-element trickle that awakening a cantrip starts
// (spec §3.8 / §5). Pure engine (NO DOM/Svelte). Runs each tick alongside the Task
// system: tasks can also grant essence on completion (runTasks), while THIS supplies
// the always-on trickle owned via cantrips (and, in T-006, Home fixtures).
//
// Rates are DERIVED from owned cantrips, not stored — so a reload replays the exact
// same trickle, and the Character panel's readout and the actual production come from
// one source of truth (essenceRates), keeping them impossible to drift apart.

import { CANTRIP_BY_ID } from '../../content/cantrips';
import type { ElementId, GameState } from '../state';
import { awakenHomeEssence, homeEssenceBase } from './home';
import { outputMult } from './skills';

/**
 * Pre-multiplier trickle each awakened element receives, summed from BOTH the owned
 * cantrips that awakened it AND the Home fixtures that feed it (Hearth → fire,
 * Ossuary → dark). Only awakened elements appear — Ossuary awakens Dark on build,
 * and the Hearth requires Spark (Fire already awake), so a fixture's contribution
 * always lands on an awake element.
 */
export function essenceBase(state: GameState): Partial<Record<ElementId, number>> {
  const base: Partial<Record<ElementId, number>> = {};
  for (const id of state.run.skills ?? []) {
    const def = CANTRIP_BY_ID[id];
    if (!def) continue;
    for (const e of def.effects) {
      // v0.1.7: every awakening is now a FIXED `awaken` — Spark → ❖ Prismatic, the six
      // openers → their element. The trickle only counts once the essence is awake.
      if (e.kind === 'awaken' && state.run.essence[e.element]?.awakened) {
        base[e.element] = (base[e.element] ?? 0) + e.trickle;
      }
    }
  }
  const home = homeEssenceBase(state);
  for (const key of Object.keys(home) as ElementId[]) {
    if (state.run.essence[key]?.awakened) base[key] = (base[key] ?? 0) + (home[key] ?? 0);
  }
  return base;
}

/** Per-second essence production per element, with the global output multiplier folded in. */
export function essenceRates(state: GameState): Partial<Record<ElementId, number>> {
  const mult = outputMult(state);
  const base = essenceBase(state);
  const rates: Partial<Record<ElementId, number>> = {};
  for (const key of Object.keys(base) as ElementId[]) {
    rates[key] = (base[key] ?? 0) * mult;
  }
  return rates;
}

/** Advance every awakened element's essence by its trickle × dt. Called by tick.step.
 *  First folds in item/tier essence: awaken any element a Home Modifier now feeds
 *  (Hearth Stone → Fire, Wayfarer Tent → Air) so its trickle counts from this tick. */
export function runEssence(state: GameState, dt: number): void {
  awakenHomeEssence(state);
  const rates = essenceRates(state);
  for (const key of Object.keys(rates) as ElementId[]) {
    state.run.essence[key].amount += (rates[key] ?? 0) * dt;
  }
}

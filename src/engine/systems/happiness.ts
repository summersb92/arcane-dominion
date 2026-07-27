// Happiness — a 0..100 derived read model (no mutation, no stored field) that gates
// population GROWTH. It starts at HAPPINESS.base, drops with crowding (more settlers →
// less content), and rises with assigned Entertainers and luxury buildings
// (the Amphitheater's `happiness` effect). Below HAPPINESS.growthThreshold the settlement
// stops growing (systems/population.ts). Unhappiness never forces settler LOSS this pass —
// starvation still handles loss. Pure engine, no DOM.

import { HAPPINESS } from '../../content/config';
import { BUILDINGS } from '../../content/buildings';
import { activeCount, isConverter } from './buildings';
import type { GameState } from '../state';
import { FORM_LABELS, currentForm, formBonuses, effectivePolicies } from './government';

/** One signed contribution to the happiness total (for the UI readout). */
export interface HappinessLine {
  label: string;
  amount: number; // + raises, − lowers
  /** A LUXURY that isn't stocked deeply enough to pay its full morale bonus — the UI
   *  warns on it, because the fix (hold more) is not obvious from the number alone. */
  short?: boolean;
}

/** How much of a luxury buys one point of happiness AT THE CURRENT SIZE. A luxury is a
 *  per-head comfort: the same pile spread over twice the settlers is half the comfort, so
 *  the per-point cost grows with the population past HAPPINESS.luxuryPopBaseline. */
export function luxuryPerPoint(state: GameState, basePerPoint: number): number {
  const pop = state.run.population.total;
  return basePerPoint * Math.max(1, pop / HAPPINESS.luxuryPopBaseline);
}

/** A luxury's happiness contribution + whether the store falls short of the full bonus. */
function luxuryBonus(
  state: GameState,
  held: number,
  basePerPoint: number,
  max: number,
): { amount: number; perPoint: number; needed: number; short: boolean } {
  const perPoint = luxuryPerPoint(state, basePerPoint);
  const amount = Math.min(max, Math.floor(held / perPoint));
  const needed = max * perPoint; // what it would take to pay the FULL bonus
  return { amount, perPoint, needed, short: amount < max };
}
export interface HappinessInfo {
  value: number; // 0..100, clamped
  status: 'content' | 'unhappy'; // unhappy once below the growth threshold
  breakdown: HappinessLine[];
}

/** Derive current happiness + its component breakdown. */
export function happiness(state: GameState): HappinessInfo {
  const run = state.run;
  const breakdown: HappinessLine[] = [{ label: 'Base', amount: HAPPINESS.base }];

  // Crowding: only settlers ABOVE the free buffer strain the settlement — the first
  // HAPPINESS.freeBuffer live happily at no cost.
  const settlers = run.population.total;
  const crowded = Math.max(0, settlers - HAPPINESS.freeBuffer);
  const crowding = HAPPINESS.crowdingPerSettler * crowded;
  if (crowding > 0) breakdown.push({ label: 'Crowding', amount: -crowding });

  // Culture-job bonus: each assigned Entertainer raises spirits.
  const bards = run.population.jobs.bard ?? 0;
  const bardBonus = HAPPINESS.cultureWorkerBonus * bards;
  if (bardBonus > 0) breakdown.push({ label: 'Entertainers', amount: bardBonus });

  // Luxury buildings: sum every `happiness` building effect × its count (e.g. Amphitheater).
  let luxury = 0;
  for (const b of BUILDINGS) {
    const built = run.buildings[b.id] ?? 0;
    if (built <= 0) continue;
    // A CONVERTER only lifts spirits while it is switched on — a Ward Stone stood down is
    // just a rock. Everything else counts every copy raised.
    const count = isConverter(b) ? activeCount(state, b.id) : built;
    if (count <= 0) continue;
    for (const eff of b.effects) {
      if (eff.kind === 'happiness') {
        const amt = count * eff.amount;
        luxury += amt;
        breakdown.push({ label: `${b.name} (${count})`, amount: amt });
      }
    }
  }

  // Furs are a LUXURY good: held furs lift spirits, at a per-point cost that grows with the
  // population. (Furs keep accumulating past the cap for future trade.)
  const furs = run.resources.furs ?? 0;
  const furLux = luxuryBonus(state, furs, HAPPINESS.fursPerHappiness, HAPPINESS.fursHappinessMax);
  const furBonus = furLux.amount;
  if (furs > 0) {
    breakdown.push({
      label: `Furs (${Math.floor(furs)} / ${Math.ceil(furLux.needed)})`,
      amount: furBonus,
      short: furLux.short,
    });
  }

  // Furniture is a stronger industrial-era LUXURY good (from the Factory): fewer needed per
  // point than furs, capped higher — and scaling with the population just the same.
  const furniture = run.resources.furniture ?? 0;
  const furnLux = luxuryBonus(state, furniture, HAPPINESS.furniturePerHappiness, HAPPINESS.furnitureHappinessMax);
  const furnitureBonus = furnLux.amount;
  if (furniture > 0) {
    breakdown.push({
      label: `Furniture (${Math.floor(furniture)} / ${Math.ceil(furnLux.needed)})`,
      amount: furnitureBonus,
      short: furnLux.short,
    });
  }

  // Governance: the form's passive and each LIVE policy's happiness effect (suspended
  // policies contribute nothing).
  let governance = 0;
  const fb = formBonuses(state);
  if (fb.happiness !== 0) {
    governance += fb.happiness;
    breakdown.push({ label: FORM_LABELS[currentForm(state)], amount: fb.happiness });
  }
  for (const p of effectivePolicies(state)) {
    if (p.happiness) {
      governance += p.happiness;
      breakdown.push({ label: `${p.name} (policy)`, amount: p.happiness });
    }
  }

  const raw = HAPPINESS.base - crowding + bardBonus + luxury + furBonus + furnitureBonus + governance;
  const value = Math.max(0, Math.min(100, raw));
  return {
    value,
    status: value >= HAPPINESS.growthThreshold ? 'content' : 'unhappy',
    breakdown,
  };
}

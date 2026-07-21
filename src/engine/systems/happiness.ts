// Happiness — a 0..100 derived read model (no mutation, no stored field) that gates
// population GROWTH. It starts at HAPPINESS.base, drops with crowding (more settlers →
// less content), and rises with Culture workers (assigned Bards) and luxury buildings
// (the Amphitheater's `happiness` effect). Below HAPPINESS.growthThreshold the settlement
// stops growing (systems/population.ts). Unhappiness never forces settler LOSS this pass —
// starvation still handles loss. Pure engine, no DOM.

import { HAPPINESS } from '../../content/config';
import { BUILDINGS } from '../../content/buildings';
import type { GameState } from '../state';

/** One signed contribution to the happiness total (for the UI readout). */
export interface HappinessLine {
  label: string;
  amount: number; // + raises, − lowers
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

  // Crowding: more settlers strain the settlement.
  const settlers = run.population.total;
  const crowding = HAPPINESS.crowdingPerSettler * settlers;
  if (crowding > 0) breakdown.push({ label: `Crowding (${settlers} settlers)`, amount: -crowding });

  // Culture-job bonus: each assigned Bard raises spirits.
  const bards = run.population.jobs.bard ?? 0;
  const bardBonus = HAPPINESS.cultureWorkerBonus * bards;
  if (bardBonus > 0) breakdown.push({ label: `Bards (${bards})`, amount: bardBonus });

  // Luxury buildings: sum every `happiness` building effect × its count (e.g. Amphitheater).
  let luxury = 0;
  for (const b of BUILDINGS) {
    const count = run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const eff of b.effects) {
      if (eff.kind === 'happiness') {
        const amt = count * eff.amount;
        luxury += amt;
        breakdown.push({ label: `${b.name} (${count})`, amount: amt });
      }
    }
  }

  // Furs are a LUXURY good: held furs lift spirits — +1 happiness per `fursPerHappiness`
  // furs, capped at `fursHappinessMax`. (Furs keep accumulating past the cap for future trade.)
  const furs = run.resources.furs ?? 0;
  const furBonus = Math.min(HAPPINESS.fursHappinessMax, Math.floor(furs / HAPPINESS.fursPerHappiness));
  if (furBonus > 0) breakdown.push({ label: `Furs (${Math.floor(furs)})`, amount: furBonus });

  const raw = HAPPINESS.base - crowding + bardBonus + luxury + furBonus;
  const value = Math.max(0, Math.min(100, raw));
  return {
    value,
    status: value >= HAPPINESS.growthThreshold ? 'content' : 'unhappy',
    breakdown,
  };
}

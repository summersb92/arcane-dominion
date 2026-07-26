// Education — the Arcanum's yield boost, the CURRICULUM specialization dial, and elemental
// OPPOSITION. Pure engine, no DOM.
//
// THREE mechanics live here:
//   1. YIELD BOOST — every Arcanum (and any building with a `yieldBoost` effect) raises
//      magical output: elemental essences and/or Prismatic Mana, whatever produced them.
//   2. CURRICULUM — the Arcanum teaches ONE discipline. That discipline's yield gains
//      EDUCATION.focusBonus; every other magical yield is multiplied by
//      EDUCATION.unfocusedPenalty. Choosing costs nothing but the trade-off itself.
//   3. OPPOSITION — Air opposes Earth, Fire opposes Water. A stronger opposing essence
//      drowns out the weaker one's job empowerment, but only ASYMPTOTICALLY:
//        factor = 1 − maxSuppression × diff / (diff + scale),   diff = max(0, opposing − own)
//      Equal or ahead → factor 1 (no penalty, so specialists never punish themselves).
//      Far behind → approaches (1 − maxSuppression), i.e. a floor of 0.1 — close to a full
//      cancel at extreme gaps, but never actually zero.

import { EDUCATION, OPPOSITION } from '../../content/config';
import { BUILDINGS } from '../../content/buildings';
import { CURRICULUM_BY_ID, CURRICULA, OPPOSITE_ESSENCE, type CurriculumId } from '../../content/education';
import type { ResourceId } from '../../content/resources';
import type { GameState } from '../state';
import { logEvent } from './chronicle';

/** The magical resources education acts upon. */
const ESSENCES: ResourceId[] = ['airEssence', 'earthEssence', 'fireEssence', 'waterEssence'];
export const isEssence = (id: ResourceId): boolean => ESSENCES.includes(id);
export const isMagicYield = (id: ResourceId): boolean => isEssence(id) || id === 'prismatic';

/** Σ yieldBoost effects for a target across all buildings × their counts, as 1+x. */
function yieldBoostMult(state: GameState, target: 'essence' | 'prismatic'): number {
  let m = 1;
  for (const b of BUILDINGS) {
    const count = state.run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const eff of b.effects) {
      if (eff.kind === 'yieldBoost' && eff.target === target) m += count * eff.amount;
    }
  }
  return m;
}

/** True once a discipline can be taught at all (an Arcanum must stand). */
export function educationUnlocked(state: GameState): boolean {
  return (state.run.buildings.arcanum ?? 0) > 0;
}

/** The curriculum in force, or null for general studies. */
export function currentCurriculum(state: GameState): CurriculumId | null {
  const c = state.run.curriculum;
  if (!c || !CURRICULUM_BY_ID[c]) return null;
  return c;
}

/** True if a discipline's tech is researched (it may then be taught). */
export function curriculumAvailable(state: GameState, id: CurriculumId): boolean {
  const def = CURRICULUM_BY_ID[id];
  return !!def && state.run.tech.includes(def.requiresTech as never);
}

/** Teach a discipline (or pass null for general studies). Needs an Arcanum + the tech. */
export function setCurriculum(state: GameState, id: CurriculumId | null): boolean {
  if (!educationUnlocked(state)) return false;
  if (id === null) {
    if (state.run.curriculum === null) return false;
    state.run.curriculum = null;
    logEvent(state, 'The Arcanum returns to general studies.');
    return true;
  }
  if (!curriculumAvailable(state, id)) return false;
  if (state.run.curriculum === id) return false;
  state.run.curriculum = id;
  logEvent(state, `The Arcanum turns its whole attention to ${CURRICULUM_BY_ID[id].name}.`, 'ev');
  return true;
}

/**
 * The total multiplier on a magical resource's PRODUCTION: the Arcanum yield boost, then the
 * curriculum's focus bonus (or its unfocused penalty). 1 for anything non-magical.
 */
export function magicYieldMult(state: GameState, id: ResourceId): number {
  if (!isMagicYield(id)) return 1;
  let m = yieldBoostMult(state, id === 'prismatic' ? 'prismatic' : 'essence');
  const cur = currentCurriculum(state);
  if (cur) {
    const focused = CURRICULUM_BY_ID[cur].resource;
    m *= id === focused ? 1 + EDUCATION.focusBonus : EDUCATION.unfocusedPenalty;
  }
  return m;
}

/**
 * OPPOSITION factor for an essence's job empowerment: how much the opposing element drowns
 * it out. Asymptotic in the DIFFERENCE — 1.0 when equal or ahead, approaching
 * (1 − maxSuppression) when hopelessly outmatched, never 0.
 */
export function oppositionFactor(state: GameState, id: ResourceId): number {
  const opp = OPPOSITE_ESSENCE[id];
  if (!opp) return 1;
  const own = state.run.resources[id] ?? 0;
  const other = state.run.resources[opp] ?? 0;
  const diff = Math.max(0, other - own);
  if (diff <= 0) return 1;
  return 1 - OPPOSITION.maxSuppression * (diff / (diff + OPPOSITION.scale));
}

// ---- read model for the UI ----
export interface CurriculumRowView {
  id: CurriculumId;
  name: string;
  blurb: string;
  resourceLabel: string; // what it specializes in
  active: boolean;
  available: boolean; // its tech is researched
}
export interface EducationView {
  unlocked: boolean; // an Arcanum stands
  arcanums: number;
  current: CurriculumId | null;
  currentName: string;
  focusPct: number; // + % to the focused discipline
  unfocusedPct: number; // − % to everything else
  essenceYieldPct: number; // Arcanum boost to essences, as a %
  prismaticYieldPct: number; // Arcanum boost to prismatic, as a %
  curricula: CurriculumRowView[];
  /** Live opposition readout, one row per element: held, opposing held, and the factor. */
  opposition: { id: ResourceId; label: string; own: number; opposing: number; factor: number }[];
}

export function educationView(state: GameState, label: (id: ResourceId) => string): EducationView {
  const cur = currentCurriculum(state);
  return {
    unlocked: educationUnlocked(state),
    arcanums: state.run.buildings.arcanum ?? 0,
    current: cur,
    currentName: cur ? CURRICULUM_BY_ID[cur].name : 'General studies',
    focusPct: Math.round(EDUCATION.focusBonus * 100),
    unfocusedPct: Math.round((1 - EDUCATION.unfocusedPenalty) * 100),
    essenceYieldPct: Math.round((yieldBoostMult(state, 'essence') - 1) * 100),
    prismaticYieldPct: Math.round((yieldBoostMult(state, 'prismatic') - 1) * 100),
    curricula: CURRICULA.filter((c) => curriculumAvailable(state, c.id) || cur === c.id).map((c) => ({
      id: c.id,
      name: c.name,
      blurb: c.blurb,
      resourceLabel: label(c.resource),
      active: cur === c.id,
      available: curriculumAvailable(state, c.id),
    })),
    opposition: ESSENCES.filter((id) => (state.run.resources[id] ?? 0) > 0 || (state.run.resources[OPPOSITE_ESSENCE[id]!] ?? 0) > 0).map(
      (id) => ({
        id,
        label: label(id),
        own: state.run.resources[id] ?? 0,
        opposing: state.run.resources[OPPOSITE_ESSENCE[id]!] ?? 0,
        factor: oppositionFactor(state, id),
      }),
    ),
  };
}

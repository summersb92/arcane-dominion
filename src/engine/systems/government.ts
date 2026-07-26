// Government — forms and policies (unlocked by the Code of Laws tech).
//
// FORMS are linear: the highest governance tech researched IS the current form
// (Council of Elders → Monarchy → Republic), each with a passive bonus. POLICY SLOTS
// accumulate from the governance techs (+1 each from Code of Laws / Monarchy /
// Civil Service / Republic, max 4).
//
// POLICIES are standing edicts with trade-offs. Each active policy drains CULTURE per
// second as upkeep (runProduction); while the culture jar is EMPTY every policy
// SUSPENDS — enacted but effect-less — until culture flows again. Enact/revoke are
// free actions; the ongoing upkeep is the price. Pure engine, no DOM.

import { POLICIES, POLICY_BY_ID, type PolicyDef, type PolicyId } from '../../content/policies';
import type { GameState } from '../state';
import { logEvent } from './chronicle';

const EPS = 1e-9;

export type GovernmentForm = 'none' | 'council' | 'monarchy' | 'republic';

export const FORM_LABELS: Record<GovernmentForm, string> = {
  none: '—',
  council: 'Council of Elders',
  monarchy: 'Monarchy',
  republic: 'Republic',
};

/** Governance opens with the Code of Laws tech. */
export function governanceUnlocked(state: GameState): boolean {
  return state.run.tech.includes('code-of-laws');
}

/** The current form = the highest governance tech researched. */
export function currentForm(state: GameState): GovernmentForm {
  const t = state.run.tech;
  if (t.includes('republic')) return 'republic';
  if (t.includes('monarchy')) return 'monarchy';
  if (t.includes('code-of-laws')) return 'council';
  return 'none';
}

/** Form passives: Monarchy drives labour; the Republic cultivates culture and spirits. */
export function formBonuses(state: GameState): { workerMult: number; cultureMult: number; happiness: number } {
  switch (currentForm(state)) {
    case 'monarchy':
      return { workerMult: 1.05, cultureMult: 1, happiness: 0 };
    case 'republic':
      return { workerMult: 1, cultureMult: 1.25, happiness: 5 };
    default:
      return { workerMult: 1, cultureMult: 1, happiness: 0 };
  }
}

/** Policy slots: +1 per governance tech (Code of Laws / Monarchy / Civil Service / Republic). */
export function policySlots(state: GameState): number {
  const t = state.run.tech;
  let n = 0;
  if (t.includes('code-of-laws')) n += 1;
  if (t.includes('monarchy')) n += 1;
  if (t.includes('civil-service')) n += 1;
  if (t.includes('republic')) n += 1;
  return n;
}

/** True once a policy's own gates (tech / flag) pass — it may then be enacted. */
export function policyAvailable(state: GameState, def: PolicyDef): boolean {
  if (def.requiresTech && !state.run.tech.includes(def.requiresTech)) return false;
  if (def.requiresFlag && state.run.flags[def.requiresFlag] !== true) return false;
  return true;
}

/** Policies SUSPEND (effects off, upkeep unpaid) while the culture jar is empty. */
export function policiesSuspended(state: GameState): boolean {
  return (state.run.resources.culture ?? 0) <= EPS;
}

/** Every enacted policy def (suspended or not). */
export function activePolicies(state: GameState): PolicyDef[] {
  return state.run.policies.map((id) => POLICY_BY_ID[id]).filter(Boolean);
}

/** The LIVE policies — enacted AND not suspended. What the effect hooks read. */
export function effectivePolicies(state: GameState): PolicyDef[] {
  return policiesSuspended(state) ? [] : activePolicies(state);
}

/** Total culture/s upkeep of the enacted policies (paid while not suspended). */
export function policyUpkeep(state: GameState): number {
  return activePolicies(state).reduce((s, p) => s + p.upkeep, 0);
}

/** Aggregate LIVE policy effects (all 1 / 0 while suspended or with nothing enacted). */
export function policyMults(state: GameState): {
  worker: number;
  foodUpkeep: number;
  researchPerPop: number;
  mana: number;
  happiness: number;
} {
  let worker = 1;
  let food = 1;
  let research = 1;
  let mana = 1;
  let hap = 0;
  for (const p of effectivePolicies(state)) {
    if (p.workerOutputMult) worker *= p.workerOutputMult;
    if (p.foodUpkeepMult) food *= p.foodUpkeepMult;
    if (p.researchPerPopMult) research *= p.researchPerPopMult;
    if (p.manaOutputMult) mana *= p.manaOutputMult;
    if (p.happiness) hap += p.happiness;
  }
  return { worker, foodUpkeep: food, researchPerPop: research, mana, happiness: hap };
}

/** Enact a policy: needs governance, a free slot, and the policy's own gates. */
export function enactPolicy(state: GameState, id: PolicyId): boolean {
  if (!governanceUnlocked(state)) return false;
  const def = POLICY_BY_ID[id];
  if (!def) return false;
  if (state.run.policies.includes(id)) return false;
  if (!policyAvailable(state, def)) return false;
  if (state.run.policies.length >= policySlots(state)) return false;
  state.run.policies.push(id);
  logEvent(state, `${def.name} is enacted.`, 'ev');
  return true;
}

/** Repeal a policy (always allowed). */
export function revokePolicy(state: GameState, id: PolicyId): boolean {
  const i = state.run.policies.indexOf(id);
  if (i < 0) return false;
  state.run.policies.splice(i, 1);
  logEvent(state, `${POLICY_BY_ID[id].name} is repealed.`);
  return true;
}

/** Read model for the Government panel. */
export interface PolicyRowView {
  id: PolicyId;
  name: string;
  blurb: string;
  upkeep: number;
  active: boolean;
  available: boolean; // gates pass (tech/flag)
  canEnact: boolean; // available + a free slot
  effects: { text: string; good: boolean }[]; // human-readable effect lines
}
export interface GovernmentView {
  unlocked: boolean;
  form: GovernmentForm;
  formLabel: string;
  formBonusText: string[]; // the current form's passive, as lines
  slots: number;
  used: number;
  suspended: boolean; // culture is dry — everything enacted is dormant
  upkeep: number; // total culture/s while running
  policies: PolicyRowView[];
}

/** Human lines for a policy's effects (structured → text, one per effect). */
export function policyEffectLines(def: PolicyDef): { text: string; good: boolean }[] {
  const out: { text: string; good: boolean }[] = [];
  const pct = (m: number): string => `${m >= 1 ? '+' : '-'}${Math.round(Math.abs(m - 1) * 100)}%`;
  if (def.workerOutputMult) out.push({ text: `${pct(def.workerOutputMult)} worker output`, good: def.workerOutputMult >= 1 });
  if (def.foodUpkeepMult) out.push({ text: `${pct(def.foodUpkeepMult)} food upkeep`, good: def.foodUpkeepMult <= 1 });
  if (def.researchPerPopMult) out.push({ text: `${pct(def.researchPerPopMult)} settler research`, good: def.researchPerPopMult >= 1 });
  if (def.manaOutputMult) out.push({ text: `${pct(def.manaOutputMult)} mana production`, good: def.manaOutputMult >= 1 });
  if (def.happiness) out.push({ text: `${def.happiness > 0 ? '+' : ''}${def.happiness} happiness`, good: def.happiness > 0 });
  return out;
}

export function governmentView(state: GameState): GovernmentView {
  const unlocked = governanceUnlocked(state);
  const form = currentForm(state);
  const slots = policySlots(state);
  const used = state.run.policies.length;
  const formBonusText: string[] = [];
  const fb = formBonuses(state);
  if (fb.workerMult !== 1) formBonusText.push(`+${Math.round((fb.workerMult - 1) * 100)}% worker output`);
  if (fb.cultureMult !== 1) formBonusText.push(`+${Math.round((fb.cultureMult - 1) * 100)}% Culture production`);
  if (fb.happiness !== 0) formBonusText.push(`+${fb.happiness} happiness`);
  return {
    unlocked,
    form,
    formLabel: FORM_LABELS[form],
    formBonusText,
    slots,
    used,
    suspended: used > 0 && policiesSuspended(state),
    upkeep: policyUpkeep(state),
    policies: POLICIES.filter((p) => policyAvailable(state, p) || state.run.policies.includes(p.id)).map((p) => ({
      id: p.id,
      name: p.name,
      blurb: p.blurb,
      upkeep: p.upkeep,
      active: state.run.policies.includes(p.id),
      available: policyAvailable(state, p),
      canEnact: policyAvailable(state, p) && used < slots && !state.run.policies.includes(p.id),
      effects: policyEffectLines(p),
    })),
  };
}

// Cantrip / Skills system — the Insight-bought DAG (spec §5). Pure engine
// (NO DOM/Svelte): the same code runs in the browser, the CLI, and tests.
//
// Responsibilities:
//   • learnCantrip(id)                 — player/CLI/UI action: spend Insight → own it → apply effects
//   • outputMult(state)                — the global "+X% all output" multiplier from owned cantrips
//   • derived read model               — cantripInfo / listCantripInfo for the UI/CLI (no display strings)
//
// Owned cantrip ids live in state.run.skills (a plain string[]); the definitions
// live in src/content/cantrips.ts. Awakening an element flips essence[id].awakened
// and, from then on, essence.ts derives that element's trickle from the owned cantrip.

import { CANTRIPS, CANTRIP_BY_ID, type Cantrip } from '../../content/cantrips';
import { AMOUNT_LABEL } from '../../content/tasks';
import type { ElementId, GameState } from '../state';
import { logEvent } from './chronicle';
import { effectiveCap } from './home';
import { dominantAffinity } from './player';

const EPS = 1e-9;

/** The six elemental essences an opener can awaken (Prismatic is excluded — it is the
 *  generic essence Spark provides, and does NOT count toward the opener cost scaling). */
const OPENER_ELEMENTS: ElementId[] = ['fire', 'water', 'earth', 'air', 'light', 'dark'];

/** How many of the six elemental essences are already awakened (excludes ❖ Prismatic).
 *  Drives the dynamic opener cost + the "reveal the rest after your first awakening" gate. */
export function awakenedElementCount(state: GameState): number {
  let n = 0;
  for (const el of OPENER_ELEMENTS) if (state.run.essence[el]?.awakened) n++;
  return n;
}

/** The effective Insight cost of the NEXT elemental opener (v0.1.7): base 40 × 1.6ⁿ, where
 *  n is the number of elements already awakened. 40 → 64 → 102 → 164 → 262 → 419. */
export function openerCost(state: GameState): number {
  return Math.round(40 * Math.pow(1.6, awakenedElementCount(state)));
}

/** The Insight cost actually charged/displayed for a cantrip: an elementOpener's cost is the
 *  dynamic openerCost (which climbs as you open more elements); everything else is its static cost. */
export function effectiveCost(state: GameState, def: Cantrip): number {
  return def.elementOpener ? openerCost(state) : def.cost;
}

/** Is this cantrip already owned? */
export function isLearned(state: GameState, id: string): boolean {
  return (state.run.skills ?? []).includes(id);
}

/** Are every prerequisite cantrip owned (the DAG gate)? */
function prereqsMet(state: GameState, def: Cantrip): boolean {
  return def.requires.every((r) => isLearned(state, r));
}

/** Has this elemental opener been "unveiled" yet? After Spark, only the DOMINANT-affinity
 *  opener is offered; the other five surface once you've awakened at least one element. */
function openerRevealed(state: GameState, def: Cantrip): boolean {
  const fixed = def.effects.find((e) => e.kind === 'awaken') as { element: ElementId } | undefined;
  if (!fixed) return true;
  return fixed.element === dominantAffinity(state) || awakenedElementCount(state) >= 1;
}

/** The cost sits above the current Insight cap → it can never be afforded until the cap rises.
 *  Reads the EFFECTIVE cap (base + any item `max` mods) — the single source of truth, and the
 *  EFFECTIVE cost (dynamic for elemental openers), so a 40+ opener wears the `*` under the cap. */
export function exceedsCap(state: GameState, def: Cantrip): boolean {
  return effectiveCost(state, def) > effectiveCap(state, 'insight') + EPS;
}

/** Global output multiplier: 1 + Σ(owned outputMult cantrips). Applied to task output AND essence trickle. */
export function outputMult(state: GameState): number {
  let m = 1;
  for (const id of state.run.skills ?? []) {
    const def = CANTRIP_BY_ID[id];
    if (!def) continue;
    for (const e of def.effects) if (e.kind === 'outputMult') m += e.add;
  }
  return m;
}

function applyCantripEffect(state: GameState, e: Cantrip['effects'][number]): void {
  switch (e.kind) {
    case 'awaken': {
      const ess = state.run.essence[e.element];
      if (ess) ess.awakened = true;
      logEvent(state, `${AMOUNT_LABEL[e.element] ?? e.element} essence awakens — it begins to trickle.`, 'ev');
      break;
    }
    case 'vitalRegen':
      state.run.vitals[e.vital].regen += e.amount;
      break;
    case 'unlockVital': {
      // Inner Wellspring unlocks Mana: set its max + regen (it was locked at max 0 / regen 0).
      const v = state.run.vitals[e.vital];
      v.max = e.max;
      v.regen = e.regen;
      break;
    }
    case 'flag':
      state.run.flags[e.flag] = true;
      break;
    // outputMult + openTree are derived/flavour — nothing to persist at learn time.
    case 'outputMult':
    case 'openTree':
      break;
  }
}

/**
 * Learn a cantrip: DAG prereqs met, not already owned, enough Insight (which by
 * definition fits under the cap), AND enough Scrolls (every cantrip past the free
 * opener costs 1 — v0.1.2). Spends both, records the id, applies effects.
 * Returns false (no mutation) if refused.
 */
export function learnCantrip(state: GameState, id: string): boolean {
  const def = CANTRIP_BY_ID[id];
  if (!def) return false;
  if (isLearned(state, id)) return false;
  if (!prereqsMet(state, def)) return false;
  // An elemental opener is unlearnable until it has been unveiled (dominant first, the
  // rest after your first awakening) — the same gate cantripInfo reports as 'locked'.
  if (def.elementOpener && !openerRevealed(state, def)) return false;
  // Charge the EFFECTIVE cost (dynamic for elemental openers) — computed BEFORE effects
  // apply, so this opener pays for the count of elements awakened up to now.
  const cost = effectiveCost(state, def);
  if (state.run.resources.insight < cost - EPS) return false;
  const scrollCost = def.scrollCost ?? 0;
  if ((state.run.resources.scroll ?? 0) < scrollCost - EPS) return false;

  state.run.resources.insight -= cost;
  if (scrollCost) state.run.resources.scroll -= scrollCost;
  if (!state.run.skills) state.run.skills = [];
  state.run.skills.push(id);
  for (const e of def.effects) applyCantripEffect(state, e);
  // Learning an opener locks the contract 'affinity' essence to your FIRST-awakened
  // element (until then, contracts resolve the sentinel to ❖ Prismatic from Spark).
  if (def.elementOpener && state.run.affinityElement == null) {
    const fixed = def.effects.find((e) => e.kind === 'awaken') as { element: ElementId } | undefined;
    if (fixed) state.run.affinityElement = fixed.element;
  }
  logEvent(state, `Learned cantrip: ${def.name}.`, 'ev');
  return true;
}

// ---- derived read model (no display glyphs — the UI/CLI format these) ----
export type CantripStatus = 'owned' | 'available' | 'locked';

export interface CantripInfo {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  scrollCost: number; // Scrolls 📜 required to learn (0 for the opener; v0.1.2)
  hasScroll: boolean; // enough Scrolls on hand right now (for the "needs a Scroll" hint)
  requires: string[];
  status: CantripStatus;
  affordable: boolean; // Insight ≥ cost AND enough Scrolls right now
  exceedsCap: boolean; // cost > Insight cap → wears the `*` marker
  missingPrereqs: string[]; // unmet prereq ids (names resolved by the UI)
  prereqNote?: string; // engine-side lock note that ISN'T a missing prereq (e.g. an un-unveiled opener)
  awakensElement?: ElementId; // set when an effect awakens an essence
  effectText: string; // engine-side human summary ("awakens Fire essence (+0.2/s)")
}

function effectText(_state: GameState, def: Cantrip): string {
  const parts = def.effects
    .map((e) => {
      switch (e.kind) {
        case 'awaken':
          return `awakens ${AMOUNT_LABEL[e.element] ?? e.element} essence (+${e.trickle}/s)`;
        case 'vitalRegen':
          return `+${e.amount} ${AMOUNT_LABEL[e.vital] ?? e.vital} regen`;
        case 'unlockVital':
          return `unlocks ${AMOUNT_LABEL[e.vital] ?? e.vital} (max ${e.max}, +${e.regen}/s)`;
        case 'outputMult':
          return `+${Math.round(e.add * 100)}% all output`;
        case 'openTree':
          return 'opens the cantrip web';
        case 'flag':
          // v0.1.7: Spark's affinityRevealed flag reads as its narrative payload.
          return e.flag === 'affinityRevealed' ? 'reveals your affinity' : `unlocks ${e.flag}`;
      }
    })
    .filter(Boolean);
  return parts.join(' · ');
}

export function cantripInfo(state: GameState, def: Cantrip): CantripInfo {
  const owned = isLearned(state, def.id);
  const missingPrereqs = def.requires.filter((r) => !isLearned(state, r));
  // An elemental opener is 'locked' until it has been unveiled (prereqs met AND its element
  // is your dominant affinity OR you've already awakened one element), even with Spark owned.
  const unveiled = def.elementOpener ? openerRevealed(state, def) : true;
  const status: CantripStatus = owned
    ? 'owned'
    : missingPrereqs.length || !unveiled
      ? 'locked'
      : 'available';
  // A not-yet-unveiled opener has no MISSING prereq (Spark is owned) — give it its own note.
  const prereqNote =
    def.elementOpener && !owned && !missingPrereqs.length && !unveiled
      ? "your affinity hasn't surfaced this yet"
      : undefined;
  // The element a card advertises comes straight from its fixed `awaken` effect (Spark → ❖ Prism).
  const fixedAwaken = def.effects.find((e) => e.kind === 'awaken') as
    | { kind: 'awaken'; element: ElementId; trickle: number }
    | undefined;
  const awakensElement: ElementId | undefined = fixedAwaken?.element;
  const scrollCost = def.scrollCost ?? 0;
  const hasScroll = (state.run.resources.scroll ?? 0) >= scrollCost - EPS;
  const cost = effectiveCost(state, def);
  const insightEnough = state.run.resources.insight >= cost - EPS;
  return {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    cost,
    scrollCost,
    hasScroll,
    requires: def.requires,
    status,
    affordable: insightEnough && hasScroll,
    exceedsCap: exceedsCap(state, def),
    missingPrereqs,
    prereqNote,
    awakensElement,
    effectText: effectText(state, def),
  };
}

export function listCantripInfo(state: GameState): CantripInfo[] {
  return CANTRIPS.map((def) => cantripInfo(state, def));
}

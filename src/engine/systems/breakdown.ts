// Breakdown read model (v0.1.1 QoL) — the structured "what produces / consumes /
// multiplies this?" data behind the resource / material / vital / essence hover
// tooltips. Pure engine (NO DOM/Svelte): it only reads canonical state and reuses
// the existing systems (netPerSecond's building blocks, homeRateContribs, activeMods,
// effectiveRegen, effectiveCap, outputMult, jobOutputMult) rather than recomputing —
// so a breakdown can never drift from what the tick actually applies.
//
// Amounts are BASE (pre-global-multiplier), matching the older sourced-number tips:
// producers list their base rate, the `multipliers` line names the global factors
// (Kindle Focus × / Tool Belt ×), and `net` is the final per-second figure with the
// multiplier folded in. Consumers (run costs, amortized running start-costs, rent)
// are never multiplied, so they read literally.

import { TASKS, type VitalId } from '../../content/tasks';
import { CANTRIP_BY_ID } from '../../content/cantrips';
import { ELEMENTS, type ElementId, type GameState, type ResourceId } from '../state';
import { outputMult } from './skills';
import { effectiveCap, effectiveRegen, homeRateContribs, homeTier, jobOutputMult } from './home';
import { resolveAffinityId } from './tasks';

const EPS = 1e-9;

/** What a breakdown is being computed for. */
export type BreakdownTarget =
  | { kind: 'resource'; id: ResourceId }
  | { kind: 'vital'; id: VitalId }
  | { kind: 'essence'; id: ElementId };

/** A single named per-second contribution (produce or consume), pre-multiplier. */
export interface BreakdownEntry {
  name: string;
  amount: number; // always positive; producers add, consumers subtract
}

/** A named global multiplier that applies to production. */
export interface BreakdownMult {
  name: string;
  factor: number;
}

export interface Breakdown {
  produces: BreakdownEntry[];
  consumes: BreakdownEntry[];
  multipliers: BreakdownMult[];
  net: number; // final per-second (production × multipliers − consumption)
  cap?: number; // effective storage cap (finite resources only)
  atCap?: boolean; // amount is at/over cap → production wasted
  locked?: boolean; // e.g. a sealed vital (Mana before Inner Wellspring)
}

/** Per-second base PRODUCTION of a resource from one active task (perpetual output/s,
 *  or timed output/length). Returns 0 for tasks that don't produce it. */
function taskResourceProduction(def: (typeof TASKS)[number], id: ResourceId): number {
  let prod = 0;
  if (def.type === 'perpetual') {
    for (const o of def.output ?? []) if (o.id === id) prod += o.amount;
  } else if (def.type === 'running' || def.type === 'limited') {
    const len = def.length && def.length > 0 ? def.length : 1;
    for (const o of def.output ?? []) if (o.id === id) prod += o.amount / len;
  }
  return prod;
}

function resourceBreakdown(state: GameState, id: ResourceId): Breakdown {
  const mult = outputMult(state);
  const jobMult = jobOutputMult(state);
  const produces: BreakdownEntry[] = [];
  const consumes: BreakdownEntry[] = [];
  let anyJobProducer = false;

  for (const def of TASKS) {
    const rt = state.run.tasks?.[def.id];
    if (!rt?.active || rt.paused) continue;

    const prod = taskResourceProduction(def, id);
    if (prod > EPS) {
      produces.push({ name: def.name, amount: prod });
      if (def.job) anyJobProducer = true;
    }

    // Consumption: per-second run costs + (running only) the start-cost amortized over
    // the cycle, mirroring netPerSecond's drain model so the two never disagree.
    let cons = 0;
    for (const c of def.runCost ?? []) if (c.pool === 'resource' && c.id === id) cons += c.amount;
    if (def.type === 'running') {
      const len = def.length && def.length > 0 ? def.length : 1;
      for (const c of def.startCost ?? []) if (c.pool === 'resource' && c.id === id) cons += c.amount / len;
    }
    if (cons > EPS) consumes.push({ name: def.name, amount: cons });
  }

  // Home item/tier per-second production (Focusing Lens → Insight, Homestead → ore…).
  for (const c of homeRateContribs(state)) {
    if (c.target === id && c.amount > EPS) produces.push({ name: c.name, amount: c.amount });
  }
  // Home rent drains a resource each second (Inn Room → Gold), never multiplied.
  const tier = homeTier(state);
  for (const c of tier.rent ?? []) {
    if (c.pool === 'resource' && c.id === id && c.amount > EPS) {
      consumes.push({ name: `${tier.name} rent`, amount: c.amount });
    }
  }

  const multipliers: BreakdownMult[] = [];
  if (Math.abs(mult - 1) > EPS) multipliers.push({ name: 'Kindle Focus', factor: mult });
  if (Math.abs(jobMult - 1) > EPS && anyJobProducer) multipliers.push({ name: 'Tool Belt', factor: jobMult });

  const cap = effectiveCap(state, id);
  const finiteCap = Number.isFinite(cap);
  const atCap = finiteCap && (state.run.resources[id] ?? 0) >= cap - EPS;
  const prodTotal = produces.reduce((s, p) => s + p.amount, 0) * mult;
  const consTotal = consumes.reduce((s, c) => s + c.amount, 0);
  const net = prodTotal - consTotal;

  return { produces, consumes, multipliers, net, cap: finiteCap ? cap : undefined, atCap };
}

function vitalBreakdown(state: GameState, id: VitalId): Breakdown {
  const vital = state.run.vitals[id];
  // A sealed vital (Mana at max 0 before Inner Wellspring) has no meaningful flow.
  if (vital.max <= 0) {
    return { produces: [], consumes: [], multipliers: [], net: 0, locked: true };
  }

  const produces: BreakdownEntry[] = [];
  const consumes: BreakdownEntry[] = [];

  // Base regen already folds in learned cantrip bonuses (Mend → +Stamina regen),
  // baked into vital.regen at learn time; item/tier rate mods are added on top.
  if (vital.regen > EPS) produces.push({ name: 'base regen', amount: vital.regen });
  for (const c of homeRateContribs(state)) {
    if (c.target === id && c.amount > EPS) produces.push({ name: c.name, amount: c.amount });
  }

  // Drains: active, non-paused task run costs against this vital (+ running amortized
  // start-cost, for completeness — no current task carries a vital start-cost).
  for (const def of TASKS) {
    const rt = state.run.tasks?.[def.id];
    if (!rt?.active || rt.paused) continue;
    let cons = 0;
    for (const c of def.runCost ?? []) if (c.pool === 'vital' && c.id === id) cons += c.amount;
    if (def.type === 'running') {
      const len = def.length && def.length > 0 ? def.length : 1;
      for (const c of def.startCost ?? []) if (c.pool === 'vital' && c.id === id) cons += c.amount / len;
    }
    if (cons > EPS) consumes.push({ name: def.name, amount: cons });
  }

  // effectiveRegen = base + item/tier rate mods = Σ producers (single source of truth).
  const net = effectiveRegen(state, id) - consumes.reduce((s, c) => s + c.amount, 0);
  return { produces, consumes, multipliers: [], net };
}

function essenceBreakdown(state: GameState, id: ElementId): Breakdown {
  const mult = outputMult(state);
  const produces: BreakdownEntry[] = [];
  const consumes: BreakdownEntry[] = [];

  // Cantrip trickles that awakened this element — every awakening is now a fixed `awaken`
  // (v0.1.7): Spark → ❖ Prismatic, the six openers → their element.
  for (const sid of state.run.skills ?? []) {
    const def = CANTRIP_BY_ID[sid];
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === 'awaken' && e.element === id) produces.push({ name: def.name, amount: e.trickle });
    }
  }
  // Home essence producers (Hearth Stone → Fire, Wayfarer Tent → Air).
  for (const c of homeRateContribs(state)) {
    if (c.target === id && c.amount > EPS) produces.push({ name: c.name, amount: c.amount });
  }
  // Contracts burn essence per second while active. Their cost id may be the 'affinity'
  // sentinel — resolve it to the real element so the drain lands on the right essence.
  for (const def of TASKS) {
    const rt = state.run.tasks?.[def.id];
    if (!rt?.active || rt.paused) continue;
    let cons = 0;
    for (const c of def.runCost ?? []) {
      if (c.pool === 'essence' && resolveAffinityId(state, c.id) === id) cons += c.amount;
    }
    if (cons > EPS) consumes.push({ name: def.name, amount: cons });
  }

  const multipliers: BreakdownMult[] = [];
  if (Math.abs(mult - 1) > EPS && produces.length) multipliers.push({ name: 'Kindle Focus', factor: mult });

  const prodTotal = produces.reduce((s, p) => s + p.amount, 0) * mult;
  const consTotal = consumes.reduce((s, c) => s + c.amount, 0);
  return { produces, consumes, multipliers, net: prodTotal - consTotal };
}

/** Structured producers/consumers/multipliers breakdown for a resource, vital, or
 *  essence — the read model behind the left/right panel hover tooltips. */
export function breakdown(state: GameState, target: BreakdownTarget): Breakdown {
  switch (target.kind) {
    case 'resource':
      return resourceBreakdown(state, target.id);
    case 'vital':
      return vitalBreakdown(state, target.id);
    case 'essence':
      return essenceBreakdown(state, target.id);
  }
}

/** Guard used by callers that accept a loosely-typed id. */
export function isElementId(id: string): id is ElementId {
  return (ELEMENTS as string[]).includes(id);
}

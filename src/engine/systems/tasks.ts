// Task/Activity system — the core game loop. Pure engine (NO DOM/Svelte): the same
// code runs in the browser tick, in `simulate()`, offline catch-up, and the CLI.
//
// Responsibilities:
//   • runTasks(dt)                     — advance every active task one step (called by tick.step)
//   • doTask / startTask / stopTask    — player/CLI/UI actions
//   • toggleRepeat                     — the in-card ↻ toggle for Running tasks
//   • startup cost + per-second running cost, with AUTO-PAUSE when a run cost can't
//     be paid and AUTO-RESUME when it can again
//   • "At N" repeat-scaling, Limited (Max) caps + completion effects, Activity slots
//   • derived read models for the UI/CLI: listTaskInfo, taskRates, slotsUsed, activitySlots
//
// The runtime (active/progress/paused/count/repeat) lives in state.run.tasks[id];
// the definitions live in src/content/tasks.ts. Read paths never mutate state.

import { STARTING } from '../../content/config';
import {
  TASKS,
  TASK_BY_ID,
  AMOUNT_LABEL,
  isContinuous,
  type Amount,
  type AmountId,
  type Pool,
  type Requirement,
  type TaskDef,
  type TaskEffect,
  type VitalId,
} from '../../content/tasks';
import { ELEMENTS, type ElementId, type GameState, type ResourceId, type TaskRuntime } from '../state';
import { drawRng } from '../rng';
import { logEvent } from './chronicle';
import { outputMult } from './skills';
import { effectiveCap, jobOutputMult } from './home';
import { strength, addStrengthXp } from './player';

/** Strength XP earned per completion of a physical-labour (strengthScaled) task. */
const STRENGTH_XP_PER_LABOR = 1;

/** Resolve the 'affinity' essence sentinel to the awakened affinity element, or to ❖ Prismatic
 *  when no element has been opened yet (v0.1.7 — Spark provides Prismatic, so early contracts
 *  stay sustainable on its trickle). Any other id passes through unchanged. Exported so the
 *  breakdown read model resolves contract essence costs the same way the sim does. */
export function resolveAffinityId(state: GameState, id: AmountId): AmountId {
  return id === 'affinity' ? state.run.affinityElement ?? 'prism' : id;
}

const RESOURCE_IDS: ResourceId[] = ['gold', 'insight', 'renown', 'moonpetal', 'ironOre', 'spiritDust', 'scroll'];
const EPS = 1e-9;

/** The element-TOOL multiplier for an element (v0.1.5): 1 + Σ toolBoost.mult over every
 *  OWNED tool task (count > 0) whose toolBoost targets this element. Derived purely from
 *  task counts — no new persistent state. A player with no matching tool gets ×1. */
export function elementToolMult(state: GameState, element: ElementId): number {
  let m = 1;
  for (const def of TASKS) {
    const boost = def.toolBoost;
    if (boost && boost.element === element && peekRuntime(state, def.id).count > 0) {
      m += boost.mult;
    }
  }
  return m;
}

/** Total output multiplier for a task: the global Kindle Focus mult, plus the Tool
 *  Belt's job-output mult for Odd Jobs (`job:true`), plus the Strength stat for
 *  strength-scaled physical labour (Clean Stables), plus the element-TOOL boost for an
 *  element-tagged job (Smith's Hammer → Smith, etc.) — all applied multiplicatively. */
function taskOutputScale(state: GameState, def: TaskDef): number {
  return (
    outputMult(state) *
    (def.job ? jobOutputMult(state) : 1) *
    (def.strengthScaled ? strength(state) : 1) *
    (def.element ? elementToolMult(state, def.element) : 1)
  );
}

// ---- derived read model (no display strings — the UI/CLI format these) ----
export interface TaskInfo {
  id: string;
  active: boolean;
  paused: boolean;
  progress: number; // 0..1
  count: number; // completions
  repeat: boolean;
  locked: boolean; // requirements unmet OR Limited maxed → dim & non-clickable
  revealed: boolean; // DISPLAY-ONLY: show the card at all (far-locked cards stay hidden)
  maxed: boolean; // Limited && count >= max
  affordable: boolean; // startCost payable right now (ignores slots)
  slotFull: boolean; // continuous, not active, and no free Activity slot
  startable: boolean; // can start/do this instant
  pausedResourceId?: AmountId; // the starved pool when paused (Auto-Pause Explained)
  net: Partial<Record<AmountId, number>>; // per-second net while running (payoff preview + rates)
}

// ---- pool access ----
function poolCur(state: GameState, pool: Pool, id: AmountId): number {
  switch (pool) {
    case 'resource':
      return state.run.resources[id as ResourceId] ?? 0;
    case 'vital':
      return state.run.vitals[id as VitalId].cur;
    case 'essence':
      return state.run.essence[resolveAffinityId(state, id) as ElementId].amount;
  }
}

/** Add `a.amount * scale` to its pool. Negative scale = spend; positive = gain. Vitals clamp to [0,max]. */
function addPool(state: GameState, a: Amount, scale: number): void {
  const delta = a.amount * scale;
  switch (a.pool) {
    case 'resource':
      state.run.resources[a.id as ResourceId] += delta;
      break;
    case 'vital': {
      const v = state.run.vitals[a.id as VitalId];
      v.cur = Math.max(0, Math.min(v.max, v.cur + delta));
      break;
    }
    case 'essence':
      state.run.essence[resolveAffinityId(state, a.id) as ElementId].amount += delta;
      break;
  }
}

/** Apply a signed amount list (exported so systems/home reuses it for item/tier costs). */
export function applyAmounts(state: GameState, list: Amount[] | undefined, scale: number): void {
  if (!list) return;
  for (const a of list) addPool(state, a, scale);
}

/** Can every cost be paid at `scale` (scale = dt for per-second costs, 1 for lump)?
 *  Exported so systems/home reuses it for move/buy affordability. */
export function canAfford(state: GameState, costs: Amount[] | undefined, scale: number): boolean {
  if (!costs) return true;
  for (const c of costs) {
    if (poolCur(state, c.pool, c.id) < c.amount * scale - EPS) return false;
  }
  return true;
}

// ---- runtime helpers ----
function freshRuntime(): TaskRuntime {
  return { active: false, progress: 0, paused: false, count: 0, repeat: false };
}
/** Read-only view of a runtime — never mutates state (safe during render).
 *  `tasks?.` guards the render path: toView() can run on a freshly-loaded save
 *  before the first tick's self-heal, and a legacy/partial save may lack run.tasks. */
function peekRuntime(state: GameState, id: string): TaskRuntime {
  return state.run.tasks?.[id] ?? freshRuntime();
}
/** Get-or-create the stored runtime — for action paths only. */
function getRuntime(state: GameState, id: string): TaskRuntime {
  let rt = state.run.tasks[id];
  if (!rt) {
    rt = freshRuntime();
    state.run.tasks[id] = rt;
  }
  return rt;
}

// ---- requirements / effects / scaling ----
/** Evaluate a Requirement[] gate against the state. Exported so systems/home reuses
 *  the SAME evaluator for housing-tier + item gates (one source of truth). */
export function meetsRequirements(state: GameState, requires: Requirement[] | undefined): boolean {
  if (!requires) return true;
  for (const r of requires) {
    switch (r.kind) {
      case 'flag':
        if (state.run.flags[r.flag] !== true) return false;
        break;
      case 'resource':
        if ((state.run.resources[r.id] ?? 0) < r.atLeast) return false;
        break;
      case 'skill':
        if (!(state.run.skills ?? []).includes(r.id)) return false;
        break;
      case 'taskCount':
        if (peekRuntime(state, r.id).count < r.atLeast) return false;
        break;
    }
  }
  return true;
}

function requirementsMet(state: GameState, def: TaskDef): boolean {
  return meetsRequirements(state, def.requires as Requirement[] | undefined);
}

function applyEffect(state: GameState, e: TaskEffect): void {
  switch (e.kind) {
    case 'activitySlot':
      state.run.activitySlots = activitySlots(state) + e.amount;
      logEvent(state, `Activity slots widened to ${state.run.activitySlots}.`, 'ev');
      break;
    case 'flag':
      state.run.flags[e.flag] = e.value ?? true;
      break;
    case 'raiseInsightCap':
      state.run.caps.insight += e.amount;
      break;
    case 'raiseGoldCap':
      state.run.caps.gold += e.amount;
      break;
    case 'awakenElement': {
      // Home Ossuary awakens ☾ Dark on its first build. Idempotent across levels —
      // only the first flip logs, so re-completing (leveling) never re-announces.
      const ess = state.run.essence[e.element];
      if (ess && !ess.awakened) {
        ess.awakened = true;
        logEvent(state, `${AMOUNT_LABEL[e.element] ?? e.element} essence awakens — it begins to trickle.`, 'ev');
      }
      break;
    }
    case 'beginLodging': {
      // Find Lodging (v0.1.5) is the SOLE entry point to housing now (the auto lair beat
      // was removed): reveal the Home tab (lairFounded) and move into the Inn directly.
      // Further moves use the normal Home UI; this is the special entry point.
      state.run.flags.lairFounded = true;
      if (state.run.phase === 'origin' || state.run.phase === 'awakened') state.run.phase = 'lair';
      if (state.run.home) state.run.home.tier = 'inn';
      logEvent(state, "You take a room at the inn — a roof, a bed, and a landlord's tab.", 'found');
      break;
    }
  }
}

/** Output for the next completion, with "At N" bonuses folded into the primary output. */
function effectiveOutput(def: TaskDef, completionsSoFar: number): Amount[] {
  if (!def.output) return [];
  const bonus = def.atN
    ? def.atN.reduce((sum, t) => (completionsSoFar >= t.at ? sum + t.bonus : sum), 0)
    : 0;
  if (!bonus) return def.output;
  return def.output.map((o, i) => (i === 0 ? { ...o, amount: o.amount + bonus } : o));
}

function numStr(x: number): string {
  return String(+x.toFixed(2));
}
function completionText(def: TaskDef, outs: Amount[]): string {
  if (!outs.length) return `Completed: ${def.name}.`;
  const parts = outs.map((o) => `+${numStr(o.amount)} ${AMOUNT_LABEL[o.id] ?? o.id}`);
  return `${def.name}: ${parts.join(', ')}.`;
}

/** Deterministic random loot (Scavenge): pick ONE id via the seeded RNG (advancing
 *  state.rngState so it survives save/load), grant `amount` respecting the effective
 *  cap, and chronicle it. No-op unless the def declares randomOutput. */
function grantRandomOutput(state: GameState, def: TaskDef): void {
  if (!def.randomOutput) return;
  const { ids, amount } = def.randomOutput;
  if (!ids.length) return;
  const idx = drawRng(state, (r) => r.int(0, ids.length - 1));
  const chosen = ids[idx] as ResourceId;
  const cap = effectiveCap(state, chosen);
  const cur = state.run.resources[chosen] ?? 0;
  state.run.resources[chosen] = Math.min(cap, cur + amount);
  logEvent(state, `${def.name}: +${amount} ${AMOUNT_LABEL[chosen] ?? chosen}.`, 'ev');
}

/** Completion side-effects shared by instant (doTask) and timed (completeCycle) paths:
 *  bump the hidden per-element affinity for an element-tagged task, and train Strength
 *  for physical (strengthScaled) labour. Called once per completion, after output. */
function onCompletion(state: GameState, def: TaskDef): void {
  if (def.element && state.run.affinity) {
    state.run.affinity[def.element] = (state.run.affinity[def.element] ?? 0) + 1;
  }
  if (def.strengthScaled) addStrengthXp(state, STRENGTH_XP_PER_LABOR);
}

// ---- per-step advance ----
/** Grant one cycle's output, bump count, run completion effects, chronicle it. */
function completeCycle(state: GameState, def: TaskDef, rt: TaskRuntime): void {
  const outs = effectiveOutput(def, rt.count);
  applyAmounts(state, outs, taskOutputScale(state, def)); // Kindle Focus + Tool Belt (jobs)
  grantRandomOutput(state, def);
  rt.count += 1;
  onCompletion(state, def);
  if (def.effects) for (const e of def.effects) applyEffect(state, e);
  if (outs.length || !def.randomOutput) logEvent(state, completionText(def, outs), 'ev');
}

/** After a completion, decide whether the task keeps running. Returns true to carry on. */
function continueAfterCompletion(state: GameState, def: TaskDef, rt: TaskRuntime): boolean {
  if (def.type === 'limited') {
    // One start = one cycle. Re-startable until Max; stays stopped here.
    rt.active = false;
    rt.progress = 0;
    return false;
  }
  // running
  if (rt.repeat && canAfford(state, def.startCost, 1)) {
    applyAmounts(state, def.startCost, -1);
    return true;
  }
  if (rt.repeat) logEvent(state, `${def.name} stopped — can't afford to repeat.`);
  rt.active = false;
  rt.progress = 0;
  return false;
}

function stepTask(state: GameState, def: TaskDef, rt: TaskRuntime, dt: number): void {
  // Per-second running cost → auto-pause when it can't be paid, auto-resume when it can.
  if (def.runCost && def.runCost.length) {
    if (!canAfford(state, def.runCost, dt)) {
      rt.paused = true;
      return; // no charge, no progress, no output while starved
    }
    rt.paused = false;
    applyAmounts(state, def.runCost, -dt);
  } else {
    rt.paused = false;
  }

  if (def.type === 'perpetual') {
    applyAmounts(state, def.output, dt * taskOutputScale(state, def)); // Kindle Focus (+% all output)
    return;
  }

  // running / limited (timed)
  const length = def.length && def.length > 0 ? def.length : 0;
  if (length === 0) {
    completeCycle(state, def, rt);
    continueAfterCompletion(state, def, rt);
    return;
  }
  rt.progress += dt / length;
  let guard = 0;
  // Complete within EPS of 1: a `length` that divides dt evenly (e.g. Grand Library
  // length:8 over 0.1s ticks) accumulates to 0.9999999999999984, not exactly 1, from
  // 0.1's binary representation — the same reason advanceFixed() floors with +1e-9.
  // Without this the task would strand its slot + spent start-cost for one extra tick.
  while (rt.progress >= 1 - EPS && guard++ < 1000) {
    completeCycle(state, def, rt);
    if (!continueAfterCompletion(state, def, rt)) break;
    rt.progress -= 1;
  }
  if (rt.progress < 0) rt.progress = 0;
}

/** Advance every active task by `dt`. Called by tick.step (before caps clamp output). */
export function runTasks(state: GameState, dt: number): void {
  const run = state.run;
  if (typeof run.activitySlots !== 'number') run.activitySlots = STARTING.activitySlots; // heal legacy saves
  if (!run.tasks) run.tasks = {};
  for (const def of TASKS) {
    const rt = run.tasks[def.id];
    if (rt && rt.active) stepTask(state, def, rt, dt);
  }
}

// ---- actions (player / UI / CLI) ----
/** Instant one-shot: pay → gain, once. Returns false if gated or unaffordable. */
export function doTask(state: GameState, id: string): boolean {
  const def = TASK_BY_ID[id];
  if (!def || def.type !== 'instant') return false;
  if (!requirementsMet(state, def)) return false;
  if (!canAfford(state, def.startCost, 1)) return false;
  const rt = getRuntime(state, id);
  applyAmounts(state, def.startCost, -1);
  const outs = effectiveOutput(def, rt.count);
  applyAmounts(state, outs, taskOutputScale(state, def)); // Kindle Focus + Tool Belt (jobs)
  grantRandomOutput(state, def);
  rt.count += 1;
  onCompletion(state, def);
  if (def.effects) for (const e of def.effects) applyEffect(state, e);
  if (outs.length || !def.randomOutput) logEvent(state, completionText(def, outs), 'ev');
  return true;
}

/** Start a continuous task (occupies a slot). Instant ids route to doTask for convenience. */
export function startTask(state: GameState, id: string): boolean {
  const def = TASK_BY_ID[id];
  if (!def) return false;
  if (def.type === 'instant') return doTask(state, id);
  const rt = getRuntime(state, id);
  if (rt.active) return false;
  if (def.type === 'limited' && rt.count >= (def.max ?? 1)) return false;
  if (!requirementsMet(state, def)) return false;
  if (slotsUsed(state) >= activitySlots(state)) return false; // no free Activity slot
  if (!canAfford(state, def.startCost, 1)) return false;
  applyAmounts(state, def.startCost, -1);
  rt.active = true;
  rt.paused = false;
  rt.progress = 0;
  rt.repeat = def.repeatable ?? false;
  logEvent(state, `Began ${def.name}.`, 'ev');
  return true;
}

/** Stop a running continuous task, freeing its slot. */
export function stopTask(state: GameState, id: string): boolean {
  const def = TASK_BY_ID[id];
  const rt = state.run.tasks[id];
  if (!def || !rt || !rt.active) return false;
  rt.active = false;
  rt.paused = false;
  rt.progress = 0;
  logEvent(state, `Stopped ${def.name}.`);
  return true;
}

/** Flip the ↻ repeat toggle on a Running task. Returns the new state. */
export function toggleRepeat(state: GameState, id: string): boolean {
  const def = TASK_BY_ID[id];
  if (!def || def.type !== 'running') return false;
  const rt = getRuntime(state, id);
  rt.repeat = !rt.repeat;
  return rt.repeat;
}

// ---- derived read models ----
export function activitySlots(state: GameState): number {
  return typeof state.run.activitySlots === 'number' ? state.run.activitySlots : STARTING.activitySlots;
}
export function slotsUsed(state: GameState): number {
  let n = 0;
  for (const def of TASKS) {
    if (isContinuous(def) && peekRuntime(state, def.id).active) n++;
  }
  return n;
}

/** The EFFECTIVE storage cap for a resource (base cap + item/tier `max` mods), or
 *  Infinity if uncapped (Renown). Delegates to systems/home so caps read one way. */
function resourceCap(state: GameState, id: ResourceId): number {
  return effectiveCap(state, id);
}

/** Per-second net contribution of a task *while running* (resources + vitals + essence).
 *  Output is scaled by the global output multiplier (Kindle Focus). A resource already
 *  AT its cap contributes 0 net — the tick clamps it — so a capped Study honestly reads
 *  +0/s instead of the phantom +0.55/s the T-004 review flagged. */
function netPerSecond(state: GameState, def: TaskDef): Partial<Record<AmountId, number>> {
  const net: Partial<Record<AmountId, number>> = {};
  // Scale OUTPUT by the full task-output multiplier (Kindle + Tool Belt job mult +
  // Strength + element-tool boost) so the card's rate/payoff readout matches what a
  // real cycle actually pays — otherwise a bought tool looks like a no-op on its job.
  // Costs stay unscaled below.
  const mult = taskOutputScale(state, def);
  // Resolve the 'affinity' essence sentinel to the real awakened element so the rate
  // readout attributes a contract's essence drain to the element it actually spends.
  const add = (rawId: AmountId, v: number): void => {
    const id = resolveAffinityId(state, rawId);
    net[id] = (net[id] ?? 0) + v;
  };
  if (def.type === 'perpetual') {
    for (const o of def.output ?? []) add(o.id, o.amount * mult);
    for (const c of def.runCost ?? []) add(c.id, -c.amount);
  } else if (def.type === 'running' || def.type === 'limited') {
    const len = def.length && def.length > 0 ? def.length : 1;
    for (const o of def.output ?? []) add(o.id, (o.amount * mult) / len);
    // Amortize the start-cost over the cycle length for RUNNING only: a repeating
    // Running task re-pays startCost every cycle, so startCost/len is its true average
    // drain. A Limited task pays its start-cost once (in startTask) and never repeats,
    // so amortizing it here would show a phantom per-second drain the whole build.
    if (def.type === 'running') {
      for (const c of def.startCost ?? []) add(c.id, -c.amount / len);
    }
    for (const c of def.runCost ?? []) add(c.id, -c.amount);
  }
  // Cap-awareness: zero out any positive resource rate whose pool is already at cap.
  for (const id of Object.keys(net) as AmountId[]) {
    const v = net[id] ?? 0;
    if (v > 0 && RESOURCE_IDS.includes(id as ResourceId)) {
      const cap = resourceCap(state, id as ResourceId);
      if ((state.run.resources[id as ResourceId] ?? 0) >= cap - EPS) net[id] = 0;
    }
  }
  return net; // instant → {} (no per-second rate; UI shows per-action output instead)
}

export function taskInfo(state: GameState, def: TaskDef): TaskInfo {
  const rt = peekRuntime(state, def.id);
  const maxed = def.type === 'limited' && rt.count >= (def.max ?? 1);
  const locked = !requirementsMet(state, def) || maxed;
  // Reveal (display-only): active or ever done → always shown. Otherwise the card stays
  // fully hidden until its requirements are ACTUALLY met (v0.1.6: any unmet requirement
  // hides the card — the old "≤1 unmet is revealed" leniency is gone, so single-gate jobs
  // no longer show as revealed-but-locked). The `secret` flag is now equivalent to the
  // default (kept in the data as harmless).
  const revealed = rt.active || rt.count > 0 || requirementsMet(state, def);
  const affordable = canAfford(state, def.startCost, 1);
  const cont = isContinuous(def);
  const freeSlots = activitySlots(state) - slotsUsed(state);
  const slotFull = cont && !rt.active && freeSlots <= 0;
  const startable = !locked && affordable && (!cont || rt.active || freeSlots > 0);

  let pausedResourceId: AmountId | undefined;
  if (rt.active && rt.paused && def.runCost) {
    const bad = def.runCost.find((c) => poolCur(state, c.pool, c.id) < c.amount - EPS);
    // Resolve the 'affinity' sentinel to the real awakened element so the auto-pause
    // hint reads "needs ▼ Water", not the raw sentinel id.
    pausedResourceId = bad ? resolveAffinityId(state, bad.id) : undefined;
  }

  return {
    id: def.id,
    active: rt.active,
    paused: rt.paused,
    progress: rt.progress,
    count: rt.count,
    repeat: rt.repeat,
    locked,
    revealed,
    maxed,
    affordable,
    slotFull,
    startable,
    pausedResourceId,
    net: netPerSecond(state, def),
  };
}

export function listTaskInfo(state: GameState): TaskInfo[] {
  return TASKS.map((def) => taskInfo(state, def));
}

/** Sum of per-second resource & essence production from active, non-paused tasks
 *  (for the left/right panel rate readouts). Vitals are excluded from the readout. */
export function taskRates(state: GameState): {
  resources: Partial<Record<ResourceId, number>>;
  essence: Partial<Record<ElementId, number>>;
} {
  const resources: Partial<Record<ResourceId, number>> = {};
  const essence: Partial<Record<ElementId, number>> = {};
  for (const def of TASKS) {
    const rt = peekRuntime(state, def.id);
    if (!rt.active || rt.paused) continue;
    const net = netPerSecond(state, def);
    for (const key of Object.keys(net) as AmountId[]) {
      const v = net[key];
      if (v === undefined) continue;
      if (RESOURCE_IDS.includes(key as ResourceId)) {
        resources[key as ResourceId] = (resources[key as ResourceId] ?? 0) + v;
      } else if ((ELEMENTS as string[]).includes(key)) {
        essence[key as ElementId] = (essence[key as ElementId] ?? 0) + v;
      }
    }
  }
  return { resources, essence };
}

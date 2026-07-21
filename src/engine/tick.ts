// Fixed-timestep simulation. Pure functions over GameState — NO DOM, NO Svelte,
// so the same step() runs in the browser rAF loop, in `simulate()` for tests, and
// in the CLI headlessly. The real-time driver (requestAnimationFrame) lives in the UI.

import type { GameState, ResourceId, VitalId } from './state';
import { runTasks } from './systems/tasks';
import { runEssence } from './systems/essence';
import { runHome, effectiveCap, effectiveRegen } from './systems/home';
import { runProgression } from './systems/progression';

/** Resources with a storage cap (Renown is uncapped). Clamped via effectiveCap each tick. */
const CAPPED_RESOURCES: ResourceId[] = ['gold', 'insight', 'moonpetal', 'ironOre', 'spiritDust'];
/** Every resource id — iterated for the progressive-reveal discovery marking (v0.1.6). */
const ALL_RESOURCES: ResourceId[] = ['gold', 'insight', 'renown', 'moonpetal', 'ironOre', 'spiritDust', 'scroll'];
const VITALS: VitalId[] = ['stamina', 'mana', 'life'];
const EPS = 1e-9;

export const TICK = 0.1; // seconds per fixed step
export const MAX_CATCHUP_STEPS = 100_000; // bounds a single advance()

/**
 * Advance the whole game by `dt` seconds. Systems run in order and scale by dt,
 * so a 0.1s live tick, a coarse 1s offline step, and a test step all stay consistent.
 */
export function step(state: GameState, dt: number): void {
  const run = state.run;

  // --- tasks (the Task/Activity system drives all production; runs before caps) ---
  runTasks(state, dt);

  // --- essence (cantrip- + Home-item-awakened per-element trickle; not capped) ---
  runEssence(state, dt);

  // --- home upkeep (current tier's rent; runs BEFORE the cap clamp) ---
  runHome(state, dt);

  // --- caps (Gold + Insight + each material; excess is LOST — effective cap = base + item mods) ---
  for (const id of CAPPED_RESOURCES) {
    const cap = effectiveCap(state, id);
    if (run.resources[id] > cap) run.resources[id] = cap;
  }

  // --- vital regen (effective rate = base vital.regen + item `rate` mods; no double-count) ---
  for (const v of VITALS) regen(run.vitals[v], effectiveRegen(state, v), dt);

  // --- progressive reveal (v0.1.6): mark any resource we now hold > 0 as discovered, so
  //     the left panel reveals its row once earned and keeps showing it thereafter. ---
  if (!run.discovered) run.discovered = { gold: true }; // heal legacy/partial saves
  for (const id of ALL_RESOURCES) {
    if (!run.discovered[id] && (run.resources[id] ?? 0) > EPS) run.discovered[id] = true;
  }

  state.playtime += dt;

  // --- progression (the spark & later era beats; checked after time advances) ---
  runProgression(state);
}

function regen(v: { cur: number; max: number }, rate: number, dt: number): void {
  if (v.cur < v.max) v.cur = Math.min(v.max, v.cur + rate * dt);
}

/**
 * THE non-realtime stepping routine. Advances `state` by exactly `seconds` in
 * fixed TICK-sized steps (plus a final sub-TICK remainder), so a long advance is
 * NEVER collapsed into one oversized step — timed tasks, auto-pause, and regen all
 * behave identically to fine-grained live play. Both `simulate()` (test/CLI
 * fast-forward) and offline catch-up route through here, keeping them bit-for-bit
 * consistent (see offline.ts).
 *
 * By default there is NO iteration cap: this is the *intentional* fast-forward, not
 * the live-loop spiral guard (that lives in createAccumulator's MAX_CATCHUP_STEPS).
 * Callers bound the DURATION instead — offline by OFFLINE_CAP_MS, the CLI by its arg.
 *
 * `maxSteps` (default Infinity) is an OPT-IN ceiling on the whole-tick count so a
 * caller handed an absurd duration can stay responsive instead of hanging. Existing
 * callers pass nothing → Infinity → identical behavior; only the CLI opts in (so a
 * `sim 1e9` truncates promptly rather than grinding through 1e10 steps).
 */
export function advanceFixed(state: GameState, seconds: number, maxSteps: number = Infinity): void {
  if (seconds <= 0 || !Number.isFinite(seconds)) return;
  // +epsilon so a clean multiple (e.g. 10800/0.1) floors to the exact tick count
  // instead of one-short from 0.1's binary representation.
  const whole = Math.min(Math.floor(seconds / TICK + 1e-9), maxSteps);
  for (let i = 0; i < whole; i++) step(state, TICK);
  // Skip the sub-TICK remainder when the step ceiling truncated us: a bounded run stops
  // at the budget and must not tack on the leftover of a duration it never reached.
  if (whole < maxSteps) {
    const remainder = seconds - whole * TICK;
    if (remainder > 1e-9) step(state, remainder);
  }
}

/**
 * Headless deterministic fast-forward: run `seconds` in exact TICK increments.
 * Returns the same state object (mutated) for convenience. `maxSteps` (default
 * Infinity) forwards the opt-in step ceiling described on advanceFixed.
 */
export function simulate(state: GameState, seconds: number, maxSteps: number = Infinity): GameState {
  advanceFixed(state, seconds, maxSteps);
  return state;
}

/**
 * A DOM-agnostic fixed-timestep accumulator. The caller feeds elapsed wall-seconds
 * (e.g. from performance.now() in an rAF loop); it dispatches whole TICK steps.
 */
export function createAccumulator(): { advance(state: GameState, elapsedSeconds: number): number } {
  let acc = 0;
  return {
    advance(state: GameState, elapsedSeconds: number): number {
      acc += elapsedSeconds;
      let n = 0;
      while (acc >= TICK && n < MAX_CATCHUP_STEPS) {
        step(state, TICK);
        acc -= TICK;
        n++;
      }
      return n;
    },
  };
}

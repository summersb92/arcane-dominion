// Fixed-timestep simulation. Pure functions over GameState — NO DOM, NO Svelte,
// so the same step() runs in the browser rAF loop, in `simulate()` for tests, and
// in the CLI headlessly. The real-time driver (requestAnimationFrame) lives in the UI.

import type { GameState } from './state';
import { runProduction } from './systems/production';
import { runPopulation } from './systems/population';
import { checkMagicDiscovery } from './systems/magic';

export const TICK = 0.1; // seconds per fixed step
export const MAX_CATCHUP_STEPS = 100_000; // bounds a single advance()

/**
 * Advance the whole game by `dt` seconds. Systems run in order and scale by dt, so a
 * 0.1s live tick, a coarse offline step, and a test step all stay consistent.
 *
 * Order matters: production runs first (applies job/construct output, upkeep, cap
 * clamps, and sets the starving flag), THEN population reads that fresh food stock to
 * decide growth vs. starvation. Magic discovery runs last, reading the freshly-updated
 * resources/buildings to see whether any of its three paths tripped this tick.
 */
export function step(state: GameState, dt: number): void {
  runProduction(state, dt);
  runPopulation(state, dt);
  checkMagicDiscovery(state);
  state.playtime += dt;
}

/**
 * THE non-realtime stepping routine. Advances `state` by exactly `seconds` in
 * fixed TICK-sized steps (plus a final sub-TICK remainder), so a long advance is
 * NEVER collapsed into one oversized step — growth, starvation, and production all
 * behave identically to fine-grained live play. Both `simulate()` (test/CLI
 * fast-forward) and offline catch-up route through here, keeping them bit-for-bit
 * consistent (see offline.ts).
 *
 * `maxSteps` (default Infinity) is an OPT-IN ceiling on the whole-tick count so a
 * caller handed an absurd duration can stay responsive instead of hanging.
 */
export function advanceFixed(state: GameState, seconds: number, maxSteps: number = Infinity): void {
  if (seconds <= 0 || !Number.isFinite(seconds)) return;
  // +epsilon so a clean multiple (e.g. 3600/0.1) floors to the exact tick count
  // instead of one-short from 0.1's binary representation.
  const whole = Math.min(Math.floor(seconds / TICK + 1e-9), maxSteps);
  for (let i = 0; i < whole; i++) step(state, TICK);
  // Skip the sub-TICK remainder when the step ceiling truncated us.
  if (whole < maxSteps) {
    const remainder = seconds - whole * TICK;
    if (remainder > 1e-9) step(state, remainder);
  }
}

/**
 * Headless deterministic fast-forward: run `seconds` in exact TICK increments.
 * Returns the same (mutated) state for convenience. `maxSteps` forwards the opt-in ceiling.
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

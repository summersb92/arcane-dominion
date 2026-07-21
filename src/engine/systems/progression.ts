// Progression system — the tabs-as-eras unfold (spec §3.12). Pure engine, NO
// DOM/Svelte, so every beat fires identically in the live loop, offline catch-up,
// the CLI, and tests (all route through tick.step → runProgression).
//
// The Act I beats, in order (each idempotent — a cheap flag-guarded no-op once done):
//   1. the spark   (Origin → Awakening)  — reveals Skills + un-gates Study
//   2. the Founding (Hedge-Mage → Founded)  — set by the found-academy task; flips phase
//                                             + writes the celebratory finale, un-greys Academy
// The lair beat (Awakening → Hedge-Mage, revealing the Home tab) is NO LONGER automatic
// (v0.1.5): it is driven by the Find Lodging task (beginLodging effect). See the note below.
// Plus a couple of one-shot Chronicle NUDGES (spec §3.14 light guidance — no tutorial).

import { SPARK, SHOW_FOUNDING } from '../../content/config';
import type { GameState } from '../state';
import { logEvent } from './chronicle';
import { foundingStatus, foundingSummaryLine } from './founding';
import { effectiveCap } from './home';

const EPS = 1e-9;

/** Has the mage awakened? The canonical gate the UI + Study requirement read. */
export function isAwakened(state: GameState): boolean {
  return state.run.flags.awakened === true;
}

/** Fire the spark: flip the flag, advance the phase, and mark the moment in the Chronicle. */
function fireSpark(state: GameState): void {
  state.run.flags.awakened = true;
  if (state.run.phase === 'origin') state.run.phase = 'awakened';
  logEvent(state, 'You sound out the torn page by candlelight. The words… move.', 'found');
}

/** The spark fires the first moment EITHER trigger is met — Gold threshold OR the
 *  timer — guaranteeing a purely idle player still awakens. */
function checkSpark(state: GameState): void {
  if ((state.run.resources.gold ?? 0) >= SPARK.goldThreshold || state.playtime >= SPARK.timerSeconds) {
    fireSpark(state);
  }
}

// NOTE (v0.1.5): the automatic lair beat was REMOVED. Housing now opens ONLY via the
// Find Lodging task (content/tasks.ts → beginLodging effect), which sets lairFounded and
// moves the player into the Inn. The spark/`awakened` beat below is independent and stays.

/** The Founding finale: the found-academy task sets `founded`; here we flip the phase
 *  and write the defining beat, which un-greys the Academy tab (per toView). */
function checkFounding(state: GameState): void {
  if (state.run.flags.founded === true && state.run.phase !== 'founded') {
    state.run.phase = 'founded';
    logEvent(
      state,
      'By charter and by will, you found your Academy. The valley has a school of magic — and you are its Headmaster. (Act II arrives in v0.2.)',
      'found',
    );
  }
}

/** One-shot Chronicle nudges (spec §3.14 — minimal, never nagging). Each is guarded
 *  by its own flag so it appears exactly once; the always-visible Home Founding card
 *  carries the live progress. */
function runHints(state: GameState): void {
  const f = state.run.flags;

  // Insight pinned at its cap with things to spend it on → point at the sinks.
  // Read the EFFECTIVE cap (base + item `max` mods) so the hint tracks the real ceiling.
  const insightCap = effectiveCap(state, 'insight');
  if (
    !f.hintInsightFull &&
    isAwakened(state) &&
    insightCap > 0 &&
    (state.run.resources.insight ?? 0) >= insightCap - EPS
  ) {
    f.hintInsightFull = true;
    logEvent(state, 'Insight is full — spend it: learn a cantrip, or raise the cap with the Grand Library.', 'ev');
  }

  // Founding partly met → surface the one-line "what's left" (once). Suppressed while the
  // Founding is hidden (SHOW_FOUNDING) so no Founding language leaks into the chronicle.
  if (SHOW_FOUNDING && !f.hintFounding && f.lairFounded === true) {
    const st = foundingStatus(state);
    if (st.metCount >= 1 && !st.allMet) {
      f.hintFounding = true;
      logEvent(state, `Toward the Founding — ${foundingSummaryLine(state)}. (Track it on Home.)`, 'ev');
    }
  }
}

/**
 * Run once per tick. Spark only checked while unawakened; the later beats + hints
 * carry their own guards, so this stays a cheap no-op once each has fired.
 */
export function runProgression(state: GameState): void {
  if (!isAwakened(state)) checkSpark(state);
  checkFounding(state);
  runHints(state);
}

// Chronicle — the settlement's log of things WORTH REMEMBERING. Deliberately not a
// receipt printer: individual builds and individual settlers never appear. What lands here
// is the stuff you'd tell someone about later —
//   * a season's births and deaths, rolled into one line when the season turns;
//   * weather severe enough to matter;
//   * a technology understood, a first-of-its-kind building, a milestone population;
//   * the settlement's own disasters (famine, a works standing idle).
//
// Once the Calendar tech lands, a dated DIVIDER separates each season's stretch of log.
// Pure engine, no DOM. Entries are stamped with simulated playtime and the stored list is
// bounded so a long session can't bloat the save.

import { CALENDAR } from '../../content/config';
import type { ChronicleEntry, GameState } from '../state';
import { currentSeasonOrdinal, dateAt } from './calendar';
import { weather, weatherAt } from './weather';

const MAX_STORED = 60;

/** Append an event to the chronicle, stamped at the current playtime. Trims to MAX_STORED. */
export function logEvent(state: GameState, text: string, kind?: ChronicleEntry['kind']): void {
  // Round the stamp to 0.1s: playtime advances in 0.1s TICKs, so the "true" value is a
  // multiple of 0.1 — the extra digits (e.g. 45.00000000000037) are pure float noise.
  const at = Math.round(state.playtime * 10) / 10;
  state.run.chronicle.push({ at, text, kind });
  if (state.run.chronicle.length > MAX_STORED) {
    state.run.chronicle.splice(0, state.run.chronicle.length - MAX_STORED);
  }
}

/** Record one birth against the season underway (reported when the season turns). */
export function tallyBirth(state: GameState): void {
  state.run.seasonTally.born += 1;
}

/** Record one death against the season underway. */
export function tallyDeath(state: GameState): void {
  state.run.seasonTally.died += 1;
}

/** "Spring, Year 2" — the divider label for the season an ordinal points at. */
function seasonLabel(ordinal: number): string {
  const { seasons } = CALENDAR;
  const i = ((ordinal % seasons.length) + seasons.length) % seasons.length;
  return `${seasons[i]}, Year ${Math.floor(ordinal / seasons.length) + 1}`;
}

/** The one-line report for a season that just ended. Null when nothing happened in it. */
function tallyLine(ordinal: number, born: number, died: number): string | null {
  if (born <= 0 && died <= 0) return null;
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const season = CALENDAR.seasons[((ordinal % 4) + 4) % 4];
  if (born > 0 && died > 0) return `${season} ends: ${plural(born, 'settler', 'settlers')} born, ${died} lost.`;
  if (born > 0) return `${season} ends: ${plural(born, 'settler', 'settlers')} born.`;
  return `${season} ends: ${plural(died, 'settler', 'settlers')} lost.`;
}

/**
 * Per-tick watcher for the two things only the CLOCK can notice: a season turning (flush
 * the birth/death tally, then open the next stretch with a dated divider) and the weather
 * turning severe. Runs after production/population so the tally it flushes is complete.
 *
 * Idempotent within a tick and safe across a long offline catch-up: seasons are advanced
 * one at a time, so a twelve-hour gap reports each season it crossed rather than collapsing
 * them into one line.
 */
export function runChronicleWatch(state: GameState, dt: number): void {
  const run = state.run;
  const nowSeason = currentSeasonOrdinal(state.playtime);
  const calendarUnlocked = (run.tech as string[]).includes('calendar');

  while (run.seasonTally.index < nowSeason) {
    const ended = run.seasonTally.index;
    const line = tallyLine(ended, run.seasonTally.born, run.seasonTally.died);
    if (line) logEvent(state, line, 'ev');
    run.seasonTally = { index: ended + 1, born: 0, died: 0 };
    // The dated rule only means something once the settlement keeps a calendar.
    if (calendarUnlocked) logEvent(state, seasonLabel(ended + 1), 'season');
  }
  // A save edited or migrated to a FUTURE season shouldn't spin: resync without reporting.
  if (run.seasonTally.index > nowSeason) run.seasonTally.index = nowSeason;

  // Weather: only the severe spells are worth the ink, and only as they ARRIVE. Detected by
  // comparing this moment's spell with the one a tick ago — no stored field, so it behaves
  // the same live, on reload, and through an offline catch-up.
  const w = weather(state);
  if (w.major && weatherAt(state.seed, state.playtime - dt).period !== w.period) {
    const { season } = dateAt(state.playtime);
    logEvent(
      state,
      w.swing > 0
        ? `A bountiful spell settles over the ${season.toLowerCase()} fields.`
        : `Blighted weather sets in. The ${season.toLowerCase()} fields suffer for it.`,
      'ev',
    );
  }
}

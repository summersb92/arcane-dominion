// Magic discovery — the moment a settlement first touches the arcane. Magic is no longer a
// tech; it is discovery-driven. THREE independent paths each trip the same `magicDiscovered`
// flag (whichever the player reaches first wins), and that flag is what reveals the Mana
// currency and unlocks the magic buildings (Arcane Font, Animated Tools — requiresFlag in
// content/buildings.ts). Once discovered the flag is never re-checked. Pure engine, no DOM.
//
//   a) FROM THE EARTH  — Mana Crystals (mined by the Mines) reach the threshold.
//   b) FROM NATURE     — a Sacred Grove stands (count ≥ 1).
//   c) FROM THE PEOPLE — Culture reaches the threshold.

import type { GameState } from '../state';
import { logEvent } from './chronicle';

const EPS = 1e-9;

/** The flag key set once magic is discovered (rides in run.flags, no schema change). */
export const MAGIC_DISCOVERED_FLAG = 'magicDiscovered';

/** Held Mana Crystals that trip the EARTH path. */
export const MANA_CRYSTAL_THRESHOLD = 20;
/** Held Culture that trips the PEOPLE path. */
export const CULTURE_THRESHOLD = 100;

/** True once magic has been discovered by any path. */
export function isMagicDiscovered(state: GameState): boolean {
  return state.run.flags[MAGIC_DISCOVERED_FLAG] === true;
}

/**
 * Discovery check — run once per tick (from tick.step()). If magic is not yet discovered
 * and ANY path's condition is met, set the flag and log a distinct Chronicle beat naming
 * the path that did it. Paths are checked in a fixed order (earth → nature → people) so the
 * beat is deterministic when more than one condition happens to be met on the same tick.
 * No mutation once already discovered.
 */
export function checkMagicDiscovery(state: GameState): void {
  if (isMagicDiscovered(state)) return;
  const run = state.run;

  let beat: string | null = null;
  if ((run.resources.manaCrystals ?? 0) >= MANA_CRYSTAL_THRESHOLD - EPS) {
    beat = 'The crystals from the deep mines hum with power.';
  } else if ((run.buildings['sacred-grove'] ?? 0) >= 1) {
    beat = 'The grove answers your tending — the wild whispers back.';
  } else if ((run.resources.culture ?? 0) >= CULTURE_THRESHOLD - EPS) {
    beat = 'A gifted soul among your people awakens to the weave.';
  }

  if (beat === null) return;
  run.flags[MAGIC_DISCOVERED_FLAG] = true;
  logEvent(state, beat, 'ev');
}

// Shared test helpers.

import type { BuildingId } from '../src/content/buildings';
import type { GameState } from '../src/engine/state';

/** The opening REVEAL chain, as the Build tab unfolds it:
 *      House → Farm → (Woodcutter's Lodge · Storehouse) → Shrine
 *  A test about the Lodge's output shouldn't have to play the first two minutes to get one,
 *  so this stamps in whatever earlier buildings the given ones are gated behind.
 *
 *  Counts are set DIRECTLY, which means build-time effects (housing, storage caps) are
 *  deliberately not applied — the only thing this changes is what is revealed. Derived
 *  effects still count, so seeding a Farm does grant its +2% Farmer boost; keep that in mind
 *  when a test asserts an exact per-worker figure.
 */
const PREREQ: Partial<Record<BuildingId, BuildingId[]>> = {
  'forager-hut': ['hut'],
  'woodcutters-lodge': ['hut', 'forager-hut'],
  storehouse: ['hut', 'forager-hut'],
  'wayside-shrine': ['hut', 'forager-hut', 'woodcutters-lodge'],
};

export function reveal(s: GameState, ...ids: BuildingId[]): GameState {
  for (const id of ids) {
    for (const p of PREREQ[id] ?? []) s.run.buildings[p] ??= 1;
  }
  return s;
}

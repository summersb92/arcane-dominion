// Seeded RNG (mulberry32). Deterministic + serializable: the 32-bit state lives
// in GameState so a save reproduces the exact stream. No DOM, no Svelte.

export interface Rng {
  /** Next float in [0, 1). Advances state. */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Current internal state (persist this). */
  state(): number;
}

/** Hash an arbitrary string/number into a 32-bit seed. */
export function seedFrom(input: string | number): number {
  const s = String(input);
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function createRng(initialState: number): Rng {
  let a = initialState >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    state: () => a >>> 0,
  };
}

/**
 * THE randomness rule for T-005/T-006 (contracts, hunts — anything that rolls):
 * NEVER keep a long-lived Rng across draws. Reconstruct from the persisted
 * `state.rngState`, draw, and write the advanced state straight back — so the
 * stream is deterministic AND survives save/load (a reloaded save continues the
 * exact same sequence). This helper is that reconstruct→draw→write-back in one call.
 *
 *   const roll = drawRng(state, (r) => r.int(1, 6));   // advances & persists rngState
 *
 * Typed structurally (`{ rngState }`) rather than against GameState to avoid a
 * state.ts ↔ rng.ts import cycle.
 */
export function drawRng<T>(state: { rngState: number }, draw: (rng: Rng) => T): T {
  const rng = createRng(state.rngState);
  const result = draw(rng);
  state.rngState = rng.state();
  return result;
}

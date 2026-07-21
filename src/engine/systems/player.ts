// Character model (v0.1.2) — the mage's chosen name + earned title. Pure engine (NO
// DOM/Svelte): the same action runs in the browser, the CLI, and tests. The name lives
// in run.name (RunState); '' means "not yet named" (the character-creation trigger the
// UI reads via UiState.player.needsNaming). Titles are display-only honorifics for now.

import type { ElementId, GameState } from '../state';

/** Longest name we store — clamps a pasted essay to something the panels can render. */
export const MAX_NAME_LEN = 24;

// ---------------------------------------------------------------------------
// Strength (v0.1.4) — a physical-labour stat with DIMINISHING returns.
// ---------------------------------------------------------------------------
// Design (the "team designs it"):
//   • strengthXp accrues from physical labour (Clean Stables → +1 per completion).
//   • Levels use a TRIANGULAR cumulative curve: reaching level L needs
//        xpForLevel(L) = 10 · L·(L+1)/2 = 5·L·(L+1)  cumulative XP.
//        L1 → 10 XP, L2 → 30, L3 → 60, L4 → 100, L5 → 150 …  (each level costs +10 more)
//   • The effective multiplier is  strength = 1 + 0.1·L, so:
//        L0 → ×1.00,  L1 → ×1.10 (10 XP),  L2 → ×1.20 (30 XP),  L3 → ×1.30 (60 XP) …
//   Because each successive level demands more XP for the same +0.1, returns diminish.
// Framework-agnostic: no DOM/Svelte — runs in the browser, the CLI, and tests.

/** Cumulative Strength XP required to have REACHED level L (L ≥ 0 → 0 at L0). */
export function strengthXpForLevel(level: number): number {
  const L = Math.max(0, Math.floor(level));
  return 5 * L * (L + 1); // 10·L·(L+1)/2
}

/** The Strength LEVEL derived from accrued XP (the largest L with xpForLevel(L) ≤ xp). */
export function strengthLevel(state: GameState): number {
  const xp = Math.max(0, state.run.strengthXp ?? 0);
  // Solve 5·L·(L+1) ≤ xp  →  L ≤ (-1 + √(1 + 0.8·xp)) / 2. Floor, then verify against
  // float error at the exact boundary (nudge up/down so xp === xpForLevel(L) lands cleanly).
  let L = Math.floor((Math.sqrt(1 + 0.8 * xp) - 1) / 2);
  if (L < 0) L = 0;
  while (strengthXpForLevel(L + 1) <= xp + 1e-9) L++;
  while (L > 0 && strengthXpForLevel(L) > xp + 1e-9) L--;
  return L;
}

/** The effective Strength multiplier (starts 1; +0.1 per level). */
export function strength(state: GameState): number {
  return 1 + 0.1 * strengthLevel(state);
}

/** Add Strength XP (from physical labour). Clamps to a finite, non-negative total. */
export function addStrengthXp(state: GameState, n: number): void {
  if (!Number.isFinite(n) || n === 0) return;
  const cur = Number.isFinite(state.run.strengthXp) ? state.run.strengthXp : 0;
  state.run.strengthXp = Math.max(0, cur + n);
}

// ---------------------------------------------------------------------------
// Hidden elemental AFFINITY (v0.1.4)
// ---------------------------------------------------------------------------
/** Deterministic tie-break order for the dominant affinity. Fire is first, so an
 *  all-zero ledger (a player who did no element work) resolves to Fire — the default
 *  that keeps all existing Fire content working. Prism (no income task) sits last. */
const AFFINITY_ORDER: ElementId[] = ['fire', 'water', 'earth', 'air', 'light', 'dark', 'prism'];

/** The element with the highest hidden affinity count. Ties break by AFFINITY_ORDER
 *  (Fire wins), and an all-zero ledger returns 'fire' (the back-compat default). */
export function dominantAffinity(state: GameState): ElementId {
  const aff = state.run.affinity;
  let best: ElementId = 'fire';
  let bestCount = -1;
  // Iterate in the fixed tie-break order so the first element to hold the max wins.
  for (const id of AFFINITY_ORDER) {
    const c = aff && Number.isFinite(aff[id]) ? aff[id] : 0;
    if (c > bestCount) {
      bestCount = c;
      best = id;
    }
  }
  // All zero (bestCount 0 with Fire first) → 'fire' (the back-compat default).
  return bestCount <= 0 ? 'fire' : best;
}

/**
 * Set the player's name: trimmed and clamped to MAX_NAME_LEN. An empty (or whitespace-
 * only) name is IGNORED — returns false with no mutation, so a blank submit can't wipe
 * an existing name or "name" a fresh mage the empty string.
 */
export function setName(state: GameState, name: string): boolean {
  const trimmed = name.trim().slice(0, MAX_NAME_LEN).trim();
  if (!trimmed) return false;
  state.run.name = trimmed;
  return true;
}

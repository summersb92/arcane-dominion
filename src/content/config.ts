// Gameplay tuning constants (data, not code). Balance lives here; systems read it.
// Framework-agnostic — imported by the engine and the CLI.

export const OFFLINE_CAP_MS = 12 * 60 * 60 * 1000; // 12h catch-up cap (spec §3.4)
export const AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * The spark / Awakening trigger (spec §5): fires when Gold reaches the threshold
 * OR a short timer elapses — whichever comes first — so even a purely idle player
 * who never labours still awakens and unlocks Study + the cantrip web.
 */
export const SPARK = {
  goldThreshold: 25, // ⦿ that earns the page's attention
  timerSeconds: 45, // …or this many seconds of simulated play, guaranteed
};

/**
 * The lair beat threshold. NOTE (v0.1.5): the AUTOMATIC lair beat was removed —
 * housing now opens only via the Find Lodging task (which requires holding 80 Gold).
 * This const is no longer read by systems/progression.ts; it is retained for reference
 * (and still imported by a regression test asserting the auto-beat no longer fires).
 */
export const LAIR = {
  goldThreshold: 40,
};

/**
 * The Founding (spec §3.11 / §5) — the v0.1 finale gate. Four requirements: hold
 * enough Gold and Renown, and have acquired a Charter and a Site (each bought
 * in-run as its own Housing task). The Site is the big Gold sink; the Charter needs
 * a name (Renown) behind it. Tuned toward the ~15–40 min target — balance freely.
 */
// v0.1.2: costs must sit UNDER the reachable Gold ceiling. Max Gold cap = STARTING.goldCap
// (25) + Coin Pouch (+25 × max 3) = 100, so the Site (the big sink) and the held-Gold
// finale gate both live below 100 with headroom (never pinned exactly at the cap).
export const FOUNDING = {
  goldHeld: 60, // ⦿ you must still hold at the moment of Founding (well under the 100 ceiling)
  renown: 25, // ★ the world must know your name
  charterCost: 40, // ⦿ to secure a Guild Charter
  charterRenown: 8, // ★ before a guild will charter you
  siteCost: 70, // ⦿ to claim the Ruined Tower (the big Gold sink → your Grounds; ≤ 100 cap)
};

// The Academy Founding (the old v0.1 finale) is HIDDEN for now — its whole UI (the
// Academy tab, the Home "Founding" goal card + its tasks, and related flavour) is
// gated off until it's unveiled later (~Act 4). The engine/content + tests stay intact;
// flip this to true to bring it all back.
export const SHOW_FOUNDING = false;

// Renown ★ is HIDDEN for now (v0.1.4) — contracts no longer grant it and nothing in Act I
// consumes it, so its UI (the Player-tab Renown readout, any Renown hints) is gated off
// until it's reintroduced later. The `renown` resource stays in the engine/state untouched
// (deferred, not removed); flip this to true to surface it again.
export const SHOW_RENOWN = false;

export const STARTING = {
  gold: 0,
  insight: 0,
  renown: 0,
  moonpetal: 0,
  ironOre: 0,
  spiritDust: 0,
  scroll: 0, // crafting currency (uncapped) — scribed from Insight, spent to learn cantrips (v0.1.2)
  goldCap: 25, // BASE Gold cap (v0.1.2) — raised by building Coin Pouch upgrade tasks (max 100)
  insightCap: 5, // BASE Insight cap (v0.1.2) — raised by building Notebook upgrade tasks (max 20)
  materialCap: 50, // BASE cap on each material (moonpetal / ironOre / spiritDust) — raised by Warded Chest
  activitySlots: 2, // continuous-task capacity at the Origin
  // Vitals rework (v0.1.1): tighter Life/Stamina, and Mana LOCKED (max 0 / regen 0)
  // until the "Inner Wellspring" cantrip unlocks it.
  life: { cur: 10, max: 10, regen: 0.1 },
  stamina: { cur: 5, max: 5, regen: 0.15 },
  mana: { cur: 0, max: 0, regen: 0 },
};

// (The T-002 placeholder generator was retired in T-004 — production now flows
// entirely from the Task/Activity system in src/engine/systems/tasks.ts.)

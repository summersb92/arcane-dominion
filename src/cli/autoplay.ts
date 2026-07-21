// Autoplay bot (spec §3.15 / §4 DoD #10) — a SIMPLE heuristic that drives the SAME
// engine actions the UI/CLI expose toward a goal (v0.1: the Founding) and reports
// whether/when it got there. Pure engine + content imports (NO Svelte/DOM), like the
// rest of src/cli — the clean import is itself proof of the "no DOM in the engine"
// rule. Deterministic via a seed: same seed → same playthrough → same minute mark,
// so it doubles as a headless pacing/regression check for the §4 target.
//
// The v0.1.1 economy makes this a two-resource squeeze: Gold has a small BASE cap
// (50) so the bot must furnish its lair with cap items to ever hold the Site's 120,
// and Stamina is scarce (max 5, regen 0.15 < Study's 0.2 drain) so it learns Mend
// early. The policy is a greedy priority ladder re-evaluated every decision tick:
//   learn cantrips → claim a lair → move to the Inn → buy+equip Coin Pouch + Strongbox
//   (raise the Gold cap) → run a contract (Renown + Gold + Iron) → Charter → Site → Found.

import { newGame, type GameState } from '../engine/state';
import { advanceFixed } from '../engine/tick';
import {
  doTask,
  startTask,
  stopTask,
  taskInfo,
  slotsUsed,
  activitySlots,
} from '../engine/systems/tasks';
import { learnCantrip } from '../engine/systems/skills';
import { moveHome, buyItem, equipItem, effectiveCap } from '../engine/systems/home';
import { canFound, foundingSummaryLine } from '../engine/systems/founding';
import { TASK_BY_ID } from '../content/tasks';
import { CANTRIP_BY_ID } from '../content/cantrips';
import { FOUNDING } from '../content/config';

export interface AutoplayOptions {
  goal: 'founding';
  maxMin: number; // hard cap on simulated minutes before giving up
  seed?: number;
  stepSeconds?: number; // decision cadence (default 1s of sim time per decision)
}

export interface AutoplayEvent {
  atSec: number; // simulated-time seconds when the beat fired
  text: string;
}

export interface AutoplayResult {
  reached: boolean;
  atSec?: number; // sim-seconds at which `founded` flipped (undefined if never)
  timeline: AutoplayEvent[];
  finalState: GameState;
  simSeconds: number; // total simulated time elapsed
}

// The cantrips the bot pursues, cheapest → most useful first. Mend (Stamina regen) is
// learned right after Read the Page so Study becomes sustainable under the tight
// Stamina budget; Spark opens Fire (contracts); Kindle Focus is a global +10%.
// The elemental openers (over the cap, v0.1.7) and `inner-wellspring` (Mana, off-path)
// are omitted — a lean run to the Founding never needs them.
const WISHLIST = ['read-the-page', 'mend', 'spark', 'kindle-focus'];

// The continuous "engine" tasks the bot juggles across its Activity slots. Founding
// builds (charter/site/found) are transient and managed separately.
const ENGINES = ['study', 'ward-a-barn'];

// The lair items the bot buys + equips to raise its Gold cap enough to hold the
// Founding sinks (base cap 50 → +Coin Pouch 50 → +Strongbox 150 = 250).
const GOLD_ITEMS = ['coin-pouch', 'strongbox'];

const owned = (s: GameState, id: string): boolean => (s.run.skills ?? []).includes(id);
const itemOwned = (s: GameState, id: string): boolean => (s.run.home?.owned ?? []).includes(id);
const itemEquipped = (s: GameState, id: string): boolean => (s.run.home?.equipped ?? []).includes(id);

/** Still-affordable wishlist cantrips left (cost within the current Insight cap)? */
function needsInsight(s: GameState): boolean {
  return WISHLIST.some((id) => !owned(s, id) && CANTRIP_BY_ID[id].cost <= s.run.caps.insight);
}

/** Free one Activity slot for a build by stopping the least-valuable engine. */
function ensureFreeSlot(s: GameState): boolean {
  if (activitySlots(s) - slotsUsed(s) > 0) return true;
  for (const id of ['study', 'ward-a-barn']) {
    if (s.run.tasks[id]?.active) {
      stopTask(s, id);
      return true;
    }
  }
  return false;
}

/**
 * Furnish the lair: move to the Inn (free, gated on the lair), then buy + equip the two
 * Gold-cap items, Coin Pouch first. The Strongbox now costs 90 Gold under the Coin Pouch's
 * 100 cap, so there's headroom to spare — the purchase clears at the Inn despite its rent,
 * no detour to a rent-free tier needed. The Inn's two slots hold exactly these two items.
 */
function setupHome(s: GameState): void {
  const tier = s.run.home.tier;
  if (tier === 'vagrant') return void moveHome(s, 'inn'); // free move, gated on lairFounded
  // At the Inn (two slots): buy + equip the Gold-cap items, Coin Pouch first.
  for (const id of GOLD_ITEMS) {
    if (!itemOwned(s, id)) {
      if (buyItem(s, id)) return; // one purchase per tick
      break; // can't afford this one yet → nothing further is affordable either
    }
    if (!itemEquipped(s, id)) return void equipItem(s, id);
  }
}

/** Lair fully set up: wishlist learned and both Gold-cap items equipped (cap ≥ 250). */
function setupComplete(s: GameState): boolean {
  return s.run.flags.lairFounded === true && !needsInsight(s) && GOLD_ITEMS.every((id) => itemEquipped(s, id));
}

/** Keep the right engines running for the current phase, freeing slots by stopping
 *  ones we no longer want (Study once the cantrips are all bought). */
function ensureEngines(s: GameState): void {
  const insightWanted = s.run.flags.awakened === true && needsInsight(s);
  const fireOn = s.run.essence.fire.awakened === true;

  const desired: string[] = [];
  if (fireOn) desired.push('ward-a-barn'); // best Gold engine AND the only Renown source
  if (insightWanted) desired.push('study'); // trickle Insight until the wishlist is done

  // Stop any active engine we no longer want, freeing its slot for a desired one.
  for (const id of ENGINES) {
    if (s.run.tasks[id]?.active && !desired.includes(id)) stopTask(s, id);
  }
  // Start desired engines in priority order while slots (and affordability) allow.
  for (const id of desired) {
    const info = taskInfo(s, TASK_BY_ID[id]);
    if (!info.active && info.startable) startTask(s, id);
  }
}

/** One decision tick: greedy priority ladder over the existing engine actions. */
function act(s: GameState): void {
  const f = s.run.flags;

  // 1. Found the moment the gate is open (freeing a slot for the finale build).
  if (canFound(s)) {
    if (ensureFreeSlot(s)) startTask(s, 'found-academy');
    return;
  }

  // 2. Learn wishlist cantrips (each call is a no-op if prereqs/Insight aren't ready).
  for (const id of WISHLIST) if (!owned(s, id)) learnCantrip(s, id);

  // 3. Furnish the lair (housing + Gold-cap items) once it's claimed.
  if (f.lairFounded) setupHome(s);

  // 4. Once set up, buy the Founding sinks — Charter first (cheaper, needs a little
  //    Renown), then the Site (the big Gold sink). Each briefly needs a free slot.
  const gold = s.run.resources.gold;
  const renown = s.run.resources.renown;
  if (setupComplete(s)) {
    if (!f.hasCharter && !s.run.tasks['secure-charter']?.active && renown >= FOUNDING.charterRenown && gold >= FOUNDING.charterCost) {
      if (ensureFreeSlot(s)) startTask(s, 'secure-charter');
    }
    if (f.hasCharter && !f.hasSite && !s.run.tasks['claim-site']?.active && gold >= FOUNDING.siteCost) {
      if (ensureFreeSlot(s)) startTask(s, 'claim-site');
    }
  }

  // 5. Keep the phase-appropriate engines running.
  ensureEngines(s);

  // 6. Instant Gold filler: beg for coppers (free — always available), and clean the
  //    stables while Stamina has real headroom (never starving the engines' run costs).
  doTask(s, 'begging');
  if (s.run.vitals.stamina.cur >= 4 && taskInfo(s, TASK_BY_ID['clean-stables']).startable) {
    doTask(s, 'clean-stables');
  }
}

/** Emit one-shot milestone beats as flags/skills/essence/home transition. */
function recordBeats(s: GameState, seen: Set<string>, timeline: AutoplayEvent[]): void {
  const push = (key: string, text: string): void => {
    if (!seen.has(key)) {
      seen.add(key);
      // Round off the 0.1s-tick summation noise so the timeline reads cleanly.
      timeline.push({ atSec: +s.playtime.toFixed(1), text });
    }
  };
  if (s.run.flags.awakened) push('spark', 'The spark — you awaken; Study opens.');
  for (const id of s.run.skills ?? []) push(`learn:${id}`, `Learned ${CANTRIP_BY_ID[id]?.name ?? id}.`);
  if (s.run.essence.fire.awakened) push('fire', 'Fire essence awakens — contracts become possible.');
  if (s.run.flags.lairFounded) push('lair', 'Claimed a lair — Home opens (housing + items).');
  if (s.run.home?.tier === 'inn') push('inn', 'Moved into the Inn — two item slots.');
  if (s.run.home?.tier === 'mentor') push('mentor', "Moved into the Mentor's Loft — rent-free, three slots.");
  if (itemEquipped(s, 'coin-pouch')) push('pouch', `Equipped a Coin Pouch — Gold cap ${effectiveCap(s, 'gold')}.`);
  if (itemEquipped(s, 'strongbox')) push('strongbox', `Equipped a Strongbox — Gold cap ${effectiveCap(s, 'gold')}.`);
  if (s.run.tasks['ward-a-barn']?.active) push('ward', 'Took a contract: Ward a Barn (Renown + Gold + Iron).');
  if (s.run.resources.renown >= FOUNDING.renown) push('renown', `Renown reaches ${FOUNDING.renown}.`);
  if (s.run.flags.hasCharter) push('charter', 'Secured a Guild Charter.');
  if (s.run.flags.hasSite) push('site', 'Claimed the Ruined Tower (Site).');
  if (s.run.flags.founded) push('founded', 'FOUNDED — the Academy stands. Act I complete.');
}

/**
 * Run the bot to the goal (or the time cap). Deterministic for a given seed +
 * stepSeconds. Advances in fixed TICK steps between decisions (via advanceFixed), so
 * the bot's sim is bit-for-bit consistent with live play, offline catch-up, and tests.
 */
export function autoplay(opts: AutoplayOptions): AutoplayResult {
  const s = opts.seed === undefined || Number.isNaN(opts.seed) ? newGame() : newGame(opts.seed);
  const dt = opts.stepSeconds && opts.stepSeconds > 0 ? opts.stepSeconds : 1;
  const maxSec = opts.maxMin * 60;
  const timeline: AutoplayEvent[] = [];
  const seen = new Set<string>();

  recordBeats(s, seen, timeline); // capture any t=0 beats (e.g. starting chronicle)
  while (s.playtime < maxSec && s.run.flags.founded !== true) {
    act(s);
    advanceFixed(s, dt);
    recordBeats(s, seen, timeline);
  }

  const reached = s.run.flags.founded === true;
  const founding = timeline.find((e) => e.text.startsWith('FOUNDED'));
  return {
    reached,
    atSec: reached ? founding?.atSec ?? s.playtime : undefined,
    timeline,
    finalState: s,
    simSeconds: s.playtime,
  };
}

/** A one-line status when the bot fails to reach the goal (for the CLI + tests). */
export function autoplayFailLine(res: AutoplayResult): string {
  return `stalled at ${(res.simSeconds / 60).toFixed(1)} min — ${foundingSummaryLine(res.finalState)}`;
}

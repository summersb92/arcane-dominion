import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate, step } from '../src/engine/tick';
import { applyOffline } from '../src/engine/offline';
import {
  doTask,
  startTask,
  stopTask,
  toggleRepeat,
  slotsUsed,
  activitySlots,
  taskRates,
  listTaskInfo,
  taskInfo,
} from '../src/engine/systems/tasks';
import { buyItem, equipItem, equipGear, moveHome, effectiveCap } from '../src/engine/systems/home';
import { learnCantrip } from '../src/engine/systems/skills';
import { TASK_BY_ID } from '../src/content/tasks';

/** Unlock Clean Stables' gate (Find Work ×20) directly, so tests can exercise it. */
function unlockCleanStables(s: ReturnType<typeof newGame>): void {
  s.run.tasks['find-work'] = { active: false, progress: 0, paused: false, count: 20, repeat: false };
}

describe('instant tasks', () => {
  it('Clean Stables pays Stamina and grants Gold (base × Strength), once per do', () => {
    const s = newGame(1);
    unlockCleanStables(s);
    s.run.vitals.stamina.max = 20; // headroom for two 5-Stamina cycles
    s.run.vitals.stamina.cur = 20;

    expect(doTask(s, 'clean-stables')).toBe(true);
    expect(s.run.resources.gold).toBeCloseTo(2, 6); // base 2 × Strength 1.0 at the start
    expect(s.run.vitals.stamina.cur).toBeCloseTo(15, 6); // cost 5

    doTask(s, 'clean-stables');
    expect(s.run.resources.gold).toBeCloseTo(4, 6);
    expect(s.run.tasks['clean-stables'].count).toBe(2);
  });

  it('an instant task is refused when its cost is unaffordable', () => {
    const s = newGame(1);
    unlockCleanStables(s);
    s.run.vitals.stamina.cur = 0;
    expect(doTask(s, 'clean-stables')).toBe(false);
    expect(s.run.resources.gold).toBe(0);
  });

  it('instant tasks never occupy an Activity slot', () => {
    const s = newGame(1);
    expect(doTask(s, 'begging')).toBe(true);
    expect(slotsUsed(s)).toBe(0);
  });
});

describe('activity slots', () => {
  it('starting a continuous task occupies a slot; stopping frees it', () => {
    const s = newGame(1);
    s.run.flags.awakened = true; // Study is gated behind the spark (T-005)
    expect(slotsUsed(s)).toBe(0);

    expect(startTask(s, 'study')).toBe(true);
    expect(s.run.tasks['study'].active).toBe(true);
    expect(slotsUsed(s)).toBe(1);

    expect(stopTask(s, 'study')).toBe(true);
    expect(s.run.tasks['study'].active).toBe(false);
    expect(slotsUsed(s)).toBe(0);
  });

  it('cannot start more continuous tasks than there are slots (start = 2)', () => {
    const s = newGame(1);
    s.run.flags.awakened = true; // Study is gated behind the spark (T-005)
    expect(startTask(s, 'study')).toBe(true);
    expect(startTask(s, 'smith')).toBe(true);
    expect(slotsUsed(s)).toBe(2);
    expect(startTask(s, 'rest')).toBe(false); // no free slot
    expect(slotsUsed(s)).toBe(2);
  });

  it('activity slots stay at the starting 2 (Widen the Study removed in v0.1.5)', () => {
    const s = newGame(1);
    expect(activitySlots(s)).toBe(2);
    expect(TASK_BY_ID['widen-study']).toBeUndefined(); // task removed
  });
});

describe('auto-pause / auto-resume', () => {
  it('a running task pauses when its per-second cost cannot be paid, then resumes', () => {
    const s = newGame(1);
    s.run.flags.awakened = true; // Study is gated behind the spark (T-005)
    startTask(s, 'study'); // Study drains Stamina 0.2/s
    s.run.vitals.stamina.cur = 0;
    s.run.vitals.stamina.regen = 0; // starve it deterministically

    step(s, 1);
    expect(s.run.tasks['study'].paused).toBe(true);
    expect(s.run.resources.insight).toBe(0); // no output while paused

    s.run.vitals.stamina.cur = 10; // resource is available again
    step(s, 1);
    expect(s.run.tasks['study'].paused).toBe(false);
    expect(s.run.resources.insight).toBeCloseTo(0.55, 6); // resumed producing
  });
});

describe('At-N repeat scaling', () => {
  it('Scribe Scroll gains +1 Scroll once it has been completed 5 times', () => {
    const s = newGame(1);
    s.run.skills = ['read-the-page']; // gated ONLY on Read the Page now (v0.1.2)
    s.run.resources.insight = 1000; // plenty to afford 6 scribes (3 each)
    s.run.vitals.stamina.max = 100; // headroom: each scribe costs 1 Stamina
    s.run.vitals.stamina.cur = 100;

    for (let i = 0; i < 5; i++) doTask(s, 'scribe-scroll');
    expect(s.run.tasks['scribe-scroll'].count).toBe(5);
    expect(s.run.resources.scroll).toBeCloseTo(5, 6); // first 5 are base output (1 each)

    doTask(s, 'scribe-scroll'); // 6th completion is boosted: +1
    expect(s.run.resources.scroll).toBeCloseTo(7, 6); // 5 + 2
    expect(s.run.resources.insight).toBeCloseTo(982, 6); // 6 × 3 spent
  });
});

describe('running tasks', () => {
  it('Smith completes a timed cycle, pays a Gold lump, and repeats', () => {
    const s = newGame(1);
    // Smith drains Stamina 0.4/s; give it headroom so the mechanic (not the tight
    // v0.1.1 Stamina budget) is what this test observes.
    s.run.vitals.stamina.max = 100;
    s.run.vitals.stamina.cur = 100;
    s.run.vitals.stamina.regen = 5;
    expect(startTask(s, 'smith')).toBe(true); // repeatable by default
    expect(s.run.tasks['smith'].repeat).toBe(true);

    simulate(s, 16); // one 15s cycle done, into the next
    expect(s.run.resources.gold).toBeCloseTo(5, 6);
    expect(s.run.tasks['smith'].count).toBe(1);
    expect(s.run.tasks['smith'].active).toBe(true); // still running (repeat on)

    simulate(s, 15); // second cycle completes
    expect(s.run.resources.gold).toBeCloseTo(10, 6);
    expect(s.run.tasks['smith'].count).toBe(2);
  });

  it('toggleRepeat flips the ↻ flag on a running task', () => {
    const s = newGame(1);
    startTask(s, 'smith');
    expect(s.run.tasks['smith'].repeat).toBe(true);
    expect(toggleRepeat(s, 'smith')).toBe(false);
    expect(s.run.tasks['smith'].repeat).toBe(false);
  });
});

describe('timed completion epsilon (playtest fix)', () => {
  it('a Limited task completes at EXACTLY its duration — no one-tick-late strand', () => {
    const s = newGame(1);
    s.run.resources.gold = 100;
    expect(startTask(s, 'coin-pouch')).toBe(true); // length 3; raiseGoldCap 25
    expect(slotsUsed(s)).toBe(1);

    // Float accumulation can leave progress a hair under 1 at exactly the duration; without
    // the EPS completion guard the task strands its slot + spent Gold for an extra tick. It
    // must complete AT its duration (3s).
    simulate(s, 3);

    expect(s.run.tasks['coin-pouch'].count).toBe(1);
    expect(s.run.tasks['coin-pouch'].active).toBe(false); // slot freed on completion
    expect(slotsUsed(s)).toBe(0);
    expect(s.run.caps.gold).toBe(50); // 25 → 50 effect applied
  });

  it('the exact-duration completion is identical via offline catch-up (advanceFixed path)', () => {
    const s = newGame(1);
    s.run.resources.gold = 100;
    startTask(s, 'coin-pouch');
    s.lastSaved = Date.now() - 3000; // exactly 3s away
    applyOffline(s, Date.now());
    expect(s.run.tasks['coin-pouch'].count).toBe(1);
    expect(s.run.caps.gold).toBe(50);
  });

  it('a perpetual + running mix still behaves across the fix', () => {
    const s = newGame(1);
    s.run.flags.awakened = true;
    s.run.caps.insight = 1e9; // keep Study output observable
    // Give Stamina headroom so Study (0.2/s) + Smith (0.4/s) don't auto-pause under the
    // tight v0.1.1 budget — this test is about the timestep math, not scarcity.
    s.run.vitals.stamina.max = 1000;
    s.run.vitals.stamina.cur = 1000;
    s.run.vitals.stamina.regen = 50;
    startTask(s, 'study'); // perpetual (Insight +0.55/s)
    startTask(s, 'smith'); // running, length 15, repeatable
    simulate(s, 46); // 3 Smith cycles (15/30/45), Study trickles the whole time
    expect(s.run.tasks['smith'].count).toBe(3);
    expect(s.run.tasks['smith'].active).toBe(true); // repeat keeps it running
    expect(s.run.resources.insight).toBeCloseTo(0.55 * 46, 4);
  });
});

describe('limited start-cost rate (display fix)', () => {
  it('a building Limited task shows no phantom per-second start-cost drain', () => {
    const s = newGame(1);
    s.run.resources.gold = 100;
    expect(startTask(s, 'coin-pouch')).toBe(true); // pays Gold 20 ONCE at start
    expect(s.run.resources.gold).toBeCloseTo(80, 6);

    // The one-time start-cost must NOT amortize as a per-second drain while it builds:
    // Gold stays flat (the 20 was already paid), unlike a repeating Running cycle.
    expect(taskRates(s).resources.gold ?? 0).toBe(0);
    const cp = listTaskInfo(s).find((i) => i.id === 'coin-pouch')!;
    expect(cp.net.gold ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// v0.1.1 — Odd Jobs ladder + card reveal + Home items/caps + learnable Mana
// ---------------------------------------------------------------------------
describe('card reveal (display-only)', () => {
  it('a locked task is hidden until ALL its requirements are met (v0.1.6: no leniency)', () => {
    const s = newGame(1);
    // Cleanse the Old Well needs BOTH Spark AND Ward-a-Barn ×5 — unmet at the Origin → hidden.
    expect(taskInfo(s, TASK_BY_ID['cleanse-the-old-well']).revealed).toBe(false);

    // find-work has ONE requirement (begging ×20). v0.1.6: a single unmet requirement now
    // HIDES the card (the old "one-away is revealed" leniency is gone).
    expect(taskInfo(s, TASK_BY_ID['find-work']).revealed).toBe(false);

    // Scribe Scroll needs Read the Page — unmet at the Origin → hidden.
    expect(taskInfo(s, TASK_BY_ID['scribe-scroll']).revealed).toBe(false);

    // begging has no requirements → always revealed.
    expect(taskInfo(s, TASK_BY_ID['begging']).revealed).toBe(true);

    // Meet find-work's gate (begging ×20) → now revealed.
    s.run.tasks['begging'] = { active: false, progress: 0, paused: false, count: 20, repeat: false };
    expect(taskInfo(s, TASK_BY_ID['find-work']).revealed).toBe(true);

    // Meet ONE of Cleanse's two gates (Spark) but not the other → still hidden (strict).
    s.run.skills = ['read-the-page', 'spark'];
    expect(taskInfo(s, TASK_BY_ID['cleanse-the-old-well']).revealed).toBe(false);
  });

  it('reveal is display-only: a maxed Limited task stays revealed but is locked', () => {
    const s = newGame(1);
    // Build Coin Pouch to its Max (3): count>0 keeps it revealed; maxed makes it locked.
    for (let i = 0; i < 3; i++) {
      s.run.resources.gold = 100;
      startTask(s, 'coin-pouch');
      simulate(s, 4);
    }
    const info = taskInfo(s, TASK_BY_ID['coin-pouch']);
    expect(info.revealed).toBe(true); // ever-completed → still shown
    expect(info.locked).toBe(true); // maxed → not startable
    expect(startTask(s, 'coin-pouch')).toBe(false);
  });
});

describe('Storage upgrades: Coin Pouch (gold cap) & Notebook (insight cap)', () => {
  it('building a Coin Pouch raises the Gold cap 25 → 50, and the tick clamps to it', () => {
    const s = newGame(1);
    expect(effectiveCap(s, 'gold')).toBe(25); // base cap (v0.1.2)
    s.run.resources.gold = 100; // fund the build (direct; not yet clamped by a tick)
    expect(startTask(s, 'coin-pouch')).toBe(true); // Limited, length 3, pays Gold 20
    expect(slotsUsed(s)).toBe(1);

    simulate(s, 4); // completes the 3s build
    expect(s.run.tasks['coin-pouch'].count).toBe(1);
    expect(s.run.caps.gold).toBe(50); // 25 + 25
    expect(slotsUsed(s)).toBe(0); // slot freed on completion

    s.run.resources.gold = 200; // over the new cap
    step(s, 0.1);
    expect(s.run.resources.gold).toBe(50); // clamped to the raised cap (excess lost)
  });

  it('building a Notebook raises the Insight cap 5 → 10 (gated on the spark now, v0.1.5)', () => {
    const s = newGame(1);
    expect(s.run.caps.insight).toBe(5); // base cap (v0.1.2)
    s.run.resources.gold = 100;
    expect(startTask(s, 'notebook')).toBe(false); // hidden + gated until awakened (v0.1.5)
    s.run.flags.awakened = true; // the spark fires
    expect(startTask(s, 'notebook')).toBe(true); // pays Gold 20, length 3
    simulate(s, 4);
    expect(s.run.caps.insight).toBe(10); // 5 + 5
  });

  it('Coin Pouch is Limited to 3 builds → Gold cap 25 → 100, then locks (maxed)', () => {
    const s = newGame(1);
    for (let i = 0; i < 3; i++) {
      s.run.resources.gold = 100; // fund each build (and dodge the cap clamp between builds)
      expect(startTask(s, 'coin-pouch')).toBe(true);
      simulate(s, 4);
    }
    expect(s.run.caps.gold).toBe(100); // 25 + 25 × 3
    s.run.resources.gold = 100;
    expect(startTask(s, 'coin-pouch')).toBe(false); // Max 3 reached → locked
  });
});

describe('Scrolls: scribe-scroll crafting (v0.1.2)', () => {
  it('is gated on Read the Page and crafts a Scroll from Insight + Stamina', () => {
    const s = newGame(1);
    // No lair gate anymore — but it needs the Read the Page cantrip.
    expect(doTask(s, 'scribe-scroll')).toBe(false); // no cantrip yet
    s.run.skills = ['read-the-page'];
    s.run.resources.insight = 5; // costs Insight 3 + Stamina 1

    expect(doTask(s, 'scribe-scroll')).toBe(true);
    expect(s.run.resources.scroll).toBe(1);
    expect(s.run.resources.insight).toBeCloseTo(2, 6); // 5 − 3
    expect(s.run.vitals.stamina.cur).toBeCloseTo(4, 6); // 5 − 1
  });
});

describe('Odd Jobs: Tool Belt job-output multiplier', () => {
  it('equipping the Tool Belt scales a job task output (×1.2), non-jobs unaffected', () => {
    const s = newGame(1);
    s.run.resources.gold = 40;
    expect(buyItem(s, 'tool-belt')).toBe(true);
    expect(equipItem(s, 'tool-belt')).toBe(false); // gear can't go in a housing slot…
    expect(equipGear(s, 'tool-belt')).toBe(true); // …it's worn on the paper doll's belt

    // Begging is a job (base +0.1 Gold) → ×1.2 = 0.12.
    s.run.resources.gold = 0;
    expect(doTask(s, 'begging')).toBe(true);
    expect(s.run.resources.gold).toBeCloseTo(0.12, 6);
  });
});

describe('Scavenge: deterministic random loot', () => {
  it('grants exactly one material, picked deterministically for a fixed seed', () => {
    const run = () => {
      const s = newGame(4242);
      s.run.tasks['clean-stables'] = { active: false, progress: 0, paused: false, count: 32, repeat: false };
      expect(doTask(s, 'scavenge')).toBe(true); // stamina 5 ≥ 2
      const { moonpetal, ironOre, spiritDust } = s.run.resources;
      return { moonpetal, ironOre, spiritDust, rng: s.rngState };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b); // same seed → same draw → same material (deterministic)

    // Exactly one material got +1, and the RNG state advanced.
    const total = a.moonpetal + a.ironOre + a.spiritDust;
    expect(total).toBe(1);
    expect(a.rng).not.toBe(newGame(4242).rngState);
  });
});

describe('learnable Mana (Inner Wellspring)', () => {
  it('unlocks Mana: sets max 10 / regen 0.1, and it then regenerates', () => {
    const s = newGame(1);
    expect(s.run.vitals.mana.max).toBe(0); // locked at the start
    s.run.resources.insight = 100;
    s.run.resources.scroll = 1; // Inner Wellspring costs a Scroll (v0.1.2)
    expect(learnCantrip(s, 'read-the-page')).toBe(true);
    expect(learnCantrip(s, 'inner-wellspring')).toBe(true);
    expect(s.run.vitals.mana.max).toBe(10);
    expect(s.run.vitals.mana.regen).toBeCloseTo(0.1, 6);

    const before = s.run.vitals.mana.cur;
    step(s, 1);
    expect(s.run.vitals.mana.cur).toBeCloseTo(before + 0.1, 6);
  });
});

describe('Inn rent', () => {
  it('living at the Inn drains Gold each second (no eviction, floored at 0)', () => {
    const s = newGame(1);
    s.run.flags.lairFounded = true; // Inn requires the lair beat
    expect(moveHome(s, 'inn')).toBe(true);
    s.run.resources.gold = 10;
    step(s, 1); // rent 0.1/s
    expect(s.run.resources.gold).toBeCloseTo(9.9, 6);
  });
});

// ---------------------------------------------------------------------------
// v0.1.5 — secret reveal, element-job tools, Find Lodging
// ---------------------------------------------------------------------------
describe('secret reveal (v0.1.6: strict reveal)', () => {
  it('any task with an unmet requirement stays hidden — secret or not', () => {
    const s = newGame(1);
    // Notebook is SECRET, gated on `awakened` → hidden before the spark.
    expect(taskInfo(s, TASK_BY_ID['notebook']).revealed).toBe(false);

    // find-work is NON-secret with one unmet requirement (begging ×20). v0.1.6: the secret
    // flag is now equivalent to the default — any unmet requirement hides the card, so
    // find-work is ALSO hidden (still locked).
    const fw = taskInfo(s, TASK_BY_ID['find-work']);
    expect(fw.revealed).toBe(false);
    expect(fw.locked).toBe(true);
  });

  it('the secret Notebook stays hidden until `awakened`, then is revealed', () => {
    const s = newGame(1);
    expect(taskInfo(s, TASK_BY_ID['notebook']).revealed).toBe(false); // pre-spark → hidden
    s.run.flags.awakened = true; // the spark fires
    expect(taskInfo(s, TASK_BY_ID['notebook']).revealed).toBe(true); // gate met → revealed
  });
});

describe('element-job tools (v0.1.5)', () => {
  it("building Smith's Hammer boosts Smith's Gold ×1.5; a job without its tool is unaffected", () => {
    const s = newGame(1);
    s.run.vitals.stamina.max = 100;
    s.run.vitals.stamina.cur = 100;
    s.run.vitals.stamina.regen = 5; // headroom so nothing auto-pauses

    // The Hammer is SECRET, gated on Smith ×5 → hidden until the job's been worked a bit.
    expect(taskInfo(s, TASK_BY_ID['forge-hammer']).revealed).toBe(false);
    s.run.tasks['smith'] = { active: false, progress: 0, paused: false, count: 5, repeat: false };
    expect(taskInfo(s, TASK_BY_ID['forge-hammer']).revealed).toBe(true);

    // Build the Hammer (Gold 40, length 4) — a one-off Limited purchase. Raise the Gold
    // cap first (as Coin Pouches would) so the tick doesn't clamp the funding hoard.
    s.run.caps.gold = 100;
    s.run.resources.gold = 100;
    expect(startTask(s, 'forge-hammer')).toBe(true);
    simulate(s, 5);
    expect(s.run.tasks['forge-hammer'].count).toBe(1);
    expect(s.run.resources.gold).toBeCloseTo(60, 6); // paid Gold 40

    // A Smith cycle now pays base 5 × 1.5 = 7.5 (the tool boost flows through completeCycle).
    s.run.resources.gold = 0;
    expect(startTask(s, 'smith')).toBe(true);
    simulate(s, 16); // one 15s cycle
    expect(s.run.resources.gold).toBeCloseTo(7.5, 6);
    stopTask(s, 'smith');

    // Haul the Catch (Water) has no tool built → unaffected, base 5.
    s.run.resources.gold = 0;
    expect(startTask(s, 'haul-the-catch')).toBe(true);
    simulate(s, 14); // one 13s cycle
    expect(s.run.resources.gold).toBeCloseTo(5, 6);
  });
});

describe('find-lodging (v0.1.5)', () => {
  it('gated at Gold ≥ 80; completing it sets lairFounded and moves home to the Inn', () => {
    const s = newGame(1);
    expect(s.run.flags.lairFounded ?? false).toBe(false);
    expect(s.run.home.tier).toBe('vagrant');
    s.run.caps.gold = 100; // as Coin Pouches would raise it, so 80 can be held

    s.run.resources.gold = 79;
    expect(startTask(s, 'find-lodging')).toBe(false); // must HOLD 80 Gold

    s.run.resources.gold = 80;
    expect(startTask(s, 'find-lodging')).toBe(true); // no Gold cost itself — just the gate
    expect(s.run.resources.gold).toBe(80); // find-lodging spends no Gold

    simulate(s, 5); // length 4 → completes
    expect(s.run.tasks['find-lodging'].count).toBe(1);
    expect(s.run.flags.lairFounded).toBe(true);
    expect(s.run.home.tier).toBe('inn');
  });
});

// T-005 — Character + Skills + the spark + caps.
// Cantrip purchase/awaken, the Insight-cap clamp + cap-aware payoff (the T-004
// review fix), and the spark/awakening trigger. Pure engine; no DOM.

import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate, step } from '../src/engine/tick';
import { startTask, taskRates, listTaskInfo } from '../src/engine/systems/tasks';
import { learnCantrip, listCantripInfo, outputMult } from '../src/engine/systems/skills';
import { essenceRates } from '../src/engine/systems/essence';
import { runProgression, isAwakened } from '../src/engine/systems/progression';
import { SPARK } from '../src/content/config';

// ---------------------------------------------------------------------------
// Cantrips: DAG prereqs, spend + awaken, the global multiplier, +regen
// ---------------------------------------------------------------------------
describe('cantrips', () => {
  it('respects DAG prereqs, spends Insight, awakens Prismatic and reveals your affinity (v0.1.7)', () => {
    const s = newGame(1);
    s.run.flags.awakened = true;
    s.run.resources.insight = 100;
    s.run.resources.scroll = 1; // Spark needs a Scroll to learn (v0.1.2)

    // Spark needs "Read the Page" first — refused until then, no Insight spent.
    expect(learnCantrip(s, 'spark')).toBe(false);
    expect(s.run.skills).not.toContain('spark');
    expect(s.run.resources.insight).toBe(100);

    expect(learnCantrip(s, 'read-the-page')).toBe(true); // cost 5
    expect(s.run.resources.insight).toBeCloseTo(95, 6);

    expect(learnCantrip(s, 'spark')).toBe(true); // cost 10 (v0.1.7), awakens ❖ Prismatic
    expect(s.run.resources.insight).toBeCloseTo(85, 6);
    expect(s.run.skills).toEqual(['read-the-page', 'spark']);
    expect(s.run.essence.prism.awakened).toBe(true);
    expect(s.run.essence.fire.awakened).toBe(false); // no specific element yet
    expect(s.run.flags.affinityRevealed).toBe(true); // your bent is unveiled
    expect(essenceRates(s).prism).toBeCloseTo(0.2, 6); // Prismatic trickle > 0

    // Learning the same cantrip twice is refused.
    expect(learnCantrip(s, 'spark')).toBe(false);

    // The awakened Prismatic trickle actually accrues on tick.
    const before = s.run.essence.prism.amount;
    step(s, 1);
    expect(s.run.essence.prism.amount).toBeCloseTo(before + 0.2, 6);
  });

  it('refuses a cantrip when Insight is short of the cost', () => {
    const s = newGame(2);
    s.run.flags.awakened = true;
    s.run.resources.insight = 3; // Read the Page costs 5
    expect(learnCantrip(s, 'read-the-page')).toBe(false);
    expect(s.run.skills).toHaveLength(0);
    expect(s.run.resources.insight).toBe(3);
  });

  it('Kindle Focus applies a +10% global output multiplier to task production', () => {
    const s = newGame(3);
    s.run.flags.awakened = true;
    s.run.resources.insight = 1000;
    s.run.resources.scroll = 2; // Spark + Kindle Focus each cost a Scroll (v0.1.2)
    learnCantrip(s, 'read-the-page');
    learnCantrip(s, 'spark');
    expect(outputMult(s)).toBeCloseTo(1, 6); // none yet
    learnCantrip(s, 'kindle-focus'); // requires spark
    expect(outputMult(s)).toBeCloseTo(1.1, 6);

    s.run.resources.insight = 0; // observe the boosted Study output cleanly (well under cap)
    startTask(s, 'study');
    step(s, 1);
    expect(s.run.resources.insight).toBeCloseTo(0.55 * 1.1, 6);
  });

  it('Mend permanently raises Stamina regen', () => {
    const s = newGame(4);
    s.run.flags.awakened = true;
    s.run.resources.insight = 1000;
    s.run.resources.scroll = 1; // Mend costs a Scroll (v0.1.2)
    learnCantrip(s, 'read-the-page');
    const before = s.run.vitals.stamina.regen; // 0.15 (v0.1.1 base)
    expect(learnCantrip(s, 'mend')).toBe(true);
    expect(s.run.vitals.stamina.regen).toBeCloseTo(before + 0.3, 6);
  });
});

// ---------------------------------------------------------------------------
// Insight cap: the `*`-marker predicate, the tick clamp, cap-aware payoff/rates
// ---------------------------------------------------------------------------
describe('insight cap', () => {
  it('an elemental opener exceeds the base cap until the Insight cap is raised (v0.1.7)', () => {
    const s = newGame(5);
    s.run.flags.awakened = true;
    const fireOpener = () => listCantripInfo(s).find((c) => c.id === 'awaken-fire')!;
    expect(fireOpener().cost).toBe(40); // dynamic base cost, 0 elements awakened
    expect(fireOpener().exceedsCap).toBe(true); // 40 > base cap 5

    // Raise the Insight cap above the cost directly (the reachable in-game cap tops at 20;
    // a proper cap-raiser via items arrives later — this asserts the `*` behaviour clears).
    s.run.caps.insight = 200;
    expect(fireOpener().exceedsCap).toBe(false); // 40 < 200
  });

  it('the tick clamps Insight to its cap', () => {
    const s = newGame(6);
    s.run.flags.awakened = true;
    s.run.resources.insight = s.run.caps.insight - 0.1; // just under the (tight v0.1.2) cap
    startTask(s, 'study');
    step(s, 1); // 0.55 would overshoot → clamps at the cap
    expect(s.run.resources.insight).toBeCloseTo(s.run.caps.insight, 6);
  });

  it('cap-aware payoff: Study reads +0.55/s below the cap, +0/s AT the cap (T-004 review fix)', () => {
    const s = newGame(7);
    s.run.flags.awakened = true;
    startTask(s, 'study');

    // Below cap: honest +0.55/s in both the left-panel rate and the card payoff.
    expect(taskRates(s).resources.insight).toBeCloseTo(0.55, 6);
    expect(listTaskInfo(s).find((i) => i.id === 'study')!.net.insight).toBeCloseTo(0.55, 6);

    // At cap: the gain is wasted, so the readout is 0 — not the phantom +0.55/s.
    s.run.resources.insight = s.run.caps.insight; // the (tight v0.1.2) base cap
    expect(taskRates(s).resources.insight ?? 0).toBe(0);
    expect(listTaskInfo(s).find((i) => i.id === 'study')!.net.insight ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The spark / Awakening trigger (Origin → Awakening)
// ---------------------------------------------------------------------------
describe('the spark', () => {
  it('a fresh mage is unawakened and cannot Study', () => {
    const s = newGame(8);
    expect(isAwakened(s)).toBe(false);
    expect(startTask(s, 'study')).toBe(false); // gated behind the spark
    expect(s.run.tasks.study.active).toBe(false);
  });

  it('fires on the Gold threshold, advancing the phase and un-gating Study', () => {
    const s = newGame(9);
    s.run.resources.gold = SPARK.goldThreshold; // 25
    step(s, 0.1);
    expect(isAwakened(s)).toBe(true);
    expect(s.run.phase).toBe('awakened');
    expect(startTask(s, 'study')).toBe(true); // now startable
  });

  it('fires on the timer for a purely idle player (never labours)', () => {
    const early = newGame(10);
    simulate(early, SPARK.timerSeconds - 1); // just short of the timer, Gold still 0
    expect(isAwakened(early)).toBe(false);

    const late = newGame(10);
    simulate(late, SPARK.timerSeconds + 1);
    expect(isAwakened(late)).toBe(true);
  });

  it('is idempotent — the spark chronicle line is written exactly once', () => {
    const s = newGame(11);
    simulate(s, SPARK.timerSeconds + 1);
    runProgression(s); // extra checks are cheap no-ops
    simulate(s, 100);
    const sparkLines = s.run.chronicle.filter((c) => c.text.includes('torn page')).length;
    expect(sparkLines).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scrolls gate cantrips (v0.1.2) — every cantrip past the free opener costs 1 Scroll
// ---------------------------------------------------------------------------
describe('cantrips require a Scroll (v0.1.2)', () => {
  it('the opener is Insight-only, but a scroll-gated cantrip fails without a Scroll and succeeds with one', () => {
    const s = newGame(1);
    s.run.flags.awakened = true;
    s.run.resources.insight = 100; // Insight is never the blocker here

    // Read the Page (scrollCost 0) is the free opener — no Scroll needed.
    expect(learnCantrip(s, 'read-the-page')).toBe(true);
    expect(listCantripInfo(s).find((c) => c.id === 'read-the-page')!.scrollCost).toBe(0);

    // Spark (scrollCost 1) is refused with no Scroll on hand — no Insight spent.
    const spark = () => listCantripInfo(s).find((c) => c.id === 'spark')!;
    expect(spark().scrollCost).toBe(1);
    expect(spark().hasScroll).toBe(false);
    expect(spark().affordable).toBe(false); // Insight ample, but no Scroll
    const insightBefore = s.run.resources.insight;
    expect(learnCantrip(s, 'spark')).toBe(false);
    expect(s.run.skills).not.toContain('spark');
    expect(s.run.resources.insight).toBe(insightBefore);

    // With a Scroll, it learns and the Scroll is spent.
    s.run.resources.scroll = 1;
    expect(spark().hasScroll).toBe(true);
    expect(spark().affordable).toBe(true);
    expect(learnCantrip(s, 'spark')).toBe(true);
    expect(s.run.resources.scroll).toBe(0); // the Scroll was consumed
    expect(s.run.essence.prism.awakened).toBe(true); // v0.1.7: Spark awakens ❖ Prismatic
  });
});

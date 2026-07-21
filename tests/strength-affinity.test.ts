// v0.1.4 — the Odd-Jobs ladder reorder, the Strength stat, hidden elemental affinity +
// the awaken-affinity spark, the Gold-only contracts, and the save v5 round-trip /
// migration. Pure engine + the store bridge (toView is DOM-free), like the sibling suites.

import { describe, it, expect } from 'vitest';
import { newGame, ELEMENTS, SAVE_VERSION, type GameState } from '../src/engine/state';
import { simulate, step } from '../src/engine/tick';
import { doTask, startTask } from '../src/engine/systems/tasks';
import { learnCantrip, listCantripInfo, openerCost, awakenedElementCount } from '../src/engine/systems/skills';
import { essenceRates } from '../src/engine/systems/essence';
import { breakdown } from '../src/engine/systems/breakdown';
import {
  strength,
  strengthLevel,
  strengthXpForLevel,
  addStrengthXp,
  dominantAffinity,
} from '../src/engine/systems/player';
import { serialize, deserialize, safeLoad, SAVE_MAGIC } from '../src/engine/save';
import { TASK_BY_ID } from '../src/content/tasks';
import { toView } from '../src/ui/stores';

/** A runtime with a given completion count, for gating tests. */
const runtimeWithCount = (count: number) => ({ active: false, progress: 0, paused: false, count, repeat: false });
/** Unlock Clean Stables' gate (Find Work ×20). */
function unlockCleanStables(s: GameState): void {
  s.run.tasks['find-work'] = runtimeWithCount(20);
}
/** Big Stamina headroom so a labour loop is never the thing under test. */
function staminaHeadroom(s: GameState): void {
  s.run.vitals.stamina.max = 1000;
  s.run.vitals.stamina.cur = 1000;
  s.run.vitals.stamina.regen = 0;
}

// ---------------------------------------------------------------------------
// The Odd-Jobs ladder reorder: begging → find-work (timed) → clean-stables / run-errands
// ---------------------------------------------------------------------------
describe('Odd-Jobs ladder reorder (v0.1.4)', () => {
  it('Find Work is now a timed running job gated on Begging ×20', () => {
    const s = newGame(1);
    const def = TASK_BY_ID['find-work'];
    expect(def.type).toBe('running');
    expect(def.length).toBe(8);

    staminaHeadroom(s);
    expect(startTask(s, 'find-work')).toBe(false); // Begging ×20 not met
    s.run.tasks['begging'] = runtimeWithCount(20);
    expect(startTask(s, 'find-work')).toBe(true);

    simulate(s, 9); // one 8s cycle completes
    expect(s.run.tasks['find-work'].count).toBeGreaterThanOrEqual(1);
    expect(s.run.resources.gold).toBeGreaterThanOrEqual(3); // +3 Gold per cycle
  });

  it('Clean Stables is gated on Find Work ×20 (now AFTER Find Work)', () => {
    const s = newGame(1);
    staminaHeadroom(s);
    expect(doTask(s, 'clean-stables')).toBe(false); // Find Work ×20 not met
    unlockCleanStables(s);
    expect(doTask(s, 'clean-stables')).toBe(true);
  });

  it('Run Errands shares the Find Work ×20 gate and costs less Stamina than Clean Stables', () => {
    expect((TASK_BY_ID['run-errands'].startCost ?? [])[0].amount).toBeLessThan(
      (TASK_BY_ID['clean-stables'].startCost ?? [])[0].amount,
    );
    const s = newGame(1);
    staminaHeadroom(s);
    expect(doTask(s, 'run-errands')).toBe(false); // gated
    s.run.tasks['find-work'] = runtimeWithCount(20);
    expect(doTask(s, 'run-errands')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Strength — the diminishing-returns curve, growth from Clean Stables, and scaling
// ---------------------------------------------------------------------------
describe('Strength stat (v0.1.4)', () => {
  it('levels on the triangular curve at 10/30/60 cumulative XP (diminishing returns)', () => {
    expect(strengthXpForLevel(1)).toBe(10);
    expect(strengthXpForLevel(2)).toBe(30);
    expect(strengthXpForLevel(3)).toBe(60);

    const s = newGame(1);
    const at = (xp: number) => {
      s.run.strengthXp = xp;
      return { level: strengthLevel(s), mult: strength(s) };
    };
    expect(at(0)).toEqual({ level: 0, mult: 1 });
    expect(at(9).level).toBe(0);
    expect(at(10)).toEqual({ level: 1, mult: 1.1 });
    expect(at(29).level).toBe(1);
    expect(at(30).level).toBe(2);
    expect(strength(s)).toBeCloseTo(1.2, 6);
    expect(at(60).level).toBe(3);
    expect(strength(s)).toBeCloseTo(1.3, 6);
  });

  it('addStrengthXp clamps to a finite, non-negative total', () => {
    const s = newGame(1);
    addStrengthXp(s, 5);
    expect(s.run.strengthXp).toBe(5);
    addStrengthXp(s, -100); // cannot go negative
    expect(s.run.strengthXp).toBe(0);
    addStrengthXp(s, NaN); // ignored
    expect(s.run.strengthXp).toBe(0);
  });

  it('each Clean Stables completion trains Strength (+1 XP); its Gold scales by Strength', () => {
    const s = newGame(1);
    unlockCleanStables(s);
    staminaHeadroom(s);
    expect(strength(s)).toBe(1);

    // First 10 completions all pay at Strength 1.0 (XP is granted AFTER output each time),
    // so Gold = 10 × (base 2 × 1.0) = 20, and XP reaches 10 → level 1.
    for (let i = 0; i < 10; i++) expect(doTask(s, 'clean-stables')).toBe(true);
    expect(s.run.strengthXp).toBe(10);
    expect(strengthLevel(s)).toBe(1);
    expect(strength(s)).toBeCloseTo(1.1, 6);
    expect(s.run.resources.gold).toBeCloseTo(20, 6);

    // The 11th completion now pays base 2 × Strength 1.1 = 2.2.
    const before = s.run.resources.gold;
    doTask(s, 'clean-stables');
    expect(s.run.resources.gold - before).toBeCloseTo(2.2, 6);
    expect(s.run.strengthXp).toBe(11);
  });

  it('Run Errands is NOT strength-scaled (flat Gold regardless of Strength)', () => {
    const s = newGame(1);
    s.run.tasks['find-work'] = runtimeWithCount(20);
    s.run.strengthXp = 60; // Strength ×1.3
    staminaHeadroom(s);
    expect(doTask(s, 'run-errands')).toBe(true);
    expect(s.run.resources.gold).toBeCloseTo(1.6, 6); // NOT ×1.3
  });

  it('the Player view exposes the six attributes for the Character panel', () => {
    const s = newGame(1);
    s.run.strengthXp = 30; // → Strength level 2 → ×1.20
    const p = toView(s).player;
    expect(p.attributes).toHaveLength(6);
    const str = p.attributes.find((a) => a.key === 'strength');
    expect(str?.value).toBeCloseTo(1.2, 6);
    // the other five start at ×1.00 (growth wired later); no separate level field
    expect(p.attributes.find((a) => a.key === 'charisma')?.value).toBe(1);
    expect(p.attributes.map((a) => a.key)).toEqual([
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Hidden elemental affinity + the awaken-affinity spark
// ---------------------------------------------------------------------------
describe('elemental affinity (v0.1.4)', () => {
  it('completing an element task raises that element affinity; dominantAffinity tracks the max', () => {
    const s = newGame(1);
    expect(dominantAffinity(s)).toBe('fire'); // all-zero ledger → Fire default
    expect(TASK_BY_ID['haul-the-catch'].element).toBe('water');

    s.run.vitals.stamina.max = 1000;
    s.run.vitals.stamina.cur = 1000;
    s.run.vitals.stamina.regen = 5; // never pauses the 0.4/s drain
    expect(startTask(s, 'haul-the-catch')).toBe(true); // Water, running 13s
    simulate(s, 14); // one cycle
    expect(s.run.affinity.water).toBeGreaterThanOrEqual(1);
    expect(dominantAffinity(s)).toBe('water');
  });

  it('Smith feeds Fire affinity (kept id, now element-tagged)', () => {
    const s = newGame(1);
    expect(TASK_BY_ID['smith'].element).toBe('fire');
    s.run.vitals.stamina.max = 1000;
    s.run.vitals.stamina.cur = 1000;
    s.run.vitals.stamina.regen = 5;
    startTask(s, 'smith');
    simulate(s, 16); // one 15s cycle
    expect(s.run.affinity.fire).toBeGreaterThanOrEqual(1);
  });

  it('Spark awakens ❖ Prismatic + reveals your affinity — NOT a specific element (v0.1.7)', () => {
    const s = newGame(1);
    s.run.affinity.water = 3; // Water is dominant
    s.run.flags.awakened = true;
    s.run.resources.insight = 100;
    s.run.resources.scroll = 1; // Spark needs a Scroll
    expect(learnCantrip(s, 'read-the-page')).toBe(true);
    expect(learnCantrip(s, 'spark')).toBe(true);

    // Spark opens the generic essence and unveils the bent — but no element yet.
    expect(s.run.essence.prism.awakened).toBe(true);
    expect(s.run.flags.affinityRevealed).toBe(true);
    expect(s.run.affinityElement).toBe(null); // NOT locked to an element yet
    expect(s.run.essence.water.awakened).toBe(false);
    expect(s.run.essence.fire.awakened).toBe(false);
    expect(essenceRates(s).prism).toBeCloseTo(0.2, 6); // Prismatic trickle
  });

  it("the DOMINANT-affinity opener is available after Spark and awakens that element (v0.1.7)", () => {
    const s = newGame(1);
    s.run.affinity.water = 3; // Water is dominant → awaken-water is the one unveiled
    s.run.flags.awakened = true;
    s.run.resources.insight = 1000; // set directly (openers exceed the in-game cap)
    s.run.resources.scroll = 5;
    learnCantrip(s, 'read-the-page');
    learnCantrip(s, 'spark');

    const info = (id: string) => listCantripInfo(s).find((c) => c.id === id)!;
    expect(info('awaken-water').status).toBe('available'); // dominant surfaces first
    expect(info('awaken-fire').status).toBe('locked'); // non-dominant, not yet unveiled
    expect(info('awaken-fire').prereqNote).toMatch(/hasn't surfaced/);

    // Learning the dominant opener awakens Water and locks affinityElement to it.
    expect(learnCantrip(s, 'awaken-water')).toBe(true);
    expect(s.run.essence.water.awakened).toBe(true);
    expect(s.run.affinityElement).toBe('water');
    expect(essenceRates(s).water).toBeCloseTo(0.2, 6);
  });

  it('a NON-dominant opener stays locked until ≥1 element is awakened (v0.1.7)', () => {
    const s = newGame(1);
    s.run.affinity.water = 3; // Water dominant → Fire opener is NOT dominant
    s.run.flags.awakened = true;
    s.run.resources.insight = 1000;
    s.run.resources.scroll = 5;
    learnCantrip(s, 'read-the-page');
    learnCantrip(s, 'spark');

    const fireStatus = () => listCantripInfo(s).find((c) => c.id === 'awaken-fire')!.status;
    expect(fireStatus()).toBe('locked'); // not dominant, no element awakened yet
    expect(learnCantrip(s, 'awaken-fire')).toBe(false); // engine refuses the un-unveiled opener

    // Awaken the dominant Water first → every other opener now surfaces.
    expect(learnCantrip(s, 'awaken-water')).toBe(true);
    expect(fireStatus()).toBe('available');
    expect(learnCantrip(s, 'awaken-fire')).toBe(true);
  });

  it('opener cost scales 40 → 64 → 102 … per element already awakened, and is charged (v0.1.7)', () => {
    const s = newGame(1);
    s.run.flags.awakened = true;
    s.run.resources.insight = 1000;
    s.run.resources.scroll = 9;
    learnCantrip(s, 'read-the-page');
    learnCantrip(s, 'spark'); // awakens ❖ Prismatic only (excluded from the count)

    expect(awakenedElementCount(s)).toBe(0);
    expect(openerCost(s)).toBe(40); // 1st = 40·1.6⁰

    const insightBeforeFirst = s.run.resources.insight;
    expect(learnCantrip(s, 'awaken-fire')).toBe(true); // fire is the default dominant
    expect(insightBeforeFirst - s.run.resources.insight).toBeCloseTo(40, 6); // charged 40

    expect(awakenedElementCount(s)).toBe(1);
    expect(openerCost(s)).toBe(64); // 2nd = Math.round(40·1.6) = 64

    const insightBeforeSecond = s.run.resources.insight;
    expect(learnCantrip(s, 'awaken-water')).toBe(true);
    expect(insightBeforeSecond - s.run.resources.insight).toBeCloseTo(64, 6); // charged 64
    expect(openerCost(s)).toBe(102); // 3rd = Math.round(40·1.6²) = 102
  });

  it('the 40+ openers show the exceeds-cap `*` marker under the reachable cap (v0.1.7)', () => {
    const s = newGame(1);
    s.run.affinity.fire = 3; // fire dominant → awaken-fire is unveiled after Spark
    s.run.flags.awakened = true;
    s.run.caps.insight = 20; // the reachable in-game ceiling (Notebook ×3)
    s.run.resources.insight = 1000;
    s.run.resources.scroll = 5;
    learnCantrip(s, 'read-the-page');
    learnCantrip(s, 'spark');
    const fire = listCantripInfo(s).find((c) => c.id === 'awaken-fire')!;
    expect(fire.cost).toBe(40);
    expect(fire.exceedsCap).toBe(true); // 40 > 20 → wears the `*`
  });
});

// ---------------------------------------------------------------------------
// Contracts: Gold-only, and their essence cost follows the awakened affinity element
// ---------------------------------------------------------------------------
describe('contracts follow the affinity essence (v0.1.4 / v0.1.7)', () => {
  it("a contract resolves to ❖ Prismatic before any element is opened (sustainable on Spark)", () => {
    const s = newGame(1);
    s.run.flags.awakened = true;
    s.run.resources.insight = 100;
    s.run.resources.scroll = 1;
    learnCantrip(s, 'read-the-page');
    learnCantrip(s, 'spark'); // awakens ❖ Prismatic; affinityElement still null
    expect(s.run.affinityElement).toBe(null);

    s.run.essence.prism.amount = 100; // Spark's Prismatic fuels the contract
    s.run.vitals.stamina.max = 100;
    s.run.vitals.stamina.cur = 100;
    expect(startTask(s, 'ward-a-barn')).toBe(true);

    step(s, 1); // burns Prism 0.15/s (sentinel → 'prism'), Spark trickles +0.2 Prism
    expect(s.run.essence.prism.amount).toBeCloseTo(100 - 0.15 + 0.2, 6);
    // Net-positive on Spark alone: the contract is sustainable at the reachable tier.
    expect(s.run.essence.prism.amount).toBeGreaterThan(100);
  });

  it('a contract costs the awakened element essence and auto-pauses when it runs out', () => {
    const s = newGame(1);
    s.run.affinity.water = 5; // Water dominant
    s.run.flags.awakened = true;
    s.run.resources.insight = 1000;
    s.run.resources.scroll = 5;
    learnCantrip(s, 'read-the-page');
    learnCantrip(s, 'spark'); // awakens ❖ Prismatic; affinityElement still null
    learnCantrip(s, 'awaken-water'); // the dominant opener → awakens Water, affinityElement = 'water'
    expect(s.run.affinityElement).toBe('water');

    s.run.essence.water.amount = 100; // fuel the contract
    s.run.vitals.stamina.max = 100;
    s.run.vitals.stamina.cur = 100;
    expect(startTask(s, 'ward-a-barn')).toBe(true);

    step(s, 1); // burns Water 0.15/s (resolved from the 'affinity' sentinel), trickles +0.2
    expect(s.run.essence.water.amount).toBeCloseTo(100 - 0.15 + 0.2, 6);
    expect(s.run.essence.fire.amount).toBe(0); // Fire is never touched

    // While it runs, the essence breakdown attributes the drain to Water (sentinel resolved).
    const b = breakdown(s, { kind: 'essence', id: 'water' });
    expect(b.consumes.some((c) => c.name === 'Fulfil: Ward a Barn')).toBe(true);

    // Starve Water below the per-second cost → auto-pause on the next step.
    s.run.essence.water.amount = 0.1;
    step(s, 1);
    expect(s.run.tasks['ward-a-barn'].paused).toBe(true);
  });

  it('contracts pay Gold only — no Renown, no material drops', () => {
    for (const id of ['ward-a-barn', 'cleanse-the-old-well']) {
      const out = TASK_BY_ID[id].output ?? [];
      expect(out.every((o) => o.pool === 'resource' && o.id === 'gold')).toBe(true);
    }
    // Cleanse's gate is now Ward-a-Barn ×5 (no Renown requirement).
    const reqs = TASK_BY_ID['cleanse-the-old-well'].requires ?? [];
    expect(reqs.some((r) => r.kind === 'taskCount' && r.id === 'ward-a-barn' && r.atLeast === 5)).toBe(true);
    expect(reqs.some((r) => r.kind === 'resource' && r.id === 'renown')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Save v5 — round-trip + v4→v5 migration backfill
// ---------------------------------------------------------------------------
describe('save v5 (strength + affinity)', () => {
  it('round-trips strengthXp / affinity / affinityElement', () => {
    const s = newGame(42);
    s.run.strengthXp = 35;
    s.run.affinity.water = 7;
    s.run.affinity.earth = 2;
    s.run.affinityElement = 'water';
    const round = deserialize(serialize(s));
    expect(round).toEqual(s);
    expect(round.run.strengthXp).toBe(35);
    expect(round.run.affinity.water).toBe(7);
    expect(round.run.affinityElement).toBe('water');
  });

  it('a v4 save (no strength/affinity) migrates to v5 with backfilled defaults', () => {
    const base = newGame(10) as unknown as { run: Record<string, unknown> };
    delete base.run.strengthXp;
    delete base.run.affinity;
    delete base.run.affinityElement;
    const envelope = { magic: SAVE_MAGIC, version: 4, state: base };

    const res = safeLoad(JSON.stringify(envelope));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(4);
    expect(res.state!.version).toBe(SAVE_VERSION);
    expect(res.state!.run.strengthXp).toBe(0);
    expect(res.state!.run.affinityElement).toBe(null);
    expect(Object.keys(res.state!.run.affinity)).toHaveLength(ELEMENTS.length);
    expect(() => toView(res.state!)).not.toThrow();
  });

  it('normalize repairs an out-of-domain affinityElement back to null', () => {
    const s = newGame(11) as unknown as { run: { affinityElement: unknown } };
    s.run.affinityElement = 'not-an-element';
    const res = safeLoad(serialize(s as never));
    expect(res.ok).toBe(true);
    expect(res.state!.run.affinityElement).toBe(null);
  });

  it('an old save with the removed umbral-whisper cantrip in skills[] loads without crashing (v0.1.7)', () => {
    const s = newGame(12);
    // A pre-v0.1.7 save: the old opener id lingers in skills[]; the read models must
    // tolerate an unknown/removed cantrip id (CANTRIP_BY_ID lookups guard it).
    s.run.skills = ['read-the-page', 'umbral-whisper'];
    const res = safeLoad(serialize(s));
    expect(res.ok).toBe(true);
    expect(res.state!.run.skills).toContain('umbral-whisper'); // lingers harmlessly
    expect(() => toView(res.state!)).not.toThrow(); // read models don't crash
    expect(() => listCantripInfo(res.state!)).not.toThrow();
    expect(() => essenceRates(res.state!)).not.toThrow();
  });
});

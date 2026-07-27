import { describe, it, expect } from 'vitest';
import { reveal } from './helpers';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { doGather, actionsView } from '../src/engine/systems/actions';
import { growthStatus } from '../src/engine/systems/population';
import { calendar } from '../src/engine/systems/calendar';
import { build, buildingCost, buildingsView } from '../src/engine/systems/buildings';
import { BUILDING_BY_ID } from '../src/content/buildings';
import { MANUAL_GATHER_RETIRE_CAP } from '../src/content/config';
import { assignJob, unassignJob, jobCapacity, idleSettlers } from '../src/engine/systems/jobs';
import { research } from '../src/engine/systems/tech';
import { productionRates, resourceBreakdown } from '../src/engine/systems/production';

describe('gather actions', () => {
  it('adds a resource on a manual gather', () => {
    const s = newGame(1);
    expect(doGather(s, 'gather-wood')).toBe(true);
    expect(s.run.resources.wood).toBe(1);
    expect(doGather(s, 'quarry-stone')).toBe(true);
    expect(s.run.resources.stone).toBe(1);
  });

  it('respects the storage cap', () => {
    const s = newGame(1);
    for (let i = 0; i < 600; i++) doGather(s, 'gather-wood');
    expect(s.run.resources.wood).toBe(500); // clamped to the 500 base wood cap
  });

  it('refuses an unknown action', () => {
    expect(doGather(newGame(1), 'nope')).toBe(false);
  });
});

describe('buildings', () => {
  it('cannot build a hut without resources', () => {
    const s = newGame(1);
    expect(build(s, 'hut')).toBe(false);
    expect(s.run.popCap).toBe(0);
  });

  it('building a hut costs wood and raises popCap', () => {
    const s = newGame(1);
    s.run.resources.wood = 10;
    expect(buildingCost(s, 'hut')).toEqual({ wood: 10 });
    expect(build(s, 'hut')).toBe(true);
    expect(s.run.resources.wood).toBe(0);
    expect(s.run.popCap).toBe(1);
    expect(s.run.buildings.hut).toBe(1);
  });

  it('hut cost escalates with each build', () => {
    const s = newGame(1);
    s.run.resources.wood = 1000;
    build(s, 'hut'); // 10
    expect(buildingCost(s, 'hut').wood).toBe(Math.ceil(10 * 1.5)); // 15
  });

  it('the Build tab opens with the House alone, then unfolds a rung at a time', () => {
    const s = newGame(1);
    const unlocked = () => buildingsView(s).filter((b) => b.unlocked).map((b) => b.id);
    // Day one is a single decision: somewhere to live.
    expect(unlocked()).toEqual(['hut']);

    s.run.resources.wood = 10_000;
    expect(build(s, 'hut')).toBe(true);
    expect(unlocked()).toEqual(['hut', 'forager-hut']); // a roof, then something to eat

    expect(build(s, 'forager-hut')).toBe(true);
    const third = unlocked();
    expect(third).toContain('woodcutters-lodge'); // the forest, and somewhere to put things
    expect(third).toContain('storehouse');
    expect(third).not.toContain('wayside-shrine'); // one rung further out

    expect(build(s, 'woodcutters-lodge')).toBe(true);
    const fourth = unlocked();
    expect(fourth).toContain('wayside-shrine');
    expect(fourth).not.toContain('hunters-lodge'); // gated behind the Archery tech
    expect(fourth).not.toContain('library'); // the science building is gated behind Writing
    expect(fourth).not.toContain('farm-house'); // the housing/farm hybrid needs Agriculture
  });

  it("the Hunter's Lodge is gated behind the Archery tech", () => {
    const s = newGame(1);
    s.run.resources.wood = 100;
    expect(build(s, 'hunters-lodge')).toBe(false); // no Archery yet
    s.run.tech.push('archery');
    expect(build(s, 'hunters-lodge')).toBe(true);
    expect(jobCapacity(s, 'hunter')).toBe(1); // one job per building
  });

  it('the Farm needs no tech and opens a Farmer slot immediately', () => {
    const s = reveal(newGame(1), 'forager-hut');
    s.run.resources.wood = 100;
    expect(build(s, 'forager-hut')).toBe(true); // buildable from turn one
    expect(jobCapacity(s, 'forager')).toBe(1); // one Farmer slot per Farm
  });

  it('a locked (tech-gated) building refuses to build', () => {
    const s = newGame(1);
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'quarry')).toBe(false); // needs masonry
    s.run.tech.push('masonry');
    expect(build(s, 'quarry')).toBe(true);
    expect(jobCapacity(s, 'quarry-worker')).toBe(1);
  });
});

describe('jobs', () => {
  it('assigning a woodcutter produces wood and consumes only base settler food', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    reveal(s, 'woodcutters-lodge'); // the opening chain: House → Farm → Lodge
    build(s, 'woodcutters-lodge'); // opens 2 woodcutter slots
    s.run.population.total = 1;
    expect(assignJob(s, 'woodcutter', 1)).toBe(1);

    const rates = productionRates(s);
    expect(rates.wood).toBeCloseTo(1 * 1.02, 6); // 1 worker × 0.5/s × the Lodge's own +2%
    expect(rates.food).toBeCloseTo(-4, 6); // base settler upkeep only — jobs no longer eat food

    const woodBefore = s.run.resources.wood;
    const foodBefore = s.run.resources.food;
    simulate(s, 10);
    expect(s.run.resources.wood).toBeGreaterThan(woodBefore);
    expect(s.run.resources.food).toBeLessThan(foodBefore);
  });

  it('cannot assign beyond idle settlers', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    reveal(s, 'woodcutters-lodge'); // the opening chain: House → Farm → Lodge
    build(s, 'woodcutters-lodge');
    s.run.population.total = 1;
    expect(assignJob(s, 'woodcutter', 5)).toBe(1); // only 1 idle
    expect(idleSettlers(s)).toBe(0);
    expect(assignJob(s, 'woodcutter', 1)).toBe(0); // none left idle
  });

  it('cannot assign beyond building capacity', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    reveal(s, 'woodcutters-lodge'); // the opening chain: House → Farm → Lodge
    build(s, 'woodcutters-lodge'); // capacity 1 — one building, one slot
    s.run.population.total = 5;
    expect(assignJob(s, 'woodcutter', 5)).toBe(1); // capped at the single slot
    expect(unassignJob(s, 'woodcutter', 1)).toBe(1);
    expect(s.run.population.jobs.woodcutter).toBe(0);
  });
});

describe('buildings: storage bump + escalating cost', () => {
  it('a workplace adds a little storage cap AND costs more each copy', () => {
    const s = newGame(1);
    reveal(s, 'woodcutters-lodge'); // the opening chain: House → Farm → Lodge
    s.run.resources.wood = 200;
    const capBefore = s.run.caps.wood;
    const costBefore = buildingCost(s, 'woodcutters-lodge').wood as number;
    expect(build(s, 'woodcutters-lodge')).toBe(true);
    // The Lodge stores WOOD specifically (+100) — its own yield, nothing else.
    expect(s.run.caps.wood).toBe(capBefore + 100);
    expect(s.run.caps.stone).toBe(500); // untouched: a woodpile holds no stone
    const costAfter = buildingCost(s, 'woodcutters-lodge').wood as number;
    expect(costAfter).toBeGreaterThan(costBefore); // costGrowth escalates per copy
  });

  it('magic constructs are special — flat cost, no escalation', () => {
    expect(BUILDING_BY_ID['arcane-font'].costGrowth).toBeUndefined();
    expect(BUILDING_BY_ID['animated-tools'].costGrowth).toBeUndefined();
  });
});

describe('calendar (100 days/season, 2s/day, 4 seasons; hidden until unlocked)', () => {
  it('derives day/season/year from playtime and hides until the Calendar tech', () => {
    const s = newGame(1);
    s.playtime = 0;
    let c = calendar(s);
    expect(c.day).toBe(1);
    expect(c.season).toBe('Spring');
    expect(c.year).toBe(1);
    expect(c.unlocked).toBe(false); // not researched yet → UI hides it

    // 2s/day → day 50 of Spring at 98s (49 whole days elapsed → day 50).
    s.playtime = 98;
    c = calendar(s);
    expect(c.day).toBe(50);
    expect(c.season).toBe('Spring');

    // 100 days = 200s → start of Summer (day 1).
    s.playtime = 200;
    c = calendar(s);
    expect(c.season).toBe('Summer');
    expect(c.day).toBe(1);

    // 400 days = 800s → Year 2, Spring, day 1.
    s.playtime = 800;
    c = calendar(s);
    expect(c.year).toBe(2);
    expect(c.season).toBe('Spring');
    expect(c.day).toBe(1);

    s.run.tech.push('calendar');
    expect(calendar(s).unlocked).toBe(true);
  });
});

describe('manual gather retires once storage has outgrown it', () => {
  it('turns off hand-gathering for a resource once its cap reaches the threshold', () => {
    const s = newGame(1);
    expect(doGather(s, 'gather-wood')).toBe(true); // works at the base 500 cap
    // Read the threshold from the constant, not a literal: this pacing gets retuned, and a
    // hardcoded figure turns a deliberate rebalance into a mystery failure.
    s.run.caps.wood = MANUAL_GATHER_RETIRE_CAP - 1; // just short — still worth a click
    expect(actionsView(s).find((a) => a.resource === 'wood')!.retired).toBe(false);
    s.run.caps.wood = MANUAL_GATHER_RETIRE_CAP; // storage scaled up — production covers it
    const wood = actionsView(s).find((a) => a.resource === 'wood')!;
    expect(wood.retired).toBe(true);
    expect(wood.available).toBe(false);
    expect(doGather(s, 'gather-wood')).toBe(false); // manual earning is off
    // Other resources still hand-gatherable while their cap is below the threshold.
    expect(actionsView(s).find((a) => a.resource === 'stone')!.retired).toBe(false);
    expect(doGather(s, 'quarry-stone')).toBe(true);
  });
});

describe('next-settler growth status', () => {
  it('reports growing progress toward the next settler under a food surplus', () => {
    const s = newGame(1);
    s.run.popCap = 5;
    reveal(s, 'forager-hut'); // the opening chain: a House reveals the Farm
    s.run.buildings['forager-hut'] = 1; // Farm → Farmer capacity
    s.run.population.total = 1;
    assignJob(s, 'forager', 1); // a Farmer nets +food over base upkeep → sustainable
    s.run.resources.food = 40;
    const before = growthStatus(s);
    expect(before.status).toBe('growing');
    simulate(s, 4); // ~half the 8s growth interval
    const after = growthStatus(s);
    expect(after.status).toBe('growing');
    expect(after.progress).toBeGreaterThan(before.progress);
    expect(after.progress).toBeLessThanOrEqual(1);
  });

  it('flags full housing when at popCap', () => {
    const s = newGame(1);
    s.run.popCap = 2;
    s.run.population.total = 2;
    s.run.resources.food = 40;
    expect(growthStatus(s).status).toBe('full');
  });
});

describe('research trickle (tech currency from the first settler)', () => {
  it('yields no research with no settlers, and a trickle once a settler arrives', () => {
    const s = newGame(1);
    expect(productionRates(s).research).toBe(0);
    s.run.population.total = 1;
    expect(productionRates(s).research).toBeGreaterThan(0);
    // and the breakdown attributes it to the settlers
    const bd = resourceBreakdown(s, 'research');
    expect(bd.producers.some((p) => p.label.startsWith('Settlers'))).toBe(true);
  });
});

describe('resource breakdown (hover math)', () => {
  it('decomposes a resource into producers, consumers, and net', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    reveal(s, 'woodcutters-lodge'); // the opening chain: House → Farm → Lodge
    build(s, 'woodcutters-lodge');
    s.run.population.total = 1;
    assignJob(s, 'woodcutter', 1);

    const wood = resourceBreakdown(s, 'wood');
    expect(wood.producers.some((p) => p.label.startsWith("Woodcutter"))).toBe(true);
    expect(wood.net).toBeCloseTo(productionRates(s).wood, 6);

    const food = resourceBreakdown(s, 'food');
    // A settler + a working woodcutter both eat food → consumers present, net negative.
    expect(food.consumers.length).toBeGreaterThan(0);
    expect(food.net).toBeLessThan(0);
  });
});

describe('tech', () => {
  it('researching a tech spends research (and any material cost) and unlocks it', () => {
    const s = newGame(1);
    s.run.resources.research = 170;
    s.run.resources.stone = 45; // stone-axe also consumes 40 stone
    expect(research(s, 'stone-axe')).toBe(true); // cost 150 research + 40 stone
    expect(s.run.tech).toContain('stone-axe');
    expect(s.run.resources.research).toBe(20);
    expect(s.run.resources.stone).toBe(5);
  });

  it('stone-axe boosts Woodcutter output (+25%)', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    reveal(s, 'woodcutters-lodge'); // the opening chain: House → Farm → Lodge
    build(s, 'woodcutters-lodge');
    s.run.population.total = 1;
    assignJob(s, 'woodcutter', 1);
    expect(productionRates(s).wood).toBeCloseTo(1 * 1.02, 6); // one Lodge: +2%
    s.run.tech.push('stone-axe');
    expect(productionRates(s).wood).toBeCloseTo(1 * 1.02 * 1.25, 6); // ×1.25
  });

  it('gates Naturalism behind Agriculture (the one magic-feeding tech)', () => {
    const s = newGame(1);
    s.run.resources.research = 1000;
    expect(research(s, 'naturalism')).toBe(false); // needs agriculture first
    s.run.tech.push('agriculture'); // its prerequisite
    expect(research(s, 'naturalism')).toBe(true);
  });

  it('cannot research without enough research on hand', () => {
    const s = newGame(1);
    s.run.resources.research = 2;
    s.run.resources.stone = 100; // plenty of the material — research is the shortfall
    expect(research(s, 'stone-axe')).toBe(false); // costs 300 research
  });
});

import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { doGather, actionsView } from '../src/engine/systems/actions';
import { growthStatus } from '../src/engine/systems/population';
import { calendar } from '../src/engine/systems/calendar';
import { build, buildingCost, buildingsView } from '../src/engine/systems/buildings';
import { BUILDING_BY_ID } from '../src/content/buildings';
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
    for (let i = 0; i < 250; i++) doGather(s, 'gather-wood');
    expect(s.run.resources.wood).toBe(200); // clamped to the 200 base wood cap
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
    s.run.resources.wood = 15;
    expect(buildingCost(s, 'hut')).toEqual({ wood: 15 });
    expect(build(s, 'hut')).toBe(true);
    expect(s.run.resources.wood).toBe(0);
    expect(s.run.popCap).toBe(2);
    expect(s.run.buildings.hut).toBe(1);
  });

  it('hut cost escalates with each build', () => {
    const s = newGame(1);
    s.run.resources.wood = 1000;
    build(s, 'hut'); // 15
    expect(buildingCost(s, 'hut').wood).toBe(Math.ceil(15 * 1.5)); // 23
  });

  it('only the Hut is unlocked at the start; workplaces reveal after a Hut', () => {
    const s = newGame(1);
    const unlocked = () => buildingsView(s).filter((b) => b.unlocked).map((b) => b.id);
    expect(unlocked()).toEqual(['hut']); // v0.1: nothing else at the very start

    s.run.resources.wood = 15;
    expect(build(s, 'hut')).toBe(true);
    const after = unlocked();
    expect(after).toContain('storehouse');
    expect(after).toContain('woodcutters-lodge');
    expect(after).toContain('forager-hut');
    expect(after).toContain('hunters-lodge'); // Hunter's Lodge also reveals after a Hut
    expect(after).not.toContain('library'); // the science building is still gated behind Writing
  });

  it('a locked (tech-gated) building refuses to build', () => {
    const s = newGame(1);
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'quarry')).toBe(false); // needs masonry
    s.run.tech.push('masonry');
    expect(build(s, 'quarry')).toBe(true);
    expect(jobCapacity(s, 'quarry-worker')).toBe(2);
  });
});

describe('jobs', () => {
  it('assigning a woodcutter produces wood and consumes only base settler food', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    s.run.buildings.hut = 1; // Hut prereq unlocks the workplace (v0.1: only Hut shows at start)
    build(s, 'woodcutters-lodge'); // opens 2 woodcutter slots
    s.run.population.total = 1;
    expect(assignJob(s, 'woodcutter', 1)).toBe(1);

    const rates = productionRates(s);
    expect(rates.wood).toBeCloseTo(0.5, 6); // 1 worker × 0.5/s
    expect(rates.food).toBeCloseTo(-0.05, 6); // base settler upkeep only — jobs no longer eat food

    const woodBefore = s.run.resources.wood;
    const foodBefore = s.run.resources.food;
    simulate(s, 10);
    expect(s.run.resources.wood).toBeGreaterThan(woodBefore);
    expect(s.run.resources.food).toBeLessThan(foodBefore);
  });

  it('cannot assign beyond idle settlers', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    s.run.buildings.hut = 1; // Hut prereq unlocks the workplace (v0.1: only Hut shows at start)
    build(s, 'woodcutters-lodge');
    s.run.population.total = 1;
    expect(assignJob(s, 'woodcutter', 5)).toBe(1); // only 1 idle
    expect(idleSettlers(s)).toBe(0);
    expect(assignJob(s, 'woodcutter', 1)).toBe(0); // none left idle
  });

  it('cannot assign beyond building capacity', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    s.run.buildings.hut = 1; // Hut prereq unlocks the workplace (v0.1: only Hut shows at start)
    build(s, 'woodcutters-lodge'); // capacity 2
    s.run.population.total = 5;
    expect(assignJob(s, 'woodcutter', 5)).toBe(2); // capped at capacity
    expect(unassignJob(s, 'woodcutter', 1)).toBe(1);
    expect(s.run.population.jobs.woodcutter).toBe(1);
  });
});

describe('buildings: storage bump + escalating cost', () => {
  it('a workplace adds a little storage cap AND costs more each copy', () => {
    const s = newGame(1);
    s.run.buildings.hut = 1; // prereq for the workplace
    s.run.resources.wood = 200;
    const capBefore = s.run.caps.wood;
    const costBefore = buildingCost(s, 'woodcutters-lodge').wood as number;
    expect(build(s, 'woodcutters-lodge')).toBe(true);
    expect(s.run.caps.wood).toBe(capBefore + 20); // +20 storage on top of the job slots
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

describe('manual gather retires at a 1000 cap', () => {
  it('turns off hand-gathering for a resource once its cap reaches 1000', () => {
    const s = newGame(1);
    expect(doGather(s, 'gather-wood')).toBe(true); // works at the base 200 cap
    s.run.caps.wood = 1000; // storage scaled up — production now covers it
    const wood = actionsView(s).find((a) => a.resource === 'wood')!;
    expect(wood.retired).toBe(true);
    expect(wood.available).toBe(false);
    expect(doGather(s, 'gather-wood')).toBe(false); // manual earning is off
    // Other resources still hand-gatherable while their cap is below 1000.
    expect(actionsView(s).find((a) => a.resource === 'stone')!.retired).toBe(false);
    expect(doGather(s, 'quarry-stone')).toBe(true);
  });
});

describe('next-settler growth status', () => {
  it('reports growing progress toward the next settler under a food surplus', () => {
    const s = newGame(1);
    s.run.popCap = 5;
    s.run.buildings.hut = 1; // prereq for the Farm
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
    s.run.buildings.hut = 1; // Hut prereq
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
    s.run.resources.research = 20;
    s.run.resources.stone = 15; // stone-axe also consumes 10 stone
    expect(research(s, 'stone-axe')).toBe(true); // cost 10 research + 10 stone
    expect(s.run.tech).toContain('stone-axe');
    expect(s.run.resources.research).toBe(10);
    expect(s.run.resources.stone).toBe(5);
  });

  it('stone-axe boosts Woodcutter output (+25%)', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    s.run.buildings.hut = 1; // Hut prereq unlocks the workplace (v0.1: only Hut shows at start)
    build(s, 'woodcutters-lodge');
    s.run.population.total = 1;
    assignJob(s, 'woodcutter', 1);
    expect(productionRates(s).wood).toBeCloseTo(0.5, 6);
    s.run.tech.push('stone-axe');
    expect(productionRates(s).wood).toBeCloseTo(0.625, 6); // ×1.25
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
    expect(research(s, 'stone-axe')).toBe(false); // costs 10 research
  });
});

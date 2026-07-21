import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { doGather } from '../src/engine/systems/actions';
import { build, buildingCost } from '../src/engine/systems/buildings';
import { assignJob, unassignJob, jobCapacity, idleSettlers } from '../src/engine/systems/jobs';
import { research } from '../src/engine/systems/tech';
import { productionRates } from '../src/engine/systems/production';

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
    for (let i = 0; i < 60; i++) doGather(s, 'gather-wood');
    expect(s.run.resources.wood).toBe(50); // clamped to the wood cap
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
  it('assigning a woodcutter produces wood and applies food upkeep', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    build(s, 'woodcutters-lodge'); // opens 2 woodcutter slots
    s.run.population.total = 1;
    expect(assignJob(s, 'woodcutter', 1)).toBe(1);

    const rates = productionRates(s);
    expect(rates.wood).toBeCloseTo(0.5, 6); // 1 worker × 0.5/s
    expect(rates.food).toBeCloseTo(-(0.1 + 0.05), 6); // job upkeep + base settler upkeep

    const woodBefore = s.run.resources.wood;
    const foodBefore = s.run.resources.food;
    simulate(s, 10);
    expect(s.run.resources.wood).toBeGreaterThan(woodBefore);
    expect(s.run.resources.food).toBeLessThan(foodBefore);
  });

  it('cannot assign beyond idle settlers', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    build(s, 'woodcutters-lodge');
    s.run.population.total = 1;
    expect(assignJob(s, 'woodcutter', 5)).toBe(1); // only 1 idle
    expect(idleSettlers(s)).toBe(0);
    expect(assignJob(s, 'woodcutter', 1)).toBe(0); // none left idle
  });

  it('cannot assign beyond building capacity', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    build(s, 'woodcutters-lodge'); // capacity 2
    s.run.population.total = 5;
    expect(assignJob(s, 'woodcutter', 5)).toBe(2); // capped at capacity
    expect(unassignJob(s, 'woodcutter', 1)).toBe(1);
    expect(s.run.population.jobs.woodcutter).toBe(1);
  });
});

describe('tech', () => {
  it('researching a tech spends research and unlocks it', () => {
    const s = newGame(1);
    s.run.resources.research = 10;
    expect(research(s, 'woodworking')).toBe(true); // cost 5
    expect(s.run.tech).toContain('woodworking');
    expect(s.run.resources.research).toBe(5);
  });

  it('woodworking boosts woodcutter output', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    build(s, 'woodcutters-lodge');
    s.run.population.total = 1;
    assignJob(s, 'woodcutter', 1);
    expect(productionRates(s).wood).toBeCloseTo(0.5, 6);
    s.run.tech.push('woodworking');
    expect(productionRates(s).wood).toBeCloseTo(0.75, 6); // ×1.5
  });

  it('gates a tech on its prerequisites', () => {
    const s = newGame(1);
    s.run.resources.research = 100;
    expect(research(s, 'animation')).toBe(false); // needs awakening first
    expect(research(s, 'awakening')).toBe(true);
    expect(research(s, 'animation')).toBe(true);
  });

  it('cannot research without enough research on hand', () => {
    const s = newGame(1);
    s.run.resources.research = 2;
    expect(research(s, 'woodworking')).toBe(false); // costs 5
  });
});

import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { build } from '../src/engine/systems/buildings';
import { assignJob } from '../src/engine/systems/jobs';
import { doGather } from '../src/engine/systems/actions';

describe('population growth', () => {
  it('grows toward popCap under a food surplus', () => {
    const s = newGame(1);
    // Housing for several settlers + a forager workplace, and a food surplus.
    s.run.popCap = 10;
    s.run.resources.wood = 20;
    s.run.buildings.hut = 1; // Hut prereq unlocks the workplace (v0.1: only Hut shows at start)
    build(s, 'forager-hut');
    s.run.resources.food = 40;
    // Seed one settler and set them foraging (net-positive food).
    s.run.population.total = 1;
    assignJob(s, 'forager', 1);

    const before = s.run.population.total;
    simulate(s, 60);
    expect(s.run.population.total).toBeGreaterThan(before);
    expect(s.run.population.total).toBeLessThanOrEqual(s.run.popCap);
  });

  it('the very first settler arrives from the seeded food stock', () => {
    const s = newGame(1);
    s.run.popCap = 2; // build-a-hut equivalent
    // total 0, no jobs → net food 0, stock 20 > 0 → growth allowed.
    simulate(s, 9);
    expect(s.run.population.total).toBe(1);
  });

  it('stalls and then loses settlers under starvation', () => {
    const s = newGame(1);
    s.run.popCap = 5;
    s.run.population.total = 3; // mouths to feed, no foragers
    s.run.resources.food = 0.2; // will run out almost immediately
    simulate(s, 30);
    expect(s.run.flags.starving).toBe(true);
    expect(s.run.resources.food).toBe(0);
    expect(s.run.population.total).toBeLessThan(3); // at least one lost to hunger
  });
});

describe('the magic hook — automating mundane labour', () => {
  it('animated-tools produce wood with NO population and NO food, only mana upkeep', () => {
    const s = newGame(1);
    // Open the magic tier and stock the construct's cost (leaving mana to burn as upkeep).
    s.run.tech.push('awakening', 'animation');
    s.run.resources.wood = 30;
    s.run.resources.mana = 20;
    // No settlers at all — this is pure sorcery.
    expect(s.run.population.total).toBe(0);

    expect(build(s, 'animated-tools')).toBe(true);
    expect(s.run.resources.wood).toBe(0); // spent on the build
    expect(s.run.resources.mana).toBe(10); // spent 10 of 20 on the build

    const foodBefore = s.run.resources.food;
    simulate(s, 10);

    expect(s.run.resources.wood).toBeGreaterThan(0); // wood produced with no woodcutters
    expect(s.run.population.total).toBe(0); // no settlers appeared or were needed
    expect(s.run.resources.food).toBe(foodBefore); // no food consumed at all
    expect(s.run.resources.mana).toBeLessThan(10); // only mana was spent as upkeep
  });

  it('an arcane font produces mana passively', () => {
    const s = newGame(1);
    s.run.tech.push('awakening');
    s.run.resources.stone = 40;
    expect(build(s, 'arcane-font')).toBe(true);
    const before = s.run.resources.mana;
    simulate(s, 10);
    expect(s.run.resources.mana).toBeGreaterThan(before);
  });
});

describe('determinism', () => {
  it('simulate is reproducible for the same inputs', () => {
    const play = () => {
      const s = newGame(123);
      for (let i = 0; i < 20; i++) doGather(s, 'gather-wood');
      s.run.buildings.hut = 1; // Hut prereq unlocks the workplace
      build(s, 'woodcutters-lodge');
      s.run.popCap = 10;
      simulate(s, 120);
      return s;
    };
    const a = play();
    const b = play();
    expect(b.run.resources).toEqual(a.run.resources);
    expect(b.run.population).toEqual(a.run.population);
    expect(b.playtime).toBeCloseTo(a.playtime, 9);
  });
});

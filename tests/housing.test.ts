import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { build } from '../src/engine/systems/buildings';
import { jobCapacity } from '../src/engine/systems/jobs';
import { jobEffectiveProduces } from '../src/engine/systems/production';
import { BUILDING_BY_ID } from '../src/content/buildings';

describe('housing tiers', () => {
  it('the Farm House grants +1 housing AND +1 Farmer slot', () => {
    const s = newGame(1);
    s.run.tech.push('agriculture');
    s.run.resources.wood = 100;
    const popBefore = s.run.popCap;
    expect(build(s, 'farm-house')).toBe(true);
    expect(s.run.popCap).toBe(popBefore + 1);
    expect(jobCapacity(s, 'forager')).toBe(1);
  });

  it('Apartments (+4, Construction) and the Mansion (+5 +3 happiness, Sanitation, costs Furniture)', () => {
    const s = newGame(1);
    s.run.tech.push('construction', 'sanitation');
    s.run.resources.wood = 500;
    s.run.resources.stone = 500;

    const before = s.run.popCap;
    expect(build(s, 'apartments')).toBe(true);
    expect(s.run.popCap).toBe(before + 4);

    // The Mansion needs Furniture — a construction sink for the Factory's good.
    expect(build(s, 'mansion')).toBe(false);
    s.run.resources.furniture = 10;
    expect(build(s, 'mansion')).toBe(true);
    expect(s.run.resources.furniture).toBe(0);
    expect(s.run.popCap).toBe(before + 4 + 5);
    expect(BUILDING_BY_ID.mansion.effects.some((e) => e.kind === 'happiness')).toBe(true);
  });
});

describe('Aqueduct rework — repeatable Farmer infrastructure', () => {
  it('no longer grants housing; each copy adds +10% Farmer output, stacking', () => {
    const s = newGame(1);
    s.run.tech.push('construction');
    s.run.resources.wood = 1000;
    s.run.resources.stone = 1000;

    expect(BUILDING_BY_ID.aqueduct.effects.some((e) => e.kind === 'popCap')).toBe(false);
    const base = jobEffectiveProduces(s, 'forager').food!;
    const popBefore = s.run.popCap;

    expect(build(s, 'aqueduct')).toBe(true);
    expect(s.run.popCap).toBe(popBefore); // no housing from the rework
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(base * 1.1, 6);

    expect(build(s, 'aqueduct')).toBe(true); // second copy stacks linearly
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(base * 1.2, 6);

    // Farmer-only: the Woodcutter is untouched.
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(0.5, 6);
  });
});

import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { build } from '../src/engine/systems/buildings';
import { jobCapacity } from '../src/engine/systems/jobs';
import { jobEffectiveProduces, productionRates } from '../src/engine/systems/production';
import { techView, research } from '../src/engine/systems/tech';
import { BUILDING_BY_ID } from '../src/content/buildings';
import { TECH_BY_ID } from '../src/content/tech';

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
    s.run.tech.push('construction', 'engineering'); // the Aqueduct moved to Engineering
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

describe('the founding workplaces and the early tech openers', () => {
  it('the Farm and the Woodcutter\'s Lodge need NO tech — both buildable from turn one', () => {
    expect(BUILDING_BY_ID['forager-hut'].requiresTech).toBeUndefined();
    expect(BUILDING_BY_ID['forager-hut'].requiresBuilding).toBeUndefined();
    expect(BUILDING_BY_ID['woodcutters-lodge'].requiresTech).toBeUndefined();
    expect(BUILDING_BY_ID['woodcutters-lodge'].requiresBuilding).toBeUndefined();

    // A brand-new settlement can raise both with nothing but gathered wood.
    const s = newGame(1);
    s.run.resources.wood = 100;
    expect(build(s, 'forager-hut')).toBe(true);
    expect(build(s, 'woodcutters-lodge')).toBe(true);
    expect(jobCapacity(s, 'forager')).toBe(1);
    expect(jobCapacity(s, 'woodcutter')).toBe(1);
    // Forestry was retired entirely.
    expect(TECH_BY_ID['forestry' as never]).toBeUndefined();
  });

  it('the stone tools are the openers: Hoe 100, Axe/Pick 150, each 40 stone', () => {
    expect(TECH_BY_ID['stone-hoe'].cost).toBe(100);
    expect(TECH_BY_ID['stone-axe'].cost).toBe(150);
    expect(TECH_BY_ID['stone-pick'].cost).toBe(150);
    for (const id of ['stone-hoe', 'stone-axe', 'stone-pick'] as const) {
      expect(TECH_BY_ID[id].resourceCost?.stone, id).toBe(40);
      expect(TECH_BY_ID[id].requires, id).toBeUndefined();
    }
    const s = newGame(1);
    const available = techView(s).filter((t) => t.available).map((t) => t.id);
    expect(available).toContain('stone-hoe');
    expect(available).not.toContain('agriculture'); // revealed by the Stone Hoe
  });

  it('Agriculture (150) is revealed by the Stone Hoe and carries no output multiplier', () => {
    const s = newGame(1);
    s.run.resources.research = 400;
    s.run.resources.stone = 100;
    expect(research(s, 'agriculture')).toBe(false); // needs the Stone Hoe first
    expect(research(s, 'stone-hoe')).toBe(true); // 100 research + 40 stone
    expect(s.run.resources.stone).toBe(60);

    const withHoe = jobEffectiveProduces(s, 'forager').food!;
    expect(withHoe).toBeCloseTo(0.5 * 1.25, 6); // the Hoe is the Farmer upgrade
    expect(research(s, 'agriculture')).toBe(true); // now revealed, 150 research
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(withHoe, 6); // gateway only
  });

  it('Animal Husbandry costs 100, follows Agriculture, and unlocks the flat-food Ranch', () => {
    expect(TECH_BY_ID['animal-husbandry'].cost).toBe(100);
    expect(TECH_BY_ID['animal-husbandry'].requires).toContain('agriculture');

    const s = newGame(1);
    s.run.resources.wood = 200;
    s.run.resources.stone = 200;
    expect(build(s, 'ranch')).toBe(false); // needs Animal Husbandry
    s.run.tech.push('animal-husbandry');
    expect(build(s, 'ranch')).toBe(true);

    // FLAT food: no settlers, no workers, no inputs.
    expect(s.run.population.total).toBe(0);
    expect(productionRates(s).food).toBeCloseTo(0.4, 6);
    expect(build(s, 'ranch')).toBe(true); // stacks per copy
    expect(productionRates(s).food).toBeCloseTo(0.8, 6);
  });
});

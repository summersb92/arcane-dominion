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

describe('the early-game openers (Agriculture / Forestry) and the Ranch', () => {
  it('Agriculture and Forestry are cheap, prereq-free openers available from turn one', () => {
    expect(TECH_BY_ID.agriculture.cost).toBe(10);
    expect(TECH_BY_ID.forestry.cost).toBe(15);
    expect(TECH_BY_ID.agriculture.requires).toBeUndefined();
    expect(TECH_BY_ID.forestry.requires).toBeUndefined();
    const s = newGame(1);
    const available = techView(s).filter((t) => t.available).map((t) => t.id);
    expect(available).toContain('agriculture');
    expect(available).toContain('forestry');
  });

  it('Agriculture carries NO output multiplier; Stone Hoe (150) is the Farmer upgrade', () => {
    expect(TECH_BY_ID['stone-hoe'].cost).toBe(150);
    const s = newGame(1);
    const base = jobEffectiveProduces(s, 'forager').food!;
    s.run.tech.push('agriculture');
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(base, 6); // enabler only
    s.run.tech.push('stone-hoe');
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(base * 1.25, 6);
  });

  it('Agriculture is affordable from the settler research trickle alone, and opens the Farm', () => {
    const s = newGame(1);
    s.run.resources.research = 10; // exactly the cost
    expect(research(s, 'agriculture')).toBe(true);
    expect(s.run.resources.research).toBe(0);
    s.run.resources.wood = 100;
    expect(build(s, 'forager-hut')).toBe(true); // the basic Farm now exists
  });

  it("Forestry gates the Woodcutter's Lodge (no longer just a House)", () => {
    const s = newGame(1);
    s.run.resources.wood = 100;
    s.run.buildings.hut = 1;
    expect(build(s, 'woodcutters-lodge')).toBe(false); // a House is no longer enough
    s.run.tech.push('forestry');
    expect(build(s, 'woodcutters-lodge')).toBe(true);
    expect(jobCapacity(s, 'woodcutter')).toBe(1);
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

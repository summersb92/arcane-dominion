import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { build, setActive, setRecipeActive } from '../src/engine/systems/buildings';
import { assignJob, jobCapacity } from '../src/engine/systems/jobs';
import { productionRates, resourceBreakdown } from '../src/engine/systems/production';
import { research } from '../src/engine/systems/tech';
import { TECH_BY_ID } from '../src/content/tech';

describe('Coal Mine + Coal Miner (Coal Mining tech)', () => {
  it('the Coal Mine is gated behind Coal Mining and opens a Coal Miner producing coal', () => {
    const s = newGame(1);
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'coal-mine')).toBe(false); // needs Coal Mining
    s.run.tech.push('coal-mining');
    expect(build(s, 'coal-mine')).toBe(true);
    expect(jobCapacity(s, 'coal-miner')).toBe(1);

    s.run.population.total = 1;
    expect(assignJob(s, 'coal-miner', 1)).toBe(1);
    // 1 Coal Miner × 0.4/s + the Mine's passive 0.2/s = 0.6/s coal.
    expect(productionRates(s).coal).toBeCloseTo(0.6, 6);
    expect(TECH_BY_ID['coal-mining'].requires).toContain('mining');
  });
});

describe('Charcoal Ground — a worker-free converter (wood → coal)', () => {
  it('each active ground burns wood into coal; toggling off stops it', () => {
    const s = newGame(1);
    s.run.tech.push('coal-mining');
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'charcoal-ground')).toBe(true); // starts active (1/1)

    // Net rates: −0.5 wood, +0.4 coal per active ground (no settlers involved).
    expect(productionRates(s).coal).toBeCloseTo(0.4, 6);
    expect(productionRates(s).wood).toBeCloseTo(-0.5, 6);

    const wood0 = s.run.resources.wood;
    simulate(s, 10);
    expect(s.run.resources.coal).toBeGreaterThan(0);
    expect(s.run.resources.wood).toBeLessThan(wood0);

    // Toggle it OFF → conversion stops entirely.
    setActive(s, 'charcoal-ground', 0);
    expect(productionRates(s).coal).toBeCloseTo(0, 6);
    expect(productionRates(s).wood).toBeCloseTo(0, 6);
    const coalHeld = s.run.resources.coal;
    simulate(s, 10);
    expect(s.run.resources.coal).toBeCloseTo(coalHeld, 6); // no further coal while off
  });

  it('is INPUT-LIMITED — never drives wood negative when starved', () => {
    const s = newGame(1);
    s.run.buildings['charcoal-ground'] = 1; // active defaults to all-on
    s.run.resources.wood = 0.2; // only enough for a fraction of a second
    s.run.resources.coal = 0;
    simulate(s, 10);
    expect(s.run.resources.wood).toBeGreaterThanOrEqual(0); // clamped at 0, never negative
    expect(s.run.resources.wood).toBeLessThan(0.01);
    // Produced coal is proportional to the wood actually consumed (0.2 wood → 0.16 coal).
    expect(s.run.resources.coal).toBeCloseTo(0.16, 6);
  });

  it('activation is N-of-M — only switched-on copies run', () => {
    const s = newGame(1);
    s.run.tech.push('coal-mining');
    s.run.resources.wood = 300;
    s.run.resources.stone = 100;
    build(s, 'charcoal-ground');
    build(s, 'charcoal-ground');
    build(s, 'charcoal-ground'); // 3 built, all active
    expect(productionRates(s).coal).toBeCloseTo(1.2, 6); // 3 × 0.4

    setActive(s, 'charcoal-ground', 1); // switch two off
    expect(productionRates(s).coal).toBeCloseTo(0.4, 6);
    expect(productionRates(s).wood).toBeCloseTo(-0.5, 6);
  });
});

describe('Steelworks — a worker-backed converter (wood + iron → steel)', () => {
  it('needs a Smelter to run; then converts wood + iron into steel', () => {
    const s = newGame(1);
    s.run.buildings.steelworks = 1; // active defaults to all-on (1/1)
    s.run.resources.wood = 100;
    s.run.resources.iron = 100;

    // A Steelworks opens a Smelter slot but does NOTHING until one is assigned.
    expect(jobCapacity(s, 'smelter')).toBe(1);
    expect(productionRates(s).steel).toBeCloseTo(0, 6); // no smelter yet
    simulate(s, 5);
    expect(s.run.resources.steel).toBe(0);

    // Staff it → the conversion runs.
    s.run.population.total = 1;
    expect(assignJob(s, 'smelter', 1)).toBe(1);
    expect(productionRates(s).steel).toBeCloseTo(0.2, 6);
    expect(productionRates(s).iron).toBeCloseTo(-0.3, 6);

    const before = { wood: s.run.resources.wood, iron: s.run.resources.iron };
    simulate(s, 10);
    expect(s.run.resources.steel).toBeGreaterThan(0);
    expect(s.run.resources.wood).toBeLessThan(before.wood);
    expect(s.run.resources.iron).toBeLessThan(before.iron);

    // Steel and its inputs show up in the resource breakdown.
    const steelBd = resourceBreakdown(s, 'steel');
    expect(steelBd.producers.some((p) => p.label.startsWith('Steelworks'))).toBe(true);
    const ironBd = resourceBreakdown(s, 'iron');
    expect(ironBd.consumers.some((c) => c.label.startsWith('Steelworks'))).toBe(true);
  });

  it('Steelmaking requires Iron Working', () => {
    expect(TECH_BY_ID.steelmaking.requires).toContain('iron-working');
  });
});

describe('Steelworks fuel toggle — Wood vs Coal recipes', () => {
  it('a fresh Steelworks starts on Wood; switching a copy to Coal yields more steel per iron', () => {
    const s = newGame(1);
    s.run.tech.push('steelmaking');
    s.run.resources.wood = 500;
    s.run.resources.stone = 200;
    s.run.resources.iron = 500;
    s.run.resources.coal = 500;
    expect(build(s, 'steelworks')).toBe(true); // starts active on recipe 0 (Wood)
    s.run.population.total = 1;
    assignJob(s, 'smelter', 1);

    // Wood fuel: −0.3 wood, −0.3 iron → +0.2 steel.
    expect(productionRates(s).steel).toBeCloseTo(0.2, 6);
    expect(productionRates(s).wood).toBeCloseTo(-0.3, 6);
    expect(productionRates(s).coal).toBeCloseTo(0, 6);

    // Re-fuel the single copy: 0 on Wood (recipe 0), 1 on Coal (recipe 1).
    setRecipeActive(s, 'steelworks', 0, 0);
    setRecipeActive(s, 'steelworks', 1, 1);
    const r = productionRates(s);
    expect(r.steel).toBeCloseTo(0.3, 6); // more steel...
    expect(r.iron).toBeCloseTo(-0.3, 6); // ...for the SAME iron
    expect(r.coal).toBeCloseTo(-0.3, 6); // burns coal instead of wood
    expect(r.wood).toBeCloseTo(0, 6);
  });

  it('splits active copies across fuels (e.g. 3 wood + 2 coal of 6, 1 off), limited by Smelters', () => {
    const s = newGame(1);
    s.run.buildings.steelworks = 6; // active defaults to [6, 0] (all wood) until toggled
    s.run.resources.wood = 1000;
    s.run.resources.iron = 1000;
    s.run.resources.coal = 1000;
    s.run.population.total = 6;
    assignJob(s, 'smelter', 6); // enough Smelters to back every active copy
    expect(jobCapacity(s, 'smelter')).toBe(6);

    // 3 on wood, 2 on coal, 1 left off.
    setRecipeActive(s, 'steelworks', 0, 3);
    setRecipeActive(s, 'steelworks', 1, 2);
    const r = productionRates(s);
    // steel: 3×0.2 (wood) + 2×0.3 (coal) = 1.2 ; iron: 5×0.3 = 1.5 ; wood 3×0.3=0.9 ; coal 2×0.3=0.6
    expect(r.steel).toBeCloseTo(1.2, 6);
    expect(r.iron).toBeCloseTo(-1.5, 6);
    expect(r.wood).toBeCloseTo(-0.9, 6);
    expect(r.coal).toBeCloseTo(-0.6, 6);
  });

  it('a shared Smelter pool backs recipes in order (basic Wood recipe fills first)', () => {
    const s = newGame(1);
    s.run.buildings.steelworks = 5;
    s.run.resources.wood = 1000;
    s.run.resources.iron = 1000;
    s.run.resources.coal = 1000;
    s.run.population.total = 4; // only 4 Smelters for 5 active copies
    assignJob(s, 'smelter', 4);

    setRecipeActive(s, 'steelworks', 0, 3); // 3 wood
    setRecipeActive(s, 'steelworks', 1, 2); // 2 coal → 5 active, but only 4 workers
    const r = productionRates(s);
    // Workers fill Wood (3) first, leaving 1 for Coal → 3 wood + 1 coal run.
    expect(r.steel).toBeCloseTo(3 * 0.2 + 1 * 0.3, 6);
    expect(r.coal).toBeCloseTo(-0.3, 6); // only 1 coal copy actually runs
  });
});

describe('Steel Tools research (split per tool; a steel sink + top per-job tier)', () => {
  it('Steel Axe costs steel + research and boosts ONLY the Woodcutter, above Iron Working', () => {
    expect(TECH_BY_ID['steel-axe'].resourceCost?.steel).toBe(40);
    expect(TECH_BY_ID['steel-axe'].requires).toContain('steelmaking');
    const s = newGame(1);
    // A working Woodcutter to sample the tool multiplier.
    s.run.buildings.hut = 1;
    s.run.resources.wood = 25;
    build(s, 'woodcutters-lodge');
    s.run.population.total = 1;
    assignJob(s, 'woodcutter', 1);
    s.run.tech.push('iron-working'); // the one global tier
    const beforeTool = productionRates(s).wood; // 0.5 × 1.5

    // Research Steel Axe (needs the prereq + research + 40 steel).
    s.run.tech.push('steelmaking');
    s.run.resources.research = 3500;
    s.run.resources.steel = 40;
    expect(research(s, 'steel-axe')).toBe(true);
    expect(s.run.resources.steel).toBe(0); // steel spent
    expect(s.run.resources.research).toBe(0); // research spent
    expect(productionRates(s).wood).toBeCloseTo(beforeTool * 1.65, 6); // +65% on top
  });
});

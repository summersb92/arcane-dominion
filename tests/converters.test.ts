import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { build, setActive } from '../src/engine/systems/buildings';
import { assignJob, jobCapacity } from '../src/engine/systems/jobs';
import { productionRates, resourceBreakdown } from '../src/engine/systems/production';
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

import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { build } from '../src/engine/systems/buildings';
import { assignJob, jobCapacity } from '../src/engine/systems/jobs';
import { productionRates } from '../src/engine/systems/production';
import { effectiveCap } from '../src/engine/systems/caps';
import { TECH_BY_ID } from '../src/content/tech';

describe('Knowledge chain — furs → parchment → books → compendiums', () => {
  it('the Tannery (Bookbinding) converts furs into parchment, worker-free', () => {
    const s = newGame(1);
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    s.run.resources.furs = 100;
    expect(build(s, 'tannery')).toBe(false); // needs Bookbinding
    s.run.tech.push('bookbinding');
    expect(build(s, 'tannery')).toBe(true); // starts active
    expect(productionRates(s).parchment).toBeCloseTo(0.3, 6);
    expect(productionRates(s).furs).toBeCloseTo(-0.4, 6);
  });

  it('the Scriptorium binds books from parchment + research (needs a Scribe)', () => {
    const s = newGame(1);
    s.run.tech.push('bookbinding');
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'scriptorium')).toBe(true);
    expect(jobCapacity(s, 'scribe')).toBe(1);

    // Idle until staffed.
    expect(productionRates(s).books).toBeCloseTo(0, 6);
    s.run.population.total = 1;
    expect(assignJob(s, 'scribe', 1)).toBe(1);
    expect(productionRates(s).books).toBeCloseTo(0.1, 6);
    expect(productionRates(s).parchment).toBeCloseTo(-0.3, 6);
  });

  it('the Archive (Compendia) compiles compendiums from books + research', () => {
    const s = newGame(1);
    s.run.tech.push('bookbinding', 'compendia');
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    s.run.resources.tools = 100; // Archive costs tools to build
    expect(build(s, 'archive')).toBe(true);
    s.run.population.total = 1;
    expect(assignJob(s, 'scribe', 1)).toBe(1);
    expect(productionRates(s).compendiums).toBeCloseTo(0.05, 6);
    expect(productionRates(s).books).toBeCloseTo(-0.2, 6);
  });
});

describe('Held knowledge goods feed back into the economy', () => {
  it('held BOOKS raise research gained per settler (capped)', () => {
    const s = newGame(1);
    s.run.population.total = 10; // base trickle 10 × 0.1 = 1.0 research/s
    expect(productionRates(s).research).toBeCloseTo(1.0, 6);

    s.run.resources.books = 20; // +0.005 × 20 = +0.1 /settler
    expect(productionRates(s).research).toBeCloseTo(2.0, 6); // (0.1 + 0.1) × 10

    s.run.resources.books = 1000; // bonus caps at +0.25 /settler
    expect(productionRates(s).research).toBeCloseTo(3.5, 6); // (0.1 + 0.25) × 10
  });

  it('held COMPENDIUMS raise the research cap and yield mana per settler (capped)', () => {
    const s = newGame(1);
    expect(effectiveCap(s, 'research')).toBe(300); // base

    s.run.resources.compendiums = 50; // +15 × 50 = +750 cap
    expect(effectiveCap(s, 'research')).toBe(1050);

    s.run.population.total = 10;
    expect(productionRates(s).mana).toBeCloseTo(1.5, 6); // min(0.3, 50×0.003=0.15) × 10

    s.run.resources.compendiums = 1000; // cap bonus maxes at +3000, mana at +0.3/settler
    expect(effectiveCap(s, 'research')).toBe(3300);
    expect(productionRates(s).mana).toBeCloseTo(3.0, 6); // 0.3 × 10
  });
});

describe('Knowledge techs form a chain off Writing', () => {
  it('Bookbinding follows Writing; Compendia follows Bookbinding', () => {
    expect(TECH_BY_ID.bookbinding.requires).toContain('writing');
    expect(TECH_BY_ID.compendia.requires).toContain('bookbinding');
  });
});

import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { build } from '../src/engine/systems/buildings';
import { assignJob } from '../src/engine/systems/jobs';
import { research, canAffordTech } from '../src/engine/systems/tech';
import { productionRates, runProduction } from '../src/engine/systems/production';
import { effectiveCap, researchCap } from '../src/engine/systems/caps';
import { happiness } from '../src/engine/systems/happiness';
import { growthStatus } from '../src/engine/systems/population';

describe('techs can cost materials (resourceCost)', () => {
  it('refuses stone-axe without the stone, with NO mutation', () => {
    const s = newGame(1);
    s.run.resources.research = 100; // plenty of research…
    s.run.resources.stone = 0; // …but no stone
    expect(canAffordTech(s, 'stone-axe')).toBe(false);
    expect(research(s, 'stone-axe')).toBe(false);
    expect(s.run.tech).not.toContain('stone-axe');
    expect(s.run.resources.research).toBe(100); // untouched on refusal
  });

  it('spends BOTH research and the material when affordable', () => {
    const s = newGame(1);
    s.run.resources.research = 50;
    s.run.resources.stone = 50;
    expect(research(s, 'stone-axe')).toBe(true); // 10 research + 10 stone
    expect(s.run.resources.research).toBe(40);
    expect(s.run.resources.stone).toBe(40);
    expect(s.run.tech).toContain('stone-axe');
  });
});

describe('research is capped by science buildings', () => {
  it('base research cap is 50 on a fresh game', () => {
    const s = newGame(1);
    expect(researchCap(s)).toBe(50);
    expect(effectiveCap(s, 'research')).toBe(50);
  });

  it("a Scholar's Study (+50) and a Library (+100) raise the research cap", () => {
    const s = newGame(1);
    // Study prereqs: a Hut then a Farm (forager-hut).
    s.run.buildings.hut = 1;
    s.run.buildings['forager-hut'] = 1;
    s.run.resources.wood = 500;
    s.run.resources.stone = 500;
    expect(build(s, 'scholars-study')).toBe(true);
    expect(researchCap(s)).toBe(100); // 50 base + 50 study

    s.run.tech.push('writing'); // unlocks the Library
    expect(build(s, 'library')).toBe(true);
    expect(researchCap(s)).toBe(200); // + 100 library
  });

  it('research clamps at its effective cap in a tick (excess is lost)', () => {
    const s = newGame(1);
    // No science buildings → cap stays at the base 50. Many settlers trickle research.
    s.run.population.total = 10; // 10 × 0.02 = 0.2 research/s
    s.run.resources.research = 45;
    runProduction(s, 100); // would add 20 → 65, but clamps at 50
    expect(s.run.resources.research).toBe(50);
  });
});

describe('happiness gates growth', () => {
  it('degrades with population and turns unhappy in the tens of settlers', () => {
    const s = newGame(1);
    expect(happiness(s).value).toBe(100); // empty camp is fully content
    expect(happiness(s).status).toBe('content');

    s.run.population.total = 10;
    expect(happiness(s).value).toBe(80); // 100 − 2×10

    s.run.population.total = 30;
    expect(happiness(s).value).toBe(40); // 100 − 60
    expect(happiness(s).status).toBe('unhappy');
  });

  it('a Bard + an Amphitheater raise happiness', () => {
    const s = newGame(1);
    s.run.population.total = 30; // value 40, unhappy
    const before = happiness(s).value;

    // Build the Amphitheater (luxury +10 happiness, +2 Bard slots).
    s.run.tech.push('the-arts');
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'amphitheater')).toBe(true);
    const withLuxury = happiness(s).value;
    expect(withLuxury).toBe(before + 10);

    // Assign a Bard (culture worker) → +4 more.
    expect(assignJob(s, 'bard', 1)).toBe(1);
    expect(happiness(s).value).toBe(withLuxury + 4);
  });

  it('growth pauses below the threshold and resumes once happiness recovers', () => {
    const s = newGame(1);
    // Room + a sustainable food surplus, but too many settlers → unhappy.
    s.run.buildings.hut = 1;
    s.run.resources.wood = 500;
    build(s, 'forager-hut'); // 2 Farmer slots
    build(s, 'forager-hut'); // 4 total
    s.run.popCap = 100;
    s.run.population.total = 26; // crowding 52 → happiness 48 (< 50)
    assignJob(s, 'forager', 3); // 1.5 food/s vs 1.3 upkeep → net positive
    s.run.resources.food = 500;

    expect(happiness(s).status).toBe('unhappy');
    expect(growthStatus(s).status).toBe('unhappy');
    simulate(s, 30);
    expect(s.run.population.total).toBe(26); // no growth while unhappy

    // Build an Amphitheater (+10) → happiness 58, content → growth resumes.
    s.run.tech.push('the-arts');
    s.run.resources.stone = 100;
    expect(build(s, 'amphitheater')).toBe(true);
    expect(happiness(s).status).toBe('content');
    expect(growthStatus(s).status).toBe('growing');
    simulate(s, 30);
    expect(s.run.population.total).toBeGreaterThan(26); // grows once content
  });
});

describe('culture resource', () => {
  it('is uncapped (accumulates without a ceiling)', () => {
    const s = newGame(1);
    expect(effectiveCap(s, 'culture')).toBe(Infinity);
  });

  it('a Bard at the Amphitheater produces culture', () => {
    const s = newGame(1);
    s.run.tech.push('the-arts');
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'amphitheater')).toBe(true);
    s.run.population.total = 1;
    expect(assignJob(s, 'bard', 1)).toBe(1);

    expect(productionRates(s).culture).toBeCloseTo(0.2, 6); // 1 Bard × 0.2/s
    expect(s.run.resources.culture).toBe(0);
    simulate(s, 10);
    expect(s.run.resources.culture).toBeGreaterThan(0); // accrued
  });
});

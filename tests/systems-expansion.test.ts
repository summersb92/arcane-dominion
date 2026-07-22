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
    s.run.resources.research = 400; // plenty of research…
    s.run.resources.stone = 0; // …but no stone
    expect(canAffordTech(s, 'stone-axe')).toBe(false);
    expect(research(s, 'stone-axe')).toBe(false);
    expect(s.run.tech).not.toContain('stone-axe');
    expect(s.run.resources.research).toBe(400); // untouched on refusal
  });

  it('spends BOTH research and the material when affordable', () => {
    const s = newGame(1);
    s.run.resources.research = 350;
    s.run.resources.stone = 50;
    expect(research(s, 'stone-axe')).toBe(true); // 300 research + 10 stone
    expect(s.run.resources.research).toBe(50);
    expect(s.run.resources.stone).toBe(40);
    expect(s.run.tech).toContain('stone-axe');
  });
});

describe('research is capped by science buildings', () => {
  it('base research cap is 300 on a fresh game', () => {
    const s = newGame(1);
    expect(researchCap(s)).toBe(300);
    expect(effectiveCap(s, 'research')).toBe(300);
  });

  it('the Library (+100) and Academy (+600) raise the research cap', () => {
    const s = newGame(1);
    expect(researchCap(s)).toBe(300); // base
    s.run.tech.push('writing'); // unlocks the Library + Academy
    s.run.resources.wood = 500;
    s.run.resources.stone = 500;
    expect(build(s, 'library')).toBe(true);
    expect(researchCap(s)).toBe(400); // 300 base + 100 library
    expect(build(s, 'academy')).toBe(true);
    expect(researchCap(s)).toBe(1000); // + 600 academy
    // A Scholar can be assigned to the Library.
    s.run.population.total = 1;
    expect(assignJob(s, 'scholar', 1)).toBe(1);
  });

  it('research clamps at its effective cap in a tick (excess is lost)', () => {
    const s = newGame(1);
    // No science buildings → cap stays at the base 300. Many settlers trickle research.
    s.run.population.total = 10; // 10 × 0.1 = 1 research/s
    s.run.resources.research = 250;
    runProduction(s, 100); // would add 100 → 350, but clamps at 300
    expect(s.run.resources.research).toBe(300);
  });
});

describe('happiness gates growth', () => {
  it('degrades with population and turns unhappy in the tens of settlers', () => {
    const s = newGame(1);
    expect(happiness(s).value).toBe(100); // empty camp is fully content
    expect(happiness(s).status).toBe('content');

    s.run.population.total = 10;
    expect(happiness(s).value).toBe(92); // 100 − 2×(10−6 buffer)

    s.run.population.total = 40;
    expect(happiness(s).value).toBe(32); // 100 − 2×(40−6)
    expect(happiness(s).status).toBe('unhappy');
  });

  it('a Bard + an Amphitheater raise happiness', () => {
    const s = newGame(1);
    s.run.population.total = 30; // value 52 with the 6-pop buffer (100 − 2×24)
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
    s.run.tech.push('agriculture'); // the Farm is gated behind Agriculture
    s.run.resources.wood = 500;
    build(s, 'forager-hut'); // 1 Farmer slot
    build(s, 'forager-hut'); // 2
    build(s, 'forager-hut'); // 3 slots (one job per building)
    s.run.popCap = 100;
    s.run.population.total = 32; // crowding 2×(32−6) = 52 → happiness 48 (< 50)
    assignJob(s, 'forager', 3); // 3 farmers (agri ×1.5) + idle trickle > upkeep → net positive
    s.run.resources.food = 500;

    expect(happiness(s).status).toBe('unhappy');
    expect(growthStatus(s).status).toBe('unhappy');
    simulate(s, 30);
    expect(s.run.population.total).toBe(32); // no growth while unhappy

    // Build an Amphitheater (+10) → happiness 58, content → growth resumes.
    s.run.tech.push('the-arts');
    s.run.resources.stone = 100;
    expect(build(s, 'amphitheater')).toBe(true);
    expect(happiness(s).status).toBe('content');
    expect(growthStatus(s).status).toBe('growing');
    simulate(s, 30);
    expect(s.run.population.total).toBeGreaterThan(32); // grows once content
  });
});

describe('furs luxury resource + Hunter', () => {
  it('a Hunter at the Hunter\'s Lodge produces both food and furs', () => {
    const s = newGame(1);
    s.run.tech.push('archery'); // the Lodge is now gated behind Archery
    s.run.resources.wood = 100;
    expect(build(s, 'hunters-lodge')).toBe(true);
    s.run.population.total = 1;
    expect(assignJob(s, 'hunter', 1)).toBe(1);
    const r = productionRates(s);
    expect(r.food).toBeCloseTo(0.3 - 0.05, 6); // +0.3 hunter food − 0.05 settler upkeep
    expect(r.furs).toBeCloseTo(0.15, 6); // +0.15 furs
  });

  it('furs are capped at 200 base, raised by Storehouses, and clamped in a tick', () => {
    const s = newGame(1);
    expect(effectiveCap(s, 'furs')).toBe(200);

    // A Storehouse's `cap` effect (+50 each) raises the furs cap too.
    s.run.buildings.hut = 1;
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'storehouse')).toBe(true);
    expect(effectiveCap(s, 'furs')).toBe(250);

    // Producing past the cap clamps (excess lost). The Lodge adds +20 cap, so read it live.
    s.run.tech.push('archery'); // Lodge gated behind Archery
    s.run.resources.wood = 100;
    build(s, 'hunters-lodge');
    s.run.population.total = 1;
    assignJob(s, 'hunter', 1);
    const cap = effectiveCap(s, 'furs');
    s.run.resources.furs = cap - 1;
    runProduction(s, 1000);
    expect(s.run.resources.furs).toBe(cap);
  });

  it('held furs raise happiness (+1 per 10, capped at +15) and show in the breakdown', () => {
    const s = newGame(1);
    s.run.population.total = 20; // crowding 2×(20−6) = 28 → happiness 72
    expect(happiness(s).value).toBe(72);

    s.run.resources.furs = 50; // 50 / 10 = +5
    expect(happiness(s).value).toBe(77);
    expect(happiness(s).breakdown.some((b) => b.label.startsWith('Furs'))).toBe(true);

    s.run.resources.furs = 1000; // would be +100 but the bonus caps at +15
    expect(happiness(s).value).toBe(87); // 72 + 15
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

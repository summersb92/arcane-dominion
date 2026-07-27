import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { build } from '../src/engine/systems/buildings';
import { assignJob } from '../src/engine/systems/jobs';
import { research, canAffordTech } from '../src/engine/systems/tech';
import { productionRates, runProduction, jobEffectiveProduces } from '../src/engine/systems/production';
import { effectiveCap, researchCap } from '../src/engine/systems/caps';
import { happiness } from '../src/engine/systems/happiness';
import { growthStatus } from '../src/engine/systems/population';
import { TECH_BY_ID } from '../src/content/tech';

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
    s.run.resources.research = 200;
    s.run.resources.stone = 50;
    expect(research(s, 'stone-axe')).toBe(true); // 150 research + 40 stone
    expect(s.run.resources.research).toBe(50);
    expect(s.run.resources.stone).toBe(10);
    expect(s.run.tech).toContain('stone-axe');
  });
});

describe('research is capped by science buildings', () => {
  it('base research cap is 300 on a fresh game', () => {
    const s = newGame(1);
    expect(researchCap(s)).toBe(300);
    expect(effectiveCap(s, 'research')).toBe(300);
  });

  it('the Library (+50) and Academy (+600) raise the research cap', () => {
    const s = newGame(1);
    expect(researchCap(s)).toBe(300); // base
    s.run.tech.push('writing'); // unlocks the Library
    s.run.resources.wood = 500;
    s.run.resources.stone = 500;
    expect(build(s, 'library')).toBe(true);
    expect(researchCap(s)).toBe(350); // 300 base + 50 library
    expect(build(s, 'academy')).toBe(false); // the Academy needs Mathematics now
    s.run.tech.push('mathematics');
    expect(build(s, 'academy')).toBe(true);
    expect(researchCap(s)).toBe(950); // + 600 academy
    // A Scholar can be assigned to the Library.
    s.run.population.total = 1;
    expect(assignJob(s, 'scholar', 1)).toBe(1);
  });

  it('the Decimal System DOUBLES every Library, and leaves the Academy alone', () => {
    const s = newGame(1);
    s.run.tech.push('writing');
    s.run.resources.wood = 2000;
    s.run.resources.stone = 2000;
    expect(build(s, 'library')).toBe(true);
    expect(build(s, 'library')).toBe(true);
    expect(build(s, 'library')).toBe(true);
    expect(researchCap(s)).toBe(450); // 300 + 3 × 50

    s.run.tech.push('decimal-system');
    expect(researchCap(s)).toBe(600); // 300 + 3 × 100 — the gated half switched on

    // The Academy's +600 is NOT doubled; only Libraries scale with the Decimal System.
    s.run.tech.push('mathematics');
    expect(build(s, 'academy')).toBe(true);
    expect(researchCap(s)).toBe(1200); // 600 + 600, not 600 + 1200
  });

  it('the Decimal System sits behind Mathematics and costs 1000', () => {
    expect(TECH_BY_ID['decimal-system'].cost).toBe(1000);
    expect(TECH_BY_ID['decimal-system'].requires).toContain('mathematics');
  });

  it('research clamps at its effective cap in a tick (excess is lost)', () => {
    const s = newGame(1);
    // No science buildings → cap stays at the base 300. Many settlers trickle research.
    s.run.population.total = 50; // 50 × 0.02 = 1 research/s
    s.run.resources.research = 250;
    runProduction(s, 100); // would add 100 → 350, but clamps at 300
    expect(s.run.resources.research).toBe(300);
  });
});

describe('contentment is the master production modifier', () => {
  it('caps at 100 happiness → exactly ×1.00, and scales output down below that', () => {
    const s = newGame(1);
    s.run.buildings.hut = 20;
    s.run.popCap = 20;
    // 5 settlers: inside the free buffer, so happiness is a full 100 → no penalty at all.
    s.run.population.total = 5;
    s.run.buildings['woodcutters-lodge'] = 5;
    assignJob(s, 'woodcutter', 5);
    const FIVE_LODGES = 0.5 * 1.1; // 5 Lodges × their own +2%
    expect(happiness(s).value).toBe(100);
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(FIVE_LODGES, 6);

    // Piling on luxuries can't push happiness past 100, so output never exceeds ×1.00.
    s.run.resources.furs = 1000;
    expect(happiness(s).value).toBe(100);
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(FIVE_LODGES, 6);
  });

  it('each settler past 5 costs 2 happiness, and that shows up in output', () => {
    const s = newGame(1);
    s.run.buildings.hut = 30;
    s.run.popCap = 30;
    s.run.buildings['woodcutters-lodge'] = 30;
    s.run.population.total = 30; // 25 past the buffer → −50 → happiness 50
    assignJob(s, 'woodcutter', 1);
    expect(happiness(s).value).toBe(50);
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(0.5 * 1.6 * 0.5, 6); // 30 Lodges: +60%
  });
});

describe('happiness gates growth', () => {
  it('degrades with population and turns unhappy in the tens of settlers', () => {
    const s = newGame(1);
    expect(happiness(s).value).toBe(100); // empty camp is fully content
    expect(happiness(s).status).toBe('content');

    s.run.population.total = 10;
    expect(happiness(s).value).toBe(90); // 100 − 2×(10−5 buffer)

    s.run.population.total = 40;
    expect(happiness(s).value).toBe(30); // 100 − 2×(40−5)
    expect(happiness(s).status).toBe('unhappy');
  });

  it('a Bard + an Amphitheater raise happiness', () => {
    const s = newGame(1);
    s.run.population.total = 30; // value 50 with the 5-pop buffer (100 − 2×25)
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
    // Room + a sustainable food surplus, but too many settlers → unhappy. At 4 food upkeep
    // per settler an unhappy settlement only stays fed if EVERYONE farms with the full tool
    // chain — otherwise it starves and growthStatus reports 'stalled' instead of 'unhappy'.
    s.run.buildings.hut = 1;
    s.run.tech.push('agriculture', 'stone-hoe', 'irrigation', 'fertilizer');
    s.run.buildings['forager-hut'] = 31; // a Farm slot for every settler
    s.run.popCap = 100;
    s.run.population.total = 31; // crowding 2×(31−5) = 52 → happiness 48 (< 50)
    assignJob(s, 'forager', 31); // 31 × 6 × 2.34 tools × 0.48 contentment ≈ 209/s vs 124 upkeep
    s.run.resources.food = 500;

    expect(happiness(s).status).toBe('unhappy');
    expect(growthStatus(s).status).toBe('unhappy');
    simulate(s, 30);
    expect(s.run.population.total).toBe(31); // no growth while unhappy

    // Build an Amphitheater (+10) → happiness 58, content → growth resumes.
    s.run.tech.push('the-arts');
    s.run.resources.wood = 200;
    s.run.resources.stone = 200;
    expect(build(s, 'amphitheater')).toBe(true);
    expect(happiness(s).status).toBe('content');
    expect(growthStatus(s).status).toBe('growing');
    simulate(s, 30);
    expect(s.run.population.total).toBeGreaterThan(31); // grows once content
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
    expect(r.food).toBeCloseTo(0.3 - 4, 6); // +0.3 hunter food − 4 settler upkeep
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
    s.run.population.total = 20; // crowding 2×(20−5) = 30 → happiness 70
    expect(happiness(s).value).toBe(70);

    s.run.resources.furs = 50; // 50 / 10 = +5
    expect(happiness(s).value).toBe(75);
    expect(happiness(s).breakdown.some((b) => b.label.startsWith('Furs'))).toBe(true);

    s.run.resources.furs = 1000; // would be +100 but the bonus caps at +15
    expect(happiness(s).value).toBe(85); // 70 + 15
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

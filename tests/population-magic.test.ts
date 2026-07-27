import { describe, it, expect } from 'vitest';
import { reveal } from './helpers';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { build } from '../src/engine/systems/buildings';
import { assignJob } from '../src/engine/systems/jobs';
import { doGather } from '../src/engine/systems/actions';
import { resourceBreakdown, runProduction } from '../src/engine/systems/production';
import { effectiveCap } from '../src/engine/systems/caps';
import { BUILDING_IDS, BUILDING_BY_ID } from '../src/content/buildings';
import { CALENDAR } from '../src/content/config';

describe('population growth', () => {
  it('grows toward popCap under a food surplus', () => {
    const s = newGame(1);
    // Housing for several citizens + a forager workplace, and a food surplus.
    s.run.popCap = 10;
    s.run.resources.wood = 20;
    reveal(s, 'forager-hut'); // the opening chain: a House reveals the Farm
    s.run.tech.push('agriculture'); // the Farm is gated behind Agriculture
    build(s, 'forager-hut');
    s.run.resources.food = 40;
    // Seed one citizen and set them foraging (net-positive food).
    s.run.population.total = 1;
    assignJob(s, 'forager', 1);

    const before = s.run.population.total;
    simulate(s, 60);
    expect(s.run.population.total).toBeGreaterThan(before);
    expect(s.run.population.total).toBeLessThanOrEqual(s.run.popCap);
  });

  it('the very first citizen arrives from the seeded food stock', () => {
    const s = newGame(1);
    s.run.popCap = 2; // build-a-hut equivalent
    // total 0, no jobs → net food 0, stock 20 > 0 → growth allowed.
    simulate(s, 9);
    expect(s.run.population.total).toBe(1);
  });

  it('stalls and then loses citizens under starvation', () => {
    const s = newGame(1);
    s.run.popCap = 5;
    s.run.resources.wood = 200;
    reveal(s, 'woodcutters-lodge');
    build(s, 'woodcutters-lodge');
    build(s, 'woodcutters-lodge');
    build(s, 'woodcutters-lodge');
    s.run.population.total = 3;
    assignJob(s, 'woodcutter', 3); // everyone EMPLOYED — nobody is idle-foraging
    s.run.resources.food = 0.2; // will run out almost immediately
    simulate(s, 30);
    expect(s.run.flags.starving).toBe(true);
    expect(s.run.resources.food).toBe(0);
    expect(s.run.population.total).toBeLessThan(3); // at least one lost to hunger
  });
});

describe('the magic hook — buying out of a constraint', () => {
  /** A discovered settlement with a staffed Font, which is now the only mana source. */
  function withFont(mages = 1) {
    const s = newGame(1);
    s.run.flags.magicDiscovered = true;
    s.run.resources.stone = 1000;
    s.run.resources.wood = 1000;
    s.run.buildings.hut = 20;
    s.run.popCap = 20;
    s.run.population.total = 10; // mana is carried in people — with nobody home it cannot pool
    s.run.resources.food = 5000;
    // The Alembic's own gates, so a test about its TRADE isn't really a test about unlocking.
    s.run.tech.push('alchemy');
    s.run.resources.alchemical = 500;
    expect(build(s, 'arcane-font')).toBe(true);
    if (mages > 0) expect(assignJob(s, 'mage', mages)).toBe(mages);
    return s;
  }

  it('an UNSTAFFED Font draws nothing — the pool answers only while asked', () => {
    const s = withFont(0);
    const before = s.run.resources.mana;
    simulate(s, 20);
    expect(s.run.resources.mana).toBe(before);
  });

  it('a Mage at the Font draws the mana, and the Font is what opens the post', () => {
    const s = withFont(1);
    const before = s.run.resources.mana;
    simulate(s, 10);
    expect(s.run.resources.mana).toBeGreaterThan(before);
    expect(resourceBreakdown(s, 'mana').producers.some((pr) => pr.label.startsWith('Mage'))).toBe(true);
  });

  it('the Enchanted Grove trades mana for food', () => {
    const s = withFont(1);
    expect(build(s, 'enchanted-grove')).toBe(true);
    s.run.resources.mana = 20;
    const bd = resourceBreakdown(s, 'food');
    expect(bd.producers.some((pr) => pr.label.startsWith('Enchanted Grove'))).toBe(true);
    expect(bd.consumers.length).toBeGreaterThan(0); // citizens still eat
    // The mana side shows up as a cost of the trade.
    expect(resourceBreakdown(s, 'mana').consumers.some((c) => c.label.startsWith('Enchanted Grove'))).toBe(true);
  });

  it("the Grove's yield is the SAME in winter as in spring — that is the point", () => {
    const yieldIn = (season: number): number => {
      const s = withFont(1);
      expect(build(s, 'enchanted-grove')).toBe(true);
      s.playtime = season * CALENDAR.daysPerSeason * CALENDAR.daySeconds + 10;
      s.run.resources.mana = 100;
      const line = resourceBreakdown(s, 'food').producers.find((pr) => pr.label.startsWith('Enchanted Grove'))!;
      return line.amount;
    };
    const spring = yieldIn(0);
    const winter = yieldIn(3);
    expect(winter).toBeCloseTo(spring, 9);
    expect(winter).toBeGreaterThan(0);
  });

  it('the wood, stone and research works all wait on a standing Font', () => {
    for (const id of ['quickwood-stand', 'stone-garden', 'alembic'] as const) {
      const s = newGame(1);
      s.run.flags.magicDiscovered = true;
      s.run.tech.push('alchemy'); // the Alembic's extra gate; harmless to the other two
      s.run.resources.wood = 1000;
      s.run.resources.stone = 1000;
      expect(build(s, id), `${id} without a Font`).toBe(false);
      s.run.buildings['arcane-font'] = 1;
      expect(build(s, id), `${id} with a Font`).toBe(true);
    }
  });

  it('the Alembic ALSO waits on Alchemy — it is the one thing that spends components', () => {
    const s = newGame(1);
    s.run.flags.magicDiscovered = true;
    s.run.buildings['arcane-font'] = 1;
    s.run.resources.wood = 1000;
    s.run.resources.stone = 1000;
    expect(build(s, 'alembic')).toBe(false); // magic and a Font are not enough
    s.run.tech.push('alchemy');
    expect(build(s, 'alembic')).toBe(true);
  });

  it('the Alembic draws down Alchemical Components — their first and only sink', () => {
    const s = withFont(1);
    expect(build(s, 'alembic')).toBe(true);
    s.run.resources.mana = 1000;
    expect(resourceBreakdown(s, 'alchemical').consumers.some((c) => c.label.startsWith('Alembic'))).toBe(true);

    const before = s.run.resources.alchemical;
    runProduction(s, 20);
    expect(s.run.resources.alchemical).toBeLessThan(before);
  });

  it('an Alembic with no components left stands itself down', () => {
    const s = withFont(1);
    expect(build(s, 'alembic')).toBe(true);
    s.run.resources.mana = 1000;
    s.run.resources.alchemical = 0; // the jars run dry
    runProduction(s, 1);
    expect(s.run.active.alembic?.[0] ?? 0).toBe(0);
  });

  it('each spends mana for the yield of the trade it echoes', () => {
    const cases = [
      { id: 'quickwood-stand', res: 'wood' },
      { id: 'stone-garden', res: 'stone' },
      { id: 'alembic', res: 'research' },
    ] as const;
    for (const { id, res } of cases) {
      const s = withFont(1);
      expect(build(s, id)).toBe(true);
      s.run.resources.mana = 100;
      const out = resourceBreakdown(s, res).producers.find((p) => p.label.startsWith(BUILDING_BY_ID[id].name));
      expect(out, `${id} produces ${res}`).toBeDefined();
      expect(out!.amount).toBeGreaterThan(0);
      const manaCost = resourceBreakdown(s, 'mana').consumers.find((c) => c.label.startsWith(BUILDING_BY_ID[id].name));
      expect(manaCost, `${id} costs mana`).toBeDefined();
    }
  });

  it('the Alembic eats FOOD as well as mana — insight is not conjured from nothing', () => {
    const s = withFont(1);
    expect(build(s, 'alembic')).toBe(true);
    s.run.resources.mana = 100;
    const foodCost = resourceBreakdown(s, 'food').consumers.find((c) => c.label.startsWith('Alembic'));
    expect(foodCost).toBeDefined();
    expect(foodCost!.amount).toBeLessThan(0);
    // …and it is the ONLY construct that does.
    const grove = withFont(1);
    expect(build(grove, 'enchanted-grove')).toBe(true);
    expect(resourceBreakdown(grove, 'food').consumers.some((c) => c.label.startsWith('Enchanted Grove'))).toBe(false);
  });

  it('Alembic research still obeys the research ceiling', () => {
    const s = withFont(1);
    expect(build(s, 'alembic')).toBe(true);
    s.run.resources.mana = 1e6;
    s.run.resources.research = effectiveCap(s, 'research');
    runProduction(s, 100);
    expect(s.run.resources.research).toBe(effectiveCap(s, 'research'));
  });

  it('with no citizens and no works, there is nowhere to keep mana at all', () => {
    const s = newGame(1);
    s.run.flags.magicDiscovered = true;
    expect(s.run.population.total).toBe(0);
    expect(effectiveCap(s, 'mana')).toBe(0);
    s.run.resources.mana = 50; // handed some anyway
    runProduction(s, 1);
    expect(s.run.resources.mana).toBe(0); // it runs straight through their fingers
  });

  it('a Font still DEEPENS the pool even before anyone staffs it', () => {
    const s = newGame(1);
    s.run.flags.magicDiscovered = true;
    s.run.resources.stone = 1000;
    expect(build(s, 'arcane-font')).toBe(true);
    expect(s.run.population.total).toBe(0);
    expect(effectiveCap(s, 'mana')).toBe(25); // the Font's own basin, unpeopled
  });

  it('Animated Tools are gone for now', () => {
    expect(BUILDING_IDS).not.toContain('animated-tools' as never);
  });
});

describe('determinism', () => {
  it('simulate is reproducible for the same inputs', () => {
    const play = () => {
      const s = newGame(123);
      for (let i = 0; i < 20; i++) doGather(s, 'gather-wood');
      reveal(s, 'woodcutters-lodge'); // the opening chain: House → Farm → Lodge
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

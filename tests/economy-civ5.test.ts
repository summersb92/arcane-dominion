import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { build, buildingCost, buildingsView } from '../src/engine/systems/buildings';
import { productionRates } from '../src/engine/systems/production';
import { research } from '../src/engine/systems/tech';
import { buy, canBuy, tradeView } from '../src/engine/systems/trade';
import { effectiveCap } from '../src/engine/systems/caps';
import { safeLoad, SAVE_MAGIC } from '../src/engine/save';
import { TECH_BY_ID } from '../src/content/tech';
import { BUILDING_BY_ID } from '../src/content/buildings';

describe('House: 10 wood, +1 population', () => {
  it('costs 10 and admits one settler', () => {
    const s = newGame(1);
    expect(buildingCost(s, 'hut')).toEqual({ wood: 10 });
    s.run.resources.wood = 10;
    expect(build(s, 'hut')).toBe(true);
    expect(s.run.resources.wood).toBe(0);
    expect(s.run.popCap).toBe(1);
  });
});

describe('cost escalation is legible (the "43 wood / 20-wood Farm" confusion)', () => {
  it('repeatable workplaces now grow gently (1.15), not steeply (1.30)', () => {
    // The old 1.3 curve made the 4th Farm cost 44 — more than double the first — which read
    // as a bug. 1.15 keeps a farm belt affordable while still curving.
    for (const id of ['forager-hut', 'woodcutters-lodge', 'quarry', 'mine', 'harbor'] as const) {
      expect(BUILDING_BY_ID[id].costGrowth, id).toBe(1.15);
    }
    const s = newGame(1);
    s.run.resources.wood = 100_000;
    const ladder: number[] = [];
    for (let i = 0; i < 4; i++) {
      ladder.push(buildingCost(s, 'forager-hut').wood as number);
      build(s, 'forager-hut');
    }
    expect(ladder).toEqual([20, 23, 27, 31]); // was [20, 26, 34, 44]
    // 43 wood — the exact amount from the report — now buys the 4th Farm.
    const t = newGame(1);
    t.run.buildings['forager-hut'] = 3;
    t.run.resources.wood = 43;
    expect(buildingsView(t).find((r) => r.id === 'forager-hut')!.affordable).toBe(true);
  });
});

describe('Gold + the market (Civ 5 Currency line)', () => {
  it('gold is an uncapped treasury that starts empty', () => {
    const s = newGame(1);
    expect(s.run.resources.gold).toBe(0);
    expect(effectiveCap(s, 'gold')).toBe(Infinity);
  });

  it('the Market (Currency) and Bank (Banking) earn gold', () => {
    const s = newGame(1);
    s.run.resources.wood = 500;
    s.run.resources.stone = 500;
    expect(build(s, 'market')).toBe(false); // needs Currency
    s.run.tech.push('currency');
    expect(build(s, 'market')).toBe(true);
    expect(productionRates(s).gold).toBeCloseTo(0.3, 6);

    s.run.tech.push('banking');
    s.run.resources.iron = 200;
    s.run.resources.gold = 300; // the Bank itself costs gold
    expect(build(s, 'bank')).toBe(true);
    expect(productionRates(s).gold).toBeCloseTo(0.3 + 0.8, 6);
  });

  it('the market sells goods for gold, gated by Currency then Banking', () => {
    const s = newGame(1);
    expect(tradeView(s)).toHaveLength(0); // no market before Currency
    expect(canBuy(s, 'buy-wood')).toBe(false);

    s.run.tech.push('currency');
    const stalls = tradeView(s).map((p) => p.id);
    expect(stalls).toContain('buy-wood');
    expect(stalls).not.toContain('buy-steel'); // ore and metal need Banking

    expect(buy(s, 'buy-wood')).toBe(false); // empty treasury
    s.run.resources.gold = 10;
    expect(buy(s, 'buy-wood')).toBe(true);
    expect(s.run.resources.gold).toBe(0);
    expect(s.run.resources.wood).toBe(25);

    s.run.tech.push('banking');
    expect(tradeView(s).map((p) => p.id)).toContain('buy-steel');
  });

  it('a purchase is clamped to the storage cap (coin spent, surplus lost)', () => {
    const s = newGame(1);
    s.run.tech.push('currency');
    s.run.resources.gold = 10;
    s.run.resources.wood = 495; // cap is 500; buying 25 overflows
    expect(buy(s, 'buy-wood')).toBe(true);
    expect(s.run.resources.wood).toBe(500);
    expect(s.run.resources.gold).toBe(0);
  });
});

describe('Civ 5 naval line: Sailing → Harbour → Navigation → Seaport', () => {
  it('the Harbour mixes food, gold and storage', () => {
    const s = newGame(1);
    s.run.resources.wood = 300;
    s.run.resources.stone = 300;
    expect(build(s, 'harbor')).toBe(false); // needs Sailing
    s.run.tech.push('sailing');
    const capBefore = s.run.caps.wood;
    expect(build(s, 'harbor')).toBe(true);
    const r = productionRates(s);
    expect(r.food).toBeCloseTo(0.3, 6);
    expect(r.gold).toBeCloseTo(0.15, 6);
    expect(s.run.caps.wood).toBe(capBefore + 40); // and storage
    expect(TECH_BY_ID.sailing.requires).toContain('pottery');
  });

  it('the Seaport needs Navigation AND a standing Harbour', () => {
    const s = newGame(1);
    s.run.tech.push('sailing', 'navigation');
    s.run.resources.wood = 600;
    s.run.resources.stone = 600;
    s.run.resources.tools = 100;
    expect(build(s, 'seaport')).toBe(false); // no Harbour yet
    expect(build(s, 'harbor')).toBe(true);
    expect(build(s, 'seaport')).toBe(true);
    expect(productionRates(s).gold).toBeCloseTo(0.15 + 0.5, 6);
    expect(TECH_BY_ID.navigation.requires).toEqual(expect.arrayContaining(['sailing', 'mathematics']));
  });
});

describe('Civ 5 combination techs', () => {
  it('each needs BOTH prerequisites, as in Civ 5', () => {
    expect(TECH_BY_ID.engineering.requires).toEqual(expect.arrayContaining(['mathematics', 'construction']));
    expect(TECH_BY_ID.theology.requires).toEqual(expect.arrayContaining(['calendar', 'philosophy']));
    expect(TECH_BY_ID['printing-press'].requires).toEqual(expect.arrayContaining(['bookbinding', 'the-wheel']));
    expect(TECH_BY_ID.banking.requires).toEqual(expect.arrayContaining(['currency', 'philosophy']));
    expect(TECH_BY_ID['metal-casting'].requires).toContain('iron-working');
  });

  it('Engineering now gates the Aqueduct (Civ 5 puts it there, not on Construction)', () => {
    expect(BUILDING_BY_ID.aqueduct.requiresTech).toBe('engineering');
    const s = newGame(1);
    s.run.resources.wood = 300;
    s.run.resources.stone = 300;
    s.run.tech.push('construction');
    expect(build(s, 'aqueduct')).toBe(false); // Construction alone is no longer enough
    s.run.tech.push('engineering');
    expect(build(s, 'aqueduct')).toBe(true);
  });

  it('Metal Casting opens the Ironworks; Theology the Monastery; Printing Press the Theatre', () => {
    const s = newGame(1);
    for (const cap of Object.keys(s.run.caps) as (keyof typeof s.run.caps)[]) s.run.caps[cap] = 5000;
    s.run.resources.wood = 2000;
    s.run.resources.stone = 2000;
    s.run.resources.iron = 2000;
    s.run.resources.parchment = 200;
    s.run.tech.push('metal-casting', 'theology', 'printing-press');

    expect(build(s, 'ironworks')).toBe(true);
    expect(BUILDING_BY_ID.ironworks.effects.some((e) => e.kind === 'jobOutputMult')).toBe(true);
    expect(build(s, 'monastery')).toBe(true);
    expect(build(s, 'theatre')).toBe(true);
    // The Theatre earns culture AND a little gold, and lifts spirits.
    const r = productionRates(s);
    expect(r.culture).toBeGreaterThan(0.7);
    expect(r.gold).toBeCloseTo(0.2, 6);
  });

  it('Banking costs gold as well as research', () => {
    expect(TECH_BY_ID.banking.resourceCost?.gold).toBe(200);
    const s = newGame(1);
    s.run.tech.push('currency', 'philosophy');
    s.run.resources.research = 3000;
    expect(research(s, 'banking')).toBe(false); // empty treasury
    s.run.resources.gold = 200;
    expect(research(s, 'banking')).toBe(true);
    expect(s.run.resources.gold).toBe(0);
  });
});

describe('save migration v12 → v13', () => {
  it('backfills the gold treasury to 0', () => {
    const v12: any = {
      magic: SAVE_MAGIC,
      version: 12,
      state: {
        version: 12,
        seed: 1,
        rngState: 1,
        run: {
          resources: { wood: 5, food: 20, stone: 0, mana: 0, research: 0, culture: 3 },
          caps: { wood: 200, food: 200, stone: 200 },
          population: { total: 0, jobs: {} },
          popCap: 0,
          buildings: {},
          active: {},
          tech: [],
          policies: [],
          curriculum: null,
          growthProgress: 0,
          flags: {},
          chronicle: [],
        },
        settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
        playtime: 0,
        lastSaved: Date.now(),
      },
    };
    const res = safeLoad(JSON.stringify(v12));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(12);
    expect(res.state!.version).toBe(13);
    expect(res.state!.run.resources.gold).toBe(0);
  });
});

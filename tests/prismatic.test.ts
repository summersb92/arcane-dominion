import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { build, buildingsView } from '../src/engine/systems/buildings';
import { jobEffectiveProduces, productionRates } from '../src/engine/systems/production';
import { effectiveCap } from '../src/engine/systems/caps';
import { research } from '../src/engine/systems/tech';
import { safeLoad, SAVE_MAGIC } from '../src/engine/save';
import { TECH_BY_ID } from '../src/content/tech';
import { BUILDING_BY_ID } from '../src/content/buildings';

/** Grant everything a prismatic run needs, minus the specific discipline under test.
 *  Caps are raised alongside the stock so a `simulate()` clamp can't quietly empty the
 *  treasury mid-test. */
function primed(seed = 1) {
  const s = newGame(seed);
  s.run.flags.magicDiscovered = true;
  s.run.tech.push('prismatic-theory');
  for (const id of Object.keys(s.run.caps) as (keyof typeof s.run.caps)[]) s.run.caps[id] = 5000;
  s.run.resources.wood = 2000;
  s.run.resources.stone = 2000;
  s.run.resources.iron = 2000;
  s.run.resources.coal = 2000;
  s.run.resources.steel = 2000;
  s.run.resources.tools = 200;
  s.run.resources.manaCrystals = 500;
  s.run.resources.mana = 2000;
  return s;
}

describe('Sewers struck; the Windmill replaces it', () => {
  it('the Sewers building is gone', () => {
    expect(BUILDING_BY_ID['sewers' as never]).toBeUndefined();
  });

  it('the Windmill (Milling) boosts Farmers +15% per copy and stacks with the Aqueduct', () => {
    const s = newGame(1);
    s.run.resources.wood = 500;
    s.run.resources.stone = 500;
    s.run.resources.tools = 50;
    expect(build(s, 'windmill')).toBe(false); // needs Milling
    s.run.tech.push('milling', 'construction', 'engineering');
    expect(build(s, 'windmill')).toBe(true);
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(0.5 * 1.15, 6);
    expect(build(s, 'windmill')).toBe(true); // stacks per copy
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(0.5 * 1.3, 6);
    expect(build(s, 'aqueduct')).toBe(true); // and with the Aqueduct's +10%
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(0.5 * 1.4, 6);
    expect(TECH_BY_ID.milling.requires).toEqual(expect.arrayContaining(['the-wheel', 'agriculture']));
  });
});

describe('prismatic essences — four resources, four caps', () => {
  it('each essence starts at 0 with a scarcer cap (100); Prismatic Mana is uncapped', () => {
    const s = newGame(1);
    for (const id of ['airEssence', 'earthEssence', 'fireEssence', 'waterEssence'] as const) {
      expect(s.run.resources[id]).toBe(0);
      expect(effectiveCap(s, id)).toBe(100);
    }
    expect(effectiveCap(s, 'prismatic')).toBe(Infinity);
  });
});

describe('attunements — each element earns its essence differently', () => {
  it('AIR: the Wind Spire needs a Windmill and then produces passively', () => {
    const s = primed();
    s.run.tech.push('aeromancy', 'milling');
    expect(build(s, 'wind-spire')).toBe(false); // no Windmill yet
    expect(build(s, 'windmill')).toBe(true);
    expect(build(s, 'wind-spire')).toBe(true);
    expect(productionRates(s).airEssence).toBeCloseTo(0.08, 6);
    expect(productionRates(s).mana).toBeCloseTo(-0.2, 6); // construct upkeep
  });

  it('WATER: the Tide Basin needs an Aqueduct', () => {
    const s = primed();
    s.run.tech.push('hydromancy', 'construction', 'engineering');
    expect(build(s, 'tide-basin')).toBe(false); // no Aqueduct yet
    expect(build(s, 'aqueduct')).toBe(true);
    expect(build(s, 'tide-basin')).toBe(true);
    expect(productionRates(s).waterEssence).toBeCloseTo(0.08, 6);
  });

  it('EARTH: the Deep Cairn eats stone; FIRE: the Ember Forge burns coal', () => {
    const s = primed();
    s.run.tech.push('geomancy', 'pyromancy');
    expect(build(s, 'deep-cairn')).toBe(true);
    expect(build(s, 'ember-forge')).toBe(true);
    const r = productionRates(s);
    expect(r.earthEssence).toBeCloseTo(0.08, 6);
    expect(r.stone).toBeCloseTo(-0.5, 6); // earth is quarried from real stone
    expect(r.fireEssence).toBeCloseTo(0.1, 6);
    expect(r.coal).toBeCloseTo(-0.4, 6); // fire must be fed
  });
});

describe('sink 1 — held essence empowers its matching job', () => {
  // Each element is tested ALONE (its opposite at zero) so this covers the raw scaling and
  // its ceiling; the opposition damping has its own coverage in education.test.ts.
  it('each essence boosts one job, capped at +50%', () => {
    const base = { wood: 0.5, iron: 0.4, stone: 0.4, food: 0.5 };

    const air = newGame(1);
    air.run.resources.airEssence = 50; // 50 × 0.004 = +20%
    expect(jobEffectiveProduces(air, 'woodcutter').wood).toBeCloseTo(base.wood * 1.2, 6);
    expect(jobEffectiveProduces(air, 'forager').food).toBeCloseTo(base.food, 6); // air ≠ Farmer

    const earth = newGame(1);
    earth.run.resources.earthEssence = 25; // +10%
    expect(jobEffectiveProduces(earth, 'miner').iron).toBeCloseTo(base.iron * 1.1, 6);

    const fire = newGame(1);
    fire.run.resources.fireEssence = 100; // +40%
    expect(jobEffectiveProduces(fire, 'quarry-worker').stone).toBeCloseTo(base.stone * 1.4, 6);
    fire.run.resources.fireEssence = 1000; // hard ceiling at +50%
    expect(jobEffectiveProduces(fire, 'quarry-worker').stone).toBeCloseTo(base.stone * 1.5, 6);

    const water = newGame(1);
    water.run.resources.waterEssence = 50; // +20% Farmer
    expect(jobEffectiveProduces(water, 'forager').food).toBeCloseTo(base.food * 1.2, 6);
  });
});

describe('sink 2 — elemental constructs burn essence for settler-free labour', () => {
  it('Storm Sails, Stone Titan, Flame Wardens and the Rain Engine each spend their element', () => {
    const s = primed();
    s.run.tech.push('aeromancy', 'geomancy', 'pyromancy', 'hydromancy');
    s.run.resources.airEssence = 80;
    s.run.resources.earthEssence = 80;
    s.run.resources.fireEssence = 80;
    s.run.resources.waterEssence = 80;
    expect(build(s, 'storm-sails')).toBe(true);
    expect(build(s, 'stone-titan')).toBe(true);
    expect(build(s, 'flame-wardens')).toBe(true);
    expect(build(s, 'rain-engine')).toBe(true);

    const r = productionRates(s);
    expect(r.wood).toBeCloseTo(1.2, 6); // Storm Sails, no settlers
    expect(r.food).toBeGreaterThan(1.4); // Rain Engine (no settlers to eat)
    expect(r.steel).toBeCloseTo(0.35, 6); // Flame Wardens — steel with no coal
    expect(r.airEssence).toBeCloseTo(-0.05, 6); // each spends its element
    expect(r.earthEssence).toBeCloseTo(-0.05, 6);
    expect(r.fireEssence).toBeCloseTo(-0.05, 6);
    expect(r.waterEssence).toBeCloseTo(-0.05, 6);
  });
});

describe('sink 3 — the Prism Nexus fuses all four into Prismatic Mana', () => {
  it('consumes every essence and yields prismatic light; the Spire spends it for global output', () => {
    const s = primed();
    s.run.tech.push('aeromancy', 'geomancy', 'pyromancy', 'hydromancy', 'prismatic-convergence');
    s.run.resources.airEssence = 90;
    s.run.resources.earthEssence = 90;
    s.run.resources.fireEssence = 90;
    s.run.resources.waterEssence = 90;
    expect(build(s, 'prism-nexus')).toBe(true);
    const r = productionRates(s);
    expect(r.prismatic).toBeCloseTo(0.1, 6);
    for (const id of ['airEssence', 'earthEssence', 'fireEssence', 'waterEssence'] as const) {
      expect(r[id]).toBeCloseTo(-0.05, 6);
    }
    simulate(s, 5);
    expect(s.run.resources.prismatic).toBeGreaterThan(0);
    expect(s.run.chronicle.some((c) => c.text.includes('Prismatic light pools'))).toBe(true);

    // The Prismatic Spire: +25% to every worker while its prismatic fuel holds.
    expect(build(s, 'prismatic-spire')).toBe(true);
    s.run.resources.prismatic = 50;
    const boosted = jobEffectiveProduces(s, 'hunter').food!;
    s.run.resources.prismatic = 0; // starved → the bonus lapses
    const dry = jobEffectiveProduces(s, 'hunter').food!;
    expect(boosted).toBeGreaterThan(dry);
    expect(boosted / dry).toBeCloseTo(1.25, 6);
  });
});

describe('sink 4 — advanced techs cost essence', () => {
  it('Prismatic Convergence spends all four essences and needs all four disciplines', () => {
    expect(TECH_BY_ID['prismatic-convergence'].resourceCost).toEqual({
      airEssence: 40,
      earthEssence: 40,
      fireEssence: 40,
      waterEssence: 40,
    });
    const s = primed();
    s.run.tech.push('aeromancy', 'geomancy', 'pyromancy', 'hydromancy');
    s.run.resources.research = 9000;
    expect(research(s, 'prismatic-convergence')).toBe(false); // no essence banked
    s.run.resources.airEssence = 40;
    s.run.resources.earthEssence = 40;
    s.run.resources.fireEssence = 40;
    s.run.resources.waterEssence = 40;
    expect(research(s, 'prismatic-convergence')).toBe(true);
    expect(s.run.resources.airEssence).toBe(0);
    expect(s.run.resources.waterEssence).toBe(0);
  });

  it('the disciplines are magic-gated and hang off Prismatic Theory', () => {
    for (const id of ['aeromancy', 'geomancy', 'pyromancy', 'hydromancy'] as const) {
      expect(TECH_BY_ID[id].requires).toContain('prismatic-theory');
      expect(TECH_BY_ID[id].requiresFlag).toBe('magicDiscovered');
    }
    expect(TECH_BY_ID['prismatic-theory'].requires).toContain('enchantment');
  });
});

describe('prismatic buildings are constructs', () => {
  it('all ten file under the Arcane section', () => {
    const s = newGame(1);
    const rows = buildingsView(s);
    for (const id of [
      'wind-spire',
      'deep-cairn',
      'ember-forge',
      'tide-basin',
      'storm-sails',
      'stone-titan',
      'flame-wardens',
      'rain-engine',
      'prism-nexus',
      'prismatic-spire',
    ] as const) {
      const row = rows.find((r) => r.id === id)!;
      expect(row, id).toBeDefined();
      expect(row.construct, id).toBe(true);
      expect(row.category, id).toBe('arcane');
    }
  });
});

describe('save migration v10 → v11', () => {
  it('backfills the essences to 0 and their caps to 100', () => {
    const v10: any = {
      magic: SAVE_MAGIC,
      version: 10,
      state: {
        version: 10,
        seed: 1,
        rngState: 1,
        run: {
          resources: { wood: 5, food: 20, stone: 0, mana: 7, research: 0, culture: 3 },
          caps: { wood: 200, food: 200, stone: 200 },
          population: { total: 0, jobs: {} },
          popCap: 0,
          buildings: {},
          active: {},
          tech: [],
          policies: [],
          growthProgress: 0,
          flags: {},
          chronicle: [],
        },
        settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
        playtime: 0,
        lastSaved: Date.now(),
      },
    };
    const res = safeLoad(JSON.stringify(v10));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(10);
    expect(res.state!.version).toBe(13);
    expect(res.state!.run.resources.airEssence).toBe(0);
    expect(res.state!.run.resources.prismatic).toBe(0);
    expect(res.state!.run.resources.mana).toBe(7); // preserved
    expect(res.state!.run.caps.fireEssence).toBe(100);
  });
});

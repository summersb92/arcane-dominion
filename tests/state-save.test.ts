import { describe, it, expect } from 'vitest';
import { newGame, freshResources, freshCaps } from '../src/engine/state';
import { serialize, deserialize, normalize, safeLoad, SAVE_MAGIC } from '../src/engine/save';
import { JOB_IDS } from '../src/content/jobs';
import { RESOURCE_IDS } from '../src/content/resources';

describe('newGame shape', () => {
  it('bootstraps a fresh settlement with the documented starting values', () => {
    const s = newGame(42);
    expect(s.version).toBe(7);
    expect(s.run.resources.food).toBe(20);
    expect(s.run.resources.wood).toBe(0);
    expect(s.run.resources.stone).toBe(0);
    expect(s.run.resources.iron).toBe(0);
    expect(s.run.resources.furs).toBe(0);
    expect(s.run.resources.manaCrystals).toBe(0);
    expect(s.run.resources.mana).toBe(0);
    expect(s.run.resources.research).toBe(0);
    expect(s.run.resources.culture).toBe(0);
    expect(s.run.caps).toEqual({ wood: 200, food: 200, stone: 200, iron: 200, coal: 200, steel: 200, furs: 200, manaCrystals: 200 });
    expect(s.run.population).toEqual({ total: 0, jobs: {} });
    expect(s.run.popCap).toBe(0);
    expect(s.run.buildings).toEqual({});
    expect(s.run.tech).toEqual([]);
    expect(s.run.chronicle.length).toBe(1);
  });

  it('every resource id is present in a fresh ledger', () => {
    const r = freshResources();
    for (const id of RESOURCE_IDS) expect(typeof r[id]).toBe('number');
    expect(freshCaps()).toEqual({ wood: 200, food: 200, stone: 200, iron: 200, coal: 200, steel: 200, furs: 200, manaCrystals: 200 });
  });
});

describe('save round-trip', () => {
  it('serialize → deserialize is stable (idempotent)', () => {
    const a = deserialize(serialize(newGame(7)));
    const b = deserialize(serialize(a));
    expect(b).toEqual(a);
  });

  it('uses the arcane-dominion magic string', () => {
    const env = JSON.parse(serialize(newGame(1)));
    expect(env.magic).toBe(SAVE_MAGIC);
    expect(SAVE_MAGIC).toBe('arcane-dominion-save');
  });

  it('migrates a v1 save (no culture) up to current, backfilling culture → 0', () => {
    // A v1 envelope whose resources predate the culture currency.
    const v1: any = {
      magic: SAVE_MAGIC,
      version: 1,
      state: {
        version: 1,
        seed: 1,
        rngState: 1,
        run: {
          resources: { wood: 5, food: 20, stone: 0, mana: 0, research: 0 }, // no `culture`/`furs`
          caps: { wood: 200, food: 200, stone: 200 },
          population: { total: 0, jobs: {} },
          popCap: 0,
          buildings: {},
          tech: [],
          growthProgress: 0,
          flags: {},
          chronicle: [],
        },
        settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
        playtime: 0,
        lastSaved: Date.now(),
      },
    };
    const res = safeLoad(JSON.stringify(v1));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(1);
    expect(res.state!.version).toBe(7);
    expect(res.state!.run.resources.culture).toBe(0);
    expect(res.state!.run.resources.furs).toBe(0); // furs backfilled on the way up
    expect(res.state!.run.resources.manaCrystals).toBe(0); // manaCrystals backfilled too
    expect(res.state!.run.resources.iron).toBe(0); // iron backfilled too
    expect(res.state!.run.caps.manaCrystals).toBe(200);
    expect(res.state!.run.caps.iron).toBe(200);
  });

  it('migrates a v2 save (no furs) up to v3, backfilling furs → 0 and its cap → 200', () => {
    // A v2 envelope that has culture but predates the furs luxury.
    const v2: any = {
      magic: SAVE_MAGIC,
      version: 2,
      state: {
        version: 2,
        seed: 1,
        rngState: 1,
        run: {
          resources: { wood: 5, food: 20, stone: 0, mana: 0, research: 0, culture: 3 }, // no `furs`
          caps: { wood: 200, food: 200, stone: 200 }, // no `furs` cap
          population: { total: 0, jobs: {} },
          popCap: 0,
          buildings: {},
          tech: [],
          growthProgress: 0,
          flags: {},
          chronicle: [],
        },
        settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
        playtime: 0,
        lastSaved: Date.now(),
      },
    };
    const res = safeLoad(JSON.stringify(v2));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(2);
    expect(res.state!.version).toBe(7);
    expect(res.state!.run.resources.furs).toBe(0);
    expect(res.state!.run.resources.culture).toBe(3); // preserved
    expect(res.state!.run.caps.furs).toBe(200);
  });

  it('migrates a v3 save (no manaCrystals) up to v4, backfilling manaCrystals → 0 and its cap → 200', () => {
    // A v3 envelope that has furs but predates the mana crystals material.
    const v3: any = {
      magic: SAVE_MAGIC,
      version: 3,
      state: {
        version: 3,
        seed: 1,
        rngState: 1,
        run: {
          resources: { wood: 5, food: 20, stone: 0, furs: 2, mana: 0, research: 0, culture: 3 }, // no `manaCrystals`
          caps: { wood: 200, food: 200, stone: 200, furs: 200 }, // no `manaCrystals` cap
          population: { total: 0, jobs: {} },
          popCap: 0,
          buildings: {},
          tech: [],
          growthProgress: 0,
          flags: {},
          chronicle: [],
        },
        settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
        playtime: 0,
        lastSaved: Date.now(),
      },
    };
    const res = safeLoad(JSON.stringify(v3));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(3);
    expect(res.state!.version).toBe(7);
    expect(res.state!.run.resources.manaCrystals).toBe(0);
    expect(res.state!.run.resources.furs).toBe(2); // preserved
    expect(res.state!.run.caps.manaCrystals).toBe(200);
  });

  it('migrates a v4 save (no iron) up to v5, backfilling iron → 0 and its cap → 200', () => {
    // A v4 envelope that has mana crystals but predates the iron material.
    const v4: any = {
      magic: SAVE_MAGIC,
      version: 4,
      state: {
        version: 4,
        seed: 1,
        rngState: 1,
        run: {
          resources: { wood: 5, food: 20, stone: 7, furs: 2, manaCrystals: 1, mana: 0, research: 0, culture: 3 }, // no `iron`
          caps: { wood: 200, food: 200, stone: 200, furs: 200, manaCrystals: 200 }, // no `iron` cap
          population: { total: 0, jobs: {} },
          popCap: 0,
          buildings: {},
          tech: [],
          growthProgress: 0,
          flags: {},
          chronicle: [],
        },
        settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
        playtime: 0,
        lastSaved: Date.now(),
      },
    };
    const res = safeLoad(JSON.stringify(v4));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(4);
    expect(res.state!.version).toBe(7);
    expect(res.state!.run.resources.iron).toBe(0);
    expect(res.state!.run.resources.stone).toBe(7); // preserved (old stone is NOT converted)
    expect(res.state!.run.caps.iron).toBe(200);
  });

  it('migrates a v5 save (no coal/steel, no active map) up to v6, backfilling all → 0/200/{}', () => {
    // A v5 envelope that has iron but predates coal/steel + the converter `active` toggle map.
    const v5: any = {
      magic: SAVE_MAGIC,
      version: 5,
      state: {
        version: 5,
        seed: 1,
        rngState: 1,
        run: {
          resources: { wood: 5, food: 20, stone: 7, iron: 4, furs: 2, manaCrystals: 1, mana: 0, research: 0, culture: 3 },
          caps: { wood: 200, food: 200, stone: 200, iron: 200, furs: 200, manaCrystals: 200 }, // no coal/steel caps
          population: { total: 0, jobs: {} },
          popCap: 0,
          buildings: {},
          tech: [],
          growthProgress: 0,
          flags: {},
          chronicle: [],
          // no `active` map
        },
        settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
        playtime: 0,
        lastSaved: Date.now(),
      },
    };
    const res = safeLoad(JSON.stringify(v5));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(5);
    expect(res.state!.version).toBe(7);
    expect(res.state!.run.resources.coal).toBe(0);
    expect(res.state!.run.resources.steel).toBe(0);
    expect(res.state!.run.resources.iron).toBe(4); // preserved
    expect(res.state!.run.caps.coal).toBe(200);
    expect(res.state!.run.caps.steel).toBe(200);
    expect(res.state!.run.active).toEqual({}); // toggle map backfilled
  });

  it('migrates a v6 save (scalar active counts) up to v7, wrapping each into a per-recipe array', () => {
    // A v6 envelope whose `active` map still stores a single count per converter.
    const v6: any = {
      magic: SAVE_MAGIC,
      version: 6,
      state: {
        version: 6,
        seed: 1,
        rngState: 1,
        run: {
          resources: { wood: 5, food: 20, stone: 7, iron: 4, coal: 2, steel: 1, furs: 2, manaCrystals: 1, mana: 0, research: 0, culture: 3 },
          caps: { wood: 200, food: 200, stone: 200, iron: 200, coal: 200, steel: 200, furs: 200, manaCrystals: 200 },
          population: { total: 0, jobs: {} },
          popCap: 0,
          buildings: { 'charcoal-ground': 2, steelworks: 3 },
          active: { 'charcoal-ground': 2, steelworks: 3 }, // OLD scalar form
          tech: [],
          growthProgress: 0,
          flags: {},
          chronicle: [],
        },
        settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
        playtime: 0,
        lastSaved: Date.now(),
      },
    };
    const res = safeLoad(JSON.stringify(v6));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(6);
    expect(res.state!.version).toBe(7);
    // Each scalar count becomes a one-element array (copies keep running recipe 0).
    expect(res.state!.run.active['charcoal-ground']).toEqual([2]);
    expect(res.state!.run.active.steelworks).toEqual([3]);
  });
});

describe('normalize backfill', () => {
  it('backfills absent containers so read models never see undefined', () => {
    // A minimal, partial save (as a hand-edited/foreign file might be).
    const partial: any = {
      version: 1,
      seed: 1,
      rngState: 1,
      run: { resources: { wood: 5 } },
      playtime: 0,
      lastSaved: Date.now(),
    };
    normalize(partial);
    expect(partial.settings).toBeDefined();
    expect(partial.run.caps).toEqual({ wood: 200, food: 200, stone: 200, iron: 200, coal: 200, steel: 200, furs: 200, manaCrystals: 200 });
    expect(partial.run.population).toEqual({
      total: 0,
      jobs: Object.fromEntries(JOB_IDS.map((j) => [j, 0])),
    });
    expect(partial.run.buildings).toEqual({});
    expect(partial.run.tech).toEqual([]);
    for (const id of RESOURCE_IDS) expect(typeof partial.run.resources[id]).toBe('number');
  });
});

describe('validate rejects garbage', () => {
  it('rejects a non-numeric resource (garbage that survives JSON)', () => {
    // NaN/Infinity JSON-serialize to null, which normalize legitimately heals to 0; a
    // string is the realistic "garbage that survived" case validate must reject.
    const s: any = newGame(1);
    s.run.resources.wood = 'oops';
    const res = safeLoad(serialize(s));
    expect(res.ok).toBe(false);
  });

  it('rejects a negative resource', () => {
    const s: any = newGame(1);
    s.run.resources.stone = -5;
    expect(safeLoad(serialize(s)).ok).toBe(false);
  });

  it('rejects more assigned workers than settlers exist', () => {
    const s: any = newGame(1);
    s.run.population.total = 1;
    s.run.population.jobs = { woodcutter: 3 };
    expect(safeLoad(serialize(s)).ok).toBe(false);
  });

  it('accepts a clean save', () => {
    expect(safeLoad(serialize(newGame(1))).ok).toBe(true);
  });
});

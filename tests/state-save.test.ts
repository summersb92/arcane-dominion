import { describe, it, expect } from 'vitest';
import { newGame, freshResources, freshCaps } from '../src/engine/state';
import { serialize, deserialize, normalize, safeLoad, SAVE_MAGIC } from '../src/engine/save';
import { JOB_IDS } from '../src/content/jobs';
import { RESOURCE_IDS } from '../src/content/resources';

describe('newGame shape', () => {
  it('bootstraps a fresh settlement with the documented starting values', () => {
    const s = newGame(42);
    expect(s.version).toBe(2);
    expect(s.run.resources.food).toBe(20);
    expect(s.run.resources.wood).toBe(0);
    expect(s.run.resources.stone).toBe(0);
    expect(s.run.resources.mana).toBe(0);
    expect(s.run.resources.research).toBe(0);
    expect(s.run.resources.culture).toBe(0);
    expect(s.run.caps).toEqual({ wood: 200, food: 200, stone: 200 });
    expect(s.run.population).toEqual({ total: 0, jobs: {} });
    expect(s.run.popCap).toBe(0);
    expect(s.run.buildings).toEqual({});
    expect(s.run.tech).toEqual([]);
    expect(s.run.chronicle.length).toBe(1);
  });

  it('every resource id is present in a fresh ledger', () => {
    const r = freshResources();
    for (const id of RESOURCE_IDS) expect(typeof r[id]).toBe('number');
    expect(freshCaps()).toEqual({ wood: 200, food: 200, stone: 200 });
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

  it('migrates a v1 save (no culture) up to v2, backfilling culture → 0', () => {
    // A v1 envelope whose resources predate the culture currency.
    const v1: any = {
      magic: SAVE_MAGIC,
      version: 1,
      state: {
        version: 1,
        seed: 1,
        rngState: 1,
        run: {
          resources: { wood: 5, food: 20, stone: 0, mana: 0, research: 0 }, // no `culture`
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
    expect(res.state!.version).toBe(2);
    expect(res.state!.run.resources.culture).toBe(0);
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
    expect(partial.run.caps).toEqual({ wood: 200, food: 200, stone: 200 });
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

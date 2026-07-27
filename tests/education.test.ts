import { describe, it, expect } from 'vitest';
import { newGame, SAVE_VERSION } from '../src/engine/state';
import { build } from '../src/engine/systems/buildings';
import { jobEffectiveProduces, productionRates } from '../src/engine/systems/production';
import { foodEnvMult } from '../src/engine/systems/weather';
import {
  educationUnlocked,
  setCurriculum,
  currentCurriculum,
  magicYieldMult,
  oppositionFactor,
  educationView,
} from '../src/engine/systems/education';
import { safeLoad, SAVE_MAGIC } from '../src/engine/save';
import { RESOURCE_BY_ID } from '../src/content/resources';
import { BUILDING_BY_ID } from '../src/content/buildings';

/** A run with the disciplines known and an Arcanum standing. */
function schooled(seed = 1) {
  const s = newGame(seed);
  s.run.flags.magicDiscovered = true;
  s.run.tech.push(
    'prismatic-theory',
    'aeromancy',
    'geomancy',
    'pyromancy',
    'hydromancy',
    'prismatic-convergence',
  );
  for (const id of Object.keys(s.run.caps) as (keyof typeof s.run.caps)[]) s.run.caps[id] = 5000;
  s.run.resources.wood = 3000;
  s.run.resources.stone = 3000;
  s.run.resources.iron = 3000;
  s.run.resources.manaCrystals = 500;
  s.run.resources.mana = 3000;
  return s;
}

describe('the Arcanum — a research building for magical yield', () => {
  it('is gated behind Prismatic Theory and raises essence + prismatic yield per copy', () => {
    const s = schooled();
    const plain = newGame(2);
    expect(build(plain, 'arcanum')).toBe(false); // no Prismatic Theory

    expect(magicYieldMult(s, 'airEssence')).toBeCloseTo(1, 6);
    expect(build(s, 'arcanum')).toBe(true);
    expect(magicYieldMult(s, 'airEssence')).toBeCloseTo(1.15, 6);
    expect(magicYieldMult(s, 'prismatic')).toBeCloseTo(1.1, 6);
    expect(build(s, 'arcanum')).toBe(true); // stacks per copy
    expect(magicYieldMult(s, 'earthEssence')).toBeCloseTo(1.3, 6);
    // It is also a science building (Scholar slot + research cap) and mundane resources are untouched.
    const kinds = BUILDING_BY_ID.arcanum.effects.map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['yieldBoost', 'jobCapacity', 'researchCap']));
    expect(magicYieldMult(s, 'wood')).toBe(1);
  });

  it('the boost reaches real essence production (Ember Forge output rises)', () => {
    const s = schooled();
    s.run.resources.coal = 500;
    expect(build(s, 'ember-forge')).toBe(true);
    const before = productionRates(s).fireEssence;
    expect(before).toBeCloseTo(0.1, 6);
    expect(build(s, 'arcanum')).toBe(true);
    expect(productionRates(s).fireEssence).toBeCloseTo(0.1 * 1.15, 6);
  });
});

describe('curriculum — specialization is the point', () => {
  it('needs an Arcanum, then focuses one discipline at every other discipline’s expense', () => {
    const s = schooled();
    expect(educationUnlocked(s)).toBe(false);
    expect(setCurriculum(s, 'pyromancy')).toBe(false); // no Arcanum yet

    expect(build(s, 'arcanum')).toBe(true);
    expect(educationUnlocked(s)).toBe(true);
    expect(setCurriculum(s, 'pyromancy')).toBe(true);
    expect(currentCurriculum(s)).toBe('pyromancy');

    // Fire (focused) gains +50% atop the Arcanum's +15%; the others take the −15% penalty.
    expect(magicYieldMult(s, 'fireEssence')).toBeCloseTo(1.15 * 1.5, 6);
    expect(magicYieldMult(s, 'airEssence')).toBeCloseTo(1.15 * 0.85, 6);
    expect(magicYieldMult(s, 'prismatic')).toBeCloseTo(1.1 * 0.85, 6);

    // Switching moves the focus; General clears it (no bonus, no penalty).
    expect(setCurriculum(s, 'prismatics')).toBe(true);
    expect(magicYieldMult(s, 'prismatic')).toBeCloseTo(1.1 * 1.5, 6);
    expect(magicYieldMult(s, 'fireEssence')).toBeCloseTo(1.15 * 0.85, 6);
    expect(setCurriculum(s, null)).toBe(true);
    expect(magicYieldMult(s, 'fireEssence')).toBeCloseTo(1.15, 6);
  });

  it('a discipline cannot be taught before its tech is researched', () => {
    const s = newGame(1);
    s.run.flags.magicDiscovered = true;
    s.run.tech.push('prismatic-theory');
    s.run.buildings.arcanum = 1;
    expect(setCurriculum(s, 'geomancy')).toBe(false); // Geomancy unresearched
    s.run.tech.push('geomancy');
    expect(setCurriculum(s, 'geomancy')).toBe(true);
  });
});

describe('opposition — the stronger element drowns out the weaker, asymptotically', () => {
  it('is neutral when equal or ahead (specialists are never punished)', () => {
    const s = newGame(1);
    s.run.resources.airEssence = 80;
    s.run.resources.earthEssence = 0;
    expect(oppositionFactor(s, 'airEssence')).toBe(1); // far ahead
    s.run.resources.earthEssence = 80;
    expect(oppositionFactor(s, 'airEssence')).toBe(1); // exactly equal
    expect(oppositionFactor(s, 'earthEssence')).toBe(1);
  });

  it('suppresses the weaker side by the DIFFERENCE, and never fully cancels', () => {
    const s = newGame(1);
    // Air 0 vs Earth 60 → diff 60 = scale → 1 − 0.9 × 0.5 = 0.55
    s.run.resources.airEssence = 0;
    s.run.resources.earthEssence = 60;
    expect(oppositionFactor(s, 'airEssence')).toBeCloseTo(0.55, 6);

    // diff 240 = 4× scale → 1 − 0.9 × 0.8 = 0.28
    s.run.resources.earthEssence = 240;
    expect(oppositionFactor(s, 'airEssence')).toBeCloseTo(0.28, 6);

    // Enormous gap → approaches the 0.1 floor but stays strictly above it.
    s.run.resources.earthEssence = 1_000_000;
    const extreme = oppositionFactor(s, 'airEssence');
    expect(extreme).toBeGreaterThan(0.1);
    expect(extreme).toBeLessThan(0.11);

    // Monotonic: a bigger gap always suppresses harder, and it is never zero or negative.
    let prev = 1;
    for (const opp of [10, 50, 100, 500, 5000]) {
      s.run.resources.earthEssence = opp;
      const f = oppositionFactor(s, 'airEssence');
      expect(f).toBeLessThan(prev);
      expect(f).toBeGreaterThan(0);
      prev = f;
    }
  });

  it('pairs are Air↔Earth and Fire↔Water only', () => {
    const s = newGame(1);
    s.run.resources.waterEssence = 300;
    expect(oppositionFactor(s, 'fireEssence')).toBeLessThan(1); // water drowns fire
    expect(oppositionFactor(s, 'airEssence')).toBe(1); // water does not touch air
    expect(oppositionFactor(s, 'prismatic')).toBe(1); // prismatic has no opposite
  });

  it('damps the real job empowerment — a swamped element barely helps its job', () => {
    const s = newGame(1);
    // Fire alone: 100 held → +40% (0.004 × 100), undamped.
    s.run.resources.fireEssence = 100;
    expect(jobEffectiveProduces(s, 'quarry-worker').stone).toBeCloseTo(1 * 1.4, 6);

    // Now flood Water: diff 400 → factor 1 − 0.9 × 400/460 ≈ 0.2174, so +40% → ~+8.7%.
    s.run.resources.waterEssence = 500;
    const factor = 1 - 0.9 * (400 / 460);
    expect(jobEffectiveProduces(s, 'quarry-worker').stone).toBeCloseTo(1 * (1 + 0.4 * factor), 6);
    // Water's own empowerment is untouched (it is the stronger side).
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(6 * 1.5 * foodEnvMult(s), 6); // capped at +50%
  });
});

describe('education read model', () => {
  it('reports yield, focus, and a live opposition readout', () => {
    const s = schooled();
    build(s, 'arcanum');
    setCurriculum(s, 'aeromancy');
    s.run.resources.airEssence = 20;
    s.run.resources.earthEssence = 80;
    const v = educationView(s, (id) => RESOURCE_BY_ID[id].label);
    expect(v.unlocked).toBe(true);
    expect(v.arcanums).toBe(1);
    expect(v.current).toBe('aeromancy');
    expect(v.essenceYieldPct).toBe(15);
    expect(v.focusPct).toBe(50);
    expect(v.unfocusedPct).toBe(15);
    const air = v.opposition.find((o) => o.id === 'airEssence')!;
    expect(air.own).toBe(20);
    expect(air.opposing).toBe(80);
    expect(air.factor).toBeCloseTo(1 - 0.9 * (60 / 120), 6); // diff 60, scale 60 → 0.55
    const earth = v.opposition.find((o) => o.id === 'earthEssence')!;
    expect(earth.factor).toBe(1); // the stronger side is unharmed
  });
});

describe('save migration v11 → v12', () => {
  it('backfills curriculum to null', () => {
    const v11: any = {
      magic: SAVE_MAGIC,
      version: 11,
      state: {
        version: 11,
        seed: 1,
        rngState: 1,
        run: {
          resources: { wood: 5, food: 20, stone: 0, mana: 0, research: 0, culture: 0 },
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
          // no `curriculum`
        },
        settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
        playtime: 0,
        lastSaved: Date.now(),
      },
    };
    const res = safeLoad(JSON.stringify(v11));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(11);
    expect(res.state!.version).toBe(SAVE_VERSION);
    expect(res.state!.run.curriculum).toBe(null);
  });
});

import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { build } from '../src/engine/systems/buildings';
import { assignJob } from '../src/engine/systems/jobs';
import { productionRates, jobEffectiveProduces, runProduction } from '../src/engine/systems/production';
import { happiness } from '../src/engine/systems/happiness';
import {
  governanceUnlocked,
  currentForm,
  policySlots,
  enactPolicy,
  revokePolicy,
  policiesSuspended,
  governmentView,
} from '../src/engine/systems/government';
import { safeLoad, SAVE_MAGIC } from '../src/engine/save';
import { TECH_BY_ID } from '../src/content/tech';

describe('mini-step techs — per-job boosts', () => {
  it('Animal Husbandry boosts the Hunter only', () => {
    const s = newGame(1);
    expect(jobEffectiveProduces(s, 'hunter').food).toBeCloseTo(0.3, 6);
    s.run.tech.push('animal-husbandry');
    expect(jobEffectiveProduces(s, 'hunter').food).toBeCloseTo(0.3 * 1.25, 6);
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(0.5, 6); // untouched
  });

  it('Irrigation, Stone Hoe and Fertilizer stack on the Farmer (Agriculture adds no multiplier)', () => {
    const s = newGame(1);
    // Agriculture is an ENABLER only — it opens the Farm and multiplies nothing.
    s.run.tech.push('agriculture');
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(6, 6);
    s.run.tech.push('stone-hoe', 'irrigation', 'fertilizer');
    // 6 × 1.25 (hoe) × 1.25 (irrigation) × 1.5 (fertilizer)
    expect(jobEffectiveProduces(s, 'forager').food).toBeCloseTo(6 * 1.25 * 1.25 * 1.5, 6);
  });

  it('Bloomery boosts the Miner; Optics the Scholar; Wheelbarrows every gather job', () => {
    const s = newGame(1);
    s.run.tech.push('bloomery', 'optics', 'wheelbarrows');
    expect(jobEffectiveProduces(s, 'miner').iron).toBeCloseTo(0.4 * 1.25 * 1.1, 6); // bloomery × wheelbarrows
    expect(jobEffectiveProduces(s, 'scholar').research).toBeCloseTo(0.2 * 1.25, 6); // optics only (not a gather job)
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(0.5 * 1.1, 6); // wheelbarrows
  });
});

describe('mini-step buildings', () => {
  it('the Paper Mill converts wood into parchment, worker-free', () => {
    const s = newGame(1);
    s.run.tech.push('paper-making');
    s.run.resources.wood = 200;
    s.run.resources.stone = 100;
    expect(build(s, 'paper-mill')).toBe(true);
    expect(productionRates(s).parchment).toBeCloseTo(0.25, 6);
    expect(productionRates(s).wood).toBeCloseTo(-0.6, 6);
  });

  it('the Blast Furnace makes steel from coal + iron with no Smelter', () => {
    const s = newGame(1);
    s.run.tech.push('blast-furnace');
    s.run.resources.stone = 200;
    s.run.resources.iron = 200;
    s.run.resources.coal = 200;
    expect(build(s, 'blast-furnace')).toBe(true);
    expect(productionRates(s).steel).toBeCloseTo(0.15, 6); // no settlers involved
  });

  it('the Guild Hall boosts every worker (+5%)', () => {
    const s = newGame(1);
    s.run.buildings['guild-hall'] = 1;
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(0.5 * 1.05, 6);
  });
});

describe('governance — forms and slots', () => {
  it('unlocks with Code of Laws; forms progress Council → Monarchy → Republic', () => {
    const s = newGame(1);
    expect(governanceUnlocked(s)).toBe(false);
    expect(policySlots(s)).toBe(0);
    s.run.tech.push('code-of-laws');
    expect(governanceUnlocked(s)).toBe(true);
    expect(currentForm(s)).toBe('council');
    expect(policySlots(s)).toBe(1);
    s.run.tech.push('monarchy');
    expect(currentForm(s)).toBe('monarchy');
    expect(policySlots(s)).toBe(2);
    s.run.tech.push('civil-service', 'republic');
    expect(currentForm(s)).toBe('republic');
    expect(policySlots(s)).toBe(4);
  });

  it('Monarchy grants +5% worker output; the Republic +25% culture and +5 happiness', () => {
    const s = newGame(1);
    s.run.tech.push('code-of-laws', 'monarchy');
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(0.5 * 1.05, 6);

    s.run.tech.push('republic'); // replaces the monarchy passive
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(0.5, 6);
    expect(happiness(s).breakdown.some((b) => b.label === 'Republic')).toBe(true);
    // Culture production ×1.25: one Bard (0.2/s base).
    s.run.tech.push('the-arts');
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    build(s, 'amphitheater');
    s.run.population.total = 1;
    assignJob(s, 'bard', 1);
    expect(productionRates(s).culture).toBeCloseTo(0.2 * 1.25, 6);
  });
});

describe('policies — enact, revoke, slots, and effects', () => {
  it('enacting needs a free slot; effects apply while culture holds', () => {
    const s = newGame(1);
    s.run.resources.culture = 100;
    s.run.population.total = 20; // happiness 70 — below the 100 clamp so effects are visible
    expect(enactPolicy(s, 'festivals')).toBe(false); // no governance yet
    s.run.tech.push('code-of-laws'); // 1 slot
    const hBefore = happiness(s).value;
    expect(enactPolicy(s, 'festivals')).toBe(true);
    expect(happiness(s).value).toBe(hBefore + 8);
    expect(enactPolicy(s, 'rationing')).toBe(false); // slots full (1/1)
    expect(revokePolicy(s, 'festivals')).toBe(true);
    expect(enactPolicy(s, 'rationing')).toBe(true);
    // Rationing: food upkeep ×0.75, −8 happiness. Idle settlers forage 4.2/s scaled by
    // contentment, so derive the expectation from the live happiness rather than a constant.
    s.run.population.total = 10;
    const hap = happiness(s).value / 100;
    expect(productionRates(s).food).toBeCloseTo(-(10 * 4 * 0.75) + 10 * 4.2 * hap, 6);
  });

  it('policies drain culture upkeep and SUSPEND when the jar runs dry', () => {
    const s = newGame(1);
    s.run.tech.push('code-of-laws');
    s.run.resources.culture = 1; // barely anything
    s.run.population.total = 20; // happiness 70 — below the clamp so the ±8 is visible
    s.run.resources.food = 500; // don't starve during the drain window
    expect(enactPolicy(s, 'festivals')).toBe(true);
    const hHappy = happiness(s).value; // +8 while live

    runProduction(s, 10); // upkeep 0.3/s × 10s > 1 culture → drains to 0
    expect(s.run.resources.culture).toBe(0);
    expect(policiesSuspended(s)).toBe(true);
    expect(happiness(s).value).toBe(hHappy - 8); // effect gone while suspended
    // The view reports the suspension for the UI banner.
    expect(governmentView(s).suspended).toBe(true);
  });

  it('gated policies stay hidden: Night Shifts needs Industrialization; Arcane Sanction needs magic', () => {
    const s = newGame(1);
    s.run.tech.push('code-of-laws');
    const ids = governmentView(s).policies.map((p) => p.id);
    expect(ids).not.toContain('night-shifts');
    expect(ids).not.toContain('arcane-sanction');
    s.run.tech.push('industrialization');
    s.run.flags.magicDiscovered = true;
    const after = governmentView(s).policies.map((p) => p.id);
    expect(after).toContain('night-shifts');
    expect(after).toContain('arcane-sanction');
  });
});

describe('governance techs + save migration', () => {
  it('the governance chain hangs off Philosophy', () => {
    expect(TECH_BY_ID['code-of-laws'].requires).toContain('philosophy');
    expect(TECH_BY_ID.monarchy.requires).toContain('code-of-laws');
    expect(TECH_BY_ID['civil-service'].requires).toContain('monarchy');
    expect(TECH_BY_ID.republic.requires).toContain('monarchy');
  });

  it('migrates a v9 save (no policies) up to v10, backfilling []', () => {
    const v9: any = {
      magic: SAVE_MAGIC,
      version: 9,
      state: {
        version: 9,
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
          growthProgress: 0,
          flags: {},
          chronicle: [],
          // no `policies`
        },
        settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
        playtime: 0,
        lastSaved: Date.now(),
      },
    };
    const res = safeLoad(JSON.stringify(v9));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(9);
    expect(res.state!.version).toBe(13);
    expect(res.state!.run.policies).toEqual([]);
  });
});

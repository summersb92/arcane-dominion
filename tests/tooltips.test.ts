import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { build } from '../src/engine/systems/buildings';
import { assignJob } from '../src/engine/systems/jobs';
import { jobEffectiveProduces, productionRates, runProduction } from '../src/engine/systems/production';
import { TECH_BY_ID } from '../src/content/tech';
import { toView, buildingTooltip, techTooltip } from '../src/ui/stores';

/** Pull the "Effects" lines a card's tooltip would render for one building. */
function effectsFor(s: ReturnType<typeof newGame>, id: string): string[] {
  const row = toView(s).buildings.find((b) => b.id === id)!;
  const fx = buildingTooltip(row).sections.find((x) => x.label === 'Effects');
  return (fx?.lines ?? []).map((l) => l.text);
}

describe('building tooltips hide effects still behind a tech gate', () => {
  it("the Library advertises +50 until the Decimal System, then +100 — never both", () => {
    const s = newGame(1);
    s.run.tech.push('writing');
    const before = effectsFor(s, 'library');
    expect(before).toContain('+50 Research cap');
    expect(before.some((l) => /Decimal System|requires/i.test(l))).toBe(false);
    expect(before.filter((l) => l.endsWith('Research cap')).length).toBe(1);

    s.run.tech.push('decimal-system');
    const after = effectsFor(s, 'library');
    expect(after).toContain('+100 Research cap'); // folded into ONE honest total
    expect(after).not.toContain('+50 Research cap');
    expect(after.filter((l) => l.endsWith('Research cap')).length).toBe(1);
  });

  it('the base workplaces advertise their own storage and their own job boost', () => {
    const s = newGame(1);
    s.run.resources.wood = 500;
    build(s, 'woodcutters-lodge');
    const fx = effectsFor(s, 'woodcutters-lodge');
    expect(fx).toContain('+100 Wood storage');
    expect(fx.some((l) => /\+2% Woodcutter output/.test(l))).toBe(true);
  });

  it('the House advertises the treasury it underwrites', () => {
    expect(effectsFor(newGame(1), 'hut')).toContain('+100 Gold cap (with Currency)');
  });

  it('the Farm House is housing and a Farm job — no storage at all', () => {
    const s = newGame(1);
    s.run.tech.push('agriculture');
    const fx = effectsFor(s, 'farm-house');
    expect(fx).toContain('+1 housing');
    expect(fx.some((l) => /storage|cap/i.test(l))).toBe(false);
    // And building one leaves every material ceiling exactly where it was.
    s.run.resources.wood = 500;
    s.run.resources.stone = 50;
    const before = { ...s.run.caps };
    expect(build(s, 'farm-house')).toBe(true);
    expect(s.run.caps).toEqual(before);
  });
});

describe('a multi-resource research cost only reddens the half you cannot pay', () => {
  /** The Cost lines a tech card's tooltip would render, as [text, colour-class] pairs. */
  function costLines(s: ReturnType<typeof newGame>, id: string): [string, string | undefined][] {
    const row = toView(s).tech.find((t) => t.id === id)!;
    const cost = techTooltip(row).sections.find((x) => x.label === 'Cost')!;
    return cost.lines.map((l) => [l.text, l.cls]);
  }

  it('Stone Axe (150 research + 40 stone) colours each resource independently', () => {
    const s = newGame(1);
    // Neither in hand → both red.
    expect(costLines(s, 'stone-axe')).toEqual([
      ['Research 150', 'life'],
      ['Stone 40', 'life'],
    ]);

    // Plenty of research, no stone → ONLY the stone line reads red.
    s.run.resources.research = 300;
    expect(costLines(s, 'stone-axe')).toEqual([
      ['Research 150', undefined],
      ['Stone 40', 'life'],
    ]);

    // The mirror case: stone in hand, research spent.
    s.run.resources.research = 0;
    s.run.resources.stone = 100;
    expect(costLines(s, 'stone-axe')).toEqual([
      ['Research 150', 'life'],
      ['Stone 40', undefined],
    ]);

    // Both affordable → nothing red.
    s.run.resources.research = 300;
    expect(costLines(s, 'stone-axe')).toEqual([
      ['Research 150', undefined],
      ['Stone 40', undefined],
    ]);
  });

  it('a single-resource tech still renders one line', () => {
    expect(costLines(newGame(1), 'writing')).toEqual([['Research 20', 'life']]);
  });
});

describe('build costs colour per resource, exactly as research does', () => {
  function costLines(s: ReturnType<typeof newGame>, id: string): [string, string | undefined][] {
    const row = toView(s).buildings.find((b) => b.id === id)!;
    const cost = buildingTooltip(row).sections.find((x) => x.label === 'Cost')!;
    return cost.lines.map((l) => [l.text, l.cls]);
  }

  it('the Farm House (50 wood + 5 stone) reddens only the half you cannot pay', () => {
    const s = newGame(1);
    s.run.tech.push('agriculture');
    expect(costLines(s, 'farm-house')).toEqual([
      ['Wood 50', 'life'],
      ['Stone 5', 'life'],
    ]);

    s.run.resources.wood = 100; // wood covered, stone still missing
    expect(costLines(s, 'farm-house')).toEqual([
      ['Wood 50', undefined],
      ['Stone 5', 'life'],
    ]);

    s.run.resources.stone = 20;
    expect(costLines(s, 'farm-house')).toEqual([
      ['Wood 50', undefined],
      ['Stone 5', undefined],
    ]);
  });

  it('job capacity reads as JOBS, not slots', () => {
    const s = newGame(1);
    s.run.resources.wood = 500;
    build(s, 'woodcutters-lodge');
    expect(effectsFor(s, 'woodcutters-lodge')).toContain('+1 Woodcutter job');
    s.run.tech.push('writing');
    expect(effectsFor(s, 'academy')).toContain('+2 Scholar jobs'); // pluralized
  });
});

describe('Alchemy reveals alchemical components', () => {
  it('the tech hangs off Mathematics and costs 900', () => {
    expect(TECH_BY_ID.alchemy.cost).toBe(900);
    expect(TECH_BY_ID.alchemy.requires).toContain('mathematics');
  });

  it('Hunters and Ranches only save components once Alchemy is in', () => {
    const s = newGame(1);
    s.run.tech.push('archery', 'animal-husbandry');
    s.run.resources.wood = 500;
    s.run.resources.stone = 500;
    expect(build(s, 'hunters-lodge')).toBe(true);
    expect(build(s, 'ranch')).toBe(true);
    s.run.population.total = 1;
    assignJob(s, 'hunter', 1);

    expect(jobEffectiveProduces(s, 'hunter').alchemical).toBeUndefined();
    expect(productionRates(s).alchemical).toBeCloseTo(0, 6);

    s.run.tech.push('alchemy');
    expect(jobEffectiveProduces(s, 'hunter').alchemical).toBeCloseTo(0.05, 6);
    // 0.05 from the Hunter + 0.05 from the Ranch.
    expect(productionRates(s).alchemical).toBeCloseTo(0.1, 6);
    // The Hunter's existing output is untouched.
    expect(jobEffectiveProduces(s, 'hunter').food).toBeCloseTo(0.3, 6);
    expect(jobEffectiveProduces(s, 'hunter').furs).toBeCloseTo(0.15, 6);
  });

  it('components accumulate on a tick and are capped at 200', () => {
    const s = newGame(1);
    s.run.tech.push('animal-husbandry', 'alchemy');
    s.run.resources.wood = 500;
    s.run.resources.stone = 500;
    build(s, 'ranch');
    runProduction(s, 100); // 0.05/s × 100s
    expect(s.run.resources.alchemical).toBeCloseTo(5, 6);
    s.run.resources.alchemical = 10_000;
    runProduction(s, 1);
    expect(s.run.resources.alchemical).toBe(200);
  });

  it('the Ranch stores nothing and the Library shelves only research', () => {
    const s = newGame(1);
    s.run.tech.push('animal-husbandry', 'writing');
    s.run.resources.wood = 500;
    s.run.resources.stone = 500;
    const before = { ...s.run.caps };
    expect(build(s, 'ranch')).toBe(true);
    expect(s.run.caps).toEqual(before);
    expect(build(s, 'library')).toBe(true);
    expect(s.run.caps).toEqual(before); // research is a DERIVED cap, not a stored one
    expect(effectsFor(s, 'library')).toContain('+50 Research cap');
  });
});

describe("the Hunter's Lodge stores only what it brings home", () => {
  it('raises the food and furs caps by 100 each, and nothing else', () => {
    const s = newGame(1);
    s.run.tech.push('archery');
    s.run.resources.wood = 500;
    const before = { ...s.run.caps };
    expect(build(s, 'hunters-lodge')).toBe(true);
    expect(s.run.caps.food).toBe(before.food + 100);
    expect(s.run.caps.furs).toBe(before.furs + 100);
    // Every other ceiling is untouched — a Lodge is not a general store.
    for (const id of Object.keys(before) as (keyof typeof before)[]) {
      if (id === 'food' || id === 'furs') continue;
      expect(s.run.caps[id], `${id} should be untouched`).toBe(before[id]);
    }
    const fx = effectsFor(s, 'hunters-lodge');
    expect(fx).toContain('+100 Food storage');
    expect(fx).toContain('+100 Furs storage');
    expect(fx).toContain('+1 Hunter job');
  });
});

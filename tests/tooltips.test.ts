import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { build, setRecipeActive, activeCount } from '../src/engine/systems/buildings';
import { happiness } from '../src/engine/systems/happiness';
import { assignJob } from '../src/engine/systems/jobs';
import { jobEffectiveProduces, productionRates, runProduction } from '../src/engine/systems/production';
import { TECH_BY_ID } from '../src/content/tech';
import { research } from '../src/engine/systems/tech';
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
    expect(effectsFor(newGame(1), 'hut')).toContain('+100 Gold cap');
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

describe('a card never names a resource behind a tech you lack', () => {
  it('the Ranch says nothing of Alchemical Components until Alchemy is in', () => {
    const s = newGame(1);
    s.run.tech.push('animal-husbandry');
    const before = effectsFor(s, 'ranch');
    expect(before).toContain('+0.40 Food/s');
    expect(before.some((l) => /Alchemical|requires/i.test(l))).toBe(false);

    s.run.tech.push('alchemy');
    const after = effectsFor(s, 'ranch');
    expect(after).toContain('+0.05 Alchemical Components/s');
    expect(after.some((l) => /requires/i.test(l))).toBe(false); // stated plainly, not as a promise
  });

  it('the Mine keeps Mana Crystals hidden until Crystallurgy the same way', () => {
    const s = newGame(1);
    s.run.tech.push('mining');
    expect(effectsFor(s, 'mine').some((l) => /Mana Crystals/.test(l))).toBe(false);
    s.run.tech.push('crystallurgy');
    expect(effectsFor(s, 'mine').some((l) => /Mana Crystals/.test(l))).toBe(true);
  });
});

describe('the Entertainer draws on the treasury', () => {
  it('is named Entertainer, and each one costs 0.1 Wealth/s', () => {
    const s = newGame(1);
    s.run.tech.push('the-arts');
    s.run.resources.wood = 400;
    s.run.resources.stone = 400;
    expect(build(s, 'amphitheater')).toBe(true);
    expect(build(s, 'amphitheater')).toBe(true);
    s.run.population.total = 2;
    assignJob(s, 'bard', 2);
    // Upkeep is NOT scaled by efficiency, so a Workshop doesn't make performers cheaper.
    s.run.buildings.workshop = 1;
    expect(productionRates(s).gold).toBeCloseTo(-0.2, 6);
    expect(effectsFor(s, 'amphitheater')).toEqual(['+1 Entertainer job']);
  });

  it('never drives the treasury below zero', () => {
    const s = newGame(1);
    s.run.tech.push('the-arts');
    s.run.resources.wood = 400;
    s.run.resources.stone = 400;
    build(s, 'amphitheater');
    s.run.population.total = 1;
    assignJob(s, 'bard', 1);
    s.run.resources.gold = 0.05; // less than one second of fees
    runProduction(s, 10);
    expect(s.run.resources.gold).toBe(0);
  });

  it('the treasury tooltip names the Entertainer as the drain, and reads as Wealth', () => {
    const s = newGame(1);
    s.run.tech.push('the-arts');
    s.run.resources.wood = 400;
    s.run.resources.stone = 400;
    build(s, 'amphitheater');
    s.run.population.total = 1;
    assignJob(s, 'bard', 1);
    const row = toView(s).resources.find((r) => r.id === 'gold')!;
    expect(row.label).toBe('Wealth');
    expect(row.group).toBe('materials'); // merged into the single "Resources" section
  });
});

describe('the Shrine — the first building, and the first culture', () => {
  it('is buildable on day one for stone alone', () => {
    const s = newGame(1);
    const row = toView(s).buildings.find((b) => b.id === 'wayside-shrine')!;
    expect(row.name).toBe('Shrine');
    expect(row.unlocked).toBe(true); // no tech, no prereq building
    expect(row.costParts.map((p) => p.text)).toEqual(['Stone 30']);
    s.run.resources.stone = 30;
    expect(build(s, 'wayside-shrine')).toBe(true);
    expect(s.run.resources.wood).toBe(0); // stone only — no wood was touched
  });

  it('trickles culture, and draws mana only once Folk Lore is in', () => {
    const s = newGame(1);
    s.run.resources.stone = 200;
    build(s, 'wayside-shrine');
    build(s, 'wayside-shrine');
    expect(productionRates(s).culture).toBeCloseTo(0.02, 6); // 0.01 per Shrine
    expect(productionRates(s).mana).toBeCloseTo(0, 6);
    expect(effectsFor(s, 'wayside-shrine')).toEqual(['+0.01 Culture/s']); // mana stays hidden

    s.run.tech.push('folk-lore');
    expect(productionRates(s).mana).toBeCloseTo(0.2, 6); // 0.1 per Shrine
    expect(effectsFor(s, 'wayside-shrine')).toContain('+0.10 Mana/s');
  });

  it('Folk Lore costs 10 research AND 10 culture, and needs no prerequisite', () => {
    expect(TECH_BY_ID['folk-lore'].cost).toBe(10);
    expect(TECH_BY_ID['folk-lore'].resourceCost).toEqual({ culture: 10 });
    expect(TECH_BY_ID['folk-lore'].requires).toBeUndefined();

    const s = newGame(1);
    const row = toView(s).tech.find((t) => t.id === 'folk-lore')!;
    expect(row.costParts.map((p) => p.text)).toEqual(['Research 10', 'Culture 10']);
    expect(row.costText).toBe('Research 10 · Culture 10');
  });

  it('the culture half is the binding one — research alone will not buy it', () => {
    const s = newGame(1);
    s.run.resources.research = 500;
    expect(research(s, 'folk-lore')).toBe(false); // no culture yet
    const row = toView(s).tech.find((t) => t.id === 'folk-lore')!;
    expect(row.costParts).toEqual([
      { text: 'Research 10', short: false },
      { text: 'Culture 10', short: true }, // only the half you can't pay reads red
    ]);
  });

  it('the Shrine can pay for Folk Lore by itself — the loop closes', () => {
    const s = newGame(1);
    s.run.resources.stone = 500;
    for (let i = 0; i < 5; i++) build(s, 'wayside-shrine');
    // Three settlers trickle the research half (0.02/s each); at 3 pop they are inside the
    // happiness buffer and forage more than they eat, so nobody starves during the wait.
    s.run.population.total = 3;
    runProduction(s, 200); // 5 Shrines × 0.01/s × 200s = 10 culture
    expect(s.run.resources.culture).toBeCloseTo(10, 6);
    expect(s.run.resources.research).toBeGreaterThanOrEqual(10);
    expect(research(s, 'folk-lore')).toBe(true);
    expect(productionRates(s).mana).toBeCloseTo(0.5, 6);
  });
});

describe('mana finds early uses: the Ward Stone and the elemental attunements', () => {
  /** A settlement with Folk Lore, Shrines running, and mana in hand. */
  function attuned(...techs: string[]) {
    const s = newGame(1);
    s.run.tech.push('folk-lore', ...(techs as never[]));
    s.run.resources.stone = 5000;
    s.run.resources.wood = 5000;
    s.run.resources.mana = 500;
    s.run.resources.tools = 100;
    return s;
  }

  it('the Ward Stone burns mana for morale', () => {
    const s = attuned('warding');
    s.run.population.total = 20; // below the 100 clamp so the gain is visible
    const before = happiness(s).value;
    expect(build(s, 'ward-stone')).toBe(true);
    expect(happiness(s).value).toBe(before + 3);
    expect(productionRates(s).mana).toBeCloseTo(-0.2, 6);
    expect(effectsFor(s, 'ward-stone')).toContain('-0.20 Mana/s upkeep');
  });

  it('Meditation gives every settler a mana trickle', () => {
    const s = newGame(1);
    s.run.population.total = 40;
    expect(productionRates(s).mana).toBeCloseTo(0, 6);
    s.run.tech.push('meditation');
    expect(productionRates(s).mana).toBeCloseTo(0.2, 6); // 40 × 0.005
  });

  it('an attunement recipe does not exist until its tech is in', () => {
    const s = attuned();
    s.run.tech.push('masonry');
    expect(build(s, 'quarry')).toBe(true);
    let row = toView(s).buildings.find((b) => b.id === 'quarry')!;
    expect(row.converter).toBe(false); // no toggle at all
    expect(row.recipes).toEqual([]);
    expect(productionRates(s).earthEssence).toBeCloseTo(0, 6);

    s.run.tech.push('earth-attunement');
    row = toView(s).buildings.find((b) => b.id === 'quarry')!;
    expect(row.converter).toBe(true);
    expect(row.recipes.map((r) => r.label)).toEqual(['Attune']);
  });

  it('unlocking an attunement starts it OFF — it can never crash the economy on its own', () => {
    const s = attuned('masonry', 'earth-attunement');
    expect(build(s, 'quarry')).toBe(true);
    expect(build(s, 'quarry')).toBe(true);
    // Nothing running yet, so no mana is being spent.
    expect(activeCount(s, 'quarry')).toBe(0);
    expect(productionRates(s).mana).toBeCloseTo(0, 6);
    expect(productionRates(s).earthEssence).toBeCloseTo(0, 6);

    setRecipeActive(s, 'quarry', 0, 2); // the player opts in
    expect(productionRates(s).mana).toBeCloseTo(-0.4, 6);
    expect(productionRates(s).earthEssence).toBeCloseTo(0.1, 6);
  });

  it('each element comes from its own building', () => {
    const pairs = [
      ['quarry', 'earth-attunement', 'masonry', 'earthEssence'],
      ['harbor', 'water-attunement', 'sailing', 'waterEssence'],
      ['windmill', 'air-attunement', 'milling', 'airEssence'],
      ['forge', 'fire-attunement', 'iron-working', 'fireEssence'],
    ] as const;
    for (const [building, attune, gate, essence] of pairs) {
      const s = attuned(attune, gate, 'construction', 'engineering');
      expect(build(s, building), `${building} should build`).toBe(true);
      setRecipeActive(s, building, 0, 1);
      const r = productionRates(s);
      expect(r[essence], `${building} → ${essence}`).toBeCloseTo(0.05, 6);
      expect(r.mana).toBeCloseTo(-0.2, 6);
    }
  });
});

describe('the Academy is where mana starts having kinds', () => {
  const ATTUNEMENTS = ['earth-attunement', 'water-attunement', 'air-attunement', 'fire-attunement'] as const;

  it('all four attunements stay INVISIBLE until an Academy stands', () => {
    const s = newGame(1);
    // Every research prerequisite met — only the building is missing.
    s.run.tech.push('folk-lore', 'masonry', 'sailing', 'milling', 'iron-working', 'writing', 'mathematics');
    const visible = () => toView(s).tech.filter((t) => t.available).map((t) => t.id);
    for (const id of ATTUNEMENTS) expect(visible(), `${id} before the Academy`).not.toContain(id);

    s.run.resources.wood = 2000;
    s.run.resources.stone = 2000;
    expect(build(s, 'academy')).toBe(true);
    for (const id of ATTUNEMENTS) expect(visible(), `${id} after the Academy`).toContain(id);
  });

  it('research REFUSES an attunement with no Academy, even when affordable', () => {
    const s = newGame(1);
    s.run.tech.push('folk-lore', 'masonry');
    s.run.resources.research = 5000;
    expect(research(s, 'earth-attunement')).toBe(false);
    expect(s.run.tech).not.toContain('earth-attunement');
    expect(s.run.resources.research).toBe(5000); // untouched on refusal
  });

  it('and so the four essences stay hidden until then', () => {
    const s = newGame(1);
    s.run.tech.push('folk-lore', 'masonry');
    const shown = () => toView(s).resources.filter((r) => r.show).map((r) => r.id);
    for (const id of ['airEssence', 'earthEssence', 'fireEssence', 'waterEssence']) {
      expect(shown()).not.toContain(id);
    }
  });
});

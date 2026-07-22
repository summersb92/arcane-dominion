import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { research, techView } from '../src/engine/systems/tech';
import { build } from '../src/engine/systems/buildings';
import { productionRates } from '../src/engine/systems/production';
import { TECH_BY_ID } from '../src/content/tech';
import { BUILDING_BY_ID } from '../src/content/buildings';

describe('Civ-style combination techs (two prerequisites)', () => {
  it('Mathematics / Construction / Philosophy / Sanitation each require BOTH prereqs', () => {
    expect(TECH_BY_ID.mathematics.requires).toEqual(expect.arrayContaining(['writing', 'masonry']));
    expect(TECH_BY_ID.construction.requires).toEqual(expect.arrayContaining(['masonry', 'the-wheel']));
    expect(TECH_BY_ID.philosophy.requires).toEqual(expect.arrayContaining(['writing', 'the-arts']));
    expect(TECH_BY_ID.sanitation.requires).toEqual(expect.arrayContaining(['construction', 'compendia']));
  });

  it('a combination tech is unavailable until EVERY prereq is met', () => {
    const s = newGame(1);
    s.run.tech.push('writing'); // only one of Mathematics' two prereqs
    let math = techView(s).find((t) => t.id === 'mathematics')!;
    expect(math.available).toBe(false);
    s.run.tech.push('masonry');
    math = techView(s).find((t) => t.id === 'mathematics')!;
    expect(math.available).toBe(true);
  });

  it('Mathematics unlocks the Observatory; Construction the Aqueduct', () => {
    expect(BUILDING_BY_ID.observatory.requiresTech).toBe('mathematics');
    expect(BUILDING_BY_ID.aqueduct.requiresTech).toBe('construction');
    const obsKinds = BUILDING_BY_ID.observatory.effects.map((e) => e.kind);
    expect(obsKinds).toContain('researchCap');
    const aqKinds = BUILDING_BY_ID.aqueduct.effects.map((e) => e.kind);
    expect(aqKinds).toEqual(expect.arrayContaining(['popCap', 'happiness']));
  });
});

describe('Culture-costed knowledge / art techs', () => {
  it('the book/art line spends culture as well as research', () => {
    expect(TECH_BY_ID.bookbinding.resourceCost?.culture).toBe(50);
    expect(TECH_BY_ID.compendia.resourceCost?.culture).toBe(150);
    expect(TECH_BY_ID.philosophy.resourceCost?.culture).toBe(100);
    expect(TECH_BY_ID.mysticism.resourceCost?.culture).toBe(80);
  });

  it('refuses Bookbinding without the culture, then spends it', () => {
    const s = newGame(1);
    s.run.tech.push('writing');
    s.run.resources.research = 1000;
    s.run.resources.culture = 0;
    expect(research(s, 'bookbinding')).toBe(false); // no culture
    s.run.resources.culture = 50;
    expect(research(s, 'bookbinding')).toBe(true);
    expect(s.run.resources.culture).toBe(0);
    expect(s.run.resources.research).toBe(100); // 1000 − 900
  });
});

describe('Magic techs are gated behind discovering magic (requiresFlag) and cost mana', () => {
  it('Druidry needs the magicDiscovered flag even with prereqs + resources', () => {
    expect(TECH_BY_ID.druidry.requiresFlag).toBe('magicDiscovered');
    expect(TECH_BY_ID.druidry.resourceCost?.mana).toBe(120);

    const s = newGame(1);
    s.run.tech.push('naturalism', 'mysticism');
    s.run.resources.research = 3000;
    s.run.resources.mana = 300;

    // Prereq techs are met, but magic hasn't been discovered → unavailable.
    expect(techView(s).find((t) => t.id === 'druidry')!.available).toBe(false);
    expect(research(s, 'druidry')).toBe(false);

    // Discover magic → now researchable, spending research + mana.
    s.run.flags.magicDiscovered = true;
    expect(techView(s).find((t) => t.id === 'druidry')!.available).toBe(true);
    expect(research(s, 'druidry')).toBe(true);
    expect(s.run.resources.mana).toBe(180); // 300 − 120
    expect(s.run.tech).toContain('druidry');
  });

  it('the crystal line (Enchantment → Runecraft) is flag-gated and mana-costed', () => {
    expect(TECH_BY_ID.enchantment.requiresFlag).toBe('magicDiscovered');
    expect(TECH_BY_ID.runecraft.requiresFlag).toBe('magicDiscovered');
    expect(TECH_BY_ID.enchantment.requires).toContain('crystallurgy');
    expect(TECH_BY_ID.runecraft.requires).toContain('enchantment');
  });

  it('nature + crystal magic buildings are gated by their techs and run without settlers', () => {
    // Ley Grove (Druidry) — passive mana.
    const s = newGame(1);
    s.run.flags.magicDiscovered = true;
    s.run.tech.push('druidry');
    s.run.resources.wood = 200;
    s.run.resources.stone = 200;
    expect(build(s, 'ley-grove')).toBe(true);
    expect(productionRates(s).mana).toBeCloseTo(0.6, 6); // no settlers needed

    // Golem Works (Enchantment) — mines iron + stone on mana upkeep, no settlers.
    const g = newGame(2);
    g.run.flags.magicDiscovered = true;
    g.run.tech.push('enchantment');
    g.run.resources.stone = 200;
    g.run.resources.manaCrystals = 50;
    g.run.resources.mana = 100;
    expect(build(g, 'golem-works')).toBe(true);
    expect(productionRates(g).iron).toBeCloseTo(0.4, 6);
    expect(productionRates(g).stone).toBeCloseTo(0.4, 6);
    expect(productionRates(g).mana).toBeCloseTo(-0.3, 6); // mana upkeep
  });
});

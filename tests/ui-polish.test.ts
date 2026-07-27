import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { build, buildingsView } from '../src/engine/systems/buildings';
import { assignJob } from '../src/engine/systems/jobs';
import { jobEffectiveProduces, runProduction } from '../src/engine/systems/production';
import { BUILDINGS } from '../src/content/buildings';
import { RESOURCES } from '../src/content/resources';
import { dateAt, calendar } from '../src/engine/systems/calendar';

describe('build-tab categories', () => {
  it('every building carries a category; constructs are all "arcane"', () => {
    const valid = ['housing', 'storage', 'production', 'science', 'civic', 'industry', 'arcane'];
    for (const b of BUILDINGS) {
      expect(valid, `${b.id} has an unknown category`).toContain(b.category);
      if (b.construct) expect(b.category, `${b.id} is a construct`).toBe('arcane');
    }
  });

  it('the buildings view exposes the category', () => {
    const s = newGame(1);
    const rows = buildingsView(s);
    expect(rows.find((r) => r.id === 'hut')!.category).toBe('housing');
    expect(rows.find((r) => r.id === 'steelworks')!.category).toBe('industry');
  });
});

describe('resource display groups', () => {
  it('every resource carries a display group', () => {
    const valid = ['materials', 'goods', 'wealth', 'knowledge', 'magic', 'prismatic'];
    for (const r of RESOURCES) expect(valid, `${r.id} has an unknown group`).toContain(r.group);
  });
});

describe('blurbs are flavor-only (no hardcoded rates or stat dumps)', () => {
  it('no building blurb contains a per-second rate, a +N stat, or shouting caps', () => {
    for (const b of BUILDINGS) {
      expect(b.blurb, `${b.id} blurb hardcodes a rate`).not.toMatch(/\/s/);
      expect(b.blurb, `${b.id} blurb hardcodes a stat bump`).not.toMatch(/\+\d/);
      expect(b.blurb, `${b.id} blurb shouts`).not.toMatch(/\b(ACTIVE|EVERY|NO|EXCEPT|HELD|MECHANIZATION)\b/);
    }
  });
});

describe('recipe view carries per-copy rates', () => {
  it('the Steelworks recipes expose consume/produce for the toggle tooltips', () => {
    const s = newGame(1);
    s.run.buildings.steelworks = 1;
    const row = buildingsView(s).find((r) => r.id === 'steelworks')!;
    expect(row.recipes.length).toBe(2);
    expect(row.recipes[0].label).toBe('Wood');
    expect(row.recipes[0].consume.wood).toBeCloseTo(0.3, 6);
    expect(row.recipes[0].produce.steel).toBeCloseTo(0.2, 6);
    expect(row.recipes[1].label).toBe('Coal');
    expect(row.recipes[1].produce.steel).toBeCloseTo(0.3, 6);
    expect(row.recipes[1].requiresWorker).toBe('smelter');
  });
});

describe('effective job rates (the tooltip no longer lies)', () => {
  it('jobEffectiveProduces reflects tool techs and the Workshop', () => {
    const s = newGame(1);
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(0.5, 6);
    s.run.tech.push('stone-axe'); // +25%
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(0.625, 6);
    s.run.buildings.workshop = 1; // +10% global
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(0.5 * 1.25 * 1.1, 6);
  });
});

describe('chronicle stamps read as in-world dates', () => {
  // 2s per day, 100 days per season, 4 seasons per year → 200s a season, 800s a year.
  it('dateAt maps a PAST playtime to its season and year', () => {
    expect(dateAt(0)).toMatchObject({ season: 'Spring', year: 1, day: 1 });
    expect(dateAt(199)).toMatchObject({ season: 'Spring', year: 1, day: 100 });
    expect(dateAt(200)).toMatchObject({ season: 'Summer', year: 1, day: 1 });
    expect(dateAt(600)).toMatchObject({ season: 'Winter', year: 1 });
    expect(dateAt(800)).toMatchObject({ season: 'Spring', year: 2, day: 1 });
    expect(dateAt(-50)).toMatchObject({ season: 'Spring', year: 1 }); // clamped, never negative
  });

  it('calendar() still reports the live date and the tech gate', () => {
    const s = newGame(1);
    s.playtime = 1000; // Summer, year 2
    expect(calendar(s)).toMatchObject({ unlocked: false, season: 'Summer', year: 2 });
    s.run.tech.push('calendar');
    expect(calendar(s).unlocked).toBe(true);
  });

  it('an entry keeps the date it was logged at, not the current one', () => {
    const s = newGame(1);
    s.playtime = 250; // Summer Y1
    s.run.resources.wood = 100;
    build(s, 'hut');
    const at = s.run.chronicle[s.run.chronicle.length - 1].at;
    s.playtime = 2000; // much later — the stamp must not drift
    expect(dateAt(at)).toMatchObject({ season: 'Summer', year: 1 });
  });
});

describe('chronicle quips', () => {
  it('the FIRST copy of a building logs a story beat; the second logs a plain receipt', () => {
    const s = newGame(1);
    s.run.resources.wood = 100;
    expect(build(s, 'hut')).toBe(true);
    expect(s.run.chronicle.some((c) => c.text.includes('It leans, but it stands'))).toBe(true);
    expect(build(s, 'hut')).toBe(true);
    expect(s.run.chronicle.filter((c) => c.text === 'Built House.').length).toBe(1);
  });

  it('population milestones log once (10 settlers)', () => {
    const s = newGame(1);
    s.run.popCap = 12;
    s.run.population.total = 9;
    s.run.resources.food = 500;
    s.run.buildings['forager-hut'] = 3;
    s.run.tech.push('agriculture');
    assignJob(s, 'forager', 3);
    simulate(s, 30); // grows past 10
    expect(s.run.population.total).toBeGreaterThanOrEqual(10);
    const beats = s.run.chronicle.filter((c) => c.text.includes('calling itself a village'));
    expect(beats.length).toBe(1);
  });

  it('the first famine logs a once-only beat', () => {
    const s = newGame(1);
    s.run.resources.wood = 200;
    build(s, 'woodcutters-lodge');
    build(s, 'woodcutters-lodge');
    build(s, 'woodcutters-lodge');
    s.run.population.total = 3;
    assignJob(s, 'woodcutter', 3); // employed, so nobody forages the famine away
    s.run.resources.food = 0.1;
    runProduction(s, 10); // food runs out → starving
    runProduction(s, 10); // still starving — no duplicate beat
    const beats = s.run.chronicle.filter((c) => c.text.includes('suddenly very loud'));
    expect(beats.length).toBe(1);
  });

  it('resource firsts log once (coal)', () => {
    const s = newGame(1);
    s.run.tech.push('coal-mining');
    s.run.buildings['charcoal-ground'] = 1;
    s.run.resources.wood = 100;
    simulate(s, 2);
    simulate(s, 2);
    const beats = s.run.chronicle.filter((c) => c.text.includes('Coal catches'));
    expect(beats.length).toBe(1);
  });

  it('opening lines rotate by seed but stay deterministic', () => {
    const a1 = newGame(1).run.chronicle[0].text;
    const a2 = newGame(1).run.chronicle[0].text;
    expect(a2).toBe(a1); // same seed → same opening
    const openings = new Set([1, 2, 3, 4, 5, 6].map((seed) => newGame(seed).run.chronicle[0].text));
    expect(openings.size).toBeGreaterThan(1); // different seeds → different openings
  });
});

import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { build, buildingCost } from '../src/engine/systems/buildings';
import { assignJob } from '../src/engine/systems/jobs';
import { jobEffectiveProduces, resourceBreakdown } from '../src/engine/systems/production';
import { foodAllowsGrowth, growthStatus } from '../src/engine/systems/population';
import { happiness } from '../src/engine/systems/happiness';
import { seasonFoodMult, foodEnvMult, weather, weatherAt } from '../src/engine/systems/weather';
import { CALENDAR, SEASON, WEATHER } from '../src/content/config';
import { toView } from '../src/ui/stores';
import { BUILDING_BY_ID } from '../src/content/buildings';
import { JOB_BY_ID } from '../src/content/jobs';

/** Seconds of playtime that land inside season `i` (0 = Spring … 3 = Winter). */
const intoSeason = (i: number): number => i * CALENDAR.daysPerSeason * CALENDAR.daySeconds + 10;

describe('seasons scale food production', () => {
  it('Spring lifts every food source; Summer and Autumn are neutral', () => {
    const s = newGame(1);
    s.playtime = intoSeason(0);
    expect(seasonFoodMult(s)).toBe(SEASON.springFoodMult);
    expect(seasonFoodMult(s, true)).toBe(SEASON.springFoodMult); // Hunters share the bounty

    s.playtime = intoSeason(1);
    expect(seasonFoodMult(s)).toBe(1);
    s.playtime = intoSeason(2);
    expect(seasonFoodMult(s)).toBe(1);
  });

  it('Winter halves the fields but never the woods — Hunters are exempt', () => {
    const s = newGame(1);
    s.playtime = intoSeason(3);
    expect(seasonFoodMult(s)).toBe(SEASON.winterFoodMult);
    expect(seasonFoodMult(s, true)).toBe(1);

    // And that exemption reaches actual output, not just the multiplier helper.
    const farmerRatio = jobEffectiveProduces(s, 'forager').food! / JOB_BY_ID.forager.produces.food!;
    const hunterRatio = jobEffectiveProduces(s, 'hunter').food! / JOB_BY_ID.hunter.produces.food!;
    expect(hunterRatio / farmerRatio).toBeCloseTo(1 / SEASON.winterFoodMult, 6);
  });

  it('only FOOD is weather-bound — a quarry does not care what the sky is doing', () => {
    const s = newGame(1);
    s.playtime = intoSeason(3); // the harshest season
    expect(jobEffectiveProduces(s, 'woodcutter').wood).toBeCloseTo(1, 6);
    expect(jobEffectiveProduces(s, 'quarry-worker').stone).toBeCloseTo(1, 6);
    expect(jobEffectiveProduces(s, 'miner').iron).toBeCloseTo(0.4, 6);
  });
});

describe('weather is a short, deterministic spell', () => {
  it('is a 5% step no larger than ±15%, and the same for the same seed', () => {
    for (const seed of [1, 2, 3, 7, 42, 1234, 99999]) {
      const w = weatherAt(seed, 0);
      expect(WEATHER.steps).toContain(w.swing);
      expect(Math.abs(w.swing)).toBeLessThanOrEqual(0.15);
      expect(weatherAt(seed, 0).swing).toBe(w.swing); // pure — no hidden state
    }
  });

  it('holds for a whole period, then may turn', () => {
    const dayLen = CALENDAR.daySeconds;
    const periodLen = WEATHER.periodDays * dayLen;
    const first = weatherAt(1, 0);
    expect(weatherAt(1, periodLen - dayLen).period).toBe(first.period);
    expect(weatherAt(1, periodLen - dayLen).swing).toBe(first.swing);
    expect(weatherAt(1, periodLen).period).toBe(first.period + 1);
  });

  it('is fair far more often than not', () => {
    // The whole point of the weighted table: extremes are an event, not the baseline.
    let fair = 0;
    for (let seed = 0; seed < 400; seed++) if (weatherAt(seed, 0).swing === 0) fair++;
    expect(fair / 400).toBeGreaterThan(0.45);
  });

  it('composes with the season into one food multiplier', () => {
    const s = newGame(1);
    s.playtime = intoSeason(0);
    expect(foodEnvMult(s)).toBeCloseTo(SEASON.springFoodMult * (1 + weather(s).swing), 9);
    s.playtime = intoSeason(3);
    expect(foodEnvMult(s, true)).toBeCloseTo(1 * (1 + weather(s).swing), 9);
  });

  it('shows up in the Food tooltip as named multiplier lines', () => {
    const s = newGame(1);
    s.playtime = intoSeason(0);
    s.run.buildings['forager-hut'] = 1;
    s.run.population.total = 1;
    assignJob(s, 'forager', 1);
    const bd = resourceBreakdown(s, 'food');
    expect(bd.producerMults.some((m) => m.label === 'Spring')).toBe(true);
    // And the producer figures still add up to the net, multipliers included.
    const sum = bd.producers.reduce((n, p) => n + p.amount, 0) + bd.consumers.reduce((n, c) => n + c.amount, 0);
    expect(sum).toBeCloseTo(bd.net, 6);
  });
});

describe('the Food row wears its season', () => {
  const foodMod = (playtime: number) => {
    const s = newGame(1);
    s.playtime = playtime;
    return toView(s).resources.find((r) => r.id === 'food')!.mod;
  };

  it('brackets the modifier in the seasons that move the number', () => {
    expect(foodMod(intoSeason(0))?.text).toBe('+50%'); // Spring
    expect(foodMod(intoSeason(3))?.text).toBe('-50%'); // Winter
  });

  it('shows nothing at all in the seasons that do not', () => {
    expect(foodMod(intoSeason(1))).toBeUndefined(); // Summer
    expect(foodMod(intoSeason(2))).toBeUndefined(); // Autumn
  });

  it('reads as a gain in Spring and a loss in Winter, and says Hunters are spared', () => {
    expect(foodMod(intoSeason(0))!.good).toBe(true);
    const winter = foodMod(intoSeason(3))!;
    expect(winter.good).toBe(false);
    expect(winter.title).toMatch(/Hunters are unaffected/);
  });

  it('is a FOOD affair — no other resource carries one', () => {
    const s = newGame(1);
    s.playtime = intoSeason(3); // the season with the loudest modifier
    for (const r of toView(s).resources) {
      if (r.id !== 'food') expect(r.mod, r.id).toBeUndefined();
    }
  });
});

describe('a deep granary keeps the settlement growing', () => {
  /** Housing, food in the barn, and the only settler off cutting timber — so nobody is
   *  foraging and net food is firmly negative (4/s of upkeep against no income). */
  function hungryButStocked(fraction: number) {
    const s = newGame(1);
    s.run.buildings.hut = 10;
    s.run.popCap = 10;
    s.run.buildings['woodcutters-lodge'] = 1;
    s.run.population.total = 1;
    assignJob(s, 'woodcutter', 1);
    s.run.resources.food = s.run.caps.food * fraction;
    return s;
  }

  it('grows on a negative rate while the store is at or above a quarter full', () => {
    const s = hungryButStocked(0.5);
    expect(foodAllowsGrowth(s)).toBe(true);
    expect(growthStatus(s).status).toBe('growing');
  });

  it('stalls once the reserve is spent below the threshold', () => {
    const s = hungryButStocked(0.1);
    expect(foodAllowsGrowth(s)).toBe(false);
    expect(growthStatus(s).status).toBe('stalled');
  });

  it('a surplus still grows regardless of how full the barn is', () => {
    const s = newGame(1);
    s.run.buildings.hut = 10;
    s.run.popCap = 10;
    s.run.buildings['forager-hut'] = 5;
    s.run.population.total = 1;
    assignJob(s, 'forager', 1); // 6/s × environment vs 4/s upkeep
    s.run.resources.food = 1;
    expect(foodAllowsGrowth(s)).toBe(true);
  });
});

describe('luxuries are a per-head comfort', () => {
  it('a bigger settlement needs proportionally more of a luxury for the same lift', () => {
    const small = newGame(1);
    small.run.population.total = 10; // at the baseline → 10 furs per point
    small.run.resources.furs = 50;
    const smallFurs = happiness(small).breakdown.find((b) => b.label.startsWith('Furs'))!;
    expect(smallFurs.amount).toBe(5);

    const big = newGame(1);
    big.run.population.total = 40; // 4× the baseline → 40 furs per point
    big.run.resources.furs = 50;
    const bigFurs = happiness(big).breakdown.find((b) => b.label.startsWith('Furs'))!;
    expect(bigFurs.amount).toBe(1);
  });

  it('flags a luxury that is too thin to pay its full bonus', () => {
    const s = newGame(1);
    s.run.population.total = 10;
    s.run.resources.furs = 50; // +5 of a possible +15
    expect(happiness(s).breakdown.find((b) => b.label.startsWith('Furs'))!.short).toBe(true);

    s.run.resources.furs = 1000; // enough to max it out
    expect(happiness(s).breakdown.find((b) => b.label.startsWith('Furs'))!.short).toBe(false);
  });
});

describe('a building whose price changes in KIND partway up the ladder', () => {
  it('the Ward Stone asks for iron only from the sixth copy on', () => {
    const s = newGame(1);
    s.run.tech.push('warding');
    expect(buildingCost(s, 'ward-stone').iron).toBeUndefined();

    s.run.buildings['ward-stone'] = 4;
    expect(buildingCost(s, 'ward-stone').iron).toBeUndefined(); // the fifth is still plain stone

    s.run.buildings['ward-stone'] = 5;
    const sixth = buildingCost(s, 'ward-stone');
    expect(sixth.iron).toBe(BUILDING_BY_ID['ward-stone'].extraCostAfter!.cost.iron);

    // …and the extra escalates from there, like every other cost.
    s.run.buildings['ward-stone'] = 6;
    expect(buildingCost(s, 'ward-stone').iron!).toBeGreaterThan(sixth.iron!);
  });

  it('refuses the sixth Ward Stone without the iron, and allows it with', () => {
    const s = newGame(1);
    s.run.tech.push('warding');
    s.run.buildings['ward-stone'] = 5;
    s.run.resources.stone = 100_000;
    expect(build(s, 'ward-stone')).toBe(false);
    s.run.resources.iron = 100;
    expect(build(s, 'ward-stone')).toBe(true);
  });
});

describe('the chronicle reports seasons, not receipts', () => {
  it('logs nothing for a repeat build and nothing for an ordinary settler', () => {
    const s = newGame(1);
    s.run.resources.wood = 100_000;
    build(s, 'hut');
    build(s, 'hut');
    build(s, 'hut');
    expect(s.run.chronicle.filter((c) => c.text.startsWith('Built '))).toHaveLength(0);
    expect(s.run.chronicle.filter((c) => c.text.includes('A new settler arrives'))).toHaveLength(0);
  });

  it('rolls births and deaths into one line when the season turns', () => {
    const s = newGame(1);
    s.run.buildings.hut = 20;
    s.run.popCap = 20;
    s.run.buildings['forager-hut'] = 20;
    s.run.resources.food = s.run.caps.food;
    // Run past the first season boundary — settlers arrive throughout.
    simulate(s, CALENDAR.daysPerSeason * CALENDAR.daySeconds + 5);
    expect(s.run.population.total).toBeGreaterThan(0);
    const roll = s.run.chronicle.filter((c) => /^Spring ends:/.test(c.text));
    expect(roll).toHaveLength(1);
    expect(roll[0].text).toMatch(/settlers? born/);
    // The tally resets for the new season.
    expect(s.run.seasonTally.index).toBe(1);
  });

  it('writes the dated divider only once a Calendar is kept', () => {
    const noCal = newGame(1);
    simulate(noCal, CALENDAR.daysPerSeason * CALENDAR.daySeconds + 5);
    expect(noCal.run.chronicle.some((c) => c.kind === 'season')).toBe(false);

    const withCal = newGame(1);
    withCal.run.tech.push('calendar');
    simulate(withCal, CALENDAR.daysPerSeason * CALENDAR.daySeconds + 5);
    const dividers = withCal.run.chronicle.filter((c) => c.kind === 'season');
    expect(dividers).toHaveLength(1);
    expect(dividers[0].text).toBe('Summer, Year 1');
  });

  it('reports every season an offline catch-up crossed, not just the last', () => {
    const s = newGame(1);
    s.run.tech.push('calendar');
    const year = CALENDAR.daysPerSeason * CALENDAR.daySeconds * CALENDAR.seasons.length;
    simulate(s, year + 5);
    const dividers = s.run.chronicle.filter((c) => c.kind === 'season').map((c) => c.text);
    expect(dividers).toEqual(['Summer, Year 1', 'Autumn, Year 1', 'Winter, Year 1', 'Spring, Year 2']);
  });
});

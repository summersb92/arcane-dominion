import { describe, it, expect } from 'vitest';
import { reveal } from './helpers';
import { newGame, SAVE_VERSION } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { assignJob, unassignJob, refillVacancy, removeCitizen } from '../src/engine/systems/jobs';
import { foodAllowsGrowth, growthStatus, runPopulation } from '../src/engine/systems/population';
import { safeLoad, SAVE_MAGIC } from '../src/engine/save';

/** A settlement with room, workplaces, and nobody idle. */
function staffed() {
  const s = reveal(newGame(1), 'woodcutters-lodge');
  s.run.buildings.hut = 20;
  s.run.popCap = 20;
  s.run.buildings['forager-hut'] = 3;
  s.run.buildings['woodcutters-lodge'] = 3;
  s.run.buildings['hunters-lodge'] = 3;
  s.run.tech.push('archery');
  s.run.population.total = 3;
  assignJob(s, 'forager', 1);
  assignJob(s, 'hunter', 1);
  assignJob(s, 'woodcutter', 1);
  return s;
}

describe('the settlement remembers the work its dead were doing', () => {
  it('records the post a starved citizen is pulled from', () => {
    const s = staffed();
    expect(s.run.vacancies).toEqual({});
    expect(removeCitizen(s)).toBe(true);
    // Exactly one post opened, and the workforce shrank by one.
    const total = Object.values(s.run.vacancies).reduce((n, v) => n + (v ?? 0), 0);
    expect(total).toBe(1);
    expect(s.run.population.total).toBe(2);
  });

  it('remembers nothing when the citizen who died was idle', () => {
    const s = staffed();
    s.run.population.total = 4; // a fourth citizen, unassigned
    expect(removeCitizen(s)).toBe(true);
    expect(s.run.vacancies).toEqual({}); // an idle death costs the settlement no work
    expect(s.run.population.total).toBe(3);
  });

  it('deliberately unassigning someone is a decision, not a vacancy', () => {
    const s = staffed();
    expect(unassignJob(s, 'woodcutter', 1)).toBe(1);
    expect(s.run.vacancies).toEqual({});
  });
});

describe('returning citizens are put back to work, food first', () => {
  it('fills the Farm before the Hunt, and the Hunt before the woodpile', () => {
    const s = staffed();
    // Empty every post: three deaths with nobody idle.
    removeCitizen(s);
    removeCitizen(s);
    removeCitizen(s);
    expect(s.run.population.total).toBe(0);
    expect(s.run.vacancies).toEqual({ forager: 1, hunter: 1, woodcutter: 1 });

    const order: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      s.run.population.total += 1;
      order.push(refillVacancy(s));
    }
    // Farmer (6 food) outranks Hunter (0.3 food), which outranks work that feeds nobody.
    expect(order).toEqual(['forager', 'hunter', 'woodcutter']);
    expect(s.run.vacancies).toEqual({});
  });

  it('does nothing when there is no idle citizen to place', () => {
    const s = staffed();
    removeCitizen(s); // opens a post
    expect(refillVacancy(s)).toBeNull(); // everyone left is already working
  });

  it('forgets a post there is no longer room for', () => {
    const s = staffed();
    removeCitizen(s);
    const [job] = Object.keys(s.run.vacancies);
    s.run.buildings['forager-hut'] = 0;
    s.run.buildings['woodcutters-lodge'] = 0;
    s.run.buildings['hunters-lodge'] = 0; // every workplace gone
    s.run.population.total += 1;
    expect(refillVacancy(s)).toBeNull();
    expect(s.run.vacancies[job as never]).toBeUndefined(); // dropped, not left blocking
  });

  it('staffing a post by hand settles the debt to it', () => {
    const s = staffed();
    removeCitizen(s);
    const [job] = Object.keys(s.run.vacancies) as ('forager' | 'hunter' | 'woodcutter')[];
    s.run.population.total += 1;
    expect(assignJob(s, job, 1)).toBe(1);
    expect(s.run.vacancies[job]).toBeUndefined(); // not still queued for a later arrival
  });

  it('rebuilds the same shape across a real famine and recovery', () => {
    const s = staffed();
    s.run.resources.food = 0.1; // the famine
    simulate(s, 60);
    expect(s.run.population.total).toBeLessThan(3);

    s.run.resources.food = s.run.caps.food; // the harvest that ends it
    simulate(s, 120);
    // Whoever came back went to the fields first, not the forest.
    expect(s.run.population.jobs.forager).toBeGreaterThan(0);
  });
});

describe('an empty camp can always draw its first citizen', () => {
  it('grows from zero even with an empty larder and no production at all', () => {
    const s = newGame(1);
    s.run.buildings.hut = 1;
    s.run.popCap = 1;
    s.run.resources.food = 0; // nothing stored, nobody to farm, no way back otherwise
    expect(foodAllowsGrowth(s)).toBe(true);
    expect(growthStatus(s).status).toBe('growing');

    simulate(s, 30);
    expect(s.run.population.total).toBe(1);
  });

  it('still needs somewhere for them to live', () => {
    const s = newGame(1);
    s.run.popCap = 0; // no housing
    s.run.resources.food = 0;
    runPopulation(s, 60);
    expect(s.run.population.total).toBe(0);
  });

  it('goes back to needing food the moment someone lives there', () => {
    const s = newGame(1);
    s.run.buildings.hut = 5;
    s.run.popCap = 5;
    s.run.population.total = 1;
    s.run.buildings['woodcutters-lodge'] = 1;
    assignJob(s, 'woodcutter', 1); // employed, so nobody forages
    s.run.resources.food = 0;
    expect(foodAllowsGrowth(s)).toBe(false);
  });
});

describe('save compatibility', () => {
  it('backfills vacancies on a v15 save', () => {
    const s = newGame(1);
    const raw = JSON.parse(JSON.stringify({ magic: SAVE_MAGIC, version: 15, state: s }));
    delete raw.state.run.vacancies;
    const res = safeLoad(JSON.stringify(raw));
    expect(res.ok).toBe(true);
    expect(res.state!.version).toBe(SAVE_VERSION);
    expect(res.state!.run.vacancies).toEqual({});
  });

  it('drops garbage entries rather than loading them', () => {
    const s = newGame(1);
    s.run.vacancies = { forager: 2, woodcutter: 0, hunter: NaN } as never;
    const res = safeLoad(JSON.stringify({ magic: SAVE_MAGIC, version: SAVE_VERSION, state: s }));
    expect(res.ok).toBe(true);
    expect(res.state!.run.vacancies).toEqual({ forager: 2 });
  });
});

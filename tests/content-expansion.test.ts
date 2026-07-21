import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { JOB_BY_ID } from '../src/content/jobs';
import { BUILDING_BY_ID } from '../src/content/buildings';
import { TECH_BY_ID } from '../src/content/tech';
import { build } from '../src/engine/systems/buildings';
import { assignJob, jobCapacity } from '../src/engine/systems/jobs';
import { techView } from '../src/engine/systems/tech';
import { productionRates } from '../src/engine/systems/production';
import { THEMES, isThemeId } from '../src/content/themes';

describe('renames (display names change, ids preserved)', () => {
  it('renames the House, Farm, Farmer and Stonecutter while keeping ids', () => {
    expect(BUILDING_BY_ID.hut.name).toBe('House');
    expect(BUILDING_BY_ID['forager-hut'].name).toBe('Farm');
    expect(JOB_BY_ID.forager.name).toBe('Farmer');
    expect(JOB_BY_ID['quarry-worker'].name).toBe('Stonecutter');
  });
});

describe('Library is the single science building (Scholar\'s Study merged in)', () => {
  it('has no scholars-study; the Library is the Scholar workplace, gated by Writing', () => {
    // The old Scholar's Study id is gone entirely.
    expect(BUILDING_BY_ID['scholars-study' as never]).toBeUndefined();
    // The Library keeps the science role: Scholar slots, passive research, research cap.
    expect(BUILDING_BY_ID.library.requiresTech).toBe('writing');
    expect(JOB_BY_ID.scholar.requiresBuildingCapacity).toBe('library');
    const kinds = BUILDING_BY_ID.library.effects.map((e) => e.kind);
    expect(kinds).toContain('jobCapacity');
    expect(kinds).toContain('produce');
    expect(kinds).toContain('researchCap');
  });
});

describe('Sleek Dark theme registration', () => {
  it('registers "sleek-dark" (label "Sleek Dark") without displacing the light Sleek default', () => {
    expect(isThemeId('sleek-dark')).toBe(true);
    const opt = THEMES.find((t) => t.id === 'sleek-dark');
    expect(opt?.label).toBe('Sleek Dark');
    // The light Sleek (kittens) is still present as the default theme.
    expect(THEMES.some((t) => t.id === 'kittens')).toBe(true);
  });
});

describe('Miner job (Mine opens Miner, not Stonecutter)', () => {
  it('the Mine grants Miner capacity and the Miner produces stone with the global tool tiers', () => {
    const s = newGame(1);
    s.run.tech.push('mining');
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'mine')).toBe(true);
    // Mine opens Miner slots, NOT Stonecutter slots.
    expect(jobCapacity(s, 'miner')).toBe(2);
    expect(jobCapacity(s, 'quarry-worker')).toBe(0);

    s.run.population.total = 1;
    expect(assignJob(s, 'miner', 1)).toBe(1);
    // 1 Miner × 0.4/s + the Mine's passive 0.2/s = 0.6/s stone.
    expect(productionRates(s).stone).toBeCloseTo(0.6, 6);

    // Stone Pick is Stonecutter-only → does NOT touch the Miner.
    s.run.tech.push('stone-pick');
    expect(productionRates(s).stone).toBeCloseTo(0.6, 6);

    // Global tool tiers (Bronze/Iron Working) DO apply to the Miner's 0.4 base.
    s.run.tech.push('bronze-working');
    expect(productionRates(s).stone).toBeCloseTo(0.4 * 1.35 + 0.2, 6);
    s.run.tech.push('iron-working');
    expect(productionRates(s).stone).toBeCloseTo(0.4 * 1.35 * 1.5 + 0.2, 6);
  });
});

describe('per-job food upkeep removed', () => {
  it('a job def carries no foodUpkeep field', () => {
    for (const id of Object.keys(JOB_BY_ID) as (keyof typeof JOB_BY_ID)[]) {
      expect('foodUpkeep' in JOB_BY_ID[id]).toBe(false);
    }
  });

  it('food is consumed only by base settler upkeep, regardless of jobs worked', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    s.run.buildings.hut = 1;
    build(s, 'woodcutters-lodge'); // 2 woodcutter slots
    s.run.population.total = 2;
    assignJob(s, 'woodcutter', 2); // both working
    // 2 settlers × 0.05 base upkeep = -0.1/s; workers add nothing.
    expect(productionRates(s).food).toBeCloseTo(-0.1, 6);
  });
});

describe('tech tree — doubled costs and Stone→Bronze→Iron DAG (magic is discovery-driven, not a tech)', () => {
  it('doubles the retained tech costs', () => {
    expect(TECH_BY_ID.agriculture.cost).toBe(20); // was 10
    expect(TECH_BY_ID.masonry.cost).toBe(30); // was 15
  });

  it('a Stone-Age tech is available at the very start', () => {
    const s = newGame(1);
    const available = techView(s).filter((t) => t.available).map((t) => t.id);
    // The three per-tool stone techs and pottery are all available from turn one.
    expect(available).toContain('stone-axe');
    expect(available).toContain('stone-hoe');
    expect(available).toContain('stone-pick');
    expect(available).toContain('pottery');
    // Iron tier is NOT available yet.
    expect(available).not.toContain('iron-working');
  });

  it('forms a clean prereq chain up to Iron Working, with Naturalism hanging off Agriculture', () => {
    // Agriculture/Masonry now hang off the per-tool stone techs.
    expect(TECH_BY_ID.agriculture.requires).toContain('stone-hoe');
    expect(TECH_BY_ID.masonry.requires).toContain('stone-pick');
    expect(TECH_BY_ID['bronze-working'].requires).toContain('mining');
    expect(TECH_BY_ID['iron-working'].requires).toContain('bronze-working');
    // Naturalism (the one magic-feeding tech, opening the Sacred Grove) follows Agriculture.
    expect(TECH_BY_ID.naturalism.requires).toContain('agriculture');
    // The retired magic-tier techs are gone entirely.
    expect(TECH_BY_ID['awakening' as never]).toBeUndefined();
    expect(TECH_BY_ID['animation' as never]).toBeUndefined();
  });
});

describe('per-tool stone techs boost ONLY their own gather job', () => {
  it('Stone Axe boosts the Woodcutter only, not the Farmer or Stonecutter', () => {
    const s = newGame(1);
    s.run.resources.wood = 200;
    s.run.resources.stone = 200;
    s.run.buildings.hut = 1;
    s.run.tech.push('masonry'); // opens the Quarry/Stonecutter
    build(s, 'woodcutters-lodge');
    build(s, 'forager-hut');
    build(s, 'quarry');
    s.run.population.total = 3;
    assignJob(s, 'woodcutter', 1);
    assignJob(s, 'forager', 1);
    assignJob(s, 'quarry-worker', 1);

    const wood0 = productionRates(s).wood;
    const food0 = productionRates(s).food;
    const stone0 = productionRates(s).stone;

    s.run.tech.push('stone-axe');
    const r = productionRates(s);
    expect(r.wood).toBeCloseTo(wood0 * 1.25, 6); // Woodcutter +25%
    expect(r.food).toBeCloseTo(food0, 6); // Farmer unaffected
    expect(r.stone).toBeCloseTo(stone0, 6); // Stonecutter unaffected
  });
});

describe('tool-tier efficiency stacks on a gather job', () => {
  it('Stone Axe < Bronze Working < Iron Working each raise Woodcutter output multiplicatively', () => {
    const s = newGame(1);
    s.run.resources.wood = 25;
    s.run.buildings.hut = 1;
    build(s, 'woodcutters-lodge');
    s.run.population.total = 1;
    assignJob(s, 'woodcutter', 1);

    const base = productionRates(s).wood;
    expect(base).toBeCloseTo(0.5, 6);

    s.run.tech.push('stone-axe');
    const withStone = productionRates(s).wood;
    expect(withStone).toBeCloseTo(0.5 * 1.25, 6);

    s.run.tech.push('bronze-working');
    const withBronze = productionRates(s).wood;
    expect(withBronze).toBeCloseTo(0.5 * 1.25 * 1.35, 6);

    s.run.tech.push('iron-working');
    const withIron = productionRates(s).wood;
    expect(withIron).toBeCloseTo(0.5 * 1.25 * 1.35 * 1.5, 6);

    // Strictly increasing tiers.
    expect(withStone).toBeGreaterThan(base);
    expect(withBronze).toBeGreaterThan(withStone);
    expect(withIron).toBeGreaterThan(withBronze);
  });
});

describe('new building effects', () => {
  it('the Granary raises the Food cap only (+150)', () => {
    const s = newGame(1);
    s.run.tech.push('pottery');
    s.run.resources.wood = 30;
    s.run.resources.stone = 10;
    const foodCapBefore = s.run.caps.food;
    const woodCapBefore = s.run.caps.wood;
    expect(build(s, 'granary')).toBe(true);
    expect(s.run.caps.food).toBe(foodCapBefore + 150);
    expect(s.run.caps.wood).toBe(woodCapBefore); // wood/stone caps untouched
  });

  it('the Workshop boosts every worker’s output globally', () => {
    const s = newGame(1);
    // A working Stonecutter as the sampled job.
    s.run.tech.push('masonry');
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    build(s, 'quarry'); // 2 stonecutter slots
    s.run.population.total = 1;
    assignJob(s, 'quarry-worker', 1);
    const before = productionRates(s).stone;

    s.run.tech.push('the-wheel');
    s.run.resources.wood += 50;
    s.run.resources.stone += 30;
    expect(build(s, 'workshop')).toBe(true);
    // +10% global worker output.
    expect(productionRates(s).stone).toBeCloseTo(before * 1.1, 6);
  });
});

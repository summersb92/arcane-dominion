// Production — the per-tick resource economy. Each tick this system:
//   1. gathers GROSS production from assigned jobs (Σ workers × per-worker output,
//      scaled by any tech efficiency bonus) and from magic CONSTRUCTS (buildings
//      like the Arcane Font and Animated Tools — production with NO population);
//   2. subtracts UPKEEP — per-job food, base per-settler food, and per-construct mana;
//   3. applies the net deltas, clamps every resource to its effective cap, and sets
//      run.flags.starving when food demand outran supply + stock.
//
// It also exposes the per-second NET rate read model (productionRates / foodBalance)
// the CLI and UI show. Pure engine, no DOM.

import { POPULATION, TECH_BONUS } from '../../content/config';
import { BUILDINGS } from '../../content/buildings';
import { JOBS } from '../../content/jobs';
import { RESOURCE_IDS, type ResourceId } from '../../content/resources';
import type { GameState } from '../state';
import { effectiveCap } from './caps';
import { activeRecipes, activeCount, convertEffects, isConverter } from './buildings';

const EPS = 1e-9;

/** One converter RECIPE-run: how many copies of a building run this recipe, and its per-copy trade. */
interface ConverterRun {
  name: string;
  copies: number; // copies running this recipe (activation ∩ worker backing)
  consume: Partial<Record<ResourceId, number>>; // per copy, per sec
  produce: Partial<Record<ResourceId, number>>; // per copy, per sec
}

/** Every converter recipe that is currently running, with its effective (running) copy count.
 *  A copy runs only if it is switched onto that recipe (run.active) and — for worker-backed
 *  converters like the Steelworks — backed by an assigned worker. A building's worker pool is
 *  shared across its recipes and allocated in recipe order (so the basic recipe fills first).
 *  Input STARVATION is handled by the caller (runProduction scales by available stock); this
 *  reports intended throughput. */
function converterRuns(state: GameState): ConverterRun[] {
  const run = state.run;
  const out: ConverterRun[] = [];
  for (const b of BUILDINGS) {
    const count = run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    const recipes = convertEffects(b);
    if (recipes.length === 0) continue;
    const running = activeRecipes(state, b.id); // copies per recipe, aligned to `recipes`
    // Worker-backed recipes draw from ONE shared pool for the building, filled in recipe order.
    const workerJob = recipes.find((r) => r.requiresWorker)?.requiresWorker;
    let workersLeft = workerJob ? (run.population.jobs[workerJob] ?? 0) : Infinity;
    for (let i = 0; i < recipes.length; i++) {
      const r = recipes[i];
      let copies = running[i] ?? 0;
      if (r.requiresWorker) {
        copies = Math.min(copies, workersLeft);
        workersLeft -= copies;
      }
      if (copies <= 0) continue;
      out.push({ name: b.name, copies, consume: r.consume, produce: r.produce });
    }
  }
  return out;
}

/** The GATHER jobs the GLOBAL tool-tier bonuses (Bronze/Iron Working) apply to. Includes the
 *  Miner alongside the Stonecutter; the per-tool STONE techs stay job-specific (e.g. Stone Pick
 *  boosts the Stonecutter only, not the Miner). */
const GATHER_JOBS = new Set(['woodcutter', 'forager', 'quarry-worker', 'miner']);

/** Global worker-output multiplier from buildings (Workshop/Forge + mechanization), applied to
 *  every job. 1 = no bonus. A plain building adds its fraction × its built count. A CONVERTER-based
 *  mechanization building (Steam Works) adds its fraction × its ACTIVE copies — and only while it is
 *  FUELLED (every convert input in stock), so an idle/starved works grants nothing. */
function globalJobMult(state: GameState): number {
  let m = 1;
  for (const b of BUILDINGS) {
    const count = state.run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    const mult = b.effects.find((e) => e.kind === 'jobOutputMult');
    if (!mult || mult.kind !== 'jobOutputMult') continue;
    let copies = count;
    if (isConverter(b)) {
      copies = activeCount(state, b.id);
      const fuelled = convertEffects(b).every((c) =>
        Object.entries(c.consume).every(([res, per]) => (per as number) <= 0 || state.run.resources[res as ResourceId] > EPS),
      );
      if (!fuelled) copies = 0;
    }
    m += copies * mult.amount;
  }
  return m;
}

/** Tech-driven output multiplier for a job. The STONE and STEEL tools are PER-JOB (Axe →
 *  Woodcutter, Hoe → Farmer, Pick → Stonecutter — each +25% (stone) / +65% (steel) to only that
 *  job); Iron Working is the one GLOBAL tool tier, stacking on all gather jobs (incl. Miners).
 *  Agriculture is a Farmer-only crop bonus. The global Workshop/Forge boost applies to every job. */
function jobEfficiency(state: GameState, jobId: string): number {
  const tech = state.run.tech;
  let m = 1;
  // Per-tool STONE techs — each boosts only its own gather job.
  if (jobId === 'woodcutter' && tech.includes('stone-axe')) m *= TECH_BONUS.stoneAxe;
  if (jobId === 'forager' && tech.includes('stone-hoe')) m *= TECH_BONUS.stoneHoe;
  if (jobId === 'quarry-worker' && tech.includes('stone-pick')) m *= TECH_BONUS.stonePick;
  // Per-tool STEEL techs — the top per-job tier, atop the stone tools.
  if (jobId === 'woodcutter' && tech.includes('steel-axe')) m *= TECH_BONUS.steelAxe;
  if (jobId === 'forager' && tech.includes('steel-hoe')) m *= TECH_BONUS.steelHoe;
  if (jobId === 'quarry-worker' && tech.includes('steel-pick')) m *= TECH_BONUS.steelPick;
  // Iron Working — the one GLOBAL tool tier, on all gather jobs (incl. Miners).
  if (GATHER_JOBS.has(jobId) && tech.includes('iron-working')) m *= TECH_BONUS.ironWorking;
  if (jobId === 'forager' && tech.includes('agriculture')) m *= TECH_BONUS.agriculture;
  m *= globalJobMult(state);
  return m;
}

interface Flows {
  /** Gross production per resource (jobs + constructs), before upkeep. */
  gross: Record<ResourceId, number>;
  /** Food consumed per second (base per-settler upkeep only — jobs have no food cost). */
  foodUpkeep: number;
  /** Mana consumed per second by constructs. */
  manaUpkeep: number;
}

/** Idle (unassigned) settlers = total − Σ workers across all jobs. Never negative. */
function idleCount(run: GameState['run']): number {
  let assigned = 0;
  for (const n of Object.values(run.population.jobs)) assigned += n ?? 0;
  return Math.max(0, run.population.total - assigned);
}

/** Compute every per-second flow from the current assignment + building counts. */
function flows(state: GameState): Flows {
  const gross = {} as Record<ResourceId, number>;
  for (const id of RESOURCE_IDS) gross[id] = 0;

  const run = state.run;
  // Food's ONLY consumer is the base per-settler upkeep — jobs no longer eat food.
  const foodUpkeep = POPULATION.baseFoodUpkeep * run.population.total;
  let manaUpkeep = 0;

  // Curiosity trickle: every settler passively yields a little Research (the tech
  // currency), starting with the first settler — so tech is reachable before Scholars.
  gross.research += POPULATION.researchPerSettler * run.population.total;

  // Jobs: Σ workers × per-worker output × efficiency. No food upkeep per worker.
  for (const job of JOBS) {
    const workers = run.population.jobs[job.id] ?? 0;
    if (workers <= 0) continue;
    const eff = jobEfficiency(state, job.id);
    for (const [res, per] of Object.entries(job.produces)) {
      gross[res as ResourceId] += workers * (per as number) * eff;
    }
  }

  // Idle (unassigned) settlers forage a small subsistence trickle of food.
  gross.food += POPULATION.idleFoodPerSettler * idleCount(run);

  // Constructs: passive production + mana upkeep, scaled by building count. NO food, NO pop.
  for (const b of BUILDINGS) {
    const count = run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const eff of b.effects) {
      if (eff.kind === 'produce') {
        // Tech-gated construct output (e.g. the Mine's crystals behind Crystallurgy) stays dry
        // until the tech is researched.
        if (eff.requiresTech && !run.tech.includes(eff.requiresTech as never)) continue;
        gross[eff.resource] += count * eff.perSec;
      } else if (eff.kind === 'manaUpkeep') manaUpkeep += count * eff.perSec;
    }
  }

  return { gross, foodUpkeep, manaUpkeep };
}

/** Per-second NET rate for every resource (gross − upkeep). The primary "am I producing?" read model. */
export function productionRates(state: GameState): Record<ResourceId, number> {
  const f = flows(state);
  const rates = { ...f.gross };
  rates.food -= f.foodUpkeep;
  rates.mana -= f.manaUpkeep;
  // Converters: add each running copy's net trade (best-effort — assumes inputs are available;
  // actual per-tick output is input-limited in runProduction).
  for (const c of converterRuns(state)) {
    for (const [res, per] of Object.entries(c.produce)) rates[res as ResourceId] += c.copies * (per as number);
    for (const [res, per] of Object.entries(c.consume)) rates[res as ResourceId] -= c.copies * (per as number);
  }
  return rates;
}

/** Net food per second (production − all food upkeep). Drives population growth/starvation. */
export function foodBalance(state: GameState): number {
  const f = flows(state);
  return f.gross.food - f.foodUpkeep;
}

/** One line of a resource's math breakdown: a signed per-second contribution. */
export interface BreakdownLine {
  label: string;
  amount: number; // + produces, − consumes
}
/** The full producer/consumer decomposition of a resource's net rate (for the hover tooltip). */
export interface ResourceBreakdown {
  producers: BreakdownLine[];
  consumers: BreakdownLine[];
  net: number;
}

/** Decompose a resource's net /s into who produces and who consumes it — the "show the math"
 *  read model behind the resource-row hover. Pure read, no mutation. */
export function resourceBreakdown(state: GameState, id: ResourceId): ResourceBreakdown {
  const run = state.run;
  const producers: BreakdownLine[] = [];
  const consumers: BreakdownLine[] = [];
  const times = (n: number): string => (n > 1 ? ` ×${n}` : '');

  // The per-settler curiosity trickle (Research only), from the first settler onward.
  if (id === 'research' && run.population.total > 0) {
    producers.push({ label: `Settlers${times(run.population.total)}`, amount: POPULATION.researchPerSettler * run.population.total });
  }
  // Jobs that produce this resource (workers × per-worker × tech efficiency).
  for (const job of JOBS) {
    const workers = run.population.jobs[job.id] ?? 0;
    if (workers <= 0) continue;
    const per = (job.produces as Partial<Record<ResourceId, number>>)[id];
    if (per) producers.push({ label: `${job.name}${times(workers)}`, amount: workers * per * jobEfficiency(state, job.id) });
  }
  // Constructs that produce this resource (count × per-second, no pop/food).
  for (const b of BUILDINGS) {
    const count = run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const e of b.effects) {
      if (e.kind === 'produce' && e.resource === id && (!e.requiresTech || run.tech.includes(e.requiresTech as never))) {
        producers.push({ label: `${b.name}${times(count)}`, amount: count * e.perSec });
      }
    }
  }

  // Idle settlers forage a small subsistence trickle of food.
  if (id === 'food') {
    const idle = idleCount(run);
    if (idle > 0) producers.push({ label: `Idle settlers${times(idle)}`, amount: POPULATION.idleFoodPerSettler * idle });
  }

  // Converters both produce (outputs) and consume (inputs) this resource.
  for (const c of converterRuns(state)) {
    const outPer = c.produce[id];
    if (outPer) producers.push({ label: `${c.name} (converts)`, amount: c.copies * outPer });
    const inPer = c.consume[id];
    if (inPer) consumers.push({ label: `${c.name} (converts)`, amount: -(c.copies * inPer) });
  }

  // Consumers: food's only consumer is the base per-settler upkeep; mana by constructs.
  if (id === 'food') {
    if (run.population.total > 0) {
      consumers.push({ label: `Settler upkeep${times(run.population.total)}`, amount: -(POPULATION.baseFoodUpkeep * run.population.total) });
    }
  }
  if (id === 'mana') {
    for (const b of BUILDINGS) {
      const count = run.buildings[b.id] ?? 0;
      if (count <= 0) continue;
      for (const e of b.effects) {
        if (e.kind === 'manaUpkeep') consumers.push({ label: `${b.name}${times(count)}`, amount: -(count * e.perSec) });
      }
    }
  }

  return { producers, consumers, net: productionRates(state)[id] };
}

/**
 * Advance the economy by `dt`. Mutates resources, clamps to caps, and sets
 * run.flags.starving. Runs BEFORE population so growth/starvation sees fresh stock.
 */
export function runProduction(state: GameState, dt: number): void {
  const run = state.run;
  const f = flows(state);

  // Non-food, non-mana resources: pure additive production.
  run.resources.wood += f.gross.wood * dt;
  run.resources.stone += f.gross.stone * dt;
  run.resources.iron += f.gross.iron * dt; // mined ore; clamped below like the other capped materials
  run.resources.coal += f.gross.coal * dt; // mined/charred fuel; clamped below
  run.resources.steel += f.gross.steel * dt; // (no passive producer; converters add it below)
  run.resources.tools += f.gross.tools * dt; // (converters add these below)
  run.resources.engines += f.gross.engines * dt;
  run.resources.furniture += f.gross.furniture * dt;
  run.resources.furs += f.gross.furs * dt; // luxury; clamped below like the other capped materials
  run.resources.manaCrystals += f.gross.manaCrystals * dt; // mined; clamped below like the mundane materials
  run.resources.research += f.gross.research * dt;
  run.resources.culture += f.gross.culture * dt; // uncapped, accumulates

  // Mana: production − construct upkeep, clamped at 0 (constructs still run gently when dry).
  run.resources.mana += (f.gross.mana - f.manaUpkeep) * dt;
  if (run.resources.mana < 0) run.resources.mana = 0;

  // Food: production − upkeep. If demand outran supply + stock, that is STARVATION —
  // clamp to 0 and flag it so population.ts can begin losing settlers.
  const nextFood = run.resources.food + (f.gross.food - f.foodUpkeep) * dt;
  if (nextFood < -EPS) {
    run.resources.food = 0;
    run.flags.starving = true;
  } else {
    run.resources.food = Math.max(0, nextFood);
    run.flags.starving = false;
  }

  // Converter pass: each running copy consumes inputs → yields outputs. Runs AFTER base production
  // (so this tick's fresh ore/wood is available) and is INPUT-LIMITED — a converter only runs as
  // many copy-seconds as its scarcest input can supply, so it never drives a resource negative.
  // Converters are processed in BUILDINGS order (deterministic) when they compete for an input.
  for (const c of converterRuns(state)) {
    let units = c.copies * dt; // desired copy-seconds
    for (const [res, per] of Object.entries(c.consume)) {
      if ((per as number) > 0) units = Math.min(units, run.resources[res as ResourceId] / (per as number));
    }
    if (units <= EPS) continue;
    for (const [res, per] of Object.entries(c.consume)) {
      run.resources[res as ResourceId] = Math.max(0, run.resources[res as ResourceId] - (per as number) * units);
    }
    for (const [res, per] of Object.entries(c.produce)) {
      run.resources[res as ResourceId] += (per as number) * units;
    }
  }

  // Clamp the capped resources to their effective caps (excess is lost): the mundane
  // materials + furs + mana crystals, plus RESEARCH (now capped by science buildings).
  // Mana/culture are uncapped.
  for (const id of ['wood', 'food', 'stone', 'iron', 'coal', 'steel', 'tools', 'engines', 'furniture', 'furs', 'manaCrystals', 'research'] as ResourceId[]) {
    const cap = effectiveCap(state, id);
    if (run.resources[id] > cap) run.resources[id] = cap;
  }
}

// Production — the per-tick resource economy. Each tick this system:
//   1. gathers GROSS production from assigned jobs (Σ workers × per-worker output,
//      scaled by any tech efficiency bonus) and from magic CONSTRUCTS (buildings
//      like the Golem Works and the elemental attunements — production with NO population);
//   2. subtracts UPKEEP — per-job food, base per-citizen food, and per-construct mana;
//   3. applies the net deltas, clamps every resource to its effective cap, and sets
//      run.flags.starving when food demand outran supply + stock.
//
// It also exposes the per-second NET rate read model (productionRates / foodBalance)
// the CLI and UI show. Pure engine, no DOM.

import { POPULATION, TECH_BONUS, KNOWLEDGE, PRISMATIC } from '../../content/config';
import { BUILDINGS, type BuildingId } from '../../content/buildings';
import { JOBS } from '../../content/jobs';
import { RESOURCE_IDS, type ResourceId } from '../../content/resources';
import type { GameState } from '../state';
import { effectiveCap } from './caps';
import { activeRecipes, activeCount, convertEffects, isConverter, recipeUnlocked, setRecipeActive } from './buildings';
import { logEvent } from './chronicle';
import { formBonuses, policyMults, policyUpkeep, policiesSuspended } from './government';
import { magicYieldMult, oppositionFactor } from './education';
import { happiness } from './happiness';
import { foodEnvLines, foodEnvMult } from './weather';

const EPS = 1e-9;

/** One converter RECIPE-run: how many copies of a building run this recipe, and its per-copy trade. */
interface ConverterRun {
  id: BuildingId;
  name: string;
  recipe: number; // index into the building's convert effects — what setRecipeActive keys off
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
      if (!recipeUnlocked(state, r)) continue; // attunement not researched — recipe doesn't exist
      let copies = running[i] ?? 0;
      if (r.requiresWorker) {
        copies = Math.min(copies, workersLeft);
        workersLeft -= copies;
      }
      if (copies <= 0) continue;
      out.push({ id: b.id, name: b.name, recipe: i, copies, consume: r.consume, produce: r.produce });
    }
  }
  return out;
}

/** The GATHER jobs the GLOBAL tool-tier bonuses (Bronze/Iron Working) apply to. Includes the
 *  Miner alongside the Stonecutter; the per-tool STONE techs stay job-specific (e.g. Stone Pick
 *  boosts the Stonecutter only, not the Miner). */
const GATHER_JOBS = new Set(['woodcutter', 'forager', 'quarry-worker', 'miner']);

/** Per-JOB building boost (Aqueduct → Farmer): Σ over buildings of count × jobBoost.amount
 *  for the given job, as a 1+x multiplier. Stacks linearly per copy, like globalJobMult. */
function jobBoostMult(state: GameState, jobId: string): number {
  let m = 1;
  for (const b of BUILDINGS) {
    const count = state.run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const eff of b.effects) {
      if (eff.kind === 'jobBoost' && eff.job === jobId) m += count * eff.amount;
    }
  }
  return m;
}

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

/** Which HELD elemental essence empowers which job. Air fells timber, Earth opens the deep,
 *  Fire cracks rock (fire-setting is real quarry craft), Water waters the fields. */
const ESSENCE_JOB: Record<string, ResourceId> = {
  woodcutter: 'airEssence',
  miner: 'earthEssence',
  'quarry-worker': 'fireEssence',
  forager: 'waterEssence',
};

/** Held-essence boost for a job: 1 + min(cap, held × perUnit). Spending essence spends the
 *  bonus too — the tension that makes the elemental constructs a real trade-off. */
function essenceBoost(state: GameState, jobId: string): number {
  const res = ESSENCE_JOB[jobId];
  if (!res) return 1;
  const held = state.run.resources[res] ?? 0;
  if (held <= 0) return 1;
  const raw = Math.min(PRISMATIC.essenceBoostMax, held * PRISMATIC.essenceBoostPerUnit);
  // A stronger OPPOSING element drowns this one out — asymptotically, never fully
  // (systems/education.ts oppositionFactor).
  return 1 + raw * oppositionFactor(state, res);
}

/** One line of the "why is this rate what it is" multiplier list. Exactly one of `mult`
 *  (a multiplicative factor, e.g. a tool tech) and `add` (an ADDITIVE share of a stacking
 *  group, e.g. one Farm's +2% among several) is set, so the UI can render `×1.25` or `+6%`
 *  without the engine pretending an additive stack is a product. */
export interface MultiplierLine {
  label: string;
  mult?: number;
  add?: number;
  /** True when the line applies to EVERY source of the resource, not just one job. */
  global?: boolean;
}

/** The per-job TECH multipliers, one line each — the same set jobEfficiency applies. */
function techMultLines(state: GameState, jobId: string): MultiplierLine[] {
  const tech = state.run.tech;
  const out: MultiplierLine[] = [];
  const add = (on: boolean, label: string, mult: number): void => {
    if (on) out.push({ label, mult });
  };
  add(jobId === 'woodcutter' && tech.includes('stone-axe'), 'Stone Axe', TECH_BONUS.stoneAxe);
  add(jobId === 'forager' && tech.includes('stone-hoe'), 'Stone Hoe', TECH_BONUS.stoneHoe);
  add(jobId === 'quarry-worker' && tech.includes('stone-pick'), 'Stone Pick', TECH_BONUS.stonePick);
  add(jobId === 'woodcutter' && tech.includes('steel-axe'), 'Steel Axe', TECH_BONUS.steelAxe);
  add(jobId === 'forager' && tech.includes('steel-hoe'), 'Steel Hoe', TECH_BONUS.steelHoe);
  add(jobId === 'quarry-worker' && tech.includes('steel-pick'), 'Steel Pick', TECH_BONUS.steelPick);
  add(GATHER_JOBS.has(jobId) && tech.includes('iron-working'), 'Iron Working', TECH_BONUS.ironWorking);
  add(jobId === 'forager' && tech.includes('irrigation'), 'Irrigation', TECH_BONUS.irrigation);
  add(jobId === 'forager' && tech.includes('fertilizer'), 'Fertilizer', TECH_BONUS.fertilizer);
  add(jobId === 'miner' && tech.includes('bloomery'), 'Bloomery', TECH_BONUS.bloomery);
  add(jobId === 'scholar' && tech.includes('optics'), 'Optics', TECH_BONUS.optics);
  add(GATHER_JOBS.has(jobId) && tech.includes('wheelbarrows'), 'Wheelbarrows', TECH_BONUS.wheelbarrows);
  return out;
}

/**
 * Every multiplier standing behind one job's output, as display lines. The product of the
 * `mult` lines and (1 + Σ `add`) equals jobEfficiency — the tooltip and the tick cannot
 * disagree because both read the same constants.
 */
export function jobEfficiencyLines(state: GameState, jobId: string): MultiplierLine[] {
  const out: MultiplierLine[] = techMultLines(state, jobId);

  // Per-job workplace boosts (Farm → Farmer, Aqueduct → Farmer). These STACK ADDITIVELY,
  // so each building reports its own share rather than a fake product.
  for (const b of BUILDINGS) {
    const count = state.run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const eff of b.effects) {
      if (eff.kind === 'jobBoost' && eff.job === jobId) {
        out.push({ label: `${b.name}${count > 1 ? ` ×${count}` : ''}`, add: count * eff.amount });
      }
    }
  }

  // Held elemental essence empowering its matching job.
  const essence = essenceBoost(state, jobId);
  if (essence !== 1) {
    const res = ESSENCE_JOB[jobId];
    out.push({ label: `${RESOURCE_LABELS[res] ?? 'Essence'} essence held`, mult: essence });
  }

  // Global building boosts (Workshop / Forge / Steam Works / Prismatic Spire) — also additive.
  for (const b of BUILDINGS) {
    const count = state.run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    const m = b.effects.find((e) => e.kind === 'jobOutputMult');
    if (!m || m.kind !== 'jobOutputMult') continue;
    let copies = count;
    if (isConverter(b)) {
      copies = activeCount(state, b.id);
      const fuelled = convertEffects(b).every((c) =>
        Object.entries(c.consume).every(
          ([res, per]) => (per as number) <= 0 || state.run.resources[res as ResourceId] > EPS,
        ),
      );
      if (!fuelled) copies = 0;
    }
    if (copies > 0) out.push({ label: `${b.name}${copies > 1 ? ` ×${copies}` : ''}`, add: copies * m.amount, global: true });
  }

  // Governance + contentment apply to every worker alike.
  const form = formBonuses(state).workerMult;
  if (form !== 1) out.push({ label: 'Government', mult: form, global: true });
  const pol = policyMults(state).worker;
  if (pol !== 1) out.push({ label: 'Policies', mult: pol, global: true });
  const cont = contentment(state);
  if (cont !== 1) out.push({ label: 'Contentment', mult: cont, global: true });
  return out;
}

/** Resource labels for multiplier lines, without importing the UI's content map. */
const RESOURCE_LABELS: Record<string, string> = {
  airEssence: 'Air',
  earthEssence: 'Earth',
  fireEssence: 'Fire',
  waterEssence: 'Water',
};

/** Tech-driven output multiplier for a job. The STONE and STEEL tools are PER-JOB (Axe →
 *  Woodcutter, Hoe → Farmer, Pick → Stonecutter — each +25% (stone) / +65% (steel) to only that
 *  job); Iron Working is the one GLOBAL tool tier, stacking on all gather jobs (incl. Miners).
 *  The global Workshop/Forge boost applies to every job. Agriculture is purely an ENABLER now
 *  (it opens the Farm) — it carries no output multiplier. */
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
  // Mini-step boosts — small per-job wins between the big tiers.
  if (jobId === 'forager' && tech.includes('irrigation')) m *= TECH_BONUS.irrigation;
  if (jobId === 'forager' && tech.includes('fertilizer')) m *= TECH_BONUS.fertilizer;
  if (jobId === 'miner' && tech.includes('bloomery')) m *= TECH_BONUS.bloomery;
  if (jobId === 'scholar' && tech.includes('optics')) m *= TECH_BONUS.optics;
  if (GATHER_JOBS.has(jobId) && tech.includes('wheelbarrows')) m *= TECH_BONUS.wheelbarrows;
  m *= jobBoostMult(state, jobId); // per-job infrastructure (Aqueduct/Windmill → Farmer)
  m *= essenceBoost(state, jobId); // held elemental essence empowers its matching job
  m *= globalJobMult(state);
  // Governance: the form's passive and any live worker policies apply to every job.
  m *= formBonuses(state).workerMult * policyMults(state).worker;
  // CONTENTMENT is the master modifier: 1.0x at full happiness, scaling down as the
  // settlement sours. A miserable settlement simply works less.
  m *= contentment(state);
  return m;
}

/** A job's per-worker BASE output, including any tech-gated extras whose tech is in.
 *  One place, so the tick, the tooltip and the breakdown can never disagree. */
function jobProduces(state: GameState, def: (typeof JOBS)[number]): Partial<Record<ResourceId, number>> {
  const extra = def.producesWithTech;
  if (!extra || !state.run.tech.includes(extra.tech as never)) return def.produces;
  const out: Partial<Record<ResourceId, number>> = { ...def.produces };
  for (const [res, per] of Object.entries(extra.produces)) {
    out[res as ResourceId] = (out[res as ResourceId] ?? 0) + (per as number);
  }
  return out;
}

/** The ENVIRONMENT multiplier for one resource from one source. Only FOOD is weather-bound:
 *  season × weather (systems/weather.ts), with Hunters exempt from the winter penalty.
 *  Everything else is 1 — a quarry does not care what the sky is doing. */
function envMult(state: GameState, res: ResourceId, jobId?: string): number {
  if (res !== 'food') return 1;
  return foodEnvMult(state, jobId === 'hunter');
}

/** A job's EFFECTIVE per-worker output — base `produces` × the live efficiency multiplier
 *  (tool techs + Workshop/Forge/Steam Works) × the season/weather environment. The read
 *  model for job tooltips, so the number on screen matches what a citizen actually makes. */
export function jobEffectiveProduces(state: GameState, jobId: string): Partial<Record<ResourceId, number>> {
  const def = JOBS.find((j) => j.id === jobId);
  if (!def) return {};
  const eff = jobEfficiency(state, jobId);
  const out: Partial<Record<ResourceId, number>> = {};
  for (const [res, per] of Object.entries(jobProduces(state, def))) {
    out[res as ResourceId] = (per as number) * eff * envMult(state, res as ResourceId, jobId);
  }
  return out;
}

interface Flows {
  /** Gross production per resource (jobs + constructs), before upkeep. */
  gross: Record<ResourceId, number>;
  /** Food consumed per second (base per-citizen upkeep only — jobs have no food cost). */
  foodUpkeep: number;
  /** Mana consumed per second by constructs. */
  manaUpkeep: number;
}

/** Idle (unassigned) citizens = total − Σ workers across all jobs. Never negative. */
function idleCount(run: GameState['run']): number {
  let assigned = 0;
  for (const n of Object.values(run.population.jobs)) assigned += n ?? 0;
  return Math.max(0, run.population.total - assigned);
}

/** Extra research/citizen/s from HELD books (capped) — the knowledge-chain payoff. */
function booksResearchPerPop(state: GameState): number {
  const books = state.run.resources.books ?? 0;
  return Math.min(KNOWLEDGE.booksResearchPerPopMax, books * KNOWLEDGE.booksResearchPerPop);
}

/** Mana/citizen/s from HELD compendiums (capped) — the top knowledge-chain payoff. */
function compendiumManaPerPop(state: GameState): number {
  const comp = state.run.resources.compendiums ?? 0;
  return Math.min(KNOWLEDGE.compendiumManaPerPopMax, comp * KNOWLEDGE.compendiumManaPerPop);
}

/** Contentment as a 0..1 multiplier. Happiness is capped at 100, so a fully content
 *  settlement produces at exactly 1.0x — contentment can never push output ABOVE baseline,
 *  only drag it down. Applied to every worker's output AND to idle foraging. */
function contentment(state: GameState): number {
  return Math.max(0, Math.min(1, happiness(state).value / 100));
}

/** Compute every per-second flow from the current assignment + building counts. */
function flows(state: GameState): Flows {
  const gross = {} as Record<ResourceId, number>;
  for (const id of RESOURCE_IDS) gross[id] = 0;

  const run = state.run;
  const gov = policyMults(state);
  // Food's ONLY consumer is the base per-citizen upkeep — jobs no longer eat food.
  // Rationing (policy) trims it while live.
  const foodUpkeep = POPULATION.baseFoodUpkeep * run.population.total * gov.foodUpkeep;
  let manaUpkeep = 0;

  // Curiosity trickle: every citizen passively yields a little Research (the tech currency),
  // starting with the first citizen. HELD books raise the per-citizen yield (knowledge chain);
  // Scholarly Patronage (policy) multiplies the whole trickle.
  gross.research +=
    (POPULATION.researchPerCitizen + booksResearchPerPop(state)) * run.population.total * gov.researchPerPop;
  // HELD compendiums yield a little mana per citizen.
  gross.mana += compendiumManaPerPop(state) * run.population.total;
  // Meditation: every citizen draws their own small trickle, building or no building.
  if (run.tech.includes('meditation' as never)) {
    gross.mana += POPULATION.manaPerCitizen * run.population.total;
  }

  // Jobs: Σ workers × per-worker output × efficiency. No food upkeep per worker.
  for (const job of JOBS) {
    const workers = run.population.jobs[job.id] ?? 0;
    if (workers <= 0) continue;
    const eff = jobEfficiency(state, job.id);
    for (const [res, per] of Object.entries(jobProduces(state, job))) {
      gross[res as ResourceId] += workers * (per as number) * eff * envMult(state, res as ResourceId, job.id);
    }
    // Upkeep is NOT scaled by efficiency — a performer's fee doesn't fall because the
    // settlement bought better axes.
    for (const [res, per] of Object.entries(job.consumes ?? {})) {
      gross[res as ResourceId] -= workers * (per as number);
    }
  }

  // Idle (unassigned) citizens forage for themselves — at a rate that scales with how
  // CONTENT the settlement is (full rate at 100 happiness, half at 50, nothing at 0).
  gross.food += POPULATION.idleFoodPerCitizen * idleCount(run) * contentment(state) * envMult(state, 'food');

  // Constructs: passive production + mana upkeep, scaled by building count. NO food, NO pop.
  for (const b of BUILDINGS) {
    const count = run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const eff of b.effects) {
      if (eff.kind === 'produce') {
        // Tech-gated construct output (e.g. the Mine's crystals behind Crystallurgy) stays dry
        // until the tech is researched.
        if (eff.requiresTech && !run.tech.includes(eff.requiresTech as never)) continue;
        gross[eff.resource] += count * eff.perSec * envMult(state, eff.resource);
      } else if (eff.kind === 'manaUpkeep') manaUpkeep += count * eff.perSec;
    }
  }

  // Governance multipliers on the whole streams: Arcane Sanction lifts mana production;
  // the Republic's assembly lifts Culture production.
  gross.mana *= gov.mana;
  gross.culture *= formBonuses(state).cultureMult;

  // EDUCATION: the Arcanum's yield boost + the curriculum's focus/penalty, on every
  // magical stream (elemental essences + Prismatic Mana).
  for (const id of ['airEssence', 'earthEssence', 'fireEssence', 'waterEssence', 'prismatic'] as ResourceId[]) {
    const mult = magicYieldMult(state, id);
    if (mult !== 1) gross[id] *= mult;
  }

  return { gross, foodUpkeep, manaUpkeep };
}

/** Per-second NET rate for every resource (gross − upkeep). The primary "am I producing?" read model. */
export function productionRates(state: GameState): Record<ResourceId, number> {
  const f = flows(state);
  const rates = { ...f.gross };
  rates.food -= f.foodUpkeep;
  rates.mana -= f.manaUpkeep;
  // Live policies pay their culture upkeep (suspended policies pay nothing).
  if (!policiesSuspended(state)) rates.culture -= policyUpkeep(state);
  // Converters: add each running copy's net trade (best-effort — assumes inputs are available;
  // actual per-tick output is input-limited in runProduction).
  for (const c of converterRuns(state)) {
    for (const [res, per] of Object.entries(c.produce)) {
      rates[res as ResourceId] += c.copies * (per as number) * magicYieldMult(state, res as ResourceId);
    }
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
/** The full producer/consumer decomposition of a resource's net rate (for the hover tooltip).
 *  Producer/consumer amounts are EFFECTIVE (every multiplier already applied), so they add up
 *  to `net` exactly; the `*Mults` lists say WHICH boosts are baked into those figures. */
export interface ResourceBreakdown {
  producers: BreakdownLine[];
  /** The multipliers standing behind the producer figures (already included in them). */
  producerMults: MultiplierLine[];
  consumers: BreakdownLine[];
  /** The multipliers standing behind the consumer figures. */
  consumerMults: MultiplierLine[];
  net: number;
}

/** Collect the multiplier lines behind a resource's PRODUCTION. Job-specific lines are
 *  tagged with the job when more than one job feeds the resource; global lines appear once. */
function producerMultipliers(state: GameState, id: ResourceId): MultiplierLine[] {
  const run = state.run;
  const out: MultiplierLine[] = [];
  const seen = new Set<string>();

  const producingJobs = JOBS.filter((j) => (run.population.jobs[j.id] ?? 0) > 0 && jobProduces(state, j)[id]);
  for (const job of producingJobs) {
    for (const line of jobEfficiencyLines(state, job.id)) {
      if (line.global) {
        if (seen.has(line.label)) continue;
        seen.add(line.label);
        out.push(line);
      } else {
        out.push({ ...line, label: producingJobs.length > 1 ? `${line.label} → ${job.name}` : line.label });
      }
    }
  }

  // FOOD is weather-bound: the season and the current spell scale every source alike.
  if (id === 'food') {
    for (const e of foodEnvLines(state)) out.push({ label: e.label, mult: e.mult, global: true });
  }
  // Stream-wide governance multipliers.
  if (id === 'mana') {
    const m = policyMults(state).mana;
    if (m !== 1) out.push({ label: 'Policies', mult: m, global: true });
  }
  if (id === 'culture') {
    const m = formBonuses(state).cultureMult;
    if (m !== 1) out.push({ label: 'Government', mult: m, global: true });
  }
  if (id === 'research') {
    const m = policyMults(state).researchPerPop;
    if (m !== 1) out.push({ label: 'Policies (citizen trickle)', mult: m, global: true });
  }
  // The Arcanum's teaching lifts every magical stream.
  const magic = magicYieldMult(state, id);
  if (magic !== 1) out.push({ label: 'Arcanum teaching', mult: magic, global: true });
  return out;
}

/** Decompose a resource's net /s into who produces and who consumes it — the "show the math"
 *  read model behind the resource-row hover. Pure read, no mutation. */
export function resourceBreakdown(state: GameState, id: ResourceId): ResourceBreakdown {
  const run = state.run;
  const producers: BreakdownLine[] = [];
  const consumers: BreakdownLine[] = [];
  const times = (n: number): string => (n > 1 ? ` ×${n}` : '');

  // The per-citizen curiosity trickle (Research only), from the first citizen onward.
  if (id === 'research' && run.population.total > 0) {
    producers.push({ label: `Citizens${times(run.population.total)}`, amount: POPULATION.researchPerCitizen * run.population.total });
    const booksBonus = booksResearchPerPop(state) * run.population.total;
    if (booksBonus > 0) producers.push({ label: `Books (per citizen)`, amount: booksBonus });
  }
  // Held compendiums yield mana per citizen.
  if (id === 'mana' && run.population.total > 0) {
    const compMana = compendiumManaPerPop(state) * run.population.total;
    if (compMana > 0) producers.push({ label: `Compendiums (per citizen)`, amount: compMana });
    if (run.tech.includes('meditation' as never)) {
      producers.push({ label: 'Meditation (per citizen)', amount: POPULATION.manaPerCitizen * run.population.total });
    }
  }
  // Jobs that produce this resource (workers × per-worker × tech efficiency).
  for (const job of JOBS) {
    const workers = run.population.jobs[job.id] ?? 0;
    if (workers <= 0) continue;
    const per = jobProduces(state, job)[id];
    if (per) {
      producers.push({
        label: `${job.name}${times(workers)}`,
        amount: workers * per * jobEfficiency(state, job.id) * envMult(state, id, job.id),
      });
    }
  }
  // Jobs whose UPKEEP draws on this resource.
  for (const job of JOBS) {
    const workers = run.population.jobs[job.id] ?? 0;
    const per = job.consumes?.[id];
    if (workers > 0 && per) consumers.push({ label: `${job.name}${times(workers)}`, amount: workers * per });
  }
  // Constructs that produce this resource (count × per-second, no pop/food).
  for (const b of BUILDINGS) {
    const count = run.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    for (const e of b.effects) {
      if (e.kind === 'produce' && e.resource === id && (!e.requiresTech || run.tech.includes(e.requiresTech as never))) {
        producers.push({
          label: `${b.name}${times(count)}`,
          amount: count * e.perSec * magicYieldMult(state, id) * envMult(state, id),
        });
      }
    }
  }

  // Idle citizens forage a small subsistence trickle of food.
  if (id === 'food') {
    const idle = idleCount(run);
    if (idle > 0) {
      producers.push({
        label: `Idle citizens${times(idle)}`,
        amount: POPULATION.idleFoodPerCitizen * idle * contentment(state) * envMult(state, 'food'),
      });
    }
  }

  // Converters both produce (outputs) and consume (inputs) this resource.
  for (const c of converterRuns(state)) {
    const outPer = c.produce[id];
    if (outPer) producers.push({ label: `${c.name} (converts)`, amount: c.copies * outPer * magicYieldMult(state, id) });
    const inPer = c.consume[id];
    if (inPer) consumers.push({ label: `${c.name} (converts)`, amount: -(c.copies * inPer) });
  }

  // Consumers: food's only consumer is the base per-citizen upkeep; mana by constructs;
  // culture by live policy upkeep.
  if (id === 'food') {
    if (run.population.total > 0) {
      consumers.push({
        label: `Citizen upkeep${times(run.population.total)}`,
        amount: -(POPULATION.baseFoodUpkeep * run.population.total * policyMults(state).foodUpkeep),
      });
    }
  }
  if (id === 'culture' && !policiesSuspended(state)) {
    const up = policyUpkeep(state);
    if (up > 0) consumers.push({ label: 'Policy upkeep', amount: -up });
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

  // Consumption-side multipliers: Rationing is the only one so far, trimming food upkeep.
  const consumerMults: MultiplierLine[] = [];
  if (id === 'food') {
    const m = policyMults(state).foodUpkeep;
    if (m !== 1) consumerMults.push({ label: 'Policies', mult: m, global: true });
  }

  return {
    producers,
    producerMults: producers.length ? producerMultipliers(state, id) : [],
    consumers,
    consumerMults,
    net: productionRates(state)[id],
  };
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
  run.resources.parchment += f.gross.parchment * dt; // (converters add these below)
  run.resources.books += f.gross.books * dt;
  run.resources.compendiums += f.gross.compendiums * dt;
  run.resources.furs += f.gross.furs * dt; // luxury; clamped below like the other capped materials
  run.resources.alchemical += f.gross.alchemical * dt; // Naturalism's by-product (Hunter + Ranch)
  // Prismatic: the four essences (capped) and the fused light (uncapped).
  run.resources.airEssence += f.gross.airEssence * dt;
  run.resources.earthEssence += f.gross.earthEssence * dt;
  run.resources.fireEssence += f.gross.fireEssence * dt;
  run.resources.waterEssence += f.gross.waterEssence * dt;
  run.resources.prismatic += f.gross.prismatic * dt;
  run.resources.gold += f.gross.gold * dt; // treasury — uncapped, like mana and culture
  run.resources.manaCrystals += f.gross.manaCrystals * dt; // mined; clamped below like the mundane materials
  run.resources.research += f.gross.research * dt;
  // Culture accumulates (uncapped) — then LIVE policies draw their upkeep from it. The
  // suspension check uses the tick-start stock, so a dry jar pays nothing (and stays dry
  // until production refills it past the upkeep).
  const wasSuspended = policiesSuspended(state);
  run.resources.culture += f.gross.culture * dt;
  if (!wasSuspended) {
    run.resources.culture = Math.max(0, run.resources.culture - policyUpkeep(state) * dt);
  }

  // Mana: production − construct upkeep, clamped at 0 (constructs still run gently when dry).
  run.resources.mana += (f.gross.mana - f.manaUpkeep) * dt;
  if (run.resources.mana < 0) run.resources.mana = 0;

  // Food: production − upkeep. If demand outran supply + stock, that is STARVATION —
  // clamp to 0 and flag it so population.ts can begin losing citizens.
  const nextFood = run.resources.food + (f.gross.food - f.foodUpkeep) * dt;
  if (nextFood < -EPS) {
    run.resources.food = 0;
    run.flags.starving = true;
    // The FIRST famine is a story beat (once per run); the repeating loss line lives in population.ts.
    if (run.flags.firstStarvationBeat !== true && run.population.total > 0) {
      run.flags.firstStarvationBeat = true;
      logEvent(state, "Hunger arrives. The granary's emptiness is suddenly very loud.", 'ev');
    }
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
    // STARVED copies switch themselves OFF rather than sitting idle burning nothing. Only the
    // shortfall caused by INPUTS counts: `c.copies` is already worker-limited, so a Steelworks
    // short of Smelters is not treated as short of fuel. The player must switch them back on,
    // which is the point — a stood-down building is visible, a silently idle one is not.
    const affordable = Math.floor(units / dt + EPS);
    if (affordable < c.copies) {
      setRecipeActive(state, c.id, c.recipe, affordable);
      if (run.flags[`stoodDown:${c.id}`] !== true) {
        run.flags[`stoodDown:${c.id}`] = true;
        logEvent(state, `${c.name} stands idle — nothing left to feed it.`, 'ev');
      }
    }
    if (units <= EPS) continue;
    for (const [res, per] of Object.entries(c.consume)) {
      run.resources[res as ResourceId] = Math.max(0, run.resources[res as ResourceId] - (per as number) * units);
    }
    for (const [res, per] of Object.entries(c.produce)) {
      run.resources[res as ResourceId] += (per as number) * units * magicYieldMult(state, res as ResourceId);
    }
  }

  // Clamp the capped resources to their effective caps (excess is lost): the mundane
  // materials + furs + mana crystals, plus RESEARCH (capped by science buildings) and GOLD
  // (capped by housing once Currency is in — effectiveCap returns Infinity before that, so
  // listing it here is harmless pre-coinage). Mana/culture/prismatic are uncapped.
  for (const id of ['wood', 'food', 'stone', 'iron', 'coal', 'steel', 'tools', 'engines', 'furniture', 'parchment', 'books', 'compendiums', 'furs', 'alchemical', 'manaCrystals', 'airEssence', 'earthEssence', 'fireEssence', 'waterEssence', 'research', 'gold', 'mana', 'culture'] as ResourceId[]) {
    const cap = effectiveCap(state, id);
    if (run.resources[id] > cap) run.resources[id] = cap;
    // A stock can never be negative — job upkeep simply stops taking once the store is dry.
    else if (run.resources[id] < 0) run.resources[id] = 0;
  }

  // First-of-a-resource story beats (once per run, flag-gated) — the moment a new good exists.
  for (const [res, flag, line] of RESOURCE_FIRSTS) {
    if (run.flags[flag] !== true && run.resources[res] > EPS) {
      run.flags[flag] = true;
      logEvent(state, line, 'ev');
    }
  }
}

/** Once-per-run chronicle beats for the first unit of a produced good. */
const RESOURCE_FIRSTS: [ResourceId, string, string][] = [
  ['coal', 'firstCoal', 'Coal catches. Hotter, longer, dirtier — progress, in a word.'],
  ['steel', 'firstSteel', 'The first steel cools. It rings when struck, like it knows.'],
  ['engines', 'firstEngine', 'An engine idles in the yard. Half the settlement calls it "him".'],
  ['books', 'firstBook', 'The first book is bound. Two citizens can read it.'],
  ['compendiums', 'firstCompendium', 'A compendium is finished. It settles three arguments and starts five.'],
  ['prismatic', 'firstPrismatic', 'The lens holds. Prismatic light pools like water that forgot to fall.'],
  ['alchemical', 'firstAlchemical', 'Jars of gland and herb line a shelf. Nobody is quite sure what for — yet.'],
];

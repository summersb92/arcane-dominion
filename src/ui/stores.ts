// Svelte store bridge — the thin UI adapter over the framework-agnostic engine.
// It owns the live GameState, drives the fixed-timestep tick from an rAF loop
// (the ONLY DOM the sim touches lives HERE, never in src/engine), and republishes
// a derived UiState to the panels at a throttled ~10 Hz rate.

import { writable } from 'svelte/store';
import { createAccumulator } from '../engine/tick';
import { newGame, type GameState } from '../engine/state';
import {
  RESOURCES,
  RESOURCE_BY_ID,
  type ResourceGroup,
  type ResourceId,
} from '../content/resources';
import { JOB_BY_ID, type JobId } from '../content/jobs';
import { BUILDING_BY_ID, type BuildingCategory, type BuildingEffect, type BuildingId } from '../content/buildings';
import { TECH_BY_ID, type TechId } from '../content/tech';
import {
  productionRates,
  foodBalance,
  resourceBreakdown,
  jobEffectiveProduces,
  type MultiplierLine,
} from '../engine/systems/production';
import { growthStatus, foodAllowsGrowth, type GrowthInfo } from '../engine/systems/population';
import { happiness, type HappinessInfo } from '../engine/systems/happiness';
import { calendar, type CalendarInfo } from '../engine/systems/calendar';
import { weather, type WeatherInfo } from '../engine/systems/weather';
import { effectiveCap } from '../engine/systems/caps';
import {
  jobsView,
  jobCapacity,
  idleSettlers,
  assignJob as engineAssignJob,
  unassignJob as engineUnassignJob,
} from '../engine/systems/jobs';
import {
  buildingsView,
  build as engineBuild,
  setRecipeActive as engineSetRecipeActive,
} from '../engine/systems/buildings';
import {
  governmentView,
  enactPolicy as engineEnactPolicy,
  revokePolicy as engineRevokePolicy,
  type GovernmentView,
} from '../engine/systems/government';
import type { PolicyId } from '../content/policies';
import { tradeView, buy as engineBuy } from '../engine/systems/trade';
import {
  educationView,
  setCurriculum as engineSetCurriculum,
  type EducationView,
} from '../engine/systems/education';
import type { CurriculumId } from '../content/education';
import { techView, research as engineResearch } from '../engine/systems/tech';
import { actionsView, doGather as engineDoGather } from '../engine/systems/actions';
import type { OfflineSummary } from '../engine/offline';
import { serialize, LOCALSTORAGE_KEY } from '../engine/save';
import type { Notation } from '../engine/format';
import { setNotation, fmt, fmtCost } from './format';
import { applyFont, applyFontScale } from './font';

const EPS = 1e-9;

// ---- UiState: the stable view contract the panels read ----
export interface ResourceView {
  id: ResourceId;
  label: string;
  glyph: string;
  amount: number;
  rate: number; // net /s — the TRUE production rate, shown even when the store is full
  cap: number; // Infinity for the uncapped magic currencies
  capped: boolean; // this resource has a finite storage cap (mundane)
  atCap: boolean; // amount is at/over the cap → gains are wasted
  magic: boolean;
  group: ResourceGroup; // display section in the resource column
  show: boolean; // progressive reveal — hide magic rows until discovered
  /** This resource is actively BLOCKING something (today: food holding back population
   *  growth) — the row shows a `!`. Distinct from atCap, which is about waste, not stalling. */
  warn?: boolean;
  warnText?: string; // hover title for the `!`
}
export interface PopulationView {
  total: number;
  idle: number;
  cap: number;
  foodBalance: number; // net food /s
  starving: boolean;
  name: string; // the settlement's name for its size — grows Camp → Small Village → … → City
  growth: GrowthInfo; // next-settler status + 0..1 progress toward it
  happiness: HappinessInfo; // 0..100 value + content/unhappy status + breakdown
}

/** The settlement's evolving name by population size — labels the settlement tab and its
 *  heading, and grows as the population does. */
function settlementName(pop: number): string {
  if (pop <= 0) return 'Camp';
  if (pop < 5) return 'Small Village';
  if (pop < 10) return 'Village';
  if (pop < 20) return 'Town';
  if (pop < 40) return 'Large Town';
  if (pop < 80) return 'City';
  return 'Metropolis';
}
export interface JobRowView {
  id: JobId;
  name: string;
  blurb: string;
  assigned: number;
  capacity: number;
  produceText: string; // e.g. "🪵 +0.5/s"
  canAssign: boolean; // an idle settler exists AND a free slot
  canUnassign: boolean; // at least one worker to pull
}
export interface BuildingRowView {
  id: BuildingId;
  name: string;
  blurb: string;
  count: number;
  costText: string; // e.g. "🪵15"
  /** The cost split per resource, each flagged if THIS resource is the one you're short of,
   *  so a two-resource building only reddens the half you can't pay (as research does). */
  costParts: { text: string; short: boolean }[];
  unlocked: boolean;
  affordable: boolean;
  maxed: boolean;
  construct: boolean;
  category: BuildingCategory; // Build-tab section this card files under
  converter: boolean; // has ≥1 convert effect → per-recipe toggle
  active: number; // total active copies (converters); else = count
  /** Per-recipe running counts + a derived rate hint for the toggle row's tooltip.
   *  `index` is the recipe's real position in the building's convert effects — locked
   *  recipes are filtered out, so the array position is NOT it. */
  recipes: { index: number; label: string; active: number; hint: string }[];
  disabled: boolean; // build button disabled
  reason: string; // why disabled ("maxed" / "can't afford"), else ''
  /** Tech ids researched so far, so the tooltip can hide effects still behind a gate. */
  techs: readonly string[];
}
export interface TechRowView {
  id: TechId;
  name: string;
  blurb: string;
  cost: number;
  costText: string; // "📜25"
  /** The cost split per resource, each flagged if THIS resource is the one you're short of,
   *  so a two-resource tech only reddens the half you can't pay. */
  costParts: { text: string; short: boolean }[];
  unlocks: string[];
  researched: boolean;
  available: boolean;
  affordable: boolean;
  disabled: boolean;
  reason: string; // "researched" / "needs prerequisites" / "can't afford", else ''
}
export interface ActionRowView {
  id: string;
  name: string;
  blurb: string;
  resource: ResourceId;
  resLabel: string; // the resource's plain label ("Wood") for the simple gather buttons
  amount: number;
  glyph: string;
  gainText: string; // "+1 🪵"
  available: boolean;
  retired: boolean; // storage cap hit the retire threshold → hand-gathering turned off
}
/** A market stall: what it sells, for how much, and whether the treasury covers it. */
export interface TradeRowView {
  id: string;
  resource: ResourceId;
  resLabel: string;
  amount: number;
  price: number;
  affordable: boolean;
}
export interface ChronicleView {
  text: string;
  /** 'season' renders as a dated divider rule rather than a log line. */
  kind?: 'ev' | 'found' | 'season';
}
export interface UiState {
  resources: ResourceView[];
  population: PopulationView;
  jobs: JobRowView[];
  buildings: BuildingRowView[];
  tech: TechRowView[];
  actions: ActionRowView[];
  tabs: { id: string; label: string; visible: boolean; locked: boolean; badge?: number }[];
  chronicle: ChronicleView[];
  calendar: CalendarInfo; // current date; the SEASON always shows, day/year need the tech
  weather: WeatherInfo; // the current spell and its swing on food (systems/weather.ts)
  government: GovernmentView; // forms + policies (systems/government.ts)
  trade: TradeRowView[]; // market stalls unlocked by Currency / Banking (systems/trade.ts)
  education: EducationView; // Arcanum yield, curriculum focus, opposition (systems/education.ts)
}

// ---- Tooltip system: ONE reusable, styled, themed hover tooltip ----
export interface TooltipLine {
  text: string;
  cls?: string; // 'ok' (produce), 'life' (consume), else muted
}
export interface TooltipSection {
  label: string;
  lines: TooltipLine[];
}
export interface TooltipContent {
  title: string;
  titleCls?: string; // CSS colour TOKEN name (used as var(--{titleCls}))
  sections: TooltipSection[];
  net?: TooltipLine;
  note?: string;
  blurb?: string;
  empty?: string;
}
export interface TooltipAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface TooltipState {
  visible: boolean;
  anchor: TooltipAnchor | null;
  content: TooltipContent | null;
}

// ---- display helpers ----
// All tooltip numbers route through the notation-aware fmt/fmtRate so tooltips agree
// with the resource rows (suffix/full/scientific setting included).
const numStr = (x: number): string => fmt(+x.toFixed(2));
const signStr = (x: number): string => (x < 0 ? '-' : '+');
function signedRate(x: number): string {
  return `${signStr(x)}${numStr(Math.abs(x))}/s`;
}
/** Colour token for a resource, so tooltips/labels tint by tier. */
function resToken(id: ResourceId): string {
  switch (id) {
    case 'food':
      return 'ok';
    case 'stone':
    case 'iron':
    case 'coal':
    case 'steel':
    case 'tools':
    case 'engines':
    case 'furniture':
      return 'dim';
    case 'parchment':
    case 'books':
    case 'compendiums':
      return 'insight';
    case 'mana':
    case 'manaCrystals':
    case 'airEssence':
    case 'earthEssence':
    case 'fireEssence':
    case 'waterEssence':
    case 'prismatic':
      return 'mana';
    case 'research':
      return 'insight';
    case 'gold':
      return 'gold';
    default:
      return 'gold'; // wood
  }
}
/** Format a cost map into "Wood 15 · Stone 10" — named, no icons. Costs render EXACTLY
 *  (never abbreviated or rounded), so the label always matches what the build charges. */
function costText(cost: Partial<Record<ResourceId, number>>): string {
  return (Object.entries(cost) as [ResourceId, number][])
    .map(([id, amt]) => `${RESOURCE_BY_ID[id].label} ${fmtCost(amt)}`)
    .join(' · ');
}
/** A job's EFFECTIVE per-worker output as "Wood +0.63/s" — after tool techs and the
 *  Workshop/Forge/Steam Works multipliers, so the tooltip matches real production. */
function jobProduceText(st: GameState, id: JobId): string {
  return (Object.entries(jobEffectiveProduces(st, id)) as [ResourceId, number][])
    .map(([res, per]) => `${RESOURCE_BY_ID[res].label} +${numStr(per)}/s`)
    .join(' · ');
}

/** A converter recipe's per-copy trade as "-0.3 Wood/s, -0.3 Iron/s → +0.2 Steel/s". */
function recipeText(
  consume: Partial<Record<ResourceId, number>>,
  produce: Partial<Record<ResourceId, number>>,
  requiresWorker?: JobId,
): string {
  const side = (m: Partial<Record<ResourceId, number>>, sign: string): string =>
    (Object.entries(m) as [ResourceId, number][])
      .map(([res, per]) => `${sign}${numStr(per)} ${RESOURCE_BY_ID[res].label}/s`)
      .join(', ');
  const inputs = side(consume, '-');
  const outputs = side(produce, '+');
  const trade = outputs ? `${inputs} → ${outputs}` : `${inputs} (fuel)`;
  const worker = requiresWorker ? ` · needs a ${JOB_BY_ID[requiresWorker].name}` : '';
  return `${trade} per active copy${worker}`;
}

/** Derive the tooltip "Effects" lines for a building from its data — the single source
 *  of truth, so blurbs stay flavor-only and numbers can never drift from the engine. */
function effectLines(id: BuildingId, techs: readonly string[] = []): TooltipLine[] {
  const def = BUILDING_BY_ID[id];
  if (!def) return [];
  const lines: TooltipLine[] = [];
  // Research-cap bonuses fold into a single total, counting only the halves whose tech is
  // in. A bonus you haven't unlocked yet is not advertised — it would read as a promise the
  // building isn't keeping.
  const capTotal = def.effects.reduce(
    (n, e) => (e.kind === 'researchCap' && (!e.requiresTech || techs.includes(e.requiresTech)) ? n + e.amount : n),
    0,
  );
  const push = (e: BuildingEffect): void => {
    switch (e.kind) {
      case 'popCap':
        lines.push({ text: `+${e.amount} housing`, cls: 'ok' });
        break;
      case 'cap':
        lines.push({ text: `+${e.amount} to every material cap` });
        break;
      case 'capExceptFood':
        lines.push({ text: `+${e.amount} to every material cap except Food` });
        break;
      case 'foodCap':
        lines.push({ text: `+${e.amount} Food cap` });
        break;
      case 'jobCapacity':
        lines.push({ text: `+${e.slots} ${JOB_BY_ID[e.job].name} job${e.slots > 1 ? 's' : ''}`, cls: 'ok' });
        break;
      case 'jobOutputMult':
        lines.push({ text: `+${Math.round(e.amount * 100)}% to every worker's output`, cls: 'ok' });
        break;
      case 'yieldBoost':
        lines.push({
          text: `+${Math.round(e.amount * 100)}% ${e.target === 'prismatic' ? 'Prismatic Mana' : 'elemental essence'} yield (per copy)`,
          cls: 'ok',
        });
        break;
      case 'jobBoost':
        lines.push({ text: `+${Math.round(e.amount * 100)}% ${JOB_BY_ID[e.job].name} output (per copy)`, cls: 'ok' });
        break;
      case 'produce':
        // A tech-gated output is INVISIBLE until its tech is in — the card must not name a
        // resource the player has never heard of (the Ranch and Alchemical Components, the
        // Mine and Mana Crystals). Same rule the gated researchCap follows.
        if (e.requiresTech && !techs.includes(e.requiresTech)) break;
        lines.push({ text: `+${numStr(e.perSec)} ${RESOURCE_BY_ID[e.resource].label}/s`, cls: 'ok' });
        break;
      case 'convert':
        // A locked recipe is invisible, exactly like a locked `produce`: a Quarry says
        // nothing of attuning until the attunement is researched.
        if (e.requiresTech && !techs.includes(e.requiresTech)) break;
        lines.push({ text: `${e.label ? `${e.label}: ` : ''}${recipeText(e.consume, e.produce, e.requiresWorker)}` });
        break;
      case 'manaUpkeep':
        lines.push({ text: `-${numStr(e.perSec)} Mana/s upkeep`, cls: 'life' });
        break;
      case 'resourceCap':
        lines.push({ text: `+${e.amount} ${RESOURCE_BY_ID[e.resource].label} storage`, cls: 'ok' });
        break;
      case 'cultureCap':
        lines.push({ text: `+${e.amount} Culture cap`, cls: 'ok' });
        break;
      case 'manaCap':
        lines.push({ text: `+${e.amount} Mana cap`, cls: 'ok' });
        break;
      case 'coinCap':
        // The treasury resource is labelled "Wealth" everywhere else — say the same here.
        lines.push({ text: `+${e.amount} Wealth cap`, cls: 'ok' });
        break;
      case 'researchCap':
        // Emitted once, at the first researchCap effect, as the combined total.
        if (capTotal > 0 && !lines.some((l) => l.text.endsWith('Research cap'))) {
          lines.push({ text: `+${capTotal} Research cap`, cls: 'ok' });
        }
        break;
      case 'happiness':
        lines.push({ text: `+${e.amount} happiness`, cls: 'ok' });
        break;
    }
  };
  for (const e of def.effects) push(e);
  return lines;
}

/**
 * What ONE copy of a building is actually worth per second, all in: passive output, plus
 * every running converter recipe's trade (output minus input), minus mana upkeep. The
 * Effects list above itemizes; this answers the question the itemization doesn't — "so does
 * this thing put me ahead or not?" Tech-gated effects stay out until their tech is in.
 */
function netProduceLines(id: BuildingId, techs: readonly string[] = []): TooltipLine[] {
  const def = BUILDING_BY_ID[id];
  if (!def) return [];
  const net: Partial<Record<ResourceId, number>> = {};
  const bump = (res: ResourceId, amt: number): void => {
    net[res] = (net[res] ?? 0) + amt;
  };
  for (const e of def.effects) {
    if (e.kind === 'produce') {
      if (e.requiresTech && !techs.includes(e.requiresTech)) continue;
      bump(e.resource, e.perSec);
    } else if (e.kind === 'convert') {
      if (e.requiresTech && !techs.includes(e.requiresTech)) continue;
      for (const [res, per] of Object.entries(e.produce)) bump(res as ResourceId, per as number);
      for (const [res, per] of Object.entries(e.consume)) bump(res as ResourceId, -(per as number));
    } else if (e.kind === 'manaUpkeep') {
      bump('mana', -e.perSec);
    }
  }
  const entries = (Object.entries(net) as [ResourceId, number][]).filter(([, v]) => Math.abs(v) > EPS);
  const lines: TooltipLine[] = entries.map(([res, v]) => ({
    text: `${RESOURCE_BY_ID[res].label}  ${signedRate(v)}`,
    cls: v > 0 ? 'ok' : 'life',
  }));

  // A WORKPLACE produces nothing on its own — it opens a job. Saying "nothing" would be
  // useless on a Farm, so report what a copy is worth once STAFFED, at the settlement's
  // current multipliers. That is the number the build decision actually turns on.
  for (const e of def.effects) {
    if (e.kind !== 'jobCapacity') continue;
    const per = jobEffectiveProduces(getState(), e.job);
    for (const [res, amt] of Object.entries(per) as [ResourceId, number][]) {
      if (Math.abs(amt) <= EPS) continue;
      lines.push({
        text: `${RESOURCE_BY_ID[res].label}  ${signedRate(amt * e.slots)}  (staffed)`,
        cls: amt > 0 ? 'ok' : 'life',
      });
    }
  }
  return lines;
}

// ---- derive the panel view-model from canonical state ----
export function toView(state: GameState): UiState {
  const run = state.run;
  const rates = productionRates(state);

  // Progressive reveal: wood/food/stone always; everything else appears once it is held,
  // produced, or (mana) once magic is discovered.
  const resources: ResourceView[] = RESOURCES.map((def) => {
    const amount = run.resources[def.id];
    // "magic" here is a DISPLAY group (only Mana). Research is uncapped like magic but
    // shows with the main resources, since it trickles from the very first settler.
    const magic = def.tier === 'magic';
    const cap = effectiveCap(state, def.id);
    const capped = Number.isFinite(cap);
    const atCap = capped && amount >= cap - EPS;
    // The rate is what the settlement PRODUCES, not what it manages to keep. A full store
    // still reports its output — you need to see what you're throwing away to know how much
    // storage to build. The gold at-cap fill is what says "none of this is landing".
    const rate = rates[def.id];
    let show = true;
    if (def.id === 'mana') {
      show = run.flags.magicDiscovered === true || amount > EPS || Math.abs(rate) > EPS;
    } else if (def.id === 'iron') {
      // Ore — revealed only once the first is mined (held or being produced). A Mine (Miner
      // or its passive) is what first yields it.
      show = amount > EPS || rates.iron > EPS;
    } else if (def.id === 'coal') {
      // Fuel — revealed once the first is dug/charred (Coal Mine or Charcoal Ground).
      show = amount > EPS || rates.coal > EPS;
    } else if (def.id === 'steel') {
      // Refined at the Steelworks — revealed once the first is produced.
      show = amount > EPS || rates.steel > EPS;
    } else if (def.id === 'tools' || def.id === 'engines' || def.id === 'furniture') {
      // Industrial goods — revealed once the first is produced (Toolworks / Engine Works / Factory).
      show = amount > EPS || rates[def.id] > EPS;
    } else if (def.id === 'parchment' || def.id === 'books' || def.id === 'compendiums') {
      // Knowledge-chain goods — revealed once the first is produced (Tannery / Scriptorium / Archive).
      show = amount > EPS || rates[def.id] > EPS;
    } else if (
      def.id === 'airEssence' ||
      def.id === 'earthEssence' ||
      def.id === 'fireEssence' ||
      def.id === 'waterEssence' ||
      def.id === 'prismatic'
    ) {
      // Prismatic essences — revealed once the discipline yields its first drop.
      show = amount > EPS || rates[def.id] > EPS;
    } else if (def.id === 'manaCrystals') {
      // Mined proto-magic material — revealed only once discovered (held or being produced).
      // A Mine yields it once Crystallurgy is researched.
      show = amount > EPS || rates.manaCrystals > EPS;
    } else if (def.id === 'research') {
      show =
        amount > EPS || rates.research > EPS || jobCapacity(state, 'scholar') > 0 || run.tech.length > 0;
    } else if (def.id === 'gold') {
      // The treasury — revealed once the first coin is earned (a Harbour, Market or Bank).
      show = amount > EPS || rates.gold > EPS;
    } else if (def.id === 'culture') {
      // A future currency, revealed only once discovered (produced/held) — same progressive
      // reveal as research/mana. An Entertainer at the Amphitheater is what first yields it.
      show = amount > EPS || rates.culture > EPS;
    } else if (def.id === 'furs') {
      // Luxury good — revealed only once discovered (held or being produced). A Hunter at
      // the Hunter's Lodge is what first yields it.
      show = amount > EPS || rates.furs > EPS;
    } else if (def.id === 'alchemical') {
      // Revealed by the ALCHEMY tech itself — the point of the tech is learning that these
      // are worth keeping — and thereafter by holding or producing any.
      show = state.run.tech.includes('alchemy' as never) || amount > EPS || rates.alchemical > EPS;
    }
    // Food carries a growth warning: when neither a surplus nor a deep enough reserve is
    // there, the settlement simply stops growing — and that is invisible from the rate alone.
    const warn = def.id === 'food' && !foodAllowsGrowth(state);
    return {
      id: def.id,
      label: def.label,
      glyph: def.glyph,
      amount,
      rate,
      cap,
      capped,
      atCap,
      magic,
      group: def.group,
      show,
      warn,
      warnText: warn ? 'Population growth is paused — food is neither in surplus nor deeply stocked.' : undefined,
    };
  });

  const jv = jobsView(state);
  const idle = jv.idle;
  const jobs: JobRowView[] = jv.jobs.map((j) => ({
    id: j.id,
    name: j.name,
    blurb: JOB_BY_ID[j.id].blurb,
    assigned: j.assigned,
    capacity: j.capacity,
    produceText: jobProduceText(state, j.id),
    canAssign: idle > 0 && j.assigned < j.capacity,
    canUnassign: j.assigned > 0,
  }));

  const buildings: BuildingRowView[] = buildingsView(state).map((b) => {
    const disabled = b.maxed || !b.affordable || !b.unlocked;
    const reason = b.maxed ? 'built to max' : !b.affordable ? "can't afford" : '';
    return {
      id: b.id,
      name: b.name,
      blurb: b.blurb,
      count: b.count,
      costText: costText(b.cost),
      costParts: (Object.entries(b.cost) as [ResourceId, number][]).map(([id, amt]) => ({
        text: `${RESOURCE_BY_ID[id].label} ${fmtCost(amt)}`,
        // Matches the engine's affordability tolerance (systems/buildings.ts).
        short: (run.resources[id] ?? 0) < amt - 1e-6,
      })),
      unlocked: b.unlocked,
      affordable: b.affordable,
      maxed: b.maxed,
      construct: b.construct,
      category: b.category,
      converter: b.converter,
      active: b.active,
      recipes: b.recipes.map((r) => ({
        index: r.index,
        label: r.label,
        active: r.active,
        hint: recipeText(r.consume, r.produce, r.requiresWorker),
      })),
      disabled,
      reason,
      techs: run.tech as readonly string[],
    };
  });

  const tech: TechRowView[] = techView(state).map((t) => {
    const disabled = t.researched || !t.available || !t.affordable;
    const reason = t.researched
      ? 'researched'
      : !t.available
        ? 'needs prerequisites'
        : !t.affordable
          ? 'need more research'
          : '';
    // Full cost = research plus any material cost, e.g. "Research 10 · Stone 10".
    const fullCost: Partial<Record<ResourceId, number>> = { research: t.cost, ...t.resourceCost };
    // Per-resource shortfall, matching the engine's affordability tolerance (systems/tech.ts).
    // A zero entry is not a cost — Folk Lore asks for culture and no research at all, and
    // "Research 0" would read as a price rather than the absence of one.
    const costParts = (Object.entries(fullCost) as [ResourceId, number][])
      .filter(([, amt]) => amt > 0)
      .map(([id, amt]) => ({
        text: `${RESOURCE_BY_ID[id].label} ${fmtCost(amt)}`,
        short: (run.resources[id] ?? 0) < amt - 1e-6,
      }));
    return {
      id: t.id,
      name: t.name,
      blurb: t.blurb,
      cost: t.cost,
      costText: costParts.map((p) => p.text).join(' · '),
      costParts,
      unlocks: t.unlocks,
      researched: t.researched,
      available: t.available,
      affordable: t.affordable,
      disabled,
      reason,
    };
  });

  const actions: ActionRowView[] = actionsView(state).map((a) => {
    const meta = RESOURCE_BY_ID[a.resource as ResourceId];
    return {
      id: a.id,
      name: a.name,
      blurb: a.blurb,
      resource: a.resource as ResourceId,
      resLabel: meta.label,
      amount: a.amount,
      glyph: meta.glyph,
      gainText: `+${numStr(a.amount)} ${meta.label}`,
      available: a.available,
      retired: a.retired,
    };
  });

  return {
    resources,
    population: {
      total: run.population.total,
      idle,
      cap: run.popCap,
      foodBalance: foodBalance(state),
      starving: run.flags.starving === true,
      name: settlementName(run.population.total),
      growth: growthStatus(state),
      happiness: happiness(state),
    },
    jobs,
    buildings,
    tech,
    actions,
    tabs: [
      // Gather lives in the side rail (3 buttons); Build is the main view.
      { id: 'build', label: 'Build', visible: true, locked: false },
      // The settlement tab is named for its size and grows with the population. The badge
      // shows IDLE settlers, so you know when to visit without leaving Build/Research.
      { id: 'jobs', label: settlementName(run.population.total), visible: true, locked: false, badge: idle > 0 ? idle : undefined },
      { id: 'research', label: 'Research', visible: true, locked: false },
    ],
    chronicle: run.chronicle
      .slice(-chronicleLines(state))
      .reverse()
      .map((c) => ({ text: c.text, kind: c.kind })),
    calendar: calendar(state),
    weather: weather(state),
    government: governmentView(state),
    trade: tradeView(state).map((p) => ({
      id: p.id,
      resource: p.resource as ResourceId,
      resLabel: RESOURCE_BY_ID[p.resource as ResourceId].label,
      amount: p.amount,
      price: p.price,
      affordable: p.affordable,
    })),
    education: educationView(state, (id) => RESOURCE_BY_ID[id].label),
  };
}

/** How many Chronicle lines to show — the setting, clamped to a sane 5..10. */
function chronicleLines(state: GameState): number {
  const n = state.settings?.chronicleLines ?? 8;
  return Math.max(5, Math.min(10, Math.round(n)));
}

// ---- the reusable tooltip store + content builders ----
export const tooltip = writable<TooltipState>({ visible: false, anchor: null, content: null });

export function showTooltip(content: TooltipContent, anchor: TooltipAnchor): void {
  tooltip.set({ visible: true, anchor, content });
}
export function hideTooltip(): void {
  tooltip.update((t) => ({ ...t, visible: false }));
}
/** Show `content` anchored to the event target's bounding rect (one-line panel wiring). */
export function openTip(e: Event, content: TooltipContent): void {
  const el = e.currentTarget as HTMLElement | null;
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  const r = el.getBoundingClientRect();
  showTooltip(content, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
}

/** Render one multiplier line: a true factor as `×1.25`, an additive share of a stacking
 *  group as `+6%`. Both are "this much more", written the way the mechanic actually works. */
function multText(m: MultiplierLine): string {
  if (m.add !== undefined) {
    const pct = m.add * 100;
    return `${pct >= 0 ? '+' : ''}${+pct.toFixed(1)}%  ${m.label}`;
  }
  return `×${(m.mult ?? 1).toFixed(2)}  ${m.label}`;
}

/** Whether a multiplier line HELPS (green) or hurts (red) — a winter or a sour mood is a
 *  penalty and should not read like a bonus. */
function multCls(m: MultiplierLine): string {
  const good = m.add !== undefined ? m.add >= 0 : (m.mult ?? 1) >= 1;
  return good ? 'ok' : 'life';
}

/** What to do about a full store, named for the resource — the advice has to be actionable.
 *  Mana in particular is carried in PEOPLE, so "build a Storehouse" is simply wrong for it. */
function atCapNote(id: ResourceId): string {
  switch (id) {
    case 'mana':
      return 'At cap — further mana is lost. Mana is carried in settlers: grow the population, or raise an Arcane Font or Arcanum to deepen the pool.';
    case 'research':
      return 'At cap — further research is lost. Raise a Library, Observatory or Academy to shelve more.';
    case 'culture':
      return 'At cap — further culture is forgotten. Civic works (Temple, Forum, Monastery) are what let a settlement hold more.';
    case 'gold':
      return 'At cap — further wealth has nowhere to sit. Houses and a Harbour hold the treasury.';
    case 'food':
      return 'At cap — further food spoils. Build a Granary.';
    case 'airEssence':
    case 'earthEssence':
    case 'fireEssence':
    case 'waterEssence':
      return 'At cap — further essence disperses. Spend it, or raise storage.';
    default:
      return 'At cap — further gains are wasted. Build a Storehouse.';
  }
}

/** Resource row tooltip: who makes it, what boosts it, who eats it, and the net. */
export function resourceTooltip(r: ResourceView): TooltipContent {
  // Show the MATH: who produces this resource, who consumes it, and the net /s.
  const bd = resourceBreakdown(getState(), r.id);
  const sections: TooltipSection[] = [];
  if (bd.producers.length) {
    sections.push({
      label: 'Produced by',
      lines: bd.producers.map((p) => ({ text: `${p.label}  ${signedRate(p.amount)}`, cls: 'ok' })),
    });
  }
  // The boosts already baked into those figures — the "why is my Farm worth more than it
  // says on the tin" line the build cards can't show.
  if (bd.producerMults.length) {
    sections.push({
      label: 'Multipliers',
      lines: bd.producerMults.map((m) => ({ text: multText(m), cls: multCls(m) })),
    });
  }
  if (bd.consumers.length) {
    sections.push({
      label: 'Consumed by',
      lines: bd.consumers.map((c) => ({ text: `${c.label}  ${signedRate(c.amount)}`, cls: 'life' })),
    });
  }
  if (bd.consumerMults.length) {
    sections.push({
      label: 'Multipliers',
      lines: bd.consumerMults.map((m) => ({ text: multText(m), cls: multCls(m) })),
    });
  }
  sections.push({
    label: 'Net',
    lines: [
      {
        text: Math.abs(bd.net) < EPS ? '—' : signedRate(bd.net),
        cls: bd.net > EPS ? 'ok' : bd.net < -EPS ? 'life' : undefined,
      },
    ],
  });
  // No "Stored" section: the row itself already reads `amount / cap` right beside the cursor.
  const note = r.atCap ? atCapNote(r.id) : undefined;
  return { title: r.label, titleCls: resToken(r.id), sections, note };
}

/** Gather action tooltip. */
export function actionTooltip(a: ActionRowView): TooltipContent {
  return {
    title: a.name,
    sections: [{ label: 'Yields', lines: [{ text: a.gainText, cls: 'ok' }] }],
    note: 'Hold to keep gathering.',
    blurb: a.blurb,
  };
}

/** Building card tooltip: cost, count, and DERIVED effect lines (from the data, so the
 *  numbers can never drift from the engine). The blurb stays pure flavor. */
export function buildingTooltip(b: BuildingRowView): TooltipContent {
  const sections: TooltipSection[] = [
    {
      label: 'Cost',
      // One line per resource: only the one you're actually short of reads red.
      lines: b.costParts.length
        ? b.costParts.map((p) => ({ text: p.text, cls: p.short ? 'life' : undefined }))
        : [{ text: '—' }],
    },
  ];
  const fx = effectLines(b.id, b.techs);
  if (fx.length) sections.push({ label: 'Effects', lines: fx });
  // The bottom line, always: what a copy nets per second once its inputs and upkeep are
  // paid. (The count already sits on the card as a ×N chip, so no "Built" row here.)
  const net = netProduceLines(b.id, b.techs);
  if (net.length) sections.push({ label: 'Net per copy', lines: net });
  const note = b.maxed ? 'Built to its maximum.' : !b.affordable ? "You can't afford this yet." : undefined;
  return {
    title: b.construct ? `${b.name} · construct` : b.name,
    titleCls: b.construct ? 'mana' : undefined,
    sections,
    note,
    blurb: b.blurb,
  };
}

/** Job row tooltip: output + capacity. Jobs no longer consume food (only settlers do). */
export function jobTooltip(j: JobRowView): TooltipContent {
  return {
    title: j.name,
    sections: [
      { label: 'Each', lines: [{ text: j.produceText, cls: 'ok' }] },
      { label: 'Slots', lines: [{ text: `${j.assigned} / ${j.capacity}` }] },
    ],
    blurb: j.blurb,
  };
}

/** Tech card tooltip: cost, unlocks, prerequisites BY NAME when unmet, blurb. */
export function techTooltip(t: TechRowView): TooltipContent {
  const sections: TooltipSection[] = [
    {
      label: 'Cost',
      // One line per resource: only the one you're actually short of reads red.
      lines: t.costParts.map((p) => ({ text: p.text, cls: p.short && !t.researched ? 'life' : undefined })),
    },
  ];
  if (t.unlocks.length) {
    sections.push({ label: 'Unlocks', lines: t.unlocks.map((u) => ({ text: u, cls: 'ok' })) });
  }
  // Name the prerequisites when they're the blocker, so "needs prerequisites" isn't a riddle.
  if (!t.researched && !t.available) {
    const req = TECH_BY_ID[t.id]?.requires ?? [];
    if (req.length) {
      sections.push({
        label: 'Requires',
        lines: req.map((r) => ({
          text: TECH_BY_ID[r]?.name ?? r,
          cls: getState().run.tech.includes(r) ? 'ok' : 'life',
        })),
      });
    }
  }
  const note = t.researched ? 'Already researched.' : t.reason || undefined;
  return { title: t.name, titleCls: t.researched ? 'ok' : undefined, sections, note, blurb: t.blurb };
}

/** Happiness readout tooltip — the full signed breakdown, themed (replaces the native title). */
export function happinessTooltip(h: HappinessInfo): TooltipContent {
  return {
    title: 'Moral',
    titleCls: h.status === 'content' ? 'ok' : 'life',
    sections: [
      {
        label: 'Breakdown',
        lines: h.breakdown.map((b) => ({
          // A luxury that isn't stocked deeply enough to pay its full bonus reads AMBER,
          // not green: it IS helping, but there is morale left on the table.
          text: `${b.label}  ${b.amount >= 0 ? '+' : ''}${Math.round(b.amount * 10) / 10}${b.short ? ' ⚠' : ''}`,
          cls: b.short ? 'warn' : b.amount >= 0 ? 'ok' : 'life',
        })),
      },
      {
        // Happiness is capped at 100, so this multiplier tops out at exactly ×1.00 — full
        // contentment is the BASELINE, not a bonus. Everything below it is lost work.
        label: 'Output',
        lines: [
          {
            text: `All worker & idle output  ×${(Math.max(0, Math.min(100, h.value)) / 100).toFixed(2)}`,
            cls: h.value >= 100 ? 'ok' : 'life',
          },
        ],
      },
    ],
    note: h.status === 'unhappy' ? 'Below the growth threshold — the settlement will not grow.' : undefined,
  };
}

/** Growth card tooltip — what the bar is filling toward, or why it is paused. */
export function growthTooltip(g: GrowthInfo): TooltipContent {
  const why: Record<string, string> = {
    growing: 'A sustainable food surplus and free housing — a settler is on the way.',
    starving: 'Food has run out. Settlers will be lost until the balance recovers.',
    full: 'Housing is full. Build more homes to grow.',
    unhappy: 'The settlement is unhappy. Raise happiness to resume growth.',
    stalled: 'Growth needs a food surplus in stock and free housing.',
  };
  return {
    title: 'Population growth',
    sections: [{ label: 'Status', lines: [{ text: why[g.status] ?? g.status }] }],
  };
}

// ---- live state + stores ----
let state: GameState = newGame();

export const game = writable<UiState>(toView(state));
export const activeTab = writable<string>('build');
export const offlineSummary = writable<OfflineSummary | null>(null);
export const systemOpen = writable<boolean>(false);

export function getState(): GameState {
  return state;
}

/** Persist the current state to localStorage NOW, in the one portable format. */
export function persist(): void {
  try {
    state.lastSaved = Date.now();
    localStorage.setItem(LOCALSTORAGE_KEY, serialize(state));
  } catch {
    /* quota / unavailable — ignore, autosave will retry */
  }
}

/** Apply an imported GameState (from a file/string) and persist it immediately. */
export function importState(next: GameState): void {
  setState(next);
  persist();
}

/** Hard reset: discard the current save and start a brand-new settlement. */
export function resetGame(): void {
  state = newGame();
  setNotation(state.settings.notation);
  applyFont(state.settings.font);
  applyFontScale(state.settings.fontScale);
  activeTab.set('build');
  persist();
  publish();
}

/** Change the number-notation setting: persist it into the save + re-render. */
export function setNotationSetting(n: Notation): void {
  state.settings.notation = n;
  setNotation(n);
  persist();
  publish();
}

/** Change how many Chronicle lines are shown (clamped 5..10): persist + re-render. */
export function setChronicleLinesSetting(n: number): void {
  state.settings.chronicleLines = Math.max(5, Math.min(10, Math.round(n)));
  persist();
  publish();
}

/** Change the UI font key: persist + re-render (the panel applies the family). */
export function setFontSetting(f: string): void {
  state.settings.font = f;
  persist();
  publish();
}

/** Change the UI scale (percent, clamped 80..160): persist + apply + re-render. */
export function setFontScaleSetting(pct: number): void {
  state.settings.fontScale = Math.max(80, Math.min(160, Math.round(pct)));
  applyFontScale(state.settings.fontScale);
  persist();
  publish();
}

export function setState(next: GameState): void {
  state = next;
  setNotation(state.settings.notation);
  publish();
}

/** Push the current engine state into the Svelte store (throttled by the loop). */
export function publish(): void {
  game.set(toView(state));
}

// ---- panel actions: call the engine, then publish ----
export function doGather(id: string): void {
  engineDoGather(state, id);
  publish();
}
export function build(id: BuildingId): void {
  engineBuild(state, id);
  publish();
}
/** Toggle a converter building: set recipe `r` to run `n` copies (clamped so the total ≤ count). */
export function setRecipeActive(id: BuildingId, r: number, n: number): void {
  engineSetRecipeActive(state, id, r, n);
  publish();
}
export function assignJob(id: JobId, n = 1): void {
  engineAssignJob(state, id, n);
  publish();
}
export function unassignJob(id: JobId, n = 1): void {
  engineUnassignJob(state, id, n);
  publish();
}
export function research(id: TechId): void {
  engineResearch(state, id);
  publish();
}
export function enactPolicy(id: PolicyId): void {
  engineEnactPolicy(state, id);
  publish();
}
export function revokePolicy(id: PolicyId): void {
  engineRevokePolicy(state, id);
  publish();
}
/** Buy a lot of goods at the market (spends gold). */
export function buy(id: string): void {
  engineBuy(state, id);
  publish();
}
/** Teach a discipline at the Arcanum (null = general studies). */
export function setCurriculum(id: CurriculumId | null): void {
  engineSetCurriculum(state, id);
  publish();
}

// re-export so panels can read the derived idle count if needed
export { idleSettlers };

let running = false;
let lastFrame = 0; // performance.now() timebase for the rAF loop (module-scoped so it can be re-seeded)

/** Start the real-time loop: rAF feeds wall-time into the engine accumulator. */
export function startLoop(): void {
  if (running || typeof requestAnimationFrame === 'undefined') return;
  running = true;
  setNotation(state.settings.notation);

  const acc = createAccumulator();
  lastFrame = performance.now();
  let sincePublish = 0;

  const frame = (now: number): void => {
    const elapsed = (now - lastFrame) / 1000;
    lastFrame = now;
    acc.advance(state, Math.min(elapsed, 1)); // clamp huge gaps (tab was backgrounded)
    sincePublish += elapsed;
    if (sincePublish >= 0.1) {
      // ~10 Hz UI publish, decoupled from the 0.1s sim step
      publish();
      sincePublish = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * Re-seed the rAF timebase to "now" so the next frame measures ~0 elapsed. Called
 * right after a foreground offline catch-up (main.ts visibilitychange) so the first
 * resumed frame doesn't double-count the idle gap the catch-up already replayed.
 */
export function resumeTimebase(): void {
  if (typeof performance !== 'undefined') lastFrame = performance.now();
}

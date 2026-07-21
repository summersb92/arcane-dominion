// Svelte store bridge — the thin UI adapter over the framework-agnostic engine.
// It owns the live GameState, drives the fixed-timestep tick from an rAF loop
// (the only DOM the sim touches lives HERE, never in src/engine), and republishes
// a derived UiState to the panels at a throttled rate.

import { writable } from 'svelte/store';
import { createAccumulator } from '../engine/tick';
import { newGame, type GameState, ELEMENTS, type ElementId, type ResourceId, type VitalId } from '../engine/state';
import { breakdown, type Breakdown } from '../engine/systems/breakdown';
import { AMOUNT_LABEL, TASKS, type Amount, type Requirement, type TaskDef, type TaskType } from '../content/tasks';
import { SHOW_FOUNDING } from '../content/config';
import { CANTRIP_BY_ID } from '../content/cantrips';
import {
  EQUIP_POSITIONS,
  EQUIP_POSITION_LABEL,
  HOME_ITEMS,
  HOME_ITEM_BY_ID,
  HOME_TIERS,
  HOME_TIER_BY_ID,
  type EquipPosition,
  type EquipSlotType,
  type HomeItem,
  type Modifier,
} from '../content/home';
import {
  listTaskInfo,
  taskRates,
  slotsUsed,
  activitySlots,
  canAfford,
  meetsRequirements,
  resolveAffinityId,
  doTask,
  startTask,
  stopTask,
  toggleRepeat as engineToggleRepeat,
  type TaskInfo,
} from '../engine/systems/tasks';
import { learnCantrip as engineLearnCantrip, listCantripInfo, outputMult } from '../engine/systems/skills';
import { setName as engineSetName, strength as engineStrength } from '../engine/systems/player';
import { essenceRates } from '../engine/systems/essence';
import {
  homeTier,
  homeSlots,
  homeSlotsUsed,
  homeResourceRates,
  effectiveCap,
  effectiveRegen,
  moveHome as engineMoveHome,
  buyItem as engineBuyItem,
  equipItem as engineEquipItem,
  unequipItem as engineUnequipItem,
  equipGear as engineEquipGear,
  unequipGear as engineUnequipGear,
  unequipBeltItem as engineUnequipBeltItem,
  isGearEquipped,
} from '../engine/systems/home';
import { canFound, foundingStatus } from '../engine/systems/founding';
import type { OfflineSummary } from '../engine/offline';
import { serialize, LOCALSTORAGE_KEY } from '../engine/save';
import type { Notation } from '../engine/format';
import { setNotation } from './format';
import { applyFont } from './font';

// ---- UiState: the stable view contract the panels read ----
export interface ResourceView {
  amount: number;
  rate: number;
  cap?: number;
  atCap?: boolean; // amount is at/over the cap → gains are wasted (dim the rate)
}
export interface VitalView {
  cur: number;
  max: number;
  regen: number; // per-second recovery toward max
}
export interface EssenceView {
  id: string;
  label: string;
  glyph: string;
  cls: string;
  amount: number;
  rate: number;
  awakened: boolean;
}
export interface TaskView {
  id: string;
  name: string;
  type: TaskType;
  kind: string; // chip label ("Instant", "Running · 15s", "Perpetual", "Upgrade")
  cls: string; // coloured left-edge / element class
  panel: 'main' | 'home'; // which tab hosts this card
  group: string; // raw category (Contract / Fixture / Founding / …) the UI splits on
  tag: string; // category (+ "Max n · c/n" for Limited)
  io: string; // cost → output line
  active: boolean;
  locked: boolean; // requirements unmet or Limited maxed → dim & non-clickable
  revealed: boolean; // DISPLAY-ONLY: whether to show the card (far-locked → hidden)
  paused: boolean;
  progress: number; // 0..1 (timed tasks)
  timed: boolean; // running/limited → show a progress meter
  affordable: boolean; // startCost payable now
  startable: boolean; // can start/do this instant
  payoff: string; // Card Payoff Preview: net "/s" (continuous) or per-action (instant)
  atText?: string; // At-N repeat-scaling chip
  pausedReason?: string; // "needs ⚡ Stamina" when auto-paused
  slotNote?: string; // "No free Activity slot"
  lockText?: string; // requirement/maxed hint when locked
  repeat: boolean; // ↻ toggle state (running)
  canRepeat: boolean; // running tasks expose the ↻ toggle
  count: number; // completions
  capMark?: string; // "*" when an Insight cost exceeds the Insight cap
  capNote?: string; // hover text for the `*` marker
  // Hover-tooltip pieces (v0.1.1) — reuse existing formatters, split so the tooltip
  // can show Time / Consumed / Output / flavour separately.
  timeText: string; // = kind ("Instant", "Running · 15s", "Upgrade · 8s", …)
  costText: string; // consumed: startCost / per-second runCost with glyphs ("" if none)
  outputText: string; // produced resources/effects ("a random basic material" for Scavenge)
  blurb?: string; // one-line flavour
}
export interface CantripView {
  id: string;
  name: string;
  blurb: string;
  cls: string; // left-edge colour class (awakened element, else insight)
  cost: string; // formatted "◈20"
  status: 'owned' | 'available' | 'locked';
  affordable: boolean; // Insight ≥ cost right now (and within the cap)
  learnable: boolean; // available + affordable + within cap → clickable
  effectText: string; // what learning it does
  prereqNote?: string; // "needs: Read the Page" when locked on a prereq
  capMark?: string; // "*" when cost exceeds the Insight cap
  capNote?: string; // hover text for the `*` marker
  scrollCost: number; // Scrolls 📜 required to learn (0 for the opener; v0.1.2)
  hasScroll: boolean; // enough Scrolls on hand → false surfaces a "needs a Scroll" hint
}
export interface TabView {
  id: string;
  label: string;
  visible: boolean;
  locked: boolean;
}
/** One of the six D&D-style attributes. The `value` IS the level — a multiplier that
 *  starts at ×1.00 and grows; there is no separate level number. Only Strength grows so
 *  far (from physical labour); the rest sit at ×1.00 until their growth is wired. */
export interface AttributeView {
  key: string;
  label: string;
  glyph: string;
  value: number; // multiplier, ×1.00 at the start
  hint: string; // tooltip: what it governs / how it grows
}
export interface PlayerView {
  name: string; // the mage's chosen name ('' → not yet named)
  title: string; // earned honorific ('Waif' at the Origin)
  renown: number; // ★ Renown (mirrored here; also stays in resources for now)
  needsNaming: boolean; // true on a fresh game / post-reset / old save → prompt for a name
  attributes: AttributeView[]; // the six attributes (STR/DEX/CON/INT/WIS/CHA), always shown
}
export interface ChronicleView {
  t: string;
  text: string;
  kind?: 'ev' | 'found';
}
export interface FoundingReqView {
  label: string;
  met: boolean;
  have?: number; // resource reqs (Gold/Renown)
  need?: number;
  note?: string; // flag reqs (Charter/Site)
}
export interface FoundingView {
  phase: string;
  founded: boolean;
  canFound: boolean; // gate open right now (all four met, not yet founded)
  metCount: number;
  total: number;
  reqs: FoundingReqView[]; // Gold · Renown · Charter · Site
}
export interface HomeTierView {
  id: string;
  name: string;
  slots: number;
  cost: string; // formatted moveCost / rent / "free"
  locked: boolean; // not the current tier and not reachable now
  reason?: string; // why locked (from-chain or unmet requirement)
  current: boolean; // this is where you live
  reachable: boolean; // from-chain + requirements met (afford handled by the action)
  modsSummary: string; // human summary of the tier's innate modifiers ("" if none)
  blurb: string; // flavour text for the hover tooltip
}
export interface HomeItemView {
  id: string;
  name: string;
  cost: string; // formatted purchase cost
  owned: boolean;
  equipped: boolean;
  affordable: boolean; // purchasable right now
  locked: boolean; // requirement unmet (e.g. Mana Crystal needs Inner Wellspring)
  reason?: string; // why locked
  modsSummary: string; // human summary of the item's modifiers
  blurb: string; // flavour text for the hover tooltip
  gear: boolean; // true → paper-doll gear (equipped on the Player tab); false → generic housing furnishing (Home tab)
}
export interface HomeView {
  tier: string; // current tier id
  name: string; // current tier name
  blurb: string;
  slots: number; // total item slots
  used: number; // equipped count
  tiers: HomeTierView[];
  items: HomeItemView[];
}
// ---- paper-doll EQUIPMENT view (v0.1.3 — the Player tab) ----
/** One doll position (head, amulet, … ring1, ring2), with the gear worn there (or null). */
export interface EquipSlotView {
  position: EquipPosition;
  slotLabel: string; // "Head", "Ring I", …
  item: HomeItemView | null;
}
/** The belt sub-slots opened by the equipped belt (count 0 when no belt is worn). */
export interface BeltView {
  count: number; // number of sub-slots the equipped belt provides
  items: (HomeItemView | null)[]; // sub-slot contents (length === count)
}
/** OWNED, not-yet-equipped gear of one slot type, so the UI can offer "equip into <slot>". */
export interface OwnedGearGroup {
  slot: EquipSlotType; // the item slot-type these share
  slotLabel: string; // human label ("Ring", "Belt", …)
  items: HomeItemView[];
}
export interface EquipmentView {
  slots: EquipSlotView[]; // the eleven doll positions, in render order
  belt: BeltView; // belt sub-slots
  ownedGear: OwnedGearGroup[]; // owned-but-unequipped gear, grouped by slot type
}
export interface UiState {
  resources: { gold: ResourceView; insight: ResourceView; renown: ResourceView };
  materials: { moonpetal: number; ironOre: number; spiritDust: number; scroll: number };
  // Progressive reveal (v0.1.6): which resources the player has discovered (ever held > 0).
  // The left panel shows Gold always, and each Insight/material row only once discovered.
  discovered: Partial<Record<ResourceId, boolean>>;
  player: PlayerView;
  vitals: { life: VitalView; stamina: VitalView; mana: VitalView };
  essence: EssenceView[];
  tabs: TabView[];
  tasks: TaskView[];
  cantrips: CantripView[];
  slots: { used: number; total: number };
  home: HomeView;
  equipment: EquipmentView;
  founding: FoundingView;
  chronicle: ChronicleView[];
}

// ---- Tooltip system (v0.1.1): ONE reusable, styled, themed hover tooltip ----
// Structured content the global tooltip element renders (Tooltip.svelte). Reused by
// BOTH the task cards (Time / Consumed / Output / blurb) and the resource / vital /
// essence breakdowns (Produces / Consumes / Multipliers / Net). Sections with no
// lines are simply omitted by the builders below.
export interface TooltipLine {
  text: string;
  cls?: string; // colour class: 'ok' (produce/output), 'life' (consume), else muted
}
export interface TooltipSection {
  label: string;
  lines: TooltipLine[];
}
export interface TooltipContent {
  title: string;
  titleCls?: string; // a CSS colour TOKEN name (used as var(--{titleCls})) — e.g. 'gold', 'fire', 'stam'
  sections: TooltipSection[];
  net?: TooltipLine; // footer "Net" line (breakdowns)
  note?: string; // muted note (at cap / sealed)
  blurb?: string; // muted italic flavour (task cards)
  empty?: string; // shown when there are no sections (e.g. nothing producing this)
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

const ELEMENT_META: Record<ElementId, { label: string; glyph: string; cls: string }> = {
  prism: { label: 'Prismatic', glyph: '❖', cls: 'prism' },
  fire: { label: 'Fire', glyph: '▲', cls: 'fire' },
  water: { label: 'Water', glyph: '▼', cls: 'water' },
  earth: { label: 'Earth', glyph: '⬢', cls: 'earth' },
  air: { label: 'Air', glyph: '≈', cls: 'air' },
  dark: { label: 'Dark', glyph: '☾', cls: 'dark' },
  light: { label: 'Light', glyph: '☀', cls: 'lightc' },
};

function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ---- task display helpers (glyphs + cost/output/payoff strings) ----
const GLYPH: Record<string, string> = {
  gold: '⦿', insight: '◈', renown: '★',
  moonpetal: '⚘', ironOre: '⛏', spiritDust: '✧', scroll: '📜',
  life: '✚', stamina: '⚡', mana: '✦',
  prism: '❖', fire: '▲', water: '▼', earth: '⬢', air: '≈', dark: '☾', light: '☀',
};
const g = (id: string): string => GLYPH[id] ?? '';
const numStr = (x: number): string => String(+x.toFixed(2));
const signStr = (x: number): string => (x < 0 ? '-' : '+');

function chipText(def: TaskDef): string {
  if (def.chip) return def.chip;
  switch (def.type) {
    case 'instant':
      return 'Instant';
    case 'running':
      return `Running · ${def.length ?? 0}s`;
    case 'perpetual':
      return 'Perpetual';
    case 'limited':
      return 'Limited';
  }
}
function tagText(def: TaskDef, info: TaskInfo): string {
  if (def.type === 'limited') return `${def.tag} · Max ${def.max ?? 1} · ${info.count}/${def.max ?? 1}`;
  return def.tag;
}
function tokens(list: { id: string; amount: number }[] | undefined, perSec: boolean): string {
  return (list ?? []).map((a) => `${g(a.id)}${numStr(a.amount)}${perSec ? '/s' : ''}`).join(' ');
}
/** Resolve the 'affinity' sentinel to the player's awakened element so contract cost/
 *  output lines show the real glyph (e.g. ▼ Water) instead of a bare, iconless number. */
function resolveAmounts(state: GameState, list: Amount[] | undefined): Amount[] {
  return (list ?? []).map((a) => ({ ...a, id: resolveAffinityId(state, a.id) }));
}
function effectSummary(def: TaskDef): string {
  return (def.effects ?? [])
    .map((e) => {
      if (e.kind === 'activitySlot') return `+${e.amount} Activity slot${e.amount === 1 ? '' : 's'}`;
      if (e.kind === 'raiseInsightCap') return `+${e.amount} ◈ cap`;
      if (e.kind === 'raiseGoldCap') return `+${e.amount} ⦿ cap`;
      if (e.kind === 'flag') return `unlocks ${e.flag}`;
      if (e.kind === 'beginLodging') return 'a room at the Inn (opens Home)';
      return '';
    })
    .filter(Boolean)
    .join(', ');
}
/** An element-tool's mechanical payoff line: "+50% ▲ job Gold" (v0.1.5). "" for non-tools. */
function toolBoostText(def: TaskDef): string {
  if (!def.toolBoost) return '';
  return `+${Math.round(def.toolBoost.mult * 100)}% ${g(def.toolBoost.element)} job Gold`;
}
/** Consumed side of a task: instant→startCost, perpetual→per-second runCost,
 *  timed→startCost + per-second runCost. "" when the task costs nothing. */
function costText(state: GameState, def: TaskDef): string {
  if (def.type === 'instant') return tokens(resolveAmounts(state, def.startCost), false);
  if (def.type === 'perpetual') return tokens(resolveAmounts(state, def.runCost), true);
  return [tokens(resolveAmounts(state, def.startCost), false), tokens(resolveAmounts(state, def.runCost), true)]
    .filter(Boolean)
    .join(' + ');
}
/** Produced side of a task: output tokens (per-second for perpetual), the random-loot
 *  phrasing for Scavenge, or an effect summary for upgrades/milestones. */
function outputText(state: GameState, def: TaskDef): string {
  if (def.randomOutput) return 'a random basic material';
  if (def.toolBoost) return toolBoostText(def);
  return def.output && def.output.length
    ? tokens(resolveAmounts(state, def.output), def.type === 'perpetual')
    : effectSummary(def);
}
function costLine(state: GameState, def: TaskDef): string {
  const left = costText(state, def) || '—';
  const out = outputText(state, def);
  return out ? `${left} → ${out}` : left;
}
/** Founding (Home-tab) tasks have no `output` — their value is a milestone, so
 *  describe THAT instead of the empty effect summary. */
function homePayoff(def: TaskDef): string {
  switch (def.id) {
    case 'secure-charter':
      return 'grants a Guild Charter';
    case 'claim-site':
      return 'claims your Site (your Grounds)';
    case 'found-academy':
      return 'founds the Academy — the finale';
    default:
      return effectSummary(def);
  }
}
function payoffText(def: TaskDef, info: TaskInfo): string {
  if (def.panel === 'home') return homePayoff(def);
  if (def.type === 'instant') {
    if (def.output && def.output.length) {
      const o = def.output[0];
      return `+${numStr(o.amount)} ${g(o.id)}/action`;
    }
    return effectSummary(def);
  }
  if (def.output && def.output.length) {
    const id = def.output[0].id;
    const net = info.net[id] ?? 0;
    return `net ${signStr(net)}${numStr(Math.abs(net))} ${g(id)}/s`;
  }
  return toolBoostText(def) || effectSummary(def);
}
function atNText(def: TaskDef, count: number): string | undefined {
  if (!def.atN || !def.atN.length) return undefined;
  const t = def.atN.find((x) => count < x.at) ?? def.atN[def.atN.length - 1];
  // Bonus applies once completions reach `at`. Read as a plain goal → reward.
  if (count < t.at) return `At ${t.at} done → +${t.bonus} (${count}/${t.at})`;
  return `At ${t.at} done → +${t.bonus} ✓ (×${count})`;
}
function lockTextFor(def: TaskDef, info: TaskInfo): string | undefined {
  if (info.maxed) return `done · ${info.count}/${def.max ?? 1}`;
  if (info.locked) return 'requirements unmet';
  return undefined;
}
function buildTaskView(state: GameState, def: TaskDef, info: TaskInfo): TaskView {
  const pausedReason =
    info.paused && info.pausedResourceId
      ? `needs ${g(info.pausedResourceId)} ${AMOUNT_LABEL[info.pausedResourceId] ?? info.pausedResourceId}`
      : undefined;
  const cap = costCapMark(state, def.startCost);
  return {
    id: def.id,
    name: def.name,
    type: def.type,
    kind: chipText(def),
    cls: def.cls,
    panel: def.panel ?? 'main',
    group: def.tag,
    tag: tagText(def, info),
    io: costLine(state, def),
    active: info.active,
    locked: info.locked,
    revealed: info.revealed,
    paused: info.paused,
    progress: info.progress,
    timed: def.type === 'running' || def.type === 'limited',
    affordable: info.affordable,
    startable: info.startable,
    payoff: payoffText(def, info),
    atText: atNText(def, info.count),
    pausedReason,
    slotNote: info.slotFull ? 'No free Activity slot' : undefined,
    lockText: lockTextFor(def, info),
    repeat: info.repeat,
    canRepeat: def.type === 'running',
    count: info.count,
    capMark: cap.capMark,
    capNote: cap.capNote,
    timeText: chipText(def),
    costText: costText(state, def),
    outputText: outputText(state, def),
    blurb: def.blurb,
  };
}

// ---- caps + sourced-number tooltips (the §3.14 QoL layer) ----
/** Name of the task whose effect raises the Insight cap (for the `*` marker hover). */
function capRaiserName(): string | undefined {
  return TASKS.find((d) => d.effects?.some((e) => e.kind === 'raiseInsightCap'))?.name;
}

/** A `*` marker + hover when any Insight cost in the list exceeds the current Insight cap. */
function costCapMark(state: GameState, cost: Amount[] | undefined): { capMark?: string; capNote?: string } {
  const cap = effectiveCap(state, 'insight');
  const over = (cost ?? []).some((c) => c.pool === 'resource' && c.id === 'insight' && c.amount > cap);
  if (!over) return {};
  const raiser = capRaiserName();
  return { capMark: '*', capNote: `exceeds Insight Max${raiser ? ` — build ${raiser} to raise it` : ''}` };
}

// ---- Home view (housing tiers + equippable items) ----
const MOD_TARGET_LABEL: Record<string, string> = {
  gold: 'Gold', insight: 'Insight', moonpetal: 'Moonpetal', ironOre: 'Iron Ore', spiritDust: 'Spirit Dust',
  life: 'Life', stamina: 'Stamina', mana: 'Mana',
  prism: 'Prismatic', fire: 'Fire', water: 'Water', earth: 'Earth', air: 'Air', dark: 'Dark', light: 'Light',
};
function modLabel(m: Modifier): string {
  if (m.target === 'jobOutput') return `+${Math.round(m.amount * 100)}% Odd-Job pay`;
  const name = MOD_TARGET_LABEL[m.target] ?? m.target;
  return m.kind === 'max' ? `+${numStr(m.amount)} ${name} cap` : `+${numStr(m.amount)} ${name}/s`;
}

/** First unmet requirement in a list, as a short reason string. */
function firstUnmetReason(state: GameState, requires: Requirement[] | undefined): string | undefined {
  for (const r of requires ?? []) {
    if (meetsRequirements(state, [r])) continue;
    if (r.kind === 'flag') return `needs ${r.flag}`;
    if (r.kind === 'skill') return `needs ${CANTRIP_BY_ID[r.id]?.name ?? r.id}`;
    if (r.kind === 'resource') return `needs ${r.atLeast} ${AMOUNT_LABEL[r.id] ?? r.id}`;
    if (r.kind === 'taskCount') return `needs ${r.atLeast}× ${r.id}`;
  }
  return undefined;
}

/** Map a HomeItem → its view (shop card / doll slot). `equipped` is true whether the item
 *  sits in a generic housing slot OR on the paper doll (gear), so a shop card reads right
 *  for both families. */
function homeItemView(state: GameState, it: HomeItem): HomeItemView {
  const home = state.run.home ?? { tier: 'vagrant', owned: [], equipped: [] };
  const owned = home.owned.includes(it.id);
  const equipped = it.slot ? isGearEquipped(state, it.id) : (home.equipped ?? []).includes(it.id);
  const reqOk = meetsRequirements(state, it.requires);
  return {
    id: it.id,
    name: it.name,
    cost: tokens(it.cost, false),
    owned,
    equipped,
    affordable: canAfford(state, it.cost, 1),
    locked: !reqOk,
    reason: reqOk ? undefined : firstUnmetReason(state, it.requires),
    modsSummary: it.mods.map(modLabel).join(' · '),
    blurb: it.blurb,
    gear: !!it.slot,
  };
}

/** Human label for an item slot-type (owned-gear grouping / equip prompts). */
const SLOT_TYPE_LABEL: Record<EquipSlotType, string> = {
  head: 'Head',
  amulet: 'Amulet',
  torso: 'Torso',
  body: 'Body',
  leftHand: 'Left Hand',
  rightHand: 'Right Hand',
  belt: 'Belt',
  legs: 'Legs',
  boots: 'Boots',
  ring: 'Ring',
  beltItem: 'Belt Pouch',
};

/** Build the paper-doll view: the eleven positions, the belt sub-slots, and the
 *  owned-but-unequipped gear grouped by slot type (so the UI can offer "equip into <slot>"). */
function buildEquipmentView(state: GameState): EquipmentView {
  const home = state.run.home ?? { tier: 'vagrant', owned: [], equipped: [], equipment: {}, beltItems: [] };
  const equipment = (home.equipment ?? {}) as Record<EquipPosition, string | null>;
  const beltItems = home.beltItems ?? [];

  const slots: EquipSlotView[] = EQUIP_POSITIONS.map((position) => {
    const id = equipment[position] ?? null;
    const def = id ? HOME_ITEM_BY_ID[id] : undefined;
    return {
      position,
      slotLabel: EQUIP_POSITION_LABEL[position],
      item: def ? homeItemView(state, def) : null,
    };
  });

  const belt: BeltView = {
    count: beltItems.length,
    items: beltItems.map((id) => {
      const def = id ? HOME_ITEM_BY_ID[id] : undefined;
      return def ? homeItemView(state, def) : null;
    }),
  };

  // Owned gear that is not currently worn, grouped by slot type (skip belt sub-items when
  // no belt is equipped — there is nowhere to put them yet).
  const hasBelt = equipment.belt != null;
  const groups = new Map<EquipSlotType, HomeItemView[]>();
  for (const it of HOME_ITEMS) {
    if (!it.slot) continue; // gear only
    if (!home.owned.includes(it.id)) continue;
    if (isGearEquipped(state, it.id)) continue; // already worn
    if (it.slot === 'beltItem' && !hasBelt) continue;
    const list = groups.get(it.slot) ?? [];
    list.push(homeItemView(state, it));
    groups.set(it.slot, list);
  }
  const ownedGear: OwnedGearGroup[] = [...groups.entries()].map(([slot, items]) => ({
    slot,
    slotLabel: SLOT_TYPE_LABEL[slot],
    items,
  }));

  return { slots, belt, ownedGear };
}

function buildHomeView(state: GameState): HomeView {
  const cur = homeTier(state);
  const tiers: HomeTierView[] = HOME_TIERS.map((t) => {
    const current = t.id === cur.id;
    const fromOk = t.from.includes(cur.id);
    const reqOk = meetsRequirements(state, t.requires);
    const reachable = !current && fromOk && reqOk;
    const locked = !current && !reachable;
    let reason: string | undefined;
    if (locked) {
      reason = !fromOk
        ? `reach from ${t.from.map((id) => HOME_TIER_BY_ID[id]?.name ?? id).join(' / ') || '—'}`
        : firstUnmetReason(state, t.requires);
    }
    const cost = t.moveCost ? tokens(t.moveCost, false) : t.rent ? `${tokens(t.rent, true)} rent` : 'free';
    const modsSummary = (t.innate ?? []).map(modLabel).join(' · ');
    return { id: t.id, name: t.name, slots: t.slots, cost, locked, reason, current, reachable, modsSummary, blurb: t.blurb };
  });
  const items: HomeItemView[] = HOME_ITEMS.map((it) => homeItemView(state, it));
  return {
    tier: cur.id,
    name: cur.name,
    blurb: cur.blurb,
    slots: homeSlots(state),
    used: homeSlotsUsed(state),
    tiers,
    items,
  };
}

// ---- the reusable tooltip store + content builders (v0.1.1) ----
/** The single global tooltip's state; App.svelte renders Tooltip.svelte from it. */
export const tooltip = writable<TooltipState>({ visible: false, anchor: null, content: null });

/** Show the tooltip anchored to a card/row's bounding rect (Tooltip.svelte clamps to viewport). */
export function showTooltip(content: TooltipContent, anchor: TooltipAnchor): void {
  tooltip.set({ visible: true, anchor, content });
}
/** Hide the tooltip (mouseleave / blur / click). */
export function hideTooltip(): void {
  tooltip.update((t) => ({ ...t, visible: false }));
}

/** Show `content` anchored to the event target's bounding rect. The single hover/focus
 *  entry point cards & rows call — keeps the wiring in each panel to one line. */
export function openTip(e: Event, content: TooltipContent): void {
  const el = e.currentTarget as HTMLElement | null;
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  const r = el.getBoundingClientRect();
  showTooltip(content, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
}

const EPS = 1e-9;
function signedRate(x: number): string {
  return `${signStr(x)}${numStr(Math.abs(x))}/s`;
}

/** Build the styled tooltip content for a task card: Time / Consumed / Output / blurb. */
export function taskTooltip(t: TaskView): TooltipContent {
  const sections: TooltipSection[] = [{ label: 'Time', lines: [{ text: t.timeText }] }];
  if (t.costText) sections.push({ label: 'Consumed', lines: [{ text: t.costText, cls: 'life' }] });
  if (t.outputText) sections.push({ label: 'Output', lines: [{ text: t.outputText, cls: 'ok' }] });
  return { title: t.name, titleCls: t.cls, sections, blurb: t.blurb };
}

/** Tooltip for a Home housing-tier card: slots, cost, innate bonus, blurb. */
export function homeTierTooltip(t: HomeTierView): TooltipContent {
  const sections: TooltipSection[] = [
    { label: 'Slots', lines: [{ text: `${t.slots}` }] },
    { label: 'Cost', lines: [{ text: t.cost }] },
  ];
  if (t.modsSummary) sections.push({ label: 'Bonus', lines: [{ text: t.modsSummary, cls: 'ok' }] });
  return { title: t.name, sections, blurb: t.blurb };
}

/** Tooltip for a Home item card: cost, what the modifier does, blurb. */
export function homeItemTooltip(it: HomeItemView): TooltipContent {
  const sections: TooltipSection[] = [];
  if (!it.owned) sections.push({ label: 'Cost', lines: [{ text: it.cost }] });
  if (it.modsSummary) sections.push({ label: 'Effect', lines: [{ text: it.modsSummary, cls: 'ok' }] });
  return { title: it.name, sections, blurb: it.blurb };
}

/** Format a computed Breakdown into styled tooltip content (Produces / Consumes /
 *  Multipliers / Net + at-cap / sealed notes). Empty sections are dropped. */
function breakdownTooltip(title: string, titleCls: string | undefined, b: Breakdown): TooltipContent {
  const sections: TooltipSection[] = [];
  if (b.produces.length) {
    sections.push({ label: 'Produces', lines: b.produces.map((p) => ({ text: `${p.name}  +${numStr(p.amount)}/s`, cls: 'ok' })) });
  }
  if (b.consumes.length) {
    sections.push({ label: 'Consumes', lines: b.consumes.map((c) => ({ text: `${c.name}  −${numStr(c.amount)}/s`, cls: 'life' })) });
  }
  if (b.multipliers.length) {
    sections.push({ label: 'Multipliers', lines: b.multipliers.map((m) => ({ text: `${m.name}  ×${m.factor.toFixed(2)}` })) });
  }
  let note: string | undefined;
  if (b.locked) note = 'Sealed — learn Inner Wellspring to open your Mana.';
  else if (b.atCap) note = 'At cap — further gains are wasted.';
  const empty = sections.length || b.locked ? undefined : 'Nothing is producing or consuming this right now.';
  // Net is meaningful only when something contributes — omit it for a sealed or empty target.
  const net: TooltipLine | undefined =
    b.locked || empty ? undefined : { text: signedRate(b.net), cls: b.net > EPS ? 'ok' : b.net < -EPS ? 'life' : undefined };
  return { title, titleCls, sections, net, note, empty };
}

/** Resource / material breakdown tooltip (id → producers, consumers, multipliers, net). */
export function resourceTooltip(id: ResourceId, title: string): TooltipContent {
  const MATERIAL: ResourceId[] = ['moonpetal', 'ironOre', 'spiritDust', 'scroll'];
  const token = MATERIAL.includes(id) ? undefined : id; // materials have no colour token
  return breakdownTooltip(title, token, breakdown(getState(), { kind: 'resource', id }));
}
/** Vital breakdown tooltip (regen sources, task drains, net regen). `token` is the CSS colour token. */
export function vitalTooltip(id: VitalId, title: string, token: string): TooltipContent {
  return breakdownTooltip(title, token, breakdown(getState(), { kind: 'vital', id }));
}
/** Essence breakdown tooltip (cantrip/home trickles, contract burns, Kindle, net). */
export function essenceTooltip(e: EssenceView): TooltipContent {
  const title = `${e.glyph} ${e.label}`;
  const token = e.id; // element ids double as colour tokens (--fire, --water, …)
  if (!e.awakened) {
    return { title, titleCls: token, sections: [], empty: 'Not yet awakened — learn a cantrip to open this essence.' };
  }
  return breakdownTooltip(title, token, breakdown(getState(), { kind: 'essence', id: e.id as ElementId }));
}

/** Map an engine CantripInfo → the panel's CantripView (adds glyphs, formatting, cap marker). */
function buildCantripView(info: ReturnType<typeof listCantripInfo>[number]): CantripView {
  const cls = info.awakensElement ? ELEMENT_META[info.awakensElement].cls : 'insight';
  const raiser = capRaiserName();
  const prereqNote =
    info.status === 'locked' && info.missingPrereqs.length
      ? `needs: ${info.missingPrereqs.map((r) => CANTRIP_BY_ID[r]?.name ?? r).join(', ')}`
      : // an un-unveiled elemental opener (Spark owned) carries its own engine-side note
        info.prereqNote;
  return {
    id: info.id,
    name: info.name,
    blurb: info.blurb,
    cls,
    cost: `${g('insight')}${numStr(info.cost)}`,
    status: info.status,
    affordable: info.affordable && !info.exceedsCap,
    learnable: info.status === 'available' && info.affordable && !info.exceedsCap,
    effectText: info.effectText,
    prereqNote,
    capMark: info.exceedsCap ? '*' : undefined,
    capNote: info.exceedsCap ? `exceeds Insight Max${raiser ? ` — build ${raiser} to raise it` : ''}` : undefined,
    scrollCost: info.scrollCost,
    hasScroll: info.hasScroll,
  };
}

/** Derive the panel view-model from canonical state. */
export function toView(state: GameState): UiState {
  const r = state.run.resources;
  const rates = taskRates(state);
  const eRates = essenceRates(state); // cantrip-awakened trickle (adds to any task-granted essence)
  const infos = listTaskInfo(state);
  const homeRates = homeResourceRates(state); // per-second home-item production (Focusing Lens, Homestead, …)
  const om = outputMult(state);
  const totalRate = (id: ResourceId): number => (rates.resources[id] ?? 0) + (homeRates[id] ?? 0) * om;
  const goldCap = effectiveCap(state, 'gold');
  const goldAtCap = r.gold >= goldCap - 1e-9;
  const insightCap = effectiveCap(state, 'insight');
  const insightAtCap = r.insight >= insightCap - 1e-9;
  const fs = foundingStatus(state);
  const founded = fs.founded;
  return {
    resources: {
      gold: {
        amount: r.gold,
        rate: goldAtCap ? 0 : totalRate('gold'),
        cap: goldCap,
        atCap: goldAtCap,
      },
      insight: {
        amount: r.insight,
        rate: insightAtCap ? 0 : totalRate('insight'),
        cap: insightCap,
        atCap: insightAtCap,
      },
      renown: { amount: r.renown, rate: rates.resources.renown ?? 0 },
    },
    materials: { moonpetal: r.moonpetal, ironOre: r.ironOre, spiritDust: r.spiritDust, scroll: r.scroll },
    discovered: state.run.discovered ?? { gold: true },
    player: {
      name: state.run.name ?? '',
      title: state.run.title ?? 'Waif',
      renown: r.renown,
      needsNaming: (state.run.name ?? '') === '',
      attributes: [
        { key: 'strength', label: 'Strength', glyph: '💪', value: engineStrength(state),
          hint: 'Grows from physical labour (mucking stables); multiplies the Gold hard graft pays.' },
        { key: 'dexterity', label: 'Dexterity', glyph: '🎯', value: 1,
          hint: 'Deftness and speed of hand. (Growth coming.)' },
        { key: 'constitution', label: 'Constitution', glyph: '🛡', value: 1,
          hint: 'Toughness and stamina. (Growth coming.)' },
        { key: 'intelligence', label: 'Intelligence', glyph: '📖', value: 1,
          hint: 'Reasoning and study. (Growth coming.)' },
        { key: 'wisdom', label: 'Wisdom', glyph: '🦉', value: 1,
          hint: 'Insight and intuition. (Growth coming.)' },
        { key: 'charisma', label: 'Charisma', glyph: '🎭', value: 1,
          hint: 'Presence and persuasion. (Growth coming.)' },
      ],
    },
    vitals: {
      // regen is the EFFECTIVE rate the tick applies (base + equipped-item `rate` mods),
      // so Herbalist Kit / Charm of Vigor / Mana Crystal visibly move the "recovers X/s".
      life: { cur: state.run.vitals.life.cur, max: state.run.vitals.life.max, regen: effectiveRegen(state, 'life') },
      stamina: {
        cur: state.run.vitals.stamina.cur,
        max: state.run.vitals.stamina.max,
        regen: effectiveRegen(state, 'stamina'),
      },
      mana: { cur: state.run.vitals.mana.cur, max: state.run.vitals.mana.max, regen: effectiveRegen(state, 'mana') },
    },
    essence: ELEMENTS.map((id) => {
      const e = state.run.essence[id];
      const meta = ELEMENT_META[id];
      const rate = (rates.essence[id] ?? 0) + (eRates[id] ?? 0);
      return {
        id,
        ...meta,
        amount: e.amount,
        rate,
        awakened: e.awakened,
      };
    }),
    tabs: [
      { id: 'main', label: 'Main', visible: true, locked: false },
      // The Player tab (character sheet — name/title/renown). Always visible (v0.1.2).
      { id: 'player', label: 'Player', visible: true, locked: false },
      // The spark reveals Skills (the `awakened` flag is the canonical trigger — T-005).
      { id: 'skills', label: 'Skills', visible: state.run.flags.awakened === true, locked: false },
      // The lair beat reveals Home (fixtures + the Founding card).
      { id: 'home', label: 'Home', visible: state.run.flags.lairFounded === true, locked: false },
      // Academy: the always-visible beacon, greyed until the Founding flips it (§3.11).
      // Academy tab hidden until the Founding is unveiled (~Act 4) — see SHOW_FOUNDING.
      { id: 'academy', label: founded ? 'Academy ★' : 'Academy', visible: SHOW_FOUNDING, locked: !founded },
    ],
    // Founding tasks (Charter / Site / Found the Academy) are hidden until ~Act 4.
    tasks: TASKS.map((def, i) => buildTaskView(state, def, infos[i])).filter(
      (t) => SHOW_FOUNDING || t.group !== 'Founding',
    ),
    cantrips: listCantripInfo(state).map((info) => buildCantripView(info)),
    slots: { used: slotsUsed(state), total: activitySlots(state) },
    home: buildHomeView(state),
    equipment: buildEquipmentView(state),
    founding: {
      phase: state.run.phase,
      founded,
      canFound: canFound(state),
      metCount: fs.metCount,
      total: fs.total,
      reqs: [
        { label: 'Gold', met: fs.gold.met, have: fs.gold.have, need: fs.gold.need },
        { label: 'Renown', met: fs.renown.met, have: fs.renown.have, need: fs.renown.need },
        { label: 'Charter', met: fs.charter.met, note: fs.charter.met ? 'secured' : 'a guild charter' },
        { label: 'Site', met: fs.site.met, note: fs.site.met ? 'claimed' : 'the ruined tower' },
      ],
    },
    chronicle: state.run.chronicle
      .slice(-chronicleLines(state))
      .reverse()
      .map((c) => ({ t: mmss(c.at), text: c.text, kind: c.kind })),
  };
}

/** How many Chronicle lines to show — the setting, clamped to a sane 5..10. */
function chronicleLines(state: GameState): number {
  const n = state.settings?.chronicleLines ?? 8;
  return Math.max(5, Math.min(10, Math.round(n)));
}

// ---- live state + stores ----
let state: GameState = newGame();

export const game = writable<UiState>(toView(state));
export const activeTab = writable<string>('main');

/**
 * The most recent offline catch-up summary (set by main.ts after a load/foreground
 * catch-up), or null if nothing meaningful accrued. T-006b's "While you were away…"
 * panel subscribes to this; shape is the engine's OfflineSummary (offline.ts):
 *   { elapsedMs, appliedMs, capped, gains: Partial<Record<ResourceId, number>> }.
 */
export const offlineSummary = writable<OfflineSummary | null>(null);

/** Whether the header's System/Settings panel (save transports + notation) is open. */
export const systemOpen = writable<boolean>(false);

export function getState(): GameState {
  return state;
}

/**
 * Persist the current state to localStorage NOW, in the one portable format. Used
 * after an explicit user action (import a save, change a setting) so a reload keeps
 * it without waiting for the ~30s autosave. Deliberately writes even if the on-load
 * autosave was blocked by a corrupt file — an explicit import/settings change is the
 * user choosing to replace it.
 */
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

/**
 * Hard reset: discard the current save and start a brand-new game from the Origin.
 * Overwrites the persisted save immediately (the fresh state IS the new save), so a
 * reload keeps the clean start. Re-applies notation + font from the new defaults and
 * returns the player to the Main tab. Irreversible — the caller confirms first.
 */
export function resetGame(): void {
  state = newGame();
  setNotation(state.settings.notation);
  applyFont(state.settings.font);
  activeTab.set('main');
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

/** Name the mage (character creation): trims + clamps via the engine, then persists +
 *  re-renders. A blank name is ignored (no mutation). Clears the needsNaming trigger. */
export function setNameSetting(name: string): void {
  if (engineSetName(state, name)) {
    persist();
    publish();
  }
}

// ---- Home actions (housing tier + items) — call the engine, then publish ----
export function moveHome(tierId: string): void {
  engineMoveHome(state, tierId);
  publish();
}
export function buyItem(itemId: string): void {
  engineBuyItem(state, itemId);
  publish();
}
export function equipItem(itemId: string): void {
  engineEquipItem(state, itemId);
  publish();
}
export function unequipItem(itemId: string): void {
  engineUnequipItem(state, itemId);
  publish();
}
// Paper-doll gear (v0.1.3): equip into a resolved/optional position, unequip a position,
// unequip a belt sub-item by index. Each calls the engine then republishes.
export function equipGear(itemId: string, position?: string): void {
  engineEquipGear(state, itemId, position);
  publish();
}
export function unequipGear(position: string): void {
  engineUnequipGear(state, position);
  publish();
}
export function unequipBeltItem(index: number): void {
  engineUnequipBeltItem(state, index);
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

/** Whole-card click: Active→stop, instant→do, continuous→start. Locked cards no-op. */
export function dispatchTask(view: TaskView): void {
  if (view.locked) return;
  if (view.active) stopTask(state, view.id);
  else if (view.type === 'instant') doTask(state, view.id);
  else startTask(state, view.id);
  publish();
}

/** The in-card ↻ toggle for Running tasks. */
export function toggleTaskRepeat(id: string): void {
  engineToggleRepeat(state, id);
  publish();
}

/** Learn a cantrip from the Skills tab: spends Insight, applies its effect (awaken / +regen / global mult). */
export function learnCantrip(id: string): void {
  engineLearnCantrip(state, id);
  publish();
}

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
 * Re-seed the rAF timebase to "now" so the next frame measures ~0 elapsed.
 * Call this right after a foreground offline catch-up (main.ts visibilitychange):
 * while the tab was hidden rAF was paused and `lastFrame` froze, so without this
 * the first resumed frame would see the whole idle gap and (even clamped to ≤1s)
 * double-count time the catch-up already replayed.
 */
export function resumeTimebase(): void {
  if (typeof performance !== 'undefined') lastFrame = performance.now();
}

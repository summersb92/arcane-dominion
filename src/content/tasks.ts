// Task/Activity content — pure data, the source of truth for what the mage can DO.
// Framework-agnostic (imported by the engine + CLI; type-only import of state ids
// so there is no runtime cycle). The engine system in src/engine/systems/tasks.ts
// interprets these definitions; the UI/CLI only format them for display.
//
// The four task types (spec §3.6 / docs/10 §2):
//   instant   — one-shot: pay startCost → gain output immediately (no slot)
//   running   — timed Length: per-second runCost, lump output on completion, ↻ repeat
//   perpetual — runs until stopped: per-second runCost → per-second output
//   limited   — Max-capped "upgrade": completes a fixed number of times, applies effects
// Continuous tasks (running/perpetual/limited) each occupy an Activity slot; instant don't.

import type { ElementId, ResourceId } from '../engine/state';
import { CONTRACTS } from './contracts';
import { FOUNDING_TASKS } from './founding';

export type TaskType = 'instant' | 'running' | 'perpetual' | 'limited';

/** Which store an Amount reads/writes. */
export type Pool = 'resource' | 'vital' | 'essence';
export type VitalId = 'life' | 'stamina' | 'mana';
/** Sentinel essence id (v0.1.4): resolves at runtime to the awakened affinity element
 *  (state.run.affinityElement, or 'fire' when unset). Lets a contract cost "whatever
 *  element you awakened" without hardcoding Fire. Resolved in systems/tasks pool access. */
export type AffinitySentinel = 'affinity';
export type AmountId = ResourceId | VitalId | ElementId | AffinitySentinel;

/** A signed quantity against a pool. Flat for instant/lump; per-second for run costs & perpetual output. */
export interface Amount {
  pool: Pool;
  id: AmountId;
  amount: number;
}

/** Multi-dimensional start gate (spec §3.6 / docs/10 §4). Starter tasks use none;
 *  the evaluator exists so T-005 (skills) and T-006 (the Founding) can gate on it. */
export type Requirement =
  | { kind: 'flag'; flag: string }
  | { kind: 'resource'; id: ResourceId; atLeast: number }
  | { kind: 'skill'; id: string }
  | { kind: 'taskCount'; id: string; atLeast: number };

/** Applied once when a running/limited task completes a cycle. */
export type TaskEffect =
  | { kind: 'activitySlot'; amount: number }
  | { kind: 'flag'; flag: string; value?: boolean }
  | { kind: 'raiseInsightCap'; amount: number }
  | { kind: 'raiseGoldCap'; amount: number } // Coin Pouch upgrade tasks lift the Gold cap (v0.1.2)
  | { kind: 'awakenElement'; element: ElementId } // Home Ossuary awakens ☾ Dark on build (T-006)
  | { kind: 'beginLodging' }; // Find Lodging opens housing: sets lairFounded + moves into the Inn (v0.1.5)

/** "At N" repeat-scaling: once completions reach `at`, each completion's primary
 *  output gains `bonus` (additive; multiple thresholds stack). docs/10 §4. */
export interface AtN {
  at: number;
  bonus: number;
}

export interface TaskDef {
  id: string;
  name: string;
  type: TaskType;
  tag: string; // category label (docs/10 §5) — also the raw group the UI splits on (Contract/Founding/Odd Jobs)
  cls: string; // coloured left-edge / element class — matches a CSS var name (gold, insight, fire, dark…)
  blurb?: string; // one-line flavour text for the hover tooltip (evocative, a little wry — v0.1.1)
  panel?: 'main' | 'home'; // which tab hosts the card (default 'main'; the Founding → 'home') — T-006
  chip?: string; // chip label override; defaults from type
  job?: boolean; // an Odd Job — Tool Belt's jobOutputMult applies to its output (v0.1.1)
  // Secret reveal (v0.1.5): a secret card stays FULLY hidden until its requirements are
  // actually met (no "≤1 unmet requirement" leniency). Display-only — gating/startability
  // are unchanged; a non-secret card keeps the ordinary "one-away is revealed" rule.
  secret?: boolean;
  // Element-job TOOL (v0.1.5): a one-off purchase that PERMANENTLY boosts the Gold output
  // of every task tagged with `element`. The boost is DERIVED from ownership (task count > 0,
  // no new persistent state) via systems/tasks elementToolMult. `mult` is the fractional
  // bump (0.5 = +50%).
  toolBoost?: { element: ElementId; mult: number };
  // Strength-scaled (v0.1.4): the task's Gold output is multiplied by the Strength stat
  // (systems/player.ts strength()) IN ADDITION to Kindle/Tool-Belt. Set only on physical
  // labour (Clean Stables), which is also where Strength XP is earned.
  strengthScaled?: boolean;
  // Element-tagged income (v0.1.4): completing this task bumps the HIDDEN per-element
  // affinity counter for `element` (state.run.affinity[element]). The dominant element
  // becomes the first awakened one (Spark → awakenAffinity).
  element?: ElementId;
  length?: number; // seconds — running & timed-limited
  max?: number; // limited: how many times it can ever complete
  repeatable?: boolean; // running: default state of the ↻ repeat toggle
  startCost?: Amount[]; // paid once per start / per instant "do" / per running cycle restart
  runCost?: Amount[]; // paid every second while active (drives auto-pause)
  output?: Amount[]; // instant→on do · running/limited→lump on completion · perpetual→per second
  // Deterministic random loot (Scavenge): on completion, pick ONE id uniformly via the
  // seeded RNG (advances state.rngState) and grant `amount` of it (respecting caps).
  randomOutput?: { pool: 'resource'; ids: AmountId[]; amount: number };
  atN?: AtN[];
  requires?: Requirement[];
  effects?: TaskEffect[];
}

const A = (pool: Pool, id: AmountId, amount: number): Amount => ({ pool, id, amount });

/** v0.1 core tasks (spec §5 — first-pass numbers, tuned toward the ~15–40 min target).
 *  Contracts, Home fixtures, and the Founding are composed onto the end (see TASKS). */
const CORE_TASKS: TaskDef[] = [
  {
    // The always-available floor: beg for coppers. Free (no Stamina), so a penniless,
    // Stamina-drained mage can ALWAYS earn a trickle of Gold.
    id: 'begging',
    name: 'Beg for Coppers',
    type: 'instant',
    tag: 'Odd Jobs',
    cls: 'gold',
    blurb: 'Palm out, pride pocketed — every empire starts with a copper or two.',
    job: true,
    output: [A('resource', 'gold', 0.1)],
  },
  {
    // Steady day-labour — the first rung above begging. A TIMED running job ("takes a bit
    // of time"): drains a trickle of Stamina, pays a Gold lump on completion. NOT
    // strength-scaled. Unlocked once you've begged enough to be a known face (v0.1.4).
    id: 'find-work',
    name: 'Find Work',
    type: 'running',
    tag: 'Odd Jobs',
    cls: 'gold',
    blurb: 'Steady hands wanted. The regulars have started nodding when you pass.',
    job: true,
    length: 8,
    repeatable: true,
    runCost: [A('vital', 'stamina', 0.3)],
    output: [A('resource', 'gold', 3)],
    requires: [{ kind: 'taskCount', id: 'begging', atLeast: 20 }],
  },
  {
    // Muck out the stables — hard physical labour, so it's STRENGTH-SCALED: its Gold pays
    // base × Strength, and each completion trains Strength (v0.1.4). Costs MORE Stamina
    // than Run Errands. Unlocked once you're a trusted day-labourer (Find Work ×20).
    id: 'clean-stables',
    name: 'Clean Stables',
    type: 'instant',
    tag: 'Odd Jobs',
    cls: 'gold',
    blurb: 'Muck, straw, and honest coin. The horses judge you, but they pay — and it builds thew.',
    job: true,
    strengthScaled: true,
    startCost: [A('vital', 'stamina', 5)],
    output: [A('resource', 'gold', 2)], // BASE — multiplied by Strength at grant time
    requires: [{ kind: 'taskCount', id: 'find-work', atLeast: 20 }],
  },
  {
    // Errands across town — lighter than mucking stables (LESS Stamina), a flat Gold pay.
    // NOT strength-scaled. Same gate as Clean Stables (Find Work ×20).
    id: 'run-errands',
    name: 'Run Errands',
    type: 'instant',
    tag: 'Odd Jobs',
    cls: 'gold',
    blurb: "Parcels across town, questions unasked — a runner the whole quarter trusts.",
    job: true,
    startCost: [A('vital', 'stamina', 3)],
    output: [A('resource', 'gold', 1.6)],
    requires: [{ kind: 'taskCount', id: 'find-work', atLeast: 20 }],
  },
  {
    // Scavenge the ruins for raw materials — random loot, NOT wage-work (no jobOutput mult).
    // Clean Stables sits deeper in the ladder now (begging → find-work → clean-stables), so
    // its gate is lowered 32 → 15 to keep Scavenge reachable without a grind (v0.1.4).
    id: 'scavenge',
    name: 'Scavenge',
    type: 'instant',
    tag: 'Odd Jobs',
    cls: 'earth',
    blurb: 'Pick through the ruins and pocket whatever the rubble surrenders.',
    startCost: [A('vital', 'stamina', 2)],
    randomOutput: { pool: 'resource', ids: ['moonpetal', 'ironOre', 'spiritDust'], amount: 1 },
    requires: [{ kind: 'taskCount', id: 'clean-stables', atLeast: 15 }],
  },
  {
    // Turn raw Insight into a keepable Scroll — the crafting currency every cantrip past
    // the opener demands. An early instant, gated only on having learned to read (v0.1.2).
    id: 'scribe-scroll',
    name: 'Scribe Scroll',
    type: 'instant',
    tag: 'Crafting',
    cls: 'insight',
    blurb: "Ink, vellum, and a patient hand — you're on a roll, spinning Insight into Scrolls.",
    startCost: [A('resource', 'insight', 3), A('vital', 'stamina', 1)],
    output: [A('resource', 'scroll', 1)],
    atN: [{ at: 5, bonus: 1 }], // At 5: +1 Scroll per scribe (a practised hand)
    requires: [{ kind: 'skill', id: 'read-the-page' }],
  },
  {
    // The FIRE element income task (v0.1.4) — kept id 'smith' (tests + Hearth flavour).
    // Each completion nudges hidden Fire affinity.
    id: 'smith',
    name: 'Smith',
    type: 'running',
    tag: 'Craftwork',
    cls: 'fire',
    blurb: 'Hammer, heat, and repetition — sweat traded steadily for honest Gold. The forge likes you.',
    element: 'fire',
    length: 15,
    repeatable: true,
    runCost: [A('vital', 'stamina', 0.4)],
    output: [A('resource', 'gold', 5)],
  },
  // --- the other five element income tasks (v0.1.4) — Smith-like running Gold jobs, one
  //     per remaining element. Each completion feeds its HIDDEN affinity counter, steering
  //     which element you first awaken (Spark → awakenAffinity). Available early, no gate. ---
  {
    id: 'haul-the-catch',
    name: 'Haul the Catch',
    type: 'running',
    tag: 'Trade',
    cls: 'water',
    blurb: 'Nets, crates, and cold brine — you wharf hard for every copper. Something in the tide takes note.',
    element: 'water',
    length: 13,
    repeatable: true,
    runCost: [A('vital', 'stamina', 0.4)],
    output: [A('resource', 'gold', 5)],
  },
  {
    id: 'farm-hand',
    name: 'Farm Hand',
    type: 'running',
    tag: 'Trade',
    cls: 'earth',
    blurb: 'Sow, hoe, and haul — down-to-earth labour that pays in coin and calluses.',
    element: 'earth',
    length: 13,
    repeatable: true,
    runCost: [A('vital', 'stamina', 0.4)],
    output: [A('resource', 'gold', 5)],
  },
  {
    id: 'mind-the-windmill',
    name: 'Mind the Windmill',
    type: 'running',
    tag: 'Trade',
    cls: 'air',
    blurb: 'Grease the gears and trim the sails — an airy post, once you get the hang of the breeze.',
    element: 'air',
    length: 14,
    repeatable: true,
    runCost: [A('vital', 'stamina', 0.4)],
    output: [A('resource', 'gold', 5)],
  },
  {
    id: 'lamplighter',
    name: 'Lamplighter',
    type: 'running',
    tag: 'Trade',
    cls: 'lightc',
    blurb: 'Kindle the street-lamps at dusk — honest, glowing work that keeps the dark at bay.',
    element: 'light',
    length: 12,
    repeatable: true,
    runCost: [A('vital', 'stamina', 0.4)],
    output: [A('resource', 'gold', 5)],
  },
  {
    id: 'dig-graves',
    name: 'Dig Graves',
    type: 'running',
    tag: 'Trade',
    cls: 'dark',
    blurb: 'Spade, silence, and the deep dark earth — grim pay for grim work, and it never runs dry.',
    element: 'dark',
    length: 15,
    repeatable: true,
    runCost: [A('vital', 'stamina', 0.4)],
    output: [A('resource', 'gold', 5)],
  },
  {
    id: 'study',
    name: 'Study',
    type: 'perpetual',
    tag: 'Research',
    cls: 'insight',
    blurb: 'Bend over the books until the world narrows to one glowing idea.',
    runCost: [A('vital', 'stamina', 0.2)],
    output: [A('resource', 'insight', 0.55)],
    requires: [{ kind: 'flag', flag: 'awakened' }], // the spark un-gates Study (T-005)
  },
  {
    id: 'rest',
    name: 'Rest',
    type: 'perpetual',
    tag: 'Rest',
    cls: 'mana',
    blurb: 'Sit, breathe, let the aches drain away. Even a mage must sleep.',
    output: [A('vital', 'stamina', 0.8), A('vital', 'mana', 0.5), A('vital', 'life', 0.5)],
  },
  {
    // Cheap, early Gold-cap raiser — build up to three for a Gold cap of 25 → 50 → 75 → 100.
    // No lair gate: caps must be able to grow from the very first coppers (v0.1.2).
    id: 'coin-pouch',
    name: 'Coin Pouch',
    type: 'limited',
    tag: 'Storage',
    cls: 'gold',
    blurb: 'Stitch a roomier purse for a swelling hoard — pouch comes to shove.',
    chip: 'Upgrade',
    length: 3,
    max: 3,
    startCost: [A('resource', 'gold', 20)],
    effects: [{ kind: 'raiseGoldCap', amount: 25 }], // Gold cap +25 per build (25 → 100)
  },
  {
    // Cheap, early Insight-cap raiser — build up to three for an Insight cap of 5 → 10 → 15 → 20.
    // SECRET + gated on `awakened` (v0.1.5): a Notebook is useless before the spark gives you
    // Insight to store, so it stays fully hidden until magic fires. (Coin Pouch stays visible
    // as the only early purchase before magic.)
    id: 'notebook',
    name: 'Notebook',
    type: 'limited',
    tag: 'Storage',
    cls: 'insight',
    blurb: 'Fresh blank pages for a fuller mind — we took notes, it checks out.',
    chip: 'Upgrade',
    length: 3,
    max: 3,
    startCost: [A('resource', 'gold', 20)],
    requires: [{ kind: 'flag', flag: 'awakened' }], // hidden until the spark (magic) fires
    secret: true,
    effects: [{ kind: 'raiseInsightCap', amount: 5 }], // Insight cap +5 per build (5 → 20)
  },
  // --- SIX element-job TOOLS (v0.1.5) — one-off Limited purchases (Gold 40, max 1) that
  //     PERMANENTLY boost their element job's Gold output by +50%. Each is SECRET and only
  //     appears after ~5 completions of the job it fits (taskCount gate). The boost is DERIVED
  //     from ownership (see systems/tasks elementToolMult) — no new persistent state. ---
  {
    id: 'forge-hammer',
    name: "Smith's Hammer",
    type: 'limited',
    tag: 'Tools',
    cls: 'fire',
    blurb: 'A hammer that knows its own weight — now you strike while the irony is hot. Smithing pays more.',
    chip: 'Tool',
    length: 4,
    max: 1,
    startCost: [A('resource', 'gold', 40)],
    requires: [{ kind: 'taskCount', id: 'smith', atLeast: 5 }],
    secret: true,
    toolBoost: { element: 'fire', mult: 0.5 },
  },
  {
    id: 'fishing-net',
    name: 'Fishing Net',
    type: 'limited',
    tag: 'Tools',
    cls: 'water',
    blurb: 'Wide mesh, tight knots — you haul a bigger catch and, net-net, land more coin.',
    chip: 'Tool',
    length: 4,
    max: 1,
    startCost: [A('resource', 'gold', 40)],
    requires: [{ kind: 'taskCount', id: 'haul-the-catch', atLeast: 5 }],
    secret: true,
    toolBoost: { element: 'water', mult: 0.5 },
  },
  {
    id: 'iron-hoe',
    name: 'Iron Hoe',
    type: 'limited',
    tag: 'Tools',
    cls: 'earth',
    blurb: 'A blade that bites the soil clean — down-to-earth work, and the field pays you back in kind.',
    chip: 'Tool',
    length: 4,
    max: 1,
    startCost: [A('resource', 'gold', 40)],
    requires: [{ kind: 'taskCount', id: 'farm-hand', atLeast: 5 }],
    secret: true,
    toolBoost: { element: 'earth', mult: 0.5 },
  },
  {
    id: 'mill-sails',
    name: 'Mill Sails',
    type: 'limited',
    tag: 'Tools',
    cls: 'air',
    blurb: 'Fresh canvas for the windmill — you catch every gust and, sail away, grind out more Gold.',
    chip: 'Tool',
    length: 4,
    max: 1,
    startCost: [A('resource', 'gold', 40)],
    requires: [{ kind: 'taskCount', id: 'mind-the-windmill', atLeast: 5 }],
    secret: true,
    toolBoost: { element: 'air', mult: 0.5 },
  },
  {
    id: 'lantern-pole',
    name: 'Lantern Pole',
    type: 'limited',
    tag: 'Tools',
    cls: 'lightc',
    blurb: 'A longer reach for the wick — you light the whole street in half the time, in the best possible light.',
    chip: 'Tool',
    length: 4,
    max: 1,
    startCost: [A('resource', 'gold', 40)],
    requires: [{ kind: 'taskCount', id: 'lamplighter', atLeast: 5 }],
    secret: true,
    toolBoost: { element: 'light', mult: 0.5 },
  },
  {
    id: 'sexton-spade',
    name: "Sexton's Spade",
    type: 'limited',
    tag: 'Tools',
    cls: 'dark',
    blurb: 'A spade worn smooth by grim custom — you dig deeper for the dearly departed, and the pay follows.',
    chip: 'Tool',
    length: 4,
    max: 1,
    startCost: [A('resource', 'gold', 40)],
    requires: [{ kind: 'taskCount', id: 'dig-graves', atLeast: 5 }],
    secret: true,
    toolBoost: { element: 'dark', mult: 0.5 },
  },
  {
    // FIND LODGING (v0.1.5) — the one-off that OPENS the housing tree. No Gold cost itself
    // (the Inn's rent is the ongoing cost); it simply requires you to HOLD 80 Gold, which
    // forces raising the Gold cap via Coin Pouches first. On completion it begins lodging:
    // sets lairFounded (revealing the Home tab + housing/items/Grand Library) and moves you
    // into the Inn. Housing now opens ONLY via this card (the auto lair beat is gone).
    id: 'find-lodging',
    name: 'Find Lodging',
    type: 'limited',
    tag: 'Lodging',
    cls: 'gold',
    blurb: 'Enough coin in hand to be taken seriously — time to stop sleeping in the straw and rent a roof.',
    chip: 'One-off',
    length: 4,
    max: 1,
    requires: [{ kind: 'resource', id: 'gold', atLeast: 80 }],
    effects: [{ kind: 'beginLodging' }],
  },
];

/** The full task table the engine iterates: core loop + Renown contracts + the
 *  Founding finale. (Home is no longer task-driven — it's tiers + items, see
 *  content/home.ts.) Composed here so content stays split by concern while there
 *  remains ONE source of truth the systems + CLI + UI all read. */
export const TASKS: TaskDef[] = [...CORE_TASKS, ...CONTRACTS, ...FOUNDING_TASKS];

export const TASK_BY_ID: Record<string, TaskDef> = Object.fromEntries(TASKS.map((t) => [t.id, t]));

/** Short human labels for chronicle text (engine-side, display-glyph-free). */
export const AMOUNT_LABEL: Record<string, string> = {
  gold: 'Gold',
  insight: 'Insight',
  renown: 'Renown',
  moonpetal: 'Moonpetal',
  ironOre: 'Iron Ore',
  spiritDust: 'Spirit Dust',
  scroll: 'Scroll',
  life: 'Life',
  stamina: 'Stamina',
  mana: 'Mana',
  prism: 'Prismatic',
  fire: 'Fire',
  water: 'Water',
  earth: 'Earth',
  air: 'Air',
  dark: 'Dark',
  light: 'Light',
};

/** True for tasks that occupy an Activity slot while active (everything but instant). */
export function isContinuous(def: TaskDef): boolean {
  return def.type !== 'instant';
}

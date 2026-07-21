// Cantrip content — the Skills DAG (spec §5), bought with Insight ◈. Pure data,
// framework-agnostic (imported by the engine + CLI; only a type-only import of the
// state ids, so there is no runtime cycle). The engine system in
// src/engine/systems/skills.ts interprets these; the UI/CLI only format them.
//
// A cantrip is a node in a directed acyclic graph: `requires` lists prerequisite
// cantrip ids that must be owned first. Learning one spends `cost` Insight (which
// must fit under the current Insight cap — a cost above the cap shows the `*`
// marker until an Insight-cap raiser lifts it) and applies its `effects` once.

import type { ElementId } from '../engine/state';
import type { VitalId } from './tasks';

/** One applied consequence of learning a cantrip. */
export type CantripEffect =
  | { kind: 'openTree' } // Read the Page — flavour node that opens the web (no mechanical payload)
  | { kind: 'awaken'; element: ElementId; trickle: number } // awaken a FIXED essence + start its per-second trickle
  | { kind: 'vitalRegen'; vital: VitalId; amount: number } // permanent +regen to a vital
  | { kind: 'unlockVital'; vital: VitalId; max: number; regen: number } // unlock a locked vital (sets its max + regen)
  | { kind: 'outputMult'; add: number } // global output multiplier (+0.10 = +10% all output)
  | { kind: 'flag'; flag: string }; // set a run flag

export interface Cantrip {
  id: string;
  name: string;
  blurb: string;
  cost: number; // Insight ◈ spent to learn (BASE — an elementOpener's effective cost scales, see skills.ts openerCost)
  scrollCost?: number; // Scrolls 📜 spent to learn (v0.1.2) — 0 for the free opener, 1 for the rest
  requires: string[]; // prerequisite cantrip ids (DAG edges)
  effects: CantripEffect[];
  elementOpener?: boolean; // v0.1.7: one of the six elemental openers — dynamic cost + affinity-gated reveal (skills.ts)
}

/**
 * v0.1.7 cantrip web (spec §5). A shallow DAG rooted at "Read the Page":
 *
 *                         read-the-page
 *                        /     |      \
 *                    spark    mend   inner-wellspring
 *                   /  |  \  … (six elemental openers) …  \
 *   awaken-fire  awaken-water  awaken-earth  awaken-air  awaken-light  awaken-dark
 *          \
 *       kindle-focus (requires spark)
 *
 * v0.1.7 — elemental essence openers. Spark (cost 10) awakens the GENERIC ❖ Prismatic
 * essence and "unveils" your dominant affinity (sets the `affinityRevealed` flag). It no
 * longer awakens a specific element; the six openers do. Each opener awakens ONE element
 * and carries a DYNAMIC cost that climbs with how many elements you've already opened
 * (40 → 64 → 102 → 164 → 262 → 419; see skills.ts openerCost). The base cost is 40, so
 * every opener starts ABOVE the reachable Insight cap (20 via Notebook) and wears the `*`
 * "exceeds Insight Max" marker — a proper cap-raiser (items) arrives later. Only the
 * DOMINANT-affinity opener is offered right after Spark; the rest unlock once you've
 * awakened at least one element (skills.ts cantripInfo reveal logic).
 */
export const CANTRIPS: Cantrip[] = [
  {
    id: 'read-the-page',
    name: 'Read the Page',
    blurb: 'The torn grimoire page settles into meaning. The cantrip web opens.',
    cost: 5,
    scrollCost: 0, // the free opener — Insight only; learning it unlocks scribing Scrolls
    requires: [],
    effects: [{ kind: 'openTree' }],
  },
  {
    id: 'spark',
    name: 'Spark',
    // v0.1.7: a prismatic spark. It awakens the GENERIC ❖ Prismatic essence (a small
    // trickle that keeps early contracts sustainable) and unveils your bent — revealing
    // the elemental opener your labour has leaned toward. The specific elements are
    // awakened by the six openers below, not here.
    blurb: 'A word of ignition throws a prism of light. ❖ Prismatic essence trickles in, and the colour you lean toward shows through.',
    cost: 10,
    scrollCost: 1,
    requires: ['read-the-page'],
    effects: [
      { kind: 'awaken', element: 'prism', trickle: 0.2 },
      { kind: 'flag', flag: 'affinityRevealed' },
    ],
  },
  {
    id: 'mend',
    name: 'Mend',
    blurb: 'Knit small hurts closed — your Stamina recovers faster.',
    cost: 15,
    scrollCost: 1,
    requires: ['read-the-page'],
    effects: [{ kind: 'vitalRegen', vital: 'stamina', amount: 0.3 }],
  },
  {
    id: 'inner-wellspring',
    name: 'Inner Wellspring',
    blurb: 'A hidden font opens within — Mana unlocks and begins to pool.',
    cost: 15,
    scrollCost: 1,
    requires: ['read-the-page'],
    effects: [{ kind: 'unlockVital', vital: 'mana', max: 10, regen: 0.1 }],
  },
  {
    id: 'kindle-focus',
    name: 'Kindle Focus',
    blurb: 'Hold the flame steady in the mind. +10% to all output.',
    cost: 40,
    scrollCost: 1,
    requires: ['spark'],
    effects: [{ kind: 'outputMult', add: 0.1 }],
  },
  // ---- The six elemental openers (v0.1.7) — each awakens ONE element (trickle 0.2/s).
  // requires Spark; DYNAMIC cost (base 40, ×1.6 per element already opened); affinity-gated
  // reveal (dominant first, the rest after your first awakening). See skills.ts.
  {
    id: 'awaken-fire',
    name: 'Awaken Fire',
    blurb: 'Coax the first ember. ▲ Fire essence catches and begins to burn steady.',
    cost: 40,
    scrollCost: 1,
    requires: ['spark'],
    elementOpener: true,
    effects: [{ kind: 'awaken', element: 'fire', trickle: 0.2 }],
  },
  {
    id: 'awaken-water',
    name: 'Awaken Water',
    blurb: 'Let the current find you. ▼ Water essence wells up and starts to flow.',
    cost: 40,
    scrollCost: 1,
    requires: ['spark'],
    elementOpener: true,
    effects: [{ kind: 'awaken', element: 'water', trickle: 0.2 }],
  },
  {
    id: 'awaken-earth',
    name: 'Awaken Earth',
    blurb: 'Take it for granite. ⬢ Earth essence settles in and holds.',
    cost: 40,
    scrollCost: 1,
    requires: ['spark'],
    elementOpener: true,
    effects: [{ kind: 'awaken', element: 'earth', trickle: 0.2 }],
  },
  {
    id: 'awaken-air',
    name: 'Awaken Air',
    blurb: 'Catch the rising draught. ≈ Air essence gusts loose and lifts.',
    cost: 40,
    scrollCost: 1,
    requires: ['spark'],
    elementOpener: true,
    effects: [{ kind: 'awaken', element: 'air', trickle: 0.2 }],
  },
  {
    id: 'awaken-light',
    name: 'Awaken Light',
    blurb: 'Strike the dawn. ☀ Light essence kindles — and things are looking bright.',
    cost: 40,
    scrollCost: 1,
    requires: ['spark'],
    elementOpener: true,
    effects: [{ kind: 'awaken', element: 'light', trickle: 0.2 }],
  },
  {
    id: 'awaken-dark',
    name: 'Awaken Dark',
    // v0.1.7: the Dark opener replaces the old `umbral-whisper` cantrip.
    blurb: 'Speak to the dark between the stars. ☾ Dark essence answers, and the shadows take your side.',
    cost: 40,
    scrollCost: 1,
    requires: ['spark'],
    elementOpener: true,
    effects: [{ kind: 'awaken', element: 'dark', trickle: 0.2 }],
  },
];

export const CANTRIP_BY_ID: Record<string, Cantrip> = Object.fromEntries(CANTRIPS.map((c) => [c.id, c]));

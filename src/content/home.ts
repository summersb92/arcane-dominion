// Home content (spec §3.10 / §5) — v0.1.1 rewrite. The lair is no longer a set of
// build-tasks ("fixtures"); it is a HOUSING TIER (which sets your Activity-adjacent
// item SLOTS, and may carry rent or innate bonuses) plus EQUIPPABLE ITEMS you buy
// once and slot in for passive Modifiers. Pure data; framework-agnostic (type-only
// imports of the task + state ids, so there is no runtime cycle). systems/home.ts
// interprets these; the UI/CLI only format them.
//
// A Modifier is the single knob every bonus flows through:
//   • kind 'max'  → raises the EFFECTIVE cap of its target  (Coin Pouch → +50 Gold cap)
//   • kind 'rate' → adds to a per-second rate               (Charm of Vigor → +0.05 Life/s;
//                    an ElementId target awakens + trickles that essence; 'jobOutput' scales Odd Jobs)

import type { ElementId } from '../engine/state';
import type { Amount, Requirement } from './tasks';

const A = (pool: Amount['pool'], id: Amount['id'], amount: number): Amount => ({ pool, id, amount });

/** The six housing tiers, from a penniless Vagrant to a self-sufficient Homestead. */
export type HomeTierId = 'vagrant' | 'inn' | 'tent' | 'mentor' | 'house' | 'homestead';

/** Paper-doll EQUIPMENT (v0.1.3) — an item's SLOT-TYPE. A `ring` item may occupy
 *  ring1 OR ring2; a `belt` item occupies the `belt` position and grants belt
 *  sub-slots; a `beltItem` occupies one of those belt sub-slots. All other types map
 *  1:1 to a fixed doll POSITION of the same name. Items WITHOUT a slot are NOT gear —
 *  they stay generic housing-slot furnishings (see HomeState.equipped). */
export type EquipSlotType =
  | 'head'
  | 'amulet'
  | 'torso'
  | 'body'
  | 'leftHand'
  | 'rightHand'
  | 'belt'
  | 'legs'
  | 'boots'
  | 'ring'
  | 'beltItem';

/** The eleven paper-doll POSITIONS (the two rings are distinct positions). Order is the
 *  canonical render order for the doll. run.home.equipment is keyed by these. */
export const EQUIP_POSITIONS = [
  'head',
  'amulet',
  'torso',
  'body',
  'leftHand',
  'rightHand',
  'belt',
  'legs',
  'boots',
  'ring1',
  'ring2',
] as const;
export type EquipPosition = (typeof EQUIP_POSITIONS)[number];

/** Human labels for each doll position (UI). */
export const EQUIP_POSITION_LABEL: Record<EquipPosition, string> = {
  head: 'Head',
  amulet: 'Amulet',
  torso: 'Torso',
  body: 'Body',
  leftHand: 'Left Hand',
  rightHand: 'Right Hand',
  belt: 'Belt',
  legs: 'Legs',
  boots: 'Boots',
  ring1: 'Ring I',
  ring2: 'Ring II',
};

/** What a Modifier acts on: a resource cap, a vital rate, an essence rate (ElementId),
 *  or the Odd-Jobs output multiplier. */
export type ModTarget =
  | 'gold'
  | 'insight'
  | 'moonpetal'
  | 'ironOre'
  | 'spiritDust'
  | 'life'
  | 'stamina'
  | 'mana'
  | ElementId
  | 'jobOutput';

export interface Modifier {
  target: ModTarget;
  kind: 'max' | 'rate';
  amount: number;
}

export interface HomeTier {
  id: HomeTierId;
  name: string;
  blurb: string;
  slots: number; // how many items can be equipped at this tier
  from: HomeTierId[]; // tiers you may move here FROM (the from-chain)
  requires?: Requirement[]; // gate to move in
  moveCost?: Amount[]; // one-off cost to move in
  rent?: Amount[]; // per-second upkeep while living here (spent by runHome)
  innate?: Modifier[]; // always-on bonuses this tier grants (no slot needed)
}

export interface HomeItem {
  id: string;
  name: string;
  blurb: string;
  cost: Amount[]; // one-off purchase price
  requires?: Requirement[]; // gate to buy
  mods: Modifier[]; // bonuses applied only while EQUIPPED (occupies a slot)
  // Paper-doll GEAR (v0.1.3): items WITH a slot are equipped on the Player tab via
  // equipGear/unequipGear. Items WITHOUT a slot remain generic housing-slot furnishings
  // (equipped via equipItem/unequipItem into HomeState.equipped). KEEP BOTH systems.
  slot?: EquipSlotType;
  beltSlots?: number; // belt items only (slot === 'belt'): how many belt sub-slots (1–6) it provides
}

export const HOME_TIERS: HomeTier[] = [
  {
    id: 'vagrant',
    name: 'Vagrant',
    blurb: 'A patch of stable straw. Free, but there is barely room for a single keepsake.',
    slots: 1,
    from: [],
  },
  {
    id: 'inn',
    name: 'Inn Room',
    blurb: 'A rented room over the tavern — a real bed, a lockable chest. The keeper wants coin nightly.',
    slots: 2,
    from: ['vagrant'],
    requires: [{ kind: 'flag', flag: 'lairFounded' }],
    rent: [A('resource', 'gold', 0.1)],
  },
  {
    id: 'tent',
    name: 'Wayfarer Tent',
    blurb: 'A canvas tent pitched on the ridge. Free-standing and airy — the wind itself begins to answer.',
    slots: 2,
    from: ['inn'],
    moveCost: [A('resource', 'gold', 30)],
    innate: [{ target: 'air', kind: 'rate', amount: 0.05 }],
  },
  {
    id: 'mentor',
    name: "Mentor's Loft",
    blurb: 'A scholar takes you in. Cramped, but the shelves and the conversation sharpen your Insight.',
    slots: 3,
    from: ['inn'],
    requires: [{ kind: 'resource', id: 'renown', atLeast: 12 }],
    innate: [{ target: 'insight', kind: 'rate', amount: 0.1 }],
  },
  {
    id: 'house',
    name: 'Town House',
    blurb: 'A narrow house of your own on a quiet lane. Four rooms to furnish, and no landlord.',
    slots: 4,
    // Reachable from the Inn OR either spoke (Tent/Mentor) so a branch is never a dead-end.
    from: ['inn', 'tent', 'mentor'],
    moveCost: [A('resource', 'gold', 120)],
  },
  {
    id: 'homestead',
    name: 'Hill Homestead',
    blurb: 'Land, a forge-shed, and a herb garden. Self-sufficient — ore and moonpetal accrue on their own.',
    slots: 5,
    // The top of the chain: reachable from the Inn, either spoke, or the Town House.
    from: ['inn', 'tent', 'mentor', 'house'],
    moveCost: [A('resource', 'gold', 200), A('resource', 'ironOre', 5)],
    innate: [
      { target: 'ironOre', kind: 'rate', amount: 0.05 },
      { target: 'moonpetal', kind: 'rate', amount: 0.05 },
    ],
  },
];

// NOTE (v0.1.2): Gold-cap raising moved OUT of equippable items and into the cheap early
// Coin Pouch upgrade TASKS (content/tasks.ts).
//
// v0.1.3: items now split into two families that SHARE this one registry (and one buy
// path). Items with a `slot` are paper-doll GEAR (worn on the Player tab); items without
// a slot are generic housing-slot furnishings (slotted on the Home tab), unchanged. A
// tasteful starter set — more gear can be added later without touching the engine.
export const HOME_ITEMS: HomeItem[] = [
  // --- GEAR (paper doll) — moved from the old generic housing slots ---
  {
    id: 'tool-belt',
    name: 'Tool Belt',
    blurb: 'Every implement to hand, and loops to spare — your Odd Jobs pay noticeably better.',
    cost: [A('resource', 'gold', 40)],
    slot: 'belt',
    beltSlots: 2,
    mods: [{ target: 'jobOutput', kind: 'rate', amount: 0.2 }],
  },
  {
    id: 'herbalist-kit',
    name: 'Herbalist Kit',
    blurb: 'Salves and tonics that clip to your belt — you recover Stamina faster.',
    cost: [A('resource', 'gold', 25)],
    slot: 'beltItem',
    mods: [{ target: 'stamina', kind: 'rate', amount: 0.1 }],
  },
  {
    id: 'charm-of-vigor',
    name: 'Charm of Vigor',
    blurb: 'A warm little talisman worn at the throat — your Life mends a touch quicker.',
    cost: [A('resource', 'gold', 20)],
    slot: 'amulet',
    mods: [{ target: 'life', kind: 'rate', amount: 0.05 }],
  },
  {
    id: 'mana-crystal',
    name: 'Mana Crystal',
    blurb: 'A humming shard set in a band — the wellspring within regenerates faster.',
    cost: [A('resource', 'gold', 35)],
    requires: [{ kind: 'skill', id: 'inner-wellspring' }],
    slot: 'ring',
    mods: [{ target: 'mana', kind: 'rate', amount: 0.1 }],
  },
  // --- GEAR (paper doll) — new starter pieces to fill the remaining positions ---
  {
    id: 'apprentice-hood',
    name: 'Apprentice Hood',
    blurb: 'A plain hood that keeps the draughts off — surprisingly good for concentration.',
    cost: [A('resource', 'gold', 20)],
    slot: 'head',
    mods: [{ target: 'insight', kind: 'rate', amount: 0.05 }],
  },
  {
    id: 'padded-jerkin',
    name: 'Padded Jerkin',
    blurb: 'Quilted and cosy — a knock that would bruise merely thuds. Your Life mends steadier.',
    cost: [A('resource', 'gold', 18)],
    slot: 'torso',
    mods: [{ target: 'life', kind: 'rate', amount: 0.05 }],
  },
  {
    id: 'travelers-cloak',
    name: "Traveler's Cloak",
    blurb: 'Weatherproof and road-worn — you march farther before flagging. Stamina returns quicker.',
    cost: [A('resource', 'gold', 22)],
    slot: 'body',
    mods: [{ target: 'stamina', kind: 'rate', amount: 0.05 }],
  },
  {
    id: 'warding-focus',
    name: 'Warding Focus',
    blurb: 'A palm-sized sigil-disc for the off hand — it steadies the flow of Mana.',
    cost: [A('resource', 'gold', 30)],
    requires: [{ kind: 'skill', id: 'inner-wellspring' }],
    slot: 'leftHand',
    mods: [{ target: 'mana', kind: 'rate', amount: 0.05 }],
  },
  {
    id: 'oak-staff',
    name: 'Oak Staff',
    blurb: 'A stout stave of seasoned oak — good leverage makes every Odd Job pay a little more.',
    cost: [A('resource', 'gold', 35)],
    slot: 'rightHand',
    mods: [{ target: 'jobOutput', kind: 'rate', amount: 0.1 }],
  },
  {
    id: 'sturdy-breeches',
    name: 'Sturdy Breeches',
    blurb: 'Double-stitched at the knee — you can labour longer. Stamina recovers a touch faster.',
    cost: [A('resource', 'gold', 18)],
    slot: 'legs',
    mods: [{ target: 'stamina', kind: 'rate', amount: 0.05 }],
  },
  {
    id: 'worn-boots',
    name: 'Worn Boots',
    blurb: 'Broken in over many a mile — they get you to the work sooner. Odd Jobs pay a bit more.',
    cost: [A('resource', 'gold', 15)],
    slot: 'boots',
    mods: [{ target: 'jobOutput', kind: 'rate', amount: 0.1 }],
  },
  {
    id: 'signet-ring',
    name: 'Signet Ring',
    blurb: 'A modest seal of station — it lends a scholarly gravity. A small, steady bump to Insight.',
    cost: [A('resource', 'gold', 25)],
    slot: 'ring',
    mods: [{ target: 'insight', kind: 'rate', amount: 0.05 }],
  },
  {
    id: 'utility-belt',
    name: 'Utility Belt',
    blurb: 'A broad belt bristling with loops — four pouches to hang your tricks from.',
    cost: [A('resource', 'gold', 40)],
    slot: 'belt',
    beltSlots: 4,
    mods: [{ target: 'jobOutput', kind: 'rate', amount: 0.05 }],
  },
  {
    id: 'vial-of-focus',
    name: 'Vial of Focus',
    blurb: 'A stoppered draught of clarity, clipped to the belt — a sip sharpens the mind. +Insight.',
    cost: [A('resource', 'gold', 20)],
    slot: 'beltItem',
    mods: [{ target: 'insight', kind: 'rate', amount: 0.05 }],
  },
  {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    blurb: 'A worn coin that never quite leaves your purse — the odd job somehow pays that bit more.',
    cost: [A('resource', 'gold', 20)],
    slot: 'beltItem',
    mods: [{ target: 'jobOutput', kind: 'rate', amount: 0.05 }],
  },
  // --- generic HOUSING-slot furnishings (NO slot) — unchanged from v0.1.2 ---
  {
    id: 'hearth-stone',
    name: 'Hearth Stone',
    blurb: 'A rune-warmed stone. Equipping it awakens ▲ Fire essence and keeps it trickling.',
    cost: [A('resource', 'gold', 25), A('resource', 'ironOre', 2)],
    mods: [{ target: 'fire', kind: 'rate', amount: 0.15 }],
  },
  {
    id: 'focusing-lens',
    name: 'Focusing Lens',
    blurb: 'Ground crystal that clarifies study — a steady bump to Insight.',
    cost: [A('resource', 'gold', 30), A('resource', 'spiritDust', 2)],
    mods: [{ target: 'insight', kind: 'rate', amount: 0.12 }],
  },
  {
    id: 'warded-chest',
    name: 'Warded Chest',
    blurb: 'A preservation-warded chest — store far more of every raw material.',
    cost: [A('resource', 'gold', 40)],
    mods: [
      { target: 'moonpetal', kind: 'max', amount: 50 },
      { target: 'ironOre', kind: 'max', amount: 50 },
      { target: 'spiritDust', kind: 'max', amount: 50 },
    ],
  },
];

export const HOME_TIER_BY_ID: Record<string, HomeTier> = Object.fromEntries(HOME_TIERS.map((t) => [t.id, t]));
export const HOME_ITEM_BY_ID: Record<string, HomeItem> = Object.fromEntries(HOME_ITEMS.map((i) => [i.id, i]));

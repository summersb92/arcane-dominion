// The canonical GameState — one serializable object is the whole game.
// No DOM, no Svelte. Everything the sim, save, and CLI touch lives here.

import { STARTING } from '../content/config';
import { EQUIP_POSITIONS, type EquipPosition, type HomeTierId } from '../content/home';
import { seedFrom } from './rng';

export const SAVE_VERSION = 5;

export type ElementId = 'prism' | 'fire' | 'water' | 'earth' | 'air' | 'dark' | 'light';

export type ResourceId = 'gold' | 'insight' | 'renown' | 'moonpetal' | 'ironOre' | 'spiritDust' | 'scroll';

export type VitalId = 'life' | 'stamina' | 'mana';

export type Phase = 'origin' | 'awakened' | 'lair' | 'founded';

/** BASE storage caps (the mutable floor). EFFECTIVE caps add equipped-item / tier-innate
 *  `max` modifiers on top (see systems/home.ts effectiveCap). Renown is uncapped. */
export interface Caps {
  gold: number;
  insight: number;
  moonpetal: number;
  ironOre: number;
  spiritDust: number;
}

/** The lair (v0.1.1): a housing tier plus the items you own and have equipped. */
export interface HomeState {
  tier: HomeTierId;
  owned: string[]; // item ids purchased (ALL items — gear + generic — go here)
  equipped: string[]; // generic housing-slot item ids currently slotted (⊆ owned, ≤ tier.slots)
  // Paper-doll EQUIPMENT (v0.1.3): the eleven positions, each holding a gear item id or null.
  equipment: Record<EquipPosition, string | null>;
  // Belt sub-slot contents — length tracks the equipped belt's `beltSlots` (0 when no belt).
  beltItems: (string | null)[];
}

export interface Vital {
  cur: number;
  max: number;
  regen: number; // per second
}

export interface EssenceState {
  amount: number;
  awakened: boolean;
}

export interface TaskRuntime {
  active: boolean;
  progress: number; // 0..1 for timed tasks
  paused: boolean;
  count: number; // completions (for At-N scaling, T-004)
  repeat: boolean; // running tasks: restart on completion (the in-card ↻ toggle)
}

export interface ChronicleEntry {
  at: number; // simulated-playtime seconds
  text: string;
  kind?: 'ev' | 'found';
}

export interface RunState {
  act: number;
  phase: Phase;
  name: string; // the mage's chosen name ('' until named — the character-creation trigger; v0.1.2)
  title: string; // earned honorific ('Waif' at the Origin; v0.1.2)
  resources: Record<ResourceId, number>;
  caps: Caps;
  vitals: { life: Vital; stamina: Vital; mana: Vital };
  essence: Record<ElementId, EssenceState>;
  tasks: Record<string, TaskRuntime>; // T-004
  activitySlots: number; // continuous-task capacity (starts 2) — T-004
  skills: string[]; // learned cantrip ids (T-005)
  home: HomeState; // housing tier + owned/equipped items (v0.1.1)
  // Strength (v0.1.4): a physical-labour stat. strengthXp accrues from Clean Stables;
  // the effective multiplier is DERIVED from it (see systems/player.ts strength()).
  strengthXp: number;
  // Hidden elemental AFFINITY (v0.1.4): a per-element counter incremented whenever an
  // element-tagged income task completes. The dominant element's opener is unveiled first
  // after Spark (v0.1.7); learning that opener sets `affinityElement` — the awakened element
  // (null until awakening) that resolves the 'affinity' essence sentinel in contract costs.
  // While it is null the sentinel resolves to ❖ Prismatic (Spark's essence).
  affinity: Record<ElementId, number>;
  affinityElement: ElementId | null;
  // Progressive resource reveal (v0.1.6): a resource id is marked `true` once the player
  // has ever held > 0 of it (set engine-side in tick.step). The left panel shows a
  // material/insight row only once discovered, and keeps showing it thereafter even if
  // it's later spent back to 0. Gold is always seeded true (shown from the start).
  discovered: Partial<Record<ResourceId, boolean>>;
  flags: Record<string, boolean>;
  chronicle: ChronicleEntry[];
}

export interface Settings {
  notation: 'suffix' | 'full' | 'scientific';
  theme: string;
  chronicleLines: number; // how many Chronicle lines to show (clamped 5..10) — v0.1.1
  font: string; // UI font family key ('mono' default) — v0.1.1
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  run: RunState;
  settings: Settings;
  playtime: number; // seconds of simulated time
  lastSaved: number; // epoch ms
}

const ELEMENTS: ElementId[] = ['prism', 'fire', 'water', 'earth', 'air', 'dark', 'light'];

function freshEssence(): Record<ElementId, EssenceState> {
  const e = {} as Record<ElementId, EssenceState>;
  for (const id of ELEMENTS) e[id] = { amount: 0, awakened: false };
  return e;
}

/** A brand-new paper-doll: every equipment position empty. Exported for save normalize/migrate. */
export function freshEquipment(): Record<EquipPosition, string | null> {
  const eq = {} as Record<EquipPosition, string | null>;
  for (const pos of EQUIP_POSITIONS) eq[pos] = null;
  return eq;
}

/** A brand-new affinity ledger: every element at 0. Exported for save normalize/migrate. */
export function freshAffinity(): Record<ElementId, number> {
  const a = {} as Record<ElementId, number>;
  for (const id of ELEMENTS) a[id] = 0;
  return a;
}

/** A brand-new Act I save: a penniless stable-hand at the Origin. */
export function newGame(seed: number = seedFrom(Date.now())): GameState {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    seed,
    rngState: seed >>> 0,
    run: {
      act: 1,
      phase: 'origin',
      name: '', // unnamed until character creation (needsNaming = true)
      title: 'Waif', // the Origin honorific
      resources: {
        gold: STARTING.gold,
        insight: STARTING.insight,
        renown: STARTING.renown,
        moonpetal: STARTING.moonpetal,
        ironOre: STARTING.ironOre,
        spiritDust: STARTING.spiritDust,
        scroll: STARTING.scroll,
      },
      caps: {
        gold: STARTING.goldCap,
        insight: STARTING.insightCap,
        moonpetal: STARTING.materialCap,
        ironOre: STARTING.materialCap,
        spiritDust: STARTING.materialCap,
      },
      vitals: {
        life: { ...STARTING.life },
        stamina: { ...STARTING.stamina },
        mana: { ...STARTING.mana },
      },
      essence: freshEssence(),
      tasks: {},
      activitySlots: STARTING.activitySlots,
      skills: [],
      home: { tier: 'vagrant', owned: [], equipped: [], equipment: freshEquipment(), beltItems: [] },
      strengthXp: 0,
      affinity: freshAffinity(),
      affinityElement: null,
      discovered: { gold: true }, // Gold is always visible from the start (v0.1.6)
      flags: {},
      chronicle: [{ at: 0, text: 'You awaken, penniless, in the stable straw.' }],
    },
    settings: { notation: 'suffix', theme: 'system', chronicleLines: 8, font: 'mono' },
    playtime: 0,
    lastSaved: now,
  };
}

export { ELEMENTS };

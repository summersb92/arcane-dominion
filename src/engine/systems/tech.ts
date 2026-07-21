// Tech — spend Research (produced by Scholars) to unlock tree nodes. Gated on
// prerequisite tech and on having the research cost on hand. Unlocking a node adds its
// id to run.tech, which is what BuildingDef.requiresTech + the production efficiency
// bonuses read. Pure engine, no DOM.

import { TECHS, TECH_BY_ID, type TechDef, type TechId } from '../../content/tech';
import type { GameState } from '../state';
import { logEvent } from './chronicle';

const EPS = 1e-9;

/** True once every prerequisite tech is unlocked. */
export function prereqsMet(state: GameState, def: TechDef): boolean {
  for (const pre of def.requires ?? []) {
    if (!state.run.tech.includes(pre)) return false;
  }
  return true;
}

/** True if the node's research cost is affordable right now. */
export function canAffordTech(state: GameState, id: TechId): boolean {
  const def = TECH_BY_ID[id];
  return !!def && state.run.resources.research >= def.cost - EPS;
}

/**
 * Research one tech node. Enforces "not already known", prerequisites, and cost; on
 * success spends the research and records the unlock (plus its story beats). Returns
 * true if unlocked. No mutation on refusal.
 */
export function research(state: GameState, id: TechId): boolean {
  const def = TECH_BY_ID[id];
  if (!def) return false;
  if (state.run.tech.includes(id)) return false;
  if (!prereqsMet(state, def)) return false;
  if (!canAffordTech(state, id)) return false;

  state.run.resources.research -= def.cost;
  state.run.tech.push(id);
  logEvent(state, `Researched ${def.name}.`);

  // Awakening opens the magic tier — a headline beat.
  if (id === 'awakening' && state.run.flags.awakened !== true) {
    state.run.flags.awakened = true;
    logEvent(state, 'The settlement awakens to magic. Mana begins to flow.', 'ev');
  }
  return true;
}

export interface TechView {
  id: TechId;
  name: string;
  blurb: string;
  cost: number;
  unlocks: string[];
  researched: boolean;
  available: boolean; // prereqs met and not yet researched
  affordable: boolean;
}

/** Read model: every tech node's cost, unlock status, and researchability. */
export function techView(state: GameState): TechView[] {
  return TECHS.map((def) => {
    const researched = state.run.tech.includes(def.id);
    return {
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      cost: def.cost,
      unlocks: def.unlocks,
      researched,
      available: !researched && prereqsMet(state, def),
      affordable: canAffordTech(state, def.id),
    };
  });
}

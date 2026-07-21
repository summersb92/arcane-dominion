// Tech — spend Research (produced by Scholars) to unlock tree nodes. Gated on
// prerequisite tech and on having the research cost on hand. Unlocking a node adds its
// id to run.tech, which is what BuildingDef.requiresTech + the production efficiency
// bonuses read. Pure engine, no DOM.

import { TECHS, TECH_BY_ID, type TechDef, type TechId } from '../../content/tech';
import type { ResourceId } from '../../content/resources';
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

/** True if the node's FULL cost — research AND every material in resourceCost — is
 *  affordable right now. */
export function canAffordTech(state: GameState, id: TechId): boolean {
  const def = TECH_BY_ID[id];
  if (!def) return false;
  if (state.run.resources.research < def.cost - EPS) return false;
  for (const [res, amt] of Object.entries(def.resourceCost ?? {})) {
    if ((state.run.resources[res as ResourceId] ?? 0) < (amt as number) - EPS) return false;
  }
  return true;
}

/**
 * Research one tech node. Enforces "not already known", prerequisites, and the full cost
 * (research + every material in resourceCost); on success spends them all and records the
 * unlock (plus its story beats). Returns true if unlocked. No mutation on refusal.
 */
export function research(state: GameState, id: TechId): boolean {
  const def = TECH_BY_ID[id];
  if (!def) return false;
  if (state.run.tech.includes(id)) return false;
  if (!prereqsMet(state, def)) return false;
  if (!canAffordTech(state, id)) return false;

  state.run.resources.research -= def.cost;
  for (const [res, amt] of Object.entries(def.resourceCost ?? {})) {
    state.run.resources[res as ResourceId] -= amt as number;
  }
  state.run.tech.push(id);
  logEvent(state, `Researched ${def.name}.`);
  return true;
}

export interface TechView {
  id: TechId;
  name: string;
  blurb: string;
  cost: number;
  resourceCost: Partial<Record<ResourceId, number>>; // extra MATERIAL cost beyond research
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
      resourceCost: def.resourceCost ?? {},
      unlocks: def.unlocks,
      researched,
      available: !researched && prereqsMet(state, def),
      affordable: canAffordTech(state, def.id),
    };
  });
}

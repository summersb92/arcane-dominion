// Founding system (spec §3.11 / §5) — the derived read model for the v0.1 finale
// gate. Pure engine (NO DOM/Svelte): the same status feeds the Home progress card,
// the CLI `state` readout, the Chronicle nudge, and (T-006b) the autoplay bot.
//
// The gate itself is enforced by the found-academy task's `requires` (the Task
// system is the single evaluator). This module reports the SAME four requirements
// as a legible have/need snapshot so the goal is always visible — it does not gate.

import { FOUNDING } from '../../content/config';
import type { GameState } from '../state';

export interface ResourceReq {
  have: number;
  need: number;
  met: boolean;
}

export interface FoundingStatus {
  gold: ResourceReq;
  renown: ResourceReq;
  charter: { met: boolean };
  site: { met: boolean };
  metCount: number; // 0..4
  total: number; // 4
  allMet: boolean; // every requirement satisfied (the gate is open)
  founded: boolean; // the Founding has already happened
}

export function foundingStatus(state: GameState): FoundingStatus {
  const r = state.run.resources;
  const f = state.run.flags;
  const gold: ResourceReq = { have: r.gold ?? 0, need: FOUNDING.goldHeld, met: (r.gold ?? 0) >= FOUNDING.goldHeld };
  const renown: ResourceReq = {
    have: r.renown ?? 0,
    need: FOUNDING.renown,
    met: (r.renown ?? 0) >= FOUNDING.renown,
  };
  const charter = { met: f.hasCharter === true };
  const site = { met: f.hasSite === true };
  const metCount = [gold.met, renown.met, charter.met, site.met].filter(Boolean).length;
  return {
    gold,
    renown,
    charter,
    site,
    metCount,
    total: 4,
    allMet: metCount === 4,
    founded: f.founded === true,
  };
}

/** Is the Founding gate open right now (and not already founded)? */
export function canFound(state: GameState): boolean {
  const s = foundingStatus(state);
  return s.allMet && !s.founded;
}

/** A one-line snapshot for the Chronicle nudge + CLI: "Gold ✓ · Renown 12/25 · Charter ✗ · Site ✗". */
export function foundingSummaryLine(state: GameState): string {
  const s = foundingStatus(state);
  const num = (x: number): string => String(+x.toFixed(0));
  const res = (r: ResourceReq): string => (r.met ? '✓' : `${num(r.have)}/${num(r.need)}`);
  return `Gold ${res(s.gold)} · Renown ${res(s.renown)} · Charter ${s.charter.met ? '✓' : '✗'} · Site ${s.site.met ? '✓' : '✗'}`;
}

// Policy catalogue (pure data). A POLICY is a standing edict enacted from the Government
// panel (unlocked by the Code of Laws tech). Each active policy drains CULTURE per second
// as upkeep; when the culture runs dry, every policy SUSPENDS (its effects stop) until
// culture flows again. Active policies are limited by POLICY SLOTS granted by governance
// techs (Code of Laws / Monarchy / Civil Service / Republic — see systems/government.ts).
//
// Effects are simple multipliers/adders read by the engine:
//   workerOutputMult  → multiplies every worker's output (production.ts globalJobMult)
//   foodUpkeepMult    → multiplies the per-settler food upkeep (production.ts)
//   researchPerPopMult→ multiplies the per-settler research trickle (production.ts)
//   manaOutputMult    → multiplies gross mana production (production.ts)
//   happiness         → flat happiness adjustment (systems/happiness.ts)
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

import type { TechId } from './tech';

export type PolicyId =
  | 'rationing'
  | 'festivals'
  | 'apprenticeships'
  | 'patronage'
  | 'night-shifts'
  | 'arcane-sanction';

export interface PolicyDef {
  id: PolicyId;
  name: string;
  /** ONE flavor sentence — effects are listed structurally in the UI. */
  blurb: string;
  /** Culture drained per second while the policy is active (its ongoing upkeep). */
  upkeep: number;
  /** Tech that must be researched before this policy appears (besides Code of Laws). */
  requiresTech?: TechId;
  /** Run flag that must be true before this policy appears (e.g. 'magicDiscovered'). */
  requiresFlag?: string;
  // ---- effects (all optional) ----
  workerOutputMult?: number;
  foodUpkeepMult?: number;
  researchPerPopMult?: number;
  manaOutputMult?: number;
  happiness?: number;
}

export const POLICIES: PolicyDef[] = [
  {
    id: 'rationing',
    name: 'Rationing',
    blurb: 'Everyone eats; nobody feasts.',
    upkeep: 0.2,
    foodUpkeepMult: 0.75,
    happiness: -8,
  },
  {
    id: 'festivals',
    name: 'Festivals',
    blurb: 'Bread, spectacle, and a day off.',
    upkeep: 0.3,
    happiness: 8,
  },
  {
    id: 'apprenticeships',
    name: 'Apprenticeships',
    blurb: 'The young learn by doing — mostly the fetching.',
    upkeep: 0.25,
    workerOutputMult: 1.1,
    happiness: -4,
  },
  {
    id: 'patronage',
    name: 'Scholarly Patronage',
    blurb: 'Fund the curious; forgive the ink stains.',
    upkeep: 0.25,
    researchPerPopMult: 1.25,
    workerOutputMult: 0.9,
  },
  {
    id: 'night-shifts',
    name: 'Night Shifts',
    blurb: 'The lamps burn late; so does everyone.',
    upkeep: 0.4,
    requiresTech: 'industrialization',
    workerOutputMult: 1.15,
    happiness: -10,
  },
  {
    id: 'arcane-sanction',
    name: 'Arcane Sanction',
    blurb: 'Magic, licensed and taxed accordingly.',
    upkeep: 0.3,
    requiresFlag: 'magicDiscovered',
    manaOutputMult: 1.25,
    happiness: -5,
  },
];

export const POLICY_IDS: PolicyId[] = POLICIES.map((p) => p.id);

export const POLICY_BY_ID: Record<PolicyId, PolicyDef> = Object.fromEntries(
  POLICIES.map((p) => [p.id, p]),
) as Record<PolicyId, PolicyDef>;

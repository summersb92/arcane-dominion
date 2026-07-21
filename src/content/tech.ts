// Tech tree (pure data). Research (produced by Scholars) is spent to unlock nodes.
// Each node lists prerequisite tech ids and a human-readable `unlocks` list; the
// ACTUAL gating lives on the things gated (BuildingDef.requiresTech, and the two
// efficiency techs read in systems/production.ts). This slice has five nodes,
// culminating in the magic tier: Awakening opens Mana + the Arcane Font, and
// Animation unlocks the Animated Tools construct (the labour-automation hook).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

export type TechId = 'woodworking' | 'agriculture' | 'masonry' | 'awakening' | 'animation';

export interface TechDef {
  id: TechId;
  name: string;
  blurb: string;
  /** Research cost. */
  cost: number;
  /** Prerequisite tech ids that must already be unlocked. */
  requires?: TechId[];
  /** Human-readable list of what this node opens (for the UI). */
  unlocks: string[];
}

export const TECHS: TechDef[] = [
  {
    id: 'woodworking',
    name: 'Woodworking',
    blurb: 'Better axes and technique. Woodcutters produce +50% wood.',
    cost: 5,
    unlocks: ['+50% Woodcutter output'],
  },
  {
    id: 'agriculture',
    name: 'Agriculture',
    blurb: 'Tend the land instead of scavenging it. Foragers produce +50% food.',
    cost: 10,
    unlocks: ['+50% Forager output'],
  },
  {
    id: 'masonry',
    name: 'Masonry',
    blurb: 'Shape stone at scale. Unlocks the Quarry and the Quarry Worker job.',
    cost: 15,
    unlocks: ['Quarry (building)', 'Quarry Worker (job)'],
  },
  {
    id: 'awakening',
    name: 'Awakening',
    blurb: 'The settlement first touches magic. Unlocks Mana and the Arcane Font.',
    cost: 25,
    unlocks: ['Mana (resource)', 'Arcane Font (building)'],
  },
  {
    id: 'animation',
    name: 'Animation',
    blurb: 'Bind spirits into tools. Unlocks Animated Tools — labour without settlers.',
    cost: 40,
    requires: ['awakening'],
    unlocks: ['Animated Tools (construct)'],
  },
];

export const TECH_IDS: TechId[] = TECHS.map((t) => t.id);

export const TECH_BY_ID: Record<TechId, TechDef> = Object.fromEntries(
  TECHS.map((t) => [t.id, t]),
) as Record<TechId, TechDef>;

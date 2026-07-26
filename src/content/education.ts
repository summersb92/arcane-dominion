// Curriculum catalogue (pure data). The Arcanum teaches one DISCIPLINE at a time: the
// focused discipline's yield rises sharply while every other magical yield gives a little
// back (content/config.ts EDUCATION). Specializing is the point — a general curriculum is
// allowed (curriculum = null) but earns no bonus.
//
// Each elemental discipline also names its OPPOSITE. A stronger opposing essence drowns out
// the weaker one's job empowerment, asymptotically (systems/education.ts oppositionFactor).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

import type { ResourceId } from './resources';

export type CurriculumId = 'aeromancy' | 'geomancy' | 'pyromancy' | 'hydromancy' | 'prismatics';

export interface CurriculumDef {
  id: CurriculumId;
  name: string;
  /** ONE flavor sentence — the mechanical numbers are derived for the UI. */
  blurb: string;
  /** The resource this curriculum specializes in. */
  resource: ResourceId;
  /** Tech that must be researched before this discipline may be taught. */
  requiresTech: string;
}

export const CURRICULA: CurriculumDef[] = [
  {
    id: 'aeromancy',
    name: 'Aeromancy',
    blurb: 'Lectures held outdoors, frequently interrupted by their own subject.',
    resource: 'airEssence',
    requiresTech: 'aeromancy',
  },
  {
    id: 'geomancy',
    name: 'Geomancy',
    blurb: 'Slow, patient study. The reading list is a hillside.',
    resource: 'earthEssence',
    requiresTech: 'geomancy',
  },
  {
    id: 'pyromancy',
    name: 'Pyromancy',
    blurb: 'The most popular faculty, and the one that rebuilds most often.',
    resource: 'fireEssence',
    requiresTech: 'pyromancy',
  },
  {
    id: 'hydromancy',
    name: 'Hydromancy',
    blurb: 'Everything is written on water, which the students find trying.',
    resource: 'waterEssence',
    requiresTech: 'hydromancy',
  },
  {
    id: 'prismatics',
    name: 'Prismatics',
    blurb: 'Four tempers taught as one subject, at the cost of teaching any of them well.',
    resource: 'prismatic',
    requiresTech: 'prismatic-convergence',
  },
];

export const CURRICULUM_BY_ID: Record<CurriculumId, CurriculumDef> = Object.fromEntries(
  CURRICULA.map((c) => [c.id, c]),
) as Record<CurriculumId, CurriculumDef>;

/** The four elemental essences and their OPPOSITES: Air ↔ Earth, Fire ↔ Water. */
export const OPPOSITE_ESSENCE: Partial<Record<ResourceId, ResourceId>> = {
  airEssence: 'earthEssence',
  earthEssence: 'airEssence',
  fireEssence: 'waterEssence',
  waterEssence: 'fireEssence',
};

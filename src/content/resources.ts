// Resource catalogue (pure data, no DOM). The currencies of the slice:
// three MUNDANE materials that population gathers/works by hand (wood, food, stone),
// two KNOWLEDGE currencies (research — now capped by science buildings — and culture,
// a Civ-inspired future currency, uncapped for now), and one MAGIC currency (mana).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

export type ResourceId = 'wood' | 'food' | 'stone' | 'furs' | 'manaCrystals' | 'mana' | 'research' | 'culture';

/** The storage-capped materials held in RunState.caps: the three mundane materials, the FURS
 *  luxury good, and MANA CRYSTALS (the mined proto-magic material) — all capped like one another,
 *  base 200, raised by the same `cap` building effect. Mana/culture are uncapped; research is
 *  capped by science buildings (a derived cap, NOT stored in RunState.caps). */
export type MundaneResourceId = 'wood' | 'food' | 'stone' | 'furs' | 'manaCrystals';

export interface ResourceDef {
  id: ResourceId;
  label: string;
  glyph: string; // retained in data; the UI no longer renders resource icons
  tier: 'mundane' | 'knowledge' | 'magic';
}

export const RESOURCES: ResourceDef[] = [
  { id: 'wood', label: 'Wood', glyph: '🪵', tier: 'mundane' },
  { id: 'food', label: 'Food', glyph: '🍞', tier: 'mundane' },
  { id: 'stone', label: 'Stone', glyph: '🪨', tier: 'mundane' },
  // Furs — a luxury good hunters bring in. Capped like the mundane materials and listed
  // with the main resources (tier 'mundane' groups it there, not under Magic).
  { id: 'furs', label: 'Furs', glyph: '🦊', tier: 'mundane' },
  // Mana Crystals — a proto-magic material the Mines yield as a slow trickle. Capped like the
  // mundane materials (base 200, raised by Storehouses) so it rides the existing cap machinery.
  // Reaching a threshold is one of the three paths that discovers magic (systems/magic.ts).
  { id: 'manaCrystals', label: 'Mana Crystals', glyph: '💎', tier: 'mundane' },
  { id: 'research', label: 'Research', glyph: '📜', tier: 'knowledge' },
  { id: 'culture', label: 'Culture', glyph: '🎭', tier: 'knowledge' },
  { id: 'mana', label: 'Mana', glyph: '✦', tier: 'magic' },
];

/** Every resource id, in display order. */
export const RESOURCE_IDS: ResourceId[] = RESOURCES.map((r) => r.id);

/** The capped subset — the only ids present in RunState.caps (mundane materials + furs). */
export const MUNDANE_RESOURCE_IDS: MundaneResourceId[] = ['wood', 'food', 'stone', 'furs', 'manaCrystals'];

export const RESOURCE_BY_ID: Record<ResourceId, ResourceDef> = Object.fromEntries(
  RESOURCES.map((r) => [r.id, r]),
) as Record<ResourceId, ResourceDef>;

/** True for the currencies with NO finite storage cap (effectiveCap returns Infinity):
 *  mana and culture. Research is now capped by science buildings, so it is NOT included. */
export function isUncappedResource(id: ResourceId): boolean {
  return id === 'mana' || id === 'culture';
}

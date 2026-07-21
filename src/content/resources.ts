// Resource catalogue (pure data, no DOM). The currencies of the slice:
// three MUNDANE materials that population gathers/works by hand (wood, food, stone),
// two KNOWLEDGE currencies (research — now capped by science buildings — and culture,
// a Civ-inspired future currency, uncapped for now), and one MAGIC currency (mana).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

export type ResourceId = 'wood' | 'food' | 'stone' | 'mana' | 'research' | 'culture';

/** The three storage-capped materials. Mana/culture are uncapped; research is capped by
 *  science buildings (a derived cap, NOT stored in RunState.caps). */
export type MundaneResourceId = 'wood' | 'food' | 'stone';

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
  { id: 'research', label: 'Research', glyph: '📜', tier: 'knowledge' },
  { id: 'culture', label: 'Culture', glyph: '🎭', tier: 'knowledge' },
  { id: 'mana', label: 'Mana', glyph: '✦', tier: 'magic' },
];

/** Every resource id, in display order. */
export const RESOURCE_IDS: ResourceId[] = RESOURCES.map((r) => r.id);

/** The capped (mundane) subset — the only ids present in RunState.caps. */
export const MUNDANE_RESOURCE_IDS: MundaneResourceId[] = ['wood', 'food', 'stone'];

export const RESOURCE_BY_ID: Record<ResourceId, ResourceDef> = Object.fromEntries(
  RESOURCES.map((r) => [r.id, r]),
) as Record<ResourceId, ResourceDef>;

/** True for the currencies with NO finite storage cap (effectiveCap returns Infinity):
 *  mana and culture. Research is now capped by science buildings, so it is NOT included. */
export function isUncappedResource(id: ResourceId): boolean {
  return id === 'mana' || id === 'culture';
}

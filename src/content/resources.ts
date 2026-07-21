// Resource catalogue (pure data, no DOM). The five currencies of the v0.1 slice:
// three MUNDANE materials that population gathers/works by hand (wood, food, stone)
// and two MAGIC currencies the sorcery tier introduces (mana, research).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

export type ResourceId = 'wood' | 'food' | 'stone' | 'mana' | 'research';

/** The three storage-capped materials. Mana/research are uncapped this slice. */
export type MundaneResourceId = 'wood' | 'food' | 'stone';

export interface ResourceDef {
  id: ResourceId;
  label: string;
  glyph: string;
  tier: 'mundane' | 'magic';
}

export const RESOURCES: ResourceDef[] = [
  { id: 'wood', label: 'Wood', glyph: '🪵', tier: 'mundane' },
  { id: 'food', label: 'Food', glyph: '🍞', tier: 'mundane' },
  { id: 'stone', label: 'Stone', glyph: '🪨', tier: 'mundane' },
  { id: 'mana', label: 'Mana', glyph: '✦', tier: 'magic' },
  { id: 'research', label: 'Research', glyph: '📜', tier: 'magic' },
];

/** Every resource id, in display order. */
export const RESOURCE_IDS: ResourceId[] = RESOURCES.map((r) => r.id);

/** The capped (mundane) subset — the only ids present in RunState.caps. */
export const MUNDANE_RESOURCE_IDS: MundaneResourceId[] = ['wood', 'food', 'stone'];

export const RESOURCE_BY_ID: Record<ResourceId, ResourceDef> = Object.fromEntries(
  RESOURCES.map((r) => [r.id, r]),
) as Record<ResourceId, ResourceDef>;

/** True for the two uncapped magic currencies (effectiveCap returns Infinity for these). */
export function isMagicResource(id: ResourceId): boolean {
  return id === 'mana' || id === 'research';
}

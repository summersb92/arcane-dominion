// Resource catalogue (pure data, no DOM). The currencies of the slice:
// three MUNDANE materials that population gathers/works by hand (wood, food, stone),
// two KNOWLEDGE currencies (research — now capped by science buildings — and culture,
// a Civ-inspired future currency, uncapped for now), and one MAGIC currency (mana).
//
// Framework-agnostic — imported by the engine, the CLI, and (later) the UI.

export type ResourceId =
  | 'wood'
  | 'food'
  | 'stone'
  | 'iron'
  | 'coal'
  | 'steel'
  | 'tools'
  | 'engines'
  | 'furniture'
  | 'furs'
  | 'manaCrystals'
  | 'mana'
  | 'research'
  | 'culture';

/** The storage-capped materials held in RunState.caps: the three mundane materials, the FURS
 *  luxury good, and MANA CRYSTALS (the mined proto-magic material) — all capped like one another,
 *  base 200, raised by the same `cap` building effect. Mana/culture are uncapped; research is
 *  capped by science buildings (a derived cap, NOT stored in RunState.caps). */
export type MundaneResourceId =
  | 'wood'
  | 'food'
  | 'stone'
  | 'iron'
  | 'coal'
  | 'steel'
  | 'tools'
  | 'engines'
  | 'furniture'
  | 'furs'
  | 'manaCrystals';

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
  // Iron — ore dug from the Mine (Miner job + the Mine's passive). Capped like the other
  // mundane materials (base 200, raised by the same `cap` effect). Stone comes from the
  // Quarry; the Mine is the iron source. Hidden in the UI until the first ore is mined.
  { id: 'iron', label: 'Iron', glyph: '🔩', tier: 'mundane' },
  // Coal — fuel dug at the Coal Mine (Coal Miner + passive) or burned from wood at a Charcoal
  // Ground. Capped like the other mundane materials; hidden until the first is produced.
  { id: 'coal', label: 'Coal', glyph: '⚫', tier: 'mundane' },
  // Steel — refined at the Steelworks, which converts wood + iron into it (needs Smelters).
  // Capped like the other mundane materials; hidden until the first is produced.
  { id: 'steel', label: 'Steel', glyph: '⚙️', tier: 'mundane' },
  // ---- Industrial goods (Age of Steam). Each capped like the mundane materials; hidden until produced. ----
  // Tools — forged at the Toolworks (iron + coal). Feed factories, construction, and research.
  { id: 'tools', label: 'Tools', glyph: '🛠️', tier: 'mundane' },
  // Engines — built at the Engine Works (steel + coal). Feed mechanization, construction, and research.
  { id: 'engines', label: 'Engines', glyph: '🔧', tier: 'mundane' },
  // Furniture — a consumer/luxury good from the Factory (wood + tools). Held furniture raises happiness.
  { id: 'furniture', label: 'Furniture', glyph: '🪑', tier: 'mundane' },
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
export const MUNDANE_RESOURCE_IDS: MundaneResourceId[] = [
  'wood',
  'food',
  'stone',
  'iron',
  'coal',
  'steel',
  'tools',
  'engines',
  'furniture',
  'furs',
  'manaCrystals',
];

export const RESOURCE_BY_ID: Record<ResourceId, ResourceDef> = Object.fromEntries(
  RESOURCES.map((r) => [r.id, r]),
) as Record<ResourceId, ResourceDef>;

/** True for the currencies with NO finite storage cap (effectiveCap returns Infinity):
 *  mana and culture. Research is now capped by science buildings, so it is NOT included. */
export function isUncappedResource(id: ResourceId): boolean {
  return id === 'mana' || id === 'culture';
}

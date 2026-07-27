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
  | 'parchment'
  | 'books'
  | 'compendiums'
  | 'furs'
  | 'alchemical'
  | 'manaCrystals'
  | 'mana'
  | 'airEssence'
  | 'earthEssence'
  | 'fireEssence'
  | 'waterEssence'
  | 'prismatic'
  | 'gold'
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
  | 'parchment'
  | 'books'
  | 'compendiums'
  | 'furs'
  | 'alchemical'
  | 'manaCrystals'
  | 'airEssence'
  | 'earthEssence'
  | 'fireEssence'
  | 'waterEssence';

/** Display group for the resource column — each renders under its own heading, in
 *  RESOURCES order: Resources (raw stock + the treasury), refined Goods, Luxury Goods (held
 *  for morale), Knowledge (chain goods + currencies),
 *  and Magic. Purely presentational; the cap machinery keys off MundaneResourceId. */
export type ResourceGroup = 'materials' | 'goods' | 'luxury' | 'knowledge' | 'magic' | 'prismatic';

export interface ResourceDef {
  id: ResourceId;
  label: string;
  glyph: string; // retained in data; the UI no longer renders resource icons
  tier: 'mundane' | 'knowledge' | 'magic';
  group: ResourceGroup;
}

export const RESOURCES: ResourceDef[] = [
  // ---- RESOURCES — raw stock gathered, grown, hunted or dug, plus the treasury they trade
  // for. Gold sits here rather than in a section of its own: it buys materials outright at
  // the market, so it reads as one more thing the settlement has on hand. ----
  { id: 'wood', label: 'Wood', glyph: '🪵', tier: 'mundane', group: 'materials' },
  { id: 'food', label: 'Food', glyph: '🍞', tier: 'mundane', group: 'materials' },
  { id: 'stone', label: 'Stone', glyph: '🪨', tier: 'mundane', group: 'materials' },
  // Iron — ore dug from the Mine (Miner job + the Mine's passive). Hidden until first mined.
  { id: 'iron', label: 'Iron', glyph: '🔩', tier: 'mundane', group: 'materials' },
  // Coal — fuel dug at the Coal Mine or charred from wood at a Charcoal Ground.
  { id: 'coal', label: 'Coal', glyph: '⚫', tier: 'mundane', group: 'materials' },
  // Gold — the treasury, earned by Harbours, Markets and Banks (the Currency line). Capped
  // by housing once Currency is in (caps.ts goldCap); uncapped before that.
  { id: 'gold', label: 'Gold', glyph: '🪙', tier: 'knowledge', group: 'materials' },
  // ---- LUXURY — held, not spent: the stock itself raises morale (systems/happiness.ts). ----
  // Furs are what a Hunter brings in; they also feed the Tannery, which quietly costs morale.
  { id: 'furs', label: 'Furs', glyph: '🦊', tier: 'mundane', group: 'luxury' },
  // ---- GOODS — refined and manufactured (Steelworks + the Age of Steam chains). ----
  // Alchemical Components — gland, herb and horn, rendered down. The ALCHEMY tech (off
  // Mathematics) reveals them and teaches Hunters and Ranches to save them. Nothing consumes
  // them YET; they are stock for a later chain.
  { id: 'alchemical', label: 'Alchemical Components', glyph: '⚗️', tier: 'mundane', group: 'goods' },
  { id: 'steel', label: 'Steel', glyph: '⚙️', tier: 'mundane', group: 'goods' },
  { id: 'tools', label: 'Tools', glyph: '🛠️', tier: 'mundane', group: 'goods' },
  { id: 'engines', label: 'Engines', glyph: '🔧', tier: 'mundane', group: 'goods' },
  // Furniture — a consumer luxury from the Factory; held furniture raises happiness.
  { id: 'furniture', label: 'Furniture', glyph: '🪑', tier: 'mundane', group: 'goods' },
  // ---- KNOWLEDGE — the chain goods (furs → parchment → books → compendiums) + currencies. ----
  { id: 'parchment', label: 'Parchment', glyph: '📃', tier: 'mundane', group: 'knowledge' },
  // Held BOOKS raise research gained per settler.
  { id: 'books', label: 'Books', glyph: '📖', tier: 'mundane', group: 'knowledge' },
  // Held COMPENDIUMS raise the research cap and yield a little mana per settler.
  { id: 'compendiums', label: 'Compendiums', glyph: '📚', tier: 'mundane', group: 'knowledge' },
  { id: 'research', label: 'Research', glyph: '📜', tier: 'knowledge', group: 'knowledge' },
  { id: 'culture', label: 'Culture', glyph: '🎭', tier: 'knowledge', group: 'knowledge' },
  // ---- MAGIC — the proto-material and the currency itself. ----
  // Mana Crystals — a proto-magic material the Mines yield once Crystallurgy is known.
  // Reaching a threshold is one of the three paths that discovers magic (systems/magic.ts).
  { id: 'manaCrystals', label: 'Mana Crystals', glyph: '💎', tier: 'mundane', group: 'magic' },
  { id: 'mana', label: 'Mana', glyph: '✦', tier: 'magic', group: 'magic' },
  // ---- PRISMATIC — the four elemental essences and the light they combine into. ----
  // Each essence has its OWN income mechanic (an Attunement construct) and its own sinks:
  // held essence empowers a matching job, elemental constructs burn it for mundane goods,
  // advanced techs cost it, and the Prism Nexus fuses all four into Prismatic Mana.
  { id: 'airEssence', label: 'Air', glyph: '🌬️', tier: 'magic', group: 'prismatic' },
  { id: 'earthEssence', label: 'Earth', glyph: '⛰️', tier: 'magic', group: 'prismatic' },
  { id: 'fireEssence', label: 'Fire', glyph: '🔥', tier: 'magic', group: 'prismatic' },
  { id: 'waterEssence', label: 'Water', glyph: '💧', tier: 'magic', group: 'prismatic' },
  // Prismatic Mana — the fused light of all four. Uncapped, like Mana.
  { id: 'prismatic', label: 'Prismatic Mana', glyph: '🌈', tier: 'magic', group: 'prismatic' },
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
  'parchment',
  'books',
  'compendiums',
  'furs',
  'alchemical',
  'manaCrystals',
  'airEssence',
  'earthEssence',
  'fireEssence',
  'waterEssence',
];

export const RESOURCE_BY_ID: Record<ResourceId, ResourceDef> = Object.fromEntries(
  RESOURCES.map((r) => [r.id, r]),
) as Record<ResourceId, ResourceDef>;

/** True for the currencies with NO finite storage cap (effectiveCap returns Infinity):
 *  mana and culture. Research is now capped by science buildings, so it is NOT included. */
export function isUncappedResource(id: ResourceId): boolean {
  return id === 'mana' || id === 'culture' || id === 'prismatic' || id === 'gold';
}

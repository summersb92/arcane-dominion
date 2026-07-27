// Font application. DOM-only UI adapter (never imported by the engine), mirroring
// theme.ts. The chosen font key is part of the SAVE (settings.font), not a separate
// localStorage key — so the applier reads whatever the loaded/updated save carries and
// reflects it onto <html data-font="…">, letting app.css swap --font-family / base size.

const FONT_KEYS = ['mono', 'sans', 'serif', 'large', 'bold'] as const;
export type FontKey = (typeof FONT_KEYS)[number];
export const DEFAULT_FONT: FontKey = 'mono';

export function isFontKey(v: unknown): v is FontKey {
  return typeof v === 'string' && (FONT_KEYS as readonly string[]).includes(v);
}

/** Reflect the chosen font onto <html data-font>. Unknown/missing → the mono default. */
export function applyFont(f: string | undefined): void {
  document.documentElement.dataset.font = isFontKey(f) ? f : DEFAULT_FONT;
}

/** The UI scale steps offered in Settings, as percentages. */
export const FONT_SCALES = [80, 90, 100, 110, 125, 150] as const;
export const DEFAULT_FONT_SCALE = 100;

/** Reflect the UI scale onto the document. app.css sizes everything in px, so scaling the
 *  root FONT-SIZE would move almost nothing — `zoom` scales the whole layout instead, which
 *  is what "bigger text" actually means here. Out-of-range/missing → 100%. */
export function applyFontScale(pct: number | undefined): void {
  const n = typeof pct === 'number' && Number.isFinite(pct) ? Math.max(80, Math.min(160, pct)) : DEFAULT_FONT_SCALE;
  document.documentElement.style.zoom = n === 100 ? '' : String(n / 100);
}

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

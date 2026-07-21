// Theme catalog. Each entry maps to a token block in src/app.css.
// `id` is written to <html data-theme="…">; the special "system" id removes the
// attribute so the prefers-color-scheme media query decides (Candlelight/Manuscript).
// Framework-agnostic data — safe to import from anywhere.

export type ThemeId = 'system' | 'kittens' | 'candlelight' | 'manuscript' | 'contrast';

export interface ThemeOption {
  id: ThemeId;
  label: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'kittens', label: 'Sleek (light)' },
  { id: 'candlelight', label: 'Candlelight (dark)' },
  { id: 'manuscript', label: 'Manuscript (light)' },
  { id: 'contrast', label: 'High Contrast' },
  { id: 'system', label: 'System' },
];

export const DEFAULT_THEME: ThemeId = 'kittens';

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && THEMES.some((t) => t.id === v);
}

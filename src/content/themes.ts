// Theme catalog. Each entry maps to a token block in src/app.css.
// `id` is written to <html data-theme="…">; the special "system" id removes the
// attribute so the prefers-color-scheme media query decides (Candlelight/Manuscript).
// Framework-agnostic data — safe to import from anywhere.

export type ThemeId = 'system' | 'candlelight' | 'manuscript' | 'contrast';

export interface ThemeOption {
  id: ThemeId;
  label: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'system', label: 'System' },
  { id: 'candlelight', label: 'Candlelight (dark)' },
  { id: 'manuscript', label: 'Manuscript (light)' },
  { id: 'contrast', label: 'High Contrast' },
];

export const DEFAULT_THEME: ThemeId = 'system';

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && THEMES.some((t) => t.id === v);
}

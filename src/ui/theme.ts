// Theme application + persistence. DOM-only UI adapter (never imported by the engine).
import { DEFAULT_THEME, isThemeId, type ThemeId } from '../content/themes';

const STORAGE_KEY = 'aa-theme';

export function loadTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isThemeId(raw)) return raw;
  } catch {
    /* localStorage unavailable (private mode / CLI) — fall through to default */
  }
  return DEFAULT_THEME;
}

/** Reflect the chosen theme onto <html> and persist it. "system" removes the attribute. */
export function applyTheme(id: ThemeId): void {
  const root = document.documentElement;
  if (id === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = id;
  }
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore persistence failures */
  }
}

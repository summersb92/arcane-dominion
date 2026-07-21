// Boot: apply theme -> load save -> offline catch-up -> mount UI -> start tick.
import './app.css';
import App from './ui/App.svelte';
import { applyTheme, loadTheme } from './ui/theme';
import { applyFont } from './ui/font';
import { getState, setState, startLoop, publish, resumeTimebase, offlineSummary } from './ui/stores';
import { newGame } from './engine/state';
import { applyOffline } from './engine/offline';
import { safeLoad, serialize, LOCALSTORAGE_KEY } from './engine/save';
import { AUTOSAVE_INTERVAL_MS } from './content/config';

applyTheme(loadTheme());

// ---- load save (corruption-safe: never silently wipe) ----
let persistBlocked = false;
let raw: string | null = null;
try {
  raw = localStorage.getItem(LOCALSTORAGE_KEY);
} catch {
  /* localStorage unavailable */
}

const loaded = safeLoad(raw);
if (loaded.ok && loaded.state) {
  setState(loaded.state);
  if (loaded.migratedFrom !== undefined) {
    console.info(`[save] migrated from v${loaded.migratedFrom}.`);
  }
} else {
  if (raw) {
    // Existing data failed to load — keep it on disk, run fresh in memory, don't clobber.
    persistBlocked = true;
    console.error(`[save] could not load existing save: ${loaded.error} — starting a temporary new game; your file was NOT overwritten.`);
  }
  setState(newGame());
}

// Reflect the loaded save's UI font onto <html data-font> (theme is applied above;
// font lives in the save so it is applied AFTER the save is loaded into state).
applyFont(getState().settings.font);

// ---- offline catch-up ----
function catchUp(where: string): void {
  const summary = applyOffline(getState());
  if (summary.appliedMs > 1000 && Object.keys(summary.gains).length > 0) {
    const mins = Math.round(summary.appliedMs / 60000);
    console.info(`[offline] ${where} ~${mins} min${summary.capped ? ' (capped)' : ''}:`, summary.gains);
    // Publish for the "While you were away…" panel (T-006b builds the UI from this).
    offlineSummary.set(summary);
  }
}
catchUp('away');

// ---- persistence ----
function save(): void {
  if (persistBlocked) return;
  const state = getState();
  state.lastSaved = Date.now();
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, serialize(state));
  } catch {
    /* quota / unavailable — ignore */
  }
}

// Autosave, but NOT while the tab is hidden: the rAF sim loop is paused then, so the
// sim is NOT keeping up with wall-clock — bumping lastSaved would swallow the idle gap
// that the visibility handler below needs to replay on return.
setInterval(() => {
  if (document.visibilityState !== 'hidden') save();
}, AUTOSAVE_INTERVAL_MS);
window.addEventListener('beforeunload', save);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Sim is current up to now; persist and freeze lastSaved for the gap.
    save();
  } else {
    // Back to foreground: the rAF loop was paused while hidden, so its ≤1s frame
    // clamp would silently drop the whole idle gap. Replay it as offline catch-up
    // ONCE, re-seed the loop timebase (so the resumed frame adds ~0, no double-count),
    // then reflect the gains immediately.
    catchUp('foreground');
    resumeTimebase();
    publish();
  }
});

// ---- mount + run ----
const target = document.getElementById('app');
if (!target) throw new Error('#app mount point not found');

const app = new App({ target });
startLoop();

export default app;

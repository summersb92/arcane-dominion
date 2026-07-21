// Save file I/O — the thin DOM adapter for save-to-file / load-from-file (spec §3.5).
// The Blob download + file read live HERE (UI layer) so the framework-agnostic engine
// (src/engine/save.ts) stays DOM-free while both transports reuse its ONE portable
// format — a file this downloads loads via `cli load`, and a `cli save` file loads here.
import { toFileString, SAVE_FILE_EXT } from '../engine/save';
import type { GameState } from '../engine/state';

/** Compact local datetime stamp (YYYYMMDD-HHmmss) — unique per export, sortable. */
function fileStamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Download the current save as `arcane-academy-<n>.aasave` via a Blob + object URL.
 *  Returns the filename used (for a UI confirmation). */
export function downloadSave(state: GameState): string {
  const name = `arcane-academy-${fileStamp()}${SAVE_FILE_EXT}`;
  const blob = new Blob([toFileString(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been dispatched so the download isn't cancelled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return name;
}

/** Read a picked/dropped file's text. Prefers File.text(); falls back to FileReader. */
export function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ''));
    fr.onerror = () => reject(fr.error ?? new Error('Could not read the file.'));
    fr.readAsText(file);
  });
}

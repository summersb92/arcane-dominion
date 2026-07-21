// Number notation — the ONE canonical formatter, shared by the UI and the CLI.
// No DOM, no Svelte. Supports suffix / full / scientific per the settings toggle.

export type Notation = 'suffix' | 'full' | 'scientific';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function formatNumber(n: number, notation: Notation = 'suffix'): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  const neg = n < 0;
  const v = Math.abs(n);
  let out: string;

  if (notation === 'full') {
    out = Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(2);
  } else if (notation === 'scientific') {
    out = v < 1000 ? trimDecimals(v) : v.toExponential(2).replace('e+', 'e');
  } else {
    // suffix
    if (v < 1000) {
      out = trimDecimals(v);
    } else {
      let tier = 0;
      let scaled = v;
      while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
        scaled /= 1000;
        tier++;
      }
      const decimals = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
      out = `${scaled.toFixed(decimals)}${SUFFIXES[tier]}`;
    }
  }
  return neg ? `-${out}` : out;
}

function trimDecimals(v: number): string {
  if (v >= 100 || Number.isInteger(v)) return Math.round(v).toString();
  return v.toFixed(v >= 10 ? 1 : 2);
}

/** Signed per-second rate, e.g. "+2.1/s". Empty string when zero. */
export function formatRate(n: number, notation: Notation = 'suffix'): string {
  if (!n) return '';
  return `${n > 0 ? '+' : '-'}${formatNumber(Math.abs(n), notation)}/s`;
}

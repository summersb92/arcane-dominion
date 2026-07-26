// Number notation — the ONE canonical formatter, shared by the UI and the CLI.
// No DOM, no Svelte. Supports suffix / full / scientific per the settings toggle.

export type Notation = 'suffix' | 'full' | 'scientific';

/**
 * Rounding direction for an abbreviated number.
 *   'round' — nearest. Fine for informational figures (rates, bonuses).
 *   'floor' — never OVERSTATE. Used for HELD stock: a stock shown as more than you really
 *             have makes a cost look affordable when it is not, which reads as a bug.
 */
export type RoundMode = 'round' | 'floor';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function formatNumber(n: number, notation: Notation = 'suffix', mode: RoundMode = 'round'): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  const neg = n < 0;
  const v = Math.abs(n);
  let out: string;

  if (notation === 'full') {
    out = Number.isInteger(v) ? v.toLocaleString('en-US') : fix(v, 2, mode);
  } else if (notation === 'scientific') {
    out = v < 1000 ? trimDecimals(v, mode) : v.toExponential(2).replace('e+', 'e');
  } else {
    // suffix
    if (v < 1000) {
      out = trimDecimals(v, mode);
    } else {
      let tier = 0;
      let scaled = v;
      while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
        scaled /= 1000;
        tier++;
      }
      const decimals = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
      out = `${fix(scaled, decimals, mode)}${SUFFIXES[tier]}`;
    }
  }
  return neg ? `-${out}` : out;
}

/**
 * EXACT rendering — never abbreviated, never rounded away. Used for every figure the player
 * is CHARGED (building and tech costs), so the number on the label is the number spent.
 */
export function formatExact(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2);
}

/** toFixed, but able to TRUNCATE instead of round. */
function fix(v: number, decimals: number, mode: RoundMode): string {
  if (mode === 'round') return v.toFixed(decimals);
  const f = 10 ** decimals;
  return (Math.floor(v * f) / f).toFixed(decimals);
}

function trimDecimals(v: number, mode: RoundMode = 'round'): string {
  if (v >= 100 || Number.isInteger(v)) {
    return (mode === 'floor' ? Math.floor(v) : Math.round(v)).toString();
  }
  return fix(v, v >= 10 ? 1 : 2, mode);
}

/** Signed per-second rate, e.g. "+2.1/s". Empty string when zero. */
export function formatRate(n: number, notation: Notation = 'suffix'): string {
  if (!n) return '';
  return `${n > 0 ? '+' : '-'}${formatNumber(Math.abs(n), notation)}/s`;
}

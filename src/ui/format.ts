// UI display helpers — thin wrappers over the canonical engine formatter so the
// UI and CLI share one number-notation implementation (src/engine/format.ts).
import { formatNumber, formatRate, formatExact, type Notation } from '../engine/format';

let notation: Notation = 'suffix';

/** Set by the store bridge from settings so all UI formatting follows the toggle. */
export function setNotation(n: Notation): void {
  notation = n;
}

export const fmt = (n: number): string => formatNumber(n, notation);
export const fmtRate = (n: number): string => formatRate(n, notation);
/** HELD stock and caps — floored, so the UI never claims you hold more than you do. */
export const fmtHeld = (n: number): string => formatNumber(n, notation, 'floor');
/** COSTS — exact and unabbreviated, so the label always equals what is charged. */
export const fmtCost = (n: number): string => formatExact(n);

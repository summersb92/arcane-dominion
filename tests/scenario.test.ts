// T-006 review fix — scenario `expect` on action steps: assert an action's actual
// outcome (ok/refused) and fail the run (CLI exit 1) on a mismatch. Steps WITHOUT
// `expect` keep the pre-expect fire-and-forget behavior (always PASS), so the committed
// scenarios are unchanged.

import { describe, it, expect } from 'vitest';
import { runScenario } from '../src/cli/scenario';

describe('scenario expect: action-step outcome assertions', () => {
  it('PASSes when expect matches the actual outcome (ok and refused)', () => {
    const res = runScenario({
      seed: 1,
      steps: [
        // 'begging' is a free instant available at the Origin → succeeds. (Clean Stables
        // is now gated deep in the Odd-Jobs ladder — v0.1.4.)
        { do: 'begging', expect: 'ok' },
        // 'study' is gated behind the spark (awakened flag) → refused pre-spark.
        { start: 'study', expect: 'refused' },
      ],
    });
    expect(res.ok).toBe(true);
    expect(res.results.every((r) => r.ok)).toBe(true);
  });

  it('FAILs the run when the actual outcome contradicts expect', () => {
    const res = runScenario({
      seed: 1,
      steps: [{ start: 'study', expect: 'ok' }], // refused pre-spark → mismatch with expect:ok
    });
    expect(res.ok).toBe(false);
    expect(res.results[0].ok).toBe(false);
    expect(res.results[0].detail).toBe('expected ok, got refused');
  });

  it('without expect, an action step always PASSes (pre-expect behavior preserved)', () => {
    const res = runScenario({
      seed: 1,
      steps: [{ start: 'study' }], // refused, but no expect → PASS with detail "refused"
    });
    expect(res.ok).toBe(true);
    expect(res.results[0].ok).toBe(true);
    expect(res.results[0].detail).toBe('refused');
  });
});

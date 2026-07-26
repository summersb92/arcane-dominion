import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { build, buildingCost } from '../src/engine/systems/buildings';
import { formatNumber, formatExact } from '../src/engine/format';

describe('cost labels are EXACT (the "takes more than it says" bug)', () => {
  it('never abbreviates or rounds a cost — the label equals what is charged', () => {
    // Abbreviation used to round these: 1298 rendered as "1.30K" (=1300) and 1947 as
    // "1.95K" (=1950), so a build appeared to cost more/less than it did and left a
    // stray remainder behind.
    expect(formatNumber(1298, 'suffix')).toBe('1.30K'); // the old, lossy rendering
    expect(formatExact(1298)).toBe('1,298'); // what costs use now
    expect(formatExact(1947)).toBe('1,947');
    expect(formatExact(15)).toBe('15');
  });

  it('every escalating House cost renders exactly as it is charged', () => {
    const s = newGame(1);
    s.run.resources.wood = 500_000;
    for (const cap of Object.keys(s.run.caps) as (keyof typeof s.run.caps)[]) s.run.caps[cap] = 1_000_000;
    for (let i = 0; i < 16; i++) {
      const cost = buildingCost(s, 'hut').wood as number;
      const before = s.run.resources.wood;
      expect(build(s, 'hut')).toBe(true);
      const charged = before - s.run.resources.wood;
      // The number shown on the card, parsed back, must be exactly the number spent.
      expect(Number(formatExact(cost).replace(/,/g, ''))).toBe(charged);
      expect(charged).toBe(cost);
    }
  });
});

describe('held stock is FLOORED (never claims you have more than you do)', () => {
  it('truncates instead of rounding up, so a cost never looks wrongly affordable', () => {
    // 99,985 used to render as "100.0K" — which reads as 100,000 you do not have.
    expect(formatNumber(99_985, 'suffix')).toBe('100.0K'); // rounding (informational figures)
    expect(formatNumber(99_985, 'suffix', 'floor')).toBe('99.9K'); // stock: never overstates
    expect(formatNumber(999.6, 'suffix', 'floor')).toBe('999'); // not "1000"
    expect(formatNumber(1298, 'suffix', 'floor')).toBe('1.29K'); // not "1.30K"
    // Whole numbers and small values are unaffected.
    expect(formatNumber(15, 'suffix', 'floor')).toBe('15');
    expect(formatNumber(200, 'suffix', 'floor')).toBe('200');
  });

  it('floors in full and scientific notation too', () => {
    expect(formatNumber(1234.98, 'full', 'floor')).toBe('1234.98');
    expect(formatNumber(999.99, 'suffix', 'floor')).toBe('999');
  });
});

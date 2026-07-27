import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { build } from '../src/engine/systems/buildings';
import { toView, buildingTooltip, techTooltip } from '../src/ui/stores';

/** Pull the "Effects" lines a card's tooltip would render for one building. */
function effectsFor(s: ReturnType<typeof newGame>, id: string): string[] {
  const row = toView(s).buildings.find((b) => b.id === id)!;
  const fx = buildingTooltip(row).sections.find((x) => x.label === 'Effects');
  return (fx?.lines ?? []).map((l) => l.text);
}

describe('building tooltips hide effects still behind a tech gate', () => {
  it("the Library advertises +50 until the Decimal System, then +100 — never both", () => {
    const s = newGame(1);
    s.run.tech.push('writing');
    const before = effectsFor(s, 'library');
    expect(before).toContain('+50 Research cap');
    expect(before.some((l) => /Decimal System|requires/i.test(l))).toBe(false);
    expect(before.filter((l) => l.endsWith('Research cap')).length).toBe(1);

    s.run.tech.push('decimal-system');
    const after = effectsFor(s, 'library');
    expect(after).toContain('+100 Research cap'); // folded into ONE honest total
    expect(after).not.toContain('+50 Research cap');
    expect(after.filter((l) => l.endsWith('Research cap')).length).toBe(1);
  });

  it('the base workplaces advertise their own storage and their own job boost', () => {
    const s = newGame(1);
    s.run.resources.wood = 500;
    build(s, 'woodcutters-lodge');
    const fx = effectsFor(s, 'woodcutters-lodge');
    expect(fx).toContain('+100 Wood storage');
    expect(fx.some((l) => /\+2% Woodcutter output/.test(l))).toBe(true);
  });

  it('the House advertises the treasury it underwrites', () => {
    expect(effectsFor(newGame(1), 'hut')).toContain('+100 Gold cap (with Currency)');
  });

  it('the Farm House is housing and a Farm slot — no storage at all', () => {
    const s = newGame(1);
    s.run.tech.push('agriculture');
    const fx = effectsFor(s, 'farm-house');
    expect(fx).toContain('+1 housing');
    expect(fx.some((l) => /storage|cap/i.test(l))).toBe(false);
    // And building one leaves every material ceiling exactly where it was.
    s.run.resources.wood = 500;
    s.run.resources.stone = 50;
    const before = { ...s.run.caps };
    expect(build(s, 'farm-house')).toBe(true);
    expect(s.run.caps).toEqual(before);
  });
});

describe('a multi-resource research cost only reddens the half you cannot pay', () => {
  /** The Cost lines a tech card's tooltip would render, as [text, colour-class] pairs. */
  function costLines(s: ReturnType<typeof newGame>, id: string): [string, string | undefined][] {
    const row = toView(s).tech.find((t) => t.id === id)!;
    const cost = techTooltip(row).sections.find((x) => x.label === 'Cost')!;
    return cost.lines.map((l) => [l.text, l.cls]);
  }

  it('Stone Axe (150 research + 40 stone) colours each resource independently', () => {
    const s = newGame(1);
    // Neither in hand → both red.
    expect(costLines(s, 'stone-axe')).toEqual([
      ['Research 150', 'life'],
      ['Stone 40', 'life'],
    ]);

    // Plenty of research, no stone → ONLY the stone line reads red.
    s.run.resources.research = 300;
    expect(costLines(s, 'stone-axe')).toEqual([
      ['Research 150', undefined],
      ['Stone 40', 'life'],
    ]);

    // The mirror case: stone in hand, research spent.
    s.run.resources.research = 0;
    s.run.resources.stone = 100;
    expect(costLines(s, 'stone-axe')).toEqual([
      ['Research 150', 'life'],
      ['Stone 40', undefined],
    ]);

    // Both affordable → nothing red.
    s.run.resources.research = 300;
    expect(costLines(s, 'stone-axe')).toEqual([
      ['Research 150', undefined],
      ['Stone 40', undefined],
    ]);
  });

  it('a single-resource tech still renders one line', () => {
    expect(costLines(newGame(1), 'writing')).toEqual([['Research 20', 'life']]);
  });
});

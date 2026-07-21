import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { simulate } from '../src/engine/tick';
import { build, buildingsView } from '../src/engine/systems/buildings';
import {
  checkMagicDiscovery,
  isMagicDiscovered,
  MANA_CRYSTAL_THRESHOLD,
  CULTURE_THRESHOLD,
} from '../src/engine/systems/magic';
import { BUILDING_BY_ID } from '../src/content/buildings';
import { TECH_BY_ID } from '../src/content/tech';

const unlocked = (s: ReturnType<typeof newGame>, id: string): boolean =>
  buildingsView(s).find((b) => b.id === id)!.unlocked;

describe('magic discovery — three independent paths, one flag', () => {
  it('FROM THE EARTH: Mana Crystals reaching the threshold discovers magic', () => {
    const s = newGame(1);
    s.run.resources.manaCrystals = MANA_CRYSTAL_THRESHOLD;
    expect(isMagicDiscovered(s)).toBe(false);
    checkMagicDiscovery(s);
    expect(isMagicDiscovered(s)).toBe(true);
    expect(s.run.chronicle.some((c) => c.text.includes('deep mines'))).toBe(true);
  });

  it('FROM NATURE: a standing Sacred Grove discovers magic', () => {
    const s = newGame(1);
    s.run.tech.push('naturalism');
    s.run.resources.wood = 60;
    expect(build(s, 'sacred-grove')).toBe(true);
    // Discovery is checked on the tick, not at build time.
    expect(isMagicDiscovered(s)).toBe(false);
    simulate(s, 0.1);
    expect(isMagicDiscovered(s)).toBe(true);
    expect(s.run.chronicle.some((c) => c.text.includes('grove answers'))).toBe(true);
  });

  it('FROM THE PEOPLE: Culture reaching the threshold discovers magic', () => {
    const s = newGame(1);
    s.run.resources.culture = CULTURE_THRESHOLD;
    expect(isMagicDiscovered(s)).toBe(false);
    checkMagicDiscovery(s);
    expect(isMagicDiscovered(s)).toBe(true);
    expect(s.run.chronicle.some((c) => c.text.includes('gifted soul'))).toBe(true);
  });

  it('discovers only ONCE — a second check adds no further flag flip or beat', () => {
    const s = newGame(1);
    s.run.resources.culture = CULTURE_THRESHOLD;
    checkMagicDiscovery(s);
    checkMagicDiscovery(s); // idempotent
    const beats = s.run.chronicle.filter((c) => c.text.includes('gifted soul'));
    expect(beats.length).toBe(1);
    expect(isMagicDiscovered(s)).toBe(true);
  });

  it('does nothing while every path is below its threshold', () => {
    const s = newGame(1);
    s.run.resources.manaCrystals = MANA_CRYSTAL_THRESHOLD - 1;
    s.run.resources.culture = CULTURE_THRESHOLD - 1;
    checkMagicDiscovery(s);
    expect(isMagicDiscovered(s)).toBe(false);
  });
});

describe('magic buildings are flag-gated (not tech-gated)', () => {
  it('the Arcane Font is locked until magicDiscovered, then unlocks', () => {
    const s = newGame(1);
    expect(unlocked(s, 'arcane-font')).toBe(false);
    s.run.flags.magicDiscovered = true;
    expect(unlocked(s, 'arcane-font')).toBe(true);
  });

  it('Animated Tools need BOTH the flag AND a standing Arcane Font', () => {
    const s = newGame(1);
    s.run.flags.magicDiscovered = true;
    // Flag alone is not enough — a Font must already exist.
    expect(unlocked(s, 'animated-tools')).toBe(false);
    s.run.buildings['arcane-font'] = 1;
    expect(unlocked(s, 'animated-tools')).toBe(true);
  });

  it('the magic buildings carry requiresFlag and no requiresTech', () => {
    expect(BUILDING_BY_ID['arcane-font'].requiresFlag).toBe('magicDiscovered');
    expect(BUILDING_BY_ID['arcane-font'].requiresTech).toBeUndefined();
    expect(BUILDING_BY_ID['animated-tools'].requiresFlag).toBe('magicDiscovered');
    expect(BUILDING_BY_ID['animated-tools'].requiresBuilding).toBe('arcane-font');
    expect(BUILDING_BY_ID['animated-tools'].requiresTech).toBeUndefined();
  });
});

describe('the retired tech-gated magic path', () => {
  it('the awakening and animation techs are gone', () => {
    expect(TECH_BY_ID['awakening' as never]).toBeUndefined();
    expect(TECH_BY_ID['animation' as never]).toBeUndefined();
  });
});

describe('the Mine yields Mana Crystals (the earth path)', () => {
  it('a Mine trickles mana crystals (+0.05/s)', () => {
    const s = newGame(1);
    s.run.tech.push('mining');
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'mine')).toBe(true);
    const before = s.run.resources.manaCrystals;
    simulate(s, 10);
    // 1 Mine × 0.05/s × 10s = 0.5 crystals.
    expect(s.run.resources.manaCrystals).toBeCloseTo(before + 0.5, 6);
  });

  it('a Mine left running long enough discovers magic from the earth', () => {
    const s = newGame(1);
    s.run.tech.push('mining');
    s.run.resources.wood = 100;
    s.run.resources.stone = 100;
    expect(build(s, 'mine')).toBe(true);
    expect(isMagicDiscovered(s)).toBe(false);
    // 0.05/s → ~420s to clear the 20-crystal threshold.
    simulate(s, 420);
    expect(s.run.resources.manaCrystals).toBeGreaterThanOrEqual(MANA_CRYSTAL_THRESHOLD);
    expect(isMagicDiscovered(s)).toBe(true);
    expect(unlocked(s, 'arcane-font')).toBe(true);
  });
});

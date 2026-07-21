// v0.1.1 — the structured producers/consumers/multipliers read model behind the
// resource / vital / essence hover tooltips. Pure engine; no DOM.

import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { startTask } from '../src/engine/systems/tasks';
import { buyItem, equipGear, moveHome } from '../src/engine/systems/home';
import { breakdown } from '../src/engine/systems/breakdown';

describe('resource breakdown', () => {
  it('lists an active task as a producer and Inn rent as a consumer, with a reconciling net', () => {
    const s = newGame(1);
    s.run.flags.lairFounded = true; // Inn requires the lair beat
    // Stamina headroom so Smith (0.4/s) does not auto-pause; keep gold low so it is not at cap.
    s.run.vitals.stamina.max = 100;
    s.run.vitals.stamina.cur = 100;
    expect(startTask(s, 'smith')).toBe(true); // running, +5 Gold / 15s
    expect(moveHome(s, 'inn')).toBe(true); // rent 0.1 Gold/s

    const b = breakdown(s, { kind: 'resource', id: 'gold' });
    const smith = b.produces.find((p) => p.name === 'Smith');
    expect(smith).toBeDefined();
    expect(smith!.amount).toBeCloseTo(5 / 15, 6); // output amortized over the cycle

    const rent = b.consumes.find((c) => c.name === 'Inn Room rent');
    expect(rent).toBeDefined();
    expect(rent!.amount).toBeCloseTo(0.1, 6);

    expect(b.net).toBeCloseTo(5 / 15 - 0.1, 6); // production − consumption
    expect(b.cap).toBe(25); // base Gold cap (v0.1.2), finite
    expect(b.atCap).toBe(false);
  });

  it('flags at-cap when the pool is full', () => {
    const s = newGame(1);
    s.run.resources.gold = 25; // base cap is 25 (v0.1.2)
    const b = breakdown(s, { kind: 'resource', id: 'gold' });
    expect(b.atCap).toBe(true);
  });

  it('lists Kindle Focus among the multipliers when it is owned', () => {
    const s = newGame(1);
    s.run.skills = ['read-the-page', 'spark', 'kindle-focus']; // outputMult ×1.10
    s.run.vitals.stamina.max = 100;
    s.run.vitals.stamina.cur = 100;
    expect(startTask(s, 'smith')).toBe(true);

    const b = breakdown(s, { kind: 'resource', id: 'gold' });
    const kindle = b.multipliers.find((m) => m.name === 'Kindle Focus');
    expect(kindle).toBeDefined();
    expect(kindle!.factor).toBeCloseTo(1.1, 6);
    expect(b.net).toBeCloseTo((5 / 15) * 1.1, 6); // multiplier folded into the net
  });
});

describe('vital breakdown', () => {
  it('includes base regen and an equipped regen item as producers, and an active task as a consumer', () => {
    const s = newGame(1);
    s.run.flags.awakened = true; // Study is gated behind the spark
    s.run.resources.gold = 65; // Tool Belt (40) + Herbalist Kit (25)
    expect(buyItem(s, 'tool-belt')).toBe(true); // a belt to open sub-slots
    expect(equipGear(s, 'tool-belt')).toBe(true);
    expect(buyItem(s, 'herbalist-kit')).toBe(true); // +0.1 Stamina/s (a belt sub-item now)
    expect(equipGear(s, 'herbalist-kit')).toBe(true); // fills a belt sub-slot
    expect(startTask(s, 'study')).toBe(true); // perpetual, drains 0.2 Stamina/s

    const b = breakdown(s, { kind: 'vital', id: 'stamina' });
    expect(b.produces.some((p) => p.name === 'base regen')).toBe(true);
    const kit = b.produces.find((p) => p.name === 'Herbalist Kit');
    expect(kit).toBeDefined();
    expect(kit!.amount).toBeCloseTo(0.1, 6);

    const study = b.consumes.find((c) => c.name === 'Study');
    expect(study).toBeDefined();
    expect(study!.amount).toBeCloseTo(0.2, 6);

    // net = base regen (0.15) + kit (0.1) − Study drain (0.2) = 0.05
    expect(b.net).toBeCloseTo(0.15 + 0.1 - 0.2, 6);
  });

  it('reports a sealed vital (Mana before Inner Wellspring) as locked', () => {
    const s = newGame(1);
    const b = breakdown(s, { kind: 'vital', id: 'mana' });
    expect(b.locked).toBe(true);
    expect(b.produces).toHaveLength(0);
  });
});

describe('essence breakdown', () => {
  it('lists a cantrip trickle as a producer and a running contract as a consumer', () => {
    const s = newGame(1);
    s.run.skills = ['read-the-page', 'spark']; // v0.1.7: Spark → ❖ Prismatic trickle 0.2/s
    s.run.essence.prism.awakened = true;
    s.run.essence.prism.amount = 100; // fuel the contract's Prismatic drain (affinity → prism)
    s.run.vitals.stamina.max = 100;
    s.run.vitals.stamina.cur = 100;
    expect(startTask(s, 'ward-a-barn')).toBe(true); // burns 0.15 Prism/s

    const b = breakdown(s, { kind: 'essence', id: 'prism' });
    expect(b.produces.some((p) => p.name === 'Spark')).toBe(true);
    const contract = b.consumes.find((c) => c.name === 'Fulfil: Ward a Barn');
    expect(contract).toBeDefined();
    expect(contract!.amount).toBeCloseTo(0.15, 6);
    expect(b.net).toBeCloseTo(0.2 - 0.15, 6);
  });
});

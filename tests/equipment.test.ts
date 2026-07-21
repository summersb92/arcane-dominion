// v0.1.3 — the paper-doll EQUIPMENT system (in ADDITION to the generic housing slots).
// Pure engine; no DOM (toView is the pure view-model mapper, safe to call in a test).

import { describe, it, expect } from 'vitest';
import { newGame, freshEquipment, SAVE_VERSION } from '../src/engine/state';
import { serialize, deserialize, safeLoad, SAVE_MAGIC } from '../src/engine/save';
import {
  buyItem,
  equipItem,
  equipGear,
  unequipGear,
  unequipBeltItem,
  isGearEquipped,
  effectiveRegen,
  homeResourceRates,
  jobOutputMult,
} from '../src/engine/systems/home';
import { toView } from '../src/ui/stores';

describe('equipGear: fixed positions + mods flow through the aggregators', () => {
  it('equips a helm into head and an amulet, and their mods reach homeResourceRates / effectiveRegen', () => {
    const s = newGame(1);
    s.run.resources.gold = 100;

    expect(buyItem(s, 'apprentice-hood')).toBe(true); // head, +0.05 Insight/s
    expect(equipGear(s, 'apprentice-hood')).toBe(true);
    expect(s.run.home.equipment.head).toBe('apprentice-hood');
    expect(homeResourceRates(s).insight).toBeCloseTo(0.05, 6);

    expect(buyItem(s, 'charm-of-vigor')).toBe(true); // amulet, +0.05 Life/s
    expect(equipGear(s, 'charm-of-vigor')).toBe(true);
    expect(s.run.home.equipment.amulet).toBe('charm-of-vigor');
    expect(effectiveRegen(s, 'life')).toBeCloseTo(0.1 + 0.05, 6); // base 0.1 + charm 0.05
  });

  it('rejects gear from the generic housing-slot equip, and non-gear from the doll', () => {
    const s = newGame(1);
    s.run.resources.gold = 100;
    expect(buyItem(s, 'charm-of-vigor')).toBe(true); // gear
    expect(equipItem(s, 'charm-of-vigor')).toBe(false); // can't go in a housing slot
    expect(buyItem(s, 'warded-chest')).toBe(true); // generic furnishing (no slot)
    expect(equipGear(s, 'warded-chest')).toBe(false); // can't go on the doll
  });
});

describe('equipGear: ring routing (ring1 then ring2)', () => {
  it('fills the first free ring, then the second, and honours an explicit position', () => {
    const s = newGame(2);
    s.run.resources.gold = 100;
    s.run.skills = ['inner-wellspring']; // mana-crystal (a ring) is gated on this

    expect(buyItem(s, 'signet-ring')).toBe(true);
    expect(equipGear(s, 'signet-ring')).toBe(true);
    expect(s.run.home.equipment.ring1).toBe('signet-ring'); // first free ring

    expect(buyItem(s, 'mana-crystal')).toBe(true);
    expect(equipGear(s, 'mana-crystal')).toBe(true);
    expect(s.run.home.equipment.ring2).toBe('mana-crystal'); // next free ring
  });

  it('honours an explicit ring position and swaps the old occupant back to owned', () => {
    const s = newGame(3);
    s.run.resources.gold = 100;
    s.run.skills = ['inner-wellspring'];

    expect(buyItem(s, 'signet-ring')).toBe(true);
    expect(equipGear(s, 'signet-ring', 'ring1')).toBe(true);
    expect(buyItem(s, 'mana-crystal')).toBe(true);
    expect(equipGear(s, 'mana-crystal', 'ring1')).toBe(true); // into the OCCUPIED ring1 → swap

    expect(s.run.home.equipment.ring1).toBe('mana-crystal');
    expect(isGearEquipped(s, 'signet-ring')).toBe(false); // displaced
    expect(s.run.home.owned).toContain('signet-ring'); // …but still owned, ready to re-equip
  });
});

describe('belt: sub-slots open, fill, and clear', () => {
  it('equipping a belt opens beltSlots sub-slots; a beltItem fills the first free one', () => {
    const s = newGame(4);
    s.run.resources.gold = 100;

    expect(buyItem(s, 'tool-belt')).toBe(true); // belt, beltSlots 2
    expect(equipGear(s, 'tool-belt')).toBe(true);
    expect(s.run.home.equipment.belt).toBe('tool-belt');
    expect(s.run.home.beltItems).toEqual([null, null]); // two sub-slots opened

    expect(buyItem(s, 'herbalist-kit')).toBe(true); // beltItem, +0.1 Stamina/s
    expect(equipGear(s, 'herbalist-kit')).toBe(true);
    expect(s.run.home.beltItems[0]).toBe('herbalist-kit'); // first free sub-slot
    expect(effectiveRegen(s, 'stamina')).toBeCloseTo(0.15 + 0.1, 6); // base 0.15 + kit 0.1
  });

  it('a beltItem cannot be equipped with no belt (nowhere to put it)', () => {
    const s = newGame(5);
    s.run.resources.gold = 100;
    expect(buyItem(s, 'herbalist-kit')).toBe(true);
    expect(equipGear(s, 'herbalist-kit')).toBe(false); // beltItems length 0 → refused
    expect(isGearEquipped(s, 'herbalist-kit')).toBe(false);
  });

  it('unequipping the belt returns every sub-item to owned and clears beltItems', () => {
    const s = newGame(6);
    s.run.resources.gold = 100;
    buyItem(s, 'tool-belt');
    equipGear(s, 'tool-belt');
    buyItem(s, 'herbalist-kit');
    equipGear(s, 'herbalist-kit');

    expect(unequipGear(s, 'belt')).toBe(true);
    expect(s.run.home.equipment.belt).toBe(null);
    expect(s.run.home.beltItems).toEqual([]); // sub-slots gone
    expect(s.run.home.owned).toContain('herbalist-kit'); // sub-item still owned
    expect(isGearEquipped(s, 'herbalist-kit')).toBe(false);
    expect(effectiveRegen(s, 'stamina')).toBeCloseTo(0.15, 6); // kit mod gone
  });

  it('swapping to a bigger belt preserves sub-items; a smaller belt overflows extras to owned', () => {
    const s = newGame(7);
    s.run.resources.gold = 200;
    buyItem(s, 'tool-belt'); // 2 sub-slots
    equipGear(s, 'tool-belt');
    buyItem(s, 'herbalist-kit');
    equipGear(s, 'herbalist-kit'); // sub-slot 0

    // Swap up to the Utility Belt (4 sub-slots): the kit is preserved at index 0.
    buyItem(s, 'utility-belt');
    expect(equipGear(s, 'utility-belt')).toBe(true);
    expect(s.run.home.equipment.belt).toBe('utility-belt');
    expect(s.run.home.beltItems.length).toBe(4);
    expect(s.run.home.beltItems[0]).toBe('herbalist-kit'); // preserved
    expect(s.run.home.owned).toContain('tool-belt'); // old belt back to owned

    // Fill a later sub-slot, then swap DOWN to the 2-slot Tool Belt: the overflow item
    // returns to owned; only the first two sub-slots survive.
    buyItem(s, 'vial-of-focus');
    expect(equipGear(s, 'vial-of-focus')).toBe(true); // sub-slot 1
    // Move the vial to sub-slot 3 to make it an overflow candidate.
    unequipBeltItem(s, 1);
    s.run.home.beltItems[3] = 'vial-of-focus';

    expect(equipGear(s, 'tool-belt')).toBe(true); // back down to 2 sub-slots
    expect(s.run.home.beltItems.length).toBe(2);
    expect(s.run.home.beltItems[0]).toBe('herbalist-kit'); // survived
    expect(isGearEquipped(s, 'vial-of-focus')).toBe(false); // overflowed out
    expect(s.run.home.owned).toContain('vial-of-focus'); // …back to owned
  });
});

describe('unequipGear: doll positions', () => {
  it('unequips a fixed position back to owned; a no-op on an empty/invalid position', () => {
    const s = newGame(8);
    s.run.resources.gold = 100;
    buyItem(s, 'apprentice-hood');
    equipGear(s, 'apprentice-hood');

    expect(unequipGear(s, 'head')).toBe(true);
    expect(s.run.home.equipment.head).toBe(null);
    expect(s.run.home.owned).toContain('apprentice-hood');

    expect(unequipGear(s, 'head')).toBe(false); // already empty
    expect(unequipGear(s, 'nonsense')).toBe(false); // invalid position
  });
});

describe('save: equipment round-trips + old-save migration', () => {
  it('serialize -> deserialize preserves equipment and beltItems', () => {
    const s = newGame(9);
    s.run.resources.gold = 200;
    buyItem(s, 'tool-belt');
    equipGear(s, 'tool-belt');
    buyItem(s, 'herbalist-kit');
    equipGear(s, 'herbalist-kit');
    buyItem(s, 'apprentice-hood');
    equipGear(s, 'apprentice-hood');

    const round = deserialize(serialize(s));
    expect(round.run.home.equipment).toEqual(s.run.home.equipment);
    expect(round.run.home.beltItems).toEqual(s.run.home.beltItems);
    expect(round).toEqual(s);
  });

  it('a v3 save (no equipment/beltItems) migrates to an empty paper doll without crashing', () => {
    const base = newGame(10) as unknown as { run: { home: Record<string, unknown> } };
    delete base.run.home.equipment; // v3 predates the paper doll
    delete base.run.home.beltItems;
    const envelope = { magic: SAVE_MAGIC, version: 3, state: base };

    const res = safeLoad(JSON.stringify(envelope));
    expect(res.ok).toBe(true);
    expect(res.migratedFrom).toBe(3);
    expect(res.state!.version).toBe(SAVE_VERSION);
    expect(res.state!.run.home.equipment).toEqual(freshEquipment()); // all eleven positions null
    expect(res.state!.run.home.beltItems).toEqual([]);
    expect(() => toView(res.state!)).not.toThrow(); // and it renders
  });

  it('a v3 save with a now-gear item in generic equipped[] migrates off it (no mod double-count)', () => {
    const base = newGame(12) as unknown as {
      run: { home: { owned: string[]; equipped: string[]; equipment?: unknown; beltItems?: unknown } };
    };
    delete base.run.home.equipment; // v3 predates the doll
    delete base.run.home.beltItems;
    base.run.home.owned = [];
    base.run.home.equipped = ['tool-belt']; // tool-belt was generic in v3, is gear in v4

    const res = safeLoad(JSON.stringify({ magic: SAVE_MAGIC, version: 3, state: base }));
    expect(res.ok).toBe(true);
    const s = res.state!;
    // migrate3to4 pulled the now-gear id out of equipped[] and back into owned — no loss.
    expect(s.run.home.equipped).not.toContain('tool-belt');
    expect(s.run.home.owned).toContain('tool-belt');
    // Its +0.2 job mod is NOT active yet, and counts exactly once after re-equipping.
    expect(jobOutputMult(s)).toBeCloseTo(1, 6);
    expect(equipGear(s, 'tool-belt')).toBe(true);
    expect(jobOutputMult(s)).toBeCloseTo(1.2, 6);
  });
});

describe('view-model: the equipment (paper doll) view', () => {
  it('exposes the eleven positions, belt sub-slots, and owned-but-unequipped gear by slot', () => {
    const s = newGame(11);
    s.run.resources.gold = 200;
    buyItem(s, 'tool-belt');
    equipGear(s, 'tool-belt');
    buyItem(s, 'charm-of-vigor'); // owned, NOT equipped
    buyItem(s, 'apprentice-hood');
    equipGear(s, 'apprentice-hood');

    const eq = toView(s).equipment;
    expect(eq.slots).toHaveLength(11);
    const head = eq.slots.find((sl) => sl.position === 'head');
    expect(head!.item?.id).toBe('apprentice-hood');
    const belt = eq.slots.find((sl) => sl.position === 'belt');
    expect(belt!.item?.id).toBe('tool-belt');
    expect(eq.belt.count).toBe(2); // Tool Belt opens 2 sub-slots
    expect(eq.belt.items).toEqual([null, null]);

    // Owned, not-yet-equipped gear is grouped by slot type for the equip UI.
    const amuletGroup = eq.ownedGear.find((g) => g.slot === 'amulet');
    expect(amuletGroup?.items.some((i) => i.id === 'charm-of-vigor')).toBe(true);
    // apprentice-hood is worn, so it's NOT in the owned-gear groups.
    expect(eq.ownedGear.some((g) => g.items.some((i) => i.id === 'apprentice-hood'))).toBe(false);
  });
});

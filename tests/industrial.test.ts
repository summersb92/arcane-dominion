import { describe, it, expect } from 'vitest';
import { newGame } from '../src/engine/state';
import { build, setActive } from '../src/engine/systems/buildings';
import { assignJob, jobCapacity } from '../src/engine/systems/jobs';
import { productionRates } from '../src/engine/systems/production';
import { happiness } from '../src/engine/systems/happiness';
import { research } from '../src/engine/systems/tech';
import { TECH_BY_ID } from '../src/content/tech';

describe('Industrial goods chain — Toolworks → Engine Works → Factory', () => {
  it('Toolworks (Steam Power) opens a Machinist and forges tools from iron + coal', () => {
    const s = newGame(1);
    s.run.resources.wood = 300;
    s.run.resources.stone = 300;
    s.run.resources.iron = 300;
    s.run.resources.coal = 300;
    expect(build(s, 'toolworks')).toBe(false); // needs Steam Power
    s.run.tech.push('steam-power');
    expect(build(s, 'toolworks')).toBe(true);
    expect(jobCapacity(s, 'machinist')).toBe(1);

    // No Machinist yet → the converter is idle.
    expect(productionRates(s).tools).toBeCloseTo(0, 6);
    s.run.population.total = 1;
    expect(assignJob(s, 'machinist', 1)).toBe(1);
    expect(productionRates(s).tools).toBeCloseTo(0.3, 6);
    expect(productionRates(s).iron).toBeCloseTo(-0.3, 6);
    expect(productionRates(s).coal).toBeCloseTo(-0.3, 6);
  });

  it('Engine Works (Precision Engineering) opens an Engineer and needs Tools to build', () => {
    const s = newGame(1);
    s.run.tech.push('precision-engineering');
    s.run.resources.wood = 300;
    s.run.resources.stone = 300;
    s.run.resources.steel = 300;
    s.run.resources.coal = 300;
    expect(build(s, 'engine-works')).toBe(false); // no Tools to build it with
    s.run.resources.tools = 30;
    expect(build(s, 'engine-works')).toBe(true);
    expect(s.run.resources.tools).toBe(0); // construction sink

    s.run.population.total = 1;
    expect(assignJob(s, 'engineer', 1)).toBe(1);
    expect(productionRates(s).engines).toBeCloseTo(0.2, 6);
    expect(productionRates(s).steel).toBeCloseTo(-0.2, 6);
  });

  it('Factory (Industrialization) turns wood + tools into furniture, needing Engines to build', () => {
    const s = newGame(1);
    s.run.tech.push('industrialization');
    s.run.resources.wood = 300;
    s.run.resources.stone = 300;
    s.run.resources.tools = 100;
    expect(build(s, 'factory')).toBe(false); // needs Engines to build
    s.run.resources.engines = 20;
    expect(build(s, 'factory')).toBe(true);
    expect(s.run.resources.engines).toBe(0); // construction sink

    s.run.population.total = 1;
    expect(assignJob(s, 'machinist', 1)).toBe(1);
    expect(productionRates(s).furniture).toBeCloseTo(0.3, 6);
    expect(productionRates(s).tools).toBeCloseTo(-0.3, 6);
    expect(productionRates(s).wood).toBeCloseTo(-0.5, 6);
  });
});

describe('Furniture is a luxury good that raises happiness', () => {
  it('held furniture adds happiness (+1 per 5, capped at +25)', () => {
    const s = newGame(1);
    s.run.population.total = 20; // crowding 28 → base happiness 72
    expect(happiness(s).value).toBe(72);
    s.run.resources.furniture = 50; // 50 / 5 = +10
    expect(happiness(s).value).toBe(82);
    expect(happiness(s).breakdown.some((b) => b.label.startsWith('Furniture'))).toBe(true);
    s.run.resources.furniture = 1000; // capped at +25
    expect(happiness(s).value).toBe(97); // 72 + 25
  });
});

describe('Steam Works — mechanization (spend goods → global output)', () => {
  it('boosts EVERY worker while fuelled, and does nothing when starved of fuel', () => {
    const s = newGame(1);
    // A working Woodcutter to sample the global multiplier.
    s.run.buildings.hut = 1;
    s.run.resources.wood = 25;
    build(s, 'woodcutters-lodge');
    s.run.population.total = 1;
    assignJob(s, 'woodcutter', 1);
    expect(productionRates(s).wood).toBeCloseTo(0.5, 6);

    // Build a Steam Works (starts active) with fuel on hand → +20% to every worker.
    s.run.tech.push('industrialization');
    s.run.resources.stone = 300;
    s.run.resources.steel = 300;
    s.run.resources.engines = 300; // cost 20 + ongoing fuel
    s.run.resources.coal = 300; // ongoing fuel
    expect(build(s, 'steam-works')).toBe(true);
    expect(productionRates(s).wood).toBeCloseTo(0.5 * 1.2, 6); // mechanized

    // Starve it of coal → the bonus vanishes (unfuelled works grants nothing).
    s.run.resources.coal = 0;
    expect(productionRates(s).wood).toBeCloseTo(0.5, 6);

    // Toggle the works OFF entirely → also no bonus even with fuel restored.
    s.run.resources.coal = 300;
    setActive(s, 'steam-works', 0);
    expect(productionRates(s).wood).toBeCloseTo(0.5, 6);
  });
});

describe('Industrial techs — steep costs and goods research-sinks', () => {
  it('continues the steep curve and spends goods on research', () => {
    expect(TECH_BY_ID['steam-power'].cost).toBe(4000);
    expect(TECH_BY_ID['precision-engineering'].cost).toBe(5500);
    expect(TECH_BY_ID['precision-engineering'].resourceCost?.tools).toBe(50);
    expect(TECH_BY_ID.industrialization.cost).toBe(7500);
    expect(TECH_BY_ID.industrialization.resourceCost?.engines).toBe(40);

    // Precision Engineering refuses without the tools, then spends them.
    const s = newGame(1);
    s.run.tech.push('steam-power');
    s.run.resources.research = 6000;
    expect(research(s, 'precision-engineering')).toBe(false); // no tools
    s.run.resources.tools = 50;
    expect(research(s, 'precision-engineering')).toBe(true);
    expect(s.run.resources.tools).toBe(0);
    expect(s.run.tech).toContain('precision-engineering');
  });
});

#!/usr/bin/env node
// Arcane Dominion — headless CLI over the SAME engine the UI uses. Imports ONLY
// src/engine + src/content (never src/ui): the clean import is itself the proof of the
// "no Svelte/DOM in the engine" rule. Verbs chain, threading a single in-memory state.
//
//   npm run cli -- state [--json] [--seed N]
//   npm run cli -- sim <seconds> [--seed N]
//   npm run cli -- gather <actionId>
//   npm run cli -- build <buildingId>
//   npm run cli -- assign <jobId> <n>        (n may be negative to unassign)
//   npm run cli -- research <techId>
//   npm run cli -- export | import <string> | save <path> | load <path>
//
//   e.g.  gather-wood ×15 then build a hut:
//         npm run cli -- gather gather-wood ... build hut state

import { readFileSync, writeFileSync } from 'node:fs';
import { newGame, type GameState } from '../engine/state';
import { simulate } from '../engine/tick';
import { serialize, exportString, importString, toFileString, safeLoad } from '../engine/save';
import { formatNumber, formatRate } from '../engine/format';
import { RESOURCE_BY_ID, RESOURCE_IDS, type ResourceId } from '../content/resources';
import { doGather } from '../engine/systems/actions';
import { build } from '../engine/systems/buildings';
import { assignJob, unassignJob, jobsView } from '../engine/systems/jobs';
import { research } from '../engine/systems/tech';
import { productionRates } from '../engine/systems/production';
import { buildingsView } from '../engine/systems/buildings';
import { techView } from '../engine/systems/tech';
import { actionsView } from '../engine/systems/actions';
import type { JobId } from '../content/jobs';
import type { BuildingId } from '../content/buildings';
import type { TechId } from '../content/tech';

const SIM_MAX_STEPS = 1e7; // hard ceiling so `sim 1e9` returns promptly instead of hanging
const EPS = 1e-9;

function freshState(seed?: number): GameState {
  return seed === undefined || Number.isNaN(seed) ? newGame() : newGame(seed);
}

function renderResources(state: GameState): string {
  const r = state.run.resources;
  const rates = productionRates(state);
  const caps = state.run.caps;
  return RESOURCE_IDS.map((id) => {
    const def = RESOURCE_BY_ID[id];
    const capStr = id === 'mana' || id === 'research' ? '' : `/${formatNumber(caps[id as 'wood' | 'food' | 'stone'])}`;
    const rate = Math.abs(rates[id]) > EPS ? ` ${formatRate(rates[id])}` : '';
    return `  ${def.glyph} ${def.label.padEnd(8)} ${formatNumber(r[id])}${capStr}${rate}`;
  }).join('\n');
}

function renderJobs(state: GameState): string {
  const v = jobsView(state);
  const lines = v.jobs
    .filter((j) => j.capacity > 0 || j.assigned > 0)
    .map((j) => `  ${j.id.padEnd(14)} ${j.assigned}/${j.capacity}`);
  const header = `population: ${v.total} total · ${v.idle} idle · cap ${state.run.popCap}`;
  return `${header}\njobs:${lines.length ? '\n' + lines.join('\n') : ' (no workplaces built)'}`;
}

function renderBuildings(state: GameState): string {
  const built = buildingsView(state).filter((b) => b.count > 0);
  if (!built.length) return 'buildings: (none)';
  return `buildings:\n${built.map((b) => `  ${b.id.padEnd(18)} ×${b.count}`).join('\n')}`;
}

function renderState(state: GameState): string {
  const starving = state.run.flags.starving ? ' STARVING' : '';
  return [
    `playtime=${state.playtime.toFixed(1)}s seed=${state.seed}${starving}`,
    'resources:',
    renderResources(state),
    renderJobs(state),
    renderBuildings(state),
    `tech: ${state.run.tech.length ? state.run.tech.join(', ') : '(none)'}`,
  ].join('\n');
}

function printState(state: GameState, json: boolean): void {
  if (json) {
    console.log(
      JSON.stringify(
        {
          ...state,
          derived: {
            rates: productionRates(state),
            jobs: jobsView(state),
            buildings: buildingsView(state).filter((b) => b.count > 0),
            actions: actionsView(state),
            tech: techView(state),
          },
        },
        null,
        2,
      ),
    );
  } else {
    console.log(renderState(state));
  }
}

const PIPE_VERBS = new Set([
  'state', 'sim', 'gather', 'build', 'assign', 'research',
  'buildings', 'techs', 'export', 'import', 'save', 'load', 'help', '--help', '-h',
]);

interface PipeCommand {
  verb: string;
  args: string[];
}

function parsePipeline(argv: string[]): { commands: PipeCommand[]; json: boolean; seed?: number } {
  const commands: PipeCommand[] = [];
  let json = false;
  let seed: number | undefined;
  let cur: PipeCommand | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--seed') seed = Number(argv[++i]);
    else if (PIPE_VERBS.has(a)) commands.push((cur = { verb: a, args: [] }));
    else if (cur) cur.args.push(a);
    else commands.push((cur = { verb: a, args: [] })); // leading unknown → unknown command
  }
  if (commands.length === 0) commands.push({ verb: 'help', args: [] });
  return { commands, json, seed };
}

function printHelp(): void {
  console.log(
    [
      'Arcane Dominion CLI',
      'Usage: npm run cli -- <command> [args]   (commands chain, threading one state)',
      '',
      '  state [--json] [--seed N]         resources + rates, population/jobs, buildings, tech',
      '  sim <seconds> [--seed N] [--json] fast-forward the deterministic tick loop',
      '  gather <actionId>                 instant manual gather (gather-wood/forage-food/quarry-stone)',
      '  build <buildingId>                pay cost + raise a building',
      '  assign <jobId> <n>                assign n idle settlers to a job (negative n to unassign)',
      '  research <techId>                 spend research to unlock a tech',
      '  buildings                         list every building (cost/count/buildable)',
      '  techs                             list every tech node (cost/status)',
      '  export | import <s> | save <p> | load <p>   portable save I/O',
    ].join('\n'),
  );
}

function runPipeline(commands: PipeCommand[], json: boolean, seed?: number): number {
  let state: GameState | null = null;
  const ensure = (): GameState => (state ??= freshState(seed));
  let code = 0;

  for (const { verb, args } of commands) {
    switch (verb) {
      case 'state':
        printState(ensure(), json);
        break;

      case 'sim': {
        const seconds = Number(args[0]);
        if (!Number.isFinite(seconds) || seconds < 0) {
          console.error('usage: sim <seconds> [--seed N] [--json]');
          return 1;
        }
        const s = ensure();
        const before = { ...s.run.resources };
        simulate(s, seconds, SIM_MAX_STEPS);
        console.log(`# simulated ${seconds}s (seed ${s.seed})`);
        for (const id of RESOURCE_IDS) {
          const delta = s.run.resources[id] - (before[id] ?? 0);
          if (Math.abs(delta) > EPS) {
            console.log(`  ${id}: ${formatNumber(before[id])} -> ${formatNumber(s.run.resources[id])}  (${delta >= 0 ? '+' : ''}${formatNumber(delta)})`);
          }
        }
        printState(s, json);
        break;
      }

      case 'gather': {
        const id = args[0];
        if (!id) { console.error('usage: gather <actionId>'); return 1; }
        const s = ensure();
        const ok = doGather(s, id);
        console.log(`# gather ${id}: ${ok ? 'ok' : 'refused (unknown or gated id)'}`);
        printState(s, json);
        if (!ok) code = 1;
        break;
      }

      case 'build': {
        const id = args[0] as BuildingId;
        if (!id) { console.error('usage: build <buildingId>   (see buildings)'); return 1; }
        const s = ensure();
        const ok = build(s, id);
        console.log(`# build ${id}: ${ok ? 'ok' : 'refused (locked, maxed, or unaffordable)'}`);
        printState(s, json);
        if (!ok) code = 1;
        break;
      }

      case 'assign': {
        const id = args[0] as JobId;
        const n = Number(args[1] ?? '1');
        if (!id || !Number.isFinite(n)) { console.error('usage: assign <jobId> <n>'); return 1; }
        const s = ensure();
        const moved = n >= 0 ? assignJob(s, id, n) : unassignJob(s, id, -n);
        console.log(`# assign ${id} ${n}: ${moved > 0 ? `ok (${n >= 0 ? 'assigned' : 'unassigned'} ${moved})` : 'refused (no idle/capacity or none assigned)'}`);
        printState(s, json);
        if (moved <= 0) code = 1;
        break;
      }

      case 'research': {
        const id = args[0] as TechId;
        if (!id) { console.error('usage: research <techId>   (see techs)'); return 1; }
        const s = ensure();
        const ok = research(s, id);
        console.log(`# research ${id}: ${ok ? 'ok' : 'refused (unknown, owned, prereqs unmet, or unaffordable)'}`);
        printState(s, json);
        if (!ok) code = 1;
        break;
      }

      case 'buildings': {
        const s = ensure();
        for (const b of buildingsView(s)) {
          const cost = Object.entries(b.cost).map(([r, a]) => `${a}${(RESOURCE_BY_ID[r as ResourceId]?.glyph) ?? r}`).join(' ');
          const status = b.maxed ? 'maxed' : !b.unlocked ? 'locked' : b.affordable ? 'buildable' : 'need-more';
          console.log(`  ${b.id.padEnd(18)} ×${b.count} ${status.padEnd(10)} cost: ${cost}`);
        }
        break;
      }

      case 'techs': {
        const s = ensure();
        for (const t of techView(s)) {
          const status = t.researched ? 'done' : !t.available ? 'locked' : t.affordable ? 'ready' : 'need-research';
          console.log(`  ${t.id.padEnd(14)} ${status.padEnd(14)} 📜${t.cost}  ${t.name}`);
        }
        break;
      }

      case 'export':
        console.log(exportString(ensure()));
        break;

      case 'import': {
        const text = args[0];
        if (!text) { console.error('usage: import <string>'); return 1; }
        try {
          state = importString(text);
          printState(state, json);
        } catch (e) {
          console.error(`import failed: ${e instanceof Error ? e.message : String(e)}`);
          return 1;
        }
        break;
      }

      case 'save': {
        const path = args[0];
        if (!path) { console.error('usage: save <path>'); return 1; }
        writeFileSync(path, toFileString(ensure()), 'utf8');
        console.log(`saved -> ${path}`);
        break;
      }

      case 'load': {
        const path = args[0];
        if (!path) { console.error('usage: load <path>'); return 1; }
        let text: string;
        try {
          text = readFileSync(path, 'utf8');
        } catch (e) {
          console.error(`could not read file: ${e instanceof Error ? e.message : String(e)}`);
          return 1;
        }
        const res = safeLoad(text);
        if (!res.ok || !res.state) {
          console.error(`load failed (save left intact): ${res.error}`);
          return 1;
        }
        void serialize(res.state); // prove it re-serializes with the same engine
        state = res.state;
        console.log(`loaded <- ${path}`);
        printState(state, json);
        break;
      }

      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;

      default:
        printHelp();
        code = 1; // unknown command
    }
  }
  return code;
}

function main(): number {
  const argv = process.argv.slice(2);
  const { commands, json, seed } = parsePipeline(argv);
  return runPipeline(commands, json, seed);
}

process.exit(main());

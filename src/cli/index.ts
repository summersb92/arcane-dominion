#!/usr/bin/env node
// Arcane Academy — headless CLI over the SAME engine the UI uses.
// Imports ONLY src/engine + src/content (never src/ui): the clean import is
// itself the proof of the "no Svelte/DOM in the engine" rule.
//
//   npm run cli -- state [--json]
//   npm run cli -- sim <seconds> [--seed N] [--json]
//   npm run cli -- export
//   npm run cli -- import <string>
//   npm run cli -- save <path>
//   npm run cli -- load <path>
//   npm run cli -- run <scenario.json>
//   npm run cli -- repl

import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { newGame, type GameState, type ElementId, type ResourceId } from '../engine/state';
import { simulate, TICK } from '../engine/tick';
import { serialize, exportString, importString, toFileString, safeLoad } from '../engine/save';
import { formatNumber, formatRate } from '../engine/format';
import {
  doTask,
  startTask,
  stopTask,
  listTaskInfo,
  taskInfo,
  taskRates,
  type TaskInfo,
} from '../engine/systems/tasks';
import { learnCantrip, listCantripInfo, type CantripInfo } from '../engine/systems/skills';
import { essenceRates } from '../engine/systems/essence';
import { foundingStatus, foundingSummaryLine } from '../engine/systems/founding';
import { homeSlots } from '../engine/systems/home';
import { TASK_BY_ID, type TaskDef, type TaskType } from '../content/tasks';
import { HOME_TIER_BY_ID } from '../content/home';
import { runScenario, type Scenario } from './scenario';
import { autoplay, autoplayFailLine, type AutoplayOptions } from './autoplay';

// A hard ceiling on `sim` so an absurd arg (e.g. `sim 1e9`) returns promptly instead of
// hanging: ~10M ticks ≈ a couple seconds of compute. Normal sims (≤ a few hours =
// ≤ ~432k ticks, well under this) never reach it and run in full, unchanged.
const SIM_MAX_STEPS = 1e7;

interface Args {
  cmd: string;
  positional: string[];
  json: boolean;
  seed?: number;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let json = false;
  let seed: number | undefined;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--seed') seed = Number(argv[++i]);
    else positional.push(a);
  }
  return { cmd: argv[0] ?? 'help', positional, json, seed };
}

function freshState(seed?: number): GameState {
  return seed === undefined || Number.isNaN(seed) ? newGame() : newGame(seed);
}

const CAP_EPS = 1e-9;

/** Resource ids sitting AT (within EPS of) their storage cap. Only Insight is capped in v0.1. */
function cappedResources(state: GameState): ResourceId[] {
  const capped: ResourceId[] = [];
  if (state.run.resources.insight >= state.run.caps.insight - CAP_EPS) capped.push('insight');
  return capped;
}

/** Total per-second essence production = task-driven (taskRates) + cantrip trickle (essenceRates). */
function essenceRatesAll(state: GameState): Partial<Record<ElementId, number>> {
  const out: Partial<Record<ElementId, number>> = { ...taskRates(state).essence };
  const trickle = essenceRates(state);
  for (const k of Object.keys(trickle) as ElementId[]) out[k] = (out[k] ?? 0) + (trickle[k] ?? 0);
  return out;
}

/** Active tasks with progress + why-paused — lets a reader tell "idling correctly" from "stalled". */
function renderActiveTasks(state: GameState): string {
  const active = listTaskInfo(state).filter((i) => i.active);
  if (!active.length) return 'active tasks: (none)';
  const lines = active.map((info) => {
    const def = TASK_BY_ID[info.id];
    const prog = def.length ? ` ${Math.round(info.progress * 100)}%` : '';
    // Completions are meaningless for perpetual (it never "completes") — omit its count.
    const done = def.type === 'perpetual' ? '' : ` ×${info.count}`;
    const status = info.paused
      ? `paused${info.pausedResourceId ? ` (needs ${info.pausedResourceId})` : ''}`
      : 'running';
    return `  ${info.id.padEnd(14)} ${def.type.padEnd(9)} ${status.padEnd(22)}${prog}${done}`;
  });
  return `active tasks:\n${lines.join('\n')}`;
}

/** Home tier + equipped items + the Founding gate snapshot (once the lair opens). */
function renderHomeAndFounding(state: GameState): string[] {
  if (state.run.flags.lairFounded !== true) return [];
  const lines: string[] = [];
  const home = state.run.home ?? { tier: 'vagrant', owned: [], equipped: [] };
  const tierName = HOME_TIER_BY_ID[home.tier]?.name ?? home.tier;
  lines.push(
    `home: ${tierName} · items ${home.equipped.length}/${homeSlots(state)}${
      home.equipped.length ? ` (${home.equipped.join(', ')})` : ''
    }`,
  );
  const fs = foundingStatus(state);
  const tag = fs.founded ? ' FOUNDED' : fs.allMet ? ' (gate OPEN)' : '';
  lines.push(`founding: ${foundingSummaryLine(state)}${tag}`);
  return lines;
}

/** Per-second net rates for resources + awakened essence (the #1 "am I producing?" readout). */
function renderRates(state: GameState): string {
  const fmt = (obj: Record<string, number | undefined>): string =>
    Object.entries(obj)
      .filter(([, v]) => v !== undefined && Math.abs(v) > CAP_EPS)
      .map(([k, v]) => `${k} ${formatRate(v as number)}`)
      .join('  ');
  const resStr = fmt(taskRates(state).resources);
  const essStr = fmt(essenceRatesAll(state));
  const lines = [`rates: ${resStr || '(idle)'}`];
  if (essStr) lines.push(`essence-rates: ${essStr}`);
  return lines.join('\n');
}

function renderState(state: GameState): string {
  const r = state.run.resources;
  const v = state.run.vitals;
  const caps = state.run.caps;
  const awakened = Object.entries(state.run.essence)
    .filter(([, e]) => e.awakened)
    .map(([id, e]) => `${id}=${formatNumber(e.amount)}`)
    .join(' ');
  const insightCapped = r.insight >= caps.insight - CAP_EPS ? ' (capped)' : '';
  return [
    `phase=${state.run.phase} act=${state.run.act} playtime=${state.playtime.toFixed(1)}s seed=${state.seed}`,
    `gold=${formatNumber(r.gold)} insight=${formatNumber(r.insight)}/${formatNumber(caps.insight)}${insightCapped} renown=${formatNumber(r.renown)}`,
    `materials: moonpetal=${r.moonpetal} ironOre=${r.ironOre} spiritDust=${r.spiritDust} scroll=${r.scroll}`,
    `vitals: life=${v.life.cur.toFixed(1)}/${v.life.max} stamina=${v.stamina.cur.toFixed(1)}/${v.stamina.max} mana=${v.mana.cur.toFixed(1)}/${v.mana.max}`,
    `essence(awakened): ${awakened || '(none)'}`,
    `skills: ${state.run.skills.length ? state.run.skills.join(', ') : '(none)'}`,
    ...renderHomeAndFounding(state),
    renderActiveTasks(state),
    renderRates(state),
  ].join('\n');
}

function printState(state: GameState, json: boolean): void {
  console.log(json ? JSON.stringify(state, null, 2) : renderState(state));
}

/** Derived read models attached to `state --json` so an agent gets the same legibility
 *  the human readout has (active tasks, per-second rates, capped resources). */
interface DerivedReadout {
  activeTasks: {
    id: string;
    type: TaskType;
    progress: number;
    paused: boolean;
    pausedReason?: string;
    count?: number; // omitted for perpetual (never "completes")
  }[];
  rates: { resources: Partial<Record<ResourceId, number>>; essence: Partial<Record<ElementId, number>> };
  cappedResources: ResourceId[];
}

function buildDerived(state: GameState): DerivedReadout {
  const activeTasks = listTaskInfo(state)
    .filter((i) => i.active)
    .map((i) => {
      const def = TASK_BY_ID[i.id];
      return {
        id: i.id,
        type: def.type,
        progress: def.length ? i.progress : 0,
        paused: i.paused,
        pausedReason: i.pausedResourceId ? `needs ${i.pausedResourceId}` : undefined,
        count: def.type === 'perpetual' ? undefined : i.count,
      };
    });
  return {
    activeTasks,
    rates: { resources: taskRates(state).resources, essence: essenceRatesAll(state) },
    cappedResources: cappedResources(state),
  };
}

/** The `state` command: enriched human readout, or raw state + a `derived` block for --json. */
function printStateCmd(state: GameState, json: boolean): void {
  if (json) console.log(JSON.stringify({ ...state, derived: buildDerived(state) }, null, 2));
  else console.log(renderState(state));
}

/** A short reachability label for a task — why the player can/can't act on it right now. */
function taskStatusLabel(info: TaskInfo): string {
  if (info.active) return info.paused ? `paused${info.pausedResourceId ? `(${info.pausedResourceId})` : ''}` : 'active';
  if (info.maxed) return 'maxed';
  if (info.locked) return 'locked'; // requirements unmet
  if (info.slotFull) return 'no-slot'; // continuous & no free Activity slot
  if (!info.affordable) return 'cant-afford';
  return 'ready';
}

function renderTasks(state: GameState): string {
  return listTaskInfo(state)
    .map((info) => {
      const def = TASK_BY_ID[info.id];
      const prog = def.length ? ` ${Math.round(info.progress * 100)}%` : '';
      const done = def.type === 'perpetual' ? '' : ` ×${info.count}`; // no count for perpetual
      return `  ${info.id.padEnd(14)} ${def.type.padEnd(9)} ${taskStatusLabel(info).padEnd(14)}${prog}${done}  ${def.name}`;
    })
    .join('\n');
}

/** A cantrip label that reflects whether the player can ACTUALLY learn it now — not a bare
 *  "available" when prereqs are met but there's no Insight (or the cost is over the cap). */
function cantripStatusLabel(c: CantripInfo): string {
  if (c.status === 'owned') return 'owned';
  if (c.status === 'locked') return 'locked'; // missing prereqs
  if (c.exceedsCap) return 'over-cap'; // cost exceeds the Insight Max (the `*` case)
  if (!c.affordable) return 'unaffordable'; // prereqs met, but not enough Insight yet
  return 'available'; // learnable right now
}

function renderSkills(state: GameState): string {
  return listCantripInfo(state)
    .map((c) => {
      const cap = c.exceedsCap ? '*' : '';
      return `  ${c.id.padEnd(16)} ${cantripStatusLabel(c).padEnd(12)} ◈${c.cost}${cap}  ${c.name}  (${c.effectText})`;
    })
    .join('\n');
}

type TaskVerb = 'do' | 'start' | 'stop';
const TASK_FN: Record<TaskVerb, (s: GameState, id: string) => boolean> = {
  do: doTask,
  start: startTask,
  stop: stopTask,
};

/** Name the first unmet requirement of a task (for a refusal message). */
function reqReason(state: GameState, def: TaskDef): string {
  for (const r of def.requires ?? []) {
    if (r.kind === 'flag' && state.run.flags[r.flag] !== true) return `needs ${r.flag}`;
    if (r.kind === 'skill' && !state.run.skills.includes(r.id)) return `needs skill ${r.id}`;
    if (r.kind === 'resource' && (state.run.resources[r.id] ?? 0) < r.atLeast) return `needs ${r.atLeast} ${r.id}`;
    if (r.kind === 'taskCount' && (state.run.tasks[r.id]?.count ?? 0) < r.atLeast) return `needs ${r.atLeast}x ${r.id}`;
  }
  return 'requirements unmet';
}

/** Why a task verb was refused. Actions don't mutate on refusal, so the post-call state
 *  equals the pre-call state — the read models below report the exact failing guard. */
function taskRefusalReason(state: GameState, verb: TaskVerb, id: string): string {
  const def = TASK_BY_ID[id];
  if (!def) return 'unknown id';
  if (verb === 'stop') return 'not running';
  if (verb === 'do' && def.type !== 'instant') return 'wrong type (do is instant-only)';
  const info = taskInfo(state, def);
  if (verb === 'start' && def.type !== 'instant' && info.active) return 'already running';
  if (info.maxed) return 'maxed';
  if (info.locked) return reqReason(state, def);
  if (info.slotFull) return 'no free slot';
  if (!info.affordable) return "can't afford";
  return 'refused';
}

/** Why a `learn` was refused. */
function learnRefusalReason(state: GameState, id: string): string {
  const info = listCantripInfo(state).find((c) => c.id === id);
  if (!info) return 'unknown id';
  if (info.status === 'owned') return 'already learned';
  if (info.missingPrereqs.length) return `needs ${info.missingPrereqs.join(', ')}`;
  if (info.exceedsCap) return 'exceeds Insight cap';
  if (!info.affordable) return "can't afford";
  return 'refused';
}

// ---- command pipeline ----
// The whole argv is one pipeline of verbs threaded through a SINGLE in-memory
// state, so `load <p> sim <s> save <p>` loads → fast-forwards → persists the SAME
// state (and `state`/`export` reflect the loaded+simmed result). A lone verb is
// just a pipeline of length 1, so every prior single-command usage still works.
const PIPE_VERBS = new Set([
  'state', 'sim', 'tasks', 'skills', 'do', 'start', 'stop', 'learn', 'export', 'import', 'save', 'load', 'help', '--help', '-h',
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
      'Arcane Academy CLI',
      'Usage: npm run cli -- <command> [args]   (commands chain, threading one state)',
      '',
      '  state [--json] [--seed N]      resources/vitals/essence/phase + active tasks, per-second rates, caps',
      '  tasks [--seed N]               list task ids, types, and status',
      '  skills [--seed N]              list cantrip ids, status, and cost',
      '  do|start|stop <id> [--seed N]  drive a task action, then print state (exit 0 ok / 1 refused)',
      '  learn <cantripId> [--seed N]   learn a cantrip (spends Insight), then print state',
      '  sim <seconds> [--seed N] [--json]   fast-forward the deterministic tick loop',
      '  export [--seed N]              print a portable save string (clipboard format)',
      '  import <string> [--json]       load a save string and print state',
      '  save <path> [--seed N]         write a .aasave file (same format the browser downloads)',
      '  load <path> [--json]           read a .aasave file (browser saves load here too)',
      '  run <scenario.json>            run a scenario; exit 0/1 on its assertions',
      '  autoplay [--goal founding] [--max-min N] [--seed N] [--json]   heuristic bot plays to the goal',
      '  repl [--seed N]                interactive loop',
      '',
      '  e.g.  load run.aasave sim 3600 save run.aasave   (load → fast-forward 1h → persist)',
    ].join('\n'),
  );
}

/** Execute the parsed pipeline against ONE threaded state. */
function runPipeline(commands: PipeCommand[], json: boolean, seed?: number): number {
  let state: GameState | null = null;
  const ensure = (): GameState => (state ??= freshState(seed));
  let code = 0;

  for (const { verb, args } of commands) {
    switch (verb) {
      case 'state':
        printStateCmd(ensure(), json);
        break;

      case 'tasks':
        console.log(renderTasks(ensure()));
        break;

      case 'skills':
        console.log(renderSkills(ensure()));
        break;

      case 'sim': {
        const seconds = Number(args[0]);
        if (!Number.isFinite(seconds) || seconds < 0) {
          console.error('usage: sim <seconds> [--seed N] [--json]');
          return 1;
        }
        const s = ensure();
        const before = { ...s.run.resources };
        // Bound the tick count so an absurd arg returns promptly instead of hanging.
        const requestedSteps = Math.floor(seconds / TICK + 1e-9);
        const capped = requestedSteps > SIM_MAX_STEPS;
        const cappedSeconds = SIM_MAX_STEPS * TICK;
        if (capped) {
          console.error(
            `# sim: ${seconds}s (${requestedSteps} ticks) exceeds the ${SIM_MAX_STEPS}-tick cap — truncating to ~${cappedSeconds}s of simulated time.`,
          );
        }
        simulate(s, seconds, SIM_MAX_STEPS);
        if (json) {
          printState(s, true);
        } else {
          console.log(`# simulated ${capped ? `~${cappedSeconds}s (capped from ${seconds}s)` : `${seconds}s`} (seed ${s.seed})`);
          for (const [k, v] of Object.entries(s.run.resources)) {
            const delta = v - (before[k as keyof typeof before] ?? 0);
            if (Math.abs(delta) > 1e-9)
              console.log(
                `  ${k}: ${formatNumber(before[k as keyof typeof before])} -> ${formatNumber(v)}  (${delta >= 0 ? '+' : ''}${formatNumber(delta)})`,
              );
          }
          console.log(renderState(s));
        }
        break;
      }

      case 'do':
      case 'start':
      case 'stop': {
        const id = args[0];
        if (!id) {
          console.error(`usage: ${verb} <taskId>   (see 'tasks' for ids)`);
          return 1;
        }
        const s = ensure();
        const ok = TASK_FN[verb as TaskVerb](s, id);
        const outcome = ok ? 'ok' : `refused (${taskRefusalReason(s, verb as TaskVerb, id)})`;
        console.log(`# ${verb} ${id}: ${outcome} (seed ${s.seed})`);
        printState(s, json);
        if (!ok) code = 1;
        break;
      }

      case 'learn': {
        const id = args[0];
        if (!id) {
          console.error("usage: learn <cantripId>   (see 'skills' for ids)");
          return 1;
        }
        const s = ensure();
        const ok = learnCantrip(s, id);
        const outcome = ok ? 'ok' : `refused (${learnRefusalReason(s, id)})`;
        console.log(`# learn ${id}: ${outcome} (seed ${s.seed})`);
        printState(s, json);
        if (!ok) code = 1;
        break;
      }

      case 'export':
        console.log(exportString(ensure()));
        break;

      case 'import': {
        const text = args[0];
        if (!text) {
          console.error('usage: import <string>');
          return 1;
        }
        try {
          state = importString(text); // becomes the threaded state
          printState(state, json);
        } catch (e) {
          console.error(`import failed: ${e instanceof Error ? e.message : String(e)}`);
          return 1;
        }
        break;
      }

      case 'save': {
        const path = args[0];
        if (!path) {
          console.error('usage: save <path>');
          return 1;
        }
        // Persist the CURRENT threaded state (loaded+simmed), NOT a fresh game.
        writeFileSync(path, toFileString(ensure()), 'utf8');
        console.log(`saved -> ${path}`);
        break;
      }

      case 'load': {
        const path = args[0];
        if (!path) {
          console.error('usage: load <path>');
          return 1;
        }
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
        state = res.state; // thread the loaded state forward through the pipeline
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

function cmdRun(args: Args): number {
  const path = args.positional[0];
  if (!path) {
    console.error('usage: run <scenario.json>');
    return 1;
  }
  let spec: Scenario;
  try {
    spec = JSON.parse(readFileSync(path, 'utf8')) as Scenario;
  } catch (e) {
    console.error(`could not read scenario: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  const result = runScenario(spec);
  console.log(`# scenario: ${result.name}`);
  for (const r of result.results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.desc}${r.detail ? `  [${r.detail}]` : ''}`);
  }
  console.log(result.ok ? `OK — ${result.results.length} steps passed` : 'FAILED');
  return result.ok ? 0 : 1;
}

/** mm:ss for the autoplay timeline. */
function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * autoplay [--goal founding] [--max-min N] [--seed N] [--step N] [--json]
 * A heuristic bot plays toward the goal and reports whether/when it reached it.
 */
function cmdAutoplay(argv: string[]): number {
  let goal: AutoplayOptions['goal'] = 'founding';
  let maxMin = 60;
  let seed: number | undefined;
  let step = 1;
  let json = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--goal') goal = argv[++i] as AutoplayOptions['goal'];
    else if (a === '--max-min') maxMin = Number(argv[++i]);
    else if (a === '--seed') seed = Number(argv[++i]);
    else if (a === '--step') step = Number(argv[++i]);
    else if (a === '--json') json = true;
  }
  if (goal !== 'founding') {
    console.error(`autoplay: unknown goal "${goal}" (only 'founding' in v0.1)`);
    return 1;
  }
  if (!Number.isFinite(maxMin) || maxMin <= 0) {
    console.error('usage: autoplay [--goal founding] [--max-min N] [--seed N] [--step N] [--json]');
    return 1;
  }

  const res = autoplay({ goal, maxMin, seed, stepSeconds: step });

  if (json) {
    console.log(
      JSON.stringify(
        {
          reached: res.reached,
          atSec: res.atSec,
          atMin: res.atSec !== undefined ? +(res.atSec / 60).toFixed(2) : undefined,
          simSeconds: +res.simSeconds.toFixed(1),
          seed: res.finalState.seed,
          timeline: res.timeline,
        },
        null,
        2,
      ),
    );
    return res.reached ? 0 : 1;
  }

  console.log(`# autoplay --goal ${goal} --seed ${res.finalState.seed} (decision step ${step}s, cap ${maxMin} min)`);
  for (const e of res.timeline) console.log(`  [${mmss(e.atSec)}] ${e.text}`);
  if (res.reached && res.atSec !== undefined) {
    console.log(`\nFOUNDED at ${mmss(res.atSec)} (${(res.atSec / 60).toFixed(1)} min sim, ${res.atSec.toFixed(0)}s).`);
  } else {
    console.log(`\nDID NOT reach the Founding — ${autoplayFailLine(res)}.`);
  }
  return res.reached ? 0 : 1;
}

function cmdRepl(args: Args): number {
  const state = freshState(args.seed);
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'aa> ' });
  console.log(
    'Arcane Academy REPL — commands: state, tasks, skills, do/start/stop <id>, learn <id>, sim <sec>, export, help, quit',
  );
  rl.prompt();
  rl.on('line', (line) => {
    const [c, arg] = line.trim().split(/\s+/);
    switch (c) {
      case '':
        break;
      case 'state':
        console.log(renderState(state));
        break;
      case 'tasks':
        console.log(renderTasks(state));
        break;
      case 'skills':
        console.log(renderSkills(state));
        break;
      case 'do':
      case 'start':
      case 'stop': {
        if (!arg) {
          console.log(`usage: ${c} <taskId>`);
          break;
        }
        const ok = TASK_FN[c](state, arg);
        console.log(`${c} ${arg}: ${ok ? 'ok' : `refused (${taskRefusalReason(state, c, arg)})`}`);
        break;
      }
      case 'learn': {
        if (!arg) {
          console.log('usage: learn <cantripId>');
          break;
        }
        const ok = learnCantrip(state, arg);
        console.log(`learn ${arg}: ${ok ? 'ok' : `refused (${learnRefusalReason(state, arg)})`}`);
        break;
      }
      case 'sim': {
        const secs = Number(arg);
        if (Number.isFinite(secs)) {
          simulate(state, secs);
          console.log(`simulated ${secs}s`);
        } else console.log('usage: sim <seconds>');
        break;
      }
      case 'export':
        console.log(exportString(state));
        break;
      case 'help':
        console.log('state | tasks | skills | do/start/stop <id> | learn <id> | sim <sec> | export | quit');
        break;
      case 'quit':
      case 'exit':
        rl.close();
        return;
      default:
        console.log(`unknown: ${c} (try 'help')`);
    }
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
  return 0;
}

function main(): number {
  const argv = process.argv.slice(2);
  const cmd0 = argv[0] ?? 'help';

  // `run` and `repl` are standalone: `run` owns its assertion-driven exit code and
  // `repl` is interactive (manages its own lifecycle) — neither composes with the
  // state-threading pipeline, so they're dispatched here directly.
  if (cmd0 === 'run') return cmdRun(parseArgs(argv));
  if (cmd0 === 'repl') return cmdRepl(parseArgs(argv));
  if (cmd0 === 'autoplay') return cmdAutoplay(argv);

  const { commands, json, seed } = parsePipeline(argv);
  return runPipeline(commands, json, seed);
}

// repl manages its own lifecycle; everything else exits on the returned code.
const code = main();
if ((process.argv[2] ?? 'help') !== 'repl') process.exit(code);

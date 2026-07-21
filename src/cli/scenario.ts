// Scenario runner: executes a scripted list of commands + assertions over the
// engine and reports pass/fail. Imports ONLY the engine (never src/ui). Used by
// `cli run <scenario.json>` so scenarios double as CI-able regression/balance tests.

import { newGame, type GameState } from '../engine/state';
import { simulate } from '../engine/tick';
import { doTask, startTask, stopTask } from '../engine/systems/tasks';
import { learnCantrip } from '../engine/systems/skills';
import { moveHome, buyItem, equipItem, unequipItem } from '../engine/systems/home';

export type Op = '>=' | '<=' | '>' | '<' | '==' | '!=';

/** Optional outcome assertion for an action step (do/start/stop/learn). */
export type Expect = 'ok' | 'refused';

export interface Scenario {
  name?: string;
  seed?: number;
  steps: Step[];
}

export type Step =
  | { sim: number }
  | { do: string; expect?: Expect }
  | { start: string; expect?: Expect }
  | { stop: string; expect?: Expect }
  | { learn: string; expect?: Expect }
  | { moveHome: string; expect?: Expect } // v0.1.1 — housing tier + item actions
  | { buyItem: string; expect?: Expect }
  | { equipItem: string; expect?: Expect }
  | { unequipItem: string; expect?: Expect }
  | { assert: { path: string; op: Op; value: number | boolean | string } }
  | { note: string };

export interface StepResult {
  ok: boolean;
  desc: string;
  detail?: string;
}

export interface ScenarioResult {
  ok: boolean;
  name: string;
  results: StepResult[];
  state: GameState;
}

/** Resolve a dotted path like "run.resources.gold" against the state. */
export function resolvePath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function compare(actual: unknown, op: Op, expected: number | boolean | string): boolean {
  if (typeof expected === 'boolean') {
    const a = Boolean(actual);
    if (op === '==') return a === expected;
    if (op === '!=') return a !== expected;
    return false; // ordering ops are meaningless for booleans
  }
  if (typeof expected === 'string') {
    // String state (e.g. run.phase === 'founded') — equality only.
    if (op === '==') return actual === expected;
    if (op === '!=') return actual !== expected;
    return false; // ordering ops are meaningless for strings
  }
  const a = typeof actual === 'number' ? actual : NaN;
  switch (op) {
    case '>=':
      return a >= expected;
    case '<=':
      return a <= expected;
    case '>':
      return a > expected;
    case '<':
      return a < expected;
    case '==':
      return a === expected;
    case '!=':
      return a !== expected;
    default:
      return false;
  }
}

function fmtActual(raw: unknown): string {
  return typeof raw === 'number' ? raw.toFixed(4) : String(raw);
}

/**
 * Build the StepResult for an action step. Without `expect` the action is fire-and-
 * forget and always PASSes (pre-expect behavior — committed scenarios are unchanged);
 * with `expect`, the step PASSes iff the engine's actual outcome matches, so a scenario
 * can assert a refusal (e.g. can't afford / gated) and fail the run on a mismatch.
 */
function actionResult(verb: string, id: string, expect: Expect | undefined, actualOk: boolean): StepResult {
  const outcome: Expect = actualOk ? 'ok' : 'refused';
  if (expect === undefined) return { ok: true, desc: `${verb} ${id}`, detail: outcome };
  const ok = expect === outcome;
  return { ok, desc: `${verb} ${id}`, detail: ok ? `${outcome} (expected)` : `expected ${expect}, got ${outcome}` };
}

export function runScenario(spec: Scenario): ScenarioResult {
  const state = newGame(spec.seed ?? 1);
  const results: StepResult[] = [];

  for (const step of spec.steps) {
    if ('sim' in step) {
      simulate(state, step.sim);
      results.push({ ok: true, desc: `sim ${step.sim}s`, detail: `playtime=${state.playtime.toFixed(1)}s` });
    } else if ('do' in step) {
      results.push(actionResult('do', step.do, step.expect, doTask(state, step.do)));
    } else if ('start' in step) {
      results.push(actionResult('start', step.start, step.expect, startTask(state, step.start)));
    } else if ('stop' in step) {
      results.push(actionResult('stop', step.stop, step.expect, stopTask(state, step.stop)));
    } else if ('learn' in step) {
      results.push(actionResult('learn', step.learn, step.expect, learnCantrip(state, step.learn)));
    } else if ('moveHome' in step) {
      results.push(actionResult('moveHome', step.moveHome, step.expect, moveHome(state, step.moveHome)));
    } else if ('buyItem' in step) {
      results.push(actionResult('buyItem', step.buyItem, step.expect, buyItem(state, step.buyItem)));
    } else if ('equipItem' in step) {
      results.push(actionResult('equipItem', step.equipItem, step.expect, equipItem(state, step.equipItem)));
    } else if ('unequipItem' in step) {
      results.push(actionResult('unequipItem', step.unequipItem, step.expect, unequipItem(state, step.unequipItem)));
    } else if ('assert' in step) {
      const { path, op, value } = step.assert;
      const raw = resolvePath(state, path);
      const ok = compare(raw, op, value);
      results.push({ ok, desc: `assert ${path} ${op} ${value}`, detail: `actual=${fmtActual(raw)}` });
    } else if ('note' in step) {
      results.push({ ok: true, desc: `note: ${step.note}` });
    } else {
      results.push({ ok: false, desc: `unknown step: ${JSON.stringify(step)}` });
    }
  }

  return {
    ok: results.every((r) => r.ok),
    name: spec.name ?? 'scenario',
    results,
    state,
  };
}

<script lang="ts">
  // "While you were away…" (spec §3.4) — a dismissible panel shown on load when the
  // offline catch-up (main.ts → offlineSummary store) accrued a meaningful gap. Shows
  // elapsed time, whether it hit the 12h cap, and the per-resource gains (a light
  // count-up), then gets out of the way. The fancier "Morning Ledger" is deferred.
  import { onMount, onDestroy } from 'svelte';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { offlineSummary } from '../stores';
  import type { OfflineSummary } from '../../engine/offline';
  import type { ResourceId } from '../../engine/state';
  import { fmt } from '../format';

  // id → glyph · label · colour class (materials share the dim body colour).
  const RES: { id: ResourceId; glyph: string; label: string; cls: string }[] = [
    { id: 'gold', glyph: '⦿', label: 'Gold', cls: 'g' },
    { id: 'insight', glyph: '◈', label: 'Insight', cls: 'ins' },
    { id: 'renown', glyph: '★', label: 'Renown', cls: 'ren' },
    { id: 'moonpetal', glyph: '⚘', label: 'Moonpetal', cls: 'mat' },
    { id: 'ironOre', glyph: '⛏', label: 'Iron Ore', cls: 'mat' },
    { id: 'spiritDust', glyph: '✧', label: 'Spirit Dust', cls: 'mat' },
  ];

  let summary: OfflineSummary | null = null;
  let btn: HTMLButtonElement | undefined;

  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Count-up factor 0→1 (skipped under reduced-motion).
  const factor = tweened(0, { duration: reduce ? 0 : 750, easing: cubicOut });

  const unsub = offlineSummary.subscribe((s) => {
    summary = s;
    if (s) {
      factor.set(0, { duration: 0 });
      factor.set(1);
      // Focus the dismiss control so keyboard users can close it immediately.
      queueMicrotask(() => btn?.focus());
    }
  });
  onDestroy(unsub);

  onMount(() => {
    if (summary) btn?.focus();
  });

  function dismiss(): void {
    offlineSummary.set(null);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  }

  /** Human duration, e.g. "2h 14m", "3m 20s", "45s". */
  function fmtDuration(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  $: gains = summary
    ? RES.filter((r) => Math.abs(summary!.gains[r.id] ?? 0) > 1e-9).map((r) => ({
        ...r,
        amount: summary!.gains[r.id] ?? 0,
      }))
    : [];
</script>

{#if summary}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="scrim" on:click={dismiss}>
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="obox"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      on:click|stopPropagation
      on:keydown={onKey}
    >
      <h2 id="offline-title">While you were away…</h2>
      <div class="elapsed">
        You were gone <strong>{fmtDuration(summary.elapsedMs)}</strong>.
        {#if summary.capped}
          <span class="cap" title="Offline progress is capped at 12 hours.">
            Catch-up capped at 12h ({fmtDuration(summary.appliedMs)} applied).
          </span>
        {/if}
      </div>

      {#if gains.length > 0}
        <div class="glabel">The lair kept working:</div>
        <ul class="glist">
          {#each gains as gn (gn.id)}
            <li>
              <span class="nm {gn.cls}">{gn.glyph} {gn.label}</span>
              <span class="amt {gn.amount < 0 ? 'neg' : 'pos'}"
                >{gn.amount < 0 ? '-' : '+'}{fmt(Math.abs(gn.amount) * $factor)}</span
              >
            </li>
          {/each}
        </ul>
      {:else}
        <div class="glabel">Nothing accrued while you were gone.</div>
      {/if}

      <button class="btn collect" bind:this={btn} on:click={dismiss}>Collect &amp; continue</button>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: #0009;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 50;
  }
  .obox {
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 10px;
    box-shadow: 0 24px 70px #0008;
    padding: 18px 18px 16px;
    width: 100%;
    max-width: 360px;
    color: var(--ink);
  }
  .obox h2 {
    margin: 0 0 10px;
    font-size: 13px;
    letter-spacing: 0.12em;
    color: var(--renown);
    text-transform: uppercase;
  }
  .elapsed {
    font-size: 12.5px;
    color: var(--dim);
    line-height: 1.5;
  }
  .elapsed strong {
    color: var(--ink);
  }
  .cap {
    display: block;
    margin-top: 4px;
    color: var(--gold);
    font-size: 11.5px;
  }
  .glabel {
    margin: 12px 0 6px;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--label);
  }
  ul.glist {
    list-style: none;
    margin: 0 0 4px;
    padding: 0;
  }
  ul.glist li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 3px 0;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    border-bottom: 1px solid var(--row-edge);
  }
  .glist .nm.g {
    color: var(--gold);
  }
  .glist .nm.ins {
    color: var(--insight);
  }
  .glist .nm.ren {
    color: var(--renown);
  }
  .glist .nm.mat {
    color: var(--dim);
  }
  .glist .amt.pos {
    color: var(--ok);
  }
  .glist .amt.neg {
    color: var(--life);
  }
  .collect {
    margin-top: 14px;
    width: 100%;
    padding: 7px 0;
    font-size: 12.5px;
  }
  @media (prefers-reduced-motion: reduce) {
    .scrim {
      background: #000a;
    }
  }
</style>

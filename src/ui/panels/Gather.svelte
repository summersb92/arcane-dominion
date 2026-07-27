<script lang="ts">
  // Gather — three buttons at the foot of the resource column (Wood · Stone · Food), right
  // next to the numbers they change. Retired actions (storage cap ≥ 1000) drop off — by
  // then production covers them — and the whole section disappears with the last one.
  import { onDestroy } from 'svelte';
  import { game, doGather, openTip, hideTooltip, actionTooltip } from '../stores';
  import type { ActionRowView } from '../stores';

  const ORDER = ['wood', 'stone', 'food'];

  /** Press-and-hold auto-gather. The first gather still comes from the normal click, so a
   *  plain tap behaves exactly as before; holding past HOLD_DELAY_MS starts a repeat. The
   *  delay is what keeps an ordinary click from ever turning into two. */
  const HOLD_DELAY_MS = 350;
  const REPEAT_MS = 100; // ten a second while held

  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let repeatTimer: ReturnType<typeof setInterval> | undefined;

  function startHold(id: string): void {
    stopHold();
    holdTimer = setTimeout(() => {
      repeatTimer = setInterval(() => doGather(id), REPEAT_MS);
    }, HOLD_DELAY_MS);
  }

  /** Idempotent, and called from every way a hold can end — release, drag-off, focus loss,
   *  tab-away, or the button retiring out from under the pointer. */
  function stopHold(): void {
    if (holdTimer !== undefined) clearTimeout(holdTimer);
    if (repeatTimer !== undefined) clearInterval(repeatTimer);
    holdTimer = undefined;
    repeatTimer = undefined;
  }

  onDestroy(stopHold);
  $: buttons = ORDER
    .map((res) => $game.actions.find((a) => a.resource === res))
    .filter((a): a is ActionRowView => a !== undefined && !a.retired);
</script>

<!-- Catch-alls: releasing off the button, or alt-tabbing mid-hold, must still stop it. -->
<svelte:window on:pointerup={stopHold} on:blur={stopHold} />

{#if buttons.length}
  <div class="gather">
    <h2 class="mt">Gather</h2>
    <div class="gbtns">
      {#each buttons as a (a.id)}
        <button
          class="gbtn"
          disabled={!a.available}
          on:click={() => doGather(a.id)}
          on:pointerdown={() => startHold(a.id)}
          on:pointerup={stopHold}
          on:pointerleave={stopHold}
          on:pointercancel={stopHold}
          on:contextmenu|preventDefault
          on:mouseenter={(e) => openTip(e, actionTooltip(a))}
          on:focus={(e) => openTip(e, actionTooltip(a))}
          on:mouseleave={hideTooltip}
          on:blur={() => {
            hideTooltip();
            stopHold();
          }}
        >
          <span class="gl">{a.resLabel}</span>
          <span class="gg">{a.gainText}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* Breathing room above the buttons — the rail reads as separate blocks, not one column
     of controls butted together. */
  .gather {
    margin-top: 18px;
  }
  /* One button PER ROW, full width and deliberately large — these are clicked hundreds of
     times in the opening minutes, so they must be an easy target. They retire on their own
     once storage (and therefore production) outgrows hand-gathering. */
  .gbtns {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gbtn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 12px 14px;
    font-family: inherit;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--edge);
    border-left: 4px solid var(--gold);
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    /* Held down for seconds at a time: don't let the browser turn that into a text
       selection, a long-press callout, or a double-tap zoom. */
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: manipulation;
    transition: border-color 0.12s, transform 0.05s;
  }
  .gbtn .gg {
    font-size: 12.5px;
    font-weight: 400;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  .gbtn:hover {
    border-color: var(--accent);
  }
  .gbtn:active {
    transform: translateY(1px);
  }
  .gbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .gbtn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (prefers-reduced-motion: reduce) {
    .gbtn {
      transition: none;
    }
  }
</style>

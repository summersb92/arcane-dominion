<script lang="ts">
  // Gather — three buttons at the foot of the resource column (Wood · Stone · Food), right
  // next to the numbers they change. Retired actions (storage cap ≥ 1000) drop off — by
  // then production covers them — and the whole section disappears with the last one.
  import { game, doGather, openTip, hideTooltip, actionTooltip } from '../stores';
  import type { ActionRowView } from '../stores';

  const ORDER = ['wood', 'stone', 'food'];
  $: buttons = ORDER
    .map((res) => $game.actions.find((a) => a.resource === res))
    .filter((a): a is ActionRowView => a !== undefined && !a.retired);
</script>

{#if buttons.length}
  <div class="gather">
    <h2 class="mt">Gather</h2>
    <div class="gbtns">
      {#each buttons as a (a.id)}
        <button
          class="gbtn"
          disabled={!a.available}
          on:click={() => doGather(a.id)}
          on:mouseenter={(e) => openTip(e, actionTooltip(a))}
          on:focus={(e) => openTip(e, actionTooltip(a))}
          on:mouseleave={hideTooltip}
          on:blur={hideTooltip}
        >
          {a.resLabel}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .gather {
    margin-top: 10px;
  }
  .gbtns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .gbtn {
    flex: 1 1 auto;
    padding: 7px 10px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--edge);
    border-left: 3px solid var(--gold);
    border-radius: 8px;
    cursor: pointer;
    text-align: center;
    transition: border-color 0.12s, transform 0.05s;
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

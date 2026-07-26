<script lang="ts">
  // Market — gold's sink. Once Currency is researched you can buy materials outright;
  // Banking widens the stalls to ore and metal. Lives in the right rail beside Gather:
  // both are click-to-get panels, and neither shifts as new resource rows appear.
  import { game, buy, openTip, hideTooltip } from '../stores';
  import { fmtCost } from '../format';

  $: rows = $game.trade;
</script>

{#if rows.length}
  <div class="trade">
    <h2 class="mt">Market</h2>
    <div class="tbtns">
      {#each rows as p (p.id)}
        <button
          class="tbtn"
          class:cant={!p.affordable}
          disabled={!p.affordable}
          on:click={() => buy(p.id)}
          on:mouseenter={(e) =>
            openTip(e, {
              title: `Buy ${p.resLabel}`,
              sections: [
                { label: 'Costs', lines: [{ text: `${fmtCost(p.price)} Gold`, cls: 'life' }] },
                { label: 'Yields', lines: [{ text: `+${fmtCost(p.amount)} ${p.resLabel}`, cls: 'ok' }] },
              ],
              blurb: 'Bought goods arrive at once, clamped to your storage cap.',
            })}
          on:mouseleave={hideTooltip}
        >
          <span class="tl">+{fmtCost(p.amount)} {p.resLabel}</span>
          <span class="tp">{fmtCost(p.price)}g</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .trade {
    margin-bottom: 14px;
  }
  .tbtns {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tbtn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--edge);
    border-left: 3px solid var(--gold);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.12s, transform 0.05s;
  }
  .tbtn:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .tbtn:active:not(:disabled) {
    transform: translateY(1px);
  }
  .tbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .tbtn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .tl {
    font-weight: 600;
  }
  .tp {
    color: var(--gold);
    font-variant-numeric: tabular-nums;
    font-size: 12.5px;
  }
  .tbtn.cant .tp {
    color: var(--life);
  }
  @media (prefers-reduced-motion: reduce) {
    .tbtn {
      transition: none;
    }
  }
</style>

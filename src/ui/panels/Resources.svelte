<script lang="ts">
  import { game, openTip, hideTooltip, resourceTooltip } from '../stores';
  import type { ResourceView } from '../stores';
  import { fmtHeld, fmtRate } from '../format';

  // amber when at/above 90% of a finite cap
  function nearCap(r: ResourceView): boolean {
    return r.capped && r.amount >= r.cap * 0.9;
  }

  // The column renders one section per resource GROUP (Materials / Goods / Knowledge /
  // Magic), each under its own heading; sections with nothing revealed stay hidden.
  const GROUPS: { id: string; label: string }[] = [
    { id: 'materials', label: 'Materials' },
    { id: 'goods', label: 'Goods' },
    { id: 'wealth', label: 'Wealth' },
    { id: 'knowledge', label: 'Knowledge' },
    { id: 'magic', label: 'Magic' },
    { id: 'prismatic', label: 'Prismatic' },
  ];
  $: shown = $game.resources.filter((r) => r.show);
  $: sections = GROUPS
    .map((g) => ({ ...g, rows: shown.filter((r) => r.group === g.id) }))
    .filter((g) => g.rows.length > 0);
</script>

<div class="left">
  {#each sections as g, i (g.id)}
    <h2 class:mt={i > 0}>{g.label}</h2>
    {#each g.rows as r (r.id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="row" on:mouseenter={(e) => openTip(e, resourceTooltip(r))} on:mouseleave={hideTooltip}>
        <span class="nm" class:mana={r.magic}>{r.label}</span>
        <span class="val">
          <span class="vl" class:amber={nearCap(r)}>
            {fmtHeld(r.amount)}{#if r.capped}<span class="lockt"> / {fmtHeld(r.cap)}</span>{/if}
          </span>
          <span class="rt">{fmtRate(r.rate)}</span>
        </span>
      </div>
    {/each}
  {/each}
</div>

<style>
  /* Grid row: name | value+rate. The name ellipsizes instead of pushing the value
     off the edge, so a narrow column clips the LABEL, never the number. */
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: baseline;
    cursor: help;
    padding: 2px 6px;
    margin: 0 -6px; /* bleed the highlight to the column edges */
    border-radius: 5px;
    transition: background 0.1s;
  }
  .row:hover {
    background: var(--hover);
  }
  .row .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .val {
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .row {
      transition: none;
    }
  }
</style>

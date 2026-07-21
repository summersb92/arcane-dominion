<script lang="ts">
  import { game, openTip, hideTooltip, resourceTooltip } from '../stores';
  import type { ResourceView } from '../stores';
  import { fmt, fmtRate } from '../format';

  // amber when at/above 90% of a finite cap
  function nearCap(r: ResourceView): boolean {
    return r.capped && r.amount >= r.cap * 0.9;
  }

  // Main resources (mundane materials + Research) always in the primary list; Mana is the
  // one "magic" currency, shown under its own heading once revealed.
  $: shown = $game.resources.filter((r) => r.show);
  $: main = shown.filter((r) => !r.magic);
  $: magic = shown.filter((r) => r.magic);
</script>

<div class="left">
  <h2>Resources</h2>
  {#each main as r (r.id)}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="row" on:mouseenter={(e) => openTip(e, resourceTooltip(r))} on:mouseleave={hideTooltip}>
      <span class="nm">{r.label}</span>
      <span>
        <span class="vl" class:amber={nearCap(r)}>
          {fmt(r.amount)}{#if r.capped}<span class="lockt"> / {fmt(r.cap)}</span>{/if}
        </span>
        <span class="rt">{fmtRate(r.rate)}</span>
      </span>
    </div>
  {/each}

  {#if magic.length}
    <h2 class="mt">Magic</h2>
    {#each magic as r (r.id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="row" on:mouseenter={(e) => openTip(e, resourceTooltip(r))} on:mouseleave={hideTooltip}>
        <span class="nm mana">{r.label}</span>
        <span>
          <span class="vl">
            {fmt(r.amount)}{#if r.capped}<span class="lockt"> / {fmt(r.cap)}</span>{/if}
          </span>
          <span class="rt">{fmtRate(r.rate)}</span>
        </span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .row {
    cursor: help;
    padding: 2px 6px;
    margin: 0 -6px; /* bleed the highlight to the column edges */
    border-radius: 5px;
    transition: background 0.1s;
  }
  .row:hover {
    background: var(--hover);
  }
  @media (prefers-reduced-motion: reduce) {
    .row {
      transition: none;
    }
  }
</style>

<script lang="ts">
  import { game, openTip, hideTooltip, resourceTooltip } from '../stores';
  import type { ResourceView } from '../stores';
  import { fmt, fmtRate } from '../format';

  // amber when at/above 90% of a finite cap
  function nearCap(r: ResourceView): boolean {
    return r.capped && r.amount >= r.cap * 0.9;
  }

  // Materials always shown; magic currencies revealed progressively (store `show`).
  $: shown = $game.resources.filter((r) => r.show);
  $: materials = shown.filter((r) => !r.magic);
  $: magic = shown.filter((r) => r.magic);
</script>

<div class="left">
  <h2>Resources</h2>
  {#each materials as r (r.id)}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="row" on:mouseenter={(e) => openTip(e, resourceTooltip(r))} on:mouseleave={hideTooltip}>
      <span class="nm">{r.glyph} {r.label}</span>
      <span>
        <span class="vl" class:amber={nearCap(r)}>
          {fmt(r.amount)}<span class="lockt"> / {fmt(r.cap)}</span>
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
        <span class="nm {r.id === 'mana' ? 'mana' : 'ins'}">{r.glyph} {r.label}</span>
        <span>
          <span class="vl">{fmt(r.amount)}</span>
          <span class="rt">{fmtRate(r.rate)}</span>
        </span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .row {
    cursor: help;
  }
</style>

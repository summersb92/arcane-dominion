<script lang="ts">
  import { game, openTip, hideTooltip, resourceTooltip } from '../stores';
  import { fmt, fmtRate } from '../format';

  // amber when at/above 90% of a cap (spec §3.14 "Caps in the left column")
  $: insightNearCap =
    $game.resources.insight.cap !== undefined &&
    $game.resources.insight.amount >= $game.resources.insight.cap * 0.9;
  $: goldNearCap =
    $game.resources.gold.cap !== undefined &&
    $game.resources.gold.amount >= $game.resources.gold.cap * 0.9;

  // Progressive reveal (v0.1.6): a material row appears only once discovered (ever held > 0),
  // and the "Materials" heading is omitted entirely until at least one is discovered.
  $: d = $game.discovered;
  $: anyMaterial = !!(d.moonpetal || d.ironOre || d.spiritDust || d.scroll);
</script>

<div class="left">
  <h2>Resources</h2>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="row" on:mouseenter={(e) => openTip(e, resourceTooltip('gold', '⦿ Gold'))} on:mouseleave={hideTooltip}>
    <span class="nm g">⦿ Gold</span>
    <span>
      <span class="vl" class:amber={goldNearCap}>
        {fmt($game.resources.gold.amount)}{#if $game.resources.gold.cap !== undefined}<span class="lockt"> / {fmt($game.resources.gold.cap)}</span>{/if}
      </span>
      <span class="rt">{fmtRate($game.resources.gold.rate)}</span>
    </span>
  </div>
  {#if d.insight}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="row" on:mouseenter={(e) => openTip(e, resourceTooltip('insight', '◈ Insight'))} on:mouseleave={hideTooltip}>
      <span class="nm ins">◈ Insight</span>
      <span>
        <span class="vl" class:amber={insightNearCap}>
          {fmt($game.resources.insight.amount)}{#if $game.resources.insight.cap !== undefined}<span class="lockt"> / {fmt($game.resources.insight.cap)}</span>{/if}
        </span>
        <span class="rt">{fmtRate($game.resources.insight.rate)}</span>
      </span>
    </div>
  {/if}
  {#if anyMaterial}
    <h2 class="mt">Materials</h2>
    {#if d.moonpetal}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="mat" on:mouseenter={(e) => openTip(e, resourceTooltip('moonpetal', '⚘ Moonpetal'))} on:mouseleave={hideTooltip}>
        <span>⚘ Moonpetal</span><span>{fmt($game.materials.moonpetal)}</span>
      </div>
    {/if}
    {#if d.ironOre}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="mat" on:mouseenter={(e) => openTip(e, resourceTooltip('ironOre', '⛏ Iron Ore'))} on:mouseleave={hideTooltip}>
        <span>⛏ Iron Ore</span><span>{fmt($game.materials.ironOre)}</span>
      </div>
    {/if}
    {#if d.spiritDust}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="mat" on:mouseenter={(e) => openTip(e, resourceTooltip('spiritDust', '✧ Spirit Dust'))} on:mouseleave={hideTooltip}>
        <span>✧ Spirit Dust</span><span>{fmt($game.materials.spiritDust)}</span>
      </div>
    {/if}
    {#if d.scroll}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="mat" on:mouseenter={(e) => openTip(e, resourceTooltip('scroll', '📜 Scroll'))} on:mouseleave={hideTooltip}>
        <span>📜 Scroll</span><span>{fmt($game.materials.scroll)}</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .row,
  .mat {
    cursor: help;
  }
</style>

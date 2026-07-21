<script lang="ts">
  // Right-rail Settlement summary — population total/idle/cap and the food balance,
  // with a prominent Starving warning when the settlement is losing settlers.
  import { game } from '../stores';
  import { fmtRate } from '../format';

  $: pop = $game.population;
</script>

<div class="settle">
  <h2>Settlement</h2>
  <div class="grid">
    <span class="k">Settlers</span>
    <span class="v">{pop.total} <span class="sep">/</span> {pop.cap}</span>
    <span class="k">Idle</span>
    <span class="v">{pop.idle}</span>
    <span class="k">Food balance</span>
    <span class="v" class:good={pop.foodBalance >= 0} class:bad={pop.foodBalance < 0}>
      {fmtRate(pop.foodBalance) || '0/s'}
    </span>
  </div>
  {#if pop.starving}
    <div class="starve" role="alert">⚠ Starving — settlers are being lost. Boost food or reduce mouths.</div>
  {/if}
</div>

<style>
  .settle {
    margin-bottom: 16px;
    border: 1px solid var(--edge);
    border-radius: 8px;
    background: var(--card);
    padding: 10px 12px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    margin-top: 6px;
  }
  .k {
    color: var(--label);
  }
  .v {
    color: var(--ink);
    text-align: right;
  }
  .sep {
    color: var(--faint);
  }
  .v.good {
    color: var(--ok);
  }
  .v.bad {
    color: var(--life);
  }
  .starve {
    margin-top: 8px;
    padding: 6px 8px;
    border: 1px solid var(--life);
    border-radius: 6px;
    color: var(--life);
    font-size: 11.5px;
    background: color-mix(in srgb, var(--life) 12%, transparent);
  }
</style>

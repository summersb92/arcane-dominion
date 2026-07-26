<script lang="ts">
  import ThemePicker from '../components/ThemePicker.svelte';
  import { game, systemOpen, openTip, hideTooltip, happinessTooltip } from '../stores';
  import { fmtRate } from '../format';

  // Live settlement VITALS from the game store — always on screen, whatever tab is
  // active, so a food crash or unhappiness can't hide on the Jobs tab.
  $: pop = $game.population;
  // The date is hidden until the Calendar tech is researched.
  $: cal = $game.calendar;
</script>

<header>
  <div class="title">ARCANE DOMINION <span class="tag">· v0.1</span></div>
  <div class="who">
    {#if cal.unlocked}
      <span class="cal" title="Day {cal.day} of {cal.season}, Year {cal.year}">
        {cal.season} · Day {cal.day} · Year {cal.year}
      </span>
    {/if}
    <span class="vitals">
      <span>Pop <strong>{pop.total}</strong>/{pop.cap}</span>
      {#if pop.idle > 0}<span>Idle <strong>{pop.idle}</strong></span>{/if}
      <span>
        Food
        <strong class:good={pop.foodBalance >= 0} class:bad={pop.foodBalance < 0}>
          {fmtRate(pop.foodBalance) || '0/s'}
        </strong>
      </span>
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <span
        class="hap"
        on:mouseenter={(e) => openTip(e, happinessTooltip(pop.happiness))}
        on:mouseleave={hideTooltip}
      >
        😊
        <strong class:good={pop.happiness.status === 'content'} class:bad={pop.happiness.status === 'unhappy'}>
          {Math.round(pop.happiness.value)}
        </strong>
      </span>
      {#if pop.starving}<span class="starve">⚠ Starving</span>{/if}
    </span>
    <ThemePicker />
    <button
      type="button"
      class="sysbtn"
      aria-haspopup="dialog"
      title="Save, load & settings"
      on:click={() => systemOpen.set(true)}
    >⚙ Settings</button>
  </div>
</header>

<style>
  .cal {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .vitals {
    display: inline-flex;
    gap: 12px;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .vitals strong {
    color: var(--ink);
  }
  .vitals strong.good {
    color: var(--ok);
  }
  .vitals strong.bad {
    color: var(--life);
  }
  .hap {
    cursor: help;
  }
  .starve {
    color: var(--life);
    font-weight: 600;
  }
  .sysbtn {
    font-family: inherit;
    font-size: 11.5px;
    color: var(--ink);
    background: var(--hover);
    border: 1px solid var(--edge);
    border-radius: 5px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .sysbtn:hover {
    border-color: var(--accent);
  }
  .sysbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>

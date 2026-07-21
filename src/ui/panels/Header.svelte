<script lang="ts">
  import ThemePicker from '../components/ThemePicker.svelte';
  import { game, systemOpen } from '../stores';

  // Live settlement identity from the game store: settler count + housing cap.
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
    <span>{pop.total} settler{pop.total === 1 ? '' : 's'} · cap {pop.cap}</span>
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

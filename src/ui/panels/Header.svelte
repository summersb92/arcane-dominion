<script lang="ts">
  import ThemePicker from '../components/ThemePicker.svelte';
  import { game, systemOpen, openTip, hideTooltip, happinessTooltip } from '../stores';

  // Live settlement VITALS from the game store — always on screen, whatever tab is
  // active, so a food crash or unhappiness can't hide on the Jobs tab.
  $: pop = $game.population;
  // The date is hidden until the Calendar tech is researched.
  $: cal = $game.calendar;
  // The current weather spell — it multiplies food production, so it belongs on screen.
  $: wx = $game.weather;
  /** A glyph per season, keyed by index so it can't drift from CALENDAR.seasons. */
  const SEASON_ICON = ['🌱', '☀️', '🍂', '❄️'];
  /** The swing as a signed percentage, for the weather chip's title. */
  const pct = (n: number): string => `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`;
</script>

<header>
  <div class="title">ARCANE DOMINION <span class="tag">· v0.1</span></div>
  <!-- Centre of the bar: WHEN it is and WHAT the sky is doing — the two things that change
       the food economy out from under you. -->
  <div class="midbar">
    <!-- The SEASON is always on screen. The Calendar tech adds the precise day and year. -->
    <span class="cal" title={cal.unlocked ? `Day ${cal.day} of ${cal.season}, Year ${cal.year}` : cal.season}>
      <span class="sicon" aria-hidden="true">{SEASON_ICON[cal.seasonIndex]}</span>
      {#if cal.unlocked}{cal.season} · Day {cal.day} · Year {cal.year}{:else}{cal.season}{/if}
    </span>
    <span
      class="wx"
      class:good={wx.swing > 0}
      class:bad={wx.swing < 0}
      title="{wx.label} weather — {pct(wx.swing)} food production"
    >
      {wx.label}{#if wx.swing !== 0}<span class="wxpct"> {pct(wx.swing)}</span>{/if}
    </span>
  </div>
  <div class="who">
    <span class="vitals">
      <span>Pop <strong>{pop.total}</strong>/{pop.cap}</span>
      {#if pop.idle > 0}<span>Idle <strong>{pop.idle}</strong></span>{/if}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <span
        class="hap"
        on:mouseenter={(e) => openTip(e, happinessTooltip(pop.happiness))}
        on:mouseleave={hideTooltip}
      >
        <strong class:good={pop.happiness.status === 'content'} class:bad={pop.happiness.status === 'unhappy'}>
          {Math.round(pop.happiness.value)}%
        </strong>
        · Moral
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
  .midbar {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    font-size: 12px;
  }
  .cal {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .sicon {
    font-size: 13px;
    margin-right: 2px;
  }
  /* The weather chip. Neutral by default — fair weather should not shout. */
  .wx {
    color: var(--faint);
    border: 1px solid var(--edge);
    border-radius: 10px;
    padding: 0 7px;
    white-space: nowrap;
    cursor: help;
  }
  .wx.good {
    color: var(--ok);
    border-color: var(--ok);
  }
  .wx.bad {
    color: var(--life);
    border-color: var(--life);
  }
  .wxpct {
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

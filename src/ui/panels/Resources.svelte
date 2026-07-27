<script lang="ts">
  import { game, openTip, hideTooltip, resourceTooltip } from '../stores';
  import type { ResourceView } from '../stores';
  import { fmtHeld, fmtRate } from '../format';

  // amber when at/above 90% of a finite cap
  function nearCap(r: ResourceView): boolean {
    return r.capped && r.amount >= r.cap * 0.9;
  }

  /** A store that is shrinking. This OUTRANKS the near-cap warning everywhere it appears:
   *  a stock running out is the urgent read, and a draining store is heading away from its
   *  ceiling anyway, so the "nearly full" hint would only be noise. */
  function draining(r: ResourceView): boolean {
    return r.rate < 0;
  }

  /** How full the store is, 0..100. Uncapped currencies (mana, culture, gold, prismatic)
   *  have no meaningful fraction, so they get no bar at all. */
  function fillPct(r: ResourceView): number {
    if (!r.capped || !(r.cap > 0)) return 0;
    return Math.max(0, Math.min(100, (r.amount / r.cap) * 100));
  }

  // The column renders one section per resource GROUP (Materials / Goods / Luxury Goods /
  // Knowledge / Magic), each under its own heading; sections with nothing revealed stay hidden.
  const GROUPS: { id: string; label: string }[] = [
    { id: 'materials', label: 'Materials' },
    { id: 'goods', label: 'Goods' },
    { id: 'luxury', label: 'Luxury Goods' },
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
        <!-- Storage gauge: a fill behind the text showing amount / cap at a glance.
             Capped resources only — a currency with no ceiling has no fraction to show. -->
        {#if r.capped}
          <i
            class="fill"
            class:amber={nearCap(r) && !draining(r)}
            class:full={r.atCap && !draining(r)}
            class:drain={draining(r)}
            style="width:{fillPct(r)}%"
          ></i>
        {/if}
        <span class="nm" class:mana={r.magic}>{r.label}</span>
        <span class="val">
          <span class="vl" class:amber={nearCap(r) && !draining(r)} class:drain={draining(r)}>
            {fmtHeld(r.amount)}{#if r.capped}<span class="lockt"> / {fmtHeld(r.cap)}</span>{/if}
          </span>
          <span class="rt" class:drain={draining(r)}>{fmtRate(r.rate)}</span>
        </span>
      </div>
    {/each}
  {/each}
</div>

<style>
  /* Grid row: name | value+rate. The name ellipsizes instead of pushing the value
     off the edge, so a narrow column clips the LABEL, never the number. */
  .row {
    position: relative; /* anchors the storage fill */
    overflow: hidden; /* clip the fill to the row's rounded corners */
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
  /* The storage gauge — sits BEHIND the label and value. */
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 0;
    pointer-events: none;
    border-radius: 5px 0 0 5px;
    background: var(--mtr-bg);
    transition: width 0.25s ease-out;
  }
  .fill.amber,
  .fill.drain {
    background: var(--bar-off);
  }
  /* Tint the gauge where the theme supports mixing, so it reads as a meter rather than a
     block of background: accent while healthy, YELLOW as it nears the ceiling (deeper once
     it's actually full and overflowing), RED whenever the store is draining. */
  @supports (background: color-mix(in srgb, red 10%, transparent)) {
    .fill {
      background: color-mix(in srgb, var(--accent) 16%, transparent);
    }
    .fill.amber {
      background: color-mix(in srgb, var(--gold) 24%, transparent);
    }
    .fill.full {
      background: color-mix(in srgb, var(--gold) 38%, transparent);
    }
    /* Last in the cascade so it wins over amber/full regardless of class order. */
    .fill.drain {
      background: color-mix(in srgb, var(--life) 28%, transparent);
    }
  }
  /* Text rides above the gauge. */
  .row .nm,
  .row .val {
    position: relative;
    z-index: 1;
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
    .row,
    .fill {
      transition: none;
    }
  }
</style>

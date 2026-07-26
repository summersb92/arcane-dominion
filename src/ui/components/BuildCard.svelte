<script lang="ts">
  // One build card. The BUILD BUTTON is a real <button> that covers the ENTIRE card surface
  // (name, count, cost, and the card's own padding) — clicking anywhere on the card builds.
  // Only the converter toggle footer sits outside it, so there is no nested-interactive ARIA
  // problem and a missed stepper click still cannot accidentally build another copy.
  //
  // Regression guard: an earlier version wrapped only the title row, leaving ~70% of the card
  // dead to clicks. Keep the button spanning the whole clickable region.
  import { build, setRecipeActive, openTip, hideTooltip, buildingTooltip } from '../stores';
  import type { BuildingRowView } from '../stores';

  export let b: BuildingRowView;
  export let accent = 'var(--edge)';

  function onBuild(): void {
    if (b.disabled) return;
    hideTooltip();
    build(b.id);
  }
  function toggleRecipe(r: number, delta: number): void {
    hideTooltip();
    setRecipeActive(b.id, r, b.recipes[r].active + delta);
  }
</script>

<div class="tcard bcard" class:cant={!b.affordable && !b.maxed} class:maxed={b.maxed} style="border-left-color:{accent}">
  <button
    class="cardbtn"
    disabled={b.disabled}
    on:click={onBuild}
    on:mouseenter={(e) => openTip(e, buildingTooltip(b))}
    on:focus={(e) => openTip(e, buildingTooltip(b))}
    on:mouseleave={hideTooltip}
    on:blur={hideTooltip}
  >
    <span class="tt">
      <span class="nm">{b.name}</span>
      <span class="chip" class:construct={b.construct}>×{b.count}</span>
    </span>
    <!-- At-a-glance cost. Once one copy stands the price has ESCALATED, so the line says so
         explicitly — the cost shown is always for the NEXT copy, never the base. -->
    <span class="cost" class:short={!b.affordable && !b.maxed}>
      {#if b.count > 0}<span class="nextlbl">next</span> {/if}{b.costText}
    </span>
  </button>
  {#if b.converter && b.count > 0}
    <div class="conv">
      {#if b.recipes.length > 1}<span class="convtot">active {b.active}/{b.count}</span>{/if}
      {#each b.recipes as rc, r (r)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="convrow"
          on:mouseenter={(e) => openTip(e, { title: `${b.name}${b.recipes.length > 1 ? ` · ${rc.label}` : ''}`, sections: [{ label: 'Per active copy', lines: [{ text: rc.hint }] }] })}
          on:mouseleave={hideTooltip}
        >
          {#if b.recipes.length > 1}<span class="convlbl">{rc.label}</span>{/if}
          <button
            class="btn step"
            disabled={rc.active <= 0}
            aria-label="Run one fewer {b.name} ({rc.label})"
            on:click={() => toggleRecipe(r, -1)}
          >−</button>
          <span class="convn">{b.recipes.length > 1 ? rc.active : `active ${rc.active}/${b.count}`}</span>
          <button
            class="btn step"
            disabled={b.active >= b.count}
            aria-label="Run one more {b.name} ({rc.label})"
            on:click={() => toggleRecipe(r, 1)}
          >+</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* The build button covers the WHOLE card. Negative margins pull it out over .tcard's
     7px/10px padding and it re-applies that padding internally, so every pixel of the card
     — including its edges — is a live click target. */
  .cardbtn {
    display: block;
    width: calc(100% + 20px);
    /* .tcard is a flex COLUMN with a min-height, so the button must grow to fill any
       leftover vertical space — otherwise a few pixels at the bottom stay dead to clicks. */
    flex: 1 1 auto;
    margin: -7px -10px;
    padding: 7px 10px;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    background: none;
    border: 0;
    border-radius: 7px;
    cursor: pointer;
    text-align: left;
  }
  /* When a converter footer follows, the button gives back its bottom margin so the divider
     sits correctly. */
  .cardbtn:not(:only-child) {
    margin-bottom: 0;
  }
  .cardbtn .tt {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .cardbtn:disabled {
    cursor: not-allowed;
  }
  .cardbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .cost {
    display: block;
    margin-top: 4px;
    font-size: 11.5px;
    color: var(--faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cost.short {
    color: var(--life);
    opacity: 0.85;
  }
  .nextlbl {
    display: inline-block;
    margin-right: 5px;
    padding: 0 4px;
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--label);
    border: 1px solid var(--edge);
    border-radius: 3px;
    vertical-align: 1px;
  }
  /* Converter toggles — a footer set apart from the build action by a divider. */
  .conv {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
    margin-top: 8px;
    padding-top: 7px;
    border-top: 1px solid var(--edge);
    cursor: default;
  }
  .convrow {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .convtot {
    color: var(--label);
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-align: right;
  }
  .convlbl {
    color: var(--dim);
    font-size: 12px;
    margin-right: auto;
  }
  .convn {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    min-width: 56px;
    text-align: center;
  }
  .step {
    width: 28px;
    text-align: center;
    padding: 2px 0;
    font-size: 14px;
    line-height: 1;
  }
  .step:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>

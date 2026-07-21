<script lang="ts">
  import {
    game,
    activeTab,
    build,
    assignJob,
    unassignJob,
    research,
    openTip,
    hideTooltip,
    buildingTooltip,
    jobTooltip,
    techTooltip,
  } from '../stores';
  import type { BuildingRowView } from '../stores';
  import { fmtRate } from '../format';

  // The whole build card IS the build button: click to raise it (no-op if unbuildable).
  // Cost + description live in the hover tooltip; red text means "can't afford".
  function onBuild(b: BuildingRowView): void {
    if (b.disabled) return;
    hideTooltip();
    build(b.id);
  }
  function onBuildKey(e: KeyboardEvent, b: BuildingRowView): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onBuild(b);
    }
  }

  // Only render buildings the player has unlocked (respect the engine's tech gate).
  $: visibleBuildings = $game.buildings.filter((b) => b.unlocked);
  $: workshops = visibleBuildings.filter((b) => !b.construct);
  $: constructs = visibleBuildings.filter((b) => b.construct);

  // Jobs open only once a workplace grants capacity.
  $: openJobs = $game.jobs.filter((j) => j.capacity > 0);

  // Research: show the reachable frontier (researched or prerequisites met); far-locked
  // nodes stay hidden until their prerequisite lands (keeps the early tree clean).
  $: visibleTech = $game.tech.filter((t) => t.researched || t.available);

  $: pop = $game.population;
</script>

<main>
  {#if $activeTab === 'build'}
    <section>
      <h2>Build</h2>
      <div class="sub">
        Raise structures to house settlers, expand storage, and open workplaces. Costs rise as you build.
      </div>
      {#if workshops.length === 0}
        <div class="empty">Nothing to build yet — gather some wood first.</div>
      {:else}
        <div class="tgrid">
          {#each workshops as b (b.id)}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="tcard bcard"
              class:cant={!b.affordable && !b.maxed}
              class:maxed={b.maxed}
              role="button"
              tabindex={b.disabled ? -1 : 0}
              aria-disabled={b.disabled}
              style="border-left-color:var(--edge)"
              on:click={() => onBuild(b)}
              on:keydown={(e) => onBuildKey(e, b)}
              on:mouseenter={(e) => openTip(e, buildingTooltip(b))}
              on:focus={(e) => openTip(e, buildingTooltip(b))}
              on:mouseleave={hideTooltip}
              on:blur={hideTooltip}
            >
              <div class="tt">
                <span class="nm">{b.name}</span><span class="chip">×{b.count}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if constructs.length}
        <h2 class="mt">Arcane Constructs</h2>
        <div class="sub">Magic labour — production with no settlers and no food, only mana upkeep.</div>
        <div class="tgrid">
          {#each constructs as b (b.id)}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="tcard bcard"
              class:cant={!b.affordable && !b.maxed}
              class:maxed={b.maxed}
              role="button"
              tabindex={b.disabled ? -1 : 0}
              aria-disabled={b.disabled}
              style="border-left-color:var(--mana)"
              on:click={() => onBuild(b)}
              on:keydown={(e) => onBuildKey(e, b)}
              on:mouseenter={(e) => openTip(e, buildingTooltip(b))}
              on:focus={(e) => openTip(e, buildingTooltip(b))}
              on:mouseleave={hideTooltip}
              on:blur={hideTooltip}
            >
              <div class="tt">
                <span class="nm">{b.name}</span><span class="chip construct">×{b.count} · construct</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {:else if $activeTab === 'jobs'}
    <section>
      <h2>Jobs</h2>
      <div class="sub">Assign idle settlers to workplaces. Each worker produces its trade and eats food.</div>
      <div class="popbar">
        <span>Settlers <strong>{pop.total}</strong> / {pop.cap}</span>
        <span>Idle <strong>{pop.idle}</strong></span>
        <span>
          Food
          <strong class:good={pop.foodBalance >= 0} class:bad={pop.foodBalance < 0}>
            {fmtRate(pop.foodBalance) || '0/s'}
          </strong>
        </span>
        {#if pop.starving}<span class="starve">⚠ Starving</span>{/if}
      </div>

      {#if openJobs.length === 0}
        <div class="empty">No jobs yet — build a workplace (e.g. a Woodcutter's Lodge) to open job slots.</div>
      {:else}
        <div class="jobs">
          {#each openJobs as j (j.id)}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="jrow"
              on:mouseenter={(e) => openTip(e, jobTooltip(j))}
              on:mouseleave={hideTooltip}
            >
              <div class="jinfo">
                <span class="nm">{j.name}</span>
                <span class="jmeta">{j.produceText} · eats 🍞 Food {j.foodUpkeep}/s</span>
              </div>
              <div class="jctl">
                <button
                  class="btn step"
                  disabled={!j.canUnassign}
                  aria-label="Unassign a {j.name}"
                  on:click={() => { hideTooltip(); unassignJob(j.id); }}
                >−</button>
                <span class="count">{j.assigned} / {j.capacity}</span>
                <button
                  class="btn step"
                  disabled={!j.canAssign}
                  aria-label="Assign a {j.name}"
                  on:click={() => { hideTooltip(); assignJob(j.id); }}
                >+</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {:else if $activeTab === 'research'}
    <section>
      <h2>Research</h2>
      <div class="sub">Spend research (produced by Scholars) to unlock efficiency, new work, and magic.</div>
      {#if visibleTech.length === 0}
        <div class="empty">No research available yet.</div>
      {:else}
        <div class="tgrid">
          {#each visibleTech as t (t.id)}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="tcard bcard"
              class:done={t.researched}
              style="border-left-color:var(--insight)"
              on:mouseenter={(e) => openTip(e, techTooltip(t))}
              on:mouseleave={hideTooltip}
            >
              <div class="tt">
                <span class="nm">{t.name}</span>
                <span class="chip">{t.researched ? '✓ done' : t.costText}</span>
              </div>
              <div class="io">{t.blurb}</div>
              {#if t.unlocks.length}
                <div class="io unlocks">Unlocks: {t.unlocks.join(', ')}</div>
              {/if}
              {#if !t.researched}
                <button
                  class="btn build"
                  disabled={t.disabled}
                  on:click={() => { hideTooltip(); research(t.id); }}
                >Research</button>
                {#if t.reason && t.reason !== 'researched'}<div class="io warn">{t.reason}</div>{/if}
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</main>

<style>
  .empty {
    color: var(--faint);
    font-size: 12.5px;
    padding: 8px 0;
  }
  .warn {
    color: var(--life);
    font-size: 11px;
  }
  .bcard {
    cursor: help;
  }
  /* Build cards ARE the button: click to build. Cost + description are in the tooltip. */
  .bcard[role='button'] {
    cursor: pointer;
    transition: border-color 0.12s, transform 0.05s;
  }
  .bcard[role='button']:hover {
    border-color: var(--accent);
  }
  .bcard[role='button']:active {
    transform: translateY(1px);
  }
  .bcard[role='button']:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  /* Can't afford → red name (the affordability signal); maxed → dimmed. Both un-clickable. */
  .bcard.cant .nm {
    color: var(--life);
  }
  .bcard.cant,
  .bcard.maxed {
    cursor: not-allowed;
  }
  .bcard.maxed {
    opacity: 0.55;
  }
  .bcard.done {
    opacity: 0.7;
  }
  @media (prefers-reduced-motion: reduce) {
    .bcard[role='button'] {
      transition: none;
    }
  }
  .chip.construct {
    color: var(--mana);
    border-color: var(--mana);
  }
  .unlocks {
    color: var(--dim);
    font-size: 11.5px;
  }
  .build {
    align-self: flex-start;
    margin-top: 4px;
  }
  .build:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  /* Population summary bar */
  .popbar {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 8px 10px;
    margin-bottom: 12px;
    border: 1px solid var(--edge);
    border-radius: 8px;
    background: var(--card);
    font-size: 12.5px;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .popbar strong {
    color: var(--ink);
  }
  .popbar strong.good {
    color: var(--ok);
  }
  .popbar strong.bad {
    color: var(--life);
  }
  .starve {
    color: var(--life);
    font-weight: 600;
  }
  /* Job rows */
  .jobs {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .jrow {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--edge);
    border-radius: 8px;
    background: var(--card);
    cursor: help;
  }
  .jinfo {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .jinfo .nm {
    color: var(--ink);
    font-weight: 600;
    font-size: 12.5px;
  }
  .jmeta {
    color: var(--dim);
    font-size: 11.5px;
  }
  .jctl {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .count {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    min-width: 46px;
    text-align: center;
    font-size: 12.5px;
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

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
  import type { BuildingRowView, TechRowView } from '../stores';
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

  // Research cards mirror the build cards: the whole card is the action. Cost, blurb,
  // unlocks and any reason live in the hover tooltip; a red name means "can't afford".
  function onResearch(t: TechRowView): void {
    if (t.disabled) return;
    hideTooltip();
    research(t.id);
  }
  function onResearchKey(e: KeyboardEvent, t: TechRowView): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onResearch(t);
    }
  }

  // Only render buildings the player has unlocked (respect the engine's tech gate).
  $: visibleBuildings = $game.buildings.filter((b) => b.unlocked);
  $: workshops = visibleBuildings.filter((b) => !b.construct);
  $: constructs = visibleBuildings.filter((b) => b.construct);

  // Jobs open only once a workplace grants capacity.
  $: openJobs = $game.jobs.filter((j) => j.capacity > 0);

  // Research: by default show only what you can research NOW (prereqs met, unresearched);
  // far-locked nodes stay hidden until their prerequisite lands, and researched ones are
  // hidden behind a toggle (default off).
  let showResearched = false;
  $: researchedCount = $game.tech.filter((t) => t.researched).length;
  $: visibleTech = $game.tech.filter((t) => t.available || (showResearched && t.researched));

  $: pop = $game.population;

  function growthLabel(status: string): string {
    switch (status) {
      case 'growing':
        return 'Next settler';
      case 'starving':
        return 'Losing settlers to hunger';
      case 'full':
        return 'Housing full — build a House';
      case 'unhappy':
        return 'Growth paused — settlement is unhappy';
      default:
        return 'Growth paused — needs a food surplus';
    }
  }
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
      <h2>{$game.population.name}</h2>
      <div class="sub">Assign idle settlers to workplaces. Each worker produces its trade; only settlers eat food.</div>
      <div class="jobscols">
        <div class="jobscol">
          <!-- Prominent, always-present Population readout: the next-settler progress bar
               fills while growing (with %), or names the paused reason when it can't grow. -->
          <div
            class="growth"
            class:paused={pop.growth.status !== 'growing' && pop.growth.status !== 'starving'}
            title="Progress toward the next settler"
          >
            <div class="ghead">
              <span class="gtitle">Population</span>
              <span class="gcount"><strong>{pop.total}</strong> / {pop.cap} settlers</span>
            </div>
            <div class="glabel">
              <span>{growthLabel(pop.growth.status)}</span>
              {#if pop.growth.status === 'growing' || pop.growth.status === 'starving'}
                <span class="gpct">{Math.round(pop.growth.progress * 100)}%</span>
              {/if}
            </div>
            <div
              class="gbar"
              class:grow={pop.growth.status === 'growing'}
              class:starve={pop.growth.status === 'starving'}
            >
              <i style="width:{Math.round(pop.growth.progress * 100)}%"></i>
            </div>
          </div>

          <div class="popbar">
            <span>Settlers <strong>{pop.total}</strong> / {pop.cap}</span>
            <span>Idle <strong>{pop.idle}</strong></span>
            <span>
              Food
              <strong class:good={pop.foodBalance >= 0} class:bad={pop.foodBalance < 0}>
                {fmtRate(pop.foodBalance) || '0/s'}
              </strong>
            </span>
            <span title={pop.happiness.breakdown.map((b) => `${b.label}: ${b.amount >= 0 ? '+' : ''}${b.amount}`).join('\n')}>
              Happiness
              <strong class:good={pop.happiness.status === 'content'} class:bad={pop.happiness.status === 'unhappy'}>
                {Math.round(pop.happiness.value)} · {pop.happiness.status}
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
                  <span class="nm">{j.name}</span>
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
        </div>

        <div class="jobscol">
          <div class="card govcard">
            <h2>Government</h2>
            <div class="govnote">Policies &amp; decrees — coming soon.</div>
          </div>
        </div>
      </div>
    </section>
  {:else if $activeTab === 'research'}
    <section>
      <div class="rhead">
        <h2>Research</h2>
        {#if researchedCount > 0}
          <button
            class="toggle"
            class:on={showResearched}
            aria-pressed={showResearched}
            on:click={() => (showResearched = !showResearched)}
          >{showResearched ? 'Hide' : 'Show'} researched ({researchedCount})</button>
        {/if}
      </div>
      <div class="sub">Spend research to unlock efficiency, new work, and magic. Only what you can research now is shown.</div>
      {#if visibleTech.length === 0}
        <div class="empty">
          {researchedCount > 0 && !showResearched
            ? 'Nothing new to research right now.'
            : 'No research available yet.'}
        </div>
      {:else}
        <div class="tgrid">
          {#each visibleTech as t (t.id)}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="tcard bcard"
              class:cant={!t.affordable && !t.researched}
              class:done={t.researched}
              role="button"
              tabindex={t.disabled ? -1 : 0}
              aria-disabled={t.disabled}
              style="border-left-color:var(--insight)"
              on:click={() => onResearch(t)}
              on:keydown={(e) => onResearchKey(e, t)}
              on:mouseenter={(e) => openTip(e, techTooltip(t))}
              on:focus={(e) => openTip(e, techTooltip(t))}
              on:mouseleave={hideTooltip}
              on:blur={hideTooltip}
            >
              <div class="tt">
                <span class="nm">{t.name}</span>
                {#if t.researched}<span class="chip">✓</span>{/if}
              </div>
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
  .rhead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .toggle {
    font-family: inherit;
    font-size: 11.5px;
    color: var(--dim);
    background: var(--hover);
    border: 1px solid var(--edge);
    border-radius: 5px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .toggle:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .toggle.on {
    color: var(--ink);
    border-color: var(--accent);
  }
  .toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
  /* Jobs tab: assignment list on the left, Government scaffold on the right.
     Stacks to one column on narrow widths (matches the app's 860px feel). */
  .jobscols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 720px) {
    .jobscols {
      grid-template-columns: 1fr;
    }
  }
  .jobscol {
    min-width: 0;
  }
  .govcard {
    margin-top: 0;
  }
  .govcard h2 {
    margin-bottom: 6px;
  }
  .govnote {
    color: var(--faint);
    font-size: 12.5px;
  }
  /* Next-settler progress — a prominent, always-present Population readout at the top of
     the settlement tab. */
  .growth {
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid var(--edge);
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    background: var(--card);
  }
  .growth.paused {
    border-left-color: var(--faint);
  }
  .ghead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .gtitle {
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--label);
  }
  .gcount {
    font-size: 12.5px;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .gcount strong {
    color: var(--ink);
  }
  .glabel {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--dim);
    margin-bottom: 5px;
  }
  .glabel .gpct {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .gbar {
    height: 10px;
    border-radius: 5px;
    background: var(--mtr-bg);
    overflow: hidden;
  }
  .gbar i {
    display: block;
    height: 100%;
    background: var(--bar-off);
    transition: width 0.2s;
  }
  .gbar.grow i {
    background: var(--ok);
  }
  .gbar.starve i {
    background: var(--life);
  }
  @media (prefers-reduced-motion: reduce) {
    .gbar i {
      transition: none;
    }
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
  .jrow .nm {
    color: var(--ink);
    font-weight: 600;
    font-size: 13px;
    min-width: 0;
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

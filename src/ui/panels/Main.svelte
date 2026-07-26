<script lang="ts">
  import {
    game,
    activeTab,
    assignJob,
    unassignJob,
    research,
    openTip,
    hideTooltip,
    jobTooltip,
    techTooltip,
    happinessTooltip,
    growthTooltip,
  } from '../stores';
  import type { BuildingRowView, TechRowView } from '../stores';
  import BuildCard from '../components/BuildCard.svelte';
  import { fmt, fmtRate } from '../format';

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

  // Build tab: unlocked buildings grouped under category headings (the ~30-card wall,
  // sectioned). Constructs keep their own "Arcane Constructs" section below.
  const CATEGORIES: { id: BuildingRowView['category']; label: string }[] = [
    { id: 'housing', label: 'Housing' },
    { id: 'storage', label: 'Storage' },
    { id: 'production', label: 'Production' },
    { id: 'science', label: 'Science' },
    { id: 'civic', label: 'Civic' },
    { id: 'industry', label: 'Industry' },
  ];
  $: visibleBuildings = $game.buildings.filter((b) => b.unlocked);
  $: workshops = visibleBuildings.filter((b) => !b.construct);
  $: buildSections = CATEGORIES
    .map((c) => ({ ...c, cards: workshops.filter((b) => b.category === c.id) }))
    .filter((c) => c.cards.length > 0);
  $: constructs = visibleBuildings.filter((b) => b.construct);

  // Jobs open only once a workplace grants capacity.
  $: openJobs = $game.jobs.filter((j) => j.capacity > 0);

  // Research: available techs sorted cheapest-first (a shopping list), researched ones
  // in their own dimmed section behind a toggle (default off).
  let showResearched = false;
  $: researchedCount = $game.tech.filter((t) => t.researched).length;
  $: availableTech = $game.tech.filter((t) => t.available).sort((a, b) => a.cost - b.cost);
  $: researchedTech = showResearched ? $game.tech.filter((t) => t.researched) : [];

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
      {#if buildSections.length === 0}
        <div class="empty">Nothing to build yet — gather some wood first.</div>
      {:else}
        {#each buildSections as sec (sec.id)}
          <h3 class="cat">{sec.label}</h3>
          <div class="tgrid">
            {#each sec.cards as b (b.id)}
              <BuildCard {b} />
            {/each}
          </div>
        {/each}
      {/if}

      {#if constructs.length}
        <h2 class="mt">Arcane Constructs</h2>
        <div class="sub">Magic labour — production with no settlers and no food, only mana upkeep.</div>
        <div class="tgrid">
          {#each constructs as b (b.id)}
            <BuildCard {b} accent="var(--mana)" />
          {/each}
        </div>
      {/if}
    </section>
  {:else if $activeTab === 'jobs'}
    <section>
      <h2>{$game.population.name}</h2>
      <div class="sub">Assign idle settlers to workplaces. Each worker produces its trade; only settlers eat food.</div>

      <!-- Prominent, always-present Population readout: the next-settler progress bar
           fills while growing (with %), or names the paused reason when it can't grow. -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="growth"
        class:paused={pop.growth.status !== 'growing' && pop.growth.status !== 'starving'}
        on:mouseenter={(e) => openTip(e, growthTooltip(pop.growth))}
        on:mouseleave={hideTooltip}
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
        <span>Population <strong>{pop.total}</strong> / {pop.cap}</span>
        <span>Idle <strong>{pop.idle}</strong></span>
        <span>
          Food
          <strong class:good={pop.foodBalance >= 0} class:bad={pop.foodBalance < 0}>
            {fmtRate(pop.foodBalance) || '0/s'}
          </strong>
        </span>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span class="hap" on:mouseenter={(e) => openTip(e, happinessTooltip(pop.happiness))} on:mouseleave={hideTooltip}>
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
      <div class="sub">Spend research to unlock efficiency, new work, and magic. Cheapest first.</div>
      {#if availableTech.length === 0}
        <div class="empty">Nothing new to research right now.</div>
      {:else}
        <div class="tgrid">
          {#each availableTech as t (t.id)}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="tcard bcard"
              class:cant={!t.affordable}
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
                <span class="chip">{fmt(t.cost)}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if researchedTech.length}
        <h3 class="cat">Researched</h3>
        <div class="tgrid done-grid">
          {#each researchedTech as t (t.id)}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="tcard bcard done"
              style="border-left-color:var(--insight)"
              on:mouseenter={(e) => openTip(e, techTooltip(t))}
              on:mouseleave={hideTooltip}
            >
              <div class="tt">
                <span class="nm">{t.name}</span>
                <span class="chip">✓</span>
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
  .cat {
    margin: 14px 0 2px;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--label);
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
  /* Research cards ARE the action: click to research. Details live in the tooltip. */
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
  /* Can't afford → red name; researched → dimmed. */
  .bcard.cant .nm {
    color: var(--life);
  }
  .bcard.cant {
    cursor: not-allowed;
  }
  .bcard.done {
    opacity: 0.7;
    cursor: help;
  }
  @media (prefers-reduced-motion: reduce) {
    .bcard[role='button'] {
      transition: none;
    }
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
    cursor: help;
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
  .popbar .hap {
    cursor: help;
  }
  .starve {
    color: var(--life);
    font-weight: 600;
  }
  /* Job rows — full width now (the Government stub no longer takes half the pane). */
  .jobs {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 560px;
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

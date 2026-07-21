<script lang="ts">
  // Home tab (spec §3.10 / §5, v0.1.1 rewrite). The lair is no longer build-tasks
  // ("fixtures") — it is a HOUSING TIER (sets item slots, may carry rent/innate bonuses)
  // plus EQUIPPABLE ITEMS. This panel is driven entirely off the `home` view-model from
  // the store (tiers[] + items[]); it does not re-implement any gating logic. The
  // Founding still lives here as normal home-panel tasks (panel:'home').
  import {
    game,
    activeTab,
    dispatchTask,
    moveHome,
    buyItem,
    equipItem,
    unequipItem,
    openTip,
    hideTooltip,
    taskTooltip,
    homeTierTooltip,
    homeItemTooltip,
  } from '../stores';
  import type { TaskView } from '../stores';
  import { fmt } from '../format';
  import { SHOW_FOUNDING } from '../../content/config';

  function onKey(e: KeyboardEvent, t: TaskView): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!t.locked) dispatchTask(t);
    }
  }

  $: home = $game.home;
  $: homeTasks = $game.tasks.filter((t) => t.panel === 'home');
  $: active = homeTasks.filter((t) => t.active);
  // The Founding is the always-visible finale — keep all its cards, not just revealed.
  $: founding = homeTasks.filter((t) => !t.active && t.group === 'Founding');
  $: f = $game.founding;
  $: slotFree = home.used < home.slots;
</script>

<section>
  <h2>Home · The Lair</h2>
  <div class="sub">
    Your dwelling and belongings. Move up through housing tiers for more item slots, and equip items for
    passive bonuses.
  </div>

  <!-- Current residence -->
  <div class="card residence">
    <div class="tt">
      <span class="nm">{home.name}</span>
      <span class="chip">slots {home.used} / {home.slots}</span>
    </div>
    <div class="io blurb">{home.blurb}</div>
  </div>

  <!-- Housing tiers -->
  <h2 class="mt">Residence <span class="tag" style="font-weight:400">· move for more item slots</span></h2>
  <div class="hgrid">
    {#each home.tiers as t (t.id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="hcard"
        class:current={t.current}
        class:dimmed={t.locked}
        on:mouseenter={(e) => openTip(e, homeTierTooltip(t))}
        on:mouseleave={hideTooltip}
      >
        <div class="tt">
          <span class="nm">{#if t.current}★ {/if}{t.name}</span>
          <span class="chip">{t.slots} slots</span>
        </div>
        <div class="io">Cost: {t.cost}</div>
        {#if t.current}
          <div class="io state cur">You live here</div>
        {:else if t.locked}
          <div class="io lockt">{t.reason ?? 'locked'}</div>
        {/if}
        <button
          class="btn"
          disabled={t.current || t.locked || !t.reachable}
          title={t.current ? 'Current residence' : t.locked ? (t.reason ?? 'locked') : `Move to ${t.name}`}
          on:click={() => moveHome(t.id)}
          on:focus={(e) => openTip(e, homeTierTooltip(t))}
          on:blur={hideTooltip}
        >{t.current ? 'Current' : 'Move in'}</button>
      </div>
    {/each}
  </div>

  <!-- Equippable items -->
  <h2 class="mt">
    Items
    <span class="tag" style="font-weight:400"
      >· buy once — gear equips on the Player tab; furnishings use home slots ({home.used}/{home.slots} used)</span
    >
  </h2>
  <div class="hgrid">
    {#each home.items as it (it.id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="hcard"
        class:equipped={it.equipped}
        class:dimmed={it.locked && !it.owned}
        on:mouseenter={(e) => openTip(e, homeItemTooltip(it))}
        on:mouseleave={hideTooltip}
      >
        <div class="tt">
          <span class="nm">{it.name}</span>
          {#if it.equipped}
            <span class="chip on">equipped</span>
          {:else if it.owned}
            <span class="chip">owned</span>
          {/if}
        </div>
        <div class="io mods">{it.modsSummary}</div>
        {#if !it.owned}
          <div class="io">Cost: {it.cost}</div>
        {/if}
        {#if it.locked && !it.owned}
          <div class="io lockt">{it.reason ?? 'locked'}</div>
        {/if}
        <div class="hactions">
          {#if !it.owned}
            <button
              class="btn"
              disabled={!it.affordable || it.locked}
              title={it.locked ? (it.reason ?? 'locked') : !it.affordable ? "Can't afford" : `Buy ${it.name}`}
              on:click={() => buyItem(it.id)}
              on:focus={(e) => openTip(e, homeItemTooltip(it))}
              on:blur={hideTooltip}
            >Buy</button>
          {:else if it.gear}
            <!-- Gear (paper doll) is equipped on the Player tab — the generic equip path rejects it. -->
            <button class="link" type="button" on:click={() => activeTab.set('player')}>
              {it.equipped ? 'Manage on the Player tab →' : 'Equip on the Player tab →'}
            </button>
          {:else if it.equipped}
            <button
              class="btn"
              title={`Unequip ${it.name}`}
              on:click={() => unequipItem(it.id)}
              on:focus={(e) => openTip(e, homeItemTooltip(it))}
              on:blur={hideTooltip}
            >Unequip</button>
          {:else}
            <button
              class="btn"
              disabled={!slotFree}
              title={slotFree ? `Equip ${it.name}` : 'No free slot — unequip something or move to a larger residence'}
              on:click={() => equipItem(it.id)}
              on:focus={(e) => openTip(e, homeItemTooltip(it))}
              on:blur={hideTooltip}
            >Equip</button>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- The Founding: hidden until unveiled (~Act 4) — see SHOW_FOUNDING. -->
  {#if SHOW_FOUNDING}
  <h2 class="mt">The Founding</h2>
  <div class="card found" class:done={f.founded}>
    <div class="tt">
      <span class="nm">The Founding</span>
      <span class="chip">{f.founded ? 'complete ★' : `${f.metCount}/${f.total} ready`}</span>
    </div>
    {#if f.founded}
      <div class="io big">Your Academy stands. Act II — students, faculty, the Research web — arrives in v0.2.</div>
    {:else}
      <div class="io">Meet all four to found your Academy:</div>
      <ul class="reqs">
        {#each f.reqs as r}
          <li class:met={r.met}>
            <span class="mark">{r.met ? '✓' : '○'}</span>
            <span class="rl">{r.label}</span>
            <span class="rd">
              {#if r.have !== undefined && r.need !== undefined}
                {fmt(r.have)} / {fmt(r.need)}
              {:else}
                {r.note}
              {/if}
            </span>
          </li>
        {/each}
      </ul>
      {#if f.canFound}
        <div class="io ready">All requirements met — begin “Found the Academy” below.</div>
      {/if}
    {/if}
  </div>

  {#if active.length > 0}
    <h2 class="mt">
      In progress — slots {$game.slots.used} / {$game.slots.total}
      <span class="tag" style="font-weight:400">(click to stop)</span>
    </h2>
    <div class="tgrid">
      {#each active as t (t.id)}
        <div
          class="tcard active"
          class:paused={t.paused}
          role="button"
          tabindex="0"
          title="Click to stop"
          style="border-left-color:var(--{t.cls})"
          on:click={() => { hideTooltip(); dispatchTask(t); }}
          on:keydown={(e) => onKey(e, t)}
          on:mouseenter={(e) => openTip(e, taskTooltip(t))}
          on:focus={(e) => openTip(e, taskTooltip(t))}
          on:mouseleave={hideTooltip}
          on:blur={hideTooltip}
        >
          <div class="tt"><span class="nm">{t.name}</span><span class="chip">{t.kind}</span></div>
          {#if t.timed}
            <div class="mtr"><i style="width:{Math.round(t.progress * 100)}%;background:var(--{t.cls})"></i></div>
          {/if}
          <div class="io tag">{t.tag}</div>
          <div class="io">{t.io}</div>
          <div class="io payoff">{t.payoff}</div>
        </div>
      {/each}
    </div>
  {/if}

  <h2 class="mt">
    Found the Academy <span class="tag" style="font-weight:400">· acquire a Charter &amp; Site, then found</span>
  </h2>
  <div class="tgrid">
    {#each founding as t (t.id)}
      <div
        class="tcard"
        class:locked={t.locked}
        class:cant={!t.locked && !t.startable}
        role="button"
        tabindex={t.locked ? -1 : 0}
        aria-disabled={t.locked}
        title={t.locked ? 'Requirements unmet' : 'Click to begin'}
        style="border-left-color:var(--{t.cls})"
        on:click={() => { hideTooltip(); dispatchTask(t); }}
        on:keydown={(e) => onKey(e, t)}
        on:mouseenter={(e) => openTip(e, taskTooltip(t))}
        on:focus={(e) => openTip(e, taskTooltip(t))}
        on:mouseleave={hideTooltip}
        on:blur={hideTooltip}
      >
        <div class="tt">
          <span class="nm">{#if t.locked}🔒 {/if}{t.name}</span><span class="chip">{t.kind}</span>
        </div>
        <div class="io tag">{t.tag}</div>
        {#if t.locked}
          <div class="io lockt">{t.lockText ?? ''}</div>
        {:else}
          <div class="io">{t.io}</div>
          <div class="io payoff" class:cantpay={!t.affordable}>
            {t.payoff}{#if !t.affordable} · can't afford{/if}
          </div>
          {#if t.slotNote}<div class="io warn">{t.slotNote}</div>{/if}
        {/if}
      </div>
    {/each}
  </div>
  {/if}
</section>

<style>
  .residence .blurb {
    color: var(--dim);
    margin-top: 4px;
  }
  /* Home cards (tiers + items): mirror the .tcard look but hold their own buttons,
     so the card itself is not a click target. All colour via tokens. */
  .hgrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 10px;
    margin-top: 6px;
  }
  .hcard {
    border: 1px solid var(--edge);
    border-radius: 8px;
    padding: 9px 10px;
    background: var(--card);
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: 96px;
  }
  .hcard.current {
    border-color: var(--accent);
    background: var(--card-active);
  }
  .hcard.equipped {
    border-left: 3px solid var(--ok);
  }
  .hcard .tt {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    align-items: baseline;
  }
  .hcard .nm {
    color: var(--ink);
    font-weight: 600;
    font-size: 12.5px;
  }
  .hcard .io {
    color: var(--dim);
    font-size: 12px;
  }
  .hcard .mods {
    color: var(--ok);
    font-size: 11px;
  }
  .hcard .state.cur {
    color: var(--accent);
  }
  .hactions {
    display: flex;
    gap: 6px;
    margin-top: auto;
    padding-top: 4px;
  }
  .chip.on {
    color: var(--ok);
    border-color: var(--ok);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: var(--edge);
  }
  /* Gear cards point to the Player tab for equipping (no generic equip control here). */
  .link {
    padding: 0;
    background: none;
    border: 0;
    color: var(--accent);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }
  .link:hover {
    text-decoration: underline;
  }
  .link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  /* --- Founding card (unchanged from the previous Home layout) --- */
  .found {
    border-left: 3px solid var(--renown);
  }
  .found.done {
    border-left-color: var(--ok);
  }
  .found .big {
    color: var(--renown);
    margin-top: 4px;
  }
  .found .ready {
    color: var(--ok);
    margin-top: 6px;
  }
  ul.reqs {
    list-style: none;
    padding: 0;
    margin: 6px 0 0;
  }
  ul.reqs li {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 12.5px;
    padding: 1px 0;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  ul.reqs li.met {
    color: var(--ink);
  }
  ul.reqs .mark {
    color: var(--faint);
    width: 1em;
  }
  ul.reqs li.met .mark {
    color: var(--ok);
  }
  ul.reqs .rl {
    flex: 1;
  }
  ul.reqs .rd {
    color: var(--label);
  }
  .payoff {
    color: var(--ok);
    font-size: 11px;
  }
  .payoff.cantpay {
    color: var(--faint);
  }
  .warn {
    color: var(--life);
    font-size: 11px;
  }
  .tcard.cant {
    opacity: 0.85;
  }
</style>

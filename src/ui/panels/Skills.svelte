<script lang="ts">
  import { game, learnCantrip } from '../stores';
  import type { CantripView } from '../stores';

  function onLearn(c: CantripView): void {
    if (c.learnable) learnCantrip(c.id);
  }
  function onKey(e: KeyboardEvent, c: CantripView): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onLearn(c);
    }
  }

  $: owned = $game.cantrips.filter((c) => c.status === 'owned');
  $: available = $game.cantrips.filter((c) => c.status === 'available');
  $: locked = $game.cantrips.filter((c) => c.status === 'locked');
</script>

<section>
  <h2>Skills · Cantrips</h2>
  <div class="sub">
    Spend ◈ Insight to learn cantrips. Each needs its prerequisites first; awakening an element starts that
    essence's trickle. Every cantrip past the opener also costs a 📜 Scroll. A cost marked
    <span class="cap">*</span> exceeds your Insight Max.
  </div>

  {#if owned.length > 0}
    <h2 class="mt">Known</h2>
    <div class="tgrid">
      {#each owned as c (c.id)}
        <div class="tcard active" style="border-left-color:var(--{c.cls})">
          <div class="tt"><span class="nm">{c.name}</span><span class="chip">learned ✓</span></div>
          <div class="io blurb">{c.blurb}</div>
          <div class="io payoff">{c.effectText}</div>
        </div>
      {/each}
    </div>
  {/if}

  <h2 class="mt">Available <span class="tag" style="font-weight:400">· click a card to learn it</span></h2>
  <div class="tgrid">
    {#each available as c (c.id)}
      <div
        class="tcard"
        class:cant={!c.learnable}
        role="button"
        tabindex="0"
        title={c.capNote ?? (c.learnable ? 'Click to learn' : 'Not enough Insight')}
        style="border-left-color:var(--{c.cls})"
        on:click={() => onLearn(c)}
        on:keydown={(e) => onKey(e, c)}
      >
        <div class="tt">
          <span class="nm">{c.name}</span>
          <span class="costs">
            <span class="chip cost">{c.cost}{#if c.capMark}<span class="cap">{c.capMark}</span>{/if}</span>
            {#if c.scrollCost > 0}
              <span class="chip scroll" class:need={!c.hasScroll}>📜 {c.scrollCost}</span>
            {/if}
          </span>
        </div>
        <div class="io blurb">{c.blurb}</div>
        <div class="io payoff" class:cantpay={!c.affordable}>
          {c.effectText}{#if c.capMark} · exceeds Insight Max{:else if !c.hasScroll} · needs a 📜 Scroll{:else if !c.affordable} · need more ◈{/if}
        </div>
      </div>
    {/each}
    {#if available.length === 0}
      <div class="sub">No cantrips ready — learn a prerequisite first.</div>
    {/if}
  </div>

  {#if locked.length > 0}
    <h2 class="mt">Locked</h2>
    <div class="tgrid">
      {#each locked as c (c.id)}
        <div class="tcard locked" style="border-left-color:var(--{c.cls})" title={c.capNote ?? 'Requirements unmet'}>
          <div class="tt">
            <span class="nm">🔒 {c.name}</span>
            <span class="costs">
              <span class="chip cost">{c.cost}{#if c.capMark}<span class="cap">{c.capMark}</span>{/if}</span>
              {#if c.scrollCost > 0}
                <span class="chip scroll">📜 {c.scrollCost}</span>
              {/if}
            </span>
          </div>
          <div class="io lockt">{c.prereqNote ?? ''}</div>
          <div class="io payoff">{c.effectText}</div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .blurb {
    color: var(--dim);
    font-size: 11.5px;
  }
  .payoff {
    color: var(--ok);
    font-size: 11px;
  }
  .payoff.cantpay {
    color: var(--faint);
  }
  .costs {
    display: inline-flex;
    gap: 4px;
    align-items: baseline;
  }
  .cost {
    color: var(--insight);
  }
  .scroll {
    color: var(--dim);
  }
  /* Not enough Scrolls on hand → the requirement reads as unmet. */
  .scroll.need {
    color: var(--life);
    border-color: var(--life);
  }
  .cap {
    color: var(--gold);
    font-weight: 700;
  }
  .tcard.cant {
    opacity: 0.85;
  }
</style>

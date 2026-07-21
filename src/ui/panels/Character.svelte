<script lang="ts">
  import { game, openTip, hideTooltip, vitalTooltip, essenceTooltip } from '../stores';
  import { fmt, fmtRate } from '../format';

  function pct(cur: number, max: number): number {
    return max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  }
</script>

<div class="char">
  <h2>Character</h2>

  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="row" on:mouseenter={(e) => openTip(e, vitalTooltip('life', '✚ Life', 'life'))} on:mouseleave={hideTooltip}>
    <span class="nm life">✚ Life</span>
    <span>
      <span class="vl">{fmt($game.vitals.life.cur)} / {fmt($game.vitals.life.max)}</span>
      <span class="rt reg">{fmtRate($game.vitals.life.regen)}</span>
    </span>
  </div>
  <div class="mtr"><i style="width:{pct($game.vitals.life.cur, $game.vitals.life.max)}%;background:var(--life)"></i></div>

  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="row" on:mouseenter={(e) => openTip(e, vitalTooltip('stamina', '⚡ Stamina', 'stam'))} on:mouseleave={hideTooltip}>
    <span class="nm stam">⚡ Stamina</span>
    <span>
      <span class="vl">{fmt($game.vitals.stamina.cur)} / {fmt($game.vitals.stamina.max)}</span>
      <span class="rt reg">{fmtRate($game.vitals.stamina.regen)}</span>
    </span>
  </div>
  <div class="mtr"><i style="width:{pct($game.vitals.stamina.cur, $game.vitals.stamina.max)}%;background:var(--stam)"></i></div>

  {#if $game.vitals.mana.max > 0}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="row" on:mouseenter={(e) => openTip(e, vitalTooltip('mana', '✦ Mana', 'mana'))} on:mouseleave={hideTooltip}>
      <span class="nm mana">✦ Mana</span>
      <span>
        <span class="vl">{fmt($game.vitals.mana.cur)} / {fmt($game.vitals.mana.max)}</span>
        <span class="rt reg">{fmtRate($game.vitals.mana.regen)}</span>
      </span>
    </div>
    <div class="mtr"><i style="width:{pct($game.vitals.mana.cur, $game.vitals.mana.max)}%;background:var(--mana)"></i></div>
  {/if}

  <h2 class="mt">Attributes</h2>
  {#each $game.player.attributes as a (a.key)}
    <div class="row" title={a.hint}>
      <span class="nm">{a.glyph} {a.label}</span>
      <span><span class="vl">×{a.value.toFixed(2)}</span></span>
    </div>
  {/each}

  {#if $game.essence.some((e) => e.awakened)}
    <h2 class="mt">Essence</h2>
    {#each $game.essence.filter((e) => e.awakened) as e (e.id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="row ess" on:mouseenter={(ev) => openTip(ev, essenceTooltip(e))} on:mouseleave={hideTooltip}>
        <span class="essnm {e.cls}"><span class="dot {e.cls}"></span>{e.glyph} {e.label}</span>
        <span>
          <span class="vl">{fmt(e.amount)}</span>
          <span class="rt">{fmtRate(e.rate)}</span>
        </span>
      </div>
    {/each}

    <h2 class="mt">Opposed pairs</h2>
    <div class="chron">Fire ↔ Water · Earth ↔ Air · Light ↔ Dark<br />Balance all six → ❖ Prismatic.</div>
  {/if}
</div>

<style>
  .reg {
    color: var(--faint);
  }
  .row,
  .row.ess {
    cursor: help;
  }
  /* Essence rows are colour-coded by element. The name span carries the element class
     (.fire/.water/… map to tokens in app.css), so its text + the swatch pick up the
     element colour; the dot fills from currentColor so it works in all three themes. */
  .essnm {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-weight: 600;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: currentColor;
    flex: none;
    box-shadow: 0 0 0 1px var(--edge);
  }
</style>

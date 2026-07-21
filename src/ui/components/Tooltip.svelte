<script lang="ts">
  // The single global tooltip (v0.1.1). Rendered ONCE at the top level of App.svelte —
  // OUTSIDE the overflow:auto columns — so it is never clipped by a scrolling panel.
  // Driven entirely by the `tooltip` store: cards/rows set structured content + an anchor
  // rect on hover/focus; this element positions itself (prefer below the anchor, flip above
  // or clamp when it would leave the viewport). position:fixed, high z-index, pointer-events:none.
  import { afterUpdate } from 'svelte';
  import { tooltip } from '../stores';

  let el: HTMLDivElement | null = null;
  let left = 0;
  let top = 0;

  const M = 8; // viewport margin
  const GAP = 8; // gap between anchor and tooltip

  afterUpdate(() => {
    const { visible, anchor } = $tooltip;
    if (!visible || !el || !anchor) return;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let l = anchor.left;
    if (l + tw > vw - M) l = vw - M - tw;
    if (l < M) l = M;

    let t = anchor.bottom + GAP; // prefer below the anchor
    if (t + th > vh - M) t = anchor.top - th - GAP; // not enough room → flip above
    if (t < M) t = M;

    // Assign only on change so afterUpdate settles after one reflow (no loop).
    if (Math.abs(l - left) > 0.5) left = l;
    if (Math.abs(t - top) > 0.5) top = t;
  });
</script>

{#if $tooltip.visible && $tooltip.content}
  {@const c = $tooltip.content}
  <div class="tip" bind:this={el} style="left:{left}px; top:{top}px" role="tooltip" aria-hidden="true">
    <div class="tip-title" style={c.titleCls ? `color:var(--${c.titleCls})` : ''}>{c.title}</div>

    {#if c.sections.length}
      <div class="tip-grid">
        {#each c.sections as s}
          <div class="tip-label">{s.label}</div>
          <div class="tip-lines">
            {#each s.lines as ln}
              <div class="tip-line {ln.cls ?? ''}">{ln.text}</div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    {#if c.empty}
      <div class="tip-empty">{c.empty}</div>
    {/if}

    {#if c.net}
      <div class="tip-net">
        <span class="tip-label">Net</span>
        <span class="tip-line {c.net.cls ?? ''}">{c.net.text}</span>
      </div>
    {/if}

    {#if c.note}
      <div class="tip-note">{c.note}</div>
    {/if}

    {#if c.blurb}
      <div class="tip-blurb">{c.blurb}</div>
    {/if}
  </div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
    max-width: 300px;
    padding: 9px 11px;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 8px;
    box-shadow: 0 10px 30px #0007;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    line-height: 1.45;
  }
  .tip-title {
    font-weight: 600;
    font-size: 12.5px;
    margin-bottom: 5px;
    color: var(--ink);
  }
  .tip-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    align-items: baseline;
  }
  .tip-label {
    color: var(--label);
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .tip-lines {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .tip-line {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .tip-line.ok {
    color: var(--ok);
  }
  .tip-line.life {
    color: var(--life);
  }
  .tip-net {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: baseline;
    margin-top: 6px;
    padding-top: 5px;
    border-top: 1px solid var(--edge);
  }
  .tip-empty {
    color: var(--dim);
  }
  .tip-note {
    color: var(--gold);
    font-size: 11px;
    margin-top: 5px;
  }
  .tip-blurb {
    color: var(--faint);
    font-style: italic;
    margin-top: 6px;
  }
</style>

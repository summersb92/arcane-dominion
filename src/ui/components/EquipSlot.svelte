<script lang="ts">
  // One paper-doll slot cell (v0.1.3). Renders the label + the equipped gear (name,
  // mod summary, hover tooltip) with an Unequip control, OR an empty state with a
  // compact picker of the OWNED gear that fits this slot. For the two ring positions
  // the parent passes distinct positions (ring1/ring2) via slot.position, which we
  // forward to equipGear so the player chooses which ring goes where. All colour flows
  // through the app.css tokens; the <select> is natively keyboard-accessible.
  import { equipGear, unequipGear, openTip, hideTooltip, homeItemTooltip } from '../stores';
  import type { EquipSlotView, HomeItemView } from '../stores';

  export let slot: EquipSlotView;
  export let owned: HomeItemView[] = []; // owned, not-yet-worn gear matching this slot's type
  export let span = false; // span the full doll width (the belt row)

  function onPick(e: Event): void {
    const sel = e.currentTarget as HTMLSelectElement;
    const id = sel.value;
    sel.value = ''; // it's an action, not bound state — reset the placeholder
    if (id) equipGear(id, slot.position);
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="slot"
  class:filled={!!slot.item}
  class:span
  on:mouseenter={(e) => { if (slot.item) openTip(e, homeItemTooltip(slot.item)); }}
  on:mouseleave={hideTooltip}
>
  <div class="lbl">{slot.slotLabel}</div>
  {#if slot.item}
    <div class="nm">{slot.item.name}</div>
    {#if slot.item.modsSummary}<div class="mods">{slot.item.modsSummary}</div>{/if}
  {:else}
    <div class="empty">— empty —</div>
  {/if}
  <div class="slotactions">
    {#if slot.item}
      <button
        class="btn"
        title={`Unequip ${slot.item.name}`}
        on:click={() => unequipGear(slot.position)}
        on:focus={(e) => { if (slot.item) openTip(e, homeItemTooltip(slot.item)); }}
        on:blur={hideTooltip}
      >Unequip</button>
    {/if}
    {#if owned.length}
      <select class="pick" aria-label={`Equip into ${slot.slotLabel}`} on:change={onPick}>
        <option value="">{slot.item ? 'Swap ▾' : 'Equip ▾'}</option>
        {#each owned as g (g.id)}
          <option value={g.id}>{g.name}</option>
        {/each}
      </select>
    {:else if !slot.item}
      <span class="hint">none owned — buy in Home</span>
    {/if}
  </div>
</div>

<style>
  .slot {
    border: 1px solid var(--edge);
    border-left: 3px solid var(--edge);
    border-radius: 8px;
    padding: 8px 10px;
    background: var(--card);
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 84px;
  }
  .slot.filled {
    border-left-color: var(--ok);
  }
  .slot.span {
    grid-column: 1 / -1;
  }
  .lbl {
    color: var(--label);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .nm {
    color: var(--ink);
    font-weight: 600;
    font-size: 12.5px;
  }
  .mods {
    color: var(--ok);
    font-size: 11px;
  }
  .empty {
    color: var(--faint);
    font-size: 12px;
    font-style: italic;
  }
  .hint {
    color: var(--faint);
    font-size: 11px;
  }
  .slotactions {
    display: flex;
    gap: 6px;
    margin-top: auto;
    padding-top: 4px;
    align-items: center;
    flex-wrap: wrap;
  }
  .pick {
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
    background: var(--hover);
    border: 1px solid var(--edge);
    border-radius: 5px;
    padding: 2px 6px;
    max-width: 100%;
  }
  .pick:hover {
    border-color: var(--accent);
  }
  .pick:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>

<script lang="ts">
  // Player tab (character sheet). The mage's name + earned Title, ★ Renown (with its
  // hover breakdown tooltip), and — new in v0.1.3 — the paper-doll EQUIPMENT: the eleven
  // gear positions laid out like a character sheet, the belt's sub-pouches, and per-slot
  // pickers that EQUIP what you already own. BUYING gear stays on the Home tab; this tab
  // equips it. Driven entirely off UiState (player + resources.renown + equipment); all
  // colour flows through the app.css tokens.
  import {
    game,
    activeTab,
    equipGear,
    unequipBeltItem,
    openTip,
    hideTooltip,
    resourceTooltip,
    homeItemTooltip,
  } from '../stores';
  import type { EquipSlotView, HomeItemView } from '../stores';
  import { fmt, fmtRate } from '../format';
  import { SHOW_RENOWN } from '../../content/config';
  import EquipSlot from '../components/EquipSlot.svelte';

  $: player = $game.player;
  $: renown = $game.resources.renown;
  $: equipment = $game.equipment;
  $: belt = equipment.belt;

  // Look up each doll position by name, and the owned-but-unworn gear grouped by slot type.
  $: slotByPos = new Map(equipment.slots.map((s) => [s.position as string, s]));
  $: gearBySlot = new Map(equipment.ownedGear.map((gg) => [gg.slot as string, gg.items]));
  $: beltOwned = gearBySlot.get('beltItem') ?? [];

  // A doll position → the item slot-type whose owned gear can fill it (rings share 'ring').
  const POS_SLOT: Record<string, string> = {
    head: 'head', amulet: 'amulet', torso: 'torso', body: 'body', leftHand: 'leftHand',
    rightHand: 'rightHand', belt: 'belt', legs: 'legs', boots: 'boots', ring1: 'ring', ring2: 'ring',
  };
  const ownedFor = (pos: string): HomeItemView[] => gearBySlot.get(POS_SLOT[pos]) ?? [];

  // The doll is three bands so the belt's sub-pouches can sit directly beneath the belt.
  const TOP = ['head', 'amulet', 'torso', 'body', 'leftHand', 'rightHand'];
  const BOTTOM = ['legs', 'boots', 'ring1', 'ring2'];
  const present = (s: EquipSlotView | undefined): s is EquipSlotView => !!s;
  $: topSlots = TOP.map((p) => slotByPos.get(p)).filter(present);
  $: bottomSlots = BOTTOM.map((p) => slotByPos.get(p)).filter(present);
  $: beltSlot = slotByPos.get('belt');

  function onBeltPick(e: Event): void {
    const sel = e.currentTarget as HTMLSelectElement;
    const id = sel.value;
    sel.value = '';
    if (id) equipGear(id); // no position — the engine fills the first free belt pouch
  }
</script>

<section>
  <h2>Player · Character</h2>
  <div class="sub">Your mage, their standing, and the gear they carry into the work.</div>

  <!-- Identity: name + earned title -->
  <div class="card ident">
    <div class="tt">
      <span class="nm">{player.name || 'A nameless waif'}</span>
      <span class="chip title">the {player.title}</span>
    </div>
    <div class="io flavour">Every Archmage started somewhere. This is your somewhere.</div>
  </div>

  <!-- Renown lives here now (moved off the left panel). Hidden until reintroduced — SHOW_RENOWN. -->
  {#if SHOW_RENOWN}
  <h2 class="mt">Renown</h2>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="card renown"
    on:mouseenter={(e) => openTip(e, resourceTooltip('renown', '★ Renown'))}
    on:mouseleave={hideTooltip}
  >
    <div class="tt">
      <span class="nm ren">★ Renown</span>
      <span class="rval">
        <span class="vl">{fmt(renown.amount)}</span>
        <span class="rt">{fmtRate(renown.rate)}</span>
      </span>
    </div>
    <div class="io flavour">Your name in the valley's mouth — a reputation that opens doors.</div>
  </div>
  {/if}

  <!-- Paper doll: the eleven equipment positions -->
  <h2 class="mt">
    Equipment <span class="tag" style="font-weight:400">· equip the gear you own; buy more on the Home tab</span>
  </h2>

  <div class="doll">
    {#each topSlots as slot (slot.position)}
      <EquipSlot {slot} owned={ownedFor(slot.position)} />
    {/each}
  </div>

  <!-- Belt + its sub-pouches -->
  {#if beltSlot}
    <div class="doll belt">
      <EquipSlot slot={beltSlot} owned={ownedFor('belt')} span />
    </div>
    {#if belt.count > 0}
      <div class="beltsub">
        {#each belt.items as sub, i (i)}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="beltcell"
            class:filled={!!sub}
            on:mouseenter={(e) => { if (sub) openTip(e, homeItemTooltip(sub)); }}
            on:mouseleave={hideTooltip}
          >
            <div class="lbl">Pouch {i + 1}</div>
            {#if sub}
              <div class="nm">{sub.name}</div>
              {#if sub.modsSummary}<div class="mods">{sub.modsSummary}</div>{/if}
              <div class="slotactions">
                <button
                  class="btn"
                  title={`Unequip ${sub.name}`}
                  on:click={() => unequipBeltItem(i)}
                  on:focus={(e) => { if (sub) openTip(e, homeItemTooltip(sub)); }}
                  on:blur={hideTooltip}
                >Unequip</button>
              </div>
            {:else}
              <div class="empty">— empty —</div>
              <div class="slotactions">
                {#if beltOwned.length}
                  <select class="pick" aria-label={`Equip belt pouch ${i + 1}`} on:change={onBeltPick}>
                    <option value="">Equip ▾</option>
                    {#each beltOwned as g (g.id)}
                      <option value={g.id}>{g.name}</option>
                    {/each}
                  </select>
                {:else}
                  <span class="hint">none owned — buy in Home</span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="card noblt">
        <div class="io">Belt pouches unlock once you equip a belt.</div>
      </div>
    {/if}
  {/if}

  <!-- Rings + lower body -->
  <div class="doll mt2">
    {#each bottomSlots as slot (slot.position)}
      <EquipSlot {slot} owned={ownedFor(slot.position)} />
    {/each}
  </div>

  {#if equipment.ownedGear.length === 0}
    <div class="card empty">
      <div class="io">No gear owned yet.</div>
      <button type="button" class="link" on:click={() => activeTab.set('home')}>
        Buy gear on the Home tab →
      </button>
    </div>
  {/if}
</section>

<style>
  .ident .tt,
  .renown .tt {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: baseline;
  }
  .ident .nm {
    color: var(--ink);
    font-weight: 600;
    font-size: 15px;
  }
  .chip.title {
    color: var(--renown);
    border-color: var(--renown);
  }
  .flavour {
    color: var(--faint);
    font-size: 11.5px;
    margin-top: 5px;
    font-style: italic;
  }
  .renown {
    border-left: 3px solid var(--renown);
    cursor: help;
  }
  .renown .nm.ren {
    color: var(--renown);
    font-weight: 600;
    font-size: 13px;
  }
  .rval {
    font-variant-numeric: tabular-nums;
  }
  .rval .vl {
    color: var(--ink);
    font-size: 14px;
  }
  .rval .rt {
    color: var(--ok);
    font-size: 11px;
    margin-left: 6px;
  }
  /* Paper doll — a two-column character-sheet grid; the belt row spans both columns. */
  .doll {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 6px;
  }
  .doll.belt {
    margin-top: 10px;
  }
  .doll.mt2 {
    margin-top: 10px;
  }
  /* Belt sub-pouches: a compact strip beneath the belt. */
  .beltsub {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
    margin-top: 8px;
  }
  .beltcell {
    border: 1px dashed var(--edge);
    border-radius: 8px;
    padding: 8px 10px;
    background: var(--card);
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 70px;
  }
  .beltcell.filled {
    border-style: solid;
    border-left: 3px solid var(--ok);
  }
  .beltcell .lbl {
    color: var(--label);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .beltcell .nm {
    color: var(--ink);
    font-weight: 600;
    font-size: 12.5px;
  }
  .beltcell .mods {
    color: var(--ok);
    font-size: 11px;
  }
  .beltcell .empty {
    color: var(--faint);
    font-size: 12px;
    font-style: italic;
  }
  .beltcell .hint {
    color: var(--faint);
    font-size: 11px;
  }
  .beltcell .slotactions {
    display: flex;
    gap: 6px;
    margin-top: auto;
    padding-top: 4px;
    align-items: center;
    flex-wrap: wrap;
  }
  .beltcell .pick {
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
    background: var(--hover);
    border: 1px solid var(--edge);
    border-radius: 5px;
    padding: 2px 6px;
    max-width: 100%;
  }
  .beltcell .pick:hover {
    border-color: var(--accent);
  }
  .beltcell .pick:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .noblt {
    border-left: 3px solid var(--edge);
  }
  .noblt .io,
  .empty .io {
    color: var(--dim);
    font-size: 12.5px;
  }
  .link {
    display: inline-block;
    margin-top: 6px;
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
</style>

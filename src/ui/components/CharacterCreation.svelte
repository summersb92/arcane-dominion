<script lang="ts">
  // Character-creation intro (v0.1.2). A blocking modal overlay shown whenever the
  // mage has no name yet (fresh game, post hard-reset, or an old save) — driven by
  // UiState.player.needsNaming. A whimsical, original intro (light wizard puns nodding
  // to RuneScape / D&D / Monty Python) plus a name field, a "Surprise me" roller, and
  // a Begin button that names the mage via setNameSetting. Styled with the same panel/
  // edge/ink tokens as System.svelte + OfflinePanel.svelte; reduced-motion friendly.
  import { game, setNameSetting } from '../stores';
  import { MAX_NAME_LEN } from '../../engine/systems/player';

  // A small, original, clearly-parody roll table of punny wizard names.
  const NAMES = [
    'Merlin Ambrosius III',
    'Tim the Enchanter-ish',
    'Gandalf the Greyscale',
    "Rincewind's Cousin",
    'Sir Cast-a-Lot',
    'Mage Simon',
    'Zezimark',
    'Fizzwick the Fumbling',
    'Alakazam Smith',
    'Dumbledorito',
    'Wiz Khalifa-ndalf',
    'Broomhilda',
  ];

  let name = '';
  let input: HTMLInputElement | undefined;
  let box: HTMLDivElement | undefined;

  // Focus the field on open (once the overlay is actually shown).
  $: if ($game.player.needsNaming) queueMicrotask(() => input?.focus());

  $: canBegin = name.trim().length > 0;

  function surprise(): void {
    // Pick a name different from the current one when possible.
    let pick = NAMES[Math.floor(Math.random() * NAMES.length)];
    if (NAMES.length > 1) {
      while (pick === name) pick = NAMES[Math.floor(Math.random() * NAMES.length)];
    }
    name = pick;
    queueMicrotask(() => input?.focus());
  }

  function begin(): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    setNameSetting(trimmed);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      begin();
      return;
    }
    // Focus trap: this modal blocks play, so keep Tab within it (don't let focus
    // walk out to the header/gutters behind the scrim). Cycle the enabled controls.
    if (e.key === 'Tab' && box) {
      const items = Array.from(
        box.querySelectorAll<HTMLElement>('input, button:not([disabled])'),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
</script>

{#if $game.player.needsNaming}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="scrim">
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="cbox"
      bind:this={box}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cc-title"
      on:keydown={onKey}
    >
      <h2 id="cc-title">Name thy mage</h2>

      <div class="intro">
        <p>
          <strong>Halt!</strong> What is your name? What is your quest? …We'll settle for just the name.
        </p>
        <p>
          You begin a penniless <strong>Waif</strong> — no gold, no glory, and a spellbook that's mostly
          doodles. From these humble coppers you'll scavenge, swot and scheme your way toward
          <strong>Archmage</strong>.
        </p>
        <p class="aside">
          Roll for initiative if you like — the dice are purely decorative. And no, you can't high-alch
          your starter robes yet. Nice try.
        </p>
      </div>

      <label class="field">
        <span>Your name, apprentice</span>
        <input
          bind:this={input}
          bind:value={name}
          class="ninput"
          type="text"
          maxlength={MAX_NAME_LEN}
          placeholder="e.g. Merlin Ambrosius III"
          autocomplete="off"
          spellcheck="false"
          aria-label="Your mage's name"
        />
      </label>

      <div class="btnrow">
        <button type="button" class="btn" on:click={surprise}>🎲 Surprise me</button>
        <button type="button" class="btn begin" disabled={!canBegin} on:click={begin}>
          Begin your apprenticeship
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: #000a;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 70;
    overflow: auto;
  }
  .cbox {
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 10px;
    box-shadow: 0 24px 70px #0008;
    padding: 18px 18px 16px;
    width: 100%;
    max-width: 420px;
    color: var(--ink);
  }
  .cbox h2 {
    margin: 0 0 10px;
    font-size: 13px;
    letter-spacing: 0.12em;
    color: var(--renown);
    text-transform: uppercase;
  }
  .intro {
    font-size: 12.5px;
    color: var(--dim);
    line-height: 1.55;
  }
  .intro p {
    margin: 0 0 8px;
  }
  .intro strong {
    color: var(--ink);
  }
  .intro .aside {
    color: var(--faint);
    font-style: italic;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 6px;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--label);
  }
  .ninput {
    font-family: inherit;
    font-size: 13px;
    letter-spacing: normal;
    text-transform: none;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--edge);
    border-radius: 6px;
    padding: 7px 9px;
  }
  .ninput:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .btnrow {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    margin-top: 14px;
  }
  .btn.begin {
    color: var(--ok);
    border-color: var(--ok);
  }
  .btn.begin:hover {
    background: color-mix(in srgb, var(--ok) 14%, transparent);
    border-color: var(--ok);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: var(--dim);
    border-color: var(--edge);
    background: var(--hover);
  }
</style>

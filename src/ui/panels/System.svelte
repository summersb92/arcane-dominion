<script lang="ts">
  // System / Settings (spec §3.5) — reachable from the header. Save transports over
  // the ONE portable format (export/import string, save-to-file / load-from-file) plus
  // the Notation setting. The DOM download/upload lives in the UI adapter (saveio.ts);
  // corruption-safe import routes through the engine's safeLoad, so a bad file surfaces
  // a clear message and KEEPS the current save (never a silent wipe).
  import {
    systemOpen,
    getState,
    importState,
    setNotationSetting,
    setChronicleLinesSetting,
    setFontSetting,
    resetGame,
  } from '../stores';
  import { exportString, safeLoad } from '../../engine/save';
  import type { Notation } from '../../engine/format';
  import { downloadSave, readFileText } from '../saveio';
  import { applyFont } from '../font';

  const NOTATIONS: { id: Notation; label: string }[] = [
    { id: 'suffix', label: 'Suffix — 1.9K' },
    { id: 'full', label: 'Full — 1,900' },
    { id: 'scientific', label: 'Scientific — 1.9e3' },
  ];

  const CHRONICLE_LINES = [5, 6, 7, 8, 9, 10];

  const FONTS: { id: string; label: string }[] = [
    { id: 'mono', label: 'Mono — monospace (default)' },
    { id: 'sans', label: 'Sans — system sans-serif' },
    { id: 'serif', label: 'Serif' },
    { id: 'large', label: 'Large — mono, bigger' },
    { id: 'bold', label: 'Bold — mono, heavier' },
  ];

  let notation: Notation = 'suffix';
  let chronicleLines = 8;
  let font = 'mono';
  let msg: { kind: 'ok' | 'err'; text: string } | null = null;
  let importText = '';
  let stringOut = '';
  let dragover = false;
  let confirmReset = false;
  let closeBtn: HTMLButtonElement | undefined;

  // Refresh the settings controls from the live save each time the panel opens.
  $: if ($systemOpen) {
    refreshSettings();
    queueMicrotask(() => closeBtn?.focus());
  }

  function refreshSettings(): void {
    const s = getState().settings;
    notation = s.notation;
    chronicleLines = s.chronicleLines;
    font = s.font;
  }

  function setMsg(kind: 'ok' | 'err', text: string): void {
    msg = { kind, text };
  }
  function close(): void {
    systemOpen.set(false);
    msg = null;
    stringOut = '';
    dragover = false;
    confirmReset = false;
  }

  /** Wipe the save and start over. Two-step: the button arms `confirmReset` first. */
  function doReset(): void {
    resetGame();
    confirmReset = false;
    setMsg('ok', 'Save cleared — a fresh start from the Origin.');
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function onNotation(e: Event): void {
    notation = (e.currentTarget as HTMLSelectElement).value as Notation;
    setNotationSetting(notation);
    setMsg('ok', `Notation set to ${notation}.`);
  }

  function onChronicleLines(e: Event): void {
    chronicleLines = Number((e.currentTarget as HTMLSelectElement).value);
    setChronicleLinesSetting(chronicleLines);
    setMsg('ok', `Chronicle showing ${chronicleLines} lines.`);
  }

  function onFont(e: Event): void {
    font = (e.currentTarget as HTMLSelectElement).value;
    setFontSetting(font); // persist into the save
    applyFont(font); // reflect onto <html data-font> now
    setMsg('ok', `Font set to ${font}.`);
  }

  async function copyString(): Promise<void> {
    const s = exportString(getState());
    try {
      await navigator.clipboard.writeText(s);
      setMsg('ok', 'Save string copied to the clipboard.');
    } catch {
      stringOut = s;
      setMsg('err', 'Clipboard unavailable — select the text below and copy it manually.');
    }
  }

  function download(): void {
    try {
      const name = downloadSave(getState());
      setMsg('ok', `Downloaded ${name}.`);
    } catch {
      setMsg('err', 'Download failed in this browser.');
    }
  }

  /** Validate + apply an incoming save string/file text. Corruption-safe: on failure
   *  the current save is untouched and a clear message is shown. */
  function applyText(text: string, source: string): void {
    const res = safeLoad(text);
    if (!res.ok || !res.state) {
      setMsg('err', `Import failed: ${res.error} Your current save was kept.`);
      return;
    }
    // safeLoad guards parse/normalize/validate, but APPLYING the state (setState →
    // setNotation/toView) runs OUTSIDE that guard; wrap it so any unexpected throw
    // surfaces as the same corruption-safe message instead of an uncaught error.
    try {
      importState(res.state);
    } catch (e) {
      setMsg('err', `Import failed: ${e instanceof Error ? e.message : String(e)} Your current save was kept.`);
      return;
    }
    // The imported save carries its own settings (font/notation/chronicle lines) — reflect
    // the font onto <html> now and refresh the controls to match the loaded values.
    applyFont(getState().settings.font);
    refreshSettings();
    const migrated = res.migratedFrom !== undefined ? ` (migrated from v${res.migratedFrom})` : '';
    setMsg('ok', `Loaded ${source}${migrated}. Your game is updated.`);
    importText = '';
  }

  function importFromString(): void {
    if (!importText.trim()) {
      setMsg('err', 'Paste a save string first.');
      return;
    }
    applyText(importText, 'the pasted string');
  }

  async function loadFile(file: File): Promise<void> {
    try {
      const text = await readFileText(file);
      applyText(text, `"${file.name}"`);
    } catch {
      setMsg('err', `Could not read "${file.name}". Your current save was kept.`);
    }
  }

  function onFilePick(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void loadFile(file);
    input.value = ''; // allow re-picking the same file
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    dragover = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  }
  function onDragOver(e: DragEvent): void {
    e.preventDefault();
    dragover = true;
  }
  function onDragLeave(): void {
    dragover = false;
  }
</script>

{#if $systemOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="scrim" on:click={close}>
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="sbox"
      role="dialog"
      aria-modal="true"
      aria-labelledby="system-title"
      on:click|stopPropagation
      on:keydown={onKey}
    >
      <div class="shead">
        <h2 id="system-title">Settings</h2>
        <button class="x" bind:this={closeBtn} on:click={close} aria-label="Close">✕</button>
      </div>

      {#if msg}
        <div class="msg {msg.kind}" role="status">{msg.text}</div>
      {/if}

      <h3>Display</h3>
      <label class="field">
        <span>How numbers display</span>
        <select class="sel" aria-label="Number notation" value={notation} on:change={onNotation}>
          {#each NOTATIONS as n (n.id)}
            <option value={n.id}>{n.label}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Chronicle lines</span>
        <select
          class="sel"
          aria-label="Chronicle lines"
          value={chronicleLines}
          on:change={onChronicleLines}
        >
          {#each CHRONICLE_LINES as n (n)}
            <option value={n}>{n}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Font</span>
        <select class="sel" aria-label="Font" value={font} on:change={onFont}>
          {#each FONTS as ft (ft.id)}
            <option value={ft.id}>{ft.label}</option>
          {/each}
        </select>
      </label>

      <h3>Save</h3>
      <div class="btnrow">
        <button class="btn" on:click={copyString}>Copy save string</button>
        <button class="btn" on:click={download}>Export to file (.aasave)</button>
      </div>
      {#if stringOut}
        <textarea class="ta out" readonly rows="3" aria-label="Save string">{stringOut}</textarea>
      {/if}

      <h3>Load</h3>
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="drop"
        class:over={dragover}
        on:drop={onDrop}
        on:dragover={onDragOver}
        on:dragleave={onDragLeave}
      >
        <label class="filelbl btn">
          Choose a .aasave file…
          <input type="file" accept=".aasave,.json,application/json" on:change={onFilePick} />
        </label>
        <span class="hint">…or drag &amp; drop it here</span>
      </div>
      <label class="field col">
        <span>…or paste a save string</span>
        <textarea class="ta" rows="3" bind:value={importText} placeholder="Paste an exported save string"></textarea>
      </label>
      <button class="btn" on:click={importFromString}>Load from string</button>

      <p class="foot-note">
        Import is corruption-safe: a bad or empty save is refused and your current game is kept.
      </p>

      <h3 class="danger">Danger zone</h3>
      {#if !confirmReset}
        <button class="btn danger" on:click={() => (confirmReset = true)}>
          Hard reset — clear save &amp; start over
        </button>
        <p class="foot-note">Wipes your save and returns to a pure start. This cannot be undone.</p>
      {:else}
        <div class="msg err" role="alert">
          This erases your current game permanently. Export a save first if you want to keep it.
        </div>
        <div class="btnrow">
          <button class="btn danger" on:click={doReset}>Yes, wipe it and start over</button>
          <button class="btn" on:click={() => (confirmReset = false)}>Cancel</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: #0009;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 24px 16px;
    z-index: 60;
    overflow: auto;
  }
  .sbox {
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 10px;
    box-shadow: 0 24px 70px #0008;
    padding: 16px 18px 18px;
    width: 100%;
    max-width: 420px;
    color: var(--ink);
  }
  .shead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .sbox h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.12em;
    color: var(--ink);
    text-transform: uppercase;
  }
  .sbox h3 {
    margin: 16px 0 6px;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--label);
    font-weight: 600;
  }
  .x {
    background: var(--hover);
    border: 1px solid var(--edge);
    border-radius: 5px;
    color: var(--dim);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 8px;
  }
  .x:hover {
    color: var(--ink);
    border-color: var(--accent);
  }
  .x:focus-visible,
  .sel:focus-visible,
  .ta:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .msg {
    margin-top: 10px;
    padding: 7px 9px;
    border-radius: 6px;
    font-size: 12px;
    border: 1px solid var(--edge);
  }
  .msg.ok {
    color: var(--ok);
    border-color: var(--ok);
    background: color-mix(in srgb, var(--ok) 12%, transparent);
  }
  .msg.err {
    color: var(--life);
    border-color: var(--life);
    background: color-mix(in srgb, var(--life) 12%, transparent);
  }
  .field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
    color: var(--dim);
  }
  .field.col {
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
  }
  .sel {
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
    background: var(--hover);
    border: 1px solid var(--edge);
    border-radius: 5px;
    padding: 3px 6px;
  }
  .btnrow {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .ta {
    width: 100%;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--edge);
    border-radius: 6px;
    padding: 6px 8px;
    resize: vertical;
    margin-top: 4px;
  }
  .ta.out {
    color: var(--dim);
  }
  .drop {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    border: 1px dashed var(--edge);
    border-radius: 8px;
    padding: 10px;
    background: var(--card);
  }
  .drop.over {
    border-color: var(--accent);
    background: var(--hover);
  }
  .filelbl {
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }
  .filelbl input[type='file'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .filelbl input[type='file']:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .hint {
    color: var(--faint);
    font-size: 11.5px;
  }
  .foot-note {
    margin: 14px 0 0;
    color: var(--faint);
    font-size: 11px;
    line-height: 1.5;
  }
  h3.danger {
    color: var(--life);
  }
  .btn.danger {
    color: var(--life);
    border-color: var(--life);
  }
  .btn.danger:hover {
    background: color-mix(in srgb, var(--life) 14%, transparent);
    border-color: var(--life);
  }
  .btn {
    margin-top: 8px;
  }
</style>

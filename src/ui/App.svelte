<script lang="ts">
  import { onMount } from 'svelte';
  import Header from './panels/Header.svelte';
  import Tabs from './panels/Tabs.svelte';
  import Resources from './panels/Resources.svelte';
  import Chronicle from './panels/Chronicle.svelte';
  import Character from './panels/Character.svelte';
  import Main from './panels/Main.svelte';
  import System from './panels/System.svelte';
  import OfflinePanel from './components/OfflinePanel.svelte';
  import CharacterCreation from './components/CharacterCreation.svelte';
  import Tooltip from './components/Tooltip.svelte';

  // Resizable side columns. Widths live in CSS vars on .body (with the app.css
  // defaults as fallback) and persist to localStorage so a reload keeps them.
  const LKEY = 'aa-left-w';
  const RKEY = 'aa-right-w';
  const LMIN = 150, LMAX = 460, RMIN = 160, RMAX = 560;
  let leftW = 240;
  let rightW = 320;

  const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

  onMount(() => {
    const l = parseInt(localStorage.getItem(LKEY) ?? '', 10);
    if (!Number.isNaN(l)) leftW = clamp(l, LMIN, LMAX);
    const r = parseInt(localStorage.getItem(RKEY) ?? '', 10);
    if (!Number.isNaN(r)) rightW = clamp(r, RMIN, RMAX);
  });

  function save(): void {
    try {
      localStorage.setItem(LKEY, String(Math.round(leftW)));
      localStorage.setItem(RKEY, String(Math.round(rightW)));
    } catch {
      /* storage unavailable — the live drag still works, just won't persist */
    }
  }

  // Pointer drag. The left gutter grows the left column with the cursor; the right
  // gutter grows the right column as the cursor moves LEFT (hence start - dx).
  function drag(side: 'left' | 'right', e: PointerEvent): void {
    e.preventDefault();
    const startX = e.clientX;
    const start = side === 'left' ? leftW : rightW;
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - startX;
      if (side === 'left') leftW = clamp(start + dx, LMIN, LMAX);
      else rightW = clamp(start - dx, RMIN, RMAX);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      save();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // Keyboard resize for accessibility (focus the separator, arrow to nudge).
  function key(side: 'left' | 'right', e: KeyboardEvent): void {
    const step = e.shiftKey ? 32 : 16;
    if (e.key === 'ArrowLeft') {
      if (side === 'left') leftW = clamp(leftW - step, LMIN, LMAX);
      else rightW = clamp(rightW + step, RMIN, RMAX);
    } else if (e.key === 'ArrowRight') {
      if (side === 'left') leftW = clamp(leftW + step, LMIN, LMAX);
      else rightW = clamp(rightW - step, RMIN, RMAX);
    } else {
      return;
    }
    e.preventDefault();
    save();
  }
</script>

<div class="wrap">
  <Header />
  <Tabs />
  <div class="body" style="--left-w:{leftW}px; --right-w:{rightW}px">
    <Resources />
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions a11y-no-noninteractive-tabindex -->
    <div
      class="gutter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the resources panel"
      tabindex="0"
      on:pointerdown={(e) => drag('left', e)}
      on:keydown={(e) => key('left', e)}
    ></div>
    <Main />
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions a11y-no-noninteractive-tabindex -->
    <div
      class="gutter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the character panel"
      tabindex="0"
      on:pointerdown={(e) => drag('right', e)}
      on:keydown={(e) => key('right', e)}
    ></div>
    <aside class="right">
      <Chronicle />
      <Character />
    </aside>
  </div>
  <div class="foot">
    <span>Left = resources · top = tabs · right = the Chronicle &amp; your character. Theme &amp; Settings in the header. Drag the edges to resize.</span>
    <span>Arcanum-style solo mage · idle-first · no server</span>
  </div>
</div>

<!-- Overlays: shown on load after an idle gap / opened from the header. -->
<OfflinePanel />
<System />

<!-- Character creation: a blocking modal shown whenever the mage has no name yet
     (fresh game / hard reset / old save). Renders above the other overlays. -->
<CharacterCreation />

<!-- The single global hover tooltip — rendered outside the scrolling columns so it is
     never clipped (v0.1.1). Driven by the `tooltip` store; cards/rows set its content. -->
<Tooltip />

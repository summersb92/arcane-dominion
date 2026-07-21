<script lang="ts">
  // The Chronicle log, moved out of Main into the right rail (spec v0.1.1). The store
  // already slices `chronicle` to settings.chronicleLines, so we just render what we get.
  // A collapsible <details open> with an internally-scrolling list keeps the rail bounded.
  import { game } from '../stores';
</script>

<details class="chronbox" open>
  <summary><span class="chtitle">Chronicle</span></summary>
  <ul class="chron">
    {#each $game.chronicle as c}
      <li>
        <span class="t">{c.t}</span>
        <span class:ev={c.kind === 'ev'} class:found={c.kind === 'found'}>{c.text}</span>
      </li>
    {/each}
  </ul>
</details>

<style>
  .chronbox {
    margin-bottom: 16px;
    border: 1px solid var(--edge);
    border-radius: 8px;
    background: var(--card);
    padding: 8px 10px;
  }
  summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  /* A small disclosure caret drawn from a token colour so all three themes match. */
  summary::before {
    content: '▸';
    color: var(--faint);
    font-size: 10px;
    transition: transform 0.12s;
  }
  .chronbox[open] summary::before {
    transform: rotate(90deg);
  }
  .chtitle {
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--label);
    text-transform: uppercase;
    font-weight: 600;
  }
  summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  ul.chron {
    max-height: 220px;
    overflow-y: auto;
    margin-top: 8px;
  }
  @media (prefers-reduced-motion: reduce) {
    summary::before {
      transition: none;
    }
  }
</style>

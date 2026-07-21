<script lang="ts">
  // Gather — three plain buttons in the right rail (Wood · Stone · Food). No descriptors:
  // the whole of hand-gathering is these three taps. Order is fixed wood → stone → food.
  import { game, doGather } from '../stores';
  import type { ActionRowView } from '../stores';

  const ORDER = ['wood', 'stone', 'food'];
  $: buttons = ORDER
    .map((res) => $game.actions.find((a) => a.resource === res))
    .filter((a): a is ActionRowView => a !== undefined);
</script>

<div class="gather">
  <h2>Gather</h2>
  <div class="gbtns">
    {#each buttons as a (a.id)}
      <button class="gbtn" disabled={!a.available} on:click={() => doGather(a.id)}>
        <span class="l">{a.resLabel}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .gather {
    margin-bottom: 14px;
  }
  .gbtns {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gbtn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    font-family: inherit;
    font-size: 14px;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--edge);
    border-left: 3px solid var(--gold);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.12s, transform 0.05s;
  }
  .gbtn:hover {
    border-color: var(--accent);
  }
  .gbtn:active {
    transform: translateY(1px);
  }
  .gbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .gbtn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .gbtn .l {
    font-weight: 600;
  }
  @media (prefers-reduced-motion: reduce) {
    .gbtn {
      transition: none;
    }
  }
</style>

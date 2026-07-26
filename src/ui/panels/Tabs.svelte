<script lang="ts">
  import { game, activeTab } from '../stores';

  function select(id: string, locked: boolean): void {
    if (!locked) activeTab.set(id);
  }
  function onKey(e: KeyboardEvent, id: string, locked: boolean): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(id, locked);
    }
  }
</script>

<nav class="tabs" aria-label="Sections">
  {#each $game.tabs.filter((t) => t.visible) as t (t.id)}
    <button
      type="button"
      class:on={$activeTab === t.id}
      class:locked={t.locked}
      role="tab"
      aria-selected={$activeTab === t.id}
      aria-disabled={t.locked}
      on:click={() => select(t.id, t.locked)}
      on:keydown={(e) => onKey(e, t.id, t.locked)}
    >
      {t.label}{#if t.locked} 🔒{/if}
      {#if t.badge}<span class="badge" title="{t.badge} idle settler{t.badge === 1 ? '' : 's'}">{t.badge}</span>{/if}
    </button>
  {/each}
</nav>

<style>
  /* Idle-settler badge — tells you when the settlement tab needs a visit without leaving
     Build/Research. */
  .badge {
    display: inline-block;
    min-width: 16px;
    margin-left: 6px;
    padding: 0 4px;
    font-size: 10.5px;
    line-height: 16px;
    text-align: center;
    color: var(--card);
    background: var(--accent);
    border-radius: 8px;
    font-variant-numeric: tabular-nums;
  }
</style>

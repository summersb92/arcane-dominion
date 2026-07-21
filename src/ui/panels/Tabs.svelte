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
      title={t.locked ? 'Coming in v0.2' : ''}
      on:click={() => select(t.id, t.locked)}
      on:keydown={(e) => onKey(e, t.id, t.locked)}
    >
      {t.label}{#if t.locked} 🔒{/if}
    </button>
  {/each}
</nav>

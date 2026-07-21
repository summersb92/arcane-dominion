<script lang="ts">
  import { onMount } from 'svelte';
  import { THEMES, type ThemeId } from '../../content/themes';
  import { applyTheme, loadTheme } from '../theme';

  let current: ThemeId = 'system';

  onMount(() => {
    current = loadTheme();
  });

  function onChange(e: Event): void {
    const value = (e.currentTarget as HTMLSelectElement).value as ThemeId;
    current = value;
    applyTheme(value);
  }
</script>

<label>
  Theme:
  <select class="themepick" aria-label="Theme" bind:value={current} on:change={onChange}>
    {#each THEMES as t (t.id)}
      <option value={t.id}>{t.label}</option>
    {/each}
  </select>
</label>

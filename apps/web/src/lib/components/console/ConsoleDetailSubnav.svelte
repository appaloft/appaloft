<script lang="ts" module>
  export type ConsoleDetailSubnavItem = {
    id: string;
    label: string;
    href: string;
    active: boolean;
    onSelect?: (event: MouseEvent) => void;
  };
</script>

<script lang="ts">
  import {
    detailSubnavClass,
    subnavItemClass,
    subnavListClass,
  } from "$lib/console/layout-classes";

  let {
    ariaLabel,
    idPrefix = undefined,
    items,
  }: {
    ariaLabel: string;
    idPrefix?: string;
    items: ConsoleDetailSubnavItem[];
  } = $props();
</script>

<aside class={detailSubnavClass}>
  <nav class="min-w-0" aria-label={ariaLabel}>
    <div class={subnavListClass}>
      {#each items as item (item.id)}
        <a
          id={idPrefix ? `${idPrefix}-${item.id}` : undefined}
          class={[subnavItemClass, "min-h-10"]}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          onclick={item.onSelect}
        >
          <span class="min-w-0 truncate">{item.label}</span>
        </a>
      {/each}
    </div>
  </nav>
</aside>

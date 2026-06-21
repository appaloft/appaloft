<script lang="ts" module>
  export type ConsoleDetailTabItem = {
    id: string;
    label: string;
    href: string;
    active: boolean;
    onSelect?: (event: MouseEvent) => void;
  };
</script>

<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import {
    detailTabClass,
    detailTabsClass,
    detailTabsScrollAreaClass,
  } from "$lib/console/layout-classes";

  let {
    ariaLabel,
    idPrefix = undefined,
    items,
  }: {
    ariaLabel: string;
    idPrefix?: string;
    items: ConsoleDetailTabItem[];
  } = $props();
</script>

<ScrollArea class={detailTabsScrollAreaClass}>
  <nav aria-label={ariaLabel} class={detailTabsClass}>
    {#each items as item (item.id)}
      <a
        id={idPrefix ? `${idPrefix}-${item.id}` : undefined}
        href={item.href}
        class={detailTabClass}
        aria-current={item.active ? "page" : undefined}
        onclick={item.onSelect}
      >
        {item.label}
      </a>
    {/each}
  </nav>
</ScrollArea>

<script lang="ts">
  import { cn, type WithElementRef } from "$lib/utils.js";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>, HTMLElement> & {
    children?: Snippet;
  } = $props();
</script>

<nav bind:this={ref} data-slot="breadcrumb" aria-label="breadcrumb" class={cn(className)} {...restProps}>
  {@render children?.()}
</nav>

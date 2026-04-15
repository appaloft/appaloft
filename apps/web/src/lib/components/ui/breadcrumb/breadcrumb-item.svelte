<script lang="ts">
  import { cn, type WithElementRef } from "$lib/utils.js";
  import type { Snippet } from "svelte";
  import type { HTMLLiAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLLiAttributes, HTMLLIElement> & {
    children?: Snippet;
  } = $props();
</script>

<li
  bind:this={ref}
  data-slot="breadcrumb-item"
  class={cn("inline-flex items-center gap-1.5", className)}
  {...restProps}
>
  {@render children?.()}
</li>

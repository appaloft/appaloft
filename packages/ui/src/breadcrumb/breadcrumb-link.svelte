<script lang="ts">
  import { cn, type WithElementRef } from "../utils.js";
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAnchorAttributes, HTMLAnchorElement> & {
    children?: Snippet;
  } = $props();
</script>

<a
  bind:this={ref}
  data-slot="breadcrumb-link"
  class={cn(
    "inline-flex h-8 min-w-0 items-center rounded-md px-2 transition-colors hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</a>

<script lang="ts">
  import { cn, type WithElementRef } from "../utils.js";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement> & {
    children?: Snippet;
  } = $props();
</script>

<span
  bind:this={ref}
  data-slot="breadcrumb-page"
  role="link"
  aria-disabled="true"
  aria-current="page"
  class={cn(
    "inline-flex h-8 min-w-0 items-center rounded-md px-2 font-normal text-foreground",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</span>

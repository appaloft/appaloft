<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "../utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<aside
  bind:this={ref}
  data-slot="app-shell-sidebar"
  class={cn("min-h-0 w-(--app-shell-sidebar-width,16rem) shrink-0 border-r bg-sidebar", className)}
  {...restProps}
>
  {@render children?.()}
</aside>

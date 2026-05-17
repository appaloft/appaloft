<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "../utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
  bind:this={ref}
  data-slot="app-shell-toolbar"
  class={cn("flex min-h-10 min-w-0 items-center gap-2 border-b bg-background px-3", className)}
  {...restProps}
>
  {@render children?.()}
</div>

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

<main
  bind:this={ref}
  data-slot="app-shell-main"
  class={cn("min-h-0 min-w-0 flex-1 overflow-auto", className)}
  {...restProps}
>
  {@render children?.()}
</main>

<script lang="ts" module>
  export type AppShellHeaderDensity = "compact" | "default" | "comfortable";
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "../utils.js";

  let {
    ref = $bindable(null),
    class: className,
    density = "default",
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> & {
    density?: AppShellHeaderDensity;
  } = $props();
</script>

<header
  bind:this={ref}
  data-slot="app-shell-header"
  class={cn(
    "flex min-w-0 items-center gap-2 border-b bg-background px-3",
    density === "compact" && "min-h-10",
    density === "default" && "min-h-12",
    density === "comfortable" && "min-h-14",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</header>

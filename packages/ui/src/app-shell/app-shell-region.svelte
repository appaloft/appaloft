<script lang="ts" module>
  export type AppShellRegionName =
    | "header-start"
    | "header-center"
    | "header-end"
    | "toolbar-start"
    | "toolbar-center"
    | "toolbar-end"
    | "sidebar-top"
    | "sidebar-bottom"
    | (string & {});

  export type AppShellRegionOrientation = "horizontal" | "vertical";
  export type AppShellRegionAlign = "start" | "center" | "end" | "stretch";
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "../utils.js";

  let {
    ref = $bindable(null),
    class: className,
    name,
    orientation = "horizontal",
    align = "center",
    wrap = false,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    name: AppShellRegionName;
    orientation?: AppShellRegionOrientation;
    align?: AppShellRegionAlign;
    wrap?: boolean;
  } = $props();
</script>

<div
  bind:this={ref}
  data-slot="app-shell-region"
  data-region={name}
  class={cn(
    "flex min-w-0 gap-2",
    orientation === "horizontal" ? "flex-row" : "flex-col",
    align === "start" && "items-start",
    align === "center" && "items-center",
    align === "end" && "items-end",
    align === "stretch" && "items-stretch",
    wrap && "flex-wrap",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</div>

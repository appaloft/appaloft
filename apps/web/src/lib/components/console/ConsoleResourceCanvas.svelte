<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { consolePageContentClass } from "$lib/console/layout-classes";
  import { cn } from "$lib/utils";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  class={cn("mx-auto w-full max-w-7xl space-y-6", consolePageContentClass, className)}
  data-console-resource-canvas
  {...restProps}
>
  {@render children?.()}
</div>

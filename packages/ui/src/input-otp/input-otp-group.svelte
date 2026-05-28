<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn, type WithElementRef } from "../utils.js";

  let {
    ref = $bindable(null),
    class: className,
    "data-slot": dataSlot = "input-otp-group",
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> = $props();
</script>

<div
  bind:this={ref}
  data-slot={dataSlot}
  class={cn("flex items-center", className)}
  {...restProps}
>
  {@render children?.()}
</div>

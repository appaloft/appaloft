<script lang="ts">
  import { ScrollArea as ScrollAreaPrimitive } from "bits-ui";

  import { cn } from "../utils.js";
  import ScrollBar from "./scroll-bar.svelte";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: ScrollAreaPrimitive.RootProps = $props();
</script>

<ScrollAreaPrimitive.Root
  bind:ref
  data-slot="scroll-area"
  class={cn("relative overflow-hidden", className)}
  {...restProps}
>
  <ScrollAreaPrimitive.Viewport
    data-slot="scroll-area-viewport"
    class="h-full w-full rounded-[inherit]"
  >
    {@render children?.()}
  </ScrollAreaPrimitive.Viewport>
  <ScrollBar orientation="vertical" />
  <ScrollBar orientation="horizontal" />
  <ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>

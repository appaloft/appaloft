<script lang="ts">
  import { ScrollArea as ScrollAreaPrimitive } from "bits-ui";

  import { cn } from "../utils.js";

  type ScrollBarProps = Omit<ScrollAreaPrimitive.ScrollbarProps, "orientation"> & {
    orientation?: "vertical" | "horizontal";
  };

  let {
    ref = $bindable(null),
    orientation = "vertical",
    class: className,
    ...restProps
  }: ScrollBarProps = $props();
</script>

<ScrollAreaPrimitive.Scrollbar
  bind:ref
  data-slot="scroll-area-scrollbar"
  {orientation}
  class={cn(
    "flex touch-none select-none transition-colors",
    orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-px",
    orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-px",
    className,
  )}
  {...restProps}
>
  <ScrollAreaPrimitive.Thumb
    data-slot="scroll-area-thumb"
    class="relative flex-1 rounded-full bg-border"
  />
</ScrollAreaPrimitive.Scrollbar>

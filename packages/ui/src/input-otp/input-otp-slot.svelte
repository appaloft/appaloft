<script lang="ts">
  import { PinInput } from "bits-ui";

  import { cn } from "../utils.js";

  let {
    ref = $bindable(null),
    cell,
    class: className,
    "data-slot": dataSlot = "input-otp-slot",
    ...restProps
  }: PinInput.CellProps = $props();
</script>

<PinInput.Cell
  bind:ref
  {cell}
  data-slot={dataSlot}
  class={cn(
    "border-input bg-card text-foreground relative flex size-10 items-center justify-center border-y border-r text-sm font-medium shadow-xs transition-colors first:rounded-l-md first:border-l last:rounded-r-md data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-2 data-[active=true]:ring-ring/30",
    className,
  )}
  {...restProps}
>
  {#snippet child({ props })}
    <div {...props}>
      {cell.char}
      {#if cell.hasFakeCaret}
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div class="h-4 w-px animate-pulse bg-foreground"></div>
        </div>
      {/if}
    </div>
  {/snippet}
</PinInput.Cell>

<script lang="ts">
  import { PinInput } from "bits-ui";
  import { cn } from "../utils.js";

  let {
    ref = $bindable(null),
    inputRef = $bindable(null),
    value = $bindable(""),
    class: className,
    "data-slot": dataSlot = "input-otp",
    maxlength,
    children,
    ...restProps
  }: PinInput.RootProps = $props();
</script>

<PinInput.Root
  bind:ref
  bind:inputRef
  bind:value
  data-slot={dataSlot}
  class={cn("flex items-center gap-2 has-disabled:opacity-55", className)}
  {maxlength}
  {...restProps}
>
  {#snippet children(input)}
    {@render children?.(input)}
  {/snippet}
</PinInput.Root>

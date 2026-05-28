<script lang="ts">
  import MinusIcon from "@lucide/svelte/icons/minus";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    "data-slot": dataSlot = "input-otp-separator",
    ...restProps
  }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div data-slot={dataSlot} role="separator" {...restProps}>
  <MinusIcon class="size-4" />
</div>

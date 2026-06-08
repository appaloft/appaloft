<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "../utils.js";

  let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="alert-dialog-header"
  class={cn("flex flex-col gap-2 text-center sm:text-left", className)}
  {...restProps}
></div>

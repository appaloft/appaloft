<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "../utils.js";

  let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="alert-dialog-footer"
  class={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
  {...restProps}
></div>

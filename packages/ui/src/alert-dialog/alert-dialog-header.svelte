<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "../utils.js";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & {
    children?: Snippet;
  } = $props();
</script>

<div
  data-slot="alert-dialog-header"
  class={cn("flex flex-col gap-2 text-center sm:text-left", className)}
  {...restProps}
>
  {@render children?.()}
</div>

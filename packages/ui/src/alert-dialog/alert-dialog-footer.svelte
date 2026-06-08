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
  data-slot="alert-dialog-footer"
  class={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
  {...restProps}
>
  {@render children?.()}
</div>

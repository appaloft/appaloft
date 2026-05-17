<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "../utils.js";

  let {
    ref = $bindable(null),
    class: className,
    header,
    sidebar,
    toolbar,
    footer,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    header?: Snippet;
    sidebar?: Snippet;
    toolbar?: Snippet;
    footer?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div
  bind:this={ref}
  data-slot="app-shell"
  class={cn("flex min-h-svh flex-col bg-background text-foreground", className)}
  {...restProps}
>
  {#if header}
    <div data-slot="app-shell-header-region" class="shrink-0 border-b bg-background">
      {@render header()}
    </div>
  {/if}

  <div data-slot="app-shell-body" class="flex min-h-0 flex-1">
    {#if sidebar}
      <div data-slot="app-shell-sidebar-region" class="min-h-0 shrink-0">
        {@render sidebar()}
      </div>
    {/if}

    <div data-slot="app-shell-workspace" class="flex min-w-0 flex-1 flex-col">
      {#if toolbar}
        <div data-slot="app-shell-toolbar-region" class="shrink-0 border-b bg-background">
          {@render toolbar()}
        </div>
      {/if}

      <main data-slot="app-shell-main-region" class="min-h-0 min-w-0 flex-1">
        {@render children?.()}
      </main>
    </div>
  </div>

  {#if footer}
    <div data-slot="app-shell-footer-region" class="shrink-0 border-t bg-background">
      {@render footer()}
    </div>
  {/if}
</div>

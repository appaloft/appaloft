<script lang="ts">
  import XIcon from "@lucide/svelte/icons/x";
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";

  import { Button } from "$lib/components/ui/button";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
  import DialogOverlay from "./dialog-overlay.svelte";
  import DialogPortal from "./dialog-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    showCloseButton = true,
    closeLabel,
    children,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
    showCloseButton?: boolean;
    closeLabel: string;
    children: Snippet;
  } = $props();
</script>

<DialogPortal {...portalProps}>
  <DialogOverlay />
  <DialogPrimitive.Content
    bind:ref
    data-slot="dialog-content"
    class={cn(
      "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-md border bg-popover text-popover-foreground p-0 text-sm shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
      className,
    )}
    {...restProps}
  >
    {@render children?.()}
    {#if showCloseButton}
      <DialogPrimitive.Close data-slot="dialog-close">
        {#snippet child({ props })}
          <Button
            variant="ghost"
            class="absolute top-3 right-3"
            size="icon-sm"
            aria-label={closeLabel}
            {...props}
          >
            <XIcon />
          </Button>
        {/snippet}
      </DialogPrimitive.Close>
    {/if}
  </DialogPrimitive.Content>
</DialogPortal>

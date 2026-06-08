<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";

  import { cn, type WithoutChildrenOrChild } from "../utils.js";
  import AlertDialogOverlay from "./alert-dialog-overlay.svelte";
  import AlertDialogPortal from "./alert-dialog-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    children,
    ...restProps
  }: WithoutChildrenOrChild<AlertDialogPrimitive.ContentProps> & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
    children: Snippet;
  } = $props();
</script>

<AlertDialogPortal {...portalProps}>
  <AlertDialogOverlay />
  <AlertDialogPrimitive.Content
    bind:ref
    data-slot="alert-dialog-content"
    class={cn(
      "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-md border bg-popover p-5 text-popover-foreground text-sm shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
      className,
    )}
    {...restProps}
  >
    {@render children?.()}
  </AlertDialogPrimitive.Content>
</AlertDialogPortal>

<script lang="ts">
  import { Package } from "@lucide/svelte";

  import { cn } from "$lib/utils";

  type BlueprintIcon = {
    label?: string;
    tone?: string;
    url?: string;
    alt?: string;
  };

  let {
    title,
    icon,
    class: className,
    imageClass = "size-6",
  }: {
    title: string;
    icon?: BlueprintIcon;
    class?: string;
    imageClass?: string;
  } = $props();

  let imageFailed = $state(false);

  const fallbackLabel = $derived((icon?.label ?? title.slice(0, 2)).trim());
  const hasImage = $derived(Boolean(icon?.url && !imageFailed));
  const fallbackStyle = $derived(
    icon?.tone
      ? `background:${icon.tone};color:white;border-color:${icon.tone}`
      : undefined,
  );
</script>

<div
  class={cn(
    "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-sm font-semibold uppercase",
    hasImage ? "border-border bg-background" : "",
    className,
  )}
  style={hasImage ? undefined : fallbackStyle}
>
  {#if hasImage}
    <img
      src={icon?.url}
      alt={icon?.alt ?? `${title} icon`}
      class={cn("object-contain", imageClass)}
      loading="lazy"
      decoding="async"
      onerror={() => {
        imageFailed = true;
      }}
    />
  {:else if fallbackLabel}
    <span>{fallbackLabel}</span>
  {:else}
    <Package class="size-5" />
  {/if}
</div>

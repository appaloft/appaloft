<script lang="ts">
  import type { Component } from "svelte";

  import { Button } from "$lib/components/ui/button";

  type Props = {
    selected: boolean;
    label: string;
    description: string;
    icon: Component<{ class?: string }>;
    onselect: () => void;
    class?: string;
  };

  let {
    selected,
    label,
    description,
    icon: Icon,
    onselect,
    class: className = "",
  }: Props = $props();
</script>

<Button
  type="button"
  role="radio"
  aria-checked={selected}
  variant={selected ? "selected" : "outline"}
  class={`h-auto min-h-20 items-start justify-start gap-3 whitespace-normal px-3 py-3 text-left ${className}`}
  onclick={onselect}
>
  <span class="flex size-5 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
    <Icon class="size-3.5" />
  </span>
  <span class="min-w-0 space-y-1">
    <span class="block truncate text-sm font-medium">{label}</span>
    <span class="block text-xs font-normal leading-5 text-muted-foreground">{description}</span>
  </span>
</Button>

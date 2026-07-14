<script lang="ts">
  /**
   * Console alias for the shared granular boneyard data skeleton.
   * Wrap metric numbers / list rows / card fields — not the whole page.
   */
  import type { Snippet } from "svelte";

  import { DataSkeleton } from "$lib/components/ui/skeleton";

  type Props = {
    name: string;
    loading: boolean;
    class?: string;
    fallbackClass?: string;
    children?: Snippet;
    capture?: Snippet;
  };

  let {
    name,
    loading,
    class: className = "",
    fallbackClass,
    children,
    capture: captureSnippet,
  }: Props = $props();
</script>

{#if captureSnippet}
  <DataSkeleton {name} {loading} class={className} {fallbackClass}>
    {#snippet capture()}
      {@render captureSnippet()}
    {/snippet}
    {@render children?.()}
  </DataSkeleton>
{:else}
  <DataSkeleton {name} {loading} class={className} {fallbackClass}>
    {@render children?.()}
  </DataSkeleton>
{/if}

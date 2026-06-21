<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import type { Snippet } from "svelte";

  import { capabilities } from "$lib/capabilities";
  import {
    instanceAccessCapabilityKey,
    preloadInstanceAccessCapability,
  } from "$lib/console/instance-access";

  type Props = {
    children?: Snippet;
  };

  let { children }: Props = $props();
  let checked = $state(false);
  let redirected = $state(false);

  const allowed = $derived(
    $capabilities.capabilities[instanceAccessCapabilityKey]?.allowed === true,
  );

  $effect(() => {
    if (!browser) {
      return;
    }

    void preloadInstanceAccessCapability().finally(() => {
      checked = true;
    });
  });

  $effect(() => {
    if (browser && checked && !allowed && !redirected) {
      redirected = true;
      void goto("/");
    }
  });
</script>

{#if allowed && children}
  {@render children()}
{/if}

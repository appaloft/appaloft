<script lang="ts">
  import type { Snippet } from "svelte";

  import {
    capabilities,
    capabilityUiState,
    type CapabilityPolicy,
    type CapabilityResourceRefs,
  } from "$lib/capabilities";

  type Props = {
    operationKey: string;
    organizationId?: string;
    resourceRefs?: CapabilityResourceRefs;
    policy?: CapabilityPolicy;
    children?: Snippet<[{ disabled: boolean; reason?: string }]>;
  };

  let {
    operationKey,
    organizationId,
    resourceRefs,
    policy = "disable",
    children,
  }: Props = $props();

  const decision = $derived(
    $capabilities.capabilities[
      JSON.stringify({
        operationKey,
        organizationId: organizationId ?? null,
        resourceRefs: resourceRefs ?? {},
      })
    ] ?? {
      operationKey,
      allowed: false,
      mode: "denied" as const,
      hint: "disabled",
      reason: "capability-not-loaded",
    },
  );
  const ui = $derived(capabilityUiState(decision, policy));
</script>

{#if !ui.hidden && children}
  {@render children({ disabled: ui.disabled, reason: ui.reason })}
{/if}

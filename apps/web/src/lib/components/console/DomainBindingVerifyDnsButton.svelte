<script lang="ts" module>
  export type DomainBindingVerificationFeedback = {
    bindingId: string;
    kind: "success" | "error";
    title: string;
    detail: string;
  };
</script>

<script lang="ts">
  import { Check, RefreshCw } from "@lucide/svelte";
  import type { DomainBindingSummary } from "@appaloft/contracts";
  import { createMutation } from "@tanstack/svelte-query";

  import { readErrorMessage } from "$lib/api/client";
  import { Button } from "$lib/components/ui/button";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type Props = {
    binding: DomainBindingSummary;
    class?: string;
    disabled?: boolean;
    label?: string;
    size?: "default" | "sm" | "lg" | "icon";
    variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
    onFeedback?: (feedback: DomainBindingVerificationFeedback) => void;
  };

  let {
    binding,
    class: className = "",
    disabled = false,
    label,
    size = "sm",
    variant = "outline",
    onFeedback,
  }: Props = $props();

  const verifyDnsMutation = createMutation(() => ({
    mutationFn: () => orpcClient.domainBindings.confirmOwnership({ domainBindingId: binding.id }),
    onSuccess: () => {
      onFeedback?.({
        bindingId: binding.id,
        kind: "success",
        title: $t(i18nKeys.console.domainBindings.confirmOwnershipSuccessTitle),
        detail: $t(i18nKeys.common.status.bound),
      });
      void queryClient.invalidateQueries({ queryKey: orpc.domainBindings.key({ type: "query" }) });
      void queryClient.invalidateQueries({ queryKey: orpc.resources.key({ type: "query" }) });
      void queryClient.invalidateQueries({ queryKey: orpc.certificates.key({ type: "query" }) });
    },
    onError: (error) => {
      onFeedback?.({
        bindingId: binding.id,
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.confirmOwnershipErrorTitle),
        detail: readErrorMessage(error),
      });
    },
  }));

  const canVerifyDns = $derived(binding.status === "pending_verification");
  const buttonLabel = $derived(
    label ??
      (verifyDnsMutation.isPending
        ? $t(i18nKeys.console.domainBindings.confirmingOwnership)
        : $t(i18nKeys.console.domainBindings.verifyDnsAction)),
  );

  function verifyDns(): void {
    if (!canVerifyDns || verifyDnsMutation.isPending) {
      return;
    }

    verifyDnsMutation.mutate();
  }
</script>

<Button
  type="button"
  {size}
  {variant}
  class={className}
  disabled={disabled || !canVerifyDns || verifyDnsMutation.isPending}
  aria-label={buttonLabel}
  title={$t(i18nKeys.console.domainBindings.pendingDnsActionDescription)}
  onclick={verifyDns}
>
  {#if verifyDnsMutation.isPending}
    <RefreshCw class="size-4 animate-spin" />
  {:else}
    <Check class="size-4" />
  {/if}
  {buttonLabel}
</Button>

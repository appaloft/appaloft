<script lang="ts">
  import { LoaderCircle, RefreshCw } from "@lucide/svelte";
  import { createMutation, createQuery } from "@tanstack/svelte-query";
  import type {
    ConfigureServerRuntimeTargetProfileInput,
    RuntimeTargetProfile,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { i18nKeys, t } from "$lib/i18n";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type Props = {
    serverId: string;
    profile?: RuntimeTargetProfile;
  };

  let { serverId, profile }: Props = $props();
  let connectionReference = $state("");
  let credentialReference = $state("");
  let placementPolicyReference = $state("");
  let routingPolicyReference = $state("");
  let registryCredentialReference = $state("");
  let capabilityPolicyReference = $state("");
  let loadedProfileFingerprint = $state("");
  let configureDialogOpen = $state(false);
  let feedback = $state<{ kind: "error" | "success"; message: string } | null>(null);

  const readinessQuery = createQuery(() =>
    orpc.servers.runtimeReadiness.queryOptions({
      input: { serverId },
      enabled: serverId.length > 0,
      staleTime: 5_000,
    }),
  );
  const configureMutation = createMutation(() => ({
    mutationFn: (input: ConfigureServerRuntimeTargetProfileInput) =>
      orpcClient.servers.configureRuntimeTargetProfile(input),
    onSuccess: (result) => {
      feedback = {
        kind: "success",
        message: $t(i18nKeys.console.servers.runtimeTargetConfigureSucceeded),
      };
      void queryClient.invalidateQueries({ queryKey: orpc.servers.key({ type: "query" }) });
      void readinessQuery.refetch();
      loadProfile(result.profile);
      configureDialogOpen = false;
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        message: `${$t(i18nKeys.console.servers.runtimeTargetConfigureFailed)}: ${readErrorMessage(error)}`,
      };
    },
  }));

  $effect(() => {
    const nextFingerprint = JSON.stringify([serverId, profile ?? null]);
    if (nextFingerprint === loadedProfileFingerprint) return;
    loadedProfileFingerprint = nextFingerprint;
    loadProfile(profile);
    feedback = null;
  });

  function loadProfile(next: RuntimeTargetProfile | undefined): void {
    connectionReference = next?.connectionReference ?? "";
    credentialReference = next?.credentialReference ?? "";
    placementPolicyReference = next?.placementPolicyReference ?? "";
    routingPolicyReference = next?.routingPolicyReference ?? "";
    registryCredentialReference = next?.registryCredentialReference ?? "";
    capabilityPolicyReference = next?.capabilityPolicyReference ?? "";
  }

  function optionalReference(value: string): string | undefined {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  function configure(event: SubmitEvent): void {
    event.preventDefault();
    const normalizedConnectionReference = connectionReference.trim();
    if (!normalizedConnectionReference || configureMutation.isPending) return;
    feedback = null;
    configureMutation.mutate({
      serverId,
      connectionReference: normalizedConnectionReference,
      ...(optionalReference(credentialReference)
        ? { credentialReference: optionalReference(credentialReference) }
        : {}),
      ...(optionalReference(placementPolicyReference)
        ? { placementPolicyReference: optionalReference(placementPolicyReference) }
        : {}),
      ...(optionalReference(routingPolicyReference)
        ? { routingPolicyReference: optionalReference(routingPolicyReference) }
        : {}),
      ...(optionalReference(registryCredentialReference)
        ? { registryCredentialReference: optionalReference(registryCredentialReference) }
        : {}),
      ...(optionalReference(capabilityPolicyReference)
        ? { capabilityPolicyReference: optionalReference(capabilityPolicyReference) }
        : {}),
    });
  }
</script>

<section class="console-panel space-y-5 p-4" data-server-runtime-target-panel>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="space-y-1">
      <div class="flex items-center gap-2">
        <h2 class="text-sm font-semibold">{$t(i18nKeys.console.servers.runtimeTargetTitle)}</h2>
        <DocsHelpLink
          href={webDocsHrefs.serverRuntimeTargetProfile}
          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
        />
      </div>
      <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
        {$t(i18nKeys.console.servers.runtimeTargetDescription)}
      </p>
    </div>
    <div class="flex items-center gap-2">
      {#if readinessQuery.data}
        <Badge variant={readinessQuery.data.status === "ready" ? "default" : "destructive"}>
          {readinessQuery.data.status === "ready"
            ? $t(i18nKeys.console.servers.runtimeTargetReadinessReady)
            : $t(i18nKeys.console.servers.runtimeTargetReadinessBlocked)}
        </Badge>
      {/if}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={readinessQuery.isFetching}
        onclick={() => readinessQuery.refetch()}
      >
        <RefreshCw class={["size-3.5", readinessQuery.isFetching && "animate-spin"]} />
        {$t(i18nKeys.console.servers.runtimeTargetReadiness)}
      </Button>
    </div>
  </div>

  {#if readinessQuery.error}
    <p class="text-sm text-destructive" role="alert">
      {$t(i18nKeys.console.servers.runtimeTargetReadinessFailed)}:
      {readErrorMessage(readinessQuery.error)}
    </p>
  {:else if readinessQuery.data}
    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-server-runtime-readiness-checks>
      {#each readinessQuery.data.checks as check (check.capability)}
        <div class="console-subtle-panel min-w-0 p-3">
          <div class="flex items-center justify-between gap-2">
            <code class="truncate text-xs font-semibold">{check.capability}</code>
            <Badge variant={check.status === "ready" ? "outline" : "secondary"}>
              {check.status}
            </Badge>
          </div>
          {#if check.message || check.reasonCode}
            <p class="mt-2 break-words text-xs leading-5 text-muted-foreground">
              {check.message ?? check.reasonCode}
            </p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="flex flex-wrap items-center gap-3 border-t border-border/70 pt-4">
    <Button type="button" variant="outline" onclick={() => (configureDialogOpen = true)}>
      {$t(i18nKeys.console.servers.runtimeTargetConfigure)}
    </Button>
    {#if feedback}
      <p
        class={feedback.kind === "success" ? "text-sm text-emerald-700" : "text-sm text-destructive"}
        role="status"
      >
        {feedback.message}
      </p>
    {/if}
  </div>

  <Dialog.Root bind:open={configureDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <form class="space-y-4" onsubmit={configure}>
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.servers.runtimeTargetTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.servers.runtimeTargetDescription)}
          </Dialog.Description>
        </Dialog.Header>
        <div class="space-y-4 px-5 py-4">
    <div class="grid gap-4 lg:grid-cols-2">
      <label class="grid gap-2 text-sm" for="runtime-target-connection-reference">
        <span class="font-medium">
          {$t(i18nKeys.console.servers.runtimeTargetConnectionReference)}
        </span>
        <Input
          id="runtime-target-connection-reference"
          bind:value={connectionReference}
          required
          placeholder="file:///path/to/kubeconfig"
          autocomplete="off"
        />
      </label>
      <label class="grid gap-2 text-sm" for="runtime-target-credential-reference">
        <span class="font-medium">
          {$t(i18nKeys.console.servers.runtimeTargetCredentialReference)}
        </span>
        <Input
          id="runtime-target-credential-reference"
          bind:value={credentialReference}
          placeholder={$t(i18nKeys.console.servers.runtimeTargetOptionalReferenceHint)}
          autocomplete="off"
        />
      </label>
      <label class="grid gap-2 text-sm" for="runtime-target-placement-policy-reference">
        <span class="font-medium">
          {$t(i18nKeys.console.servers.runtimeTargetPlacementPolicyReference)}
        </span>
        <Input
          id="runtime-target-placement-policy-reference"
          bind:value={placementPolicyReference}
          placeholder={$t(i18nKeys.console.servers.runtimeTargetOptionalReferenceHint)}
          autocomplete="off"
        />
      </label>
      <label class="grid gap-2 text-sm" for="runtime-target-routing-policy-reference">
        <span class="font-medium">
          {$t(i18nKeys.console.servers.runtimeTargetRoutingPolicyReference)}
        </span>
        <Input
          id="runtime-target-routing-policy-reference"
          bind:value={routingPolicyReference}
          placeholder={$t(i18nKeys.console.servers.runtimeTargetOptionalReferenceHint)}
          autocomplete="off"
        />
      </label>
      <label class="grid gap-2 text-sm" for="runtime-target-registry-reference">
        <span class="font-medium">
          {$t(i18nKeys.console.servers.runtimeTargetRegistryCredentialReference)}
        </span>
        <Input
          id="runtime-target-registry-reference"
          bind:value={registryCredentialReference}
          placeholder={$t(i18nKeys.console.servers.runtimeTargetOptionalReferenceHint)}
          autocomplete="off"
        />
      </label>
      <label class="grid gap-2 text-sm" for="runtime-target-capability-policy-reference">
        <span class="font-medium">
          {$t(i18nKeys.console.servers.runtimeTargetCapabilityPolicyReference)}
        </span>
        <Input
          id="runtime-target-capability-policy-reference"
          bind:value={capabilityPolicyReference}
          placeholder={$t(i18nKeys.console.servers.runtimeTargetOptionalReferenceHint)}
          autocomplete="off"
        />
      </label>
    </div>

        </div>
        <Dialog.Footer class="border-t p-5">
      <Button type="button" variant="outline" onclick={() => (configureDialogOpen = false)}>
        {$t(i18nKeys.common.actions.close)}
      </Button>
      <Button type="submit" disabled={!connectionReference.trim() || configureMutation.isPending}>
        {#if configureMutation.isPending}
          <LoaderCircle class="size-4 animate-spin" />
          {$t(i18nKeys.console.servers.runtimeTargetConfiguring)}
        {:else}
          {$t(i18nKeys.console.servers.runtimeTargetConfigure)}
        {/if}
      </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
</section>

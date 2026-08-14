<script lang="ts">
  import { Boxes, CheckCircle2, TriangleAlert } from "@lucide/svelte";
  import type {
    ConnectorCapabilityApplyResponse,
    ConnectorCapabilityPlanResponse,
    ConnectorDescriptor,
    ManagedClusterCapabilityPlan,
    ManagedClusterCapabilityReceipt,
    ManagedClusterPlacementDecision,
    ManagedClusterReplacementReadiness,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import {
    buildManagedClusterParameters,
    isManagedClusterCapabilityKey,
    managedClusterFormFingerprint,
    type ManagedClusterCapabilityKey,
    type ManagedClusterForm,
  } from "$lib/console/managed-cluster-connection";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";

  let { connector, organizationId }: { connector: ConnectorDescriptor; organizationId: string } =
    $props();

  const implementedCapabilities = $derived(
    connector.capabilities.filter(
      (capability) => capability.implemented && isManagedClusterCapabilityKey(capability.key),
    ),
  );
  let capabilityKey = $state<ManagedClusterCapabilityKey>("infrastructure.cluster.provision");
  let clusterName = $state("");
  let clusterClass = $state("managed-standard");
  let clusterRef = $state("");
  let workloadRef = $state("");
  let requiredCapabilities = $state("kubernetes");
  let excludedTargetIds = $state("");
  let currentTargetId = $state("");
  let currentPlacementEpoch = $state("0");
  let attempt = $state("0");
  let plan = $state<ConnectorCapabilityPlanResponse | null>(null);
  let acceptedPlanId = $state("");
  let applyResult = $state<ConnectorCapabilityApplyResponse | null>(null);
  let plannedFingerprint = $state("");
  let operationError = $state("");
  let pendingOperation = $state<"plan" | "accept" | "apply" | null>(null);

  const form = $derived<ManagedClusterForm>({
    clusterName,
    clusterClass,
    clusterRef,
    workloadRef,
    requiredCapabilities,
    excludedTargetIds,
    currentTargetId,
    currentPlacementEpoch,
    attempt,
  });
  const formFingerprint = $derived(managedClusterFormFingerprint(capabilityKey, form));
  const selectedCapability = $derived(
    implementedCapabilities.find((capability) => capability.key === capabilityKey) ?? null,
  );
  const isProvision = $derived(capabilityKey === "infrastructure.cluster.provision");
  const isReferenceAction = $derived(
    [
      "infrastructure.cluster.inspect",
      "infrastructure.cluster.delete",
      "infrastructure.cluster.cleanup-orphans",
    ].includes(capabilityKey),
  );
  const isPlacementAction = $derived(!isProvision && !isReferenceAction);
  const isReadiness = $derived(capabilityKey === "infrastructure.cluster.readiness");
  const isMutation = $derived(
    capabilityKey !== "infrastructure.cluster.inspect" && !isReadiness,
  );
  const connectorAvailable = $derived(connector.availability.status === "available");
  const exactPlanIsCurrent = $derived(Boolean(plan && plannedFingerprint === formFingerprint));
  const canAcceptPlan = $derived(
    Boolean(isMutation && exactPlanIsCurrent && !acceptedPlanId && !pendingOperation),
  );
  const canApplyPlan = $derived(
    Boolean(isMutation && exactPlanIsCurrent && acceptedPlanId && !pendingOperation),
  );
  const managedPlan = $derived<ManagedClusterCapabilityPlan | null>(
    plan?.providerPlan?.managedClusterPlan ?? null,
  );
  const planReceipt = $derived<ManagedClusterCapabilityReceipt | null>(
    plan?.providerPlan?.managedClusterReceipt ?? null,
  );
  const planPlacement = $derived<ManagedClusterPlacementDecision | null>(
    plan?.providerPlan?.managedClusterPlacement ?? managedPlan?.placement ?? null,
  );
  const replacementReadiness = $derived<ManagedClusterReplacementReadiness | null>(
    plan?.providerPlan?.managedClusterReplacementReadiness ?? null,
  );
  const applyReceipt = $derived<ManagedClusterCapabilityReceipt | null>(
    applyResult?.providerResult?.managedClusterReceipt ?? null,
  );
  const visibleReceipt = $derived(applyReceipt ?? planReceipt);
  const visiblePlacement = $derived(applyReceipt?.placement ?? planPlacement);

  $effect(() => {
    if (plannedFingerprint && plannedFingerprint !== formFingerprint) {
      plan = null;
      acceptedPlanId = "";
      applyResult = null;
      operationError = "";
      plannedFingerprint = "";
    }
  });

  async function requestPlan(): Promise<void> {
    if (!organizationId || !connectorAvailable || !selectedCapability || pendingOperation) return;
    const parameters = buildManagedClusterParameters(capabilityKey, form);
    if (!parameters.ok) {
      operationError = $t(i18nKeys.console.accountSettings.managedClusterFormInvalid);
      return;
    }
    pendingOperation = "plan";
    operationError = "";
    acceptedPlanId = "";
    applyResult = null;
    try {
      const nextPlan = await orpcClient.connections.capability.plan({
        connectorKey: connector.key,
        capabilityKey,
        ownerRef: { scope: "organization", id: organizationId },
        parameters: parameters.parameters,
      });
      plan = nextPlan;
      plannedFingerprint = formFingerprint;
    } catch (error) {
      plan = null;
      plannedFingerprint = "";
      operationError = readErrorMessage(error);
    } finally {
      pendingOperation = null;
    }
  }

  async function acceptPlan(): Promise<void> {
    if (!plan || !canAcceptPlan) return;
    pendingOperation = "accept";
    operationError = "";
    try {
      const accepted = await orpcClient.connections.capability.accept({
        planId: plan.planId,
        connectorKey: plan.connectorKey,
        capabilityKey: plan.capabilityKey,
        ownerRef: { scope: "organization", id: organizationId },
        riskLevel: plan.riskLevel,
        summary: plan.summary,
        effects: plan.effects,
        ...(plan.cleanup ? { cleanup: plan.cleanup } : {}),
      });
      acceptedPlanId = accepted.acceptedPlanId;
    } catch (error) {
      acceptedPlanId = "";
      operationError = readErrorMessage(error);
    } finally {
      pendingOperation = null;
    }
  }

  async function applyPlan(): Promise<void> {
    if (!plan || !canApplyPlan) return;
    const parameters = buildManagedClusterParameters(capabilityKey, form);
    if (!parameters.ok) {
      operationError = $t(i18nKeys.console.accountSettings.managedClusterFormInvalid);
      return;
    }
    pendingOperation = "apply";
    operationError = "";
    try {
      applyResult = await orpcClient.connections.capability.apply({
        connectorKey: connector.key,
        capabilityKey,
        ownerRef: { scope: "organization", id: organizationId },
        acceptedPlanId,
        parameters: parameters.parameters,
      });
      plan = null;
      acceptedPlanId = "";
      plannedFingerprint = "";
    } catch (error) {
      applyResult = null;
      operationError = readErrorMessage(error);
    } finally {
      pendingOperation = null;
    }
  }
</script>

<section class="space-y-5 rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4" data-managed-cluster-connection>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="flex min-w-0 items-start gap-3">
      <div class="rounded-md border bg-card p-2"><Boxes class="size-4 text-foreground" /></div>
      <div class="min-w-0 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold">{connector.title}</h2>
          <Badge variant={connector.availability.status === "available" ? "outline" : "secondary"}>
            {connector.availability.status}
          </Badge>
        </div>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.accountSettings.managedClusterDescription)}
        </p>
      </div>
    </div>
  </div>

  <label class="block space-y-1.5 text-sm font-medium">
    <span class="console-field-label">{$t(i18nKeys.console.accountSettings.managedClusterCapability)}</span>
    <Select.Root bind:value={capabilityKey} type="single">
      <Select.Trigger class="w-full">{selectedCapability?.title ?? capabilityKey}</Select.Trigger>
      <Select.Content>
        {#each implementedCapabilities as capability (capability.key)}
          <Select.Item value={capability.key}>{capability.title}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </label>

  {#if isProvision}
    <div class="grid gap-4 md:grid-cols-2">
      <label class="space-y-1.5 text-sm font-medium">
        <span class="console-field-label">{$t(i18nKeys.console.accountSettings.managedClusterName)}</span>
        <Input bind:value={clusterName} placeholder="appaloft-prod" />
      </label>
      <label class="space-y-1.5 text-sm font-medium">
        <span class="console-field-label">{$t(i18nKeys.console.accountSettings.managedClusterClass)}</span>
        <Input bind:value={clusterClass} placeholder="managed-standard" />
      </label>
    </div>
  {:else if isReferenceAction}
    <label class="block space-y-1.5 text-sm font-medium">
      <span class="console-field-label">{$t(i18nKeys.console.accountSettings.managedClusterRef)}</span>
      <Input bind:value={clusterRef} placeholder="cluster_..." />
    </label>
  {:else if isPlacementAction}
    <div class="grid gap-4 md:grid-cols-2">
      <label class="space-y-1.5 text-sm font-medium">
        <span class="console-field-label">{$t(i18nKeys.console.accountSettings.managedClusterWorkloadRef)}</span>
        <Input bind:value={workloadRef} placeholder="resource:..." />
      </label>
      <label class="space-y-1.5 text-sm font-medium">
        <span class="console-field-label">{$t(i18nKeys.console.accountSettings.managedClusterCurrentTarget)}</span>
        <Input bind:value={currentTargetId} placeholder="target_..." />
      </label>
      <label class="space-y-1.5 text-sm font-medium">
        <span class="console-field-label">{$t(i18nKeys.console.accountSettings.managedClusterPlacementEpoch)}</span>
        <Input bind:value={currentPlacementEpoch} inputmode="numeric" />
      </label>
      {#if !isReadiness}
        <label class="space-y-1.5 text-sm font-medium">
          <span class="console-field-label">{$t(i18nKeys.console.accountSettings.managedClusterAttempt)}</span>
          <Input bind:value={attempt} inputmode="numeric" />
        </label>
      {/if}
      <label class="space-y-1.5 text-sm font-medium md:col-span-2">
        <span class="console-field-label">{$t(i18nKeys.console.accountSettings.managedClusterExcludedTargets)}</span>
        <Input bind:value={excludedTargetIds} placeholder="target_a, target_b" />
      </label>
    </div>
  {/if}

  {#if isProvision || isPlacementAction}
    <label class="block space-y-1.5 text-sm font-medium">
      <span class="console-field-label">{$t(i18nKeys.console.accountSettings.managedClusterRequiredCapabilities)}</span>
      <Input bind:value={requiredCapabilities} placeholder="kubernetes, helm" />
    </label>
  {/if}

  <div class="flex flex-wrap gap-2">
    <Button type="button" variant="outline" disabled={!connectorAvailable || !selectedCapability || Boolean(pendingOperation)} onclick={requestPlan}>
      {pendingOperation === "plan"
        ? $t(i18nKeys.console.accountSettings.managedClusterPlanning)
        : $t(i18nKeys.console.accountSettings.managedClusterPlanAction)}
    </Button>
    {#if isMutation}
      <Button type="button" variant="secondary" disabled={!canAcceptPlan} onclick={acceptPlan}>
        {pendingOperation === "accept"
          ? $t(i18nKeys.console.accountSettings.managedClusterAccepting)
          : $t(i18nKeys.console.accountSettings.managedClusterAcceptPlan)}
      </Button>
      <Button type="button" disabled={!canApplyPlan} onclick={applyPlan}>
        {pendingOperation === "apply"
          ? $t(i18nKeys.console.accountSettings.managedClusterApplying)
          : $t(i18nKeys.console.accountSettings.managedClusterApplyAction)}
      </Button>
    {/if}
  </div>

  {#if operationError}
    <div class="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
      <TriangleAlert class="mt-0.5 size-4 shrink-0 text-destructive" />
      <p class="break-words text-muted-foreground">{operationError}</p>
    </div>
  {/if}

  {#if plan}
    <div class="space-y-3 rounded-md border bg-card p-4" data-managed-cluster-plan>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold">{$t(i18nKeys.console.accountSettings.managedClusterPlanTitle)}</h3>
        <Badge variant={plan.riskLevel === "high" ? "destructive" : "outline"}>{plan.riskLevel}</Badge>
      </div>
      <p class="text-sm text-muted-foreground">{plan.summary}</p>
      <ul class="space-y-2 text-sm">
        {#each plan.effects as effect (effect.kind)}
          <li><span class="font-medium">{effect.title}</span>{#if effect.description}<span class="text-muted-foreground"> · {effect.description}</span>{/if}</li>
        {/each}
      </ul>
      {#if managedPlan}
        <dl class="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterCost)}</dt><dd class="font-medium">{managedPlan.estimatedMonthlyCostUsd ?? "—"} {managedPlan.currency}</dd></div>
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterSupport)}</dt><dd class="font-medium">{managedPlan.supportLevel}</dd></div>
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterCleanup)}</dt><dd class="font-medium">{managedPlan.cleanupSupported ? $t(i18nKeys.console.accountSettings.managedClusterCleanupSupported) : $t(i18nKeys.console.accountSettings.managedClusterCleanupUnavailable)}</dd></div>
        </dl>
      {/if}
      {#if acceptedPlanId}
        <div class="flex items-center gap-2 text-sm text-primary"><CheckCircle2 class="size-4" />{$t(i18nKeys.console.accountSettings.managedClusterPlanAccepted)}</div>
      {/if}
    </div>
  {/if}

  {#if applyResult || visibleReceipt || visiblePlacement || replacementReadiness}
    <div class="space-y-3 rounded-md border bg-card p-4" data-managed-cluster-readback>
      <h3 class="text-sm font-semibold">{$t(i18nKeys.console.accountSettings.managedClusterReadbackTitle)}</h3>
      {#if applyResult}<p class="text-sm text-muted-foreground">{applyResult.summary}</p>{/if}
      <dl class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {#if visibleReceipt}
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterStatus)}</dt><dd class="font-medium">{visibleReceipt.status}</dd></div>
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterRef)}</dt><dd class="break-all font-medium">{visibleReceipt.clusterRef}</dd></div>
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterSupport)}</dt><dd class="font-medium">{visibleReceipt.support.level}</dd></div>
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterResidualResources)}</dt><dd class="font-medium">{visibleReceipt.cleanup.residualOwnedResources}</dd></div>
        {/if}
        {#if visiblePlacement}
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterSelectedTarget)}</dt><dd class="break-all font-medium">{visiblePlacement.selectedTargetId}</dd></div>
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterRegion)}</dt><dd class="font-medium">{visiblePlacement.selectedRegion}</dd></div>
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterPlacementEpoch)}</dt><dd class="font-medium">{visiblePlacement.placementEpoch}</dd></div>
        {/if}
        {#if replacementReadiness}
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterStatus)}</dt><dd class="font-medium">{replacementReadiness.status}</dd></div>
          {#if replacementReadiness.selectedTargetId}
            <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterSelectedTarget)}</dt><dd class="break-all font-medium">{replacementReadiness.selectedTargetId}</dd></div>
          {/if}
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterEligibleCapacity)}</dt><dd class="font-medium">{replacementReadiness.totalEligibleReplacementCapacity}</dd></div>
          <div><dt class="text-muted-foreground">{$t(i18nKeys.console.accountSettings.managedClusterReadinessReasons)}</dt><dd class="break-words font-medium">{replacementReadiness.reasonCodes.join(", ")}</dd></div>
        {/if}
      </dl>
    </div>
  {/if}
</section>

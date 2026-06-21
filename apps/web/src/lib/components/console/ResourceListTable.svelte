<script lang="ts">
  import { ArrowRight, Globe2, Play } from "@lucide/svelte";
  import type {
    DeploymentSummary,
    DomainBindingSummary,
    EnvironmentSummary,
    ResourceSummary,
  } from "@appaloft/contracts";

  import ConsoleStatePanel from "$lib/components/console/ConsoleStatePanel.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import DomainBindingVerifyDnsButton, {
    type DomainBindingVerificationFeedback,
  } from "$lib/components/console/DomainBindingVerifyDnsButton.svelte";
  import ResourceHealthDot from "$lib/components/console/ResourceHealthDot.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { selectCurrentResourceAccessRoute } from "$lib/console/resource-access-route";
  import {
    deploymentDetailHref,
    formatTime,
    latestResourceDeployment,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    resources: ResourceSummary[];
    deployments: DeploymentSummary[];
    domainBindings?: DomainBindingSummary[];
    environments?: EnvironmentSummary[];
    emptyTitle: string;
    emptyDescription: string;
    createHref?: string;
    createLabel?: string;
    createAction?: () => void;
    createDisabled?: boolean;
    onDeployResource?: (resource: ResourceSummary) => void;
    onDomainBindingVerificationFeedback?: (feedback: DomainBindingVerificationFeedback) => void;
    showEnvironment?: boolean;
  };

  let {
    resources,
    deployments,
    domainBindings = [],
    environments = [],
    emptyTitle,
    emptyDescription,
    createHref = "",
    createLabel = "",
    createAction,
    createDisabled = false,
    onDeployResource,
    onDomainBindingVerificationFeedback,
    showEnvironment = false,
  }: Props = $props();

  function environmentName(environmentId: string): string {
    return environments.find((environment) => environment.id === environmentId)?.name ?? environmentId;
  }

  function accessUrl(resource: ResourceSummary): string {
    return selectCurrentResourceAccessRoute(resource.accessSummary)?.route.url ?? "";
  }

  function resourceDeployments(resource: ResourceSummary): DeploymentSummary[] {
    return deployments.filter((deployment) => deployment.resourceId === resource.id);
  }

  function pendingDomainBinding(resource: ResourceSummary): DomainBindingSummary | null {
    return (
      domainBindings.find(
        (binding) =>
          binding.resourceId === resource.id && binding.status === "pending_verification",
      ) ?? null
    );
  }
</script>

{#if resources.length === 0}
  <ConsoleStatePanel
    title={emptyTitle}
    description={emptyDescription}
    actionHref={createAction ? "" : createHref}
    actionOnclick={createAction}
    actionLabel={createLabel}
    actionDisabled={createDisabled}
  />
{:else}
  <div class="console-record-list" data-resource-record-list>
    {#each resources as resource (resource.id)}
      {@const latestDeployment = latestResourceDeployment(resource, deployments)}
      {@const childDeployments = resourceDeployments(resource)}
      {@const currentAccessUrl = accessUrl(resource)}
      {@const resourcePendingDomainBinding = pendingDomainBinding(resource)}
      <article
        class="console-record-row gap-4 xl:grid-cols-[minmax(0,1.3fr)_8rem_minmax(0,1fr)_minmax(0,1fr)_10rem_auto] xl:items-center xl:py-3"
        data-resource-record-row
      >
        <div class="min-w-0 space-y-1">
          <a
            href={resourceDetailHref(resource)}
            class="block min-w-0 underline-offset-4 hover:underline"
          >
            <span class="flex min-w-0 items-center gap-2">
              <ResourceHealthDot resourceId={resource.id} class="shrink-0" />
              <span class="truncate font-medium">{resource.name}</span>
              <Badge variant="secondary">{resource.kind}</Badge>
            </span>
            <span class="mt-1 block truncate text-xs text-muted-foreground">
              {resource.description ?? resource.slug}
            </span>
          </a>
        </div>

        <div>
          <p class="text-xs font-medium text-muted-foreground">{$t(i18nKeys.common.domain.status)}</p>
          <div class="mt-1">
            <DeploymentStatusBadge status={resource.lastDeploymentStatus ?? latestDeployment?.status} />
          </div>
        </div>

        <div
          class="grid min-w-0 gap-2 text-sm sm:grid-cols-2 xl:grid-flow-col xl:grid-cols-none xl:auto-cols-fr"
          data-resource-owner-summary
        >
          {#if showEnvironment}
            <div class="min-w-0">
              <p class="text-xs font-medium text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</p>
              <p class="mt-1 truncate">{environmentName(resource.environmentId)}</p>
            </div>
          {/if}
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted-foreground">
              {$t(i18nKeys.console.projects.lastDeployment)}
            </p>
            {#if latestDeployment}
              <a
                href={deploymentDetailHref(latestDeployment)}
                class="mt-1 block truncate underline-offset-4 hover:underline"
              >
                {latestDeployment.runtimePlan.source.displayName}
              </a>
              <a
                href={`${resourceDetailHref(resource)}?tab=deployments`}
                class="mt-1 block truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                {formatTime(latestDeployment.createdAt)} · {childDeployments.length}
                {$t(i18nKeys.common.domain.deployments)}
              </a>
            {:else}
              <p class="mt-1 text-muted-foreground">
                {$t(i18nKeys.console.projects.noDeploymentShort)}
              </p>
            {/if}
          </div>
        </div>

        <div class="min-w-0 text-sm">
          <p class="text-xs font-medium text-muted-foreground">
            {$t(i18nKeys.console.projects.publicAccessTitle)}
          </p>
          {#if currentAccessUrl}
            <a
              href={currentAccessUrl}
              target="_blank"
              rel="noreferrer"
              class="mt-1 flex min-w-0 items-center gap-2 font-mono text-xs underline-offset-4 hover:underline"
            >
              <Globe2 class="size-3 shrink-0 text-muted-foreground" />
              <span class="truncate">{currentAccessUrl}</span>
            </a>
          {:else}
            <p class="mt-1 text-muted-foreground">{$t(i18nKeys.console.projects.noPublicAccess)}</p>
          {/if}
          {#if resourcePendingDomainBinding}
            <div class="mt-2">
              <DomainBindingVerifyDnsButton
                binding={resourcePendingDomainBinding}
                label={$t(i18nKeys.console.domainBindings.verifyDnsShortAction)}
                onFeedback={onDomainBindingVerificationFeedback}
              />
            </div>
          {/if}
        </div>

        <div class="text-sm text-muted-foreground">
          <p class="text-xs font-medium">{$t(i18nKeys.common.domain.createdAt)}</p>
          <p class="mt-1">{formatTime(resource.createdAt)}</p>
        </div>

        <div class="flex justify-start gap-1 xl:justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={$t(i18nKeys.common.actions.createDeployment)}
            onclick={() => onDeployResource?.(resource)}
          >
            <Play class="size-4" />
          </Button>
          <Button
            href={resourceDetailHref(resource)}
            size="sm"
            variant="outline"
            aria-label={$t(i18nKeys.common.actions.viewDetails)}
          >
            <ArrowRight class="size-4" />
          </Button>
        </div>
      </article>
    {/each}
  </div>
{/if}

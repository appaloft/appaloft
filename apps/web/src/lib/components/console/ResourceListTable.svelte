<script lang="ts">
  import { ArrowRight, Globe2, Plus } from "@lucide/svelte";
  import type { DeploymentSummary, EnvironmentSummary, ResourceSummary } from "@appaloft/contracts";

  import ConsoleStatePanel from "$lib/components/console/ConsoleStatePanel.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import ResourceHealthDot from "$lib/components/console/ResourceHealthDot.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Table from "$lib/components/ui/table";
  import { selectCurrentResourceAccessRoute } from "$lib/console/resource-access-route";
  import {
    deploymentDetailHref,
    formatTime,
    latestResourceDeployment,
    resourceDetailHref,
    resourceNewDeploymentHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    resources: ResourceSummary[];
    deployments: DeploymentSummary[];
    environments?: EnvironmentSummary[];
    emptyTitle: string;
    emptyDescription: string;
    createHref?: string;
    createLabel?: string;
    createDisabled?: boolean;
    showEnvironment?: boolean;
  };

  let {
    resources,
    deployments,
    environments = [],
    emptyTitle,
    emptyDescription,
    createHref = "",
    createLabel = "",
    createDisabled = false,
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
</script>

{#if resources.length === 0}
  <ConsoleStatePanel
    title={emptyTitle}
    description={emptyDescription}
    actionHref={createHref}
    actionLabel={createLabel}
    actionDisabled={createDisabled}
  />
{:else}
  <div class="console-record-list">
    <Table.Root>
      <Table.Header>
        <Table.Row class="hover:bg-transparent">
          <Table.Head class="min-w-64">{$t(i18nKeys.common.domain.resource)}</Table.Head>
          <Table.Head>{$t(i18nKeys.common.domain.status)}</Table.Head>
          {#if showEnvironment}
            <Table.Head>{$t(i18nKeys.common.domain.environment)}</Table.Head>
          {/if}
          <Table.Head>{$t(i18nKeys.console.projects.lastDeployment)}</Table.Head>
          <Table.Head>{$t(i18nKeys.console.projects.publicAccessTitle)}</Table.Head>
          <Table.Head>{$t(i18nKeys.common.domain.createdAt)}</Table.Head>
          <Table.Head class="w-28"><span class="sr-only">{$t(i18nKeys.common.actions.viewDetails)}</span></Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each resources as resource (resource.id)}
          {@const latestDeployment = latestResourceDeployment(resource, deployments)}
          {@const childDeployments = resourceDeployments(resource)}
          {@const currentAccessUrl = accessUrl(resource)}
          <Table.Row class="group">
            <Table.Cell class="max-w-80">
              <a href={resourceDetailHref(resource)} class="block min-w-0 underline-offset-4 group-hover:underline">
                <span class="flex min-w-0 items-center gap-2">
                  <ResourceHealthDot resourceId={resource.id} class="shrink-0" />
                  <span class="truncate font-medium">{resource.name}</span>
                  <Badge variant="secondary">{resource.kind}</Badge>
                </span>
                <span class="mt-1 block truncate text-xs text-muted-foreground">
                  {resource.description ?? resource.slug}
                </span>
              </a>
            </Table.Cell>
            <Table.Cell>
              <DeploymentStatusBadge status={resource.lastDeploymentStatus ?? latestDeployment?.status} />
            </Table.Cell>
            {#if showEnvironment}
              <Table.Cell class="max-w-40 truncate">
                {environmentName(resource.environmentId)}
              </Table.Cell>
            {/if}
            <Table.Cell class="max-w-48">
              {#if latestDeployment}
                <a
                  href={deploymentDetailHref(latestDeployment)}
                  class="block truncate text-sm underline-offset-4 hover:underline"
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
                <span class="text-muted-foreground">
                  {$t(i18nKeys.console.projects.noDeploymentShort)}
                </span>
              {/if}
            </Table.Cell>
            <Table.Cell class="max-w-56">
              {#if currentAccessUrl}
                <a
                  href={currentAccessUrl}
                  target="_blank"
                  rel="noreferrer"
                  class="flex min-w-0 items-center gap-2 font-mono text-xs underline-offset-4 hover:underline"
                >
                  <Globe2 class="size-3 shrink-0 text-muted-foreground" />
                  <span class="truncate">{currentAccessUrl}</span>
                </a>
              {:else}
                <span class="text-muted-foreground">{$t(i18nKeys.console.projects.noPublicAccess)}</span>
              {/if}
            </Table.Cell>
            <Table.Cell class="text-muted-foreground">
              {formatTime(resource.createdAt)}
            </Table.Cell>
            <Table.Cell class="text-right">
              <div class="flex justify-end gap-1">
                <Button
                  href={resourceNewDeploymentHref(resource)}
                  size="sm"
                  variant="outline"
                  aria-label={$t(i18nKeys.common.actions.quickDeploy)}
                >
                  <Plus class="size-4" />
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
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
{/if}

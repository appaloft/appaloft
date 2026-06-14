<script lang="ts">
  import { ArrowRight } from "@lucide/svelte";
  import {
    type DeploymentSummary,
    type EnvironmentSummary,
    type ProjectSummary,
    type ResourceSummary,
    type ServerSummary,
    sourceVersionForDeployment,
  } from "@appaloft/contracts";

  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import {
    deploymentDetailHref,
    findEnvironment,
    findProject,
    findResource,
    findServer,
    formatTime,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    deployments: DeploymentSummary[];
    projects?: ProjectSummary[];
    environments?: EnvironmentSummary[];
    resources?: ResourceSummary[];
    servers?: ServerSummary[];
    showProject?: boolean;
    showEnvironment?: boolean;
    showResource?: boolean;
    showServer?: boolean;
    showExecution?: boolean;
  };

  let {
    deployments,
    projects = [],
    environments = [],
    resources = [],
    servers = [],
    showProject = true,
    showEnvironment = true,
    showResource = true,
    showServer = false,
    showExecution = true,
  }: Props = $props();
</script>

<div class="console-record-list" data-deployment-record-list>
  {#each deployments as deployment (deployment.id)}
    {@const project = findProject(projects, deployment.projectId)}
    {@const environment = findEnvironment(environments, deployment.environmentId)}
    {@const resource = findResource(resources, deployment.resourceId)}
    {@const server = deployment.serverId ? findServer(servers, deployment.serverId) : null}
    {@const sourceVersion = sourceVersionForDeployment(deployment)}
    <article
      class="console-record-row gap-4 xl:grid-cols-[minmax(0,1.4fr)_8rem_minmax(0,1.1fr)_9rem_9rem_auto] xl:items-center"
      data-deployment-record-row
    >
      <div class="min-w-0 space-y-1">
        <a
          href={deploymentDetailHref(deployment)}
          class="block min-w-0 underline-offset-4 hover:underline"
        >
          <span class="block truncate font-medium">{deployment.runtimePlan.source.displayName}</span>
          <span class="mt-1 block truncate text-xs text-muted-foreground">
            {deployment.runtimePlan.source.locator}
          </span>
        </a>
        {#if sourceVersion}
          <p class="truncate font-mono text-xs text-muted-foreground" title={sourceVersion.value}>
            {sourceVersion.label} {sourceVersion.requested ? `${sourceVersion.requested} -> ` : ""}{sourceVersion.shortValue}
          </p>
        {/if}
      </div>

      <div>
        <p class="text-xs font-medium text-muted-foreground">{$t(i18nKeys.common.domain.status)}</p>
        <div class="mt-1">
          <DeploymentStatusBadge status={deployment.status} />
        </div>
      </div>

      <div class="grid min-w-0 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-1" data-deployment-owner-summary>
        {#if showProject}
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted-foreground">{$t(i18nKeys.common.domain.project)}</p>
            <p class="mt-1 truncate">{project?.name ?? deployment.projectId}</p>
          </div>
        {/if}
        {#if showEnvironment}
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</p>
            <p class="mt-1 truncate">{environment?.name ?? deployment.environmentId}</p>
          </div>
        {/if}
        {#if showResource}
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</p>
            {#if resource}
              <a
                href={resourceDetailHref(resource)}
                class="mt-1 block truncate underline-offset-4 hover:underline"
              >
                {resource.name}
              </a>
            {:else}
              <p class="mt-1 truncate">{deployment.resourceId}</p>
            {/if}
          </div>
        {/if}
        {#if showServer}
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted-foreground">{$t(i18nKeys.common.domain.server)}</p>
            <p class="mt-1 truncate">{server?.name ?? deployment.serverId}</p>
          </div>
        {/if}
      </div>

      {#if showExecution}
        <div class="min-w-0 text-sm">
          <p class="text-xs font-medium text-muted-foreground">
            {$t(i18nKeys.console.deployments.executionShape)}
          </p>
          <p class="mt-1 truncate">{deployment.runtimePlan.buildStrategy}</p>
        </div>
      {/if}

      <div class="text-sm text-muted-foreground">
        <p class="text-xs font-medium">{$t(i18nKeys.common.domain.createdAt)}</p>
        <p class="mt-1">{formatTime(deployment.createdAt)}</p>
      </div>

      <a
        href={deploymentDetailHref(deployment)}
        aria-label={$t(i18nKeys.common.actions.viewDetails)}
        class="inline-flex size-8 items-center justify-center justify-self-start rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground xl:justify-self-end"
      >
        <ArrowRight class="size-4" />
      </a>
    </article>
  {/each}
</div>

<script lang="ts">
  import { ArrowRight } from "@lucide/svelte";
  import type {
    DeploymentSummary,
    EnvironmentSummary,
    ProjectSummary,
    ResourceSummary,
    ServerSummary,
  } from "@appaloft/contracts";

  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import * as Table from "$lib/components/ui/table";
  import {
    deploymentDetailHref,
    findEnvironment,
    findProject,
    findResource,
    findServer,
    formatTime,
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

<div class="border-y">
  <Table.Root>
    <Table.Header>
      <Table.Row class="hover:bg-transparent">
        <Table.Head class="min-w-64">{$t(i18nKeys.common.domain.source)}</Table.Head>
        <Table.Head>{$t(i18nKeys.common.domain.status)}</Table.Head>
        {#if showProject}
          <Table.Head>{$t(i18nKeys.common.domain.project)}</Table.Head>
        {/if}
        {#if showEnvironment}
          <Table.Head>{$t(i18nKeys.common.domain.environment)}</Table.Head>
        {/if}
        {#if showResource}
          <Table.Head>{$t(i18nKeys.common.domain.resource)}</Table.Head>
        {/if}
        {#if showServer}
          <Table.Head>{$t(i18nKeys.common.domain.server)}</Table.Head>
        {/if}
        {#if showExecution}
          <Table.Head>{$t(i18nKeys.console.deployments.executionShape)}</Table.Head>
        {/if}
        <Table.Head>{$t(i18nKeys.common.domain.createdAt)}</Table.Head>
        <Table.Head class="w-12"><span class="sr-only">{$t(i18nKeys.common.actions.viewDetails)}</span></Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each deployments as deployment (deployment.id)}
        {@const project = findProject(projects, deployment.projectId)}
        {@const environment = findEnvironment(environments, deployment.environmentId)}
        {@const resource = findResource(resources, deployment.resourceId)}
        {@const server = findServer(servers, deployment.serverId)}
        <Table.Row class="group">
          <Table.Cell class="max-w-80">
            <a href={deploymentDetailHref(deployment)} class="block min-w-0 underline-offset-4 group-hover:underline">
              <span class="block truncate font-medium">{deployment.runtimePlan.source.displayName}</span>
              <span class="mt-1 block truncate text-xs text-muted-foreground">
                {deployment.runtimePlan.source.locator}
              </span>
            </a>
          </Table.Cell>
          <Table.Cell>
            <DeploymentStatusBadge status={deployment.status} />
          </Table.Cell>
          {#if showProject}
            <Table.Cell class="max-w-44 truncate">
              {project?.name ?? deployment.projectId}
            </Table.Cell>
          {/if}
          {#if showEnvironment}
            <Table.Cell class="max-w-40 truncate">
              {environment?.name ?? deployment.environmentId}
            </Table.Cell>
          {/if}
          {#if showResource}
            <Table.Cell class="max-w-44 truncate">
              {resource?.name ?? deployment.resourceId}
            </Table.Cell>
          {/if}
          {#if showServer}
            <Table.Cell class="max-w-44 truncate">
              {server?.name ?? deployment.serverId}
            </Table.Cell>
          {/if}
          {#if showExecution}
            <Table.Cell class="max-w-40 truncate">
              {deployment.runtimePlan.buildStrategy}
            </Table.Cell>
          {/if}
          <Table.Cell class="text-muted-foreground">
            {formatTime(deployment.createdAt)}
          </Table.Cell>
          <Table.Cell class="text-right">
            <a
              href={deploymentDetailHref(deployment)}
              aria-label={$t(i18nKeys.common.actions.viewDetails)}
              class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowRight class="size-4" />
            </a>
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>

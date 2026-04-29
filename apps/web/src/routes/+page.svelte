<script lang="ts">
  import { browser } from "$app/environment";
  import { ArrowRight, Rocket, Server, ShieldCheck, Waypoints } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    countProjectEnvironments,
    countProjectResources,
    findProject,
    formatTime,
    projectDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const {
    readinessQuery,
    versionQuery,
    projectsQuery,
    serversQuery,
    environmentsQuery,
    resourcesQuery,
    deploymentsQuery,
  } = createConsoleQueries(browser);

  const readiness = $derived(readinessQuery.data ?? null);
  const version = $derived(versionQuery.data ?? null);
  const projects = $derived(projectsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    versionQuery.isPending ||
      projectsQuery.isPending ||
      serversQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      deploymentsQuery.isPending,
  );
  const hasNoDeploymentBase = $derived(projects.length === 0 && deployments.length === 0);
  const hasProjectsWithoutDeployments = $derived(projects.length > 0 && deployments.length === 0);
  const latestDeployment = $derived(deployments[0] ?? null);
  const latestProject = $derived(latestDeployment ? findProject(projects, latestDeployment.projectId) : null);

</script>

<svelte:head>
  <title>{$t(i18nKeys.console.home.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell title={$t(i18nKeys.console.home.pageTitle)} description={$t(i18nKeys.console.home.pageDescription)}>
  {#if pageLoading}
    <div class="space-y-6">
      <div class="grid border-y md:grid-cols-4 md:divide-x">
        {#each Array.from({ length: 4 }) as _, index (index)}
          <div class="space-y-3 px-0 py-4 md:px-4">
            <Skeleton class="h-4 w-20" />
            <Skeleton class="h-8 w-16" />
          </div>
        {/each}
      </div>
      <section class="space-y-4">
        <div class="space-y-3">
          <Skeleton class="h-5 w-40" />
          <Skeleton class="h-4 w-64" />
        </div>
        <div class="space-y-3">
          <Skeleton class="h-20 w-full" />
          <Skeleton class="h-20 w-full" />
        </div>
      </section>
    </div>
  {:else}
    <div class="space-y-8">
      {#if hasNoDeploymentBase}
        <section class="console-panel overflow-hidden">
          <div class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div class="space-y-4 p-5">
              <Badge class="console-page-kicker" variant="outline">{$t(i18nKeys.console.home.targetNeeded)}</Badge>
              <div class="max-w-3xl space-y-2">
                <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.home.deploymentBaseTitle)}</h1>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.home.deploymentBaseBody)}
                </p>
              </div>
              <Button href="/deploy" class="w-fit">
                <Rocket class="size-4" />
                {$t(i18nKeys.common.actions.newDeployment)}
              </Button>
            </div>
            <div class="border-t bg-muted/20 p-5 lg:border-l lg:border-t-0">
              <div class="mb-3 space-y-1">
                <p class="text-sm font-medium">{$t(i18nKeys.common.actions.newDeployment)}</p>
                <p class="font-mono text-xs text-muted-foreground">detect -> plan -> execute -> verify -> rollback</p>
              </div>
              <div class="grid gap-2">
                {#each [
                  $t(i18nKeys.console.home.deploymentFlowSource),
                  $t(i18nKeys.console.home.deploymentFlowCreateProject),
                  $t(i18nKeys.console.home.deploymentFlowCreateServer),
                  $t(i18nKeys.console.home.deploymentFlowCreateEnvironment),
                  $t(i18nKeys.console.home.deploymentFlowDeploymentRecord),
                ] as step, index (step)}
                  <div class="flex items-center gap-3 rounded-md bg-background px-3 py-2">
                    <span class={index === 0 ? "flex size-6 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground" : "flex size-6 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground"}>
                      {index + 1}
                    </span>
                    <span class="min-w-0 text-sm font-medium">{step}</span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </section>
      {:else if hasProjectsWithoutDeployments}
        <section class="flex flex-col gap-4 bg-amber-50/70 px-4 py-5 md:flex-row md:items-center md:justify-between">
          <div class="space-y-2">
            <Badge class="w-fit border-amber-400 text-amber-900" variant="outline">{$t(i18nKeys.console.deployments.noFilteredDeployments)}</Badge>
            <h1 class="text-xl font-semibold text-amber-950">{$t(i18nKeys.console.home.deploymentsWithoutRecordsTitle)}</h1>
            <p class="text-sm text-amber-900">
              {$t(i18nKeys.console.home.deploymentsWithoutRecordsBody, { count: projects.length })}
            </p>
          </div>
        </section>
      {/if}

      <section class="console-metric-strip md:grid-cols-4">
        <div class="space-y-3">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$t(i18nKeys.common.domain.projects)}</p>
          <p class="text-2xl font-semibold">{projects.length}</p>
            <Button href="/projects" variant="ghost" class="px-0">
              {$t(i18nKeys.common.actions.viewProjects)}
              <ArrowRight class="size-4" />
            </Button>
        </div>
        <div class="space-y-3">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$t(i18nKeys.common.domain.deployments)}</p>
          <p class="text-2xl font-semibold">{deployments.length}</p>
            <Button href="/deployments" variant="ghost" class="px-0">
              {$t(i18nKeys.common.actions.viewDeployments)}
              <ArrowRight class="size-4" />
            </Button>
        </div>
        <div class="space-y-3">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$t(i18nKeys.common.domain.servers)}</p>
          <p class="text-2xl font-semibold">{servers.length}</p>
          <p class="text-sm text-muted-foreground">
            {servers.length > 0 ? $t(i18nKeys.console.home.serverAvailableTarget) : $t(i18nKeys.console.home.serverCreatedDuringDeployment)}
          </p>
        </div>
        <div class="space-y-3">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{$t(i18nKeys.common.domain.environments)}</p>
          <p class="text-2xl font-semibold">{environments.length}</p>
          <p class="text-sm text-muted-foreground">
            {environments.length > 0 ? $t(i18nKeys.console.home.environmentSnapshotEntry) : $t(i18nKeys.console.home.environmentCreatedDuringDeployment)}
          </p>
        </div>
      </section>

      <section class="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <section class="space-y-4">
          <div>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.home.latestDeploymentTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">{$t(i18nKeys.console.home.latestDeploymentDescription)}</p>
          </div>
            {#if latestDeployment}
              <div class="console-panel space-y-4 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-medium">{latestDeployment.runtimePlan.source.displayName}</p>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {latestProject?.name ?? latestDeployment.projectId} · {formatTime(latestDeployment.createdAt)}
                    </p>
                  </div>
                  <DeploymentStatusBadge status={latestDeployment.status} />
                </div>
                <Button href="/deployments" variant="outline">
                  {$t(i18nKeys.common.actions.openDeployments)}
                  <ArrowRight class="size-4" />
                </Button>
              </div>
            {:else}
              <div class="console-subtle-panel px-4 py-6 text-sm text-muted-foreground">
                {$t(i18nKeys.console.home.latestDeploymentEmpty)}
              </div>
            {/if}
        </section>

        <section class="space-y-4">
          <div>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.home.projectRelationsTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">{$t(i18nKeys.console.home.projectRelationsDescription)}</p>
          </div>
            {#if projects.length > 0}
              <div class="console-record-list">
              {#each projects.slice(0, 3) as project (project.id)}
                <a
                  href={projectDetailHref(project.id)}
                  class="console-record-row sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <span>
                    <span class="block text-sm font-medium">{project.name}</span>
                    <span class="block text-xs text-muted-foreground">{project.slug}</span>
                  </span>
                  <span class="flex flex-wrap justify-end gap-2 text-xs text-muted-foreground">
                    <span>{countProjectEnvironments(project, environments)} {$t(i18nKeys.common.domain.environments)}</span>
                    <span>{countProjectResources(project, resources)} {$t(i18nKeys.common.domain.resources)}</span>
                  </span>
                </a>
              {/each}
              </div>
            {:else}
              <div class="console-subtle-panel px-4 py-6 text-sm text-muted-foreground">
                {$t(i18nKeys.console.home.projectRelationsEmpty)}
              </div>
            {/if}
        </section>
      </section>

      <section class="console-metric-strip md:grid-cols-3">
        <div>
          <div class="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck class="size-4 text-muted-foreground" />
            {$t(i18nKeys.console.home.readinessCard)}
          </div>
          <p class="mt-3 text-sm text-muted-foreground">{readiness?.status ?? "unknown"}</p>
        </div>
        <div>
          <div class="flex items-center gap-2 text-sm font-medium">
            <Waypoints class="size-4 text-muted-foreground" />
            {$t(i18nKeys.console.home.modeCard)}
          </div>
          <p class="mt-3 text-sm text-muted-foreground">{version?.mode ?? "self-hosted"}</p>
        </div>
        <div>
          <div class="flex items-center gap-2 text-sm font-medium">
            <Server class="size-4 text-muted-foreground" />
            {$t(i18nKeys.console.home.databaseCard)}
          </div>
          <p class="mt-3 text-sm text-muted-foreground">
            {readiness?.details?.databaseDriver ?? "unknown"}
          </p>
        </div>
      </section>
    </div>
  {/if}
</ConsoleShell>

<script lang="ts">
  import { browser } from "$app/environment";
  import { ArrowRight, FolderOpen, Server, ShieldCheck, Waypoints } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    countProjectDeployments,
    countProjectEnvironments,
    deploymentBadgeVariant,
    findProject,
    formatTime,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const {
    readinessQuery,
    versionQuery,
    projectsQuery,
    serversQuery,
    environmentsQuery,
    deploymentsQuery,
  } = createConsoleQueries(browser);

  const readiness = $derived(readinessQuery.data ?? null);
  const version = $derived(versionQuery.data ?? null);
  const projects = $derived(projectsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    versionQuery.isPending ||
      projectsQuery.isPending ||
      serversQuery.isPending ||
      environmentsQuery.isPending ||
      deploymentsQuery.isPending,
  );
  const hasNoDeploymentBase = $derived(projects.length === 0 && deployments.length === 0);
  const hasProjectsWithoutDeployments = $derived(projects.length > 0 && deployments.length === 0);
  const latestDeployment = $derived(deployments[0] ?? null);
  const latestProject = $derived(latestDeployment ? findProject(projects, latestDeployment.projectId) : null);

</script>

<svelte:head>
  <title>{$t(i18nKeys.console.home.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell title={$t(i18nKeys.console.home.pageTitle)} description={$t(i18nKeys.console.home.pageDescription)}>
  {#if pageLoading}
    <div class="space-y-6">
      <div class="grid gap-4 md:grid-cols-4">
        {#each Array.from({ length: 4 }) as _, index (index)}
          <Card>
            <CardHeader class="space-y-3">
              <Skeleton class="h-4 w-20" />
              <Skeleton class="h-8 w-16" />
            </CardHeader>
          </Card>
        {/each}
      </div>
      <Card>
        <CardHeader>
          <Skeleton class="h-5 w-40" />
          <Skeleton class="h-4 w-64" />
        </CardHeader>
        <CardContent class="space-y-3">
          <Skeleton class="h-20 w-full" />
          <Skeleton class="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  {:else}
    <div class="space-y-6">
      {#if hasNoDeploymentBase}
        <section class="overflow-hidden rounded-lg border bg-background">
          <div class="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div class="space-y-5 p-6 md:p-8">
              <Badge class="w-fit" variant="outline">{$t(i18nKeys.console.home.targetNeeded)}</Badge>
              <div class="max-w-2xl space-y-3">
                <h1 class="text-2xl font-semibold md:text-3xl">{$t(i18nKeys.console.home.deploymentBaseTitle)}</h1>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.home.deploymentBaseBody)}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button href="/projects" size="lg" variant="outline">
                  <FolderOpen class="size-4" />
                  {$t(i18nKeys.common.actions.viewProjects)}
                </Button>
              </div>
            </div>
            <div class="border-t bg-muted/40 p-6 lg:border-l lg:border-t-0">
              <div class="grid gap-3">
                {#each [
                  $t(i18nKeys.console.home.deploymentFlowSource),
                  $t(i18nKeys.console.home.deploymentFlowCreateProject),
                  $t(i18nKeys.console.home.deploymentFlowCreateServer),
                  $t(i18nKeys.console.home.deploymentFlowCreateEnvironment),
                  $t(i18nKeys.console.home.deploymentFlowDeploymentRecord),
                ] as step, index (step)}
                  <div class="flex items-center gap-3 rounded-md border bg-background px-4 py-3">
                    <span class="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground">
                      {index + 1}
                    </span>
                    <span class="text-sm font-medium">{step}</span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </section>
      {:else if hasProjectsWithoutDeployments}
        <section class="flex flex-col gap-4 rounded-lg border border-amber-300/70 bg-amber-50/70 p-5 md:flex-row md:items-center md:justify-between">
          <div class="space-y-2">
            <Badge class="w-fit border-amber-400 text-amber-900" variant="outline">{$t(i18nKeys.console.deployments.noFilteredDeployments)}</Badge>
            <h1 class="text-xl font-semibold text-amber-950">{$t(i18nKeys.console.home.deploymentsWithoutRecordsTitle)}</h1>
            <p class="text-sm text-amber-900">
              {$t(i18nKeys.console.home.deploymentsWithoutRecordsBody, { count: projects.length })}
            </p>
          </div>
        </section>
      {/if}

      <section class="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>{$t(i18nKeys.common.domain.projects)}</CardDescription>
            <CardTitle class="text-2xl">{projects.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button href="/projects" variant="ghost" class="px-0">
              {$t(i18nKeys.common.actions.viewProjects)}
              <ArrowRight class="size-4" />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>{$t(i18nKeys.common.domain.deployments)}</CardDescription>
            <CardTitle class="text-2xl">{deployments.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button href="/deployments" variant="ghost" class="px-0">
              {$t(i18nKeys.common.actions.viewDeployments)}
              <ArrowRight class="size-4" />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>{$t(i18nKeys.common.domain.servers)}</CardDescription>
            <CardTitle class="text-2xl">{servers.length}</CardTitle>
          </CardHeader>
          <CardContent class="text-sm text-muted-foreground">
            {servers.length > 0 ? $t(i18nKeys.console.home.serverAvailableTarget) : $t(i18nKeys.console.home.serverCreatedDuringDeployment)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>{$t(i18nKeys.common.domain.environments)}</CardDescription>
            <CardTitle class="text-2xl">{environments.length}</CardTitle>
          </CardHeader>
          <CardContent class="text-sm text-muted-foreground">
            {environments.length > 0 ? $t(i18nKeys.console.home.environmentSnapshotEntry) : $t(i18nKeys.console.home.environmentCreatedDuringDeployment)}
          </CardContent>
        </Card>
      </section>

      <section class="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{$t(i18nKeys.console.home.latestDeploymentTitle)}</CardTitle>
            <CardDescription>{$t(i18nKeys.console.home.latestDeploymentDescription)}</CardDescription>
          </CardHeader>
          <CardContent>
            {#if latestDeployment}
              <div class="space-y-4 rounded-md border p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-medium">{latestDeployment.runtimePlan.source.displayName}</p>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {latestProject?.name ?? latestDeployment.projectId} · {formatTime(latestDeployment.createdAt)}
                    </p>
                  </div>
                  <Badge variant={deploymentBadgeVariant(latestDeployment.status)}>
                    {latestDeployment.status}
                  </Badge>
                </div>
                <Button href="/deployments" variant="outline">
                  {$t(i18nKeys.common.actions.openDeployments)}
                  <ArrowRight class="size-4" />
                </Button>
              </div>
            {:else}
              <div class="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                {$t(i18nKeys.console.home.latestDeploymentEmpty)}
              </div>
            {/if}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{$t(i18nKeys.console.home.projectRelationsTitle)}</CardTitle>
            <CardDescription>{$t(i18nKeys.console.home.projectRelationsDescription)}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            {#if projects.length > 0}
              {#each projects.slice(0, 3) as project (project.id)}
                <a
                  href={`/projects?projectId=${project.id}`}
                  class="flex items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <span>
                    <span class="block text-sm font-medium">{project.name}</span>
                    <span class="block text-xs text-muted-foreground">{project.slug}</span>
                  </span>
                  <span class="flex flex-wrap justify-end gap-2 text-xs text-muted-foreground">
                    <span>{countProjectEnvironments(project, environments)} {$t(i18nKeys.common.domain.environments)}</span>
                    <span>{countProjectDeployments(project, deployments)} {$t(i18nKeys.common.domain.deployments)}</span>
                  </span>
                </a>
              {/each}
            {:else}
              <div class="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                {$t(i18nKeys.console.home.projectRelationsEmpty)}
              </div>
            {/if}
          </CardContent>
        </Card>
      </section>

      <section class="grid gap-4 md:grid-cols-3">
        <div class="rounded-lg border bg-background p-4">
          <div class="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck class="size-4 text-muted-foreground" />
            {$t(i18nKeys.console.home.readinessCard)}
          </div>
          <p class="mt-3 text-sm text-muted-foreground">{readiness?.status ?? "unknown"}</p>
        </div>
        <div class="rounded-lg border bg-background p-4">
          <div class="flex items-center gap-2 text-sm font-medium">
            <Waypoints class="size-4 text-muted-foreground" />
            {$t(i18nKeys.console.home.modeCard)}
          </div>
          <p class="mt-3 text-sm text-muted-foreground">{version?.mode ?? "self-hosted"}</p>
        </div>
        <div class="rounded-lg border bg-background p-4">
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

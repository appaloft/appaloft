<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { ArrowRight, FolderOpen } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    deploymentBadgeVariant,
    findEnvironment,
    findProject,
    formatTime,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { projectsQuery, environmentsQuery, deploymentsQuery } = createConsoleQueries(browser);

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending || environmentsQuery.isPending || deploymentsQuery.isPending,
  );
  const requestedProjectId = $derived(
    browser ? (page.url.searchParams.get("projectId") ?? "") : "",
  );
  const selectedProject = $derived(
    requestedProjectId ? findProject(projects, requestedProjectId) : null,
  );
  const visibleDeployments = $derived(
    selectedProject
      ? deployments.filter((deployment) => deployment.projectId === selectedProject.id)
      : deployments,
  );
  const runningDeployments = $derived(
    visibleDeployments.filter((deployment) =>
      ["created", "planning", "planned", "running"].includes(deployment.status),
    ).length,
  );
  const failedDeployments = $derived(
    visibleDeployments.filter((deployment) =>
      ["failed", "canceled", "rolled-back"].includes(deployment.status),
    ).length,
  );

</script>

<svelte:head>
  <title>{$t(i18nKeys.console.deployments.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.deployments.pageTitle)}
  description={selectedProject
    ? $t(i18nKeys.console.deployments.pageDescriptionForProject, {
        projectName: selectedProject.name,
      })
    : $t(i18nKeys.console.deployments.pageDescription)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <section class="rounded-lg border bg-background p-5">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="mt-3 h-4 w-72" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 6 }) as _, index (index)}
          <Skeleton class="h-24 w-full" />
        {/each}
      </div>
    </div>
  {:else if deployments.length === 0}
    <section class="rounded-lg border bg-background p-6 md:p-8">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.console.deployments.noFilteredDeployments)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.deployments.emptyTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.deployments.emptyBody)}
        </p>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
        <Button href="/projects" size="lg" variant="outline">
          <FolderOpen class="size-4" />
          {$t(i18nKeys.common.actions.viewProjects)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-5">
      <section
        class="flex flex-col gap-4 rounded-lg border bg-background p-5 md:flex-row md:items-center md:justify-between"
      >
        <div class="max-w-2xl space-y-2">
          <Badge class="w-fit" variant="outline">
            {selectedProject ? selectedProject.name : $t(i18nKeys.console.deployments.allProjects)}
          </Badge>
          <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.deployments.focusTitle)}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.deployments.focusDescription)}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          {#if selectedProject}
            <Button href="/deployments" variant="outline">{$t(i18nKeys.common.actions.viewAll)}</Button>
          {/if}
        </div>
      </section>

      <section class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-md border bg-background px-4 py-3">
          <p class="text-sm text-muted-foreground">{$t(i18nKeys.common.domain.currentList)}</p>
          <p class="mt-1 text-2xl font-semibold">{visibleDeployments.length}</p>
        </div>
        <div class="rounded-md border bg-background px-4 py-3">
          <p class="text-sm text-muted-foreground">{$t(i18nKeys.console.deployments.inFlight)}</p>
          <p class="mt-1 text-2xl font-semibold">{runningDeployments}</p>
        </div>
        <div class="rounded-md border bg-background px-4 py-3">
          <p class="text-sm text-muted-foreground">{$t(i18nKeys.console.deployments.needsAttention)}</p>
          <p class="mt-1 text-2xl font-semibold">{failedDeployments}</p>
        </div>
      </section>

      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.deployments.listTitle)}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.deployments.listDescription)}
          </p>
        </div>

        {#if visibleDeployments.length > 0}
          <div class="space-y-3">
            {#each visibleDeployments as deployment (deployment.id)}
              {@const project = findProject(projects, deployment.projectId)}
              {@const environment = findEnvironment(environments, deployment.environmentId)}
              <a
                href={`/deployments/${deployment.id}`}
                class="group block rounded-lg border bg-background p-4 transition-colors hover:border-foreground/30 hover:bg-muted/35"
              >
                <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div class="min-w-0 space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <Badge variant={deploymentBadgeVariant(deployment.status)}>
                        {deployment.status}
                      </Badge>
                      <span class="text-xs text-muted-foreground">{formatTime(deployment.createdAt)}</span>
                    </div>
                    <h3 class="truncate text-base font-semibold">
                      {deployment.runtimePlan.source.displayName}
                    </h3>
                    <p class="line-clamp-1 text-sm text-muted-foreground">
                      {deployment.runtimePlan.source.locator}
                    </p>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-3 lg:min-w-[34rem]">
                    <div class="rounded-md border bg-background px-3 py-2">
                      <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.project)}</p>
                      <p class="mt-1 truncate text-sm font-medium">
                        {project?.name ?? deployment.projectId}
                      </p>
                    </div>
                    <div class="rounded-md border bg-background px-3 py-2">
                      <p class="text-xs text-muted-foreground">
                        {$t(i18nKeys.common.domain.environment)}
                      </p>
                      <p class="mt-1 truncate text-sm font-medium">
                        {environment?.name ?? deployment.environmentId}
                      </p>
                    </div>
                    <div class="rounded-md border bg-background px-3 py-2">
                      <p class="text-xs text-muted-foreground">
                        {$t(i18nKeys.console.deployments.executionShape)}
                      </p>
                      <p class="mt-1 truncate text-sm font-medium">
                        {deployment.runtimePlan.buildStrategy}
                      </p>
                    </div>
                  </div>

                  <span
                    class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground"
                  >
                    {$t(i18nKeys.common.actions.viewDetails)}
                    <ArrowRight class="size-4" />
                  </span>
                </div>
              </a>
            {/each}
          </div>
        {:else}
          <div class="rounded-lg border border-dashed bg-background p-6 text-sm text-muted-foreground">
            {$t(i18nKeys.console.deployments.noFilteredDeployments)}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</ConsoleShell>

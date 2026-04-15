<script lang="ts">
  import { browser } from "$app/environment";
  import { ArrowRight, FolderOpen, ShieldCheck } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import ResourceStatusDot from "$lib/components/console/ResourceStatusDot.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    countProjectEnvironments,
    formatTime,
    latestProjectDeployment,
    latestResourceDeploymentStatus,
    projectDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { projectsQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser);

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      deploymentsQuery.isPending,
  );
  const activeProjects = $derived(
    projects.filter((project) => resources.some((resource) => resource.projectId === project.id))
      .length,
  );

</script>

<svelte:head>
  <title>{$t(i18nKeys.console.projects.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.projects.pageTitle)}
  description={$t(i18nKeys.console.projects.description)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <section class="space-y-3">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="h-4 w-72" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 5 }) as _, index (index)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    </div>
  {:else if projects.length === 0}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.console.shell.noProjects)}</Badge>
      <div class="max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.projects.emptyTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.projects.emptyBody)}
        </p>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
        <Button href="/deployments" size="lg" variant="outline">
          {$t(i18nKeys.common.actions.openDeployments)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div class="max-w-2xl space-y-2">
          <Badge class="w-fit" variant="outline">{$t(i18nKeys.console.projects.focusLabel)}</Badge>
          <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.projects.focusTitle)}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.projects.focusDescription)}
          </p>
        </div>
        <div class="grid grid-cols-3 divide-x border-y text-center md:min-w-80">
          <div class="px-3 py-3">
            <p class="text-xl font-semibold">{projects.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.common.domain.projects)}</p>
          </div>
          <div class="px-3 py-3">
            <p class="text-xl font-semibold">{activeProjects}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.console.projects.projectsWithResources)}
            </p>
          </div>
          <div class="px-3 py-3">
            <p class="text-xl font-semibold">{resources.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.common.domain.resources)}</p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <div>
          <div>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.projectListTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.projects.projectListDescription)}
            </p>
          </div>
        </div>

        <div class="divide-y border-y">
          {#each projects as project (project.id)}
            {@const projectResources = resources.filter((resource) => resource.projectId === project.id)}
            {@const latestDeployment = latestProjectDeployment(project, deployments)}
            {@const latestResource =
              projectResources.find((resource) => resource.lastDeploymentId === latestDeployment?.id) ??
              projectResources[0]}
            {@const latestResourceStatus = latestResource
              ? latestResourceDeploymentStatus(latestResource, deployments)
              : undefined}
            <a
              href={projectDetailHref(project.id)}
              class="group grid gap-3 py-4 transition-colors hover:bg-muted/35 lg:grid-cols-[minmax(0,1fr)_36rem_auto] lg:px-3"
            >
              <div class="min-w-0 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate text-base font-semibold">{project.name}</h3>
                  <Badge variant="outline">{project.slug}</Badge>
                </div>
                <p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {project.description ?? $t(i18nKeys.console.projects.noDescription)}
                </p>
              </div>

              <div class="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                <span class="inline-flex items-center gap-2">
                  <ShieldCheck class="size-3.5" />
                  {countProjectEnvironments(project, environments)}
                  {$t(i18nKeys.common.domain.environments)}
                </span>
                <span class="inline-flex items-center gap-2">
                  <FolderOpen class="size-3.5" />
                  {projectResources.length} {$t(i18nKeys.common.domain.resources)}
                </span>
                <span class="flex min-w-0 items-center gap-2">
                  {#if latestResource}
                    <ResourceStatusDot status={latestResourceStatus} class="shrink-0" />
                    <span class="truncate">
                      {latestResource.name}
                      {#if latestDeployment}
                        · {formatTime(latestDeployment.createdAt)}
                      {/if}
                    </span>
                  {:else}
                    {$t(i18nKeys.console.projects.noResourcesShort)}
                  {/if}
                </span>
              </div>

              <span
                class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground"
              >
                {$t(i18nKeys.common.actions.viewDetails)}
                <ArrowRight class="size-4" />
              </span>
            </a>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</ConsoleShell>

<script lang="ts">
  import { browser } from "$app/environment";
  import { ArrowRight, FolderOpen, Rocket, ShieldCheck } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    countProjectDeployments,
    countProjectEnvironments,
    deploymentBadgeVariant,
    formatTime,
    latestProjectDeployment,
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
    projects.filter((project) => countProjectDeployments(project, deployments) > 0).length,
  );

</script>

<svelte:head>
  <title>{$t(i18nKeys.console.projects.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.projects.pageTitle)}
  description={$t(i18nKeys.console.projects.description)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <section class="rounded-lg border bg-background p-5">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="mt-3 h-4 w-72" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 5 }) as _, index (index)}
          <Skeleton class="h-24 w-full" />
        {/each}
      </div>
    </div>
  {:else if projects.length === 0}
    <section class="rounded-lg border bg-background p-6 md:p-8">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.console.shell.noProjects)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
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
    <div class="space-y-5">
      <section
        class="flex flex-col gap-4 rounded-lg border bg-background p-5 md:flex-row md:items-center md:justify-between"
      >
        <div class="max-w-2xl space-y-2">
          <Badge class="w-fit" variant="outline">{$t(i18nKeys.console.projects.focusLabel)}</Badge>
          <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.projects.focusTitle)}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.projects.focusDescription)}
          </p>
        </div>
        <div class="grid grid-cols-3 gap-3 text-center md:min-w-80">
          <div class="rounded-md border px-3 py-2">
            <p class="text-xl font-semibold">{projects.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.common.domain.projects)}</p>
          </div>
          <div class="rounded-md border px-3 py-2">
            <p class="text-xl font-semibold">{activeProjects}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.console.projects.activeProjects)}
            </p>
          </div>
          <div class="rounded-md border px-3 py-2">
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

        <div class="space-y-3">
          {#each projects as project (project.id)}
            {@const latestDeployment = latestProjectDeployment(project, deployments)}
            <a
              href={`/projects/${project.id}`}
              class="group block rounded-lg border bg-background p-4 transition-colors hover:border-foreground/30 hover:bg-muted/35"
            >
              <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div class="min-w-0 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="truncate text-base font-semibold">{project.name}</h3>
                    <Badge variant="outline">{project.slug}</Badge>
                  </div>
                  <p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {project.description ?? $t(i18nKeys.console.projects.noDescription)}
                  </p>
                </div>

                <div class="grid gap-3 sm:grid-cols-3 lg:min-w-[34rem]">
                  <div class="rounded-md border bg-background px-3 py-2">
                    <p class="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck class="size-3.5" />
                      {$t(i18nKeys.common.domain.environments)}
                    </p>
                    <p class="mt-1 text-sm font-medium">
                      {countProjectEnvironments(project, environments)}
                    </p>
                  </div>
                  <div class="rounded-md border bg-background px-3 py-2">
                    <p class="flex items-center gap-2 text-xs text-muted-foreground">
                      <Rocket class="size-3.5" />
                      {$t(i18nKeys.common.domain.deployments)}
                    </p>
                    <p class="mt-1 text-sm font-medium">
                      {countProjectDeployments(project, deployments)}
                    </p>
                  </div>
                  <div class="rounded-md border bg-background px-3 py-2">
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.projects.lastDeployment)}
                    </p>
                    {#if latestDeployment}
                      <p class="mt-1 flex items-center gap-2 text-sm font-medium">
                        <Badge variant={deploymentBadgeVariant(latestDeployment.status)}>
                          {latestDeployment.status}
                        </Badge>
                        <span class="truncate">{formatTime(latestDeployment.createdAt)}</span>
                      </p>
                    {:else}
                      <p class="mt-1 text-sm font-medium">
                        {$t(i18nKeys.console.projects.noDeploymentShort)}
                      </p>
                    {/if}
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
      </section>
    </div>
  {/if}
</ConsoleShell>

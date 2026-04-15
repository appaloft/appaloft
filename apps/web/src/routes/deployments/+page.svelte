<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { FolderOpen } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import { findProject } from "$lib/console/utils";
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
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.deployments.pageTitle) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <section class="space-y-3">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="h-4 w-72" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 6 }) as _, index (index)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    </div>
  {:else if deployments.length === 0}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.console.deployments.noFilteredDeployments)}</Badge>
      <div class="max-w-2xl space-y-3">
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
    <div class="space-y-8">
      <section class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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

      <section class="grid border-y sm:grid-cols-3 sm:divide-x">
        <div class="px-0 py-4 sm:px-4">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {$t(i18nKeys.common.domain.currentList)}
          </p>
          <p class="mt-1 text-2xl font-semibold">{visibleDeployments.length}</p>
        </div>
        <div class="border-t px-0 py-4 sm:border-t-0 sm:px-4">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {$t(i18nKeys.console.deployments.inFlight)}
          </p>
          <p class="mt-1 text-2xl font-semibold">{runningDeployments}</p>
        </div>
        <div class="border-t px-0 py-4 sm:border-t-0 sm:px-4">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {$t(i18nKeys.console.deployments.needsAttention)}
          </p>
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
          <DeploymentTable deployments={visibleDeployments} {projects} {environments} />
        {:else}
          <div class="bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
            {$t(i18nKeys.console.deployments.noFilteredDeployments)}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</ConsoleShell>

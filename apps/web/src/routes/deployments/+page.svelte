<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { ArrowRight, ChevronLeft, ChevronRight, FolderOpen } from "@lucide/svelte";
  import type { DeploymentSummary } from "@appaloft/contracts";

  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    findEnvironment,
    findProject,
    findResource,
    projectDetailHref,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { projectsQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser);

  const deploymentPageSize = 12;
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
  const requestedProjectId = $derived(
    browser ? (page.url.searchParams.get("projectId") ?? "") : "",
  );
  let loadedRequestedProjectId = $state("");
  let projectFilter = $state("all");
  let environmentFilter = $state("all");
  let resourceFilter = $state("all");
  let statusFilter = $state("all");
  let deploymentOffset = $state(0);
  let deploymentFilterSignature = $state("");

  const inFlightDeploymentStatuses = new Set<DeploymentSummary["status"]>([
    "created",
    "planning",
    "planned",
    "running",
    "cancel-requested",
  ]);
  const selectedProject = $derived(
    projectFilter === "all" ? null : findProject(projects, projectFilter),
  );
  const filteredEnvironments = $derived.by(() =>
    projectFilter === "all"
      ? []
      : environments.filter((environment) => environment.projectId === projectFilter),
  );
  const filteredResourcesForProject = $derived.by(() =>
    projectFilter === "all"
      ? []
      : resources.filter((resource) => {
          if (resource.projectId !== projectFilter) return false;
          if (environmentFilter !== "all" && resource.environmentId !== environmentFilter) {
            return false;
          }
          return true;
        }),
  );
  const deploymentStatuses = $derived.by(() =>
    Array.from(new Set(deployments.map((deployment) => deployment.status))).sort(),
  );
  const visibleDeployments = $derived.by(() =>
    deployments.filter((deployment) => {
      if (projectFilter !== "all" && deployment.projectId !== projectFilter) return false;
      if (environmentFilter !== "all" && deployment.environmentId !== environmentFilter) {
        return false;
      }
      if (resourceFilter !== "all" && deployment.resourceId !== resourceFilter) return false;
      if (statusFilter !== "all" && deployment.status !== statusFilter) return false;
      return true;
    }),
  );
  const visibleInFlightDeployments = $derived(
    visibleDeployments.filter((deployment) => inFlightDeploymentStatuses.has(deployment.status)),
  );
  const visibleFailedDeployments = $derived(
    visibleDeployments.filter((deployment) => deployment.status === "failed"),
  );
  const visibleSucceededDeployments = $derived(
    visibleDeployments.filter((deployment) => deployment.status === "succeeded"),
  );
  const deploymentTotal = $derived(visibleDeployments.length);
  const deploymentPageStart = $derived(deploymentTotal === 0 ? 0 : deploymentOffset + 1);
  const deploymentPageEnd = $derived(
    Math.min(deploymentOffset + deploymentPageSize, deploymentTotal),
  );
  const paginatedDeployments = $derived(
    visibleDeployments.slice(deploymentOffset, deploymentOffset + deploymentPageSize),
  );
  const canGoPrevious = $derived(deploymentOffset > 0);
  const canGoNext = $derived(deploymentOffset + deploymentPageSize < deploymentTotal);
  const selectedEnvironment = $derived(
    environmentFilter === "all" ? null : findEnvironment(environments, environmentFilter),
  );
  const selectedResource = $derived(
    resourceFilter === "all" ? null : findResource(resources, resourceFilter),
  );
  const selectedOwnerHref = $derived(
    selectedResource
      ? resourceDetailHref(selectedResource)
      : selectedProject
        ? `${projectDetailHref(selectedProject.id)}?tab=resources`
        : "/projects",
  );
  const selectedOwnerLabel = $derived(
    selectedResource
      ? $t(i18nKeys.common.actions.openResource)
      : selectedProject
        ? $t(i18nKeys.console.deployments.openProjectResources)
        : $t(i18nKeys.common.actions.viewProjects),
  );
  const selectedProjectFilterLabel = $derived(
    selectedProject?.name ?? $t(i18nKeys.console.deployments.allProjects),
  );
  const selectedEnvironmentFilterLabel = $derived(
    selectedEnvironment?.name ??
      (selectedProject
        ? $t(i18nKeys.console.deployments.filterAllEnvironments)
        : $t(i18nKeys.console.deployments.selectProjectFirst)),
  );
  const selectedResourceFilterLabel = $derived(
    selectedResource?.name ??
      (selectedProject
        ? $t(i18nKeys.console.deployments.filterAllResources)
        : $t(i18nKeys.console.deployments.selectProjectFirst)),
  );
  const selectedStatusFilterLabel = $derived(
    statusFilter === "all" ? $t(i18nKeys.console.deployments.filterAllStatuses) : statusLabel(statusFilter),
  );

  $effect(() => {
    if (requestedProjectId === loadedRequestedProjectId) return;
    projectFilter = requestedProjectId || "all";
    loadedRequestedProjectId = requestedProjectId;
  });

  $effect(() => {
    const nextSignature = [projectFilter, environmentFilter, resourceFilter, statusFilter].join("|");
    if (nextSignature !== deploymentFilterSignature) {
      deploymentOffset = 0;
      deploymentFilterSignature = nextSignature;
    }
  });

  $effect(() => {
    if (deploymentOffset >= deploymentTotal && deploymentTotal > 0) {
      deploymentOffset = Math.max(0, Math.floor((deploymentTotal - 1) / deploymentPageSize) * deploymentPageSize);
    }
  });

  $effect(() => {
    if (
      environmentFilter !== "all" &&
      !filteredEnvironments.some((environment) => environment.id === environmentFilter)
    ) {
      environmentFilter = "all";
    }

    if (
      resourceFilter !== "all" &&
      !filteredResourcesForProject.some((resource) => resource.id === resourceFilter)
    ) {
      resourceFilter = "all";
    }
  });

  function statusLabel(status: string): string {
    return status;
  }

  function setDeploymentPage(offset: number): void {
    const maxOffset =
      deploymentTotal === 0
        ? 0
        : Math.floor((deploymentTotal - 1) / deploymentPageSize) * deploymentPageSize;
    deploymentOffset = Math.min(Math.max(offset, 0), maxOffset);
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.deployments.pageTitle)} · Appaloft</title>
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
  <Skeleton name="deployments-list-page" loading={pageLoading} animate="pulse" transition>
    {#snippet fallback()}
      <div class="min-h-96 w-full animate-pulse rounded-lg bg-muted/50" aria-hidden="true"></div>
    {/snippet}
    {#snippet fixture()}
      <ConsoleResourceCanvas class="space-y-6">
        <section class="space-y-2">
          <h1 class="text-2xl font-semibold">Deployments</h1>
          <p class="text-sm text-muted-foreground">Track deployment attempts across projects.</p>
        </section>
        <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {#each ["Records", "In flight", "Failed", "Succeeded"] as label (label)}
            <article class="console-subtle-panel p-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p class="mt-2 text-2xl font-semibold">12</p>
            </article>
          {/each}
        </section>
        <section class="space-y-3">
          <h2 class="text-lg font-semibold">Deployment list</h2>
          <div class="console-subtle-panel px-4 py-6 text-sm text-muted-foreground">
            Sample deployment row · succeeded
          </div>
        </section>
      </ConsoleResourceCanvas>
    {/snippet}
    {#if pageLoading}
      <div class="min-h-96" aria-hidden="true"></div>
    {:else if deployments.length === 0}
      <ConsoleResourceCanvas class="space-y-6">
        <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div class="max-w-2xl space-y-2">
            <div class="flex items-center gap-2">
              <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.deployments.focusTitle)}</h1>
              <DocsHelpLink
                href={webDocsHrefs.deploymentLifecycle}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
              />
            </div>
            <p class="text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.deployments.focusDescription)}
            </p>
          </div>
        </section>

        <ConsoleEmptyState
          tone="deployment"
          title={$t(i18nKeys.console.deployments.emptyTitle)}
          description={$t(i18nKeys.console.deployments.emptyBody)}
          learnMoreHref={webDocsHrefs.deploymentLifecycle}
        >
          <Button href="/projects">
            <FolderOpen class="size-4" />
            {$t(i18nKeys.common.actions.viewProjects)}
          </Button>
        </ConsoleEmptyState>
      </ConsoleResourceCanvas>
    {:else}
      <ConsoleResourceCanvas class="space-y-6">
        <section class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div class="max-w-2xl space-y-2">
            <div class="flex items-center gap-2">
              <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.deployments.focusTitle)}</h1>
              <DocsHelpLink
                href={webDocsHrefs.deploymentLifecycle}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
              />
            </div>
            <p class="text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.deployments.focusDescription)}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            {#if selectedProject}
              <Button href="/deployments" variant="outline">{$t(i18nKeys.common.actions.viewAll)}</Button>
            {/if}
            <Button href={selectedOwnerHref} variant="outline">
              {selectedOwnerLabel}
              <ArrowRight class="size-4" />
            </Button>
          </div>
        </section>

        <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article class="console-subtle-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.deployments.records)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{visibleDeployments.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.console.deployments.filteredRecords)}
            </p>
          </article>
          <article class="console-subtle-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.deployments.inFlight)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{visibleInFlightDeployments.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.console.deployments.runningAttemptHint)}
            </p>
          </article>
          <article class="console-subtle-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.deployments.needsAttention)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{visibleFailedDeployments.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.console.deployments.failedAttemptHint)}
            </p>
          </article>
          <article class="console-subtle-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.status.passed)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{visibleSucceededDeployments.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.console.deployments.succeededAttemptHint)}
            </p>
          </article>
        </section>

        <section
          class="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          data-deployments-feed-display-surface
        >
          <label class="min-w-0 space-y-1.5 text-sm font-medium">
            {$t(i18nKeys.common.domain.project)}
            <Select.Root bind:value={projectFilter} type="single">
              <Select.Trigger class="w-full min-w-0">
                {selectedProjectFilterLabel}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">
                  {$t(i18nKeys.console.deployments.allProjects)}
                </Select.Item>
                {#each projects as project (project.id)}
                  <Select.Item value={project.id}>{project.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>
          <label class="min-w-0 space-y-1.5 text-sm font-medium">
            {$t(i18nKeys.common.domain.environment)}
            <Select.Root bind:value={environmentFilter} disabled={!selectedProject} type="single">
              <Select.Trigger class="w-full min-w-0">
                {selectedEnvironmentFilterLabel}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">
                  {$t(i18nKeys.console.deployments.filterAllEnvironments)}
                </Select.Item>
                {#each filteredEnvironments as environment (environment.id)}
                  <Select.Item value={environment.id}>{environment.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>
          <label class="min-w-0 space-y-1.5 text-sm font-medium">
            {$t(i18nKeys.common.domain.resource)}
            <Select.Root bind:value={resourceFilter} disabled={!selectedProject} type="single">
              <Select.Trigger class="w-full min-w-0">
                {selectedResourceFilterLabel}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">
                  {$t(i18nKeys.console.deployments.filterAllResources)}
                </Select.Item>
                {#each filteredResourcesForProject as resource (resource.id)}
                  <Select.Item value={resource.id}>{resource.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>
          <label class="min-w-0 space-y-1.5 text-sm font-medium">
            {$t(i18nKeys.common.domain.status)}
            <Select.Root bind:value={statusFilter} type="single">
              <Select.Trigger class="w-full min-w-0">
                {selectedStatusFilterLabel}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">
                  {$t(i18nKeys.console.deployments.filterAllStatuses)}
                </Select.Item>
                {#each deploymentStatuses as status (status)}
                  <Select.Item value={status}>{statusLabel(status)}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>
        </section>

        <section class="space-y-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.deployments.listTitle)}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.deployments.listDescription)}
              </p>
            </div>
            {#if visibleDeployments.length > 0}
              <div
                class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
                data-deployment-pagination
              >
                <span>
                  {$t(i18nKeys.console.deployments.listRange, {
                    start: deploymentPageStart,
                    end: deploymentPageEnd,
                    total: deploymentTotal,
                  })}
                </span>
                <div class="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={$t(i18nKeys.common.actions.previous)}
                    disabled={!canGoPrevious}
                    onclick={() => setDeploymentPage(deploymentOffset - deploymentPageSize)}
                  >
                    <ChevronLeft class="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={$t(i18nKeys.common.actions.next)}
                    disabled={!canGoNext}
                    onclick={() => setDeploymentPage(deploymentOffset + deploymentPageSize)}
                  >
                    <ChevronRight class="size-4" />
                  </Button>
                </div>
              </div>
            {/if}
          </div>
          {#if visibleDeployments.length > 0}
            <DeploymentTable deployments={paginatedDeployments} {projects} {environments} {resources} />
          {:else}
            <div class="console-subtle-panel px-4 py-6 text-sm text-muted-foreground">
              {$t(i18nKeys.console.deployments.noFilteredDeployments)}
            </div>
          {/if}
        </section>
      </ConsoleResourceCanvas>
    {/if}
  </Skeleton>
</ConsoleShell>

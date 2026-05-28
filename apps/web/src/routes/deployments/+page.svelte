<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { Play } from "@lucide/svelte";

  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
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
  {#if pageLoading}
    <ConsoleResourceCanvas class="space-y-5">
      <section class="space-y-3">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="h-4 w-72" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 6 }) as _, index (index)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    </ConsoleResourceCanvas>
  {:else if deployments.length === 0}
    <ConsoleResourceCanvas>
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
        <Button href="/deploy">
          <Play class="size-4" />
          {$t(i18nKeys.common.actions.quickDeploy)}
        </Button>
      </ConsoleEmptyState>
    </ConsoleResourceCanvas>
  {:else}
    <ConsoleResourceCanvas class="space-y-8">
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
          <Button href="/deploy">
            <Play class="size-4" />
            {$t(i18nKeys.common.actions.quickDeploy)}
          </Button>
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
          <div class="console-subtle-panel px-4 py-6 text-sm text-muted-foreground">
            {$t(i18nKeys.console.deployments.noFilteredDeployments)}
          </div>
        {/if}
      </section>
    </ConsoleResourceCanvas>
  {/if}
</ConsoleShell>

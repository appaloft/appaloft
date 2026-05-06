<script lang="ts">
  import { browser } from "$app/environment";
  import { ArrowRight, GitPullRequestArrow } from "@lucide/svelte";
  import type { PreviewEnvironmentStatus } from "@appaloft/contracts";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Table from "$lib/components/ui/table";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    findEnvironment,
    findProject,
    findResource,
    formatTime,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { projectsQuery, environmentsQuery, resourcesQuery, previewEnvironmentsQuery } =
    createConsoleQueries(browser, {
      health: false,
      readiness: false,
      version: false,
      consoleOverview: false,
      authSession: false,
      servers: false,
      deployments: false,
      domainBindings: false,
      certificates: false,
      providers: false,
    });

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const previewEnvironments = $derived(previewEnvironmentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      previewEnvironmentsQuery.isPending,
  );
  const activeCount = $derived(
    previewEnvironments.filter((previewEnvironment) => previewEnvironment.status === "active")
      .length,
  );
  const cleanupRequestedCount = $derived(
    previewEnvironments.filter(
      (previewEnvironment) => previewEnvironment.status === "cleanup-requested",
    ).length,
  );

  function previewEnvironmentStatusLabelKey(status: PreviewEnvironmentStatus) {
    if (status === "cleanup-requested") {
      return i18nKeys.console.previewEnvironments.statusCleanupRequested;
    }

    return i18nKeys.console.previewEnvironments.statusActive;
  }

  function previewEnvironmentStatusVariant(
    status: PreviewEnvironmentStatus,
  ): "default" | "secondary" {
    return status === "cleanup-requested" ? "secondary" : "default";
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.previewEnvironments.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.previewEnvironments.pageTitle)}
  description={$t(i18nKeys.console.previewEnvironments.pageDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.previewEnvironments.pageTitle) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <section class="space-y-3">
        <Skeleton class="h-5 w-44" />
        <Skeleton class="h-4 w-80" />
      </section>
      <section class="console-metric-strip sm:grid-cols-3">
        {#each Array.from({ length: 3 }) as _, index (index)}
          <Skeleton class="h-16 w-full" />
        {/each}
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 6 }) as _, index (index)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    </div>
  {:else if previewEnvironments.length === 0}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">
        {$t(i18nKeys.console.previewEnvironments.allProjects)}
      </Badge>
      <div class="max-w-2xl space-y-3">
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-semibold md:text-3xl">
            {$t(i18nKeys.console.previewEnvironments.emptyTitle)}
          </h1>
          <DocsHelpLink
            href={webDocsHrefs.productGradePreviews}
            ariaLabel={$t(i18nKeys.common.actions.openDocs)}
          />
        </div>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.previewEnvironments.emptyBody)}
        </p>
      </div>
      <Button href={webDocsHrefs.productGradePreviews} size="lg" variant="outline">
        <GitPullRequestArrow class="size-4" />
        {$t(i18nKeys.common.actions.openDocumentation)}
      </Button>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="max-w-2xl space-y-2">
          <Badge class="console-page-kicker" variant="outline">
            {$t(i18nKeys.console.previewEnvironments.allProjects)}
          </Badge>
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-semibold">
              {$t(i18nKeys.console.previewEnvironments.focusTitle)}
            </h1>
            <DocsHelpLink
              href={webDocsHrefs.productGradePreviews}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.previewEnvironments.focusDescription)}
          </p>
        </div>
      </section>

      <section class="console-metric-strip sm:grid-cols-3">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {$t(i18nKeys.console.previewEnvironments.totalCount)}
          </p>
          <p class="mt-1 text-2xl font-semibold">{previewEnvironments.length}</p>
        </div>
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {$t(i18nKeys.console.previewEnvironments.activeCount)}
          </p>
          <p class="mt-1 text-2xl font-semibold">{activeCount}</p>
        </div>
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {$t(i18nKeys.console.previewEnvironments.cleanupRequestedCount)}
          </p>
          <p class="mt-1 text-2xl font-semibold">{cleanupRequestedCount}</p>
        </div>
      </section>

      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.previewEnvironments.listTitle)}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.previewEnvironments.listDescription)}
          </p>
        </div>

        <div class="console-record-list">
          <Table.Root>
            <Table.Header>
              <Table.Row class="hover:bg-transparent">
                <Table.Head class="min-w-64">
                  {$t(i18nKeys.common.domain.source)}
                </Table.Head>
                <Table.Head>{$t(i18nKeys.common.domain.status)}</Table.Head>
                <Table.Head>{$t(i18nKeys.common.domain.project)}</Table.Head>
                <Table.Head>{$t(i18nKeys.common.domain.environment)}</Table.Head>
                <Table.Head>{$t(i18nKeys.common.domain.resource)}</Table.Head>
                <Table.Head>{$t(i18nKeys.console.previewEnvironments.expiresAt)}</Table.Head>
                <Table.Head>{$t(i18nKeys.console.previewEnvironments.updatedAt)}</Table.Head>
                <Table.Head class="w-12">
                  <span class="sr-only">{$t(i18nKeys.common.actions.openResource)}</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each previewEnvironments as previewEnvironment (previewEnvironment.previewEnvironmentId)}
                {@const project = findProject(projects, previewEnvironment.projectId)}
                {@const environment = findEnvironment(environments, previewEnvironment.environmentId)}
                {@const resource = findResource(resources, previewEnvironment.resourceId)}
                <Table.Row class="group">
                  <Table.Cell class="max-w-80">
                    <div class="block min-w-0">
                      <span class="block truncate font-medium">
                        {previewEnvironment.source.repositoryFullName}
                      </span>
                      <span class="mt-1 block truncate text-xs text-muted-foreground">
                        {$t(i18nKeys.console.previewEnvironments.pullRequest)}
                        #{previewEnvironment.source.pullRequestNumber}
                      </span>
                      <span
                        class="mt-1 block truncate font-mono text-xs text-muted-foreground"
                        title={previewEnvironment.source.sourceBindingFingerprint}
                      >
                        {$t(i18nKeys.console.previewEnvironments.sourceBinding)}
                        {previewEnvironment.source.sourceBindingFingerprint}
                      </span>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant={previewEnvironmentStatusVariant(previewEnvironment.status)}>
                      {$t(previewEnvironmentStatusLabelKey(previewEnvironment.status))}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell class="max-w-44 truncate">
                    {project?.name ?? previewEnvironment.projectId}
                  </Table.Cell>
                  <Table.Cell class="max-w-40 truncate">
                    {environment?.name ?? previewEnvironment.environmentId}
                  </Table.Cell>
                  <Table.Cell class="max-w-44 truncate">
                    {resource?.name ?? previewEnvironment.resourceId}
                  </Table.Cell>
                  <Table.Cell class="text-muted-foreground">
                    {previewEnvironment.expiresAt
                      ? formatTime(previewEnvironment.expiresAt)
                      : $t(i18nKeys.console.previewEnvironments.noExpiry)}
                  </Table.Cell>
                  <Table.Cell class="text-muted-foreground">
                    {formatTime(previewEnvironment.updatedAt)}
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    {#if resource}
                      <a
                        href={resourceDetailHref(resource)}
                        aria-label={$t(i18nKeys.common.actions.openResource)}
                        class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ArrowRight class="size-4" />
                      </a>
                    {/if}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      </section>
    </div>
  {/if}
</ConsoleShell>

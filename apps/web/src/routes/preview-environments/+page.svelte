<script lang="ts">
  import { browser } from "$app/environment";
  import { ArrowRight, GitPullRequestArrow } from "@lucide/svelte";
  import type { PreviewEnvironmentStatus } from "@appaloft/contracts";

  import ConsoleDataSkeleton from "$lib/components/console/ConsoleDataSkeleton.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { readErrorMessage } from "$lib/api/client";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    findEnvironment,
    findProject,
    findResource,
    formatTime,
    previewEnvironmentDetailHref,
    resourcePreviewEnvironmentDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { projectsQuery, environmentsQuery, resourcesQuery, previewEnvironmentsQuery } =
    createConsoleQueries(browser, {
      health: false,
      readiness: false,
      version: false,
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
  const previewEnvironmentsLoading = $derived(previewEnvironmentsQuery.isPending);
  const previewEnrichmentLoading = $derived(
    projectsQuery.isPending || environmentsQuery.isPending || resourcesQuery.isPending,
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
  <div class="p-4 md:p-6">
  {#if previewEnvironmentsLoading}
<div class="space-y-8" data-preview-environment-list-skeleton>
        <section class="space-y-2">
          <h1 class="text-2xl font-semibold">Preview environments</h1>
          <p class="text-sm text-muted-foreground">Ephemeral environments for pull requests.</p>
        </section>
        <section class="console-metric-strip sm:grid-cols-3">
          {#each ["Total", "Active", "Cleanup"] as label, index (label)}
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <ConsoleDataSkeleton name={`preview-environment-list-metric-${index}`} loading={true} class="mt-1 block">
                {#snippet capture()}
                  <p class="text-2xl font-semibold">3</p>
                {/snippet}
                <p class="text-2xl font-semibold">3</p>
              </ConsoleDataSkeleton>
            </div>
          {/each}
        </section>
        <div class="console-record-list">
          <article class="console-record-row">
            <div class="min-w-0 space-y-2">
              <ConsoleDataSkeleton name="preview-environment-list-row-title" loading={true} class="block">
                {#snippet capture()}
                  <h3 class="font-medium">org/repo #42</h3>
                {/snippet}
                <h3 class="font-medium">org/repo #42</h3>
              </ConsoleDataSkeleton>
              <ConsoleDataSkeleton name="preview-environment-list-row-description" loading={true} class="block">
                {#snippet capture()}
                  <p class="text-xs text-muted-foreground">Sample preview environment</p>
                {/snippet}
                <p class="text-xs text-muted-foreground">Sample preview environment</p>
              </ConsoleDataSkeleton>
            </div>
          </article>
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
  {:else if previewEnvironmentsQuery.error}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="destructive">
        {$t(i18nKeys.common.status.failed)}
      </Badge>
      <div class="max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.previewEnvironments.listTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {readErrorMessage(previewEnvironmentsQuery.error)}
        </p>
      </div>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="max-w-2xl space-y-2">
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
          {#if previewEnrichmentLoading}
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.common.status.loading)}
            </p>
          {/if}
        </div>

        <div class="console-record-list" data-preview-environments-display-surface>
          {#each previewEnvironments as previewEnvironment (previewEnvironment.previewEnvironmentId)}
            {@const project = findProject(projects, previewEnvironment.projectId)}
            {@const environment = findEnvironment(environments, previewEnvironment.environmentId)}
            {@const resource = findResource(resources, previewEnvironment.resourceId)}
            <article class="console-record-row lg:grid-cols-[minmax(0,1fr)_auto]">
              <div class="min-w-0 space-y-3">
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <GitPullRequestArrow class="size-4 shrink-0 text-muted-foreground" />
                  <h3 class="min-w-0 truncate font-medium">
                    {previewEnvironment.source.repositoryFullName}
                    #{previewEnvironment.source.pullRequestNumber}
                  </h3>
                  <Badge variant={previewEnvironmentStatusVariant(previewEnvironment.status)}>
                    {$t(previewEnvironmentStatusLabelKey(previewEnvironment.status))}
                  </Badge>
                </div>

                <div class="grid gap-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                  <div class="rounded-md bg-muted/20 px-3 py-2">
                    <p class="uppercase tracking-wide">
                      {$t(i18nKeys.common.domain.project)}
                    </p>
                    <p class="mt-1 truncate font-medium text-foreground">
                      {project?.name ?? previewEnvironment.projectId}
                    </p>
                  </div>
                  <div class="rounded-md bg-muted/20 px-3 py-2">
                    <p class="uppercase tracking-wide">
                      {$t(i18nKeys.common.domain.environment)}
                    </p>
                    <p class="mt-1 truncate font-medium text-foreground">
                      {environment?.name ?? previewEnvironment.environmentId}
                    </p>
                  </div>
                  <div class="rounded-md bg-muted/20 px-3 py-2">
                    <p class="uppercase tracking-wide">
                      {$t(i18nKeys.common.domain.resource)}
                    </p>
                    <p class="mt-1 truncate font-medium text-foreground">
                      {resource?.name ?? previewEnvironment.resourceId}
                    </p>
                  </div>
                  <div class="rounded-md bg-muted/20 px-3 py-2">
                    <p class="uppercase tracking-wide">
                      {$t(i18nKeys.console.previewEnvironments.expiresAt)}
                    </p>
                    <p class="mt-1 truncate font-medium text-foreground">
                      {previewEnvironment.expiresAt
                        ? formatTime(previewEnvironment.expiresAt)
                        : $t(i18nKeys.console.previewEnvironments.noExpiry)}
                    </p>
                  </div>
                </div>

                <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span class="min-w-0 truncate font-mono" title={previewEnvironment.source.sourceBindingFingerprint}>
                    {$t(i18nKeys.console.previewEnvironments.sourceBinding)}
                    {previewEnvironment.source.sourceBindingFingerprint}
                  </span>
                  <span>
                    {$t(i18nKeys.console.previewEnvironments.updatedAt)}
                    {formatTime(previewEnvironment.updatedAt)}
                  </span>
                </div>
              </div>

              <a
                href={resource
                  ? resourcePreviewEnvironmentDetailHref(
                      resource,
                      previewEnvironment.previewEnvironmentId,
                    )
                  : previewEnvironmentDetailHref(previewEnvironment.previewEnvironmentId)}
                aria-label={$t(i18nKeys.common.actions.viewDetails)}
                class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowRight class="size-4" />
              </a>
            </article>
          {/each}
        </div>
      </section>
    </div>
    {/if}
  </div>
</ConsoleShell>

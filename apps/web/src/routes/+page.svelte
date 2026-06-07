<script lang="ts">
  import { browser } from "$app/environment";
  import {
    ArrowRight,
    Blocks,
    Box,
    Braces,
    Database,
    FolderOpen,
    Globe2,
    Layers3,
    Play,
    Server,
  } from "@lucide/svelte";
  import type {
    DeploymentSummary,
    ProjectSummary,
    ResourceSummary,
  } from "@appaloft/contracts";

  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { canRunProductQueries } from "$lib/console/auth-query-gate";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import { selectCurrentResourceAccessRoute } from "$lib/console/resource-access-route";
  import {
    countProjectEnvironments,
    formatTime,
    latestProjectDeployment,
    projectDetailHref,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { TranslationKey } from "@appaloft/i18n";

  const { authSessionQuery } = createConsoleQueries(browser, {
    certificates: false,
    deployments: false,
    domainBindings: false,
    environments: false,
    health: false,
    previewEnvironments: false,
    projects: false,
    providers: false,
    readiness: false,
    resources: false,
    servers: false,
    version: false,
  });

  const homeProjectListLimit = 8;
  const homeResourceListLimit = 80;
  const homeDeploymentListLimit = 20;
  const homeEnvironmentListLimit = 80;
  const productQueryEnabled = $derived(browser && canRunProductQueries(authSessionQuery.data));

  const projectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects", "home", { limit: homeProjectListLimit }],
      queryFn: () => orpcClient.projects.list({ limit: homeProjectListLimit }),
      enabled: productQueryEnabled,
      staleTime: 5_000,
    }),
  );
  const resourcesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resources", "home", { limit: homeResourceListLimit }],
      queryFn: () => orpcClient.resources.list({ limit: homeResourceListLimit }),
      enabled: productQueryEnabled,
      staleTime: 5_000,
    }),
  );
  const environmentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["environments", "home", { limit: homeEnvironmentListLimit }],
      queryFn: () => orpcClient.environments.list({ limit: homeEnvironmentListLimit }),
      enabled: productQueryEnabled,
      staleTime: 5_000,
    }),
  );
  const deploymentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "home", { limit: homeDeploymentListLimit }],
      queryFn: () => orpcClient.deployments.list({ limit: homeDeploymentListLimit }),
      enabled: productQueryEnabled,
      refetchInterval: 10_000,
    }),
  );
  const serverCountQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers", "home", "count"],
      queryFn: () => orpcClient.servers.count({}),
      enabled: productQueryEnabled,
      staleTime: 5_000,
    }),
  );
  const deploymentCountQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "home", "count"],
      queryFn: () => orpcClient.deployments.count({}),
      enabled: productQueryEnabled,
      refetchInterval: 10_000,
    }),
  );

  const projects = $derived(projectsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const serverTotal = $derived(serverCountQuery.data?.count ?? 0);
  const deploymentTotal = $derived(deploymentCountQuery.data?.count ?? deployments.length);
  const projectsLoading = $derived(projectsQuery.isPending && projects.length === 0);
  const resourcesLoading = $derived(resourcesQuery.isPending);
  const environmentsLoading = $derived(environmentsQuery.isPending);
  const deploymentsLoading = $derived(deploymentsQuery.isPending);
  const workStateLoading = $derived(
    projectsQuery.isPending ||
      resourcesQuery.isPending ||
      deploymentsQuery.isPending ||
      environmentsQuery.isPending ||
      deploymentCountQuery.isPending,
  );
  const hasWork = $derived(projects.length > 0 || resources.length > 0 || deploymentTotal > 0);
  const activeDeployments = $derived(
    deployments.filter((deployment) =>
      ["created", "planning", "planned", "running", "cancel-requested"].includes(
        deployment.status,
      ),
    ),
  );
  const failedDeployments = $derived(
    deployments.filter((deployment) => deployment.status === "failed"),
  );

  function projectResources(project: ProjectSummary): ResourceSummary[] {
    return resources.filter((resource) => resource.projectId === project.id);
  }

  function projectDeployments(project: ProjectSummary): DeploymentSummary[] {
    return deployments.filter((deployment) => deployment.projectId === project.id);
  }

  function visibleProjectResources(project: ProjectSummary): ResourceSummary[] {
    return projectResources(project).slice(0, 3);
  }

  function projectPrimaryAccessResource(project: ProjectSummary): ResourceSummary | null {
    return (
      projectResources(project).find((resource) =>
        Boolean(selectCurrentResourceAccessRoute(resource.accessSummary)),
      ) ?? null
    );
  }

  function accessUrl(resource: ResourceSummary | null): string {
    return resource ? (selectCurrentResourceAccessRoute(resource.accessSummary)?.route.url ?? "") : "";
  }

  function environmentName(environmentId: string): string {
    return environments.find((environment) => environment.id === environmentId)?.name ?? environmentId;
  }

  function projectEnvironmentNames(project: ProjectSummary): string {
    const names = environments
      .filter((environment) => environment.projectId === project.id)
      .map((environment) => environment.name);

    return names.length > 0 ? names.slice(0, 2).join(" / ") : "-";
  }

  function resourceIcon(resource: ResourceSummary) {
    switch (resource.kind) {
      case "compose-stack":
        return Layers3;
      case "database":
      case "cache":
        return Database;
      case "worker":
        return Server;
      case "static-site":
        return Braces;
      case "external":
        return Globe2;
      case "application":
      case "service":
        return Box;
    }
  }

  function resourceKindLabelKey(kind: ResourceSummary["kind"]): TranslationKey {
    const labels = {
      application: i18nKeys.console.home.resourceKindApplication,
      service: i18nKeys.console.home.resourceKindService,
      database: i18nKeys.console.home.resourceKindDatabase,
      cache: i18nKeys.console.home.resourceKindCache,
      "compose-stack": i18nKeys.console.home.resourceKindComposeStack,
      worker: i18nKeys.console.home.resourceKindWorker,
      "static-site": i18nKeys.console.home.resourceKindStaticSite,
      external: i18nKeys.console.home.resourceKindExternal,
    } satisfies Record<ResourceSummary["kind"], TranslationKey>;

    return labels[kind];
  }

  function latestDeploymentResourceName(deployment: DeploymentSummary): string {
    return resources.find((resource) => resource.id === deployment.resourceId)?.name ?? deployment.resourceId;
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.home.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.home.pageTitle)}
  description={$t(i18nKeys.console.home.pageDescription)}
>
  <ConsoleResourceCanvas class="max-w-none">
  <div class="nothing-console-home">
    {#if !workStateLoading && !hasWork}
      <section class="nothing-home-heading">
        <div>
          <p class="nothing-label">{$t(i18nKeys.console.home.projectsKicker)}</p>
          <h1>{$t(i18nKeys.console.home.emptyHeading)}</h1>
          <p>{$t(i18nKeys.console.home.emptyDescription)}</p>
        </div>
      </section>

      <ConsoleEmptyState
        tone="deployment"
        title={$t(i18nKeys.console.home.emptyStateTitle)}
        description={$t(i18nKeys.console.home.emptyStateBody)}
        learnMoreHref={webDocsHrefs.projectLifecycle}
      >
        <Button href="/deploy">
          <Play class="size-4" />
          {$t(i18nKeys.common.actions.quickDeploy)}
        </Button>
      </ConsoleEmptyState>
    {:else}
      <section class="nothing-home-heading">
        <div>
          <p class="nothing-label">{$t(i18nKeys.console.home.projectsKicker)}</p>
          <h1>{$t(i18nKeys.console.home.projectsHeading)}</h1>
          <p>{$t(i18nKeys.console.home.projectsDescription)}</p>
        </div>
        <Button href="/projects" variant="outline">
          {$t(i18nKeys.common.actions.viewAll)}
          <ArrowRight class="size-4" />
        </Button>
      </section>

      <section class="nothing-home-layout">
        <div class="nothing-project-list" data-home-project-list>
          {#if projectsLoading || (projects.length === 0 && workStateLoading)}
            {#each Array.from({ length: 4 }) as _, index (index)}
              <article class="nothing-project-row" aria-hidden="true">
                <div class="nothing-project-main">
                  <Skeleton class="size-11 shrink-0 rounded-md" />
                  <span class="nothing-project-copy">
                    <Skeleton class="h-5 w-full max-w-72" />
                    <Skeleton class="h-4 w-full max-w-xl" />
                    <span class="nothing-project-meta">
                      <Skeleton class="h-[22px] w-16" />
                      <Skeleton class="h-[22px] w-20" />
                      <Skeleton class="h-[22px] w-24" />
                    </span>
                  </span>
                </div>
                <div class="nothing-resource-preview">
                  <Skeleton class="h-11 w-full" />
                  <Skeleton class="h-11 w-full" />
                </div>
                <div class="nothing-project-status">
                  <span class="nothing-status-block">
                    <Skeleton class="h-3 w-20" />
                    <Skeleton class="h-6 w-36" />
                  </span>
                  <span class="nothing-status-block">
                    <Skeleton class="h-3 w-16" />
                    <Skeleton class="h-5 w-48" />
                  </span>
                </div>
                <span class="nothing-project-open">
                  <Skeleton class="h-5 w-20" />
                </span>
              </article>
            {/each}
          {/if}
          {#each projects as project (project.id)}
            {@const resourcesForProject = projectResources(project)}
            {@const visibleResources = visibleProjectResources(project)}
            {@const latestDeployment = latestProjectDeployment(project, deployments)}
            {@const primaryAccessResource = projectPrimaryAccessResource(project)}
            {@const primaryAccessUrl = accessUrl(primaryAccessResource)}
            <article class="nothing-project-row" data-home-project-row>
              <a href={projectDetailHref(project.id)} class="nothing-project-main">
                <span class="nothing-project-icon" aria-hidden="true">
                  <FolderOpen class="size-5" />
                </span>
                <span class="nothing-project-copy">
                  <span class="nothing-project-title">
                    <strong>{project.name}</strong>
                    <small>{project.slug}</small>
                  </span>
                  <span class="nothing-project-description">
                    {project.description ?? $t(i18nKeys.console.home.noProjectDescription)}
                  </span>
                  <span class="nothing-project-meta">
                    {#if resourcesLoading}
                      <Skeleton class="h-[22px] w-16" />
                    {:else}
                      <span>
                        {resourcesForProject.length}
                        {$t(i18nKeys.common.domain.resources)}
                      </span>
                    {/if}
                    {#if environmentsLoading}
                      <Skeleton class="h-[22px] w-20" />
                      <Skeleton class="h-[22px] w-24" />
                    {:else}
                      <span>
                        {countProjectEnvironments(project, environments)}
                        {$t(i18nKeys.common.domain.environments)}
                      </span>
                      <span>{projectEnvironmentNames(project)}</span>
                    {/if}
                  </span>
                </span>
              </a>

              <div class="nothing-resource-preview" aria-label={$t(i18nKeys.console.home.resourcePreviewLabel)}>
                {#if resourcesLoading}
                  <Skeleton class="h-11 w-full" />
                  <Skeleton class="h-11 w-full" />
                {:else if visibleResources.length > 0}
                  {#each visibleResources as resource (resource.id)}
                    {@const Icon = resourceIcon(resource)}
                    {@const resourceAccessUrl = accessUrl(resource)}
                    <a href={resourceDetailHref(resource)} class="nothing-resource-chip">
                      <span class="nothing-resource-icon" aria-hidden="true">
                        <Icon class="size-3.5" />
                      </span>
                      <span class="min-w-0">
                        <strong>{resource.name}</strong>
                        <small>
                          {$t(resourceKindLabelKey(resource.kind))}
                          {#if resourceAccessUrl}
                            · {environmentName(resource.environmentId)}
                          {/if}
                        </small>
                      </span>
                    </a>
                  {/each}
                  {#if resourcesForProject.length > visibleResources.length}
                    <a href={projectDetailHref(project.id)} class="nothing-resource-more">
                      {$t(i18nKeys.console.home.moreResources, {
                        count: resourcesForProject.length - visibleResources.length,
                      })}
                    </a>
                  {/if}
                {:else}
                  <a href={projectDetailHref(project.id)} class="nothing-resource-empty">
                    {$t(i18nKeys.console.home.noResourcesInProject)}
                  </a>
                {/if}
              </div>

              <div class="nothing-project-status">
                <span class="nothing-status-block">
                  <small>{$t(i18nKeys.console.home.latestDeploymentTitle)}</small>
                  {#if deploymentsLoading}
                    <Skeleton class="h-6 w-36" />
                  {:else}
                    <span>
                      <DeploymentStatusBadge status={latestDeployment?.status} />
                      {#if latestDeployment}
                        <em>{formatTime(latestDeployment.createdAt)}</em>
                      {:else}
                        <em>{$t(i18nKeys.console.home.noDeploymentsShort)}</em>
                      {/if}
                    </span>
                  {/if}
                </span>
                <span class="nothing-status-block">
                  <small>{$t(i18nKeys.console.home.accessRouteTitle)}</small>
                  {#if resourcesLoading}
                    <Skeleton class="h-5 w-48" />
                  {:else if primaryAccessUrl && primaryAccessResource}
                    <a href={primaryAccessUrl} target="_blank" rel="noreferrer">
                      <Globe2 class="size-3.5" />
                      <span>{primaryAccessUrl}</span>
                    </a>
                  {:else}
                    <span class="nothing-muted-line">
                      {$t(i18nKeys.console.home.noAccessRoute)}
                    </span>
                  {/if}
                </span>
              </div>

              <a href={projectDetailHref(project.id)} class="nothing-project-open">
                {$t(i18nKeys.common.actions.viewDetails)}
                <ArrowRight class="size-4" />
              </a>
            </article>
          {/each}
        </div>

        <aside class="nothing-side-stack">
          <section class="nothing-side-panel">
            <div class="nothing-section-header">
              <p class="nothing-label">{$t(i18nKeys.console.home.operationContextTitle)}</p>
              <p>{$t(i18nKeys.console.home.operationContextDescription)}</p>
            </div>
            <div class="nothing-context-grid">
              <a href="/deployments" class="nothing-context-cell">
                <span>{$t(i18nKeys.console.home.activeDeploymentsMetric)}</span>
                {#if deploymentsLoading}
                  <Skeleton class="h-[22px] w-8" />
                {:else}
                  <strong>{activeDeployments.length}</strong>
                {/if}
              </a>
              <a href="/deployments" class="nothing-context-cell">
                <span>{$t(i18nKeys.console.home.failedDeploymentsMetric)}</span>
                {#if deploymentsLoading}
                  <Skeleton class="h-[22px] w-8" />
                {:else}
                  <strong>{failedDeployments.length}</strong>
                {/if}
              </a>
              <a href="/servers" class="nothing-context-cell">
                <span>{$t(i18nKeys.common.domain.servers)}</span>
                {#if serverCountQuery.isPending}
                  <Skeleton class="h-[22px] w-8" />
                {:else}
                  <strong>{serverTotal}</strong>
                {/if}
              </a>
            </div>
          </section>

          <section class="nothing-side-panel">
            <div class="nothing-section-header">
              <p class="nothing-label">{$t(i18nKeys.console.home.recentDeploymentsTitle)}</p>
              <p>{$t(i18nKeys.console.home.recentDeploymentsDescription)}</p>
            </div>
            {#if deploymentsLoading}
              <div class="nothing-activity-list" aria-hidden="true">
                {#each Array.from({ length: 3 }) as _, index (index)}
                  <div class="nothing-activity-row">
                    <span>
                      <Skeleton class="h-4 w-36" />
                      <Skeleton class="mt-2 h-3 w-28" />
                    </span>
                    <span>
                      <Skeleton class="h-5 w-20" />
                      <Skeleton class="h-3 w-16" />
                    </span>
                  </div>
                {/each}
              </div>
            {:else if deployments.length > 0}
              <div class="nothing-activity-list">
                {#each deployments.slice(0, 5) as deployment (deployment.id)}
                  <a href="/deployments" class="nothing-activity-row">
                    <span>
                      <strong>{latestDeploymentResourceName(deployment)}</strong>
                      <small>{deployment.runtimePlan.source.displayName}</small>
                    </span>
                    <span>
                      <DeploymentStatusBadge status={deployment.status} />
                      <em>{formatTime(deployment.createdAt)}</em>
                    </span>
                  </a>
                {/each}
              </div>
            {:else}
              <div class="nothing-side-empty">
                {$t(i18nKeys.console.home.latestDeploymentEmpty)}
              </div>
            {/if}
          </section>

          <section class="nothing-side-panel">
            <div class="nothing-section-header">
              <p class="nothing-label">{$t(i18nKeys.console.home.nextStepsTitle)}</p>
              <p>{$t(i18nKeys.console.home.nextStepsDescription)}</p>
            </div>
            <div class="nothing-next-actions">
              <a href="/deploy" class="nothing-next-row">
                <Play class="size-4" />
                <span>{$t(i18nKeys.common.actions.quickDeploy)}</span>
                <ArrowRight class="size-3.5" />
              </a>
              <a href="/projects" class="nothing-next-row">
                <Blocks class="size-4" />
                <span>{$t(i18nKeys.common.actions.viewProjects)}</span>
                <ArrowRight class="size-3.5" />
              </a>
            </div>
          </section>
        </aside>
      </section>
    {/if}
  </div>
  </ConsoleResourceCanvas>
</ConsoleShell>

<style>
  .nothing-console-home {
    --nothing-motion-duration: 180ms;
    --nothing-motion-ease: cubic-bezier(0.2, 0, 0, 1);

    display: grid;
    gap: 24px;
  }

  .nothing-label {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .nothing-home-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }

  .nothing-home-heading > div,
  .nothing-home-heading:not(:has(> div)) {
    min-width: 0;
  }

  .nothing-home-heading h1 {
    margin-top: 6px;
    color: var(--text-display);
    font-size: 24px;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1.2;
  }

  .nothing-home-heading p:not(.nothing-label) {
    margin-top: 8px;
    max-width: 48rem;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.6;
  }

  .nothing-home-layout {
    display: grid;
    gap: 24px;
  }

  @media (min-width: 1180px) {
    .nothing-home-layout {
      grid-template-columns: minmax(0, 1fr) 22rem;
      align-items: start;
    }
  }

  .nothing-project-list {
    container-type: inline-size;
    display: grid;
    overflow: hidden;
    border: 1px solid var(--input);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-2xs);
  }

  .nothing-project-row {
    display: grid;
    min-width: 0;
    grid-template-areas:
      "project"
      "resource"
      "status"
      "action";
    gap: 16px;
    align-items: start;
    border-bottom: 1px solid var(--border);
    padding: 18px;
  }

  .nothing-project-row:last-child {
    border-bottom: 0;
  }

  @container (min-width: 42rem) {
    .nothing-project-row {
      grid-template-areas:
        "project status"
        "resource status"
        "resource action";
      grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
    }
  }

  .nothing-project-main,
  .nothing-resource-chip,
  .nothing-resource-more,
  .nothing-resource-empty,
  .nothing-project-open,
  .nothing-context-cell,
  .nothing-activity-row,
  .nothing-next-row {
    color: var(--text-primary);
    text-decoration: none;
  }

  .nothing-project-main {
    display: grid;
    min-width: 0;
    grid-area: project;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
  }

  .nothing-project-icon,
  .nothing-resource-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--input);
    border-radius: var(--radius-md);
    background: color-mix(in oklch, var(--muted) 40%, var(--surface));
    color: var(--primary);
  }

  .nothing-project-icon {
    width: 44px;
    height: 44px;
  }

  .nothing-project-copy,
  .nothing-project-title,
  .nothing-project-meta,
  .nothing-status-block,
  .nothing-status-block > span,
  .nothing-status-block a,
  .nothing-activity-row,
  .nothing-activity-row > span,
  .nothing-next-row {
    min-width: 0;
  }

  .nothing-project-copy {
    display: grid;
    gap: 6px;
  }

  .nothing-project-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .nothing-project-title strong {
    color: var(--text-display);
    font-size: 16px;
    font-weight: 600;
  }

  .nothing-project-title small,
  .nothing-project-meta span,
  .nothing-resource-chip small,
  .nothing-status-block small,
  .nothing-activity-row small,
  .nothing-activity-row em {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.4;
  }

  .nothing-project-title small,
  .nothing-project-meta span {
    border: 1px solid var(--input);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
  }

  .nothing-project-description {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
  }

  .nothing-project-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .nothing-resource-preview {
    display: grid;
    grid-area: resource;
    gap: 8px;
  }

  .nothing-resource-chip {
    display: grid;
    min-width: 0;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    border: 1px solid var(--input);
    border-radius: var(--radius-md);
    padding: 8px;
    transition:
      border-color var(--nothing-motion-duration) var(--nothing-motion-ease),
      background-color var(--nothing-motion-duration) var(--nothing-motion-ease);
  }

  .nothing-resource-chip:hover,
  .nothing-resource-chip:focus-visible {
    border-color: color-mix(in oklch, var(--primary) 32%, var(--input));
    background: color-mix(in oklch, var(--primary) 3%, transparent);
  }

  .nothing-resource-icon {
    width: 28px;
    height: 28px;
  }

  .nothing-resource-chip strong,
  .nothing-activity-row strong {
    display: block;
    overflow: hidden;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nothing-resource-chip small,
  .nothing-activity-row small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nothing-resource-more,
  .nothing-resource-empty {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
    width: fit-content;
  }

  .nothing-resource-more:hover,
  .nothing-resource-empty:hover,
  .nothing-project-main:hover strong,
  .nothing-project-open:hover {
    color: var(--primary);
  }

  .nothing-project-status {
    display: grid;
    grid-area: status;
    gap: 12px;
  }

  .nothing-status-block {
    display: grid;
    gap: 5px;
  }

  .nothing-status-block > span,
  .nothing-status-block a {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nothing-status-block em {
    overflow: hidden;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nothing-status-block a {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .nothing-status-block a span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nothing-status-block a:hover {
    color: var(--primary);
  }

  .nothing-muted-line {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .nothing-project-open {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    grid-area: action;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    transition:
      color var(--nothing-motion-duration) var(--nothing-motion-ease),
      transform var(--nothing-motion-duration) var(--nothing-motion-ease);
  }

  @container (min-width: 42rem) {
    .nothing-project-open {
      align-self: end;
    }
  }

  .nothing-project-open:hover,
  .nothing-project-open:focus-visible {
    transform: translate3d(3px, 0, 0);
  }

  .nothing-side-stack {
    display: grid;
    gap: 16px;
  }

  .nothing-side-panel {
    border: 1px solid var(--input);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-2xs);
    padding: 16px;
  }

  .nothing-section-header {
    display: grid;
    gap: 7px;
    margin-bottom: 14px;
  }

  .nothing-section-header > p:not(.nothing-label) {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
  }

  .nothing-context-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--input);
    border-radius: var(--radius-md);
  }

  .nothing-context-cell {
    display: grid;
    gap: 7px;
    border-right: 1px solid var(--border);
    padding: 12px;
  }

  .nothing-context-cell:last-child {
    border-right: 0;
  }

  .nothing-context-cell span {
    overflow: hidden;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 10px;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .nothing-context-cell strong {
    color: var(--text-display);
    font-family: var(--font-mono);
    font-size: 22px;
    font-weight: 500;
    line-height: 1;
  }

  .nothing-context-cell:hover,
  .nothing-context-cell:focus-visible,
  .nothing-next-row:hover,
  .nothing-next-row:focus-visible,
  .nothing-activity-row:hover,
  .nothing-activity-row:focus-visible {
    background: color-mix(in oklch, var(--primary) 3%, transparent);
  }

  .nothing-activity-list,
  .nothing-next-actions {
    display: grid;
    border-top: 1px solid var(--input);
  }

  .nothing-activity-row,
  .nothing-next-row {
    border-bottom: 1px solid var(--border);
  }

  .nothing-activity-row:last-child,
  .nothing-next-row:last-child {
    border-bottom: 0;
  }

  .nothing-activity-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
  }

  .nothing-activity-row > span:last-child {
    display: grid;
    justify-items: end;
    gap: 4px;
  }

  .nothing-next-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
  }

  .nothing-next-row :global(svg:first-child) {
    color: var(--primary);
  }

  .nothing-next-row :global(svg:last-child) {
    color: var(--text-secondary);
  }

  .nothing-side-empty {
    border: 1px dashed var(--input);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
    padding: 16px;
  }

  .nothing-project-main:focus-visible,
  .nothing-resource-chip:focus-visible,
  .nothing-resource-more:focus-visible,
  .nothing-resource-empty:focus-visible,
  .nothing-project-open:focus-visible,
  .nothing-context-cell:focus-visible,
  .nothing-activity-row:focus-visible,
  .nothing-next-row:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .nothing-resource-chip,
    .nothing-project-open {
      transition-duration: 1ms;
    }

    .nothing-project-open:hover,
    .nothing-project-open:focus-visible {
      transform: translate3d(0, 0, 0);
    }
  }
</style>

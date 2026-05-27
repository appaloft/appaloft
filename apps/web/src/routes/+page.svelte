<script lang="ts">
  import { browser } from "$app/environment";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import { ArrowRight, Database, FolderOpen, Server } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { canRunProductQueries } from "$lib/console/auth-query-gate";
  import { createConsoleQueries } from "$lib/console/queries";
  import { findProject, formatTime, projectDetailHref } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";

  const { authSessionQuery } = createConsoleQueries(browser, {
    certificates: false,
    deployments: false,
    domainBindings: false,
    environments: false,
    health: false,
    projects: false,
    providers: false,
    readiness: false,
    resources: false,
    servers: false,
    version: false,
  });

  const homeProjectListLimit = 3;
  const homeDeploymentListLimit = 5;
  const activeDeploymentStatuses = [
    "created",
    "planning",
    "planned",
    "running",
    "cancel-requested",
  ] as const;
  const productQueryEnabled = $derived(browser && canRunProductQueries(authSessionQuery.data));

  const projectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects", "home"],
      queryFn: () => orpcClient.projects.list({ limit: homeProjectListLimit }),
      enabled: productQueryEnabled,
      staleTime: 5_000,
    }),
  );
  const projectCountQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects", "home", "count"],
      queryFn: () => orpcClient.projects.count({}),
      enabled: productQueryEnabled,
      staleTime: 5_000,
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
  const environmentCountQuery = createQuery(() =>
    queryOptions({
      queryKey: ["environments", "home", "count"],
      queryFn: () => orpcClient.environments.count({}),
      enabled: productQueryEnabled,
      staleTime: 5_000,
    }),
  );
  const resourceCountQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resources", "home", "count"],
      queryFn: () => orpcClient.resources.count({}),
      enabled: productQueryEnabled,
      staleTime: 5_000,
    }),
  );
  const deploymentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "home"],
      queryFn: () => orpcClient.deployments.list({ limit: homeDeploymentListLimit }),
      enabled: productQueryEnabled,
      refetchInterval: 10_000,
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
  const activeDeploymentCountQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "home", "count", "active"],
      queryFn: () => orpcClient.deployments.count({ statuses: [...activeDeploymentStatuses] }),
      enabled: productQueryEnabled,
      refetchInterval: 10_000,
    }),
  );
  const failedDeploymentCountQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "home", "count", "failed"],
      queryFn: () => orpcClient.deployments.count({ status: "failed" }),
      enabled: productQueryEnabled,
      refetchInterval: 10_000,
    }),
  );
  const dependencyResourceCountQuery = createQuery(() =>
    queryOptions({
      queryKey: ["dependency-resources", "home", "count"],
      queryFn: () => orpcClient.dependencyResources.count({}),
      enabled: productQueryEnabled,
      staleTime: 5_000,
    }),
  );

  const projectTotal = $derived(projectCountQuery.data?.count ?? 0);
  const serverTotal = $derived(serverCountQuery.data?.count ?? 0);
  const environmentTotal = $derived(environmentCountQuery.data?.count ?? 0);
  const resourceTotal = $derived(resourceCountQuery.data?.count ?? 0);
  const dependencyResourceCount = $derived(dependencyResourceCountQuery.data?.count ?? 0);
  const projects = $derived(projectsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const deploymentTotal = $derived(deploymentCountQuery.data?.count ?? 0);
  const deploymentBaseLoaded = $derived(
    Boolean(projectCountQuery.data) && Boolean(deploymentCountQuery.data),
  );
  const hasProjectsWithoutDeployments = $derived(
    deploymentBaseLoaded && projectTotal > 0 && deploymentTotal === 0,
  );
  const latestDeployment = $derived(deployments[0] ?? null);
  const latestProject = $derived(
    latestDeployment ? findProject(projects, latestDeployment.projectId) : null,
  );
  const activeDeployments = $derived(activeDeploymentCountQuery.data?.count ?? 0);
  const failedDeployments = $derived(failedDeploymentCountQuery.data?.count ?? 0);
  const healthyDeployments = $derived(Math.max(0, deploymentTotal - failedDeployments));
  const activeSegments = $derived(
    deploymentTotal > 0 ? Math.max(1, Math.round((activeDeployments / deploymentTotal) * 12)) : 0,
  );
  const healthSegments = $derived(
    deploymentTotal > 0 ? Math.max(1, Math.round((healthyDeployments / deploymentTotal) * 12)) : 0,
  );
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.home.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.home.pageTitle)}
  description={$t(i18nKeys.console.home.pageDescription)}
>
  <div class="nothing-console-home">
    {#if hasProjectsWithoutDeployments}
      <section class="nothing-inline-alert">
        <p class="nothing-label">[{$t(i18nKeys.console.deployments.noFilteredDeployments)}]</p>
        <h1>{$t(i18nKeys.console.home.deploymentsWithoutRecordsTitle)}</h1>
        <p>{$t(i18nKeys.console.home.deploymentsWithoutRecordsBody, { count: projectTotal })}</p>
      </section>
    {/if}

    <section class="nothing-overview-head">
      <div>
        <p class="nothing-label">{$t(i18nKeys.console.home.dashboardOverviewTitle)}</p>
        <h2>{$t(i18nKeys.console.home.dashboardOverviewDescription)}</h2>
      </div>
    </section>

    <section class="nothing-metric-grid">
      <a href="/projects" class="nothing-metric-cell">
        <span>{$t(i18nKeys.common.domain.projects)}</span>
        {#if projectCountQuery.isPending}
          <Skeleton class="h-9 w-11" />
        {:else}
          <strong>{projectTotal}</strong>
        {/if}
        <small>
          {$t(i18nKeys.common.actions.viewProjects)}
          <ArrowRight class="size-3.5" />
        </small>
      </a>
      <a href="/projects" class="nothing-metric-cell">
        <span>{$t(i18nKeys.common.domain.resources)}</span>
        {#if resourceCountQuery.isPending}
          <Skeleton class="h-9 w-11" />
        {:else}
          <strong>{resourceTotal}</strong>
        {/if}
        <small>
          {$t(i18nKeys.common.actions.viewProjects)}
          <ArrowRight class="size-3.5" />
        </small>
      </a>
      <a href="/deployments" class="nothing-metric-cell">
        <span>{$t(i18nKeys.common.domain.deployments)}</span>
        {#if deploymentCountQuery.isPending}
          <Skeleton class="h-9 w-11" />
        {:else}
          <strong>{deploymentTotal}</strong>
        {/if}
        <small>
          {$t(i18nKeys.common.actions.viewDeployments)}
          <ArrowRight class="size-3.5" />
        </small>
      </a>
      <a href="/servers" class="nothing-metric-cell">
        <span>{$t(i18nKeys.common.domain.servers)}</span>
        {#if serverCountQuery.isPending}
          <Skeleton class="h-9 w-11" />
        {:else}
          <strong>{serverTotal}</strong>
        {/if}
        <small>
          {$t(i18nKeys.common.actions.viewServers)}
          <ArrowRight class="size-3.5" />
        </small>
      </a>
      <a href="/projects" class="nothing-metric-cell">
        <span>{$t(i18nKeys.common.domain.environments)}</span>
        {#if environmentCountQuery.isPending}
          <Skeleton class="h-9 w-11" />
        {:else}
          <strong>{environmentTotal}</strong>
        {/if}
        <small>
          {$t(i18nKeys.common.actions.viewProjects)}
          <ArrowRight class="size-3.5" />
        </small>
      </a>
      <a href="/dependency-resources" class="nothing-metric-cell">
        <span>{$t(i18nKeys.console.home.managedServicesMetric)}</span>
        {#if dependencyResourceCountQuery.isPending}
          <Skeleton class="h-9 w-11" />
        {:else}
          <strong>{dependencyResourceCount}</strong>
        {/if}
        <small>
          {$t(i18nKeys.console.home.dependencyResourcesCta)}
          <ArrowRight class="size-3.5" />
        </small>
      </a>
    </section>

    <section class="nothing-dashboard-grid">
      <div class="nothing-section nothing-deployment-panel">
        <div class="nothing-section-header">
          <p class="nothing-label">{$t(i18nKeys.console.home.deploymentActivityTitle)}</p>
          <p>{$t(i18nKeys.console.home.latestDeploymentDescription)}</p>
        </div>
        <div class="nothing-deployment-summary">
          <div>
            <span>{$t(i18nKeys.console.home.latestDeploymentTitle)}</span>
            {#if deploymentsQuery.isPending}
              <Skeleton class="h-5 w-48" />
              <Skeleton class="h-3 w-64" />
            {:else}
              <strong>{latestDeployment?.status ?? $t(i18nKeys.console.home.noDeploymentsShort)}</strong>
              <small>
                {#if latestDeployment}
                  {latestDeployment.runtimePlan.source.displayName} / {latestProject?.name ?? latestDeployment.projectId} / {formatTime(latestDeployment.createdAt)}
                {:else}
                  {$t(i18nKeys.console.home.latestDeploymentEmpty)}
                {/if}
              </small>
            {/if}
          </div>
          <div class="nothing-progress-stack">
            <div class="nothing-progress-block">
              <div>
                <span>{$t(i18nKeys.console.home.activeDeploymentsMetric)}</span>
                {#if activeDeploymentCountQuery.isPending || deploymentCountQuery.isPending}
                  <Skeleton class="h-3 w-10" />
                {:else}
                  <strong>{activeDeployments}/{deploymentTotal}</strong>
                {/if}
              </div>
              <div class="nothing-segment-bar" aria-hidden="true">
                {#each Array.from({ length: 12 }) as _, index (index)}
                  <span class={index < activeSegments ? "is-filled" : ""}></span>
                {/each}
              </div>
            </div>
            <div class="nothing-progress-block">
              <div>
                <span>{$t(i18nKeys.console.home.healthyDeploymentsMetric)}</span>
                {#if failedDeploymentCountQuery.isPending || deploymentCountQuery.isPending}
                  <Skeleton class="h-3 w-10" />
                {:else}
                  <strong>{healthyDeployments}/{deploymentTotal}</strong>
                {/if}
              </div>
              <div class="nothing-segment-bar" aria-hidden="true">
                {#each Array.from({ length: 12 }) as _, index (index)}
                  <span class={index < healthSegments ? "is-good" : ""}></span>
                {/each}
              </div>
            </div>
          </div>
        </div>

        {#if deploymentsQuery.isPending}
          <div class="nothing-record-list" aria-hidden="true">
            {#each Array.from({ length: 3 }) as _, index (index)}
              <div class="nothing-record-row">
                <span>
                  <Skeleton class="h-4 w-48" />
                  <Skeleton class="h-3 w-32" />
                </span>
                <Skeleton class="h-4 w-20" />
              </div>
            {/each}
          </div>
        {:else if deployments.length > 0}
          <div class="nothing-record-list">
            {#each deployments as deployment (deployment.id)}
              <a href="/deployments" class="nothing-record-row">
                <span>
                  <strong>{deployment.runtimePlan.source.displayName}</strong>
                  <small>{formatTime(deployment.createdAt)}</small>
                </span>
                <DeploymentStatusBadge status={deployment.status} />
              </a>
            {/each}
          </div>
        {:else}
          <div class="nothing-empty-state">
            <p>{$t(i18nKeys.console.home.latestDeploymentEmpty)}</p>
          </div>
        {/if}
      </div>

      <div class="nothing-section nothing-actions-panel">
        <div class="nothing-section-header">
          <p class="nothing-label">{$t(i18nKeys.console.home.quickActionsTitle)}</p>
          <p>{$t(i18nKeys.console.home.quickActionsDescription)}</p>
        </div>
        <div class="nothing-action-list">
          <a href="/servers/new" class="nothing-action-row">
            <Server class="size-4" />
            <span>{$t(i18nKeys.common.actions.createServer)}</span>
            <ArrowRight class="size-3.5" />
          </a>
          <a href="/projects" class="nothing-action-row">
            <FolderOpen class="size-4" />
            <span>{$t(i18nKeys.common.actions.viewProjects)}</span>
            <ArrowRight class="size-3.5" />
          </a>
          <a href="/dependency-resources" class="nothing-action-row">
            <Database class="size-4" />
            <span>{$t(i18nKeys.console.home.dependencyResourcesCta)}</span>
            <ArrowRight class="size-3.5" />
          </a>
        </div>
      </div>
    </section>

    <section class="nothing-section">
      <div class="nothing-section-header">
        <p class="nothing-label">{$t(i18nKeys.console.home.projectRelationsTitle)}</p>
        <p>{$t(i18nKeys.console.home.projectRelationsDescription)}</p>
      </div>
      {#if projectsQuery.isPending}
        <div class="nothing-record-list" aria-hidden="true">
          {#each Array.from({ length: 3 }) as _, index (index)}
            <div class="nothing-record-row">
              <span>
                <Skeleton class="h-4 w-48" />
                <Skeleton class="h-3 w-32" />
              </span>
              <Skeleton class="h-4 w-20" />
            </div>
          {/each}
        </div>
      {:else if projects.length > 0}
        <div class="nothing-record-list">
          {#each projects.slice(0, 5) as project (project.id)}
            <a href={projectDetailHref(project.id)} class="nothing-record-row">
              <span>
                <strong>{project.name}</strong>
                <small>{project.slug}</small>
              </span>
              <span>{project.lifecycleStatus}</span>
            </a>
          {/each}
        </div>
      {:else}
        <div class="nothing-empty-state">
          <p>{$t(i18nKeys.console.home.projectRelationsEmpty)}</p>
        </div>
      {/if}
    </section>
  </div>
</ConsoleShell>

<style>
  .nothing-console-home {
    --nothing-motion-duration: 220ms;
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

  .nothing-overview-head {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }

  .nothing-overview-head h2 {
    margin-top: 6px;
    color: var(--text-display);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 0;
    line-height: 1.2;
  }

  .nothing-section-header {
    display: grid;
    gap: 8px;
    margin-bottom: 20px;
  }

  .nothing-section-header > p:not(.nothing-label),
  .nothing-inline-alert > p {
    max-width: 44rem;
    color: var(--text-secondary);
    font-size: 15px;
    line-height: 1.6;
  }

  .nothing-section,
  .nothing-inline-alert,
  .nothing-empty-state {
    border: 1px solid var(--input);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-2xs);
    padding: 20px;
  }

  .nothing-inline-alert h1 {
    color: var(--text-display);
    font-size: 20px;
    font-weight: 500;
  }

  .nothing-metric-grid {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--input);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-2xs);
  }

  @media (min-width: 640px) {
    .nothing-metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1180px) {
    .nothing-metric-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  .nothing-metric-cell {
    position: relative;
    display: grid;
    min-width: 0;
    gap: 12px;
    border-bottom: 1px solid var(--input);
    color: var(--text-primary);
    padding: 18px;
    text-decoration: none;
    transition:
      background-color var(--nothing-motion-duration) var(--nothing-motion-ease),
      box-shadow var(--nothing-motion-duration) var(--nothing-motion-ease),
      color var(--nothing-motion-duration) var(--nothing-motion-ease);
  }

  @media (min-width: 640px) {
    .nothing-metric-cell {
      border-right: 1px solid var(--input);
    }
  }

  @media (min-width: 1180px) {
    .nothing-metric-cell {
      border-bottom: 0;
    }
  }

  .nothing-metric-cell:hover,
  .nothing-metric-cell:focus-visible {
    background-color: color-mix(in oklch, var(--primary) 4%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--primary) 24%, var(--input));
  }

  .nothing-metric-cell:focus-visible,
  .nothing-action-row:focus-visible,
  .nothing-record-row:focus-visible {
    z-index: 1;
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }

  .nothing-metric-cell span,
  .nothing-deployment-summary span,
  .nothing-progress-block span {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .nothing-metric-cell strong {
    color: var(--text-display);
    font-family: var(--font-mono);
    font-size: 32px;
    font-weight: 400;
    line-height: 1;
  }

  .nothing-metric-cell small,
  .nothing-record-row small,
  .nothing-deployment-summary small {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    text-transform: uppercase;
  }

  .nothing-metric-cell small {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 6px;
    transition: color var(--nothing-motion-duration) var(--nothing-motion-ease);
  }

  .nothing-metric-cell small :global(svg),
  .nothing-action-row :global(svg:last-child) {
    color: var(--text-secondary);
    transform: translate3d(0, 0, 0);
    transition:
      color var(--nothing-motion-duration) var(--nothing-motion-ease),
      transform var(--nothing-motion-duration) var(--nothing-motion-ease);
  }

  .nothing-metric-cell:hover small,
  .nothing-metric-cell:hover small :global(svg),
  .nothing-metric-cell:focus-visible small,
  .nothing-metric-cell:focus-visible small :global(svg),
  .nothing-action-row:hover,
  .nothing-action-row:hover :global(svg:last-child),
  .nothing-action-row:focus-visible,
  .nothing-action-row:focus-visible :global(svg:last-child) {
    color: var(--primary);
  }

  .nothing-metric-cell:hover small :global(svg),
  .nothing-metric-cell:focus-visible small :global(svg),
  .nothing-action-row:hover :global(svg:last-child),
  .nothing-action-row:focus-visible :global(svg:last-child) {
    transform: translate3d(3px, 0, 0);
  }

  .nothing-dashboard-grid {
    display: grid;
    gap: 24px;
  }

  @media (min-width: 1180px) {
    .nothing-dashboard-grid {
      grid-template-columns: minmax(0, 1fr) 22rem;
    }
  }

  .nothing-deployment-summary {
    display: grid;
    gap: 18px;
    margin-bottom: 20px;
    border: 1px solid var(--input);
    border-radius: var(--radius-md);
    background: color-mix(in oklch, var(--muted) 34%, var(--surface));
    padding: 16px;
  }

  @media (min-width: 768px) {
    .nothing-deployment-summary {
      grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.65fr);
    }
  }

  .nothing-deployment-summary > div:first-child {
    display: grid;
    min-width: 0;
    gap: 8px;
  }

  .nothing-deployment-summary strong {
    color: var(--text-display);
    font-size: 20px;
    font-weight: 500;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .nothing-progress-stack,
  .nothing-progress-block {
    display: grid;
    gap: 10px;
  }

  .nothing-progress-block > div:first-child {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .nothing-progress-block strong {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .nothing-segment-bar {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 2px;
  }

  .nothing-segment-bar span {
    height: 10px;
    background: var(--border);
  }

  .nothing-segment-bar span.is-filled {
    background: var(--primary);
  }

  .nothing-segment-bar span.is-good {
    background: var(--success);
  }

  .nothing-action-list,
  .nothing-record-list {
    display: grid;
    border-top: 1px solid var(--input);
  }

  .nothing-action-row,
  .nothing-record-row {
    display: grid;
    min-width: 0;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
    padding: 14px 0;
    text-decoration: none;
  }

  .nothing-action-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    transition:
      background-color var(--nothing-motion-duration) var(--nothing-motion-ease),
      color var(--nothing-motion-duration) var(--nothing-motion-ease);
  }

  .nothing-action-row:hover,
  .nothing-action-row:focus-visible {
    background-color: color-mix(in oklch, var(--primary) 3%, transparent);
  }

  .nothing-record-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .nothing-record-row > span:first-child {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .nothing-record-row strong {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 500;
  }

  .nothing-record-row > span:last-child {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    text-align: right;
    text-transform: uppercase;
  }

  .nothing-section .nothing-empty-state {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    padding: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .nothing-metric-cell,
    .nothing-metric-cell small,
    .nothing-metric-cell small :global(svg),
    .nothing-action-row,
    .nothing-action-row :global(svg:last-child) {
      transition-duration: 1ms;
    }

    .nothing-metric-cell:hover small :global(svg),
    .nothing-metric-cell:focus-visible small :global(svg),
    .nothing-action-row:hover :global(svg:last-child),
    .nothing-action-row:focus-visible :global(svg:last-child) {
      transform: translate3d(0, 0, 0);
    }
  }
</style>

<script lang="ts">
  import { browser } from "$app/environment";
  import { Activity, ArrowRight, Database, Rocket } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import { Button } from "$lib/components/ui/button";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    countProjectEnvironments,
    countProjectResources,
    findProject,
    formatTime,
    projectDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { consoleOverviewQuery } = createConsoleQueries(browser, {
    authSession: false,
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

  const overview = $derived(consoleOverviewQuery.data ?? null);
  const projects = $derived(overview?.projects ?? []);
  const servers = $derived(overview?.deploymentTargets ?? []);
  const environments = $derived(overview?.environments ?? []);
  const resources = $derived(overview?.resources ?? []);
  const deployments = $derived(overview?.recentDeployments ?? []);
  const counts = $derived(overview?.counts ?? null);
  const readiness = $derived(overview?.readiness ?? null);
  const version = $derived(overview?.version ?? null);
  const pageLoading = $derived(consoleOverviewQuery.isPending && !overview);
  const hasNoDeploymentBase = $derived(projects.length === 0 && deployments.length === 0);
  const hasProjectsWithoutDeployments = $derived(
    projects.length > 0 && (counts?.deployments ?? 0) === 0,
  );
  const latestDeployment = $derived(overview?.latestDeployment ?? null);
  const latestProject = $derived(
    latestDeployment ? findProject(projects, latestDeployment.projectId) : null,
  );
  const deploymentTotal = $derived(counts?.deployments ?? 0);
  const activeDeployments = $derived(counts?.activeDeployments ?? 0);
  const failedDeployments = $derived(counts?.failedDeployments ?? 0);
  const healthyDeployments = $derived(Math.max(0, deploymentTotal - failedDeployments));
  const activeSegments = $derived(
    deploymentTotal > 0 ? Math.max(1, Math.round((activeDeployments / deploymentTotal) * 12)) : 0,
  );
  const healthSegments = $derived(
    deploymentTotal > 0 ? Math.max(1, Math.round((healthyDeployments / deploymentTotal) * 12)) : 0,
  );
  const flowSteps = [
    i18nKeys.console.home.deploymentFlowSource,
    i18nKeys.console.home.deploymentFlowCreateProject,
    i18nKeys.console.home.deploymentFlowCreateServer,
    i18nKeys.console.home.deploymentFlowCreateEnvironment,
    i18nKeys.console.home.deploymentFlowDeploymentRecord,
  ] as const;
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.home.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell title={$t(i18nKeys.console.home.pageTitle)} description={$t(i18nKeys.console.home.pageDescription)}>
  {#if pageLoading}
    <section class="nothing-empty-state">
      <p class="nothing-label">[{$t(i18nKeys.common.status.loading)}]</p>
      <div class="nothing-segment-bar mt-4" aria-hidden="true">
        {#each Array.from({ length: 12 }) as _, index (index)}
          <span class={index < 4 ? "is-filled" : ""}></span>
        {/each}
      </div>
    </section>
  {:else}
    <div class="nothing-console-home">
      {#if hasNoDeploymentBase}
        <section class="nothing-hero-grid">
          <div class="nothing-hero-primary">
            <p class="nothing-label">[{$t(i18nKeys.console.home.targetNeeded)}]</p>
            <h1>{$t(i18nKeys.console.home.deploymentBaseTitle)}</h1>
            <p class="nothing-copy">{$t(i18nKeys.console.home.deploymentBaseBody)}</p>
            <Button href="/deploy" class="nothing-button w-fit">
              <Rocket class="size-4" />
              {$t(i18nKeys.common.actions.newDeployment)}
            </Button>
          </div>
          <div class="nothing-flow-panel">
            <p class="nothing-label">detect -> plan -> execute -> verify -> rollback</p>
            <div class="nothing-flow-list">
              {#each flowSteps as step, index (step)}
                <div class="nothing-flow-row">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{$t(step)}</p>
                </div>
              {/each}
            </div>
          </div>
        </section>
      {:else if hasProjectsWithoutDeployments}
        <section class="nothing-inline-alert">
          <p class="nothing-label">[{$t(i18nKeys.console.deployments.noFilteredDeployments)}]</p>
          <h1>{$t(i18nKeys.console.home.deploymentsWithoutRecordsTitle)}</h1>
          <p>{$t(i18nKeys.console.home.deploymentsWithoutRecordsBody, { count: projects.length })}</p>
        </section>
      {/if}

      <section class="nothing-hero-grid">
        <div class="nothing-hero-primary dot-grid-subtle">
          <p class="nothing-label">{$t(i18nKeys.console.home.latestDeploymentTitle)}</p>
          <p class="nothing-display">{latestDeployment?.status ?? $t(i18nKeys.common.status.unknown)}</p>
          <div class="nothing-hero-meta">
            {#if latestDeployment}
              <span>{latestDeployment.runtimePlan.source.displayName}</span>
              <span>{latestProject?.name ?? latestDeployment.projectId}</span>
              <span>{formatTime(latestDeployment.createdAt)}</span>
            {:else}
              <span>{$t(i18nKeys.console.home.latestDeploymentEmpty)}</span>
            {/if}
          </div>
          <div class="mt-6 flex flex-wrap gap-2">
            <Button href="/deploy" class="nothing-button">
              <Rocket class="size-4" />
              {$t(i18nKeys.common.actions.newDeployment)}
            </Button>
            <Button href="/deployments" variant="outline" class="nothing-button-secondary">
              {$t(i18nKeys.common.actions.openDeployments)}
              <ArrowRight class="size-4" />
            </Button>
          </div>
        </div>
        <div class="nothing-instrument-panel">
          <div class="nothing-stat-row">
            <span>{$t(i18nKeys.common.domain.deployments)}</span>
            <strong>{deploymentTotal}</strong>
          </div>
          <div class="nothing-stat-row">
            <span>{$t(i18nKeys.console.deployments.inFlight)}</span>
            <strong>{activeDeployments}</strong>
          </div>
          <div class="nothing-progress-block">
            <div>
              <span>{$t(i18nKeys.common.status.active)}</span>
              <strong>{activeDeployments}/{deploymentTotal}</strong>
            </div>
            <div class="nothing-segment-bar" aria-hidden="true">
              {#each Array.from({ length: 12 }) as _, index (index)}
                <span class={index < activeSegments ? "is-filled" : ""}></span>
              {/each}
            </div>
          </div>
          <div class="nothing-progress-block">
            <div>
              <span>{$t(i18nKeys.common.status.healthy)}</span>
              <strong>{healthyDeployments}/{deploymentTotal}</strong>
            </div>
            <div class="nothing-segment-bar" aria-hidden="true">
              {#each Array.from({ length: 12 }) as _, index (index)}
                <span class={index < healthSegments ? "is-good" : ""}></span>
              {/each}
            </div>
          </div>
        </div>
      </section>

      <section class="nothing-metric-grid">
        <a href="/projects" class="nothing-metric-cell">
          <span>{$t(i18nKeys.common.domain.projects)}</span>
          <strong>{counts?.projects ?? 0}</strong>
          <small>{$t(i18nKeys.common.actions.viewProjects)}</small>
        </a>
        <a href="/servers" class="nothing-metric-cell">
          <span>{$t(i18nKeys.common.domain.servers)}</span>
          <strong>{counts?.deploymentTargets ?? 0}</strong>
          <small>{servers.length > 0 ? $t(i18nKeys.console.home.serverAvailableTarget) : $t(i18nKeys.console.home.serverCreatedDuringDeployment)}</small>
        </a>
        <div class="nothing-metric-cell">
          <span>{$t(i18nKeys.common.domain.environments)}</span>
          <strong>{counts?.environments ?? 0}</strong>
          <small>{environments.length > 0 ? $t(i18nKeys.console.home.environmentSnapshotEntry) : $t(i18nKeys.console.home.environmentCreatedDuringDeployment)}</small>
        </div>
        <a href="/deployments" class="nothing-metric-cell">
          <span>{$t(i18nKeys.common.domain.resources)}</span>
          <strong>{counts?.resources ?? 0}</strong>
          <small>{$t(i18nKeys.common.actions.viewDeployments)}</small>
        </a>
      </section>

      <section class="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <div class="nothing-section">
          <div class="nothing-section-header">
            <p class="nothing-label">{$t(i18nKeys.console.home.projectRelationsTitle)}</p>
            <p>{$t(i18nKeys.console.home.projectRelationsDescription)}</p>
          </div>
          {#if projects.length > 0}
            <div class="nothing-record-list">
              {#each projects.slice(0, 5) as project (project.id)}
                <a href={projectDetailHref(project.id)} class="nothing-record-row">
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.slug}</small>
                  </span>
                  <span>
                    {countProjectEnvironments(project, environments)} {$t(i18nKeys.common.domain.environments)}
                    / {countProjectResources(project, resources)} {$t(i18nKeys.common.domain.resources)}
                  </span>
                </a>
              {/each}
            </div>
          {:else}
            <div class="nothing-empty-state">
              <p>{$t(i18nKeys.console.home.projectRelationsEmpty)}</p>
            </div>
          {/if}
        </div>

        <div class="nothing-section">
          <div class="nothing-section-header">
            <p class="nothing-label">{$t(i18nKeys.console.deployments.latestTitle)}</p>
            <p>{$t(i18nKeys.console.home.latestDeploymentDescription)}</p>
          </div>
          {#if deployments.length > 0}
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
      </section>

      <section class="nothing-system-strip">
        <div>
          <Activity class="size-4" />
          <span>{$t(i18nKeys.console.home.readinessCard)}</span>
          <strong>{readiness?.status ?? $t(i18nKeys.common.status.unknown)}</strong>
        </div>
        <div>
          <Database class="size-4" />
          <span>{$t(i18nKeys.console.home.databaseCard)}</span>
          <strong>{readiness?.details?.databaseDriver ?? $t(i18nKeys.common.status.unknown)}</strong>
        </div>
        <div>
          <ArrowRight class="size-4" />
          <span>{$t(i18nKeys.console.home.modeCard)}</span>
          <strong>{version?.mode ?? "self-hosted"}</strong>
        </div>
      </section>
    </div>
  {/if}
</ConsoleShell>

<style>
  .nothing-console-home {
    display: grid;
    gap: 48px;
  }

  .nothing-label {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .nothing-copy,
  .nothing-section-header > p:not(.nothing-label),
  .nothing-inline-alert > p {
    max-width: 44rem;
    color: var(--text-secondary);
    font-size: 15px;
    line-height: 1.6;
  }

  .nothing-hero-grid {
    display: grid;
    gap: 24px;
  }

  @media (min-width: 1024px) {
    .nothing-hero-grid {
      grid-template-columns: minmax(0, 1.35fr) minmax(22rem, 0.65fr);
    }
  }

  .nothing-hero-primary,
  .nothing-instrument-panel,
  .nothing-flow-panel,
  .nothing-section,
  .nothing-inline-alert,
  .nothing-empty-state {
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    padding: 24px;
  }

  .nothing-hero-primary {
    min-height: 340px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .nothing-hero-primary h1 {
    max-width: 46rem;
    color: var(--text-display);
    font-size: clamp(38px, 7vw, 82px);
    font-weight: 300;
    letter-spacing: -0.04em;
    line-height: 0.95;
  }

  .nothing-display {
    color: var(--text-display);
    font-family: "Doto", var(--font-mono);
    font-size: clamp(52px, 11vw, 118px);
    font-weight: 700;
    letter-spacing: -0.05em;
    line-height: 0.9;
    text-transform: uppercase;
  }

  .nothing-hero-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    text-transform: uppercase;
  }

  :global(.nothing-button),
  :global(.nothing-button-secondary) {
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .nothing-flow-panel,
  .nothing-instrument-panel {
    display: grid;
    align-content: start;
    gap: 24px;
  }

  .nothing-flow-list,
  .nothing-record-list {
    display: grid;
    border-top: 1px solid var(--border-visible);
  }

  .nothing-flow-row,
  .nothing-record-row,
  .nothing-stat-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 16px;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding: 14px 0;
  }

  .nothing-flow-row span,
  .nothing-stat-row span,
  .nothing-progress-block span,
  .nothing-metric-cell span {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .nothing-flow-row p,
  .nothing-record-row strong {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 500;
  }

  .nothing-stat-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .nothing-stat-row strong {
    color: var(--text-display);
    font-family: var(--font-mono);
    font-size: 36px;
    font-weight: 400;
  }

  .nothing-progress-block {
    display: grid;
    gap: 8px;
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
    height: 12px;
    background: var(--border);
  }

  .nothing-segment-bar span.is-filled {
    background: var(--text-display);
  }

  .nothing-segment-bar span.is-good {
    background: var(--success);
  }

  .nothing-metric-grid,
  .nothing-system-strip {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--border-visible);
    border-radius: 16px;
    background: var(--surface);
  }

  @media (min-width: 768px) {
    .nothing-metric-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .nothing-system-strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .nothing-metric-cell,
  .nothing-system-strip > div {
    display: grid;
    gap: 12px;
    min-width: 0;
    border-bottom: 1px solid var(--border);
    padding: 20px;
  }

  @media (min-width: 768px) {
    .nothing-metric-cell,
    .nothing-system-strip > div {
      border-right: 1px solid var(--border);
      border-bottom: 0;
    }
  }

  .nothing-metric-cell strong {
    color: var(--text-display);
    font-family: var(--font-mono);
    font-size: 48px;
    font-weight: 400;
    line-height: 1;
  }

  .nothing-metric-cell small,
  .nothing-record-row small {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    text-transform: uppercase;
  }

  .nothing-section-header {
    display: grid;
    gap: 8px;
    margin-bottom: 24px;
  }

  .nothing-record-row {
    grid-template-columns: minmax(0, 1fr) auto;
    color: var(--text-primary);
  }

  .nothing-record-row > span:first-child {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .nothing-record-row > span:last-child {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    text-align: right;
    text-transform: uppercase;
  }

  .nothing-system-strip > div {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }

  .nothing-system-strip strong {
    grid-column: 2;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 13px;
    text-transform: uppercase;
  }

  .nothing-inline-alert h1 {
    color: var(--text-display);
    font-size: 24px;
    font-weight: 500;
  }

  .dot-grid-subtle {
    background-image: radial-gradient(circle, var(--border) 0.5px, transparent 0.5px);
    background-size: 12px 12px;
  }
</style>

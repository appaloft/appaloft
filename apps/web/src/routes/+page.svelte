<script lang="ts">
  import { browser } from "$app/environment";
  import {
    AlertCircle,
    ArrowRight,
    Blocks,
    Clock3,
    Play,
    Server,
    Zap,
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
    deploymentDetailHref,
    formatTime,
    latestProjectDeployment,
    projectDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { TranslationKey } from "@appaloft/i18n";

  type HomeAttentionReason = "failed" | "running" | "no-access" | "no-deployment";
  type HomeAttentionTone = "critical" | "progress" | "setup";

  interface HomeAttentionItem {
    project: ProjectSummary;
    reason: HomeAttentionReason;
    tone: HomeAttentionTone;
    count: number;
    deployment?: DeploymentSummary;
    resource?: ResourceSummary;
    href: string;
    actionLabelKey: TranslationKey;
    timestamp: string;
  }

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

  const homeProjectListLimit = 12;
  const homeResourceListLimit = 120;
  const homeDeploymentListLimit = 40;
  const homeEnvironmentListLimit = 120;
  const productQueryEnabled = $derived(browser && canRunProductQueries(authSessionQuery.data));
  const activeDeploymentStatuses: DeploymentSummary["status"][] = [
    "created",
    "planning",
    "planned",
    "running",
    "cancel-requested",
  ];

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
  const activeDeploymentCountQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "home", "count", { statuses: activeDeploymentStatuses }],
      queryFn: () => orpcClient.deployments.count({ statuses: activeDeploymentStatuses }),
      enabled: productQueryEnabled,
      refetchInterval: 10_000,
    }),
  );
  const failedDeploymentCountQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "home", "count", { status: "failed" }],
      queryFn: () => orpcClient.deployments.count({ status: "failed" }),
      enabled: productQueryEnabled,
      refetchInterval: 10_000,
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

  const projects = $derived(projectsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const serverTotal = $derived(serverCountQuery.data?.count ?? 0);
  const deploymentTotal = $derived(deploymentCountQuery.data?.count ?? deployments.length);
  const resourceTotal = $derived(resourceCountQuery.data?.count ?? resources.length);
  const deploymentsLoading = $derived(deploymentsQuery.isPending);
  const workStateLoading = $derived(
    projectsQuery.isPending ||
      resourcesQuery.isPending ||
      deploymentsQuery.isPending ||
      environmentsQuery.isPending ||
      deploymentCountQuery.isPending ||
      activeDeploymentCountQuery.isPending ||
      failedDeploymentCountQuery.isPending ||
      serverCountQuery.isPending ||
      resourceCountQuery.isPending,
  );
  const hasWork = $derived(
    projects.length > 0 ||
      resourceTotal > 0 ||
      deploymentTotal > 0 ||
      serverTotal > 0,
  );
  const activeDeployments = $derived(deployments.filter(isActiveDeployment));
  const failedDeployments = $derived(
    deployments.filter((deployment) => deployment.status === "failed"),
  );
  const activeDeploymentTotal = $derived(
    activeDeploymentCountQuery.data?.count ?? activeDeployments.length,
  );
  const failedDeploymentTotal = $derived(
    failedDeploymentCountQuery.data?.count ?? failedDeployments.length,
  );
  const attentionItems = $derived.by(() => {
    const items: HomeAttentionItem[] = [];

    for (const project of projects) {
      const projectScopedResources = projectResources(project);
      const projectScopedDeployments = projectDeployments(project);
      const latestDeployment = latestProjectDeployment(project, deployments);
      const failedDeployment = projectScopedDeployments.find(
        (deployment) => deployment.status === "failed",
      );
      const runningDeployment = projectScopedDeployments.find(isActiveDeployment);
      const resourceWithoutAccess = projectScopedResources.find(
        (resource) => !selectCurrentResourceAccessRoute(resource.accessSummary),
      );

      if (failedDeployment) {
        items.push({
          project,
          reason: "failed",
          tone: "critical",
          count: projectScopedDeployments.filter((deployment) => deployment.status === "failed")
            .length,
          deployment: failedDeployment,
          resource: resourceById(failedDeployment.resourceId),
          href: deploymentDetailHref(failedDeployment),
          actionLabelKey: i18nKeys.common.actions.viewDeployment,
          timestamp: failedDeployment.createdAt,
        });
        continue;
      }

      if (runningDeployment) {
        items.push({
          project,
          reason: "running",
          tone: "progress",
          count: projectScopedDeployments.filter(isActiveDeployment).length,
          deployment: runningDeployment,
          resource: resourceById(runningDeployment.resourceId),
          href: deploymentDetailHref(runningDeployment),
          actionLabelKey: i18nKeys.common.actions.viewDeployment,
          timestamp: runningDeployment.createdAt,
        });
        continue;
      }

      if (projectScopedResources.length > 0 && !latestDeployment) {
        items.push({
          project,
          reason: "no-deployment",
          tone: "setup",
          count: projectScopedResources.length,
          resource: projectScopedResources[0],
          href: projectDetailHref(project.id),
          actionLabelKey: i18nKeys.common.actions.openProject,
          timestamp: project.createdAt,
        });
        continue;
      }

      if (resourceWithoutAccess) {
        items.push({
          project,
          reason: "no-access",
          tone: "setup",
          count: projectScopedResources.filter(
            (resource) => !selectCurrentResourceAccessRoute(resource.accessSummary),
          ).length,
          resource: resourceWithoutAccess,
          deployment: latestDeployment ?? undefined,
          href: projectDetailHref(project.id),
          actionLabelKey: i18nKeys.common.actions.openProject,
          timestamp: latestDeployment?.createdAt ?? project.createdAt,
        });
      }
    }

    return items.sort(compareAttentionItems).slice(0, 6);
  });

  function isActiveDeployment(deployment: DeploymentSummary): boolean {
    return activeDeploymentStatuses.includes(deployment.status);
  }

  function compareAttentionItems(a: HomeAttentionItem, b: HomeAttentionItem): number {
    const severityRank: Record<HomeAttentionTone, number> = {
      critical: 0,
      progress: 1,
      setup: 2,
    };

    return (
      severityRank[a.tone] - severityRank[b.tone] ||
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  function projectResources(project: ProjectSummary): ResourceSummary[] {
    return resources.filter((resource) => resource.projectId === project.id);
  }

  function projectDeployments(project: ProjectSummary): DeploymentSummary[] {
    return deployments.filter((deployment) => deployment.projectId === project.id);
  }

  function projectById(projectId: string): ProjectSummary | undefined {
    return projects.find((project) => project.id === projectId);
  }

  function resourceById(resourceId: string): ResourceSummary | undefined {
    return resources.find((resource) => resource.id === resourceId);
  }

  function environmentName(environmentId: string): string {
    return environments.find((environment) => environment.id === environmentId)?.name ?? environmentId;
  }

  function deploymentContextLine(deployment: DeploymentSummary): string {
    const project = projectById(deployment.projectId);
    const resource = resourceById(deployment.resourceId);

    return [
      project?.name ?? deployment.projectId,
      resource?.name ?? deployment.resourceId,
      environmentName(deployment.environmentId),
    ].join(" / ");
  }

  function attentionTitleKey(reason: HomeAttentionReason): TranslationKey {
    const labels = {
      failed: i18nKeys.console.home.attentionFailedTitle,
      running: i18nKeys.console.home.attentionRunningTitle,
      "no-access": i18nKeys.console.home.attentionNoAccessTitle,
      "no-deployment": i18nKeys.console.home.attentionNoDeploymentTitle,
    } satisfies Record<HomeAttentionReason, TranslationKey>;

    return labels[reason];
  }

  function attentionDescriptionKey(reason: HomeAttentionReason): TranslationKey {
    const labels = {
      failed: i18nKeys.console.home.attentionFailedDescription,
      running: i18nKeys.console.home.attentionRunningDescription,
      "no-access": i18nKeys.console.home.attentionNoAccessDescription,
      "no-deployment": i18nKeys.console.home.attentionNoDeploymentDescription,
    } satisfies Record<HomeAttentionReason, TranslationKey>;

    return labels[reason];
  }

  function attentionToneLabelKey(tone: HomeAttentionTone): TranslationKey {
    const labels = {
      critical: i18nKeys.console.home.attentionToneCritical,
      progress: i18nKeys.console.home.attentionToneProgress,
      setup: i18nKeys.console.home.attentionToneSetup,
    } satisfies Record<HomeAttentionTone, TranslationKey>;

    return labels[tone];
  }

  function deploymentResourceName(deployment: DeploymentSummary): string {
    return resourceById(deployment.resourceId)?.name ?? deployment.resourceId;
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
        <section class="nothing-home-heading" data-home-workbench-heading>
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
          <Button href="/?modal=quick-deploy">
            <Play class="size-4" />
            {$t(i18nKeys.common.actions.quickDeploy)}
          </Button>
        </ConsoleEmptyState>
      {:else}
        <section class="nothing-home-heading" data-home-workbench-heading>
          <div>
            <p class="nothing-label">{$t(i18nKeys.console.home.projectsKicker)}</p>
            <h1>{$t(i18nKeys.console.home.projectsHeading)}</h1>
            <p>{$t(i18nKeys.console.home.projectsDescription)}</p>
          </div>
          <div class="nothing-home-actions">
            <Button href="/?modal=quick-deploy">
              <Play class="size-4" />
              {$t(i18nKeys.common.actions.quickDeploy)}
            </Button>
            <Button href="/projects" variant="outline">
              {$t(i18nKeys.common.actions.viewProjects)}
              <ArrowRight class="size-4" />
            </Button>
          </div>
        </section>

        <section class="nothing-status-strip" data-home-status-strip>
          <a href="/deployments" class="nothing-status-cell" data-tone="progress">
            <span>{$t(i18nKeys.console.home.activeDeploymentsMetric)}</span>
            {#if activeDeploymentCountQuery.isPending}
              <Skeleton class="h-7 w-10" />
            {:else}
              <strong>{activeDeploymentTotal}</strong>
            {/if}
            <small>{$t(i18nKeys.console.home.activeDeploymentsTitle)}</small>
          </a>
          <a href="/deployments" class="nothing-status-cell" data-tone="critical">
            <span>{$t(i18nKeys.console.home.failedDeploymentsMetric)}</span>
            {#if failedDeploymentCountQuery.isPending}
              <Skeleton class="h-7 w-10" />
            {:else}
              <strong>{failedDeploymentTotal}</strong>
            {/if}
            <small>{$t(i18nKeys.console.home.failedDeploymentsTitle)}</small>
          </a>
          <a href="/resources" class="nothing-status-cell">
            <span>{$t(i18nKeys.common.domain.resources)}</span>
            {#if resourceCountQuery.isPending}
              <Skeleton class="h-7 w-10" />
            {:else}
              <strong>{resourceTotal}</strong>
            {/if}
            <small>{$t(i18nKeys.console.home.resourcePreviewLabel)}</small>
          </a>
          <a href="/servers" class="nothing-status-cell">
            <span>{$t(i18nKeys.common.domain.servers)}</span>
            {#if serverCountQuery.isPending}
              <Skeleton class="h-7 w-10" />
            {:else}
              <strong>{serverTotal}</strong>
            {/if}
            <small>{$t(i18nKeys.console.home.serverAvailableTarget)}</small>
          </a>
        </section>

        <section class="nothing-home-layout">
          <div class="nothing-operations-board">
            <section class="nothing-deployment-board" data-home-deployment-watchlist>
              <div class="nothing-panel" data-home-active-deployments>
                <div class="nothing-section-header">
                  <p class="nothing-label">{$t(i18nKeys.console.home.activeDeploymentsTitle)}</p>
                  {#if activeDeploymentCountQuery.isPending}
                    <Skeleton class="h-5 w-12" />
                  {:else}
                    <h2>{activeDeploymentTotal}</h2>
                  {/if}
                  <p>{$t(i18nKeys.console.home.activeDeploymentsDescription)}</p>
                </div>
                {#if deploymentsLoading}
                  <div class="nothing-deployment-list" aria-hidden="true">
                    {#each Array.from({ length: 2 }) as _, index (index)}
                      <div class="nothing-deployment-row">
                        <span>
                          <Skeleton class="h-4 w-40" />
                          <Skeleton class="mt-2 h-3 w-56" />
                        </span>
                        <Skeleton class="h-6 w-24" />
                      </div>
                    {/each}
                  </div>
                {:else if activeDeployments.length > 0}
                  <div class="nothing-deployment-list">
                    {#each activeDeployments.slice(0, 4) as deployment (deployment.id)}
                      <a href={deploymentDetailHref(deployment)} class="nothing-deployment-row">
                        <span>
                          <strong>{deploymentResourceName(deployment)}</strong>
                          <small>{deploymentContextLine(deployment)}</small>
                        </span>
                        <span class="nothing-deployment-state">
                          <DeploymentStatusBadge status={deployment.status} />
                          <em>{formatTime(deployment.createdAt)}</em>
                        </span>
                      </a>
                    {/each}
                  </div>
                {:else}
                  <div class="nothing-panel-empty">
                    {$t(i18nKeys.console.home.noActiveDeployments)}
                  </div>
                {/if}
              </div>

              <div class="nothing-panel" data-home-failed-deployments>
                <div class="nothing-section-header">
                  <p class="nothing-label">{$t(i18nKeys.console.home.failedDeploymentsTitle)}</p>
                  {#if failedDeploymentCountQuery.isPending}
                    <Skeleton class="h-5 w-12" />
                  {:else}
                    <h2>{failedDeploymentTotal}</h2>
                  {/if}
                  <p>{$t(i18nKeys.console.home.failedDeploymentsDescription)}</p>
                </div>
                {#if deploymentsLoading}
                  <div class="nothing-deployment-list" aria-hidden="true">
                    {#each Array.from({ length: 2 }) as _, index (index)}
                      <div class="nothing-deployment-row">
                        <span>
                          <Skeleton class="h-4 w-40" />
                          <Skeleton class="mt-2 h-3 w-56" />
                        </span>
                        <Skeleton class="h-6 w-24" />
                      </div>
                    {/each}
                  </div>
                {:else if failedDeployments.length > 0}
                  <div class="nothing-deployment-list">
                    {#each failedDeployments.slice(0, 4) as deployment (deployment.id)}
                      <a href={deploymentDetailHref(deployment)} class="nothing-deployment-row">
                        <span>
                          <strong>{deploymentResourceName(deployment)}</strong>
                          <small>{deploymentContextLine(deployment)}</small>
                        </span>
                        <span class="nothing-deployment-state">
                          <DeploymentStatusBadge status={deployment.status} />
                          <em>{formatTime(deployment.createdAt)}</em>
                        </span>
                      </a>
                    {/each}
                  </div>
                {:else}
                  <div class="nothing-panel-empty">
                    {$t(i18nKeys.console.home.noFailedDeployments)}
                  </div>
                {/if}
              </div>
            </section>

            <section class="nothing-panel" data-home-attention-workqueue>
              <div class="nothing-section-header">
                <p class="nothing-label">{$t(i18nKeys.console.home.attentionTitle)}</p>
                <h2>{$t(i18nKeys.console.home.attentionHeading)}</h2>
                <p>{$t(i18nKeys.console.home.attentionDescription)}</p>
              </div>

              {#if workStateLoading}
                <div class="nothing-attention-list" aria-hidden="true">
                  {#each Array.from({ length: 3 }) as _, index (index)}
                    <div class="nothing-attention-card">
                      <Skeleton class="size-10 rounded-md" />
                      <span class="nothing-attention-copy">
                        <Skeleton class="h-4 w-48" />
                        <Skeleton class="h-3 w-full max-w-xl" />
                      </span>
                      <Skeleton class="h-8 w-28" />
                    </div>
                  {/each}
                </div>
              {:else if attentionItems.length > 0}
                <div class="nothing-attention-list">
                  {#each attentionItems as item (item.project.id + item.reason)}
                    <article class="nothing-attention-card" data-tone={item.tone}>
                      <span class="nothing-attention-icon" aria-hidden="true">
                        {#if item.tone === "critical"}
                          <AlertCircle class="size-4" />
                        {:else if item.tone === "progress"}
                          <Zap class="size-4" />
                        {:else}
                          <Clock3 class="size-4" />
                        {/if}
                      </span>
                      <div class="nothing-attention-copy">
                        <div class="nothing-attention-title">
                          <strong>{$t(attentionTitleKey(item.reason))}</strong>
                          <span>{$t(attentionToneLabelKey(item.tone))}</span>
                        </div>
                        <p>
                          {$t(attentionDescriptionKey(item.reason), {
                            count: item.count,
                            project: item.project.name,
                            resource: item.resource?.name ?? "-",
                          })}
                        </p>
                        <small>
                          {item.project.name}
                          {#if item.deployment}
                            · {deploymentResourceName(item.deployment)} · {formatTime(item.deployment.createdAt)}
                          {:else}
                            · {formatTime(item.timestamp)}
                          {/if}
                        </small>
                      </div>
                      <Button href={item.href} variant="outline" class="justify-self-start md:justify-self-end">
                        {$t(item.actionLabelKey)}
                        <ArrowRight class="size-4" />
                      </Button>
                    </article>
                  {/each}
                </div>
              {:else}
                <div class="nothing-panel-empty">
                  <strong>{$t(i18nKeys.console.home.noAttentionTitle)}</strong>
                  <span>{$t(i18nKeys.console.home.noAttentionDescription)}</span>
                </div>
              {/if}
            </section>

            <section class="nothing-panel" data-home-deployment-rollup>
              <div class="nothing-section-header">
                <p class="nothing-label">{$t(i18nKeys.console.home.recentDeploymentsTitle)}</p>
                <h2>{$t(i18nKeys.console.home.deploymentActivityTitle)}</h2>
                <p>{$t(i18nKeys.console.home.recentDeploymentsDescription)}</p>
                <p class="nothing-rollup-gap">
                  {$t(i18nKeys.console.home.recentDeploymentsReadModelGap)}
                </p>
              </div>
              {#if deploymentsLoading}
                <div class="nothing-deployment-rollup-list" aria-hidden="true">
                  {#each Array.from({ length: 4 }) as _, index (index)}
                    <div class="nothing-deployment-rollup-row">
                      <span>
                        <Skeleton class="h-4 w-40" />
                        <Skeleton class="mt-2 h-3 w-60" />
                      </span>
                      <Skeleton class="h-6 w-24" />
                    </div>
                  {/each}
                </div>
              {:else if deployments.length > 0}
                <div class="nothing-deployment-rollup-list">
                  {#each deployments.slice(0, 6) as deployment (deployment.id)}
                    <a href={deploymentDetailHref(deployment)} class="nothing-deployment-rollup-row">
                      <span>
                        <strong>{deploymentResourceName(deployment)}</strong>
                        <small>{deploymentContextLine(deployment)}</small>
                      </span>
                      <span class="nothing-deployment-state">
                        <DeploymentStatusBadge status={deployment.status} />
                        <em>{formatTime(deployment.createdAt)}</em>
                      </span>
                    </a>
                  {/each}
                </div>
                <a href="/deployments" class="nothing-side-link">
                  <span>{$t(i18nKeys.common.actions.viewAll)}</span>
                  <ArrowRight class="size-3.5" />
                </a>
              {:else}
                <div class="nothing-panel-empty">
                  {$t(i18nKeys.console.home.latestDeploymentEmpty)}
                </div>
              {/if}
            </section>
          </div>

          <aside class="nothing-side-stack">
            <section class="nothing-panel">
              <div class="nothing-section-header">
                <p class="nothing-label">{$t(i18nKeys.console.home.nextStepsTitle)}</p>
                <p>{$t(i18nKeys.console.home.nextStepsDescription)}</p>
              </div>
              <div class="nothing-next-actions">
                <a href="/?modal=quick-deploy" class="nothing-next-row">
                  <Play class="size-4" />
                  <span>{$t(i18nKeys.common.actions.quickDeploy)}</span>
                  <ArrowRight class="size-3.5" />
                </a>
                <a href="/projects" class="nothing-next-row">
                  <Blocks class="size-4" />
                  <span>{$t(i18nKeys.common.actions.viewProjects)}</span>
                  <ArrowRight class="size-3.5" />
                </a>
                <a href="/servers" class="nothing-next-row">
                  <Server class="size-4" />
                  <span>{$t(i18nKeys.common.actions.viewServers)}</span>
                  <ArrowRight class="size-3.5" />
                </a>
                <a href="/deployments" class="nothing-next-row">
                  <Zap class="size-4" />
                  <span>{$t(i18nKeys.common.actions.viewDeployments)}</span>
                  <ArrowRight class="size-3.5" />
                </a>
              </div>
            </section>

            <section class="nothing-panel" data-home-activity-read-model-gap>
              <div class="nothing-section-header">
                <p class="nothing-label">{$t(i18nKeys.console.home.recentActivityTitle)}</p>
                <p>{$t(i18nKeys.console.home.recentActivityDescription)}</p>
              </div>
              <div class="nothing-panel-empty">
                {$t(i18nKeys.console.home.recentActivityReadModelGap)}
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
    --nothing-motion-duration: 160ms;
    --nothing-motion-ease: cubic-bezier(0.2, 0, 0, 1);

    display: grid;
    gap: 20px;
  }

  .nothing-label {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .nothing-home-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 14px;
  }

  .nothing-home-heading > div {
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
    max-width: 50rem;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.6;
  }

  .nothing-home-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .nothing-home-layout {
    display: grid;
    gap: 20px;
  }

  @media (min-width: 1180px) {
    .nothing-home-layout {
      grid-template-columns: minmax(0, 1fr) 22rem;
      align-items: start;
    }
  }

  .nothing-status-strip {
    display: grid;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--input);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-2xs);
  }

  @media (min-width: 700px) {
    .nothing-status-strip {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .nothing-status-cell {
    display: grid;
    min-width: 0;
    gap: 7px;
    border-top: 1px solid var(--border);
    color: var(--text-primary);
    padding: 14px 16px;
    text-decoration: none;
  }

  .nothing-status-cell:first-child {
    border-top: 0;
  }

  @media (min-width: 700px) {
    .nothing-status-cell {
      border-top: 0;
      border-left: 1px solid var(--border);
    }

    .nothing-status-cell:first-child {
      border-left: 0;
    }
  }

  .nothing-status-cell span,
  .nothing-status-cell small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nothing-status-cell span {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .nothing-status-cell strong {
    color: var(--text-display);
    font-family: var(--font-mono);
    font-size: 26px;
    font-weight: 500;
    line-height: 1;
  }

  .nothing-status-cell small {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.4;
  }

  .nothing-status-cell[data-tone="critical"] strong {
    color: var(--destructive);
  }

  .nothing-status-cell[data-tone="progress"] strong {
    color: var(--primary);
  }

  .nothing-operations-board,
  .nothing-side-stack {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .nothing-panel {
    min-width: 0;
    border: 1px solid var(--input);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-2xs);
    padding: 16px;
  }

  .nothing-section-header {
    display: grid;
    gap: 6px;
    margin-bottom: 14px;
  }

  .nothing-section-header h2 {
    color: var(--text-display);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.3;
  }

  .nothing-section-header > p:not(.nothing-label) {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
  }

  .nothing-rollup-gap {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  .nothing-attention-list,
  .nothing-deployment-list,
  .nothing-deployment-rollup-list,
  .nothing-next-actions {
    display: grid;
    min-width: 0;
  }

  .nothing-attention-card {
    display: grid;
    min-width: 0;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    border-top: 1px solid var(--input);
    padding: 14px 0;
  }

  .nothing-attention-card:first-child,
  .nothing-deployment-row:first-child,
  .nothing-deployment-rollup-row:first-child,
  .nothing-next-row:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .nothing-attention-card:last-child,
  .nothing-deployment-row:last-child,
  .nothing-deployment-rollup-row:last-child,
  .nothing-next-row:last-child {
    padding-bottom: 0;
  }

  @media (min-width: 760px) {
    .nothing-attention-card {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
    }
  }

  .nothing-attention-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--input);
    border-radius: var(--radius-md);
    background: color-mix(in oklch, var(--muted) 45%, var(--surface));
    color: var(--primary);
  }

  .nothing-attention-icon {
    width: 40px;
    height: 40px;
  }

  .nothing-attention-card[data-tone="critical"] .nothing-attention-icon {
    color: var(--destructive);
  }

  .nothing-attention-card[data-tone="progress"] .nothing-attention-icon {
    color: var(--primary);
  }

  .nothing-attention-copy,
  .nothing-attention-title,
  .nothing-deployment-row,
  .nothing-deployment-row > span,
  .nothing-deployment-rollup-row,
  .nothing-deployment-rollup-row > span,
  .nothing-next-row {
    min-width: 0;
  }

  .nothing-attention-copy {
    display: grid;
    gap: 5px;
  }

  .nothing-attention-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .nothing-attention-title strong,
  .nothing-deployment-row strong,
  .nothing-deployment-rollup-row strong {
    overflow: hidden;
    color: var(--text-display);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nothing-attention-title span {
    border: 1px solid var(--input);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.2;
    padding: 2px 6px;
    text-transform: uppercase;
  }

  .nothing-attention-copy p,
  .nothing-panel-empty {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
  }

  .nothing-attention-copy small,
  .nothing-deployment-row small,
  .nothing-deployment-row em,
  .nothing-deployment-rollup-row small,
  .nothing-deployment-rollup-row em {
    overflow: hidden;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nothing-deployment-board {
    display: grid;
    gap: 16px;
  }

  @media (min-width: 860px) {
    .nothing-deployment-board {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .nothing-deployment-row,
  .nothing-deployment-rollup-row,
  .nothing-next-row,
  .nothing-side-link {
    color: var(--text-primary);
    text-decoration: none;
  }

  .nothing-deployment-row,
  .nothing-deployment-rollup-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border-top: 1px solid var(--input);
    padding: 12px 0;
  }

  .nothing-deployment-row > span:first-child,
  .nothing-deployment-rollup-row > span:first-child {
    display: grid;
    gap: 4px;
  }

  .nothing-deployment-state {
    display: grid;
    justify-items: end;
    gap: 4px;
    min-width: 0;
  }

  .nothing-next-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border-top: 1px solid var(--input);
    padding: 12px 0;
  }

  .nothing-next-row :global(svg:first-child) {
    color: var(--primary);
  }

  .nothing-next-row :global(svg:last-child) {
    color: var(--text-secondary);
  }

  .nothing-panel-empty {
    display: grid;
    gap: 4px;
    border: 1px dashed var(--input);
    border-radius: var(--radius-md);
    padding: 14px;
  }

  .nothing-panel-empty strong {
    color: var(--text-display);
    font-size: 13px;
    font-weight: 600;
  }

  .nothing-side-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    color: var(--primary);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    text-decoration: none;
  }

  .nothing-side-link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .nothing-deployment-row:hover,
  .nothing-deployment-row:focus-visible,
  .nothing-deployment-rollup-row:hover,
  .nothing-deployment-rollup-row:focus-visible,
  .nothing-status-cell:hover,
  .nothing-status-cell:focus-visible,
  .nothing-next-row:hover,
  .nothing-next-row:focus-visible {
    background: color-mix(in oklch, var(--primary) 3%, transparent);
  }

  .nothing-deployment-row:focus-visible,
  .nothing-deployment-rollup-row:focus-visible,
  .nothing-status-cell:focus-visible,
  .nothing-next-row:focus-visible,
  .nothing-side-link:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .nothing-deployment-row,
    .nothing-deployment-rollup-row,
    .nothing-status-cell,
    .nothing-next-row {
      transition-duration: 1ms;
    }
  }
</style>

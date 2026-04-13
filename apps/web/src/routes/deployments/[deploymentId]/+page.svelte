<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import {
    ArrowLeft,
    Boxes,
    ClipboardList,
    Clock3,
    FileText,
    FolderOpen,
    Rocket,
    Server,
    ShieldCheck,
  } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    deploymentBadgeVariant,
    findDeployment,
    findEnvironment,
    findProject,
    findResource,
    findServer,
    formatTime,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { projectsQuery, serversQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser);

  const deploymentId = $derived(page.params.deploymentId ?? "");
  const projects = $derived(projectsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      serversQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      deploymentsQuery.isPending,
  );
  const deployment = $derived(findDeployment(deployments, deploymentId));
  const project = $derived(deployment ? findProject(projects, deployment.projectId) : null);
  const environment = $derived(
    deployment ? findEnvironment(environments, deployment.environmentId) : null,
  );
  const resource = $derived(deployment ? findResource(resources, deployment.resourceId) : null);
  const server = $derived(deployment ? findServer(servers, deployment.serverId) : null);
  const sourceMetadata = $derived(Object.entries(deployment?.runtimePlan.source.metadata ?? {}));
  const targetMetadata = $derived(Object.entries(deployment?.runtimePlan.target.metadata ?? {}));
</script>

<svelte:head>
  <title>{deployment?.runtimePlan.source.displayName ?? $t(i18nKeys.console.deployments.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={deployment?.runtimePlan.source.displayName ?? $t(i18nKeys.console.deployments.pageTitle)}
  description={$t(i18nKeys.console.deployments.detailDescription)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-40 w-full" />
      <div class="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Skeleton class="h-96 w-full" />
        <Skeleton class="h-96 w-full" />
      </div>
    </div>
  {:else if !deployment}
    <section class="rounded-lg border bg-background p-6 md:p-8">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.errors.backend.notFound)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.deployments.notFoundTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.deployments.notFoundBody)}
        </p>
      </div>
      <div class="mt-6">
        <Button href="/deployments" variant="outline">
          <ArrowLeft class="size-4" />
          {$t(i18nKeys.common.actions.backToDeployments)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-5">
      <section class="rounded-lg border bg-background p-5">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant={deploymentBadgeVariant(deployment.status)}>{deployment.status}</Badge>
              <Badge variant="outline">{deployment.runtimePlan.source.kind}</Badge>
              {#if deployment.rollbackOfDeploymentId}
                <Badge variant="secondary">
                  {$t(i18nKeys.console.deployments.rollbackOf)} {deployment.rollbackOfDeploymentId}
                </Badge>
              {/if}
            </div>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold md:text-3xl">
                {deployment.runtimePlan.source.displayName}
              </h1>
              <p class="break-all text-sm leading-6 text-muted-foreground">
                {deployment.runtimePlan.source.locator}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button href="/deployments" variant="outline">
              <ArrowLeft class="size-4" />
              {$t(i18nKeys.common.actions.backToDeployments)}
            </Button>
            {#if project}
              <Button href={`/projects/${project.id}`} variant="outline">
                <FolderOpen class="size-4" />
                {$t(i18nKeys.common.actions.openProject)}
              </Button>
            {/if}
          </div>
        </div>

        <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderOpen class="size-4" />
              {$t(i18nKeys.common.domain.project)}
            </p>
            <p class="mt-2 truncate font-medium">{project?.name ?? deployment.projectId}</p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck class="size-4" />
              {$t(i18nKeys.common.domain.environment)}
            </p>
            <p class="mt-2 truncate font-medium">{environment?.name ?? deployment.environmentId}</p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Boxes class="size-4" />
              {$t(i18nKeys.common.domain.resource)}
            </p>
            <p class="mt-2 truncate font-medium">{resource?.name ?? deployment.resourceId}</p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Server class="size-4" />
              {$t(i18nKeys.common.domain.server)}
            </p>
            <p class="mt-2 truncate font-medium">{server?.name ?? deployment.serverId}</p>
          </div>
        </div>
      </section>

      <section class="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div class="space-y-5">
          <section class="rounded-lg border bg-background p-5">
            <div>
              <h2 class="flex items-center gap-2 text-lg font-semibold">
                <ClipboardList class="size-5 text-muted-foreground" />
                {$t(i18nKeys.console.deployments.runtimePlanTitle)}
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.deployments.runtimePlanDescription)}
              </p>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-md border px-4 py-3">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.deployments.buildStrategy)}
                </p>
                <p class="mt-1 font-medium">{deployment.runtimePlan.buildStrategy}</p>
              </div>
              <div class="rounded-md border px-4 py-3">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.deployments.packagingMode)}
                </p>
                <p class="mt-1 font-medium">{deployment.runtimePlan.packagingMode}</p>
              </div>
              <div class="rounded-md border px-4 py-3">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.deployments.executionKind)}
                </p>
                <p class="mt-1 font-medium">{deployment.runtimePlan.execution.kind}</p>
              </div>
              <div class="rounded-md border px-4 py-3">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.deployments.generatedAt)}
                </p>
                <p class="mt-1 font-medium">{formatTime(deployment.runtimePlan.generatedAt)}</p>
              </div>
            </div>

            <div class="mt-4 rounded-md border px-4 py-3">
              <p class="text-xs text-muted-foreground">
                {$t(i18nKeys.console.deployments.detectSummary)}
              </p>
              <p class="mt-2 text-sm leading-6">{deployment.runtimePlan.detectSummary}</p>
            </div>

            <div class="mt-4 space-y-3">
              <h3 class="text-sm font-medium">{$t(i18nKeys.console.deployments.planSteps)}</h3>
              <div class="space-y-2">
                {#each deployment.runtimePlan.steps as step, index (`${deployment.id}-${index}`)}
                  <div class="flex gap-3 rounded-md border px-4 py-3">
                    <span
                      class="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium"
                    >
                      {index + 1}
                    </span>
                    <p class="text-sm leading-6">{step}</p>
                  </div>
                {/each}
              </div>
            </div>
          </section>

          <section class="rounded-lg border bg-background p-5">
            <div>
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.deployments.executionTitle)}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.deployments.executionDescription)}
              </p>
            </div>

            <div class="mt-4 grid gap-3">
              {#if deployment.runtimePlan.execution.workingDirectory}
                <div class="rounded-md border px-4 py-3">
                  <p class="text-xs text-muted-foreground">
                    {$t(i18nKeys.console.deployments.workingDirectory)}
                  </p>
                  <p class="mt-1 break-all text-sm font-medium">
                    {deployment.runtimePlan.execution.workingDirectory}
                  </p>
                </div>
              {/if}
              {#if deployment.runtimePlan.execution.installCommand}
                <div class="rounded-md border px-4 py-3">
                  <p class="text-xs text-muted-foreground">
                    {$t(i18nKeys.console.deployments.installCommand)}
                  </p>
                  <p class="mt-1 break-all font-mono text-sm">
                    {deployment.runtimePlan.execution.installCommand}
                  </p>
                </div>
              {/if}
              {#if deployment.runtimePlan.execution.buildCommand}
                <div class="rounded-md border px-4 py-3">
                  <p class="text-xs text-muted-foreground">
                    {$t(i18nKeys.console.deployments.buildCommand)}
                  </p>
                  <p class="mt-1 break-all font-mono text-sm">
                    {deployment.runtimePlan.execution.buildCommand}
                  </p>
                </div>
              {/if}
              {#if deployment.runtimePlan.execution.startCommand}
                <div class="rounded-md border px-4 py-3">
                  <p class="text-xs text-muted-foreground">
                    {$t(i18nKeys.console.deployments.startCommand)}
                  </p>
                  <p class="mt-1 break-all font-mono text-sm">
                    {deployment.runtimePlan.execution.startCommand}
                  </p>
                </div>
              {/if}
              <div class="grid gap-3 sm:grid-cols-2">
                {#if deployment.runtimePlan.execution.port}
                  <div class="rounded-md border px-4 py-3">
                    <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.port)}</p>
                    <p class="mt-1 font-medium">{deployment.runtimePlan.execution.port}</p>
                  </div>
                {/if}
                {#if deployment.runtimePlan.execution.healthCheckPath}
                  <div class="rounded-md border px-4 py-3">
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.deployments.healthCheckPath)}
                    </p>
                    <p class="mt-1 break-all font-medium">
                      {deployment.runtimePlan.execution.healthCheckPath}
                    </p>
                  </div>
                {/if}
                {#if deployment.runtimePlan.execution.image}
                  <div class="rounded-md border px-4 py-3">
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.deployments.dockerImage)}
                    </p>
                    <p class="mt-1 break-all font-medium">{deployment.runtimePlan.execution.image}</p>
                  </div>
                {/if}
                {#if deployment.runtimePlan.execution.dockerfilePath}
                  <div class="rounded-md border px-4 py-3">
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.deployments.dockerfilePath)}
                    </p>
                    <p class="mt-1 break-all font-medium">
                      {deployment.runtimePlan.execution.dockerfilePath}
                    </p>
                  </div>
                {/if}
                {#if deployment.runtimePlan.execution.composeFile}
                  <div class="rounded-md border px-4 py-3">
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.deployments.composeFile)}
                    </p>
                    <p class="mt-1 break-all font-medium">
                      {deployment.runtimePlan.execution.composeFile}
                    </p>
                  </div>
                {/if}
              </div>
            </div>
          </section>
        </div>

        <div class="space-y-5">
          <section class="rounded-lg border bg-background p-5">
            <h2 class="flex items-center gap-2 text-lg font-semibold">
              <Clock3 class="size-5 text-muted-foreground" />
              {$t(i18nKeys.console.deployments.timelineTitle)}
            </h2>
            <div class="mt-4 grid gap-3">
              <div class="rounded-md border px-4 py-3">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.createdAt)}</p>
                <p class="mt-1 font-medium">{formatTime(deployment.createdAt)}</p>
              </div>
              {#if deployment.startedAt}
                <div class="rounded-md border px-4 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.startedAt)}</p>
                  <p class="mt-1 font-medium">{formatTime(deployment.startedAt)}</p>
                </div>
              {/if}
              {#if deployment.finishedAt}
                <div class="rounded-md border px-4 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.finishedAt)}</p>
                  <p class="mt-1 font-medium">{formatTime(deployment.finishedAt)}</p>
                </div>
              {/if}
            </div>
          </section>

          <section class="rounded-lg border bg-background p-5">
            <div>
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.deployments.snapshotTitle)}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.deployments.snapshotDescription)}
              </p>
            </div>
            <div class="mt-4 space-y-3">
              <div class="rounded-md border px-4 py-3">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.deployments.precedence)}</p>
                <p class="mt-1 break-words text-sm font-medium">
                  {deployment.environmentSnapshot.precedence.join(" / ")}
                </p>
              </div>
              {#if deployment.environmentSnapshot.variables.length > 0}
                {#each deployment.environmentSnapshot.variables as variable (variable.key)}
                  <div class="rounded-md border px-4 py-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <p class="font-medium">{variable.key}</p>
                      <Badge variant={variable.isSecret ? "secondary" : "outline"}>
                        {variable.isSecret
                          ? $t(i18nKeys.console.quickDeploy.secretStorage)
                          : $t(i18nKeys.console.quickDeploy.variablePlainStorage)}
                      </Badge>
                    </div>
                    <p class="mt-2 text-sm text-muted-foreground">
                      {variable.scope} · {variable.exposure} · {variable.kind}
                    </p>
                  </div>
                {/each}
              {:else}
                <div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.deployments.noSnapshotVariables)}
                </div>
              {/if}
            </div>
          </section>

          <section class="rounded-lg border bg-background p-5">
            <div>
              <h2 class="flex items-center gap-2 text-lg font-semibold">
                <FileText class="size-5 text-muted-foreground" />
                {$t(i18nKeys.console.deployments.logsTitle)}
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.deployments.logsDescription, {
                  count: deployment.logCount,
                })}
              </p>
            </div>

            <div class="mt-4 space-y-3">
              {#if deployment.logs.length > 0}
                {#each deployment.logs as log, index (`${log.timestamp}-${index}`)}
                  <div class="rounded-md border px-4 py-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <Badge variant={log.level === "error" ? "destructive" : "outline"}>
                        {log.level}
                      </Badge>
                      <span class="text-xs text-muted-foreground">
                        {log.phase} · {formatTime(log.timestamp)}
                      </span>
                    </div>
                    <p class="mt-2 text-sm leading-6">{log.message}</p>
                  </div>
                {/each}
              {:else}
                <div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.deployments.noLogs)}
                </div>
              {/if}
            </div>
          </section>

          {#if sourceMetadata.length > 0 || targetMetadata.length > 0}
            <section class="rounded-lg border bg-background p-5">
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.deployments.metadataTitle)}</h2>
              <div class="mt-4 space-y-3">
                {#each [...sourceMetadata, ...targetMetadata] as [key, value] (`${key}-${value}`)}
                  <div class="rounded-md border px-4 py-3">
                    <p class="text-xs text-muted-foreground">{key}</p>
                    <p class="mt-1 break-all text-sm font-medium">{value}</p>
                  </div>
                {/each}
              </div>
            </section>
          {/if}
        </div>
      </section>
    </div>
  {/if}
</ConsoleShell>

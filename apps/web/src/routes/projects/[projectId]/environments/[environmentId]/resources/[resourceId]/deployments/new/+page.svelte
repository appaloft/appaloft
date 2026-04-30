<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ArrowLeft, Boxes, Eye, GitBranch, Play, Server, Waypoints } from "@lucide/svelte";
  import type {
    CreateDeploymentInput,
    DeploymentPlanResponse,
    DeploymentProgressEvent,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import DeploymentProgressDialog from "$lib/components/console/DeploymentProgressDialog.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    createDeploymentWithProgress,
    type DeploymentProgressDialogStatus,
  } from "$lib/console/deployment-progress";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    deploymentDetailHref,
    findEnvironment,
    findProject,
    findResource,
    findServer,
    latestResourceDeployment,
    projectDetailHref,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const { projectsQuery, environmentsQuery, resourcesQuery, serversQuery, deploymentsQuery } =
    createConsoleQueries(browser);

  const resourceId = $derived(page.params.resourceId ?? "");
  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      serversQuery.isPending ||
      deploymentsQuery.isPending,
  );
  const resource = $derived(findResource(resources, resourceId));
  const project = $derived(resource ? findProject(projects, resource.projectId) : null);
  const environment = $derived(
    resource ? findEnvironment(environments, resource.environmentId) : null,
  );
  const latestDeployment = $derived(resource ? latestResourceDeployment(resource, deployments) : null);

  let serverId = $state("");
  let destinationId = $state("");
  let defaultedResourceId = $state("");
  let deploymentCreatePending = $state(false);
  let deploymentProgressDialogOpen = $state(false);
  let deploymentProgressDialogStatus = $state<DeploymentProgressDialogStatus>("idle");
  let deploymentProgressEvents = $state<DeploymentProgressEvent[]>([]);
  let deploymentProgressStreamError = $state("");
  let deploymentProgressDeploymentId = $state("");
  let deploymentProgressRequestId = $state("");
  let deploymentPlanPending = $state(false);
  let deploymentPlanPreview = $state<DeploymentPlanResponse | null>(null);
  let deploymentPlanError = $state("");
  let feedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);

  const selectedServer = $derived(findServer(servers, serverId));
  const deploymentSource = $derived(latestDeployment?.runtimePlan.source ?? null);
  const canCreateDeployment = $derived(Boolean(resource && serverId && !deploymentCreatePending));
  const canPreviewDeploymentPlan = $derived(Boolean(resource && serverId && !deploymentPlanPending));

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (defaultedResourceId === resource.id) {
      return;
    }

    defaultedResourceId = resource.id;
    destinationId = resource.destinationId ?? latestDeployment?.destinationId ?? "";
  });

  $effect(() => {
    if (!browser || serverId) {
      return;
    }

    serverId = latestDeployment?.serverId ?? servers[0]?.id ?? "";
  });

  function appendDeploymentProgressEvent(event: DeploymentProgressEvent): void {
    deploymentProgressEvents = [...deploymentProgressEvents, event];
    deploymentProgressDeploymentId = event.deploymentId ?? deploymentProgressDeploymentId;

    if (event.status === "failed") {
      deploymentProgressDialogStatus = "failed";
    } else if (event.status === "succeeded") {
      deploymentProgressDialogStatus = "succeeded";
    } else {
      deploymentProgressDialogStatus = "running";
    }
  }

  async function refreshWorkspaceData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["resources"] }),
      queryClient.invalidateQueries({ queryKey: ["deployments"] }),
    ]);
  }

  async function createResourceDeployment(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!resource || !canCreateDeployment) {
      return;
    }

    const input: CreateDeploymentInput = {
      projectId: resource.projectId,
      environmentId: resource.environmentId,
      resourceId: resource.id,
      serverId,
      ...(destinationId.trim() ? { destinationId: destinationId.trim() } : {}),
    };

    deploymentCreatePending = true;
    feedback = null;
    deploymentProgressDialogOpen = true;
    deploymentProgressDialogStatus = "running";
    deploymentProgressEvents = [];
    deploymentProgressStreamError = "";
    deploymentProgressDeploymentId = "";
    deploymentProgressRequestId = "";

    try {
      const result = await createDeploymentWithProgress(input, appendDeploymentProgressEvent, {
        onRequestId: (requestId) => {
          deploymentProgressRequestId = requestId;
        },
        onStreamError: (message) => {
          deploymentProgressStreamError = message;
        },
      });
      deploymentProgressDeploymentId = result.id;
      deploymentProgressDialogStatus = "succeeded";
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.newDeploymentSuccessTitle),
        detail: result.id,
      };
      await refreshWorkspaceData();
      await goto(
        deploymentDetailHref({
          id: result.id,
          projectId: resource.projectId,
          environmentId: resource.environmentId,
          resourceId: resource.id,
        }),
      );
    } catch (error) {
      deploymentProgressDialogStatus = "failed";
      deploymentProgressStreamError = readErrorMessage(error);
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.newDeploymentErrorTitle),
        detail: readErrorMessage(error),
      };
    } finally {
      deploymentCreatePending = false;
    }
  }

  async function previewResourceDeploymentPlan(): Promise<void> {
    if (!resource || !canPreviewDeploymentPlan) {
      return;
    }

    deploymentPlanPending = true;
    deploymentPlanError = "";
    deploymentPlanPreview = null;

    try {
      deploymentPlanPreview = await orpcClient.deployments.plan({
        projectId: resource.projectId,
        environmentId: resource.environmentId,
        resourceId: resource.id,
        serverId,
        ...(destinationId.trim() ? { destinationId: destinationId.trim() } : {}),
      });
    } catch (error) {
      deploymentPlanError = readErrorMessage(error);
    } finally {
      deploymentPlanPending = false;
    }
  }

  function deploymentPlanStatusLabel(status: DeploymentPlanResponse["readiness"]["status"]): string {
    if (status === "ready") {
      return $t(i18nKeys.console.resources.newDeploymentPlanReady);
    }
    if (status === "warning") {
      return $t(i18nKeys.console.resources.newDeploymentPlanWarning);
    }
    return $t(i18nKeys.console.resources.newDeploymentPlanBlocked);
  }

  function deploymentProgressHref(): string {
    if (!resource || !deploymentProgressDeploymentId) {
      return "/deployments";
    }

    return deploymentDetailHref({
      id: deploymentProgressDeploymentId,
      projectId: resource.projectId,
      environmentId: resource.environmentId,
      resourceId: resource.id,
    });
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.common.actions.newDeployment)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.common.actions.newDeployment)}
  description={$t(i18nKeys.console.resources.newDeploymentDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle), href: "/projects" },
    {
      label: project?.name ?? $t(i18nKeys.common.domain.project),
      href: project ? projectDetailHref(project.id) : undefined,
    },
    { label: environment?.name ?? $t(i18nKeys.common.domain.environment) },
    {
      label: resource?.name ?? $t(i18nKeys.common.domain.resource),
      href: resource ? resourceDetailHref(resource) : undefined,
    },
    { label: $t(i18nKeys.common.actions.newDeployment) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-36 w-full" />
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton class="h-80 w-full" />
        <Skeleton class="h-80 w-full" />
      </div>
    </div>
  {:else if !resource}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.errors.backend.notFound)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.resources.notFoundTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.resources.notFoundBody)}
        </p>
      </div>
      <div class="mt-6">
        <Button href="/projects" variant="outline">
          <ArrowLeft class="size-4" />
          {$t(i18nKeys.common.actions.backToProjects)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="space-y-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{$t(i18nKeys.common.domain.resource)}</Badge>
              <Badge variant="secondary">{resource.kind}</Badge>
              <Badge variant="outline">{$t(i18nKeys.common.status.unknown)}</Badge>
            </div>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold md:text-3xl">
                {$t(i18nKeys.common.actions.newDeployment)}
              </h1>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.resources.newDeploymentDescription)}
              </p>
            </div>
            <p class="text-xs text-muted-foreground">
              {project?.name ?? resource.projectId} · {environment?.name ?? resource.environmentId} · {resource.name}
            </p>
          </div>
          <Button href={resourceDetailHref(resource)} variant="outline">
            <ArrowLeft class="size-4" />
            {$t(i18nKeys.common.actions.openResource)}
          </Button>
        </div>
      </section>

      <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <form class="border-y" onsubmit={createResourceDeployment}>
          <section class="grid gap-5 py-6 md:grid-cols-[12rem_minmax(0,1fr)]">
            <div class="flex items-start gap-2">
              <Server class="mt-1 size-4 text-muted-foreground" />
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <h2 class="font-semibold">
                    {$t(i18nKeys.console.resources.newDeploymentTargetTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.deploymentLifecycle}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </div>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.resources.newDeploymentTargetDescription)}
                </p>
              </div>
            </div>

            <div class="space-y-5">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="space-y-1.5 text-sm font-medium">
                  <span class="inline-flex items-center gap-1.5">
                    {$t(i18nKeys.common.domain.server)}
                    <DocsHelpLink
                      href={webDocsHrefs.serverDeploymentTarget}
                      ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                      className="size-5"
                    />
                  </span>
                  <Select.Root bind:value={serverId} type="single">
                    <Select.Trigger class="w-full">
                      {selectedServer?.name ?? $t(i18nKeys.console.domainBindings.noServerOptions)}
                    </Select.Trigger>
                    <Select.Content>
                      {#each servers as server (server.id)}
                        <Select.Item value={server.id}>{server.name}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </label>

                <label class="space-y-1.5 text-sm font-medium">
                  <span class="inline-flex items-center gap-1.5">
                    {$t(i18nKeys.common.domain.destination)}
                    <DocsHelpLink
                      href={webDocsHrefs.domainGeneratedAccessRoute}
                      ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                      className="size-5"
                    />
                  </span>
                  <Input
                    bind:value={destinationId}
                    autocomplete="off"
                    placeholder={$t(i18nKeys.console.domainBindings.formDestinationPlaceholder)}
                  />
                </label>
              </div>

              {#if feedback}
                <div
                  class={[
                    "rounded-md border px-3 py-2 text-sm",
                    feedback.kind === "success"
                      ? "border-primary/25 bg-primary/5"
                      : "border-destructive/30 bg-destructive/5 text-destructive",
                  ]}
                >
                  <p class="font-medium">{feedback.title}</p>
                  <p class="mt-1 break-all text-xs">{feedback.detail}</p>
                </div>
              {/if}
            </div>
          </section>

          <section class="grid gap-5 border-t py-6 md:grid-cols-[12rem_minmax(0,1fr)]">
            <div class="flex items-start gap-2">
              <GitBranch class="mt-1 size-4 text-muted-foreground" />
              <div class="space-y-1">
                <h2 class="font-semibold">
                  {$t(i18nKeys.console.resources.newDeploymentSourceTitle)}
                </h2>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.resources.newDeploymentSourceDescription)}
                </p>
              </div>
            </div>

            <div>
              {#if deploymentSource}
                <div class="divide-y rounded-md border bg-background">
                  <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <p class="truncate text-sm font-medium">{deploymentSource.displayName}</p>
                    <Badge variant="secondary">{deploymentSource.kind}</Badge>
                  </div>
                  <p class="truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                    {deploymentSource.locator}
                  </p>
                </div>
              {:else}
                <div class="rounded-md border border-dashed px-4 py-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.newDeploymentNoSourceSnapshot)}
                </div>
              {/if}
            </div>
          </section>

          <section class="grid gap-5 border-t py-6 md:grid-cols-[12rem_minmax(0,1fr)]">
            <div class="flex items-start gap-2">
              <Eye class="mt-1 size-4 text-muted-foreground" />
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <h2 class="font-semibold">
                    {$t(i18nKeys.console.resources.newDeploymentPlanTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.deploymentPlanPreview}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </div>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.resources.newDeploymentPlanDescription)}
                </p>
              </div>
            </div>

            <div class="space-y-4">
              <Button
                type="button"
                variant="outline"
                disabled={!canPreviewDeploymentPlan}
                onclick={previewResourceDeploymentPlan}
              >
                <Eye class="size-4" />
                {deploymentPlanPending
                  ? $t(i18nKeys.console.resources.newDeploymentPlanPending)
                  : $t(i18nKeys.console.resources.newDeploymentPlanAction)}
              </Button>

              {#if deploymentPlanError}
                <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <p class="font-medium">
                    {$t(i18nKeys.console.resources.newDeploymentPlanErrorTitle)}
                  </p>
                  <p class="mt-1 break-all text-xs">{deploymentPlanError}</p>
                </div>
              {/if}

              {#if deploymentPlanPreview}
                <div class="divide-y rounded-md border bg-background">
                  <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium">
                        {deploymentPlanPreview.source.framework ??
                          deploymentPlanPreview.source.runtimeFamily ??
                          deploymentPlanPreview.source.kind}
                      </p>
                      <p class="mt-1 truncate text-xs text-muted-foreground">
                        {deploymentPlanPreview.source.displayName}
                      </p>
                    </div>
                    <Badge variant={deploymentPlanPreview.readiness.ready ? "secondary" : "outline"}>
                      {deploymentPlanStatusLabel(deploymentPlanPreview.readiness.status)}
                    </Badge>
                  </div>

                  <dl class="grid gap-3 px-4 py-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt class="text-muted-foreground">
                        {$t(i18nKeys.console.resources.newDeploymentPlanPlanner)}
                      </dt>
                      <dd class="mt-1 font-medium">
                        {deploymentPlanPreview.planner.plannerKey} · {deploymentPlanPreview.planner.supportTier}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted-foreground">
                        {$t(i18nKeys.console.resources.newDeploymentPlanArtifact)}
                      </dt>
                      <dd class="mt-1 font-medium">{deploymentPlanPreview.artifact.kind}</dd>
                    </div>
                    <div>
                      <dt class="text-muted-foreground">
                        {$t(i18nKeys.console.resources.newDeploymentPlanNetworkHealth)}
                      </dt>
                      <dd class="mt-1 font-medium">
                        {deploymentPlanPreview.network.internalPort ?? "-"} · {deploymentPlanPreview.health.kind}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted-foreground">
                        {$t(i18nKeys.console.resources.generatedAccessRoute)}
                      </dt>
                      <dd class="mt-1 font-medium">
                        {deploymentPlanPreview.access?.hostname ?? "-"}
                      </dd>
                    </div>
                  </dl>

                  <div class="px-4 py-3">
                    <h3 class="text-sm font-medium">
                      {$t(i18nKeys.console.resources.newDeploymentPlanCommands)}
                    </h3>
                    {#if deploymentPlanPreview.commands.length > 0}
                      <div class="mt-2 space-y-2">
                        {#each deploymentPlanPreview.commands as command (`${command.kind}:${command.command}`)}
                          <p class="rounded-md bg-muted px-3 py-2 font-mono text-xs">
                            {command.kind}: {command.command}
                          </p>
                        {/each}
                      </div>
                    {:else}
                      <p class="mt-2 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.newDeploymentPlanNoCommands)}
                      </p>
                    {/if}
                  </div>

                  {#if deploymentPlanPreview.warnings.length > 0 || deploymentPlanPreview.unsupportedReasons.length > 0}
                    <div class="px-4 py-3">
                      <h3 class="text-sm font-medium">
                        {$t(i18nKeys.console.resources.newDeploymentPlanReasons)}
                      </h3>
                      <ul class="mt-2 space-y-2 text-sm">
                        {#each [...deploymentPlanPreview.unsupportedReasons, ...deploymentPlanPreview.warnings] as reason (`${reason.code}:${reason.phase}`)}
                          <li class="rounded-md border px-3 py-2">
                            <p class="font-medium">{reason.code}</p>
                            <p class="mt-1 text-muted-foreground">{reason.message}</p>
                          </li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </section>

          <div class="flex flex-wrap gap-2 border-t py-5">
            <Button type="submit" disabled={!canCreateDeployment}>
              <Play class="size-4" />
              {deploymentCreatePending
                ? $t(i18nKeys.console.quickDeploy.submitPending)
                : $t(i18nKeys.common.actions.createDeployment)}
            </Button>
            <Button href={resourceDetailHref(resource)} variant="outline">
              <ArrowLeft class="size-4" />
              {$t(i18nKeys.common.actions.openResource)}
            </Button>
          </div>
        </form>

        <aside class="border-y xl:sticky xl:top-24 xl:self-start xl:border-l xl:border-y-0 xl:pl-6">
          <section class="py-5">
            <div class="flex items-start gap-2">
              <Boxes class="mt-1 size-4 text-muted-foreground" />
              <div class="space-y-1">
                <h2 class="font-semibold">
                  {$t(i18nKeys.console.resources.newDeploymentContextTitle)}
                </h2>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.resources.profileDescription)}
                </p>
              </div>
            </div>

            <dl class="mt-4 divide-y text-sm">
              <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
                <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.project)}</dt>
                <dd class="truncate font-medium">{project?.name ?? resource.projectId}</dd>
              </div>
              <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
                <dt class="text-muted-foreground">
                  {$t(i18nKeys.common.domain.environment)}
                </dt>
                <dd class="truncate font-medium">
                  {environment?.name ?? resource.environmentId}
                </dd>
              </div>
              <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
                <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</dt>
                <dd class="min-w-0">
                  <p class="truncate font-medium">{resource.name}</p>
                  <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {resource.id}
                  </p>
                </dd>
              </div>
            </dl>
          </section>

          <section class="border-t py-5">
            <div class="flex items-start gap-2">
              <Waypoints class="mt-1 size-4 text-muted-foreground" />
              <div class="space-y-1">
                <h2 class="font-semibold">
                  {$t(i18nKeys.console.resources.networkProfileTitle)}
                </h2>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.resources.networkProfileDescription)}
                </p>
              </div>
            </div>

            <dl class="mt-4 divide-y text-sm">
              <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
                <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.port)}</dt>
                <dd class="truncate font-medium">
                  {resource.networkProfile?.internalPort ?? "-"}
                </dd>
              </div>
              <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
                <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.proxy)}</dt>
                <dd class="truncate font-medium">
                  {resource.networkProfile?.upstreamProtocol ?? "-"}
                </dd>
              </div>
              <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
                <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.mode)}</dt>
                <dd class="truncate font-medium">
                  {resource.networkProfile?.exposureMode ?? "-"}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  {/if}
</ConsoleShell>

<DeploymentProgressDialog
  open={deploymentProgressDialogOpen}
  status={deploymentProgressDialogStatus}
  events={deploymentProgressEvents}
  streamError={deploymentProgressStreamError}
  deploymentId={deploymentProgressDeploymentId}
  requestId={deploymentProgressRequestId}
  title={$t(i18nKeys.console.deployments.progressTitle)}
  description={$t(i18nKeys.console.deployments.progressDescription)}
  onClose={() => {
    deploymentProgressDialogOpen = false;
  }}
  onOpenDeployment={() => {
    void goto(deploymentProgressHref());
  }}
/>

<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { createMutation } from "@tanstack/svelte-query";
  import { ArrowLeft, ArrowRight, Boxes, FolderOpen, Globe2, Plus, Rocket, ShieldCheck } from "@lucide/svelte";
  import type { CreateResourceInput } from "@yundu/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    deploymentBadgeVariant,
    findProject,
    formatTime,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const { projectsQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser);

  const projectId = $derived(page.params.projectId ?? "");
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
  const project = $derived(findProject(projects, projectId));
  const projectEnvironments = $derived(
    project ? environments.filter((environment) => environment.projectId === project.id) : [],
  );
  const projectResources = $derived(
    project ? resources.filter((resource) => resource.projectId === project.id) : [],
  );
  const projectDeployments = $derived(
    project ? deployments.filter((deployment) => deployment.projectId === project.id) : [],
  );
  const projectAccessRoutes = $derived.by(() =>
    projectDeployments.flatMap((deployment) =>
      (deployment.runtimePlan.execution.accessRoutes ?? []).flatMap((route) =>
        route.domains.map((domain) => ({
          deploymentId: deployment.id,
          domain,
          pathPrefix: route.pathPrefix,
          proxyKind: route.proxyKind,
          resourceName:
            projectResources.find((resource) => resource.id === deployment.resourceId)?.name ??
            deployment.resourceId,
          status: deployment.status,
          tlsMode: route.tlsMode,
        })),
      ),
    ),
  );
  let createResourceEnvironmentId = $state("");
  let createResourceName = $state("");
  let createResourceKind = $state<CreateResourceInput["kind"]>("application");
  let createResourceFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  const canCreateResource = $derived(
    Boolean(project?.id && createResourceEnvironmentId && createResourceName.trim()),
  );

  const createResourceMutation = createMutation(() => ({
    mutationFn: (input: CreateResourceInput) => orpcClient.resources.create(input),
    onSuccess: (result) => {
      createResourceFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.createResourceSuccessTitle),
        detail: result.id,
      };
      createResourceName = "";
      createResourceKind = "application";
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (error) => {
      createResourceFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.createResourceErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));

  $effect(() => {
    if (!browser) {
      return;
    }

    if (!projectEnvironments.some((environment) => environment.id === createResourceEnvironmentId)) {
      createResourceEnvironmentId = projectEnvironments[0]?.id ?? "";
    }
  });

  function requestQuickDeploy(): void {
    if (browser) {
      window.dispatchEvent(new CustomEvent("yundu:open-quick-deploy"));
    }
  }

  function createResource(event: SubmitEvent): void {
    event.preventDefault();

    if (!project || !canCreateResource || createResourceMutation.isPending) {
      return;
    }

    createResourceFeedback = null;
    createResourceMutation.mutate({
      projectId: project.id,
      environmentId: createResourceEnvironmentId,
      name: createResourceName.trim(),
      kind: createResourceKind,
    });
  }
</script>

<svelte:head>
  <title>{project?.name ?? $t(i18nKeys.console.projects.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={project?.name ?? $t(i18nKeys.console.projects.pageTitle)}
  description={$t(i18nKeys.console.projects.detailDescription)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-36 w-full" />
      <div class="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Skeleton class="h-72 w-full" />
        <Skeleton class="h-72 w-full" />
      </div>
    </div>
  {:else if !project}
    <section class="rounded-lg border bg-background p-6 md:p-8">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.errors.backend.notFound)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.projects.notFoundTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.projects.notFoundBody)}
        </p>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
        <Button href="/projects" variant="outline">
          <ArrowLeft class="size-4" />
          {$t(i18nKeys.common.actions.backToProjects)}
        </Button>
        <Button onclick={requestQuickDeploy}>
          <Rocket class="size-4" />
          {$t(i18nKeys.common.actions.newDeployment)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-5">
      <section class="rounded-lg border bg-background p-5">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{$t(i18nKeys.common.domain.project)}</Badge>
              <Badge variant="secondary">{project.slug}</Badge>
            </div>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold md:text-3xl">{project.name}</h1>
              <p class="text-sm leading-6 text-muted-foreground">
                {project.description ?? $t(i18nKeys.console.projects.noDescription)}
              </p>
            </div>
            <p class="text-xs text-muted-foreground">
              {$t(i18nKeys.common.domain.createdAt)} · {formatTime(project.createdAt)}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button href="/projects" variant="outline">
              <ArrowLeft class="size-4" />
              {$t(i18nKeys.common.actions.backToProjects)}
            </Button>
            <Button href={`/deployments?projectId=${project.id}`} variant="outline">
              {$t(i18nKeys.common.actions.viewDeployments)}
            </Button>
            <Button onclick={requestQuickDeploy}>
              <Rocket class="size-4" />
              {$t(i18nKeys.common.actions.newDeployment)}
            </Button>
          </div>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck class="size-4" />
              {$t(i18nKeys.common.domain.environments)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{projectEnvironments.length}</p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Boxes class="size-4" />
              {$t(i18nKeys.common.domain.resources)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{projectResources.length}</p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe2 class="size-4" />
              公网访问
            </p>
            <p class="mt-2 text-2xl font-semibold">{projectAccessRoutes.length}</p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Rocket class="size-4" />
              {$t(i18nKeys.common.domain.deployments)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{projectDeployments.length}</p>
          </div>
        </div>
      </section>

      <section class="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div class="space-y-5">
          <section class="rounded-lg border bg-background p-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.environmentsTitle)}</h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.environmentsDescription)}
                </p>
              </div>
              <Badge variant="outline">{projectEnvironments.length}</Badge>
            </div>

            <div class="mt-4 space-y-3">
              {#if projectEnvironments.length > 0}
                {#each projectEnvironments as environment (environment.id)}
                  <div class="rounded-md border px-4 py-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <p class="font-medium">{environment.name}</p>
                      <Badge variant="secondary">{environment.kind}</Badge>
                    </div>
                    <p class="mt-2 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.projects.environmentCount, {
                        count: environment.maskedVariables.length,
                      })}
                    </p>
                  </div>
                {/each}
              {:else}
                <div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.noEnvironment)}
                </div>
              {/if}
            </div>
          </section>

          <section class="rounded-lg border bg-background p-5">
            <div class="flex items-start gap-3">
              <div class="rounded-md border bg-muted p-2">
                <Plus class="size-4" />
              </div>
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.projects.createResourceTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.createResourceDescription)}
                </p>
              </div>
            </div>

            <form class="mt-5 space-y-4" onsubmit={createResource}>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="space-y-1.5 text-sm font-medium">
                  <span>{$t(i18nKeys.common.domain.environment)}</span>
                  <select
                    bind:value={createResourceEnvironmentId}
                    class="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {#if projectEnvironments.length === 0}
                      <option value="">
                        {$t(i18nKeys.console.domainBindings.noEnvironmentOptions)}
                      </option>
                    {/if}
                    {#each projectEnvironments as environment (environment.id)}
                      <option value={environment.id}>{environment.name}</option>
                    {/each}
                  </select>
                </label>

                <label class="space-y-1.5 text-sm font-medium">
                  <span>{$t(i18nKeys.common.domain.kind)}</span>
                  <select
                    bind:value={createResourceKind}
                    class="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="application">application</option>
                    <option value="service">service</option>
                    <option value="worker">worker</option>
                    <option value="static-site">static-site</option>
                    <option value="compose-stack">compose-stack</option>
                    <option value="database">database</option>
                    <option value="cache">cache</option>
                    <option value="external">external</option>
                  </select>
                </label>

                <label class="space-y-1.5 text-sm font-medium sm:col-span-2">
                  <span>{$t(i18nKeys.common.domain.name)}</span>
                  <Input
                    bind:value={createResourceName}
                    autocomplete="off"
                    placeholder={$t(i18nKeys.console.projects.createResourceNamePlaceholder)}
                  />
                </label>
              </div>

              {#if createResourceFeedback}
                <div
                  class={[
                    "rounded-md border px-3 py-2 text-sm",
                    createResourceFeedback.kind === "success"
                      ? "border-primary/25 bg-primary/5"
                      : "border-destructive/30 bg-destructive/5 text-destructive",
                  ]}
                >
                  <p class="font-medium">{createResourceFeedback.title}</p>
                  <p class="mt-1 break-all text-xs">{createResourceFeedback.detail}</p>
                </div>
              {/if}

              <Button
                disabled={!canCreateResource || createResourceMutation.isPending}
                type="submit"
              >
                <Plus class="size-4" />
                {createResourceMutation.isPending
                  ? $t(i18nKeys.common.actions.creating)
                  : $t(i18nKeys.common.actions.createResource)}
              </Button>
            </form>
          </section>

          <section class="rounded-lg border bg-background p-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-semibold">公网访问</h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  当前项目最近部署计划中的域名与代理路由。
                </p>
              </div>
              <Badge variant="outline">{projectAccessRoutes.length}</Badge>
            </div>

            <div class="mt-4 space-y-3">
              {#if projectAccessRoutes.length > 0}
                {#each projectAccessRoutes.slice(0, 8) as route (`${route.deploymentId}-${route.domain}-${route.pathPrefix}`)}
                  <a
                    href={`/deployments/${route.deploymentId}`}
                    class="block rounded-md border px-4 py-3 transition-colors hover:bg-muted/45"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <p class="min-w-0 truncate font-medium">{route.domain}</p>
                      <Badge variant="secondary">{route.proxyKind}</Badge>
                    </div>
                    <p class="mt-2 text-sm text-muted-foreground">
                      {route.resourceName} · {route.pathPrefix} · TLS {route.tlsMode} · {route.status}
                    </p>
                  </a>
                {/each}
              {:else}
                <div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  还没有域名路由；新建部署时在公网访问里填写 domain 后会出现在这里。
                </div>
              {/if}
            </div>
          </section>

          <section class="rounded-lg border bg-background p-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.resourcesTitle)}</h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.resourcesDescription)}
                </p>
              </div>
              <Badge variant="outline">{projectResources.length}</Badge>
            </div>

            <div class="mt-4 space-y-3">
              {#if projectResources.length > 0}
                {#each projectResources as resource (resource.id)}
                  <a
                    href={`/resources/${resource.id}`}
                    class="group block rounded-md border px-4 py-3 transition-colors hover:bg-muted/45"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="min-w-0">
                        <p class="truncate font-medium">{resource.name}</p>
                        <p class="mt-1 text-xs text-muted-foreground">
                          {$t(i18nKeys.common.actions.viewResource)}
                        </p>
                      </div>
                      <div class="flex items-center gap-2">
                        <Badge variant="outline">{resource.kind}</Badge>
                        <ArrowRight class="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                      </div>
                    </div>
                    <p class="mt-2 text-sm text-muted-foreground">
                      {resource.services.length} {$t(i18nKeys.common.domain.services)} · {resource.deploymentCount}
                      {" "}
                      {$t(i18nKeys.common.domain.deployments)}
                    </p>
                  </a>
                {/each}
              {:else}
                <div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.noResources)}
                </div>
              {/if}
            </div>
          </section>
        </div>

        <section class="rounded-lg border bg-background p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.recentDeploymentsTitle)}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.projects.recentDeploymentsDescription)}
              </p>
            </div>
            <Button href={`/deployments?projectId=${project.id}`} variant="outline">
              {$t(i18nKeys.common.actions.viewAll)}
              <ArrowRight class="size-4" />
            </Button>
          </div>

          <div class="mt-4 space-y-3">
            {#if projectDeployments.length > 0}
              {#each projectDeployments.slice(0, 8) as deployment (deployment.id)}
                <a
                  href={`/deployments/${deployment.id}`}
                  class="group block rounded-md border px-4 py-3 transition-colors hover:bg-muted/45"
                >
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0 space-y-1">
                      <p class="truncate font-medium">{deployment.runtimePlan.source.displayName}</p>
                      <p class="truncate text-sm text-muted-foreground">
                        {deployment.runtimePlan.source.locator}
                      </p>
                      <p class="text-xs text-muted-foreground">{formatTime(deployment.createdAt)}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <Badge variant={deploymentBadgeVariant(deployment.status)}>
                        {deployment.status}
                      </Badge>
                      <ArrowRight class="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                    </div>
                  </div>
                </a>
              {/each}
            {:else}
              <div class="rounded-md border border-dashed p-5">
                <div class="flex items-start gap-3">
                  <FolderOpen class="mt-0.5 size-4 text-muted-foreground" />
                  <div class="space-y-2">
                    <p class="text-sm font-medium">
                      {$t(i18nKeys.console.projects.noProjectDeploymentTitle)}
                    </p>
                    <p class="text-sm text-muted-foreground">
                      {$t(i18nKeys.console.projects.noProjectDeploymentBody)}
                    </p>
                    <Button size="sm" onclick={requestQuickDeploy}>
                      <Rocket class="size-4" />
                      {$t(i18nKeys.common.actions.createDeployment)}
                    </Button>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </section>
      </section>
    </div>
  {/if}
</ConsoleShell>

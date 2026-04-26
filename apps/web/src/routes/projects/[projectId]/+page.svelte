<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import { Archive, ArrowLeft, ArrowRight, Copy, FolderOpen, Play, Plus, Save } from "@lucide/svelte";
  import type {
    ArchiveEnvironmentInput,
    ArchiveProjectInput,
    CloneEnvironmentInput,
    RenameProjectInput,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import ResourceHealthDot from "$lib/components/console/ResourceHealthDot.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    deploymentDetailHref,
    findProject,
    formatTime,
    latestResourceDeployment,
    projectCreateResourceHref,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const { projectsQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser);

  const projectId = $derived(page.params.projectId ?? "");
  const projectDetailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects", "show", projectId],
      queryFn: () => orpcClient.projects.show({ projectId }),
      enabled: browser && projectId.length > 0,
      staleTime: 5_000,
    }),
  );
  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      deploymentsQuery.isPending ||
      projectDetailQuery.isPending,
  );
  const project = $derived(projectDetailQuery.data ?? findProject(projects, projectId));
  const isProjectArchived = $derived(project?.lifecycleStatus === "archived");
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
          deployment,
          domain,
          pathPrefix: route.pathPrefix,
          proxyKind: route.proxyKind,
          resourceName:
            projectResources.find((resource) => resource.id === deployment.resourceId)?.name ??
            deployment.resourceId,
          tlsMode: route.tlsMode,
        })),
      ),
    ),
  );
  let lifecycleFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let projectFormProjectId = $state("");
  let projectName = $state("");
  let cloneEnvironmentNames = $state<Record<string, string>>({});
  const canRenameProject = $derived(
    Boolean(project) &&
      !isProjectArchived &&
      projectName.trim().length > 0 &&
      projectName.trim() !== project?.name,
  );
  const renameProjectMutation = createMutation(() => ({
    mutationFn: (input: RenameProjectInput) => orpcClient.projects.rename(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.renameSucceeded),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "show", result.id] });
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.renameFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const archiveProjectMutation = createMutation(() => ({
    mutationFn: (input: ArchiveProjectInput) => orpcClient.projects.archive(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.archiveSucceeded),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "show", result.id] });
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.archiveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const archiveEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: ArchiveEnvironmentInput) => orpcClient.environments.archive(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.environmentArchiveSucceeded),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (project) {
        void queryClient.invalidateQueries({ queryKey: ["projects", "show", project.id] });
      }
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentArchiveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const cloneEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: CloneEnvironmentInput) => orpcClient.environments.clone(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.environmentCloneSucceeded),
        detail: result.id,
      };
      cloneEnvironmentNames = {};
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (project) {
        void queryClient.invalidateQueries({ queryKey: ["projects", "show", project.id] });
      }
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentCloneFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  $effect(() => {
    if (!project || projectFormProjectId === project.id) {
      return;
    }

    projectFormProjectId = project.id;
    projectName = project.name;
    lifecycleFeedback = null;
  });

  function cloneEnvironmentName(environmentId: string): string {
    return cloneEnvironmentNames[environmentId] ?? "";
  }

  function setCloneEnvironmentName(environmentId: string, value: string): void {
    cloneEnvironmentNames = {
      ...cloneEnvironmentNames,
      [environmentId]: value,
    };
  }

  function renameProject(): void {
    if (!browser || !project || !canRenameProject || renameProjectMutation.isPending) {
      return;
    }

    lifecycleFeedback = null;
    renameProjectMutation.mutate({
      projectId: project.id,
      name: projectName.trim(),
    });
  }

  function archiveProject(): void {
    if (!browser || !project || isProjectArchived || archiveProjectMutation.isPending) {
      return;
    }

    if (!window.confirm($t(i18nKeys.console.projects.archiveConfirm))) {
      return;
    }

    lifecycleFeedback = null;
    archiveProjectMutation.mutate({
      projectId: project.id,
    });
  }

  function archiveEnvironment(environmentId: string): void {
    if (!browser || !project || isProjectArchived || archiveEnvironmentMutation.isPending) {
      return;
    }

    const environment = projectEnvironments.find((item) => item.id === environmentId);
    if (!environment || environment.lifecycleStatus === "archived") {
      return;
    }

    if (!window.confirm($t(i18nKeys.console.projects.environmentArchiveConfirm))) {
      return;
    }

    lifecycleFeedback = null;
    archiveEnvironmentMutation.mutate({
      environmentId,
    });
  }

  function cloneEnvironment(environmentId: string): void {
    if (!browser || !project || isProjectArchived || cloneEnvironmentMutation.isPending) {
      return;
    }

    const environment = projectEnvironments.find((item) => item.id === environmentId);
    if (!environment || environment.lifecycleStatus === "archived") {
      return;
    }

    const targetName = cloneEnvironmentName(environmentId).trim();
    if (!targetName) {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentCloneFailed),
        detail: $t(i18nKeys.console.projects.environmentCloneValidation),
      };
      return;
    }

    lifecycleFeedback = null;
    cloneEnvironmentMutation.mutate({
      environmentId,
      targetName,
    });
  }

</script>

<svelte:head>
  <title>{project?.name ?? $t(i18nKeys.console.projects.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={project?.name ?? $t(i18nKeys.console.projects.pageTitle)}
  description={$t(i18nKeys.console.projects.detailDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle), href: "/projects" },
    { label: project?.name ?? $t(i18nKeys.console.projects.pageTitle) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-36 w-full" />
      <div class="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Skeleton class="h-96 w-full" />
        <Skeleton class="h-96 w-full" />
      </div>
    </div>
  {:else if !project}
    <section class="space-y-5 py-2">
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
      </div>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="space-y-6">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{$t(i18nKeys.common.domain.project)}</Badge>
              <Badge variant="secondary">{project.slug}</Badge>
              <Badge variant={isProjectArchived ? "destructive" : "secondary"}>
                {isProjectArchived
                  ? $t(i18nKeys.console.projects.archived)
                  : $t(i18nKeys.console.projects.active)}
              </Badge>
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
            {#if project.archivedAt}
              <p class="text-xs text-muted-foreground">
                {$t(i18nKeys.console.projects.archivedAt)} · {formatTime(project.archivedAt)}
              </p>
            {/if}
          </div>

          <div class="flex flex-wrap gap-2">
            <Button href={projectCreateResourceHref(project.id)} disabled={isProjectArchived}>
              <Plus class="size-4" />
              {$t(i18nKeys.common.actions.createResource)}
            </Button>
            <Button href={`/deployments?projectId=${project.id}`} variant="outline">
              {$t(i18nKeys.common.actions.viewDeployments)}
            </Button>
          </div>
        </div>

        <dl class="grid border-y sm:grid-cols-4 sm:divide-x">
          <div class="px-0 py-4 sm:px-4">
            <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.resources)}
            </dt>
            <dd class="mt-1 text-2xl font-semibold">{projectResources.length}</dd>
          </div>
          <div class="border-t px-0 py-4 sm:border-t-0 sm:px-4">
            <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.environments)}
            </dt>
            <dd class="mt-1 text-2xl font-semibold">{projectEnvironments.length}</dd>
          </div>
          <div class="border-t px-0 py-4 sm:border-t-0 sm:px-4">
            <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.deployments)}
            </dt>
            <dd class="mt-1 text-2xl font-semibold">{projectDeployments.length}</dd>
          </div>
          <div class="border-t px-0 py-4 sm:border-t-0 sm:px-4">
            <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.projects.publicAccessTitle)}
            </dt>
            <dd class="mt-1 text-2xl font-semibold">{projectAccessRoutes.length}</dd>
          </div>
        </dl>
      </section>

      <section class="space-y-4 border-y py-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.settingsTitle)}</h2>
              <DocsHelpLink
                href={webDocsHrefs.projectLifecycle}
                ariaLabel={$t(i18nKeys.common.actions.openDocumentation)}
              />
            </div>
            <p class="text-sm text-muted-foreground">
              {$t(i18nKeys.console.projects.settingsDescription)}
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={isProjectArchived || archiveProjectMutation.isPending}
            onclick={archiveProject}
          >
            <Archive class="size-4" />
            {archiveProjectMutation.isPending
              ? $t(i18nKeys.common.actions.saving)
              : $t(i18nKeys.console.projects.archiveAction)}
          </Button>
        </div>

        {#if isProjectArchived}
          <div class="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {$t(i18nKeys.console.projects.archiveNotice)}
          </div>
        {/if}

        {#if lifecycleFeedback}
          <div
            class={`rounded-md border px-3 py-2 text-sm ${
              lifecycleFeedback.kind === "success"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-destructive/20 bg-destructive/5 text-destructive"
            }`}
          >
            <p class="font-medium">{lifecycleFeedback.title}</p>
            <p class="mt-1 opacity-80">{lifecycleFeedback.detail}</p>
          </div>
        {/if}

        <form
          class="grid gap-3 sm:grid-cols-[minmax(0,22rem)_auto] sm:items-end"
          onsubmit={(event) => {
            event.preventDefault();
            renameProject();
          }}
        >
          <label class="grid gap-1 text-sm">
            <span class="font-medium">{$t(i18nKeys.console.projects.renameLabel)}</span>
            <Input
              bind:value={projectName}
              autocomplete="off"
              disabled={isProjectArchived || renameProjectMutation.isPending}
            />
          </label>
          <Button
            type="submit"
            variant="outline"
            disabled={!canRenameProject || renameProjectMutation.isPending}
          >
            <Save class="size-4" />
            {renameProjectMutation.isPending
              ? $t(i18nKeys.common.actions.saving)
              : $t(i18nKeys.common.actions.save)}
          </Button>
        </form>
      </section>

      <section class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section class="min-w-0 space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.resourcesTitle)}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.projects.resourcesDescription)}
              </p>
            </div>
            <Button
              href={projectCreateResourceHref(project.id)}
              variant="outline"
              disabled={isProjectArchived}
            >
              <Plus class="size-4" />
              {$t(i18nKeys.common.actions.createResource)}
            </Button>
          </div>

          <div class="divide-y border-y">
            {#if projectResources.length > 0}
              {#each projectResources as resource (resource.id)}
                {@const latestDeployment = latestResourceDeployment(resource, deployments)}
                <a
                  href={resourceDetailHref(resource)}
                  class="group grid gap-3 py-4 transition-colors hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_18rem_auto] sm:px-3"
                >
                  <div class="min-w-0 space-y-2">
                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                      <ResourceHealthDot resourceId={resource.id} class="shrink-0" />
                      <h3 class="truncate font-medium">{resource.name}</h3>
                      <Badge variant="secondary">{resource.kind}</Badge>
                    </div>
                    <p class="line-clamp-1 text-sm text-muted-foreground">
                      {resource.description ?? resource.slug}
                    </p>
                  </div>

                  <div class="grid gap-1 text-sm text-muted-foreground sm:grid-cols-1">
                    <span>{resource.services.length} {$t(i18nKeys.common.domain.services)}</span>
                    <span>{resource.deploymentCount} {$t(i18nKeys.common.domain.deployments)}</span>
                    <span class="truncate">
                      {latestDeployment ? formatTime(latestDeployment.createdAt) : $t(i18nKeys.console.projects.noDeploymentShort)}
                    </span>
                  </div>

                  <ArrowRight class="hidden size-4 self-center text-muted-foreground transition-colors group-hover:text-foreground sm:block" />
                </a>
              {/each}
            {:else}
              <div class="bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                {$t(i18nKeys.console.projects.noResources)}
              </div>
            {/if}
          </div>
        </section>

        <aside class="space-y-8 xl:border-l xl:pl-6">
          <section class="space-y-3">
            <div>
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <h2 class="text-sm font-semibold">
                    {$t(i18nKeys.console.projects.environmentsTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.environmentLifecycle}
                    ariaLabel={$t(i18nKeys.common.actions.openDocumentation)}
                  />
                </div>
                <span class="text-sm text-muted-foreground">{projectEnvironments.length}</span>
              </div>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {$t(i18nKeys.console.projects.environmentsDescription)}
              </p>
            </div>

            <div class="divide-y border-y">
              {#if projectEnvironments.length > 0}
                {#each projectEnvironments as environment (environment.id)}
                  <div class="py-3">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0 space-y-1">
                        <div class="flex min-w-0 flex-wrap items-center gap-2">
                          <p class="truncate text-sm font-medium">{environment.name}</p>
                          <Badge variant="secondary">{environment.kind}</Badge>
                          {#if environment.lifecycleStatus === "archived"}
                            <Badge variant="destructive">
                              {$t(i18nKeys.console.projects.environmentArchived)}
                            </Badge>
                          {/if}
                        </div>
                        <p class="text-xs text-muted-foreground">
                          {$t(i18nKeys.console.projects.environmentCount, {
                            count: environment.maskedVariables.length,
                          })}
                        </p>
                        {#if environment.archivedAt}
                          <p class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.projects.environmentArchivedAt)} · {formatTime(
                              environment.archivedAt,
                            )}
                          </p>
                        {/if}
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={$t(i18nKeys.console.projects.environmentArchiveAction)}
                        title={$t(i18nKeys.console.projects.environmentArchiveAction)}
                        disabled={isProjectArchived ||
                          environment.lifecycleStatus === "archived" ||
                          archiveEnvironmentMutation.isPending}
                        onclick={() => archiveEnvironment(environment.id)}
                      >
                        <Archive class="size-4" />
                      </Button>
                    </div>
                    {#if environment.lifecycleStatus !== "archived"}
                      <form
                        id={`environment-clone-form-${environment.id}`}
                        class="mt-3 flex gap-2"
                        onsubmit={(event) => {
                          event.preventDefault();
                          cloneEnvironment(environment.id);
                        }}
                      >
                        <label class="sr-only" for={`environment-clone-name-${environment.id}`}>
                          {$t(i18nKeys.console.projects.environmentCloneNameLabel)}
                        </label>
                        <Input
                          id={`environment-clone-name-${environment.id}`}
                          value={cloneEnvironmentName(environment.id)}
                          placeholder={$t(i18nKeys.console.projects.environmentCloneNamePlaceholder)}
                          disabled={isProjectArchived || cloneEnvironmentMutation.isPending}
                          oninput={(event) =>
                            setCloneEnvironmentName(environment.id, event.currentTarget.value)}
                        />
                        <Button
                          type="submit"
                          size="icon-sm"
                          variant="outline"
                          aria-label={$t(i18nKeys.console.projects.environmentCloneAction)}
                          title={$t(i18nKeys.console.projects.environmentCloneAction)}
                          disabled={isProjectArchived ||
                            cloneEnvironmentMutation.isPending ||
                            cloneEnvironmentName(environment.id).trim().length === 0}
                        >
                          <Copy class="size-4" />
                        </Button>
                      </form>
                    {/if}
                  </div>
                {/each}
              {:else}
                <p class="py-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.noEnvironment)}
                </p>
              {/if}
            </div>
          </section>

          <section class="space-y-3">
            <div>
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-sm font-semibold">{$t(i18nKeys.console.projects.publicAccessTitle)}</h2>
                <span class="text-sm text-muted-foreground">{projectAccessRoutes.length}</span>
              </div>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {$t(i18nKeys.console.projects.publicAccessDescription)}
              </p>
            </div>

            <div class="divide-y border-y">
              {#if projectAccessRoutes.length > 0}
                {#each projectAccessRoutes.slice(0, 5) as route (`${route.deployment.id}-${route.domain}-${route.pathPrefix}`)}
                  <a
                    href={deploymentDetailHref(route.deployment)}
                    class="block py-3 transition-colors hover:bg-muted/35"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <p class="min-w-0 truncate text-sm font-medium">{route.domain}</p>
                      <Badge variant="secondary">{route.proxyKind}</Badge>
                    </div>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {route.resourceName} · {route.pathPrefix} · {$t(i18nKeys.common.domain.tls)}
                      {route.tlsMode}
                    </p>
                  </a>
                {/each}
              {:else}
                <p class="py-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.noPublicAccess)}
                </p>
              {/if}
            </div>
          </section>
        </aside>
      </section>

      <section class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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

        <div>
          {#if projectDeployments.length > 0}
            <DeploymentTable
              deployments={projectDeployments.slice(0, 8)}
              {environments}
              {resources}
              showProject={false}
              showServer={false}
            />
          {:else}
            <div class="border-y bg-muted/25 px-4 py-6">
              <div class="flex items-start gap-3">
                <FolderOpen class="mt-0.5 size-4 text-muted-foreground" />
                <div class="space-y-2">
                  <p class="text-sm font-medium">
                    {$t(i18nKeys.console.projects.noProjectDeploymentTitle)}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    {$t(i18nKeys.console.projects.noProjectDeploymentBody)}
                  </p>
                  <Button
                    size="sm"
                    href={projectCreateResourceHref(project.id)}
                    disabled={isProjectArchived}
                  >
                    <Play class="size-4" />
                    {$t(i18nKeys.common.actions.deploy)}
                  </Button>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </section>
    </div>
  {/if}
</ConsoleShell>

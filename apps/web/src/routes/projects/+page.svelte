<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { createMutation } from "@tanstack/svelte-query";
  import { AlertCircle, ArrowRight, CheckCircle2, FolderOpen, Plus, ShieldCheck } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import ResourceHealthDot from "$lib/components/console/ResourceHealthDot.svelte";
  import { readErrorMessage } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Textarea } from "$lib/components/ui/textarea";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    countProjectEnvironments,
    formatTime,
    latestProjectDeployment,
    projectDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const { projectsQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser);

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
  const activeProjects = $derived(
    projects.filter((project) => resources.some((resource) => resource.projectId === project.id))
      .length,
  );
  let projectName = $state("");
  let projectDescription = $state("");
  let createProjectFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  const canCreateProject = $derived(projectName.trim().length > 0);

  const createProjectMutation = createMutation(() => ({
    mutationFn: (input: { name: string; description?: string }) => orpcClient.projects.create(input),
    onSuccess: (result) => {
      createProjectFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.createProjectSucceeded),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void goto(projectDetailHref(result.id));
    },
    onError: (error) => {
      createProjectFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.createProjectFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  function submitProjectCreate(event: SubmitEvent): void {
    event.preventDefault();

    const name = projectName.trim();
    const description = projectDescription.trim();

    if (!name || createProjectMutation.isPending) {
      return;
    }

    createProjectFeedback = null;
    createProjectMutation.mutate({
      name,
      ...(description ? { description } : {}),
    });
  }

</script>

<svelte:head>
  <title>{$t(i18nKeys.console.projects.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.projects.pageTitle)}
  description={$t(i18nKeys.console.projects.description)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <section class="space-y-3">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="h-4 w-72" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 5 }) as _, index (index)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    </div>
  {:else if projects.length === 0}
    <section class="grid gap-6 py-2 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div class="space-y-5">
        <Badge class="console-page-kicker" variant="outline">
          {$t(i18nKeys.console.shell.noProjects)}
        </Badge>
        <div class="max-w-2xl space-y-3">
          <h1 class="text-2xl font-semibold tracking-tight md:text-3xl">
            {$t(i18nKeys.console.projects.emptyTitle)}
          </h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.projects.emptyBody)}
          </p>
        </div>
        <div class="console-subtle-panel max-w-2xl p-4">
          <div class="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p class="font-medium">{$t(i18nKeys.common.domain.environments)}</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {$t(i18nKeys.console.projects.createProjectEnvironmentHint)}
              </p>
            </div>
            <div>
              <p class="font-medium">{$t(i18nKeys.common.domain.resources)}</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {$t(i18nKeys.console.projects.createProjectResourceHint)}
              </p>
            </div>
            <div>
              <p class="font-medium">{$t(i18nKeys.common.domain.deployments)}</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {$t(i18nKeys.console.projects.createProjectDeploymentHint)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <form class="console-panel h-fit p-5" onsubmit={submitProjectCreate}>
        <div class="space-y-1.5">
          <h2 class="text-base font-semibold">
            {$t(i18nKeys.console.projects.createProjectTitle)}
          </h2>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.projects.createProjectDescription)}
          </p>
        </div>

        <div class="mt-5 grid gap-4">
          <label class="console-field-stack" for="project-create-name">
            <span class="console-field-label">
              {$t(i18nKeys.console.projects.createProjectNameLabel)}
            </span>
            <Input
              id="project-create-name"
              autocomplete="off"
              bind:value={projectName}
              placeholder={$t(i18nKeys.console.projects.createProjectNamePlaceholder)}
              disabled={createProjectMutation.isPending}
            />
          </label>

          <label class="console-field-stack" for="project-create-description">
            <span class="console-field-label">
              {$t(i18nKeys.console.projects.createProjectDescriptionLabel)}
            </span>
            <Textarea
              id="project-create-description"
              bind:value={projectDescription}
              placeholder={$t(i18nKeys.console.projects.createProjectDescriptionPlaceholder)}
              disabled={createProjectMutation.isPending}
            />
          </label>
        </div>

        {#if createProjectFeedback}
          <div
            class={`mt-4 flex gap-2 rounded-md border p-3 text-sm ${
              createProjectFeedback.kind === "success"
                ? "border-chart-2/30 bg-chart-2/10 text-foreground"
                : "border-destructive/30 bg-destructive/10 text-foreground"
            }`}
          >
            {#if createProjectFeedback.kind === "success"}
              <CheckCircle2 class="mt-0.5 size-4 shrink-0 text-chart-2" />
            {:else}
              <AlertCircle class="mt-0.5 size-4 shrink-0 text-destructive" />
            {/if}
            <div class="min-w-0">
              <p class="font-medium">{createProjectFeedback.title}</p>
              <p class="mt-1 break-words text-xs leading-5 text-muted-foreground">
                {createProjectFeedback.detail}
              </p>
            </div>
          </div>
        {/if}

        <div class="console-action-row mt-5">
          <Button type="submit" size="lg" disabled={!canCreateProject || createProjectMutation.isPending}>
            <Plus class="size-4" />
            {createProjectMutation.isPending
              ? $t(i18nKeys.console.projects.createProjectSubmitting)
              : $t(i18nKeys.console.projects.createProjectAction)}
          </Button>
        </div>
      </form>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div class="max-w-2xl space-y-2">
          <Badge class="console-page-kicker" variant="outline">{$t(i18nKeys.console.projects.focusLabel)}</Badge>
          <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.projects.focusTitle)}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.projects.focusDescription)}
          </p>
        </div>
        <div class="console-metric-strip grid-cols-3 text-center md:min-w-80">
          <div>
            <p class="text-xl font-semibold">{projects.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.common.domain.projects)}</p>
          </div>
          <div>
            <p class="text-xl font-semibold">{activeProjects}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.console.projects.projectsWithResources)}
            </p>
          </div>
          <div>
            <p class="text-xl font-semibold">{resources.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.common.domain.resources)}</p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <div>
          <div>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.projectListTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.projects.projectListDescription)}
            </p>
          </div>
        </div>

        <div class="console-record-list">
          {#each projects as project (project.id)}
            {@const projectResources = resources.filter((resource) => resource.projectId === project.id)}
            {@const latestDeployment = latestProjectDeployment(project, deployments)}
            {@const latestResource =
              projectResources.find((resource) => resource.lastDeploymentId === latestDeployment?.id) ??
              projectResources[0]}
            <a
              href={projectDetailHref(project.id)}
              class="console-record-row group lg:grid-cols-[minmax(0,1fr)_36rem_auto] lg:items-center"
            >
              <div class="min-w-0 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate text-base font-semibold">{project.name}</h3>
                  <Badge variant="outline">{project.slug}</Badge>
                </div>
                <p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {project.description ?? $t(i18nKeys.console.projects.noDescription)}
                </p>
              </div>

              <div class="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                <span class="inline-flex items-center gap-2">
                  <ShieldCheck class="size-3.5" />
                  {countProjectEnvironments(project, environments)}
                  {$t(i18nKeys.common.domain.environments)}
                </span>
                <span class="inline-flex items-center gap-2">
                  <FolderOpen class="size-3.5" />
                  {projectResources.length} {$t(i18nKeys.common.domain.resources)}
                </span>
                <span class="flex min-w-0 items-center gap-2">
                  {#if latestResource}
                    <ResourceHealthDot resourceId={latestResource.id} class="shrink-0" />
                    <span class="truncate">
                      {latestResource.name}
                      {#if latestDeployment}
                        · {formatTime(latestDeployment.createdAt)}
                      {/if}
                    </span>
                  {:else}
                    {$t(i18nKeys.console.projects.noResourcesShort)}
                  {/if}
                </span>
              </div>

              <span
                class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground"
              >
                {$t(i18nKeys.common.actions.viewDetails)}
                <ArrowRight class="size-4" />
              </span>
            </a>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</ConsoleShell>

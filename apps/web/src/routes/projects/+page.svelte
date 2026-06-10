<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ArrowRight, FolderOpen, GripVertical, Plus, ShieldCheck } from "@lucide/svelte";
  import type { CreateProjectResponse } from "@appaloft/contracts";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import ProjectCreateForm from "$lib/components/console/ProjectCreateForm.svelte";
  import ResourceHealthDot from "$lib/components/console/ResourceHealthDot.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { readErrorMessage } from "$lib/api/client";
  import { canRunProductQueries } from "$lib/console/auth-query-gate";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";
  import {
    countProjectEnvironments,
    formatTime,
    latestProjectDeployment,
    projectDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const projectPageSize = 12;
  let projectOffset = $state(0);
  let draggedProjectId = $state<string | null>(null);
  let projectReorderError = $state("");

  const { authSessionQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser, { projects: false });
  const projectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects", { limit: projectPageSize, offset: projectOffset }],
      queryFn: () => orpcClient.projects.list({ limit: projectPageSize, offset: projectOffset }),
      enabled: browser && canRunProductQueries(authSessionQuery.data),
    }),
  );
  const projects = $derived(projectsQuery.data?.items ?? []);
  const projectTotal = $derived(projectsQuery.data?.total ?? projects.length);
  const projectPageStart = $derived(projectTotal > 0 ? projectOffset + 1 : 0);
  const projectPageEnd = $derived(Math.min(projectOffset + projects.length, projectTotal));
  const canGoPrevious = $derived(projectOffset > 0);
  const canGoNext = $derived(projectOffset + projectPageSize < projectTotal);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      deploymentsQuery.isPending,
  );
  let projectCreateDialogOpen = $state(false);

  const reorderProjectsMutation = createMutation(() => ({
    mutationFn: (projectIds: string[]) =>
      orpcClient.projects.reorder({
        projectIds,
        startOffset: projectOffset,
      }),
    onSuccess: () => {
      projectReorderError = "";
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => {
      projectReorderError = readErrorMessage(error);
    },
  }));

  $effect(() => {
    projectCreateDialogOpen = modalIsOpen(page, "create-project");
  });

  function openProjectCreateDialog(): void {
    void setModalOpen(page, "create-project", true);
  }

  function setProjectCreateDialogOpen(open: boolean): void {
    projectCreateDialogOpen = open;
    void setModalOpen(page, "create-project", open);
  }

  function openCreatedProject(project: CreateProjectResponse): void {
    void goto(projectDetailHref(project.id));
  }

  function setProjectPage(nextOffset: number): void {
    projectOffset = Math.max(0, nextOffset);
  }

  function reorderVisibleProjects(targetProjectId: string): void {
    if (!draggedProjectId || draggedProjectId === targetProjectId) {
      draggedProjectId = null;
      return;
    }

    const nextProjects = [...projects];
    const fromIndex = nextProjects.findIndex((project) => project.id === draggedProjectId);
    const toIndex = nextProjects.findIndex((project) => project.id === targetProjectId);
    if (fromIndex < 0 || toIndex < 0) {
      draggedProjectId = null;
      return;
    }

    const [moved] = nextProjects.splice(fromIndex, 1);
    if (!moved) {
      draggedProjectId = null;
      return;
    }

    nextProjects.splice(toIndex, 0, moved);
    draggedProjectId = null;
    reorderProjectsMutation.mutate(nextProjects.map((project) => project.id));
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
  {:else}
    <ConsoleResourceCanvas>
      <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div class="max-w-2xl space-y-2">
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.projects.focusTitle)}</h1>
            <DocsHelpLink
              href={webDocsHrefs.projectLifecycle}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.projects.focusDescription)}
          </p>
        </div>
        {#if projects.length > 0}
          <Button class="shrink-0 self-start" type="button" onclick={openProjectCreateDialog}>
            <Plus class="size-4" />
            {$t(i18nKeys.console.projects.createProjectAction)}
          </Button>
        {/if}
      </section>

      <section class="space-y-3">
        {#if projects.length > 0}
          <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.projectListTitle)}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.projects.projectListDescription)}
              </p>
            </div>
            <div
              class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
              data-project-pagination
            >
              <span>
                {$t(i18nKeys.console.projects.projectListRange, {
                  start: projectPageStart,
                  end: projectPageEnd,
                  total: projectTotal,
                })}
              </span>
              <div class="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canGoPrevious || reorderProjectsMutation.isPending}
                  onclick={() => setProjectPage(projectOffset - projectPageSize)}
                >
                  {$t(i18nKeys.common.actions.previous)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canGoNext || reorderProjectsMutation.isPending}
                  onclick={() => setProjectPage(projectOffset + projectPageSize)}
                >
                  {$t(i18nKeys.common.actions.next)}
                </Button>
              </div>
            </div>
          </div>

          {#if projectReorderError}
            <p class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {projectReorderError}
            </p>
          {/if}

          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-project-grid>
            {#each projects as project (project.id)}
              {@const projectResources = resources.filter((resource) => resource.projectId === project.id)}
              {@const latestDeployment = latestProjectDeployment(project, deployments)}
              {@const latestResource =
                projectResources.find((resource) => resource.lastDeploymentId === latestDeployment?.id) ??
                projectResources[0]}
              <article
                class={[
                  "group flex min-h-56 flex-col rounded-md border bg-card p-4 shadow-sm transition",
                  draggedProjectId === project.id
                    ? "border-primary/60 bg-primary/5 opacity-80"
                    : "hover:border-primary/30 hover:bg-muted/20",
                ]}
                draggable={!reorderProjectsMutation.isPending}
                ondragstart={(event) => {
                  draggedProjectId = project.id;
                  event.dataTransfer?.setData("text/plain", project.id);
                  if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                  }
                }}
                ondragover={(event) => {
                  event.preventDefault();
                  if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                ondrop={(event) => {
                  event.preventDefault();
                  reorderVisibleProjects(project.id);
                }}
                ondragend={() => {
                  draggedProjectId = null;
                }}
                data-project-card
                data-project-id={project.id}
              >
                <div class="flex items-start gap-3">
                  <button
                    type="button"
                    class="mt-0.5 inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-foreground active:cursor-grabbing"
                    aria-label={$t(i18nKeys.console.projects.reorderHandle)}
                    title={$t(i18nKeys.console.projects.reorderHandle)}
                    disabled={reorderProjectsMutation.isPending}
                    data-project-reorder-handle
                    onpointerdown={() => {
                      draggedProjectId = project.id;
                    }}
                  >
                    <GripVertical class="size-4" />
                  </button>
                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="truncate text-base font-semibold">{project.name}</h3>
                      <Badge variant="outline">{project.slug}</Badge>
                    </div>
                    <p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {project.description ?? $t(i18nKeys.console.projects.noDescription)}
                    </p>
                  </div>
                </div>

                <div class="mt-5 grid gap-2 text-sm text-muted-foreground">
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

                <a
                  href={projectDetailHref(project.id)}
                  class="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {$t(i18nKeys.common.actions.viewDetails)}
                  <ArrowRight class="size-4" />
                </a>
              </article>
            {/each}
          </div>
        {:else}
          <ConsoleEmptyState
            tone="project"
            title={$t(i18nKeys.console.projects.emptyTitle)}
            description={$t(i18nKeys.console.projects.emptyBody)}
            actionLabel={$t(i18nKeys.console.projects.createProjectAction)}
            learnMoreHref={webDocsHrefs.projectLifecycle}
            onAction={openProjectCreateDialog}
          />
        {/if}
      </section>
    </ConsoleResourceCanvas>
  {/if}

  <Dialog.Root
    bind:open={projectCreateDialogOpen}
    onOpenChange={setProjectCreateDialogOpen}
  >
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.projects.createProjectTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.projects.createProjectDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <div class="px-5 pb-5">
        <ProjectCreateForm
          panel={false}
          showIntro={false}
          idPrefix="projects-page-create"
          onCreated={openCreatedProject}
        />
      </div>
    </Dialog.Content>
  </Dialog.Root>
</ConsoleShell>

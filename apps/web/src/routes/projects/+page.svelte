<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ArrowRight, Check, FolderOpen, GripVertical, Pencil, Plus, ShieldCheck } from "@lucide/svelte";
  import type { CreateProjectResponse, ProjectSummary } from "@appaloft/contracts";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import Sortable from "sortablejs";

  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import DomainBindingVerifyDnsButton, {
    type DomainBindingVerificationFeedback,
  } from "$lib/components/console/DomainBindingVerifyDnsButton.svelte";
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
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const projectPageSize = 12;
  let projectOffset = $state(0);
  let activeProjectId = $state<string | null>(null);
  let projectGridElement = $state<HTMLElement | null>(null);
  let projectSortable: Sortable | null = null;
  let projectSortableRectSnapshot = new Map<string, SortableCardRect>();
  let projectSortSnapshot = $state<ProjectSummary[] | null>(null);
  let projectOptimisticOrderIds = $state<string[] | null>(null);
  let projectSortMode = $state(false);
  let projectReorderError = $state("");
  let visibleProjects = $state<ProjectSummary[]>([]);

  type SortableCardRect = {
    left: number;
    top: number;
  };

  function getSortableGridDirection(
    _event: Event,
    target: HTMLElement | null,
    dragElement: HTMLElement,
  ): "horizontal" | "vertical" {
    if (!target) {
      return "vertical";
    }

    const targetRect = target.getBoundingClientRect();
    const dragRect = dragElement.getBoundingClientRect();
    const sameRow =
      Math.abs(targetRect.top - dragRect.top) < Math.min(targetRect.height, dragRect.height) / 2;

    return sameRow ? "horizontal" : "vertical";
  }

  function captureSortableCardRects(root: HTMLElement): Map<string, SortableCardRect> {
    return new Map(
      Array.from(root.querySelectorAll<HTMLElement>("[data-project-card]"))
        .map((card) => {
          const projectId = card.getAttribute("data-project-id");
          if (!projectId) {
            return null;
          }

          const rect = card.getBoundingClientRect();
          return [projectId, { left: rect.left, top: rect.top }] as const;
        })
        .filter((entry): entry is readonly [string, SortableCardRect] => Boolean(entry)),
    );
  }

  function animateSortableCardMovement(previousRects: Map<string, SortableCardRect>): void {
    if (!projectGridElement || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    for (const card of projectGridElement.querySelectorAll<HTMLElement>("[data-project-card]")) {
      const projectId = card.getAttribute("data-project-id");
      if (!projectId || projectId === activeProjectId) {
        continue;
      }

      const previousRect = previousRects.get(projectId);
      if (!previousRect) {
        continue;
      }

      const currentRect = card.getBoundingClientRect();
      const offsetX = previousRect.left - currentRect.left;
      const offsetY = previousRect.top - currentRect.top;
      if (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1) {
        continue;
      }

      card.animate(
        [
          { transform: `translate3d(${offsetX}px, ${offsetY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 220,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        },
      );
    }
  }

  const { authSessionQuery, environmentsQuery, resourcesQuery, deploymentsQuery, domainBindingsQuery } =
    createConsoleQueries(browser, {
      health: false,
      readiness: false,
      version: false,
      projects: false,
      servers: false,
      previewEnvironments: false,
      certificates: false,
      providers: false,
    });
  const projectsQuery = createQuery(() =>
    orpc.projects.list.queryOptions({
      input: { limit: projectPageSize, offset: projectOffset },
      enabled: browser && canRunProductQueries(authSessionQuery.data),
    }),
  );
  const projects = $derived(projectsQuery.data?.items ?? []);
  const projectQueryOrderKey = $derived(projects.map((project) => project.id).join("|"));
  const projectVisibleOrderKey = $derived(visibleProjects.map((project) => project.id).join("|"));
  const projectOptimisticOrderKey = $derived(projectOptimisticOrderIds?.join("|") ?? "");
  const projectTotal = $derived(projectsQuery.data?.total ?? projects.length);
  const projectPageStart = $derived(projectTotal > 0 ? projectOffset + 1 : 0);
  const projectPageEnd = $derived(Math.min(projectOffset + visibleProjects.length, projectTotal));
  const canGoPrevious = $derived(projectOffset > 0);
  const canGoNext = $derived(projectOffset + projectPageSize < projectTotal);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const domainBindings = $derived(domainBindingsQuery.data?.items ?? []);
  const projectListLoading = $derived(projectsQuery.isPending && visibleProjects.length === 0);
  let projectCreateDialogOpen = $state(false);
  let domainBindingFeedback = $state<DomainBindingVerificationFeedback | null>(null);

  const reorderProjectsMutation = createMutation(() => ({
    mutationFn: ({
      projectIds,
    }: {
      projectIds: string[];
      rollbackProjects: ProjectSummary[];
    }) =>
      orpcClient.projects.reorder({
        projectIds,
        startOffset: projectOffset,
      }),
    onSuccess: () => {
      projectReorderError = "";
      void queryClient.invalidateQueries({ queryKey: orpc.projects.key({ type: "query" }) });
    },
    onError: (error, variables) => {
      visibleProjects = [...variables.rollbackProjects];
      projectOptimisticOrderIds = null;
      projectReorderError = readErrorMessage(error);
    },
  }));

  $effect(() => {
    if (projectOptimisticOrderKey && projectOptimisticOrderKey !== projectQueryOrderKey) {
      return;
    }

    projectOptimisticOrderIds = null;
    if (!activeProjectId && projectQueryOrderKey !== projectVisibleOrderKey) {
      visibleProjects = projects;
    }
  });

  $effect(() => {
    if (!browser || !projectSortMode || reorderProjectsMutation.isPending || !projectGridElement) {
      projectSortable?.destroy();
      projectSortable = null;
      return;
    }

    projectSortable?.destroy();
    const gridElement = projectGridElement;
    projectSortable = Sortable.create(gridElement, {
      animation: 220,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
      handle: "[data-project-reorder-handle]",
      draggable: "[data-project-card]",
      dataIdAttr: "data-project-id",
      ghostClass: "console-sortable-ghost",
      chosenClass: "console-sortable-chosen",
      dragClass: "console-sortable-drag",
      fallbackClass: "console-sortable-fallback",
      direction: getSortableGridDirection,
      swapThreshold: 0.5,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 4,
      onStart: (event: Sortable.SortableEvent) => {
        activeProjectId = event.item.getAttribute("data-project-id");
        projectSortSnapshot = [...visibleProjects];
        projectSortableRectSnapshot = captureSortableCardRects(gridElement);
      },
      onMove: () => {
        projectSortableRectSnapshot = captureSortableCardRects(gridElement);
        return true;
      },
      onChange: () => {
        animateSortableCardMovement(projectSortableRectSnapshot);
        projectSortableRectSnapshot = captureSortableCardRects(gridElement);
      },
      onEnd: () => {
        commitProjectSort(projectSortable?.toArray() ?? []);
      },
    });

    return () => {
      projectSortable?.destroy();
      projectSortable = null;
    };
  });

  $effect(() => {
    if (projectSortable && projectVisibleOrderKey && !activeProjectId) {
      projectSortable.sort(visibleProjects.map((project) => project.id), true);
    }
  });

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
    projectSortMode = false;
    activeProjectId = null;
    projectSortSnapshot = null;
    projectOffset = Math.max(0, nextOffset);
  }

  function setProjectSortMode(enabled: boolean): void {
    if (reorderProjectsMutation.isPending) {
      return;
    }

    projectSortMode = enabled;
    activeProjectId = null;
    projectSortSnapshot = null;
  }

  function commitProjectSort(projectIds: string[]): void {
    const rollbackProjects = projectSortSnapshot ?? visibleProjects;
    const rollbackIds = rollbackProjects.map((project) => project.id);
    const projectById = new Map(visibleProjects.map((project) => [project.id, project]));
    const nextProjects = projectIds
      .map((projectId) => projectById.get(projectId))
      .filter((project): project is ProjectSummary => Boolean(project));

    if (nextProjects.length !== visibleProjects.length) {
      projectSortable?.sort(rollbackIds, true);
      activeProjectId = null;
      projectSortSnapshot = null;
      return;
    }

    const changed = projectIds.join("|") !== rollbackIds.join("|");
    if (changed) {
      visibleProjects = nextProjects;
      projectOptimisticOrderIds = projectIds;
      reorderProjectsMutation.mutate({ projectIds, rollbackProjects });
    }

    activeProjectId = null;
    projectSortSnapshot = null;
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
      {#if visibleProjects.length > 0}
        <div class="flex shrink-0 flex-wrap items-center gap-2 self-start">
          <Button type="button" onclick={openProjectCreateDialog}>
            <Plus class="size-4" />
            {$t(i18nKeys.console.projects.createProjectAction)}
          </Button>
          {#if visibleProjects.length > 1}
            <Button
              type="button"
              variant={projectSortMode ? "selected" : "outline"}
              disabled={reorderProjectsMutation.isPending}
              onclick={() => setProjectSortMode(!projectSortMode)}
              data-project-sort-toggle
            >
              {#if projectSortMode}
                <Check class="size-4" />
                {$t(i18nKeys.common.actions.done)}
              {:else}
                <Pencil class="size-4" />
                {$t(i18nKeys.common.actions.edit)}
              {/if}
            </Button>
          {/if}
        </div>
      {/if}
    </section>

    <section class="space-y-3">
      {#if visibleProjects.length > 0 || projectListLoading}
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
            {#if projectListLoading}
              <Skeleton class="h-5 w-28" />
              <div class="flex items-center gap-1">
                <Skeleton class="h-8 w-16 rounded-md" />
                <Skeleton class="h-8 w-16 rounded-md" />
              </div>
            {:else}
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
                  disabled={!canGoPrevious || projectSortMode || reorderProjectsMutation.isPending}
                  onclick={() => setProjectPage(projectOffset - projectPageSize)}
                >
                  {$t(i18nKeys.common.actions.previous)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canGoNext || projectSortMode || reorderProjectsMutation.isPending}
                  onclick={() => setProjectPage(projectOffset + projectPageSize)}
                >
                  {$t(i18nKeys.common.actions.next)}
                </Button>
              </div>
            {/if}
          </div>
        </div>

        {#if projectReorderError}
          <p class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {projectReorderError}
          </p>
        {/if}

        {#if domainBindingFeedback}
          <div
            class={[
              "rounded-md border px-3 py-2 text-sm",
              domainBindingFeedback.kind === "success"
                ? "border-primary/25 bg-primary/5"
                : "border-destructive/30 bg-destructive/5 text-destructive",
            ]}
          >
            <p class="font-medium">{domainBindingFeedback.title}</p>
            <p class="mt-1 break-all text-xs">{domainBindingFeedback.detail}</p>
          </div>
        {/if}

        <div
          class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          bind:this={projectGridElement}
          data-project-grid
        >
          {#if projectListLoading}
            {#each Array.from({ length: 6 }) as _, index (index)}
              <article
                class="flex min-h-56 min-w-0 flex-col rounded-md border bg-card p-4 shadow-sm"
                aria-hidden="true"
                data-project-loading-card
              >
                <div class="space-y-2 pr-10">
                  <Skeleton class="h-5 w-3/5" />
                  <Skeleton class="h-5 w-32 rounded-md" />
                  <div class="space-y-1.5 pt-1">
                    <Skeleton class="h-4 w-full" />
                    <Skeleton class="h-4 w-4/5" />
                  </div>
                </div>
                <div class="mt-5 grid gap-2">
                  <Skeleton class="h-4 w-24" />
                  <Skeleton class="h-4 w-20" />
                  <Skeleton class="h-4 w-44 max-w-full" />
                </div>
                <Skeleton class="mt-auto h-4 w-24" />
              </article>
            {/each}
          {:else}
            {#each visibleProjects as project (project.id)}
              {@const projectResources = resources.filter((resource) => resource.projectId === project.id)}
              {@const pendingProjectDomainBindings = domainBindings.filter(
                (binding) =>
                  binding.projectId === project.id && binding.status === "pending_verification",
              )}
              {@const latestDeployment = latestProjectDeployment(project, deployments)}
              {@const latestResource =
                projectResources.find((resource) => resource.lastDeploymentId === latestDeployment?.id) ??
                projectResources[0]}
              <article
                class={[
                  "group relative flex min-h-56 min-w-0 flex-col rounded-md border bg-card p-4 shadow-sm transition-colors",
                  projectSortMode ? "select-none" : "",
                  activeProjectId === project.id
                    ? "border-primary/60 bg-primary/5 opacity-80"
                    : "hover:border-primary/30 hover:bg-muted/20",
                ]}
                data-project-card
                data-project-id={project.id}
              >
                {#if projectSortMode}
                  <button
                    type="button"
                    class="absolute right-3 top-3 z-10 inline-flex size-8 cursor-grab items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-foreground active:cursor-grabbing"
                    aria-label={$t(i18nKeys.console.projects.reorderHandle)}
                    title={$t(i18nKeys.console.projects.reorderHandle)}
                    disabled={reorderProjectsMutation.isPending}
                    data-project-reorder-handle
                  >
                    <GripVertical class="size-4" />
                  </button>
                {/if}
                <div class="min-w-0 space-y-2 pr-10" data-project-card-header>
                  <h3 class="truncate text-base font-semibold" title={project.name}>{project.name}</h3>
                  <Badge variant="outline" class="max-w-full truncate font-mono text-[11px]" title={project.slug}>
                    {project.slug}
                  </Badge>
                  <p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {project.description ?? $t(i18nKeys.console.projects.noDescription)}
                  </p>
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

                {#if pendingProjectDomainBindings.length > 0}
                  <div
                    class="mt-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm"
                    data-project-pending-domain-bindings
                  >
                    <p class="font-medium">
                      {$t(i18nKeys.console.domainBindings.pendingDnsNoticeTitle)}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {$t(i18nKeys.console.domainBindings.pendingDnsProjectSummary, {
                        count: pendingProjectDomainBindings.length,
                      })}
                    </p>
                    <DomainBindingVerifyDnsButton
                      class="mt-3"
                      binding={pendingProjectDomainBindings[0]}
                      label={$t(i18nKeys.console.domainBindings.verifyDnsShortAction)}
                      variant="default"
                      onFeedback={(feedback) => {
                        domainBindingFeedback = feedback;
                      }}
                    />
                  </div>
                {/if}

                <a
                  href={projectDetailHref(project.id)}
                  class="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {$t(i18nKeys.common.actions.viewDetails)}
                  <ArrowRight class="size-4" />
                </a>
              </article>
            {/each}
          {/if}
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

<style>
  :global(.console-sortable-ghost) {
    opacity: 0.42;
  }

  :global(.console-sortable-chosen) {
    border-color: hsl(var(--primary) / 0.6);
    box-shadow: 0 10px 30px hsl(var(--foreground) / 0.12);
  }

  :global(.console-sortable-drag) {
    cursor: grabbing;
    transition: none !important;
  }

  :global(.console-sortable-fallback) {
    transition: none !important;
  }
</style>

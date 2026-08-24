<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import {
    Activity,
    ArrowUpRight,
    Boxes,
    CheckCircle2,
    ChevronDown,
    LayoutGrid,
    List,
    LoaderCircle,
    Plus,
    RefreshCw,
    Search,
    TriangleAlert,
  } from "@lucide/svelte";

  import {
    dashboardClient,
    type DashboardProjectEnvironmentOverview,
  } from "$lib/data-client";
  import { dashboardCopy as copy, dashboardI18n as i18n } from "$lib/i18n.svelte";
  import {
    projectDestinationHref,
    resourceDestinationHref,
    type DashboardRoute,
    type ProjectDestination,
  } from "$lib/navigation";
  import { dashboardProjectContext } from "$lib/project-context.svelte";

  import ScopedExtensions from "./ScopedExtensions.svelte";
  import CreateResourceDialog from "./CreateResourceDialog.svelte";

  let { route }: { route: Extract<DashboardRoute, { kind: "project" | "resource" }> } = $props();

  let overview = $state<DashboardProjectEnvironmentOverview | undefined>();
  let loading = $state(true);
  let error = $state(false);
  let createResourceOpen = $state(false);
  let latestRequest = 0;

  async function load(): Promise<void> {
    const request = ++latestRequest;
    if (activeDestination !== "overview") {
      overview = undefined;
      loading = false;
      error = false;
      try {
        const project = await dashboardClient.projects.show({ projectId: route.projectId });
        if (request === latestRequest) {
          dashboardProjectContext.set({
            projectId: project.id,
            projectName: project.name,
            environmentId: route.environmentId || "production",
            environmentName: route.environmentId || "production",
          });
        }
      } catch {
        if (request === latestRequest) {
          dashboardProjectContext.set({
            projectId: route.projectId,
            projectName: route.projectId,
            environmentId: route.environmentId || "production",
            environmentName: route.environmentId || "production",
          });
        }
      }
      return;
    }
    loading = true;
    error = false;
    try {
      const result = await dashboardClient.projects.environmentOverview({
        projectId: route.projectId,
        environmentId: route.environmentId || "production",
        ...(route.cursor ? { cursor: route.cursor } : {}),
        ...(route.search ? { search: route.search } : {}),
        ...(route.filters.find(
          (filter) => filter === "healthy" || filter === "attention" || filter === "unknown",
        )
          ? {
              health: route.filters.find(
                (filter) =>
                  filter === "healthy" || filter === "attention" || filter === "unknown",
              ) as "healthy" | "attention" | "unknown",
            }
          : {}),
        limit: 50,
        sort:
          route.sort === "name-desc" ||
          route.sort === "recent-activity-desc"
            ? route.sort
            : "name-asc",
      });
      if (request === latestRequest) {
        overview = result;
        dashboardProjectContext.set({
          projectId: result.project.id,
          projectName: result.project.name,
          environmentId: result.environment.id,
          environmentName: result.environment.name,
        });
      }
    } catch {
      if (request === latestRequest) {
        overview = undefined;
        error = true;
      }
    } finally {
      if (request === latestRequest) loading = false;
    }
  }

  function activityLabel(value?: string): string {
    if (!value) return "—";
    return new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function selectEnvironment(event: Event): void {
    const environmentId = (event.currentTarget as HTMLSelectElement).value;
    location.href = projectDestinationHref(route.projectId, activeDestination, environmentId, {
      view: route.view,
      search: route.search,
      sort: route.sort,
      filters: route.filters,
    });
  }

  const resources = $derived(overview?.resources ?? []);

  const activeDestination = $derived(route.kind === "resource" ? "overview" : route.destination);
  const content = $derived.by(() => {
    const destinationCopy: Record<ProjectDestination, { title: string; description: string }> = {
      overview: {
        title: i18n.t(copy.nav.overview),
        description: i18n.t(copy.project.description, {
          environment: route.environmentId || "production",
        }),
      },
      deployments: {
        title: i18n.t(copy.nav.deployments),
        description: i18n.t(copy.destination.projectDeployments),
      },
      observability: {
        title: i18n.t(copy.nav.observability),
        description: i18n.t(copy.destination.projectObservability),
      },
      settings: {
        title: i18n.t(copy.nav.settings),
        description: i18n.t(copy.destination.projectSettings),
      },
    };

    return destinationCopy[activeDestination];
  });

  $effect(() => {
    route.projectId;
    route.environmentId;
    route.cursor;
    route.search;
    route.sort;
    route.filters;
    activeDestination;
    void load();
  });
</script>

<section class="mx-auto w-full max-w-[1280px] px-5 py-7 sm:px-8 lg:py-10">
  <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
    <div>
      <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span class="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">{overview?.project.name || route.projectId}</span>
        <span>/</span>
        {#if overview}
          <label class="relative inline-flex items-center">
            <select class="h-7 appearance-none rounded-[8px] bg-transparent pl-2 pr-7 hover:bg-muted" value={overview.environment.id} onchange={selectEnvironment} aria-label="Environment">
              {#each overview.environmentChoices as environment}
                <option value={environment.id}>{environment.name}</option>
              {/each}
            </select>
            <ChevronDown class="pointer-events-none absolute right-2 size-3.5" />
          </label>
        {:else}
          <span class="px-2">{route.environmentId || "production"}</span>
        {/if}
      </div>
      <h1 class="text-2xl font-semibold tracking-[-0.02em]">{content.title}</h1>
      <p class="mt-2 max-w-2xl text-sm text-muted-foreground">{content.description}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex h-10 items-center rounded-[10px] border border-divider bg-surface p-1">
        <button class="grid size-8 place-items-center rounded-[7px] bg-muted text-foreground" aria-label={i18n.t(copy.project.list)}>
          <List class="size-4" />
        </button>
        <button class="grid size-8 place-items-center rounded-[7px] text-muted-foreground hover:text-foreground" aria-label={i18n.t(copy.project.topology)} disabled>
          <LayoutGrid class="size-4" />
        </button>
      </div>
      {#if activeDestination === "overview"}<Button data-add-resource class="h-10 rounded-[10px] px-4 shadow-[var(--shadow-primary)] hover:shadow-[var(--shadow-primary-hover)]" onclick={() => (createResourceOpen = true)}><Plus data-icon="inline-start" />{i18n.t(copy.actions.addResource)}</Button>{/if}
    </div>
  </div>

  {#if activeDestination === "overview"}
    {#if loading}
      <div class="mt-8 grid min-h-72 place-items-center rounded-[16px] border border-divider bg-surface" aria-label="Loading project">
        <LoaderCircle class="size-6 animate-spin text-primary" />
      </div>
    {:else if error || !overview}
      <section class="mt-8 rounded-[16px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center">
        <TriangleAlert class="mx-auto size-6 text-destructive" />
        <h2 class="mt-4 font-semibold">{i18n.t(copy.projects.loadError)}</h2>
        <p class="mt-2 text-sm text-muted-foreground">{i18n.t(copy.projects.loadErrorDescription)}</p>
        <Button variant="outline" class="mt-5 h-10 rounded-[10px] shadow-none" onclick={() => void load()}>
          <RefreshCw class="size-4" />
          {i18n.t(copy.actions.retry)}
        </Button>
      </section>
    {:else}
    <div class="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section class="min-w-0 overflow-hidden rounded-[16px] border border-divider bg-surface">
        <div class="flex flex-col gap-4 border-b border-divider p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="font-semibold">{i18n.t(copy.project.resourceHealth)}</h2>
            <p class="mt-1 text-xs text-muted-foreground">{i18n.t(copy.project.resourceSummary, { count: overview.attention.total, environment: overview.environment.name })}</p>
          </div>
          <form class="relative block w-full sm:w-64" method="GET" action={`/projects/${encodeURIComponent(route.projectId)}/overview`}>
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="hidden" name="environment" value={overview.environment.id} />
            {#if route.view}<input type="hidden" name="view" value={route.view} />{/if}
            {#if route.sort}<input type="hidden" name="sort" value={route.sort} />{/if}
            {#each route.filters as filter}
              <input type="hidden" name="filter" value={filter} />
            {/each}
            <input
              class="h-9 w-full rounded-[9px] border border-control bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/75 focus:border-ring focus:ring-2 focus:ring-ring/15"
              name="search"
              value={route.search || ""}
              placeholder={i18n.t(copy.project.searchResources)}
            />
          </form>
        </div>
        <div class="divide-y divide-divider">
          {#each resources as resource}
            <a
              href={resourceDestinationHref(route.projectId, resource.id, "overview", overview.environment.id, {
                view: route.view,
                search: route.search,
                sort: route.sort,
                cursor: route.cursor,
                filters: route.filters,
              })}
              class="group grid gap-3 px-5 py-4 outline-none transition-colors hover:bg-surface-subtle focus-visible:bg-surface-selected sm:grid-cols-[minmax(0,1fr)_130px_130px] sm:items-center"
            >
              <div class="flex min-w-0 items-center gap-3">
                <span data-icon-surface="blue" class="grid size-10 shrink-0 place-items-center rounded-[11px] bg-icon-blue text-icon-blue-foreground">
                  <Boxes class="size-[18px]" />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium group-hover:text-primary">{resource.name}</p>
                  <p class="mt-0.5 text-xs capitalize text-muted-foreground">{resource.kind.replaceAll("-", " ")}</p>
                </div>
              </div>
              <span class="inline-flex items-center gap-2 text-xs">
                <span class={`size-2 rounded-full ${resource.attentionStatus === "healthy" ? "bg-emerald-500" : resource.attentionStatus === "attention" ? "bg-amber-500" : "bg-muted-foreground"}`}></span>
                {resource.attentionStatus === "healthy" ? i18n.t(copy.projects.healthy) : resource.attentionStatus === "attention" ? i18n.t(copy.projects.needsAttention) : resource.health.status}
              </span>
              <div class="flex items-center justify-between gap-3 sm:block sm:text-right">
                <p class="font-mono text-xs text-foreground">{resource.latestDeployment?.id || "—"}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">{activityLabel(resource.latestDeployment?.createdAt)}</p>
              </div>
            </a>
          {/each}
        </div>
        {#if overview.nextCursor}
          <div class="flex justify-end border-t border-divider p-4">
            <Button
              variant="outline"
              class="h-9 rounded-[9px] shadow-none"
              href={projectDestinationHref(route.projectId, "overview", overview.environment.id, {
                view: route.view,
                search: route.search,
                sort: route.sort,
                cursor: overview.nextCursor,
                filters: route.filters,
              })}
            >
              {i18n.t(copy.actions.nextPage)}
            </Button>
          </div>
        {/if}
      </section>

      <aside class="grid content-start gap-4">
        <section class="rounded-[16px] border border-divider bg-surface p-5">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold">{i18n.t(copy.project.resourceHealth)}</h2>
            <Activity class="size-4 text-muted-foreground" />
          </div>
          <div class="mt-5 flex items-end gap-2">
            <span class="text-3xl font-semibold tracking-[-0.03em]">{overview.attention.healthy}</span>
            <span class="pb-1 text-sm text-muted-foreground">{i18n.t(copy.project.healthySummary, { healthy: overview.attention.healthy, total: overview.attention.total })}</span>
          </div>
          <div class="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
            <span class="bg-emerald-500" style:width={`${overview.attention.total ? (overview.attention.healthy / overview.attention.total) * 100 : 0}%`}></span>
            <span class="bg-amber-500" style:width={`${overview.attention.total ? (overview.attention.attention / overview.attention.total) * 100 : 0}%`}></span>
          </div>
        </section>
        <section class="rounded-[16px] border border-divider bg-surface p-5">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold">{i18n.t(copy.project.recentDeployments)}</h2>
            <ArrowUpRight class="size-4 text-muted-foreground" />
          </div>
          <div class="mt-4 space-y-4">
            {#each overview.resources.filter((resource) => resource.latestDeployment).slice(0, 3) as resource}
              <div class="flex items-start gap-3">
                <CheckCircle2 class="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium">{resource.name}</p>
                  <p class="mt-1 font-mono text-[11px] text-muted-foreground">{resource.latestDeployment?.id}</p>
                </div>
                <span class="text-[11px] text-muted-foreground">{activityLabel(resource.latestDeployment?.createdAt)}</span>
              </div>
            {/each}
          </div>
        </section>
      </aside>
    </div>
    {/if}
  {:else if activeDestination === "deployments"}
    {#await import("./ProjectDeployments.svelte")}<div class="mt-8 grid min-h-64 place-items-center rounded-[16px] border border-divider bg-surface"><LoaderCircle class="size-6 animate-spin text-primary" /></div>{:then module}<module.default projectId={route.projectId} environmentId={route.environmentId || "production"} />{:catch}<p class="mt-8 rounded-[16px] border border-destructive/25 p-8 text-center text-sm text-destructive">Deployment module failed to load.</p>{/await}
  {:else if activeDestination === "observability"}
    {#await import("./ProjectObservability.svelte")}<div class="mt-8 grid min-h-64 place-items-center rounded-[16px] border border-divider bg-surface"><LoaderCircle class="size-6 animate-spin text-primary" /></div>{:then module}<module.default projectId={route.projectId} />{:catch}<p class="mt-8 rounded-[16px] border border-destructive/25 p-8 text-center text-sm text-destructive">Observability module failed to load.</p>{/await}
  {:else}
    {#await import("./ProjectSettings.svelte")}<div class="mt-8 grid min-h-64 place-items-center rounded-[16px] border border-divider bg-surface"><LoaderCircle class="size-6 animate-spin text-primary" /></div>{:then module}<module.default projectId={route.projectId} />{:catch}<p class="mt-8 rounded-[16px] border border-destructive/25 p-8 text-center text-sm text-destructive">Settings module failed to load.</p>{/await}
  {/if}
  {#if route.kind === "project"}
    <ScopedExtensions {route} />
  {/if}
</section>

{#if createResourceOpen}<CreateResourceDialog projectId={route.projectId} environmentId={route.environmentId || overview?.environment.id || "production"} onclose={() => (createResourceOpen = false)} />{/if}

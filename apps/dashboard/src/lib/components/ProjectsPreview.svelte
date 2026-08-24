<script lang="ts">
  import { Badge } from "@appaloft/ui/badge";
  import { Button } from "@appaloft/ui/button";
  import * as Card from "@appaloft/ui/card";
  import {
    ArrowRight,
    ArrowUpRight,
    Boxes,
    CheckCircle2,
    Clock3,
    LoaderCircle,
    Plus,
    RefreshCw,
    Search,
    TriangleAlert,
  } from "@lucide/svelte";

  import { dashboardClient, type DashboardProjectSummary } from "$lib/data-client";
  import { dashboardCopy as copy, dashboardI18n as i18n } from "$lib/i18n.svelte";
  import { projectDestinationHref, type DashboardRoute } from "$lib/navigation";

  let { route }: { route: Extract<DashboardRoute, { kind: "workspace" }> } = $props();
  let projects = $state<DashboardProjectSummary[]>([]);
  let nextCursor = $state<string | undefined>();
  let loading = $state(true);
  let error = $state(false);
  let latestRequest = 0;

  async function load(): Promise<void> {
    const request = ++latestRequest;
    loading = true;
    error = false;
    try {
      const result = await dashboardClient.projects.listSummaries({
        ...(route.cursor ? { cursor: route.cursor } : {}),
        ...(route.search ? { search: route.search } : {}),
        limit: 24,
        sort:
          route.sort === "name-asc" || route.sort === "name-desc"
            ? route.sort
            : "recent-activity-desc",
      });
      if (request === latestRequest) {
        projects = result.items;
        nextCursor = result.nextCursor;
      }
    } catch {
      if (request === latestRequest) {
        projects = [];
        nextCursor = undefined;
        error = true;
      }
    } finally {
      if (request === latestRequest) loading = false;
    }
  }

  function activityLabel(value?: string): string {
    if (!value) return i18n.t(copy.projects.noActivity);
    return new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function nextPageHref(cursor: string): string {
    const params = new URLSearchParams();
    params.set("cursor", cursor);
    if (route.search) params.set("search", route.search);
    if (route.sort) params.set("sort", route.sort);
    return `/projects?${params}`;
  }

  $effect(() => {
    route.cursor;
    route.search;
    route.sort;
    void load();
  });
</script>

<section class="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:py-12">
  <div class="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div class="max-w-2xl">
      <div class="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span class="size-1.5 rounded-full bg-emerald-500"></span>
        {i18n.t(copy.shell.liveControlPlane)}
      </div>
      <h1 class="text-[clamp(1.75rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em]">
        {i18n.t(copy.projects.title)}
      </h1>
      <p class="mt-2 max-w-xl text-[0.9375rem] text-muted-foreground">
        {i18n.t(copy.projects.description)}
      </p>
    </div>
    <Button href="/projects/new" class="h-10 rounded-[10px] px-4 shadow-[var(--shadow-primary)] hover:shadow-[var(--shadow-primary-hover)]">
      <Plus data-icon="inline-start" />
      {i18n.t(copy.actions.newProject)}
    </Button>
  </div>

  <form class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center" method="GET" action="/projects">
    <label class="relative block w-full max-w-sm">
      <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        class="h-10 w-full rounded-[10px] border border-control bg-surface pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/75 hover:border-ring/40 focus:border-ring focus:ring-2 focus:ring-ring/15"
        name="search"
        value={route.search || ""}
        placeholder={i18n.t(copy.actions.searchProjects)}
      />
    </label>
    <select name="sort" class="h-10 rounded-[10px] border border-control bg-surface px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/15">
      <option value="recent-activity-desc" selected={!route.sort || route.sort === "recent-activity-desc"}>{i18n.t(copy.projects.sortRecent)}</option>
      <option value="name-asc" selected={route.sort === "name-asc"}>{i18n.t(copy.projects.sortNameAsc)}</option>
      <option value="name-desc" selected={route.sort === "name-desc"}>{i18n.t(copy.projects.sortNameDesc)}</option>
    </select>
    <Button type="submit" variant="outline" class="h-10 rounded-[10px] px-4 shadow-none">{i18n.t(copy.actions.apply)}</Button>
  </form>

  {#if loading}
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={i18n.t(copy.projects.loading)}>
      {#each [1, 2, 3] as _item}
        <div class="min-h-56 animate-pulse rounded-[16px] border border-divider bg-surface p-5" aria-hidden="true">
          <span class="grid size-10 place-items-center rounded-[11px] bg-icon-blue text-icon-blue-foreground"><LoaderCircle class="size-[18px]" /></span>
          <div class="mt-8 h-4 w-1/2 rounded bg-muted"></div>
          <div class="mt-3 h-3 w-3/4 rounded bg-muted"></div>
        </div>
      {/each}
    </div>
  {:else if error}
    <section class="rounded-[16px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center">
      <TriangleAlert class="mx-auto size-6 text-destructive" />
      <h2 class="mt-4 font-semibold">{i18n.t(copy.projects.loadError)}</h2>
      <p class="mt-2 text-sm text-muted-foreground">{i18n.t(copy.projects.loadErrorDescription)}</p>
      <Button variant="outline" class="mt-5 h-10 rounded-[10px] shadow-none" onclick={() => void load()}>
        <RefreshCw class="size-4" />
        {i18n.t(copy.actions.retry)}
      </Button>
    </section>
  {:else if projects.length === 0}
    <section class="rounded-[16px] border border-divider bg-surface p-10 text-center">
      <span class="mx-auto grid size-12 place-items-center rounded-[13px] bg-icon-blue text-icon-blue-foreground"><Boxes class="size-5" /></span>
      <h2 class="mt-5 font-semibold">{i18n.t(copy.projects.emptyTitle)}</h2>
      <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{i18n.t(copy.projects.emptyDescription)}</p>
    </section>
  {:else}
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each projects as project}
        <Card.Root data-project-card class="group overflow-hidden rounded-[16px] border-divider bg-surface py-0 shadow-none transition-colors hover:border-ring/35 hover:bg-surface-raised">
          <a class="block p-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" href={projectDestinationHref(project.id, "overview")}>
            <div class="flex items-start justify-between gap-4">
              <span data-icon-surface="blue" class="grid size-10 place-items-center rounded-[11px] bg-icon-blue text-icon-blue-foreground"><Boxes class="size-[18px]" /></span>
              <ArrowUpRight class="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            <div class="mt-8">
              <h2 class="text-base font-semibold">{project.name}</h2>
              <p class="mt-1 min-h-5 text-sm text-muted-foreground">{project.description || project.slug}</p>
            </div>
            <div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider pt-4 text-xs text-muted-foreground">
              <span class="inline-flex items-center gap-1.5">
                {#if project.attentionStatus === "healthy"}
                  <CheckCircle2 class="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  {i18n.t(copy.projects.healthy)}
                {:else}
                  <TriangleAlert class="size-3.5 text-amber-600 dark:text-amber-400" />
                  {i18n.t(copy.projects.attentionCount, { count: project.attentionCount })}
                {/if}
              </span>
              <span>{i18n.t(copy.projects.resourceCount, { count: project.resourceCount })}</span>
              <span class="ml-auto inline-flex items-center gap-1.5"><Clock3 class="size-3.5" />{activityLabel(project.latestActivityAt)}</span>
            </div>
          </a>
        </Card.Root>
      {/each}
    </div>

    {#if nextCursor}
      <div class="mt-8 flex justify-end">
        <Button href={nextPageHref(nextCursor)} variant="outline" class="h-10 rounded-[10px] shadow-none">
          {i18n.t(copy.actions.nextPage)}
          <ArrowRight class="size-4" />
        </Button>
      </div>
    {/if}

    <section class="mt-8 flex items-center gap-4 rounded-[16px] border border-divider bg-surface p-5 sm:p-6">
      <span class="grid size-11 shrink-0 place-items-center rounded-[12px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><CheckCircle2 class="size-5" /></span>
      <div>
        <h2 class="font-semibold">{i18n.t(copy.projects.summaryTitle, { count: projects.length })}</h2>
        <p class="mt-1 text-sm text-muted-foreground">{i18n.t(copy.projects.summaryDescription)}</p>
      </div>
      <Badge variant="secondary" class="ml-auto rounded-full">{i18n.t(copy.shell.live)}</Badge>
    </section>
  {/if}
</section>

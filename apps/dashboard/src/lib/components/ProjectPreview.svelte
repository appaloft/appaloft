<script lang="ts">
  import { Badge } from "@appaloft/ui/badge";
  import { Button } from "@appaloft/ui/button";
  import {
    Activity,
    ArrowUpRight,
    Boxes,
    CheckCircle2,
    ChevronDown,
    GitBranch,
    LayoutGrid,
    List,
    Plus,
    Search,
  } from "@lucide/svelte";

  import { dashboardCopy as copy, dashboardI18n as i18n } from "$lib/i18n.svelte";
  import {
    resourceDestinationHref,
    type DashboardRoute,
    type ProjectDestination,
  } from "$lib/navigation";

  let { route }: { route: Extract<DashboardRoute, { kind: "project" | "resource" }> } = $props();

  const resources = [
    { id: "api-gateway", name: "api-gateway", kind: "Dockerfile", state: "healthy", deployment: "3f8a1c2", time: "8 min ago", tone: "bg-icon-blue text-icon-blue-foreground", toneName: "blue" },
    { id: "events-worker", name: "events-worker", kind: "Docker image", state: "healthy", deployment: "d104ba8", time: "19 min ago", tone: "bg-icon-cyan text-icon-cyan-foreground", toneName: "cyan" },
    { id: "postgres-main", name: "postgres-main", kind: "PostgreSQL", state: "healthy", deployment: "managed", time: "1 hr ago", tone: "bg-icon-violet text-icon-violet-foreground", toneName: "violet" },
    { id: "billing-sync", name: "billing-sync", kind: "Scheduled task", state: "attention", deployment: "b71e932", time: "2 hr ago", tone: "bg-icon-blue text-icon-blue-foreground", toneName: "blue" },
  ] as const;

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
</script>

<section class="mx-auto w-full max-w-[1280px] px-5 py-7 sm:px-8 lg:py-10">
  <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
    <div>
      <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span class="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">Atlas API</span>
        <span>/</span>
        <button class="inline-flex h-7 items-center gap-1 rounded-[8px] px-2 hover:bg-muted">
          production
          <ChevronDown class="size-3.5" />
        </button>
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
      <Button class="h-10 rounded-[10px] px-4 shadow-[var(--shadow-primary)] hover:shadow-[var(--shadow-primary-hover)]">
        <Plus data-icon="inline-start" />
        {i18n.t(copy.actions.addResource)}
      </Button>
    </div>
  </div>

  {#if activeDestination === "overview"}
    <div class="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section class="min-w-0 overflow-hidden rounded-[16px] border border-divider bg-surface">
        <div class="flex flex-col gap-4 border-b border-divider p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="font-semibold">{i18n.t(copy.project.resourceHealth)}</h2>
            <p class="mt-1 text-xs text-muted-foreground">{i18n.t(copy.project.resourceSummary, { count: 4, environment: route.environmentId || "production" })}</p>
          </div>
          <label class="relative block w-full sm:w-64">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              class="h-9 w-full rounded-[9px] border border-control bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/75 focus:border-ring focus:ring-2 focus:ring-ring/15"
              placeholder={i18n.t(copy.project.searchResources)}
            />
          </label>
        </div>
        <div class="divide-y divide-divider">
          {#each resources as resource}
            <a
              href={resourceDestinationHref(route.projectId, resource.id, "overview", route.environmentId)}
              class="group grid gap-3 px-5 py-4 outline-none transition-colors hover:bg-surface-subtle focus-visible:bg-surface-selected sm:grid-cols-[minmax(0,1fr)_130px_130px] sm:items-center"
            >
              <div class="flex min-w-0 items-center gap-3">
                <span data-icon-surface={resource.toneName} class={`grid size-10 shrink-0 place-items-center rounded-[11px] ${resource.tone}`}>
                  <Boxes class="size-[18px]" />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium group-hover:text-primary">{resource.name}</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">{resource.kind}</p>
                </div>
              </div>
              <span class="inline-flex items-center gap-2 text-xs">
                <span class={`size-2 rounded-full ${resource.state === "healthy" ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                {resource.state === "healthy" ? i18n.t(copy.projects.healthy) : i18n.t(copy.projects.needsAttention)}
              </span>
              <div class="flex items-center justify-between gap-3 sm:block sm:text-right">
                <p class="font-mono text-xs text-foreground">{resource.deployment}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">{resource.time}</p>
              </div>
            </a>
          {/each}
        </div>
      </section>

      <aside class="grid content-start gap-4">
        <section class="rounded-[16px] border border-divider bg-surface p-5">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold">{i18n.t(copy.project.resourceHealth)}</h2>
            <Activity class="size-4 text-muted-foreground" />
          </div>
          <div class="mt-5 flex items-end gap-2">
            <span class="text-3xl font-semibold tracking-[-0.03em]">3</span>
            <span class="pb-1 text-sm text-muted-foreground">{i18n.t(copy.project.healthySummary, { healthy: 3, total: 4 })}</span>
          </div>
          <div class="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
            <span class="w-3/4 bg-emerald-500"></span>
            <span class="w-1/4 bg-amber-500"></span>
          </div>
        </section>
        <section class="rounded-[16px] border border-divider bg-surface p-5">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold">{i18n.t(copy.project.recentDeployments)}</h2>
            <ArrowUpRight class="size-4 text-muted-foreground" />
          </div>
          <div class="mt-4 space-y-4">
            {#each resources.slice(0, 3) as resource}
              <div class="flex items-start gap-3">
                <CheckCircle2 class="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium">{resource.name}</p>
                  <p class="mt-1 font-mono text-[11px] text-muted-foreground">{resource.deployment}</p>
                </div>
                <span class="text-[11px] text-muted-foreground">{resource.time}</span>
              </div>
            {/each}
          </div>
        </section>
      </aside>
    </div>
  {:else}
    <div class="mt-8 grid gap-4 md:grid-cols-3">
      {#each ["Current scope", "Owner boundary", "Primary path"] as label, index}
        <section class="min-h-48 rounded-[16px] border border-divider bg-surface p-5">
          <div class="grid size-10 place-items-center rounded-[11px] bg-primary/10 text-primary">
            {#if index === 0}<GitBranch class="size-[18px]" />{:else if index === 1}<Boxes class="size-[18px]" />{:else}<ArrowUpRight class="size-[18px]" />{/if}
          </div>
          <h2 class="mt-8 text-sm font-semibold">{label}</h2>
          <p class="mt-2 text-sm text-muted-foreground">{content.description}</p>
        </section>
      {/each}
    </div>
  {/if}
</section>

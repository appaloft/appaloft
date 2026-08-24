<script lang="ts">
  import { browser } from "$app/environment";
  import { Badge } from "@appaloft/ui/badge";
  import { Button } from "@appaloft/ui/button";
  import {
    CheckCircle2,
    ExternalLink,
    GitCommitHorizontal,
    Globe2,
    LoaderCircle,
    MoreHorizontal,
    RefreshCw,
    Rocket,
    TriangleAlert,
    X,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { dashboardClient, type DashboardResourceOverview } from "$lib/data-client";
  import {
    commonCopy,
    dashboardCopy as copy,
    dashboardI18n as i18n,
  } from "$lib/i18n.svelte";
  import {
    projectDestinationHref,
    resourceDestinationHref,
    resourceNavigation,
    type DashboardRoute,
    type ResourceDestination,
  } from "$lib/navigation";

  import ScopedExtensions from "./ScopedExtensions.svelte";

  let { route }: { route: Extract<DashboardRoute, { kind: "resource" }> } = $props();

  const minimumPanelWidth = 480;
  const maximumPanelWidth = 960;
  const panelWidthStorageKey = "appaloft.dashboard.resource-panel-width";
  let panelWidth = $state(736);
  let overview = $state<DashboardResourceOverview | undefined>();
  let loading = $state(true);
  let error = $state(false);
  let actionPending = $state(false);
  let actionError = $state(false);
  let latestRequest = 0;

  async function load(): Promise<void> {
    const request = ++latestRequest;
    loading = true;
    error = false;
    try {
      const result = await dashboardClient.resources.overview({
        projectId: route.projectId,
        environmentId: route.environmentId || "production",
        resourceId: route.resourceId,
      });
      if (request === latestRequest) overview = result;
    } catch {
      if (request === latestRequest) {
        overview = undefined;
        error = true;
      }
    } finally {
      if (request === latestRequest) loading = false;
    }
  }

  async function forceRedeploy(): Promise<void> {
    if (actionPending) return;
    actionPending = true;
    actionError = false;
    try {
      await dashboardClient.deployments.forceRedeploy({
        projectId: route.projectId,
        environmentId: route.environmentId || "production",
        resourceId: route.resourceId,
      });
      await load();
    } catch {
      actionError = true;
    } finally {
      actionPending = false;
    }
  }

  function activityLabel(value?: string): string {
    if (!value) return "—";
    return new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function availableMaximumWidth(): number {
    return browser
      ? Math.max(minimumPanelWidth, Math.min(maximumPanelWidth, innerWidth - 280))
      : maximumPanelWidth;
  }

  function setPanelWidth(nextWidth: number): void {
    panelWidth = Math.round(
      Math.min(availableMaximumWidth(), Math.max(minimumPanelWidth, nextWidth)),
    );
    if (browser) localStorage.setItem(panelWidthStorageKey, String(panelWidth));
  }

  function beginPanelResize(event: PointerEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;

    const move = (moveEvent: PointerEvent) => {
      setPanelWidth(startWidth + startX - moveEvent.clientX);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function resizeWithKeyboard(event: KeyboardEvent): void {
    const step = event.shiftKey ? 48 : 16;
    const nextWidth =
      event.key === "ArrowLeft"
        ? panelWidth + step
        : event.key === "ArrowRight"
          ? panelWidth - step
          : event.key === "Home"
            ? minimumPanelWidth
            : event.key === "End"
              ? availableMaximumWidth()
              : undefined;

    if (nextWidth === undefined) return;
    event.preventDefault();
    setPanelWidth(nextWidth);
  }

  onMount(() => {
    const savedWidth = Number(localStorage.getItem(panelWidthStorageKey));
    if (Number.isFinite(savedWidth) && savedWidth > 0) setPanelWidth(savedWidth);
  });

  $effect(() => {
    route.projectId;
    route.environmentId;
    route.resourceId;
    if (route.destination === "overview") {
      void load();
    } else {
      latestRequest += 1;
      overview = undefined;
      loading = false;
      error = false;
    }
  });

  const labels: Record<ResourceDestination, string> = {
    overview: i18n.t(copy.nav.overview),
    deployments: i18n.t(copy.nav.deployments),
    configuration: i18n.t(copy.nav.configuration),
    "logs-metrics": i18n.t(copy.nav.logsMetrics),
    networking: i18n.t(copy.nav.networking),
    settings: i18n.t(copy.nav.settings),
  };
</script>

<aside
  class="fixed inset-0 z-40 flex bg-background lg:bottom-3 lg:left-auto lg:right-3 lg:top-[76px] lg:w-[min(var(--dashboard-panel-width),calc(100vw-280px))] lg:overflow-visible lg:rounded-[18px] lg:border lg:border-divider lg:bg-surface-overlay lg:shadow-[var(--shadow-overlay)]"
  style:--dashboard-panel-width={`${panelWidth}px`}
>
  <input
    data-resource-panel-resize
    type="range"
    class="peer absolute inset-y-4 left-0 z-10 hidden h-auto w-3 -translate-x-1/2 cursor-ew-resize appearance-none rounded-full border-0 bg-transparent p-0 opacity-0 outline-none lg:block"
    aria-label={i18n.t(copy.actions.resizeResourcePanel)}
    min={minimumPanelWidth}
    max={availableMaximumWidth()}
    value={panelWidth}
    onpointerdown={beginPanelResize}
    onkeydown={resizeWithKeyboard}
  />
  <span
    aria-hidden="true"
    class="pointer-events-none absolute inset-y-4 left-0 z-10 hidden w-px -translate-x-1/2 rounded-full bg-transparent transition-colors peer-hover:bg-primary/40 peer-focus-visible:w-0.5 peer-focus-visible:bg-primary lg:block"
  ></span>
  <div class="flex min-w-0 flex-1 flex-col lg:overflow-hidden lg:rounded-[17px]">
    <header class="border-b border-divider px-5 pb-0 pt-5 sm:px-6 sm:pt-6">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span data-icon-surface="blue" class="grid size-8 place-items-center rounded-[9px] bg-icon-blue text-icon-blue-foreground">
              <Rocket class="size-4" />
            </span>
            <h2 class="truncate text-lg font-semibold tracking-[-0.015em]">{overview?.resource.name || route.resourceId}</h2>
          </div>
          <p class="mt-2 max-w-xl text-sm text-muted-foreground">{i18n.t(copy.resource.description)}</p>
        </div>
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="icon" class="size-9 rounded-[9px]" aria-label={i18n.t(copy.actions.moreOptions)}>
            <MoreHorizontal class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-9 rounded-[9px]"
            href={projectDestinationHref(route.projectId, "overview", route.environmentId, {
              view: route.view,
              search: route.search,
              sort: route.sort,
              cursor: route.cursor,
              filters: route.filters,
            })}
            aria-label={i18n.t(copy.actions.closeResource)}
          >
            <X class="size-4" />
          </Button>
        </div>
      </div>
      <nav class="mt-6 flex gap-5 overflow-x-auto" aria-label="Resource">
        {#each resourceNavigation as item}
          <a
            class={`relative shrink-0 pb-3 text-sm transition-colors ${route.destination === item.id ? "font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary" : "text-muted-foreground hover:text-foreground"}`}
            href={resourceDestinationHref(route.projectId, route.resourceId, item.id, route.environmentId, {
              view: route.view,
              search: route.search,
              sort: route.sort,
              cursor: route.cursor,
              filters: route.filters,
            })}
            aria-current={route.destination === item.id ? "page" : undefined}
          >{labels[item.id]}</a>
        {/each}
      </nav>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
      {#if route.destination === "overview" && loading}
        <div class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface" aria-label="Loading resource">
          <LoaderCircle class="size-6 animate-spin text-primary" />
        </div>
      {:else if route.destination === "overview" && (error || !overview)}
        <section class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center">
          <TriangleAlert class="mx-auto size-6 text-destructive" />
          <h3 class="mt-4 font-semibold">{i18n.t(copy.projects.loadError)}</h3>
          <p class="mt-2 text-sm text-muted-foreground">{i18n.t(copy.projects.loadErrorDescription)}</p>
          <Button variant="outline" class="mt-5 h-9 rounded-[9px] shadow-none" onclick={() => void load()}>
            <RefreshCw class="size-4" />
            {i18n.t(copy.actions.retry)}
          </Button>
        </section>
      {:else if route.destination === "overview" && overview}
        <div class="grid gap-4 sm:grid-cols-2">
          <section class="rounded-[14px] border border-divider bg-surface p-5">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-medium text-muted-foreground">{i18n.t(copy.resource.activeDeployment)}</p>
              <Badge variant="secondary" class={`rounded-full ${overview.health.status === "healthy" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{overview.health.status}</Badge>
            </div>
            <div class="mt-6 flex items-center gap-3">
              <GitCommitHorizontal class="size-4 text-muted-foreground" />
              <code class="truncate text-sm font-medium">{overview.latestDeployments[0]?.id || "—"}</code>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">{overview.latestDeployments[0]?.status || "not deployed"} · {activityLabel(overview.latestDeployments[0]?.createdAt)}</p>
          </section>
          <section class="rounded-[14px] border border-divider bg-surface p-5">
            <p class="text-xs font-medium text-muted-foreground">{i18n.t(copy.resource.runtime)}</p>
            <div class="mt-6 flex items-center gap-2">
              <span class={`size-2 rounded-full ${overview.health.status === "healthy" ? "bg-emerald-500" : "bg-amber-500"}`}></span>
              <p class="text-sm font-medium capitalize">{overview.health.status.replaceAll("-", " ")}</p>
            </div>
            <p class="mt-2 text-xs capitalize text-muted-foreground">{overview.resource.kind.replaceAll("-", " ")} · {overview.configuration.status}</p>
          </section>
        </div>

        <section class="mt-4 overflow-hidden rounded-[14px] border border-emerald-500/20 bg-emerald-500/[0.055]">
          <div class="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-start gap-3">
              <span class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 class="size-[18px]" />
              </span>
              <div>
                <h3 class="text-sm font-semibold">{overview.latestDeployments[0]?.status === "succeeded" ? i18n.t(copy.resource.deploymentSuccessful) : overview.latestDeployments[0]?.status || "No deployment yet"}</h3>
                <p class="mt-1 text-xs text-muted-foreground">{activityLabel(overview.latestDeployments[0]?.finishedAt || overview.latestDeployments[0]?.createdAt)}</p>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              {#if overview.capabilities.deploy}
                <Button
                  class="h-9 rounded-[9px] px-3 text-xs"
                  disabled={actionPending}
                  onclick={() => void forceRedeploy()}
                >
                  {actionPending
                    ? i18n.t(commonCopy.actions.redeploying)
                    : i18n.t(commonCopy.actions.redeploy)}
                </Button>
              {/if}
              <Button
                variant="outline"
                class="h-9 rounded-[9px] bg-transparent px-3 text-xs shadow-none"
                href={resourceDestinationHref(route.projectId, route.resourceId, "logs-metrics", route.environmentId, {
                  view: route.view,
                  search: route.search,
                  sort: route.sort,
                  cursor: route.cursor,
                  filters: route.filters,
                })}
              >
                {i18n.t(copy.actions.viewLogs)}
                <ExternalLink class="size-3.5" />
              </Button>
            </div>
          </div>
        </section>

        {#if actionError}
          <p class="mt-3 rounded-[10px] border border-destructive/20 bg-destructive/[0.04] px-3 py-2 text-xs text-destructive">
            {i18n.t(copy.projects.loadErrorDescription)}
          </p>
        {/if}

        <section class="mt-4 rounded-[14px] border border-divider bg-surface p-5">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-xs font-medium text-muted-foreground">{i18n.t(copy.resource.publicAccess)}</p>
              {#if overview.access.url}
                <a class="mt-2 inline-flex items-center gap-2 break-all text-sm font-medium text-primary hover:underline" href={overview.access.url} target="_blank" rel="noreferrer">
                  {overview.access.url}
                  <ExternalLink class="size-3.5 shrink-0" />
                </a>
              {:else}
                <p class="mt-2 text-sm text-muted-foreground">{overview.access.status}</p>
              {/if}
            </div>
            <span class="grid size-10 place-items-center rounded-[11px] bg-primary/10 text-primary">
              <Globe2 class="size-[18px]" />
            </span>
          </div>
        </section>
      {:else if route.destination === "deployments"}
        {#await import("./ResourceDeployments.svelte")}
          <div class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface">
            <LoaderCircle class="size-6 animate-spin text-primary" />
          </div>
        {:then module}
          {@const Destination = module.default}
          <Destination {route} />
        {:catch}
          <p class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-5 text-sm text-destructive">
            {i18n.t(copy.projects.loadErrorDescription)}
          </p>
        {/await}
      {:else if route.destination === "configuration"}
        {#await import("./ResourceConfiguration.svelte")}
          <div class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface">
            <LoaderCircle class="size-6 animate-spin text-primary" />
          </div>
        {:then module}
          {@const Destination = module.default}
          <Destination {route} />
        {:catch}
          <p class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-5 text-sm text-destructive">
            {i18n.t(copy.projects.loadErrorDescription)}
          </p>
        {/await}
      {:else if route.destination === "logs-metrics"}
        {#await import("./ResourceObservability.svelte")}
          <div class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface">
            <LoaderCircle class="size-6 animate-spin text-primary" />
          </div>
        {:then module}
          {@const Destination = module.default}
          <Destination {route} />
        {:catch}
          <p class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-5 text-sm text-destructive">
            {i18n.t(copy.projects.loadErrorDescription)}
          </p>
        {/await}
      {:else if route.destination === "networking"}
        {#await import("./ResourceNetworking.svelte")}
          <div class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface">
            <LoaderCircle class="size-6 animate-spin text-primary" />
          </div>
        {:then module}
          {@const Destination = module.default}
          <Destination {route} />
        {:catch}
          <p class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-5 text-sm text-destructive">
            {i18n.t(copy.projects.loadErrorDescription)}
          </p>
        {/await}
      {:else if route.destination === "settings"}
        {#await import("./ResourceSettings.svelte")}
          <div class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface">
            <LoaderCircle class="size-6 animate-spin text-primary" />
          </div>
        {:then module}
          {@const Destination = module.default}
          <Destination {route} />
        {:catch}
          <p class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-5 text-sm text-destructive">
            {i18n.t(copy.projects.loadErrorDescription)}
          </p>
        {/await}
      {:else}
        <section class="min-h-64 rounded-[14px] border border-divider bg-surface p-5">
          <span class="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {i18n.t(copy.shell.foundationPreview)}
          </span>
          <h3 class="mt-6 text-lg font-semibold">{labels[route.destination]}</h3>
          <p class="mt-2 max-w-lg text-sm text-muted-foreground">{i18n.t(copy.resource.description)}</p>
        </section>
      {/if}
      <ScopedExtensions {route} />
    </div>
  </div>
</aside>

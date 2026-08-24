<script lang="ts">
  import { browser } from "$app/environment";
  import { Badge } from "@appaloft/ui/badge";
  import { Button } from "@appaloft/ui/button";
  import {
    CheckCircle2,
    ExternalLink,
    GitCommitHorizontal,
    Globe2,
    MoreHorizontal,
    Rocket,
    X,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

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

  let { route }: { route: Extract<DashboardRoute, { kind: "resource" }> } = $props();

  const minimumPanelWidth = 480;
  const maximumPanelWidth = 960;
  const panelWidthStorageKey = "appaloft.dashboard.resource-panel-width";
  let panelWidth = $state(736);

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
            <span class="grid size-8 place-items-center rounded-[9px] bg-primary text-primary-foreground">
              <Rocket class="size-4" />
            </span>
            <h2 class="truncate text-lg font-semibold tracking-[-0.015em]">{route.resourceId}</h2>
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
            href={projectDestinationHref(route.projectId, "overview", route.environmentId)}
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
            href={resourceDestinationHref(route.projectId, route.resourceId, item.id, route.environmentId)}
            aria-current={route.destination === item.id ? "page" : undefined}
          >{labels[item.id]}</a>
        {/each}
      </nav>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
      {#if route.destination === "overview"}
        <div class="grid gap-4 sm:grid-cols-2">
          <section class="rounded-[14px] border border-divider bg-surface p-5">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-medium text-muted-foreground">{i18n.t(copy.resource.activeDeployment)}</p>
              <Badge variant="secondary" class="rounded-full border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">{i18n.t(commonCopy.status.active)}</Badge>
            </div>
            <div class="mt-6 flex items-center gap-3">
              <GitCommitHorizontal class="size-4 text-muted-foreground" />
              <code class="text-sm font-medium">3f8a1c2</code>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">main · 8 min ago</p>
          </section>
          <section class="rounded-[14px] border border-divider bg-surface p-5">
            <p class="text-xs font-medium text-muted-foreground">{i18n.t(copy.resource.runtime)}</p>
            <div class="mt-6 flex items-center gap-2">
              <span class="size-2 rounded-full bg-emerald-500"></span>
              <p class="text-sm font-medium">{i18n.t(copy.resource.onlineReplicas, { count: 1 })}</p>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">Docker · US East</p>
          </section>
        </div>

        <section class="mt-4 overflow-hidden rounded-[14px] border border-emerald-500/20 bg-emerald-500/[0.055]">
          <div class="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-start gap-3">
              <span class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 class="size-[18px]" />
              </span>
              <div>
                <h3 class="text-sm font-semibold">{i18n.t(copy.resource.deploymentSuccessful)}</h3>
                <p class="mt-1 text-xs text-muted-foreground">CLI preview · deployed from main</p>
              </div>
            </div>
            <Button variant="outline" class="h-9 rounded-[9px] bg-transparent px-3 text-xs shadow-none">
              {i18n.t(copy.actions.viewLogs)}
              <ExternalLink class="size-3.5" />
            </Button>
          </div>
        </section>

        <section class="mt-4 rounded-[14px] border border-divider bg-surface p-5">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-xs font-medium text-muted-foreground">{i18n.t(copy.resource.publicAccess)}</p>
              <a class="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" href="https://example.test">
                api-gateway.appaloft.app
                <ExternalLink class="size-3.5" />
              </a>
            </div>
            <span class="grid size-10 place-items-center rounded-[11px] bg-primary/10 text-primary">
              <Globe2 class="size-[18px]" />
            </span>
          </div>
        </section>
      {:else}
        <section class="min-h-64 rounded-[14px] border border-divider bg-surface p-5">
          <span class="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {i18n.t(copy.shell.foundationPreview)}
          </span>
          <h3 class="mt-6 text-lg font-semibold">{labels[route.destination]}</h3>
          <p class="mt-2 max-w-lg text-sm text-muted-foreground">{i18n.t(copy.resource.description)}</p>
        </section>
      {/if}
    </div>
  </div>
</aside>

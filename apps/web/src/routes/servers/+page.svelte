<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    ArrowRight,
    Boxes,
    Check,
    CircleDashed,
    Clock,
    Gauge,
    GripVertical,
    Network,
    Pencil,
    Plus,
    Server,
    ShieldCheck,
    Terminal,
  } from "@lucide/svelte";
  import type { ServerSummary } from "@appaloft/contracts";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import Sortable from "sortablejs";

  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import ServerCreateForm from "$lib/components/console/ServerCreateForm.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { readErrorMessage } from "$lib/api/client";
  import { canRunProductQueries } from "$lib/console/auth-query-gate";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import { serverProviderDisplayLabel } from "$lib/console/server-registration";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const serverPageSize = 12;
  let serverOffset = $state(0);
  let activeServerId = $state<string | null>(null);
  let serverListElement = $state<HTMLElement | null>(null);
  let serverSortable: Sortable | null = null;
  let serverSortableRectSnapshot = new Map<string, SortableRowRect>();
  let serverSortSnapshot = $state<ServerSummary[] | null>(null);
  let serverOptimisticOrderIds = $state<string[] | null>(null);
  let serverSortMode = $state(false);
  let serverReorderError = $state("");
  let visibleServers = $state<ServerSummary[]>([]);

  type SortableRowRect = {
    left: number;
    top: number;
  };

  function captureSortableRowRects(root: HTMLElement): Map<string, SortableRowRect> {
    return new Map(
      Array.from(root.querySelectorAll<HTMLElement>("[data-server-row]"))
        .map((row) => {
          const serverId = row.getAttribute("data-server-id");
          if (!serverId) {
            return null;
          }

          const rect = row.getBoundingClientRect();
          return [serverId, { left: rect.left, top: rect.top }] as const;
        })
        .filter((entry): entry is readonly [string, SortableRowRect] => Boolean(entry)),
    );
  }

  function animateSortableRowMovement(previousRects: Map<string, SortableRowRect>): void {
    if (!serverListElement || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    for (const row of serverListElement.querySelectorAll<HTMLElement>("[data-server-row]")) {
      const serverId = row.getAttribute("data-server-id");
      if (!serverId || serverId === activeServerId) {
        continue;
      }

      const previousRect = previousRects.get(serverId);
      if (!previousRect) {
        continue;
      }

      const currentRect = row.getBoundingClientRect();
      const offsetX = previousRect.left - currentRect.left;
      const offsetY = previousRect.top - currentRect.top;
      if (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1) {
        continue;
      }

      row.animate(
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

  const { authSessionQuery, deploymentsQuery } = createConsoleQueries(browser, { servers: false });
  const serversQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers", { limit: serverPageSize, offset: serverOffset }],
      queryFn: () => orpcClient.servers.list({ limit: serverPageSize, offset: serverOffset }),
      enabled: browser && canRunProductQueries(authSessionQuery.data),
    }),
  );
  const servers = $derived(serversQuery.data?.items ?? []);
  const serverQueryOrderKey = $derived(servers.map((server) => server.id).join("|"));
  const serverVisibleOrderKey = $derived(visibleServers.map((server) => server.id).join("|"));
  const serverOptimisticOrderKey = $derived(serverOptimisticOrderIds?.join("|") ?? "");
  const serverTotal = $derived(serversQuery.data?.total ?? servers.length);
  const serverPageStart = $derived(serverTotal > 0 ? serverOffset + 1 : 0);
  const serverPageEnd = $derived(Math.min(serverOffset + visibleServers.length, serverTotal));
  const canGoPrevious = $derived(serverOffset > 0);
  const canGoNext = $derived(serverOffset + serverPageSize < serverTotal);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(serversQuery.isPending || deploymentsQuery.isPending);
  let serverCreateDialogOpen = $state(false);

  const reorderServersMutation = createMutation(() => ({
    mutationFn: ({
      serverIds,
    }: {
      serverIds: string[];
      rollbackServers: ServerSummary[];
    }) =>
      orpcClient.servers.reorder({
        serverIds,
        startOffset: serverOffset,
      }),
    onSuccess: () => {
      serverReorderError = "";
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (error, variables) => {
      visibleServers = [...variables.rollbackServers];
      serverOptimisticOrderIds = null;
      serverReorderError = readErrorMessage(error);
    },
  }));

  $effect(() => {
    if (serverOptimisticOrderKey && serverOptimisticOrderKey !== serverQueryOrderKey) {
      return;
    }

    serverOptimisticOrderIds = null;
    if (!activeServerId && serverQueryOrderKey !== serverVisibleOrderKey) {
      visibleServers = servers;
    }
  });

  $effect(() => {
    if (!browser || !serverSortMode || reorderServersMutation.isPending || !serverListElement) {
      serverSortable?.destroy();
      serverSortable = null;
      return;
    }

    serverSortable?.destroy();
    const listElement = serverListElement;
    serverSortable = Sortable.create(listElement, {
      animation: 220,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
      handle: "[data-server-reorder-handle]",
      draggable: "[data-server-row]",
      dataIdAttr: "data-server-id",
      ghostClass: "console-sortable-ghost",
      chosenClass: "console-sortable-chosen",
      dragClass: "console-sortable-drag",
      fallbackClass: "console-sortable-fallback",
      direction: "vertical",
      swapThreshold: 0.5,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 4,
      onStart: (event: Sortable.SortableEvent) => {
        activeServerId = event.item.getAttribute("data-server-id");
        serverSortSnapshot = [...visibleServers];
        serverSortableRectSnapshot = captureSortableRowRects(listElement);
      },
      onMove: () => {
        serverSortableRectSnapshot = captureSortableRowRects(listElement);
        return true;
      },
      onChange: () => {
        animateSortableRowMovement(serverSortableRectSnapshot);
        serverSortableRectSnapshot = captureSortableRowRects(listElement);
      },
      onEnd: () => {
        commitServerSort(serverSortable?.toArray() ?? []);
      },
    });

    return () => {
      serverSortable?.destroy();
      serverSortable = null;
    };
  });

  $effect(() => {
    if (serverSortable && serverVisibleOrderKey && !activeServerId) {
      serverSortable.sort(visibleServers.map((server) => server.id), true);
    }
  });

  $effect(() => {
    serverCreateDialogOpen = modalIsOpen(page, "create-server");
  });

  function countServerDeployments(server: ServerSummary): number {
    return deployments.filter((deployment) => deployment.serverId === server.id).length;
  }

  function serverDetailHref(serverId: string): string {
    return `/servers/${encodeURIComponent(serverId)}`;
  }

  function serverRuntimeHref(serverId: string): string {
    return `${serverDetailHref(serverId)}?tab=runtime`;
  }

  function serverConnectivityHref(serverId: string): string {
    return `${serverDetailHref(serverId)}?tab=connectivity`;
  }

  function serverCapacityHref(serverId: string): string {
    return `${serverDetailHref(serverId)}?tab=capacity`;
  }

  function serverDeploymentsHref(serverId: string): string {
    return `${serverDetailHref(serverId)}?tab=deployments`;
  }

  function serverLifecycleLabel(status: ServerSummary["lifecycleStatus"]): string {
    switch (status) {
      case "active":
        return $t(i18nKeys.common.status.active);
      case "inactive":
        return $t(i18nKeys.common.status.inactive);
    }
  }

  function serverLifecycleVariant(
    status: ServerSummary["lifecycleStatus"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "active":
        return "secondary";
      case "inactive":
        return "outline";
    }
  }

  function edgeProxyStatusLabel(status: NonNullable<ServerSummary["edgeProxy"]>["status"]): string {
    switch (status) {
      case "pending":
        return $t(i18nKeys.common.status.requested);
      case "starting":
        return $t(i18nKeys.common.status.starting);
      case "ready":
        return $t(i18nKeys.common.status.ready);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      case "disabled":
        return $t(i18nKeys.common.status.notConfigured);
    }
  }

  function edgeProxyStatusVariant(
    status: NonNullable<ServerSummary["edgeProxy"]>["status"] | undefined,
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "ready":
        return "secondary";
      case "failed":
        return "destructive";
      case "starting":
      case "pending":
        return "secondary";
      case "disabled":
      default:
        return "outline";
    }
  }

  function runtimeAvailabilityLabel(status: ServerSummary["runtimeAvailability"]): string {
    if (!status) {
      return $t(i18nKeys.common.status.unknown);
    }

    switch (status.status) {
      case "available":
        return $t(i18nKeys.common.status.ready);
      case "unavailable":
        return $t(i18nKeys.common.status.unreachable);
    }
  }

  function runtimeAvailabilityVariant(
    status: ServerSummary["runtimeAvailability"],
  ): "default" | "secondary" | "outline" | "destructive" {
    if (!status) {
      return "outline";
    }

    switch (status.status) {
      case "available":
        return "secondary";
      case "unavailable":
        return "destructive";
    }
  }

  function edgeProxyKindLabel(server: ServerSummary): string {
    return server.edgeProxy?.kind ?? $t(i18nKeys.common.status.notConfigured);
  }

  function openServerCreateDialog(): void {
    void setModalOpen(page, "create-server", true);
  }

  function setServerCreateDialogOpen(open: boolean): void {
    serverCreateDialogOpen = open;
    void setModalOpen(page, "create-server", open);
  }

  function openCreatedServer(server: { id: string }): void {
    void goto(serverDetailHref(server.id));
  }

  function setServerPage(nextOffset: number): void {
    serverSortMode = false;
    activeServerId = null;
    serverSortSnapshot = null;
    serverOffset = Math.max(0, nextOffset);
  }

  function setServerSortMode(enabled: boolean): void {
    if (reorderServersMutation.isPending) {
      return;
    }

    serverSortMode = enabled;
    activeServerId = null;
    serverSortSnapshot = null;
  }

  function commitServerSort(serverIds: string[]): void {
    const rollbackServers = serverSortSnapshot ?? visibleServers;
    const rollbackIds = rollbackServers.map((server) => server.id);
    const serverById = new Map(visibleServers.map((server) => [server.id, server]));
    const nextServers = serverIds
      .map((serverId) => serverById.get(serverId))
      .filter((server): server is ServerSummary => Boolean(server));

    if (nextServers.length !== visibleServers.length) {
      serverSortable?.sort(rollbackIds, true);
      activeServerId = null;
      serverSortSnapshot = null;
      return;
    }

    const changed = serverIds.join("|") !== rollbackIds.join("|");
    if (changed) {
      visibleServers = nextServers;
      serverOptimisticOrderIds = serverIds;
      reorderServersMutation.mutate({ serverIds, rollbackServers });
    }

    activeServerId = null;
    serverSortSnapshot = null;
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.servers.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.servers.pageTitle)}
  description={$t(i18nKeys.console.servers.description)}
>
  <ConsoleResourceCanvas data-servers-display-surface>
    <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
      <div class="max-w-2xl space-y-2">
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.servers.focusTitle)}</h1>
          <DocsHelpLink
            href={webDocsHrefs.serverDeploymentTarget}
            ariaLabel={$t(i18nKeys.common.actions.openDocs)}
          />
        </div>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.servers.focusDescription)}
        </p>
      </div>
      {#if !pageLoading && visibleServers.length > 0}
        <div class="flex shrink-0 flex-wrap items-center gap-2 self-start">
          <Button type="button" onclick={openServerCreateDialog}>
            <Plus class="size-4" />
            {$t(i18nKeys.common.actions.createServer)}
          </Button>
          <Button
            type="button"
            variant={serverSortMode ? "selected" : "outline"}
            disabled={reorderServersMutation.isPending}
            onclick={() => setServerSortMode(!serverSortMode)}
            data-server-sort-toggle
          >
            {#if serverSortMode}
              <Check class="size-4" />
              {$t(i18nKeys.common.actions.done)}
            {:else}
              <Pencil class="size-4" />
              {$t(i18nKeys.common.actions.edit)}
            {/if}
          </Button>
        </div>
      {/if}
    </section>

    {#if pageLoading}
      <section class="space-y-3" data-server-list-skeleton>
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="space-y-2">
            <Skeleton class="h-5 w-32" />
            <Skeleton class="h-4 w-64 max-w-full" />
          </div>
          <Skeleton class="h-4 w-28" />
        </div>

        <div class="grid gap-3">
          {#each Array.from({ length: 3 }) as _, index (index)}
            <article
              class="rounded-md border bg-card p-4 shadow-sm lg:grid lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-start lg:gap-x-4"
            >
              <div class="min-w-0">
                <div class="flex min-w-0 items-start gap-3">
                  <div class="min-w-0 space-y-2">
                    <div class="flex min-w-0 items-center gap-2">
                      <Skeleton class="size-4 shrink-0 rounded-sm" />
                      <Skeleton class="h-5 w-36" />
                      <Skeleton class="h-5 w-14 rounded-sm" />
                    </div>
                    <Skeleton class="h-4 w-48 max-w-full" />
                  </div>
                </div>
              </div>

              <div class="mt-4 grid min-w-0 gap-2 sm:grid-cols-3 lg:col-span-2">
                {#each Array.from({ length: 3 }) as _, cardIndex (`${index}-${cardIndex}`)}
                  <div class="grid min-w-0 gap-2 rounded-md border bg-background/60 px-3 py-2">
                    <div class="flex min-w-0 items-center justify-between gap-3">
                      <div class="inline-flex min-w-0 items-center gap-2">
                        <Skeleton class="size-3.5 shrink-0 rounded-sm" />
                        <Skeleton class="h-4 w-20" />
                      </div>
                      <Skeleton class="h-5 w-14 rounded-sm" />
                    </div>
                    <Skeleton class="h-4 w-full" />
                  </div>
                {/each}
              </div>

              <div
                class="mt-3 grid min-w-0 gap-x-4 gap-y-2 border-t pt-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4"
              >
                {#each Array.from({ length: 4 }) as _, metaIndex (`${index}-${metaIndex}`)}
                  <div class="inline-flex min-w-0 items-center gap-2">
                    <Skeleton class="size-3.5 shrink-0 rounded-sm" />
                    <Skeleton class="h-4 w-28" />
                  </div>
                {/each}
              </div>

              <div
                class="mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:border-t-0 lg:pt-0"
              >
                <Skeleton class="h-8 w-20 rounded-md" />
                <Skeleton class="h-8 w-24 rounded-md" />
                <Skeleton class="h-8 w-24 rounded-md" />
              </div>
            </article>
          {/each}
        </div>
      </section>
    {:else if visibleServers.length === 0}
      <ConsoleEmptyState
        tone="server"
        title={$t(i18nKeys.console.servers.emptyTitle)}
        description={$t(i18nKeys.console.servers.emptyBody)}
        actionLabel={$t(i18nKeys.common.actions.createServer)}
        learnMoreHref={webDocsHrefs.serverDeploymentTarget}
        onAction={openServerCreateDialog}
      />
    {:else}
        <section class="space-y-3">
          <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.servers.listTitle)}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.listDescription)}
              </p>
            </div>
            <div
              class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
              data-server-pagination
            >
              <span>
                {$t(i18nKeys.console.servers.listRange, {
                  start: serverPageStart,
                  end: serverPageEnd,
                  total: serverTotal,
                })}
              </span>
              <div class="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canGoPrevious || serverSortMode || reorderServersMutation.isPending}
                  onclick={() => setServerPage(serverOffset - serverPageSize)}
                >
                  {$t(i18nKeys.common.actions.previous)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canGoNext || serverSortMode || reorderServersMutation.isPending}
                  onclick={() => setServerPage(serverOffset + serverPageSize)}
                >
                  {$t(i18nKeys.common.actions.next)}
                </Button>
              </div>
            </div>
          </div>

          {#if serverReorderError}
            <p class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {serverReorderError}
            </p>
          {/if}

          <div class="grid gap-3" bind:this={serverListElement} data-server-list>
            {#each visibleServers as server (server.id)}
              <article
                class={[
                  "group relative min-w-0 rounded-md border bg-card p-4 shadow-sm transition-colors lg:grid lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-start lg:gap-x-4",
                  serverSortMode ? "select-none" : "",
                  activeServerId === server.id
                    ? "border-primary/60 bg-primary/5 opacity-80"
                    : "hover:border-primary/30 hover:bg-muted/20",
                ]}
                data-server-row
                data-server-id={server.id}
              >
                <div class="min-w-0" data-server-row-header>
                  <div class="flex min-w-0 items-start gap-3">
                    <div class="min-w-0 space-y-1">
                      <div class="flex min-w-0 items-center gap-2">
                        {#if serverSortMode}
                          <button
                            type="button"
                            class="inline-flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground transition hover:text-foreground active:cursor-grabbing"
                            aria-label={$t(i18nKeys.console.servers.reorderHandle)}
                            title={$t(i18nKeys.console.servers.reorderHandle)}
                            disabled={reorderServersMutation.isPending}
                            data-server-reorder-handle
                          >
                            <GripVertical class="size-3.5" />
                          </button>
                        {/if}
                        <Server class="size-4 shrink-0 text-muted-foreground" />
                        <h3 class="min-w-0 truncate text-base font-semibold">{server.name}</h3>
                        <Badge
                          class="shrink-0"
                          variant={serverLifecycleVariant(server.lifecycleStatus)}
                          data-server-row-lifecycle
                        >
                          {serverLifecycleLabel(server.lifecycleStatus)}
                        </Badge>
                      </div>
                      <p
                        class="truncate font-mono text-sm text-muted-foreground"
                        title={`${server.host}:${server.port}`}
                      >
                        {server.host}:{server.port}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  class="mt-4 grid min-w-0 gap-2 text-sm sm:grid-cols-3 lg:col-span-2"
                  data-server-row-readiness
                >
                  <div class="grid min-w-0 gap-1 rounded-md border bg-background/60 px-3 py-2">
                    <div class="flex min-w-0 items-center justify-between gap-3">
                      <span class="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
                        <Network class="size-3.5 shrink-0" />
                        <span class="truncate">{$t(i18nKeys.console.servers.connectivitySurfaceTitle)}</span>
                      </span>
                      <Badge variant={runtimeAvailabilityVariant(server.runtimeAvailability)}>
                        {runtimeAvailabilityLabel(server.runtimeAvailability)}
                      </Badge>
                    </div>
                    <p
                      class="line-clamp-2 text-xs leading-5 text-muted-foreground"
                      title={server.runtimeAvailability?.message ??
                        $t(i18nKeys.console.servers.connectivitySurfaceDescription)}
                    >
                      {server.runtimeAvailability?.message ??
                        $t(i18nKeys.console.servers.connectivitySurfaceDescription)}
                    </p>
                  </div>

                  <div
                    class="grid min-w-0 gap-1 rounded-md border bg-background/60 px-3 py-2"
                    data-server-row-proxy
                  >
                    <div class="flex min-w-0 items-center justify-between gap-3">
                      <span class="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
                        <ShieldCheck class="size-3.5 shrink-0" />
                        <span class="truncate">{$t(i18nKeys.common.domain.proxy)}</span>
                      </span>
                      <Badge variant={edgeProxyStatusVariant(server.edgeProxy?.status)}>
                        {server.edgeProxy
                          ? edgeProxyStatusLabel(server.edgeProxy.status)
                          : $t(i18nKeys.common.status.notConfigured)}
                      </Badge>
                    </div>
                    <p class="truncate text-xs text-muted-foreground" title={edgeProxyKindLabel(server)}>
                      {edgeProxyKindLabel(server)}
                    </p>
                  </div>

                  <div
                    class="grid min-w-0 gap-1 rounded-md border bg-background/60 px-3 py-2"
                    data-server-row-capacity
                  >
                    <div class="flex min-w-0 items-center justify-between gap-3">
                      <span class="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
                        <Gauge class="size-3.5 shrink-0" />
                        <span class="truncate">{$t(i18nKeys.console.servers.capacitySurfaceTitle)}</span>
                      </span>
                      <Badge variant="outline">{$t(i18nKeys.common.status.unknown)}</Badge>
                    </div>
                    <a
                      href={serverCapacityHref(server.id)}
                      class="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span class="truncate">{$t(i18nKeys.console.servers.capacityGovernanceAction)}</span>
                      <ArrowRight class="size-3 shrink-0" />
                    </a>
                  </div>
                </div>

                <div
                  class="mt-3 grid min-w-0 gap-x-4 gap-y-1 border-t pt-3 text-sm text-muted-foreground sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4"
                  data-server-row-ownership
                >
                  <span class="inline-flex min-w-0 items-center gap-2">
                    <Boxes class="size-3.5 shrink-0" />
                    <span class="truncate" title={server.targetKind}>
                      {server.targetKind}
                    </span>
                  </span>
                  <span class="inline-flex min-w-0 items-center gap-2">
                    <CircleDashed class="size-3.5 shrink-0" />
                    <span class="truncate" title={server.providerKey}>
                      {serverProviderDisplayLabel(
                        server.providerKey,
                        $t(i18nKeys.common.domain.server),
                      )}
                    </span>
                  </span>
                  <a
                    href={serverDeploymentsHref(server.id)}
                    class="inline-flex min-w-0 items-center gap-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-server-row-deployment-rollup
                  >
                    <Terminal class="size-3.5 shrink-0" />
                    <span class="truncate">
                      {countServerDeployments(server)} {$t(i18nKeys.common.domain.deployments)}
                    </span>
                  </a>
                  <span class="inline-flex min-w-0 items-center gap-2">
                    <Clock class="size-3.5 shrink-0 opacity-70" />
                    <span class="truncate">{formatTime(server.createdAt)}</span>
                  </span>
                </div>

                <div
                  class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:justify-end lg:border-t-0 lg:pt-0"
                >
                  <div class="flex flex-wrap items-center gap-2 md:justify-end" data-server-row-operational-links>
                    <Button href={serverRuntimeHref(server.id)} size="sm" variant="outline">
                      <Terminal class="size-3.5" />
                      {$t(i18nKeys.console.servers.runtimeTab)}
                    </Button>
                    <Button href={serverConnectivityHref(server.id)} size="sm" variant="outline">
                      <Network class="size-3.5" />
                      {$t(i18nKeys.console.servers.connectivityTab)}
                    </Button>
                    <Button href={serverDetailHref(server.id)} size="sm" variant="outline">
                      {$t(i18nKeys.common.actions.viewDetails)}
                      <ArrowRight class="size-3.5" />
                    </Button>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        </section>
    {/if}
  </ConsoleResourceCanvas>

  <Dialog.Root bind:open={serverCreateDialogOpen} onOpenChange={setServerCreateDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-5xl">
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.servers.createFormTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.servers.createFormDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <div class="px-5 pb-5">
        <ServerCreateForm
          idPrefix="servers-page-create"
          onCreated={openCreatedServer}
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

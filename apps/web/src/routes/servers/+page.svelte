<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    ArrowRight,
    Check,
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
  let serverGridElement = $state<HTMLElement | null>(null);
  let serverSortable: Sortable | null = null;
  let serverSortableRectSnapshot = new Map<string, SortableCardRect>();
  let serverSortSnapshot = $state<ServerSummary[] | null>(null);
  let serverOptimisticOrderIds = $state<string[] | null>(null);
  let serverSortMode = $state(false);
  let serverReorderError = $state("");
  let visibleServers = $state<ServerSummary[]>([]);

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
      Array.from(root.querySelectorAll<HTMLElement>("[data-server-card]"))
        .map((card) => {
          const serverId = card.getAttribute("data-server-id");
          if (!serverId) {
            return null;
          }

          const rect = card.getBoundingClientRect();
          return [serverId, { left: rect.left, top: rect.top }] as const;
        })
        .filter((entry): entry is readonly [string, SortableCardRect] => Boolean(entry)),
    );
  }

  function animateSortableCardMovement(previousRects: Map<string, SortableCardRect>): void {
    if (!serverGridElement || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    for (const card of serverGridElement.querySelectorAll<HTMLElement>("[data-server-card]")) {
      const serverId = card.getAttribute("data-server-id");
      if (!serverId || serverId === activeServerId) {
        continue;
      }

      const previousRect = previousRects.get(serverId);
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
    if (!browser || !serverSortMode || reorderServersMutation.isPending || !serverGridElement) {
      serverSortable?.destroy();
      serverSortable = null;
      return;
    }

    serverSortable?.destroy();
    const gridElement = serverGridElement;
    serverSortable = Sortable.create(gridElement, {
      animation: 220,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
      handle: "[data-server-reorder-handle]",
      draggable: "[data-server-card]",
      dataIdAttr: "data-server-id",
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
        activeServerId = event.item.getAttribute("data-server-id");
        serverSortSnapshot = [...visibleServers];
        serverSortableRectSnapshot = captureSortableCardRects(gridElement);
      },
      onMove: () => {
        serverSortableRectSnapshot = captureSortableCardRects(gridElement);
        return true;
      },
      onChange: () => {
        animateSortableCardMovement(serverSortableRectSnapshot);
        serverSortableRectSnapshot = captureSortableCardRects(gridElement);
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

  function serverTerminalHref(serverId: string): string {
    return `${serverDetailHref(serverId)}?tab=terminal`;
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
  {#if pageLoading}
    <div class="space-y-5">
      <section class="space-y-3">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="h-4 w-80" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 4 }) as _, index (index)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    </div>
  {:else}
    <ConsoleResourceCanvas>
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
        {#if visibleServers.length > 0}
          <div class="flex shrink-0 flex-wrap items-center gap-2 self-start">
            <Button type="button" onclick={openServerCreateDialog}>
              <Plus class="size-4" />
              {$t(i18nKeys.common.actions.createServer)}
            </Button>
            {#if visibleServers.length > 1}
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
            {/if}
          </div>
        {/if}
      </section>

      {#if visibleServers.length === 0}
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

          <div
            class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            bind:this={serverGridElement}
            data-server-grid
          >
            {#each visibleServers as server (server.id)}
              <article
                class={[
                  "group relative flex min-h-56 min-w-0 flex-col rounded-md border bg-card p-4 shadow-sm transition-colors",
                  serverSortMode ? "select-none" : "",
                  activeServerId === server.id
                    ? "border-primary/60 bg-primary/5 opacity-80"
                    : "hover:border-primary/30 hover:bg-muted/20",
                ]}
                data-server-card
                data-server-id={server.id}
              >
                {#if serverSortMode}
                  <button
                    type="button"
                    class="absolute right-3 top-3 z-10 inline-flex size-8 cursor-grab items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-foreground active:cursor-grabbing"
                    aria-label={$t(i18nKeys.console.servers.reorderHandle)}
                    title={$t(i18nKeys.console.servers.reorderHandle)}
                    disabled={reorderServersMutation.isPending}
                    data-server-reorder-handle
                  >
                    <GripVertical class="size-4" />
                  </button>
                {/if}
                <div class="min-w-0 space-y-2 pr-10" data-server-card-header>
                  <div class="flex min-w-0 items-center gap-2">
                    <Server class="size-4 shrink-0 text-muted-foreground" />
                    <h3 class="min-w-0 truncate text-base font-semibold">{server.name}</h3>
                  </div>
                  <p class="truncate font-mono text-sm text-muted-foreground" title={`${server.host}:${server.port}`}>
                    {server.host}:{server.port}
                  </p>
                </div>

                <div class="mt-5 grid gap-2 text-sm text-muted-foreground">
                  <span class="inline-flex min-w-0 items-center gap-2">
                    <Network class="size-3.5" />
                    <span class="truncate" title={server.providerKey}>
                      {serverProviderDisplayLabel(
                        server.providerKey,
                        $t(i18nKeys.common.domain.server),
                      )}
                    </span>
                  </span>
                  <span class="inline-flex items-center gap-2">
                    <ShieldCheck class="size-3.5" />
                    {countServerDeployments(server)} {$t(i18nKeys.common.domain.deployments)}
                  </span>
                  <span>{formatTime(server.createdAt)}</span>
                </div>

                <div class="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5">
                  <Button href={serverTerminalHref(server.id)} size="sm" variant="outline">
                    <Terminal class="size-3.5" />
                    {$t(i18nKeys.common.actions.openTerminal)}
                  </Button>
                  <a
                    href={serverDetailHref(server.id)}
                    class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {$t(i18nKeys.common.actions.viewDetails)}
                    <ArrowRight class="size-4" />
                  </a>
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
  {/if}
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

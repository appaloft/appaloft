<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    ArrowRight,
    GripVertical,
    Network,
    Plus,
    Server,
    ShieldCheck,
    Terminal,
  } from "@lucide/svelte";
  import type { ServerSummary } from "@appaloft/contracts";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

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
  let draggedServerId = $state<string | null>(null);
  let serverReorderError = $state("");

  const { authSessionQuery, deploymentsQuery } = createConsoleQueries(browser, { servers: false });
  const serversQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers", { limit: serverPageSize, offset: serverOffset }],
      queryFn: () => orpcClient.servers.list({ limit: serverPageSize, offset: serverOffset }),
      enabled: browser && canRunProductQueries(authSessionQuery.data),
    }),
  );
  const servers = $derived(serversQuery.data?.items ?? []);
  const serverTotal = $derived(serversQuery.data?.total ?? servers.length);
  const serverPageStart = $derived(serverTotal > 0 ? serverOffset + 1 : 0);
  const serverPageEnd = $derived(Math.min(serverOffset + servers.length, serverTotal));
  const canGoPrevious = $derived(serverOffset > 0);
  const canGoNext = $derived(serverOffset + serverPageSize < serverTotal);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(serversQuery.isPending || deploymentsQuery.isPending);
  let serverCreateDialogOpen = $state(false);

  const reorderServersMutation = createMutation(() => ({
    mutationFn: (serverIds: string[]) =>
      orpcClient.servers.reorder({
        serverIds,
        startOffset: serverOffset,
      }),
    onSuccess: () => {
      serverReorderError = "";
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (error) => {
      serverReorderError = readErrorMessage(error);
    },
  }));

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
    serverOffset = Math.max(0, nextOffset);
  }

  function reorderVisibleServers(targetServerId: string): void {
    if (!draggedServerId || draggedServerId === targetServerId) {
      draggedServerId = null;
      return;
    }

    const nextServers = [...servers];
    const fromIndex = nextServers.findIndex((server) => server.id === draggedServerId);
    const toIndex = nextServers.findIndex((server) => server.id === targetServerId);
    if (fromIndex < 0 || toIndex < 0) {
      draggedServerId = null;
      return;
    }

    const [moved] = nextServers.splice(fromIndex, 1);
    if (!moved) {
      draggedServerId = null;
      return;
    }

    nextServers.splice(toIndex, 0, moved);
    draggedServerId = null;
    reorderServersMutation.mutate(nextServers.map((server) => server.id));
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
        {#if servers.length > 0}
          <Button class="shrink-0 self-start" type="button" onclick={openServerCreateDialog}>
            <Plus class="size-4" />
            {$t(i18nKeys.common.actions.createServer)}
          </Button>
        {/if}
      </section>

      {#if servers.length === 0}
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
                  disabled={!canGoPrevious || reorderServersMutation.isPending}
                  onclick={() => setServerPage(serverOffset - serverPageSize)}
                >
                  {$t(i18nKeys.common.actions.previous)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canGoNext || reorderServersMutation.isPending}
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

          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-server-grid>
            {#each servers as server (server.id)}
              <article
                class={[
                  "group flex min-h-56 flex-col rounded-md border bg-card p-4 shadow-sm transition",
                  draggedServerId === server.id
                    ? "border-primary/60 bg-primary/5 opacity-80"
                    : "hover:border-primary/30 hover:bg-muted/20",
                ]}
                draggable={!reorderServersMutation.isPending}
                ondragstart={(event) => {
                  draggedServerId = server.id;
                  event.dataTransfer?.setData("text/plain", server.id);
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
                  reorderVisibleServers(server.id);
                }}
                ondragend={() => {
                  draggedServerId = null;
                }}
                data-server-card
                data-server-id={server.id}
              >
                <div class="flex items-start gap-3">
                  <button
                    type="button"
                    class="mt-0.5 inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-foreground active:cursor-grabbing"
                    aria-label={$t(i18nKeys.console.servers.reorderHandle)}
                    title={$t(i18nKeys.console.servers.reorderHandle)}
                    disabled={reorderServersMutation.isPending}
                    data-server-reorder-handle
                    onpointerdown={() => {
                      draggedServerId = server.id;
                    }}
                  >
                    <GripVertical class="size-4" />
                  </button>
                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="flex min-w-0 items-center gap-2">
                      <Server class="size-4 shrink-0 text-muted-foreground" />
                      <h3 class="min-w-0 truncate text-base font-semibold">{server.name}</h3>
                    </div>
                    <p class="break-all font-mono text-sm text-muted-foreground">
                      {server.host}:{server.port}
                    </p>
                  </div>
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

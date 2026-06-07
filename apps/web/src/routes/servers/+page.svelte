<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    Network,
    Plus,
    Server,
    ShieldCheck,
    Terminal,
  } from "@lucide/svelte";
  import type { ServerSummary } from "@appaloft/contracts";

  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import ServerCreateForm from "$lib/components/console/ServerCreateForm.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import { serverProviderDisplayLabel } from "$lib/console/server-registration";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { serversQuery, deploymentsQuery } = createConsoleQueries(browser);

  const servers = $derived(serversQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(serversQuery.isPending || deploymentsQuery.isPending);
  let serverCreateDialogOpen = $state(false);

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

  function eventComesFromInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      ? Boolean(target.closest("a, button, input, select, textarea, [role='button']"))
      : false;
  }

  function openServerDetailFromRow(serverId: string, event: MouseEvent): void {
    if (eventComesFromInteractiveTarget(event.target)) {
      return;
    }

    void goto(serverDetailHref(serverId));
  }

  function openServerDetailFromRowKeydown(serverId: string, event: KeyboardEvent): void {
    if (eventComesFromInteractiveTarget(event.target)) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    void goto(serverDetailHref(serverId));
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
          <div>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.servers.listTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.servers.listDescription)}
            </p>
          </div>

          <div class="console-record-list">
            {#each servers as server (server.id)}
              <div
                class="console-record-row group cursor-pointer transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[minmax(12rem,1.1fr)_minmax(10rem,0.9fr)_8rem_10rem_auto] lg:items-center"
                data-server-row={server.id}
                role="link"
                tabindex="0"
                aria-label={`${$t(i18nKeys.common.actions.viewDetails)} · ${server.name}`}
                onclick={(event) => openServerDetailFromRow(server.id, event)}
                onkeydown={(event) => openServerDetailFromRowKeydown(server.id, event)}
              >
                <div class="min-w-0 space-y-1.5">
                  <div class="flex min-w-0 items-center gap-2">
                    <Server class="size-4 text-muted-foreground" />
                    <h3 class="min-w-0 truncate text-base font-semibold">{server.name}</h3>
                  </div>
                  <p class="break-all font-mono text-sm text-muted-foreground">
                    {server.host}:{server.port}
                  </p>
                </div>

                <div class="min-w-0 space-y-1 text-sm text-muted-foreground">
                  <span class="inline-flex min-w-0 items-center gap-2">
                    <Network class="size-3.5 shrink-0" />
                    <span class="truncate" title={server.providerKey}>
                      {serverProviderDisplayLabel(
                        server.providerKey,
                        $t(i18nKeys.common.domain.server),
                      )}
                    </span>
                  </span>
                </div>

                <span class="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck class="size-3.5 shrink-0" />
                  {countServerDeployments(server)} {$t(i18nKeys.common.domain.deployments)}
                </span>

                <span class="text-sm text-muted-foreground">{formatTime(server.createdAt)}</span>

                <div class="flex flex-wrap justify-start gap-2 lg:justify-end">
                  <Button href={serverTerminalHref(server.id)} size="sm" variant="outline">
                    <Terminal class="size-3.5" />
                    {$t(i18nKeys.common.actions.openTerminal)}
                  </Button>
                </div>
              </div>
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

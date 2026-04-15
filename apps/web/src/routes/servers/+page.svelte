<script lang="ts">
  import { browser } from "$app/environment";
  import { ArrowRight, Network, Server, ShieldCheck } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import type { ServerSummary } from "@yundu/contracts";

  const { serversQuery, deploymentsQuery } = createConsoleQueries(browser);

  const servers = $derived(serversQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(serversQuery.isPending || deploymentsQuery.isPending);
  const activeServers = $derived(
    servers.filter((server) => countServerDeployments(server) > 0).length,
  );

  function countServerDeployments(server: ServerSummary): number {
    return deployments.filter((deployment) => deployment.serverId === server.id).length;
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.servers.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.servers.pageTitle)}
  description={$t(i18nKeys.console.servers.description)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <section class="rounded-lg border bg-background p-5">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="mt-3 h-4 w-80" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 4 }) as _, index (index)}
          <Skeleton class="h-24 w-full" />
        {/each}
      </div>
    </div>
  {:else if servers.length === 0}
    <section class="rounded-lg border bg-background p-6 md:p-8">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.common.domain.servers)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.servers.emptyTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.servers.emptyBody)}
        </p>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
        <Button href="/servers/new">
          {$t(i18nKeys.common.actions.createServer)}
        </Button>
        <Button href="/projects" variant="outline">
          {$t(i18nKeys.common.actions.viewProjects)}
        </Button>
        <Button href="/deployments" variant="outline">
          {$t(i18nKeys.common.actions.viewDeployments)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-5">
      <section
        class="flex flex-col gap-4 rounded-lg border bg-background p-5 md:flex-row md:items-center md:justify-between"
      >
        <div class="max-w-2xl space-y-2">
          <Badge class="w-fit" variant="outline">{$t(i18nKeys.common.domain.servers)}</Badge>
          <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.servers.focusTitle)}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.servers.focusDescription)}
          </p>
        </div>
        <div class="space-y-3 md:min-w-80">
          <Button class="w-full" href="/servers/new">
            {$t(i18nKeys.common.actions.createServer)}
          </Button>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div class="rounded-md border px-3 py-2">
              <p class="text-xl font-semibold">{servers.length}</p>
              <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.common.domain.servers)}</p>
            </div>
            <div class="rounded-md border px-3 py-2">
              <p class="text-xl font-semibold">{activeServers}</p>
              <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.common.status.connected)}</p>
            </div>
            <div class="rounded-md border px-3 py-2">
              <p class="text-xl font-semibold">{deployments.length}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {$t(i18nKeys.common.domain.deployments)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.servers.listTitle)}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.servers.listDescription)}
          </p>
        </div>

        <div class="space-y-3">
          {#each servers as server (server.id)}
            <a
              href={`/servers/${server.id}`}
              class="group block rounded-lg border bg-background p-4 transition-colors hover:border-foreground/30 hover:bg-muted/35"
            >
              <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div class="min-w-0 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <Server class="size-4 text-muted-foreground" />
                    <h3 class="truncate text-base font-semibold">{server.name}</h3>
                    <Badge variant="outline">{server.providerKey}</Badge>
                  </div>
                  <p class="truncate text-sm text-muted-foreground">
                    {server.host}:{server.port}
                  </p>
                </div>

                <div class="grid gap-3 sm:grid-cols-3 lg:min-w-[34rem]">
                  <div class="rounded-md border bg-background px-3 py-2">
                    <p class="flex items-center gap-2 text-xs text-muted-foreground">
                      <Network class="size-3.5" />
                      {$t(i18nKeys.common.domain.provider)}
                    </p>
                    <p class="mt-1 truncate text-sm font-medium">{server.providerKey}</p>
                  </div>
                  <div class="rounded-md border bg-background px-3 py-2">
                    <p class="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck class="size-3.5" />
                      {$t(i18nKeys.common.domain.deployments)}
                    </p>
                    <p class="mt-1 text-sm font-medium">{countServerDeployments(server)}</p>
                  </div>
                  <div class="rounded-md border bg-background px-3 py-2">
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.common.domain.createdAt)}
                    </p>
                    <p class="mt-1 truncate text-sm font-medium">{formatTime(server.createdAt)}</p>
                  </div>
                </div>

                <span
                  class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground"
                >
                  {$t(i18nKeys.common.actions.viewDetails)}
                  <ArrowRight class="size-4" />
                </span>
              </div>
            </a>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</ConsoleShell>

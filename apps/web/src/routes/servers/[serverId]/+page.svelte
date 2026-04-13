<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { createMutation } from "@tanstack/svelte-query";
  import {
    Activity,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    CircleDashed,
    Network,
    Server,
    TriangleAlert,
    XCircle,
  } from "@lucide/svelte";
  import type { TestServerConnectivityResponse } from "@yundu/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import { orpcClient } from "$lib/orpc";
  import {
    deploymentBadgeVariant,
    findProject,
    findServer,
    formatTime,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { projectsQuery, serversQuery, deploymentsQuery } = createConsoleQueries(browser);

  const serverId = $derived(page.params.serverId ?? "");
  const projects = $derived(projectsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending || serversQuery.isPending || deploymentsQuery.isPending,
  );
  const server = $derived(findServer(servers, serverId));
  const serverDeployments = $derived(
    server ? deployments.filter((deployment) => deployment.serverId === server.id) : [],
  );

  let connectivityResult = $state<TestServerConnectivityResponse | null>(null);
  let connectivityError = $state("");

  const connectivityMutation = createMutation(() => ({
    mutationFn: (inputServerId: string) =>
      orpcClient.servers.testConnectivity({
        serverId: inputServerId,
      }),
    onSuccess: (result) => {
      connectivityResult = result;
      connectivityError = "";
    },
    onError: (error) => {
      connectivityError = readErrorMessage(error);
    },
  }));

  function testConnectivity(): void {
    if (!server) {
      return;
    }

    connectivityError = "";
    connectivityMutation.mutate(server.id);
  }

  function connectivityLabel(status: TestServerConnectivityResponse["status"]): string {
    switch (status) {
      case "healthy":
        return $t(i18nKeys.common.status.healthy);
      case "degraded":
        return $t(i18nKeys.common.status.degraded);
      case "unreachable":
        return $t(i18nKeys.common.status.unreachable);
    }
  }

  function checkLabel(status: TestServerConnectivityResponse["checks"][number]["status"]): string {
    switch (status) {
      case "passed":
        return $t(i18nKeys.common.status.passed);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      case "skipped":
        return $t(i18nKeys.common.status.skipped);
    }
  }

  function connectivityVariant(
    status: TestServerConnectivityResponse["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "healthy":
        return "default";
      case "degraded":
        return "secondary";
      case "unreachable":
        return "destructive";
    }
  }

  function checkVariant(
    status: TestServerConnectivityResponse["checks"][number]["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "passed":
        return "default";
      case "failed":
        return "destructive";
      case "skipped":
        return "outline";
    }
  }
</script>

<svelte:head>
  <title>{server?.name ?? $t(i18nKeys.console.servers.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={server?.name ?? $t(i18nKeys.console.servers.pageTitle)}
  description={$t(i18nKeys.console.servers.detailDescription)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-36 w-full" />
      <div class="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Skeleton class="h-72 w-full" />
        <Skeleton class="h-72 w-full" />
      </div>
    </div>
  {:else if !server}
    <section class="rounded-lg border bg-background p-6 md:p-8">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.errors.backend.notFound)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.servers.notFoundTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.servers.notFoundBody)}
        </p>
      </div>
      <div class="mt-6">
        <Button href="/servers" variant="outline">
          <ArrowLeft class="size-4" />
          {$t(i18nKeys.common.actions.backToServers)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-5">
      <section class="rounded-lg border bg-background p-5">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{$t(i18nKeys.common.domain.server)}</Badge>
              <Badge variant="secondary">{server.providerKey}</Badge>
            </div>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold md:text-3xl">{server.name}</h1>
              <p class="text-sm leading-6 text-muted-foreground">
                {server.host}:{server.port}
              </p>
            </div>
            <p class="text-xs text-muted-foreground">
              {$t(i18nKeys.common.domain.createdAt)} · {formatTime(server.createdAt)}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button href="/servers" variant="outline">
              <ArrowLeft class="size-4" />
              {$t(i18nKeys.common.actions.backToServers)}
            </Button>
            <Button onclick={testConnectivity} disabled={connectivityMutation.isPending}>
              <Activity class="size-4" />
              {$t(i18nKeys.common.actions.testConnectivity)}
            </Button>
          </div>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Network class="size-4" />
              {$t(i18nKeys.common.domain.provider)}
            </p>
            <p class="mt-2 truncate font-semibold">{server.providerKey}</p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Server class="size-4" />
              {$t(i18nKeys.common.domain.host)}
            </p>
            <p class="mt-2 truncate font-semibold">{server.host}</p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleDashed class="size-4" />
              {$t(i18nKeys.common.domain.port)}
            </p>
            <p class="mt-2 font-semibold">{server.port}</p>
          </div>
        </div>
      </section>

      <section class="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section class="rounded-lg border bg-background p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.servers.connectivityTitle)}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.connectivityDescription)}
              </p>
            </div>
            {#if connectivityResult}
              <Badge variant={connectivityVariant(connectivityResult.status)}>
                {connectivityLabel(connectivityResult.status)}
              </Badge>
            {/if}
          </div>

          <div class="mt-4 space-y-3">
            {#if connectivityMutation.isPending}
              <div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {$t(i18nKeys.common.actions.testConnectivity)}...
              </div>
            {:else if connectivityError}
              <div class="rounded-md border border-destructive/30 p-4 text-sm text-destructive">
                <div class="flex items-start gap-2">
                  <TriangleAlert class="mt-0.5 size-4" />
                  <p>{connectivityError}</p>
                </div>
              </div>
            {:else if connectivityResult}
              <div class="rounded-md border px-4 py-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-medium">
                    {$t(i18nKeys.console.servers.connectivityLastResult)}
                  </p>
                  <span class="text-xs text-muted-foreground">
                    {formatTime(connectivityResult.checkedAt)}
                  </span>
                </div>
              </div>
              {#each connectivityResult.checks as check (check.name)}
                <div class="rounded-md border px-4 py-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="flex items-center gap-2 text-sm font-medium">
                      {#if check.status === "passed"}
                        <CheckCircle2 class="size-4 text-green-600" />
                      {:else if check.status === "failed"}
                        <XCircle class="size-4 text-destructive" />
                      {:else}
                        <CircleDashed class="size-4 text-muted-foreground" />
                      {/if}
                      {check.name}
                    </p>
                    <Badge variant={checkVariant(check.status)}>{checkLabel(check.status)}</Badge>
                  </div>
                  <p class="mt-2 text-sm leading-6 text-muted-foreground">{check.message}</p>
                  <p class="mt-2 text-xs text-muted-foreground">{check.durationMs}ms</p>
                </div>
              {/each}
            {:else}
              <div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.connectivityNoResult)}
              </div>
            {/if}
          </div>
        </section>

        <section class="rounded-lg border bg-background p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold">
                {$t(i18nKeys.console.servers.connectedDeploymentsTitle)}
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.connectedDeploymentsDescription)}
              </p>
            </div>
            <Badge variant="outline">{serverDeployments.length}</Badge>
          </div>

          <div class="mt-4 space-y-3">
            {#if serverDeployments.length > 0}
              {#each serverDeployments.slice(0, 8) as deployment (deployment.id)}
                {@const project = findProject(projects, deployment.projectId)}
                <a
                  href={`/deployments/${deployment.id}`}
                  class="group block rounded-md border px-4 py-3 transition-colors hover:bg-muted/45"
                >
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0 space-y-1">
                      <p class="truncate font-medium">{deployment.runtimePlan.source.displayName}</p>
                      <p class="truncate text-sm text-muted-foreground">
                        {project?.name ?? deployment.projectId} · {formatTime(deployment.createdAt)}
                      </p>
                    </div>
                    <div class="flex items-center gap-2">
                      <Badge variant={deploymentBadgeVariant(deployment.status)}>
                        {deployment.status}
                      </Badge>
                      <ArrowRight class="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                    </div>
                  </div>
                </a>
              {/each}
            {:else}
              <div class="rounded-md border border-dashed p-5">
                <div class="flex items-start gap-3">
                  <Server class="mt-0.5 size-4 text-muted-foreground" />
                  <div class="space-y-2">
                    <p class="text-sm font-medium">
                      {$t(i18nKeys.console.servers.noDeploymentsTitle)}
                    </p>
                    <p class="text-sm text-muted-foreground">
                      {$t(i18nKeys.console.servers.noDeploymentsBody)}
                    </p>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </section>
      </section>
    </div>
  {/if}
</ConsoleShell>

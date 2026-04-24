<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import {
    Activity,
    ArrowLeft,
    Boxes,
    CheckCircle2,
    CircleDashed,
    Globe2,
    KeyRound,
    Network,
    Save,
    Server,
    ShieldAlert,
    TriangleAlert,
    XCircle,
  } from "@lucide/svelte";
  import type {
    ConfigureDefaultAccessDomainPolicyInput,
    ConfigureServerEdgeProxyInput,
    RenameServerInput,
    ServerDeleteSafety,
    ServerSummary,
    SshCredentialUsageServer,
    TestServerConnectivityResponse,
  } from "@appaloft/contracts";
  import { configureServerEdgeProxyInputSchema } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import TerminalSessionPanel from "$lib/components/console/TerminalSessionPanel.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const serverId = $derived(page.params.serverId ?? "");
  const projectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects"],
      queryFn: () => orpcClient.projects.list(),
      enabled: browser,
    }),
  );
  const deploymentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments"],
      queryFn: () => orpcClient.deployments.list({}),
      enabled: browser,
    }),
  );
  const serverDetailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers", "show", serverId],
      queryFn: () =>
        orpcClient.servers.show({
          serverId,
          includeRollups: true,
        }),
      enabled: browser && serverId.length > 0,
      staleTime: 5_000,
    }),
  );
  const serverDeleteSafetyQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers", "delete-check", serverId],
      queryFn: () =>
        orpcClient.servers.deleteCheck({
          serverId,
        }),
      enabled: browser && serverId.length > 0,
      staleTime: 5_000,
    }),
  );
  const projects = $derived(projectsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending || deploymentsQuery.isPending || serverDetailQuery.isPending,
  );
  const serverDetail = $derived(serverDetailQuery.data ?? null);
  const server = $derived(serverDetail?.server ?? null);
  const storedSshCredentialId = $derived(
    server?.credential?.kind === "ssh-private-key" ? (server.credential.credentialId ?? "") : "",
  );
  const sshCredentialDetailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["credentials", "ssh", "show", storedSshCredentialId],
      queryFn: () =>
        orpcClient.credentials.ssh.show({
          credentialId: storedSshCredentialId,
          includeUsage: true,
        }),
      enabled: browser && storedSshCredentialId.length > 0,
      staleTime: 5_000,
    }),
  );
  const sshCredentialDetail = $derived(sshCredentialDetailQuery.data ?? null);
  const sshCredentialDetailError = $derived(
    sshCredentialDetailQuery.error ? readErrorMessage(sshCredentialDetailQuery.error) : "",
  );
  const serverDeleteSafety = $derived(serverDeleteSafetyQuery.data ?? null);
  const serverDeleteSafetyError = $derived(
    serverDeleteSafetyQuery.error ? readErrorMessage(serverDeleteSafetyQuery.error) : "",
  );
  const serverRollups = $derived(serverDetail?.rollups ?? null);
  const serverDeployments = $derived(
    server ? deployments.filter((deployment) => deployment.serverId === server.id) : [],
  );
  const relatedDeploymentCount = $derived(
    serverRollups?.deployments.total ?? serverDeployments.length,
  );
  const defaultAccessModes = ["disabled", "provider", "custom-template"] as const;
  const edgeProxyKindOptions = configureServerEdgeProxyInputSchema.shape.proxyKind.options;

  let connectivityResult = $state<TestServerConnectivityResponse | null>(null);
  let connectivityError = $state("");
  let overrideMode = $state<ConfigureDefaultAccessDomainPolicyInput["mode"]>("provider");
  let overrideProviderKey = $state("sslip");
  let overrideTemplateRef = $state("");
  let serverFormServerId = $state("");
  let serverName = $state("");
  let edgeProxyKind = $state<ConfigureServerEdgeProxyInput["proxyKind"]>("none");
  let lifecycleFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let overrideFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  const canRenameServer = $derived(
    Boolean(server) && serverName.trim().length > 0 && serverName.trim() !== server?.name,
  );
  const canConfigureEdgeProxy = $derived(
    Boolean(server) &&
      server?.lifecycleStatus === "active" &&
      edgeProxyKind !== (server?.edgeProxy?.kind ?? "none"),
  );

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
  const configureDefaultAccessOverrideMutation = createMutation(() => ({
    mutationFn: (input: ConfigureDefaultAccessDomainPolicyInput) =>
      orpcClient.defaultAccessDomainPolicies.configure(input),
    onSuccess: (result) => {
      overrideFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.defaultAccessSaveSuccessTitle),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (error) => {
      overrideFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.defaultAccessSaveErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const renameServerMutation = createMutation(() => ({
    mutationFn: (input: RenameServerInput) => orpcClient.servers.rename(input),
    onSuccess: (result) => {
      serverName = serverName.trim();
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.renameSucceeded),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      void queryClient.invalidateQueries({ queryKey: ["servers", "show", result.id] });
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.renameFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const configureEdgeProxyMutation = createMutation(() => ({
    mutationFn: (input: ConfigureServerEdgeProxyInput) =>
      orpcClient.servers.configureEdgeProxy(input),
    onSuccess: (result) => {
      edgeProxyKind = result.edgeProxy.kind;
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.edgeProxyConfigured),
        detail: `${result.edgeProxy.kind} · ${edgeProxyStatusLabel(result.edgeProxy.status)}`,
      };
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      void queryClient.invalidateQueries({ queryKey: ["servers", "show", result.id] });
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.edgeProxyConfigureFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  $effect(() => {
    if (!server || serverFormServerId === server.id) {
      return;
    }

    serverFormServerId = server.id;
    serverName = server.name;
    edgeProxyKind = server.edgeProxy?.kind ?? "none";
    lifecycleFeedback = null;
  });

  function testConnectivity(): void {
    if (!server) {
      return;
    }

    connectivityError = "";
    connectivityMutation.mutate(server.id);
  }

  function renameServer(event: SubmitEvent): void {
    event.preventDefault();

    if (!server || !canRenameServer || renameServerMutation.isPending) {
      return;
    }

    lifecycleFeedback = null;
    renameServerMutation.mutate({
      serverId: server.id,
      name: serverName.trim(),
    });
  }

  function configureEdgeProxy(event: SubmitEvent): void {
    event.preventDefault();

    if (!server || !canConfigureEdgeProxy || configureEdgeProxyMutation.isPending) {
      return;
    }

    lifecycleFeedback = null;
    configureEdgeProxyMutation.mutate({
      serverId: server.id,
      proxyKind: edgeProxyKind,
    });
  }

  function saveDefaultAccessOverride(event: SubmitEvent): void {
    event.preventDefault();

    if (!server) {
      return;
    }

    configureDefaultAccessOverrideMutation.mutate({
      scope: {
        kind: "deployment-target",
        serverId: server.id,
      },
      mode: overrideMode,
      ...(overrideMode !== "disabled" && overrideProviderKey.trim()
        ? { providerKey: overrideProviderKey.trim() }
        : {}),
      ...(overrideMode === "custom-template" && overrideTemplateRef.trim()
        ? { templateRef: overrideTemplateRef.trim() }
        : {}),
    });
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
        return "default";
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
        return "default";
      case "inactive":
        return "outline";
    }
  }

  function deleteSafetyLabel(safety: ServerDeleteSafety): string {
    return safety.eligible
      ? $t(i18nKeys.console.servers.deleteSafetyEligible)
      : $t(i18nKeys.console.servers.deleteSafetyBlocked);
  }

  function credentialUsageServerVariant(
    status: SshCredentialUsageServer["lifecycleStatus"],
  ): "default" | "secondary" | "outline" | "destructive" {
    return status === "active" ? "default" : "outline";
  }
</script>

<svelte:head>
  <title>{server?.name ?? $t(i18nKeys.console.servers.pageTitle)} · Appaloft</title>
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
    <section class="space-y-5 py-2">
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
    <div class="space-y-8">
      <section class="space-y-6">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{$t(i18nKeys.common.domain.server)}</Badge>
              <Badge variant="secondary">{server.providerKey}</Badge>
              <Badge variant={serverLifecycleVariant(server.lifecycleStatus)}>
                {serverLifecycleLabel(server.lifecycleStatus)}
              </Badge>
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
            {#if server.lifecycleStatus === "inactive"}
              <p class="text-xs text-muted-foreground">
                {$t(i18nKeys.console.servers.lifecycleInactiveDescription)}
                {#if server.deactivatedAt}
                  · {$t(i18nKeys.console.servers.deactivatedAt)} {formatTime(server.deactivatedAt)}
                {/if}
              </p>
            {/if}
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

        <div class="grid border-y sm:grid-cols-2 xl:grid-cols-5 xl:divide-x">
          <div class="px-0 py-4 sm:px-4">
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Network class="size-4" />
              {$t(i18nKeys.common.domain.provider)}
            </p>
            <p class="mt-2 truncate font-semibold">{server.providerKey}</p>
          </div>
          <div class="border-t px-0 py-4 sm:border-t-0 sm:px-4">
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Server class="size-4" />
              {$t(i18nKeys.common.domain.host)}
            </p>
            <p class="mt-2 truncate font-semibold">{server.host}</p>
          </div>
          <div class="border-t px-0 py-4 sm:px-4 xl:border-t-0">
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CircleDashed class="size-4" />
              {$t(i18nKeys.common.domain.port)}
            </p>
            <p class="mt-2 font-semibold">{server.port}</p>
          </div>
          <div class="border-t px-0 py-4 sm:px-4 xl:border-t-0">
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <KeyRound class="size-4" />
              {$t(i18nKeys.console.serverForm.sshCredentialTitle)}
            </p>
            <p class="mt-2 truncate font-semibold">
              {server.credential?.kind === "local-ssh-agent"
                ? $t(i18nKeys.console.serverForm.localSshAgent)
                : (server.credential?.credentialName ??
                  server.credential?.username ??
                  $t(i18nKeys.common.status.notConfigured))}
            </p>
          </div>
          <div class="border-t px-0 py-4 sm:px-4 xl:border-t-0">
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CircleDashed class="size-4" />
              {$t(i18nKeys.common.domain.proxy)}
            </p>
            <div class="mt-2 flex min-w-0 items-center gap-2">
              <span class="truncate font-semibold">{server.edgeProxy?.kind ?? "none"}</span>
              <Badge variant={edgeProxyStatusVariant(server.edgeProxy?.status)}>
                {server.edgeProxy
                  ? edgeProxyStatusLabel(server.edgeProxy.status)
                  : $t(i18nKeys.common.status.notConfigured)}
              </Badge>
            </div>
          </div>
        </div>

        {#if serverRollups}
          <div class="grid border-y sm:grid-cols-3 sm:divide-x">
            <div class="px-0 py-4 sm:px-4">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Boxes class="size-4" />
                {$t(i18nKeys.common.domain.resources)}
              </p>
              <p class="mt-2 font-semibold">{serverRollups.resources.total}</p>
            </div>
            <div class="border-t px-0 py-4 sm:border-t-0 sm:px-4">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Activity class="size-4" />
                {$t(i18nKeys.common.domain.deployments)}
              </p>
              <p class="mt-2 font-semibold">{serverRollups.deployments.total}</p>
            </div>
            <div class="border-t px-0 py-4 sm:border-t-0 sm:px-4">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Globe2 class="size-4" />
                {$t(i18nKeys.common.domain.domainBindings)}
              </p>
              <p class="mt-2 font-semibold">{serverRollups.domains.total}</p>
            </div>
          </div>
        {/if}

        {#if storedSshCredentialId}
          <div class="border-y px-0 py-4 sm:px-4">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2">
                  <h2 class="text-sm font-semibold">
                    {$t(i18nKeys.console.servers.credentialDetailTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.serverSshCredential}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                  />
                </div>
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.servers.credentialDetailDescription)}
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                {#if sshCredentialDetailQuery.isPending}
                  <Badge variant="secondary">{$t(i18nKeys.common.status.loading)}</Badge>
                {:else if sshCredentialDetail}
                  <Badge variant="outline">{$t(i18nKeys.common.status.configured)}</Badge>
                  {#if sshCredentialDetail.usage}
                    <Badge variant="secondary">
                      {$t(i18nKeys.console.servers.credentialUsageTotal, {
                        count: sshCredentialDetail.usage.totalServers,
                      })}
                    </Badge>
                  {/if}
                {:else if sshCredentialDetailError}
                  <Badge variant="destructive">{$t(i18nKeys.common.status.failed)}</Badge>
                {/if}
              </div>
            </div>

            {#if sshCredentialDetail}
              <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div class="bg-muted/25 px-4 py-4">
                  <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <KeyRound class="size-4" />
                    {$t(i18nKeys.console.servers.credentialMaterialSummary)}
                  </p>
                  <p class="mt-2 truncate font-semibold">{sshCredentialDetail.credential.name}</p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <Badge
                      variant={sshCredentialDetail.credential.privateKeyConfigured
                        ? "secondary"
                        : "outline"}
                    >
                      {$t(i18nKeys.console.servers.credentialPrivateKeyConfigured)}
                    </Badge>
                    <Badge
                      variant={sshCredentialDetail.credential.publicKeyConfigured
                        ? "secondary"
                        : "outline"}
                    >
                      {$t(i18nKeys.console.servers.credentialPublicKeyConfigured)}
                    </Badge>
                  </div>
                  <dl class="mt-4 space-y-2 text-sm">
                    <div class="flex flex-wrap justify-between gap-2">
                      <dt class="text-muted-foreground">
                        {$t(i18nKeys.console.servers.credentialDefaultUsername)}
                      </dt>
                      <dd class="font-medium">
                        {sshCredentialDetail.credential.username ??
                          $t(i18nKeys.common.status.notConfigured)}
                      </dd>
                    </div>
                    <div class="flex flex-wrap justify-between gap-2">
                      <dt class="text-muted-foreground">
                        {$t(i18nKeys.common.domain.createdAt)}
                      </dt>
                      <dd class="font-medium">{formatTime(sshCredentialDetail.credential.createdAt)}</dd>
                    </div>
                  </dl>
                </div>

                <div class="bg-muted/25 px-4 py-4">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="text-sm font-semibold">
                      {$t(i18nKeys.console.servers.credentialUsageTitle)}
                    </p>
                    {#if sshCredentialDetail.usage}
                      <div class="flex flex-wrap gap-2">
                        <Badge variant="default">
                          {$t(i18nKeys.console.servers.credentialUsageActive, {
                            count: sshCredentialDetail.usage.activeServers,
                          })}
                        </Badge>
                        <Badge variant="outline">
                          {$t(i18nKeys.console.servers.credentialUsageInactive, {
                            count: sshCredentialDetail.usage.inactiveServers,
                          })}
                        </Badge>
                      </div>
                    {/if}
                  </div>

                  {#if sshCredentialDetail.usage && sshCredentialDetail.usage.totalServers === 0}
                    <div class="mt-4 border-y px-0 py-4">
                      <p class="text-sm font-medium">
                        {$t(i18nKeys.console.servers.credentialUsageEmptyTitle)}
                      </p>
                      <p class="mt-1 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.servers.credentialUsageEmptyBody)}
                      </p>
                    </div>
                  {:else if sshCredentialDetail.usage}
                    <div class="mt-4 divide-y border-y">
                      {#each sshCredentialDetail.usage.servers as usageServer (usageServer.serverId)}
                        <a
                          class="flex flex-col gap-2 px-0 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                          href={`/servers/${usageServer.serverId}`}
                        >
                          <span class="min-w-0">
                            <span class="block truncate font-medium">{usageServer.serverName}</span>
                            <span class="block truncate text-xs text-muted-foreground">
                              {usageServer.providerKey} · {usageServer.host}
                              {#if usageServer.username}
                                · {usageServer.username}
                              {/if}
                            </span>
                          </span>
                          <Badge variant={credentialUsageServerVariant(usageServer.lifecycleStatus)}>
                            {serverLifecycleLabel(usageServer.lifecycleStatus)}
                          </Badge>
                        </a>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {:else if sshCredentialDetailError}
              <div class="mt-4 rounded-md border border-destructive/30 p-4 text-sm text-destructive">
                <div class="flex items-start gap-2">
                  <TriangleAlert class="mt-0.5 size-4" />
                  <div class="space-y-1">
                    <p class="font-medium">
                      {$t(i18nKeys.console.servers.credentialUsageUnavailableTitle)}
                    </p>
                    <p class="text-muted-foreground">
                      {$t(i18nKeys.console.servers.credentialUsageUnavailableBody)}
                    </p>
                    <p class="text-muted-foreground">{sshCredentialDetailError}</p>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <div class="border-y px-0 py-4 sm:px-4">
          <form
            id="server-rename-form"
            class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)_auto]"
            onsubmit={renameServer}
          >
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold">
                  {$t(i18nKeys.console.servers.settingsTitle)}
                </h2>
                <DocsHelpLink
                  href={webDocsHrefs.serverDeploymentTarget}
                  ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                />
              </div>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.settingsDescription)}
              </p>
            </div>

            <label class="space-y-1.5 text-sm font-medium">
              <span>{$t(i18nKeys.console.servers.renameLabel)}</span>
              <Input id="server-display-name-input" bind:value={serverName} autocomplete="off" />
            </label>

            <div class="flex items-end">
              <Button
                type="submit"
                class="w-full sm:w-auto"
                disabled={!canRenameServer || renameServerMutation.isPending}
              >
                <Save class="size-4" />
                {renameServerMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.common.actions.save)}
              </Button>
            </div>
          </form>

          <form
            id="server-edge-proxy-form"
            class="mt-5 grid gap-4 border-t pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)_auto]"
            onsubmit={configureEdgeProxy}
          >
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold">
                  {$t(i18nKeys.console.servers.edgeProxyKindLabel)}
                </h2>
                <DocsHelpLink
                  href={webDocsHrefs.serverProxyReadiness}
                  ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                />
              </div>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.edgeProxyDescription)}
              </p>
            </div>

            <fieldset class="space-y-1.5 text-sm font-medium">
              <span>{$t(i18nKeys.console.servers.edgeProxyKindLabel)}</span>
              <div
                class="grid min-h-8 grid-cols-3 overflow-hidden rounded-lg border bg-background"
                aria-label={$t(i18nKeys.console.servers.edgeProxyKindLabel)}
              >
                {#each edgeProxyKindOptions as kind (kind)}
                  <Button
                    type="button"
                    size="sm"
                    variant={edgeProxyKind === kind ? "selected" : "ghost"}
                    class="h-8 rounded-none border-0"
                    disabled={server.lifecycleStatus !== "active" || configureEdgeProxyMutation.isPending}
                    onclick={() => {
                      edgeProxyKind = kind;
                    }}
                  >
                    {kind}
                  </Button>
                {/each}
              </div>
            </fieldset>

            <div class="flex items-end">
              <Button
                type="submit"
                class="w-full sm:w-auto"
                disabled={!canConfigureEdgeProxy || configureEdgeProxyMutation.isPending}
              >
                <Save class="size-4" />
                {configureEdgeProxyMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.common.actions.save)}
              </Button>
            </div>
          </form>

          {#if lifecycleFeedback}
            <div
              class={`mt-4 rounded-md border p-3 text-sm ${lifecycleFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
            >
              <p class="font-medium">{lifecycleFeedback.title}</p>
              <p class="mt-1 text-muted-foreground">{lifecycleFeedback.detail}</p>
            </div>
          {/if}
        </div>

        <div class="border-y px-0 py-4 sm:px-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0 space-y-1">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ShieldAlert class="size-4" />
                {$t(i18nKeys.console.servers.deleteSafetyTitle)}
              </p>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.deleteSafetyDescription)}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              {#if serverDeleteSafetyQuery.isPending}
                <Badge variant="secondary">{$t(i18nKeys.common.status.loading)}</Badge>
              {:else if serverDeleteSafety}
                <Badge variant={serverDeleteSafety.eligible ? "default" : "destructive"}>
                  {deleteSafetyLabel(serverDeleteSafety)}
                </Badge>
                <span class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.servers.deleteSafetyBlockerCount, {
                    count: serverDeleteSafety.blockers.length,
                  })}
                </span>
              {:else if serverDeleteSafetyError}
                <Badge variant="destructive">{$t(i18nKeys.common.status.failed)}</Badge>
                <span class="max-w-xl truncate text-sm text-muted-foreground">
                  {serverDeleteSafetyError}
                </span>
              {/if}
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-4 border-y py-6">
        <div class="max-w-3xl space-y-1">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">
              {$t(i18nKeys.console.servers.defaultAccessOverrideTitle)}
            </h2>
            <DocsHelpLink
              href={webDocsHrefs.defaultAccessPolicy}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.servers.defaultAccessOverrideDescription)}
          </p>
        </div>

        <form
          class="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]"
          onsubmit={saveDefaultAccessOverride}
        >
          <label class="space-y-1.5 text-sm font-medium">
            <span class="inline-flex items-center gap-1.5">
              {$t(i18nKeys.console.servers.defaultAccessModeLabel)}
              <DocsHelpLink
                href={webDocsHrefs.defaultAccessPolicy}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                className="size-5"
              />
            </span>
            <Select.Root bind:value={overrideMode} type="single">
              <Select.Trigger class="w-full">
                {overrideMode === "disabled"
                  ? $t(i18nKeys.console.servers.defaultAccessDisabledOption)
                  : overrideMode === "custom-template"
                    ? $t(i18nKeys.console.servers.defaultAccessCustomTemplateOption)
                    : $t(i18nKeys.console.servers.defaultAccessProviderOption)}
              </Select.Trigger>
              <Select.Content>
                {#each defaultAccessModes as mode (mode)}
                  <Select.Item value={mode}>
                    {mode === "disabled"
                      ? $t(i18nKeys.console.servers.defaultAccessDisabledOption)
                      : mode === "custom-template"
                        ? $t(i18nKeys.console.servers.defaultAccessCustomTemplateOption)
                        : $t(i18nKeys.console.servers.defaultAccessProviderOption)}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>

          <div class="grid gap-4 md:grid-cols-2">
            {#if overrideMode !== "disabled"}
              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.console.servers.defaultAccessProviderKeyLabel)}
                  <DocsHelpLink
                    href={webDocsHrefs.defaultAccessPolicy}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input
                  bind:value={overrideProviderKey}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.servers.defaultAccessProviderKeyPlaceholder)}
                />
              </label>
            {/if}

            {#if overrideMode === "custom-template"}
              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.console.servers.defaultAccessTemplateRefLabel)}
                  <DocsHelpLink
                    href={webDocsHrefs.defaultAccessPolicy}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input
                  bind:value={overrideTemplateRef}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.servers.defaultAccessTemplateRefPlaceholder)}
                />
              </label>
            {/if}
          </div>

          <div class="flex items-end">
            <Button class="w-full sm:w-auto" disabled={configureDefaultAccessOverrideMutation.isPending}>
              {configureDefaultAccessOverrideMutation.isPending
                ? $t(i18nKeys.common.actions.saving)
                : $t(i18nKeys.common.actions.save)}
            </Button>
          </div>
        </form>

        {#if overrideFeedback}
          <div
            class={`rounded-md border p-3 text-sm ${overrideFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
          >
            <p class="font-medium">{overrideFeedback.title}</p>
            <p class="mt-1 text-muted-foreground">{overrideFeedback.detail}</p>
          </div>
        {/if}
      </section>

      <section class="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section class="space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.servers.connectivityTitle)}
                </h2>
                <DocsHelpLink
                  href={webDocsHrefs.serverConnectivityTest}
                  ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                />
              </div>
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

          <div class="space-y-3">
            {#if connectivityMutation.isPending}
              <div class="bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
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
              <div class="bg-muted/25 px-4 py-3">
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
                <div class="bg-muted/25 px-4 py-3">
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
              <div class="bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.connectivityNoResult)}
              </div>
            {/if}
          </div>
        </section>

        <section class="space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold">
                {$t(i18nKeys.console.servers.connectedDeploymentsTitle)}
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.connectedDeploymentsDescription)}
              </p>
            </div>
            <Badge variant="outline">{relatedDeploymentCount}</Badge>
          </div>

          <div>
            {#if serverDeployments.length > 0}
              <DeploymentTable
                deployments={serverDeployments.slice(0, 8)}
                {projects}
                showEnvironment={false}
                showServer={false}
              />
            {:else}
              <div class="border-y bg-muted/25 px-4 py-6">
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

      <section class="space-y-3">
        <div class="flex justify-end">
          <DocsHelpLink
            href={webDocsHrefs.serverTerminalSession}
            ariaLabel={$t(i18nKeys.common.actions.openDocs)}
          />
        </div>
        <TerminalSessionPanel
          title={$t(i18nKeys.console.terminal.serverTitle)}
          description={$t(i18nKeys.console.terminal.serverDescription)}
          scope={{
            kind: "server",
            serverId: server.id,
          }}
        />
      </section>
    </div>
  {/if}
</ConsoleShell>

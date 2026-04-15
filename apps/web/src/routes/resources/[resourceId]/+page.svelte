<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onDestroy, untrack } from "svelte";
  import { createMutation } from "@tanstack/svelte-query";
  import {
    ArrowLeft,
    ArrowRight,
    Boxes,
    Globe2,
    Plus,
    RefreshCw,
    Route,
    Server,
    Terminal,
  } from "@lucide/svelte";
  import type {
    CreateDomainBindingInput,
    DomainBindingSummary,
    ProxyConfigurationView,
    ResourceRuntimeLogEvent,
    ResourceRuntimeLogLine,
    ResourceSummary,
  } from "@yundu/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import ResourceProfileSummary from "$lib/components/console/ResourceProfileSummary.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    findEnvironment,
    findProject,
    findResource,
    findServer,
    formatTime,
    projectDetailHref,
    resourceNewDeploymentHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type RuntimeLogClientStream = {
    next(): Promise<IteratorResult<ResourceRuntimeLogEvent, unknown>>;
    return?: () => Promise<IteratorResult<ResourceRuntimeLogEvent, unknown>>;
  };
  type ResourceDetailTab = "deployments" | "access" | "logs" | "settings";

  const resourceDetailTabs = ["deployments", "access", "logs", "settings"] as const;

  const {
    projectsQuery,
    environmentsQuery,
    resourcesQuery,
    serversQuery,
    deploymentsQuery,
    domainBindingsQuery,
  } = createConsoleQueries(browser);

  const resourceId = $derived(page.params.resourceId ?? "");
  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const domainBindings = $derived(domainBindingsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      serversQuery.isPending ||
      deploymentsQuery.isPending ||
      domainBindingsQuery.isPending,
  );
  const resource = $derived(findResource(resources, resourceId));
  const project = $derived(resource ? findProject(projects, resource.projectId) : null);
  const environment = $derived(
    resource ? findEnvironment(environments, resource.environmentId) : null,
  );
  const latestDeployment = $derived(
    resource ? deployments.find((deployment) => deployment.resourceId === resource.id) : null,
  );
  const resourceDeployments = $derived(
    resource ? deployments.filter((deployment) => deployment.resourceId === resource.id) : [],
  );
  const resourceDomainBindings = $derived(
    resource ? domainBindings.filter((binding) => binding.resourceId === resource.id) : [],
  );
  const generatedAccessRoute = $derived(
    resource?.accessSummary?.latestGeneratedAccessRoute ??
      resource?.accessSummary?.plannedGeneratedAccessRoute ??
      null,
  );
  const defaultDestinationId = $derived(
    resource?.destinationId ?? latestDeployment?.destinationId ?? "",
  );
  const activeTab = $derived(parseResourceDetailTab(page.url.searchParams.get("tab")));

  let serverId = $state("");
  let destinationId = $state("");
  let domainName = $state("");
  let pathPrefix = $state("/");
  let proxyKind = $state<CreateDomainBindingInput["proxyKind"]>("traefik");
  let tlsMode = $state<NonNullable<CreateDomainBindingInput["tlsMode"]>>("auto");
  let certificatePolicy = $state<NonNullable<CreateDomainBindingInput["certificatePolicy"]>>(
    "auto",
  );
  let domainBindingDialogOpen = $state(false);
  let createFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let runtimeLogResourceId = $state("");
  let runtimeLogs = $state<ResourceRuntimeLogLine[]>([]);
  let runtimeLogsLoading = $state(false);
  let runtimeLogsError = $state<string | null>(null);
  let runtimeLogsFollowing = $state(false);
  let runtimeLogStream = $state<RuntimeLogClientStream | null>(null);
  let proxyConfigurationResourceId = $state("");
  let proxyConfiguration = $state<ProxyConfigurationView | null>(null);
  let proxyConfigurationLoading = $state(false);
  let proxyConfigurationError = $state<string | null>(null);

  const selectedServer = $derived(findServer(servers, serverId));
  const primaryDomainBinding = $derived(
    resourceDomainBindings.find((binding) => binding.status === "ready") ??
      resourceDomainBindings.find((binding) => binding.status === "bound") ??
      resourceDomainBindings[0] ??
      null,
  );
  const primaryAccessHref = $derived(
    primaryDomainBinding ? domainBindingHref(primaryDomainBinding) : (generatedAccessRoute?.url ?? ""),
  );
  const shouldShowServerField = $derived(!latestDeployment?.serverId);
  const shouldShowDestinationField = $derived(!defaultDestinationId);
  const canCreateBinding = $derived(
    Boolean(
      resource &&
        serverId &&
        destinationId &&
        domainName.trim() &&
        pathPrefix.trim() &&
        proxyKind !== "none",
    ),
  );

  const createDomainBindingMutation = createMutation(() => ({
    mutationFn: (input: CreateDomainBindingInput) => orpcClient.domainBindings.create(input),
    onSuccess: (result) => {
      createFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.domainBindings.createSuccessTitle),
        detail: result.id,
      };
      domainName = "";
      domainBindingDialogOpen = false;
      void queryClient.invalidateQueries({ queryKey: ["domain-bindings"] });
    },
    onError: (error) => {
      createFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.createErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));

  let defaultedResourceId = $state("");

  function appendRuntimeLogLine(line: ResourceRuntimeLogLine): void {
    runtimeLogs = [...runtimeLogs, line].slice(-500);
  }

  function handleRuntimeLogEvent(event: ResourceRuntimeLogEvent): void {
    switch (event.kind) {
      case "line":
        appendRuntimeLogLine(event.line);
        break;
      case "error":
        runtimeLogsError = event.error.message;
        stopRuntimeLogFollow();
        break;
      case "closed":
        stopRuntimeLogFollow();
        break;
      case "heartbeat":
        break;
    }
  }

  function stopRuntimeLogFollow(): void {
    const stream = runtimeLogStream;
    runtimeLogStream = null;
    runtimeLogsFollowing = false;
    void stream?.return?.();
  }

  async function loadRuntimeLogs(currentResourceId: string): Promise<void> {
    runtimeLogResourceId = currentResourceId;
    runtimeLogsLoading = true;
    runtimeLogsError = null;

    try {
      const result = await orpcClient.resources.logs({
        resourceId: currentResourceId,
        tailLines: 100,
        follow: false,
      });

      if (runtimeLogResourceId === currentResourceId) {
        runtimeLogs = result.logs;
      }
    } catch (error) {
      if (runtimeLogResourceId === currentResourceId) {
        runtimeLogsError = readErrorMessage(error);
      }
    } finally {
      if (runtimeLogResourceId === currentResourceId) {
        runtimeLogsLoading = false;
      }
    }
  }

  async function consumeRuntimeLogStream(currentResourceId: string): Promise<void> {
    try {
      const stream = await orpcClient.resources.logsStream({
        resourceId: currentResourceId,
        tailLines: 100,
        follow: true,
      });

      if (!runtimeLogsFollowing || runtimeLogResourceId !== currentResourceId) {
        await stream.return?.();
        return;
      }

      runtimeLogStream = stream;
      let result = await stream.next();

      while (
        runtimeLogsFollowing &&
        runtimeLogResourceId === currentResourceId &&
        !result.done
      ) {
        handleRuntimeLogEvent(result.value);

        if (!runtimeLogsFollowing || runtimeLogResourceId !== currentResourceId) {
          break;
        }

        result = await stream.next();
      }
    } catch (error) {
      if (runtimeLogResourceId === currentResourceId) {
        runtimeLogsError = readErrorMessage(error);
      }
    } finally {
      if (runtimeLogResourceId === currentResourceId) {
        runtimeLogStream = null;
        runtimeLogsFollowing = false;
      }
    }
  }

  function startRuntimeLogFollow(): void {
    if (!browser || !resource || runtimeLogsFollowing) {
      return;
    }

    runtimeLogResourceId = resource.id;
    runtimeLogsError = null;
    runtimeLogsFollowing = true;
    void consumeRuntimeLogStream(resource.id);
  }

  function refreshRuntimeLogs(): void {
    if (!resource) {
      return;
    }

    stopRuntimeLogFollow();
    void loadRuntimeLogs(resource.id);
  }

  async function loadProxyConfiguration(currentResourceId: string): Promise<void> {
    proxyConfigurationResourceId = currentResourceId;
    proxyConfigurationLoading = true;
    proxyConfigurationError = null;

    try {
      const result = await orpcClient.resources.proxyConfiguration({
        resourceId: currentResourceId,
        routeScope: "latest",
        includeDiagnostics: true,
      });

      if (proxyConfigurationResourceId === currentResourceId) {
        proxyConfiguration = result;
      }
    } catch (error) {
      if (proxyConfigurationResourceId === currentResourceId) {
        proxyConfigurationError = readErrorMessage(error);
      }
    } finally {
      if (proxyConfigurationResourceId === currentResourceId) {
        proxyConfigurationLoading = false;
      }
    }
  }

  function refreshProxyConfiguration(): void {
    if (!resource) {
      return;
    }

    void loadProxyConfiguration(resource.id);
  }

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (defaultedResourceId === resource.id) {
      return;
    }

    defaultedResourceId = resource.id;
    destinationId = defaultDestinationId;
  });

  $effect(() => {
    if (!browser || serverId) {
      return;
    }

    serverId = latestDeployment?.serverId ?? servers[0]?.id ?? "";
  });

  $effect(() => {
    const currentResourceId = resource?.id ?? "";

    if (!browser) {
      return;
    }

    untrack(() => {
      stopRuntimeLogFollow();

      if (!currentResourceId) {
        runtimeLogs = [];
        runtimeLogResourceId = "";
        proxyConfiguration = null;
        proxyConfigurationResourceId = "";
        return;
      }

      void loadRuntimeLogs(currentResourceId);
      void loadProxyConfiguration(currentResourceId);
    });
  });

  onDestroy(() => {
    stopRuntimeLogFollow();
  });

  function createResourceDomainBinding(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canCreateBinding || createDomainBindingMutation.isPending) {
      return;
    }

    createFeedback = null;
    createDomainBindingMutation.mutate({
      projectId: resource.projectId,
      environmentId: resource.environmentId,
      resourceId: resource.id,
      serverId,
      destinationId,
      domainName: domainName.trim(),
      pathPrefix: pathPrefix.trim() || "/",
      proxyKind,
      tlsMode,
      certificatePolicy,
    });
  }

  function openDomainBindingDialog(): void {
    createFeedback = null;
    domainBindingDialogOpen = true;
  }

  function domainBindingHref(binding: DomainBindingSummary): string {
    const normalizedPath = binding.pathPrefix.startsWith("/")
      ? binding.pathPrefix
      : `/${binding.pathPrefix}`;
    const path = normalizedPath === "/" ? "" : normalizedPath;
    const protocol = binding.tlsMode === "disabled" ? "http" : "https";
    return `${protocol}://${binding.domainName}${path}`;
  }

  function resourceDeploymentHref(): string {
    if (!resource) {
      return "/deploy";
    }

    return resourceNewDeploymentHref(resource);
  }

  function parseResourceDetailTab(value: string | null): ResourceDetailTab {
    return resourceDetailTabs.includes(value as ResourceDetailTab)
      ? (value as ResourceDetailTab)
      : "deployments";
  }

  function resourceTabHref(tab: ResourceDetailTab): string {
    const params = new URLSearchParams(page.url.searchParams);

    if (tab === "deployments") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectResourceTab(tab: ResourceDetailTab, event: MouseEvent): void {
    event.preventDefault();
    void goto(resourceTabHref(tab), { noScroll: true, keepFocus: true });
  }

  function resourceTabLabel(tab: ResourceDetailTab): string {
    switch (tab) {
      case "deployments":
        return $t(i18nKeys.common.domain.deployments);
      case "access":
        return $t(i18nKeys.console.resources.accessTab);
      case "logs":
        return $t(i18nKeys.console.resources.logsTab);
      case "settings":
        return $t(i18nKeys.console.resources.settingsTab);
    }
  }

  function domainBindingStatusLabel(status: DomainBindingSummary["status"]): string {
    switch (status) {
      case "requested":
        return $t(i18nKeys.common.status.requested);
      case "pending_verification":
        return $t(i18nKeys.common.status.pendingVerification);
      case "bound":
        return $t(i18nKeys.common.status.bound);
      case "certificate_pending":
        return $t(i18nKeys.common.status.certificatePending);
      case "ready":
        return $t(i18nKeys.common.status.ready);
      case "not_ready":
        return $t(i18nKeys.common.status.notReady);
      case "failed":
        return $t(i18nKeys.common.status.failed);
    }
  }

  function domainBindingStatusVariant(
    status: DomainBindingSummary["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "ready":
      case "bound":
        return "default";
      case "failed":
      case "not_ready":
        return "destructive";
      case "certificate_pending":
      case "pending_verification":
      case "requested":
        return "secondary";
    }
  }

  function proxyConfigurationStatusLabel(status: ProxyConfigurationView["status"]): string {
    switch (status) {
      case "not-configured":
        return $t(i18nKeys.console.resources.proxyConfigurationStatusNotConfigured);
      case "planned":
        return $t(i18nKeys.console.resources.proxyConfigurationStatusPlanned);
      case "applied":
        return $t(i18nKeys.console.resources.proxyConfigurationStatusApplied);
      case "stale":
        return $t(i18nKeys.console.resources.proxyConfigurationStatusStale);
      case "failed":
        return $t(i18nKeys.common.status.failed);
    }
  }

  function proxyConfigurationStatusVariant(
    status: ProxyConfigurationView["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "applied":
        return "default";
      case "failed":
        return "destructive";
      case "planned":
      case "stale":
        return "secondary";
      case "not-configured":
        return "outline";
    }
  }
</script>

<svelte:head>
  <title>{resource?.name ?? $t(i18nKeys.console.resources.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={resource?.name ?? $t(i18nKeys.console.resources.pageTitle)}
  description={$t(i18nKeys.console.resources.detailDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle), href: "/projects" },
    {
      label: project?.name ?? $t(i18nKeys.common.domain.project),
      href: project ? projectDetailHref(project.id) : undefined,
    },
    { label: environment?.name ?? $t(i18nKeys.common.domain.environment) },
    { label: resource?.name ?? $t(i18nKeys.common.domain.resource) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-40 w-full" />
      <div class="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Skeleton class="h-80 w-full" />
        <Skeleton class="h-80 w-full" />
      </div>
    </div>
  {:else if !resource}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.errors.backend.notFound)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.resources.notFoundTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.resources.notFoundBody)}
        </p>
      </div>
      <div class="mt-6">
        <Button href="/projects" variant="outline">
          <ArrowLeft class="size-4" />
          {$t(i18nKeys.common.actions.backToProjects)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="space-y-6">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{$t(i18nKeys.common.domain.resource)}</Badge>
              <Badge variant="secondary">{resource.kind}</Badge>
              {#if resource.lastDeploymentStatus}
                <DeploymentStatusBadge status={resource.lastDeploymentStatus} />
              {/if}
            </div>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold md:text-3xl">{resource.name}</h1>
              <p class="text-sm leading-6 text-muted-foreground">
                {resource.description ?? $t(i18nKeys.console.projects.noDescription)}
              </p>
            </div>
            <p class="text-xs text-muted-foreground">
              {project?.name ?? resource.projectId} · {environment?.name ?? resource.environmentId}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            {#if primaryAccessHref}
              <Button href={primaryAccessHref} target="_blank" rel="noreferrer" variant="outline">
                {$t(i18nKeys.console.resources.openGeneratedAccess)}
                <ArrowRight class="size-4" />
              </Button>
            {/if}
            <Button onclick={openDomainBindingDialog}>
              <Globe2 class="size-4" />
              {$t(i18nKeys.common.actions.bindDomain)}
            </Button>
            {#if project}
              <Button href={projectDetailHref(project.id)} variant="outline">
                <ArrowLeft class="size-4" />
                {$t(i18nKeys.common.actions.openProject)}
              </Button>
            {/if}
            <Button href={resourceDeploymentHref()}>
              <Plus class="size-4" />
              {$t(i18nKeys.common.actions.newDeployment)}
            </Button>
            <Button href={`/deployments?projectId=${resource.projectId}`} variant="outline">
              {$t(i18nKeys.common.actions.viewDeployments)}
              <ArrowRight class="size-4" />
            </Button>
          </div>
        </div>

        <div class="grid border-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          <div class="px-0 py-4 lg:px-4">
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Boxes class="size-4" />
              {$t(i18nKeys.common.domain.deployments)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{resourceDeployments.length}</p>
          </div>
          <div class="border-t px-0 py-4 sm:border-t-0 lg:px-4">
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Globe2 class="size-4" />
              {$t(i18nKeys.common.domain.domainBindings)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{resourceDomainBindings.length}</p>
          </div>
          <div class="border-t px-0 py-4 lg:border-t-0 lg:px-4">
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Server class="size-4" />
              {$t(i18nKeys.common.domain.server)}
            </p>
            <p class="mt-2 truncate font-semibold">
              {(selectedServer?.name ?? latestDeployment?.serverId ?? serverId) || "-"}
            </p>
          </div>
          <div class="border-t px-0 py-4 sm:border-t-0 lg:px-4">
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Route class="size-4" />
              {$t(i18nKeys.common.domain.destination)}
            </p>
            <p class="mt-2 truncate font-semibold">
              {(resource.destinationId ?? latestDeployment?.destinationId ?? destinationId) || "-"}
            </p>
          </div>
        </div>
      </section>

      <Tabs.Root value={activeTab} class="space-y-5">
        <Tabs.List
          class="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b bg-transparent p-0"
        >
          {#each resourceDetailTabs as tab (tab)}
            <Tabs.Trigger
              value={tab}
              class="h-11 flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 py-0 shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              onclick={(event) => selectResourceTab(tab, event)}
            >
              {resourceTabLabel(tab)}
            </Tabs.Trigger>
          {/each}
        </Tabs.List>

        <Tabs.Content value="deployments" class="mt-0 space-y-4">
          <section class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.resources.deploymentsTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.deploymentsDescription)}
                </p>
              </div>
              <Button href={resourceDeploymentHref()}>
                <Plus class="size-4" />
                {$t(i18nKeys.common.actions.newDeployment)}
              </Button>
            </div>

            <div>
              {#if resourceDeployments.length > 0}
                <DeploymentTable
                  deployments={resourceDeployments}
                  {servers}
                  showProject={false}
                  showEnvironment={false}
                  showResource={false}
                  showServer
                />
              {:else}
                <div class="border-y bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.noDeployments)}
                </div>
              {/if}
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content value="access" class="mt-0 space-y-8">
          <section class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.resources.domainBindingsTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.domainBindingsDescription)}
                </p>
              </div>
            </div>

            <div class="space-y-3">
              {#if resourceDomainBindings.length > 0}
                {#each resourceDomainBindings as binding (binding.id)}
                  {@const server = findServer(servers, binding.serverId)}
                  <article class="border-y py-3">
                    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div class="min-w-0 space-y-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <Globe2 class="size-4 text-muted-foreground" />
                          <a
                            class="truncate font-medium text-primary underline-offset-4 hover:underline"
                            href={domainBindingHref(binding)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {binding.domainName}
                          </a>
                          <Badge variant={domainBindingStatusVariant(binding.status)}>
                            {domainBindingStatusLabel(binding.status)}
                          </Badge>
                        </div>
                        <p class="text-sm text-muted-foreground">
                          {binding.pathPrefix} · {binding.proxyKind} · {$t(
                            i18nKeys.common.domain.tls,
                          )}
                          {" "}
                          {binding.tlsMode}
                        </p>
                      </div>
                      <p class="text-xs text-muted-foreground">{formatTime(binding.createdAt)}</p>
                    </div>
                    <div class="mt-3 grid gap-3 sm:grid-cols-3">
                      <div class="bg-muted/25 px-3 py-2">
                        <p class="text-xs text-muted-foreground">
                          {$t(i18nKeys.common.domain.server)}
                        </p>
                        <p class="mt-1 truncate text-sm font-medium">
                          {server?.name ?? binding.serverId}
                        </p>
                      </div>
                      <div class="bg-muted/25 px-3 py-2">
                        <p class="text-xs text-muted-foreground">
                          {$t(i18nKeys.common.domain.destination)}
                        </p>
                        <p class="mt-1 truncate text-sm font-medium">{binding.destinationId}</p>
                      </div>
                      <div class="bg-muted/25 px-3 py-2">
                        <p class="text-xs text-muted-foreground">
                          {$t(i18nKeys.console.domainBindings.verificationAttempts, {
                            count: binding.verificationAttemptCount,
                          })}
                        </p>
                        <p class="mt-1 truncate text-sm font-medium">
                          {binding.certificatePolicy}
                        </p>
                      </div>
                    </div>
                  </article>
                {/each}
              {:else}
                <div class="bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.noDomainBindings)}
                </div>
              {/if}
            </div>
          </section>

          <section class="space-y-4 border-t pt-6">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div class="flex items-start gap-3">
                <div class="bg-muted p-2">
                  <Route class="size-4" />
                </div>
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-lg font-semibold">
                      {$t(i18nKeys.console.resources.proxyConfigurationTitle)}
                    </h2>
                    {#if proxyConfiguration}
                      <Badge variant={proxyConfigurationStatusVariant(proxyConfiguration.status)}>
                        {proxyConfigurationStatusLabel(proxyConfiguration.status)}
                      </Badge>
                    {/if}
                  </div>
                  <p class="mt-1 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.resources.proxyConfigurationDescription)}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onclick={refreshProxyConfiguration}
                disabled={proxyConfigurationLoading}
              >
                <RefreshCw class={["size-4", proxyConfigurationLoading ? "animate-spin" : ""]} />
                {$t(i18nKeys.console.resources.proxyConfigurationRefresh)}
              </Button>
            </div>

            {#if proxyConfigurationError}
              <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {proxyConfigurationError}
              </div>
            {/if}

            <div class="space-y-3">
              {#if proxyConfigurationLoading}
                <div class="bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.proxyConfigurationLoading)}
                </div>
              {:else if !proxyConfiguration || proxyConfiguration.sections.length === 0}
                <div class="bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.proxyConfigurationEmpty)}
                </div>
              {:else}
                <div class="grid gap-3 md:grid-cols-3">
                  <div class="bg-muted/30 px-3 py-2 text-sm">
                    <span class="text-muted-foreground">{$t(i18nKeys.common.domain.proxy)}</span>
                    <span class="ml-2 font-medium">{proxyConfiguration.providerKey}</span>
                  </div>
                  <div class="bg-muted/30 px-3 py-2 text-sm">
                    <span class="text-muted-foreground">{$t(i18nKeys.common.domain.resources)}</span>
                    <span class="ml-2 font-medium">{proxyConfiguration.routes.length}</span>
                  </div>
                  <div class="bg-muted/30 px-3 py-2 text-sm">
                    <span class="text-muted-foreground">
                      {$t(i18nKeys.console.resources.proxyConfigurationGeneratedAt)}
                    </span>
                    <span class="ml-2 font-medium">{formatTime(proxyConfiguration.generatedAt)}</span>
                  </div>
                </div>

                {#each proxyConfiguration.sections as section (section.id)}
                  <article class="bg-muted/20">
                    <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <h3 class="font-medium">{section.title}</h3>
                      <Badge variant="outline">{section.format}</Badge>
                    </div>
                    <pre class="max-h-80 overflow-auto p-4 text-xs"><code>{section.content}</code></pre>
                  </article>
                {/each}
              {/if}
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content value="settings" class="mt-0 space-y-5">
          <ResourceProfileSummary
            {resource}
            projectName={project?.name ?? resource.projectId}
            environmentName={environment?.name ?? resource.environmentId}
            destinationId={defaultDestinationId}
          />
        </Tabs.Content>

        <Tabs.Content value="logs" class="mt-0 space-y-5">
      <section class="space-y-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="flex items-start gap-3">
            <div class="bg-muted p-2">
              <Terminal class="size-4" />
            </div>
            <div>
              <h2 class="text-lg font-semibold">
                {$t(i18nKeys.console.resources.runtimeLogsTitle)}
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.resources.runtimeLogsDescription)}
              </p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onclick={refreshRuntimeLogs}
              disabled={runtimeLogsLoading || runtimeLogsFollowing}
            >
              <RefreshCw class={["size-4", runtimeLogsLoading ? "animate-spin" : ""]} />
              {$t(i18nKeys.console.resources.runtimeLogsRefresh)}
            </Button>
            <Button
              variant={runtimeLogsFollowing ? "secondary" : "default"}
              onclick={runtimeLogsFollowing ? stopRuntimeLogFollow : startRuntimeLogFollow}
            >
              <Terminal class="size-4" />
              {runtimeLogsFollowing
                ? $t(i18nKeys.console.resources.runtimeLogsStopFollow)
                : $t(i18nKeys.console.resources.runtimeLogsStartFollow)}
            </Button>
          </div>
        </div>

        {#if runtimeLogsError}
          <div class="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {runtimeLogsError}
          </div>
        {/if}

        <div class="mt-4 max-h-96 overflow-auto rounded-md border bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
          {#if runtimeLogsLoading}
            <p class="text-zinc-400">{$t(i18nKeys.console.resources.runtimeLogsLoading)}</p>
          {:else if runtimeLogs.length === 0}
            <p class="text-zinc-400">{$t(i18nKeys.console.resources.runtimeLogsEmpty)}</p>
          {:else}
            <div class="space-y-1">
              {#each runtimeLogs as line, index (`${line.sequence ?? index}-${line.timestamp ?? ""}-${line.message}`)}
                <div class="grid gap-2 sm:grid-cols-[10rem_1fr]">
                  <span class="truncate text-zinc-500">
                    {line.timestamp ? formatTime(line.timestamp) : line.stream}
                  </span>
                  <span class={["break-words", line.masked ? "text-amber-200" : "text-zinc-100"]}>
                    {line.message}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </section>

        </Tabs.Content>
      </Tabs.Root>

      <Dialog.Root bind:open={domainBindingDialogOpen}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.domainBindings.resourceScopedTitle)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.domainBindings.resourceScopedDescription)}
            </Dialog.Description>
          </Dialog.Header>

          <form class="space-y-5 px-5 pb-5" onsubmit={createResourceDomainBinding}>
            <div class="flex flex-wrap gap-x-4 gap-y-1 border-y py-3 text-xs text-muted-foreground">
              <span>{$t(i18nKeys.common.domain.resource)}: {resource.name}</span>
              <span>
                {$t(i18nKeys.common.domain.server)}:
                {selectedServer?.name ?? latestDeployment?.serverId ?? "-"}
              </span>
              <span>{$t(i18nKeys.common.domain.destination)}: {destinationId || "-"}</span>
            </div>

            <div class="grid gap-4">
              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.domainName)}</span>
                <Input
                  bind:value={domainName}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.domainBindings.formDomainPlaceholder)}
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.pathPrefix)}</span>
                <Input bind:value={pathPrefix} autocomplete="off" placeholder="/" />
              </label>
            </div>

            <div class="grid gap-4">
              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.tls)}</span>
                <Select.Root bind:value={tlsMode} type="single">
                  <Select.Trigger class="w-full">{tlsMode}</Select.Trigger>
                  <Select.Content>
                    <Select.Item value="auto">auto</Select.Item>
                    <Select.Item value="disabled">disabled</Select.Item>
                  </Select.Content>
                </Select.Root>
              </label>
            </div>

            {#if shouldShowServerField || shouldShowDestinationField}
              <div class="grid gap-4 sm:grid-cols-2">
                {#if shouldShowServerField}
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.common.domain.server)}</span>
                    <Select.Root bind:value={serverId} type="single">
                      <Select.Trigger class="w-full">
                        {selectedServer?.name ?? $t(i18nKeys.console.domainBindings.noServerOptions)}
                      </Select.Trigger>
                      <Select.Content>
                        {#each servers as server (server.id)}
                          <Select.Item value={server.id}>{server.name}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </label>
                {/if}

                {#if shouldShowDestinationField}
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.common.domain.destination)}</span>
                    <Input
                      bind:value={destinationId}
                      autocomplete="off"
                      placeholder={$t(i18nKeys.console.domainBindings.formDestinationPlaceholder)}
                    />
                  </label>
                {/if}
              </div>
            {/if}

            {#if createFeedback}
              <div
                class={[
                  "rounded-md border px-3 py-2 text-sm",
                  createFeedback.kind === "success"
                    ? "border-primary/25 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5 text-destructive",
                ]}
              >
                <p class="font-medium">{createFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{createFeedback.detail}</p>
              </div>
            {/if}

            <Dialog.Footer>
              <Button
                type="button"
                variant="outline"
                onclick={() => {
                  domainBindingDialogOpen = false;
                }}
              >
                {$t(i18nKeys.common.actions.close)}
              </Button>
              <Button
                type="submit"
                disabled={!canCreateBinding || createDomainBindingMutation.isPending}
              >
                <Globe2 class="size-4" />
                {createDomainBindingMutation.isPending
                  ? $t(i18nKeys.console.domainBindings.formSubmitting)
                  : $t(i18nKeys.common.actions.bindDomain)}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  {/if}
</ConsoleShell>

<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    ArrowLeft,
    ArrowRight,
    Boxes,
    ExternalLink,
    Check,
    Copy,
    KeyRound,
    Link2,
    ListChecks,
    Package,
    PlugZap,
  } from "@lucide/svelte";
  import type { TranslationKey } from "@appaloft/i18n";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import { readErrorMessage, request } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    detailHeaderClass,
    detailPageClass,
    detailTabClass,
    detailTabPanelScrollClass,
    detailTabsClass,
    detailTabsScrollAreaClass,
  } from "$lib/console/layout-classes";
  import { deploymentDetailHref, formatTime, projectDetailHref, resourceDetailHref } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { queryClient } from "$lib/query-client";

  type InstalledApplicationResourceRef =
    | { status: "planned"; resourceSlug?: string }
    | { status: "realized"; resourceSlug?: string; resourceId?: string };
  type InstalledApplicationDeploymentRef =
    | { status: "planned"; reason?: string }
    | { status: "realized"; deploymentId?: string; reason?: string };
  type InstalledApplicationEndpoint = {
    componentId?: string;
    label?: string;
    url?: string;
    public?: boolean;
  };
  type InstalledApplicationComponent = {
    componentId: string;
    name?: string;
    kind?: string;
    resource?: InstalledApplicationResourceRef;
    deployment?: InstalledApplicationDeploymentRef;
    endpoints?: readonly InstalledApplicationEndpoint[];
  };
  type InstalledApplicationDependency = {
    requirementId: string;
    kind?: string;
    engine?: string;
    version?: string;
    bindingStatus?: string;
    plannedMode?: string;
    dependencyResourceId?: string;
    maskedConnection?: string;
    componentIds?: readonly string[];
  };
  type InstalledApplicationProgress = {
    schemaVersion?: string;
    applicationId?: string;
    userStatus?: "running" | "succeeded" | "failed";
    currentStep?: string;
    message?: string;
    deploymentIds?: readonly string[];
  };
  type InstalledApplicationInitialAccessCredential = {
    credentialId: string;
    componentId?: string;
    key: string;
    status: "pending" | "revealed" | "expired";
    createdAt?: string;
    expiresAt?: string;
    revealedAt?: string;
    revealedBy?: string;
    resetRequired?: boolean;
    claimEndpoint?: string;
  };
  type InstalledApplicationDetail = {
    applicationId?: string;
    status?: string;
    application?: {
      name?: string;
      projectId?: string;
      projectName?: string;
      environmentId?: string;
      environmentName?: string;
      source?: {
        marketplaceSlug?: string;
        marketplaceTitle?: string;
        blueprintId?: string;
        blueprintName?: string;
        blueprintVersion?: string;
        blueprintVariant?: string;
        profile?: string;
      };
    };
    components?: readonly InstalledApplicationComponent[];
    dependencies?: readonly InstalledApplicationDependency[];
    progress?: InstalledApplicationProgress;
    executionFailure?: {
      reason?: string;
      code?: string;
      details?: Record<string, unknown>;
    };
    rollback?: {
      requestedAt?: string;
      completedAt?: string;
      reason?: string;
    };
    initialAccessCredentials?: readonly InstalledApplicationInitialAccessCredential[];
    createdAt?: string;
    lastChangedAt?: string;
  };
  type InitialAccessCredentialClaimResult = {
    schemaVersion?: string;
    applicationId?: string;
    credential: {
      credentialId: string;
      key: string;
      value: string;
    };
    installedApplication?: InstalledApplicationDetail;
  };
  type InstalledApplicationTab = "overview" | "resources" | "dependencies" | "access" | "history";
  type InstalledApplicationTabItem = { value: InstalledApplicationTab; labelKey: TranslationKey };

  let revealedInitialAccessCredentials = $state<
    Record<string, { readonly key: string; readonly value: string }>
  >({});
  let initialAccessCredentialFeedback = $state<Record<string, string>>({});
  let initialAccessCredentialCopyState = $state<Record<string, "idle" | "copied" | "failed">>({});

  const installedApplicationTabs: InstalledApplicationTabItem[] = [
    { value: "overview", labelKey: i18nKeys.console.installedApplications.tabOverview },
    { value: "resources", labelKey: i18nKeys.console.installedApplications.tabResources },
    { value: "dependencies", labelKey: i18nKeys.console.installedApplications.tabDependencies },
    { value: "access", labelKey: i18nKeys.console.installedApplications.tabAccess },
    { value: "history", labelKey: i18nKeys.console.installedApplications.tabHistory },
  ];

  const applicationId = $derived(page.params.applicationId ?? "");
  const installedApplicationQuery = createQuery(() =>
    queryOptions({
      queryKey: ["installed-applications", "show", applicationId],
      queryFn: () =>
        request<InstalledApplicationDetail>(
          `/api/blueprints/installations/${encodeURIComponent(applicationId)}`,
        ),
      enabled: browser && applicationId.length > 0,
      staleTime: 5_000,
      retry: 0,
    }),
  );
  const installedApplication = $derived(installedApplicationQuery.data ?? null);
  const components = $derived(installedApplication?.components ?? []);
  const dependencies = $derived(installedApplication?.dependencies ?? []);
  const initialAccessCredentials = $derived(installedApplication?.initialAccessCredentials ?? []);
  const publicEndpoints = $derived(
    components.flatMap((component) =>
      (component.endpoints ?? [])
        .filter((endpoint) => endpoint.url)
        .map((endpoint) => ({
          componentId: component.componentId,
          componentName: component.name ?? component.componentId,
          label: endpoint.label ?? component.name ?? component.componentId,
          url: endpoint.url ?? "",
          public: endpoint.public ?? false,
        })),
    ),
  );
  const deploymentIds = $derived(
    [
      ...(installedApplication?.progress?.deploymentIds ?? []),
      ...components.flatMap((component) =>
        component.deployment &&
        component.deployment.status === "realized" &&
        component.deployment.deploymentId
          ? [component.deployment.deploymentId]
          : [],
      ),
    ].filter((deploymentId, index, all) => all.indexOf(deploymentId) === index),
  );
  const firstRealizedResource = $derived(
    components.find(
      (component) => component.resource?.status === "realized" && component.resource.resourceId,
    ),
  );
  const projectHref = $derived(
    installedApplication?.application?.projectId
      ? projectDetailHref(installedApplication.application.projectId)
      : "",
  );
  const primaryResourceHref = $derived(
    firstRealizedResource &&
      firstRealizedResource.resource?.status === "realized" &&
      firstRealizedResource.resource.resourceId &&
      installedApplication?.application?.projectId &&
      installedApplication.application.environmentId
      ? resourceDetailHref({
          id: firstRealizedResource.resource.resourceId,
          projectId: installedApplication.application.projectId,
          environmentId: installedApplication.application.environmentId,
        })
      : "",
  );
  const breadcrumbs = $derived([
    { label: $t(i18nKeys.console.installedApplications.breadcrumbMarketplace), href: "/marketplace" },
    { label: $t(i18nKeys.console.installedApplications.breadcrumbCurrent), href: "/marketplace" },
    { label: installedApplication?.application?.name ?? applicationId },
  ]);
  const activeTab = $derived(parseInstalledApplicationTab(page.url.searchParams.get("tab")));
  const latestDeploymentHref = $derived(deploymentIds[0] ? deploymentHref(deploymentIds[0]) : "");
  const latestDeploymentLabel = $derived(
    deploymentIds[0] ?? $t(i18nKeys.console.installedApplications.latestDeploymentEmpty),
  );
  const initialAccessCredentialClaimMutation = createMutation(() => ({
    mutationFn: (credential: InstalledApplicationInitialAccessCredential) => {
      if (!credential.claimEndpoint) {
        throw new Error($t(i18nKeys.console.installedApplications.initialAccessCredentialUnavailable));
      }
      return request<InitialAccessCredentialClaimResult>(credential.claimEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
    },
    onSuccess: (result) => {
      revealedInitialAccessCredentials = {
        ...revealedInitialAccessCredentials,
        [result.credential.credentialId]: {
          key: result.credential.key,
          value: result.credential.value,
        },
      };
      initialAccessCredentialFeedback = {
        ...initialAccessCredentialFeedback,
        [result.credential.credentialId]: $t(
          i18nKeys.console.installedApplications.initialAccessCredentialRevealedHint,
        ),
      };
      void queryClient.invalidateQueries({
        queryKey: ["installed-applications", "show", applicationId],
      });
    },
  }));

  function parseInstalledApplicationTab(value: string | null): InstalledApplicationTab {
    if (
      value === "resources" ||
      value === "dependencies" ||
      value === "access" ||
      value === "history"
    ) {
      return value;
    }

    return "overview";
  }

  function installedApplicationTabHref(tab: InstalledApplicationTab): string {
    const params = new URLSearchParams();
    if (tab !== "overview") {
      params.set("tab", tab);
    }
    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectInstalledApplicationTab(tab: InstalledApplicationTab, event: MouseEvent): void {
    event.preventDefault();
    void goto(installedApplicationTabHref(tab), { noScroll: true, keepFocus: true });
  }

  function deploymentHref(deploymentId: string): string {
    if (
      installedApplication?.application?.projectId &&
      installedApplication.application.environmentId &&
      firstRealizedResource?.resource?.status === "realized" &&
      firstRealizedResource.resource.resourceId
    ) {
      return deploymentDetailHref({
        id: deploymentId,
        projectId: installedApplication.application.projectId,
        environmentId: installedApplication.application.environmentId,
        resourceId: firstRealizedResource.resource.resourceId,
      });
    }

    return `/deployments/${encodeURIComponent(deploymentId)}`;
  }

  function dependencyResourceHref(dependencyResourceId?: string): string {
    if (!dependencyResourceId) return "/dependency-resources";
    const params = new URLSearchParams({ resourceId: dependencyResourceId });
    return `/dependency-resources?${params.toString()}`;
  }

  function initialAccessCredentialStatusLabel(
    credential: InstalledApplicationInitialAccessCredential,
  ): string {
    if (credential.status === "pending") {
      return $t(i18nKeys.console.installedApplications.initialAccessCredentialPending);
    }
    if (credential.status === "expired") {
      return $t(i18nKeys.console.installedApplications.initialAccessCredentialExpired);
    }
    return $t(i18nKeys.console.installedApplications.initialAccessCredentialRevealed);
  }

  function canClaimInitialAccessCredential(
    credential: InstalledApplicationInitialAccessCredential,
  ): boolean {
    return credential.status === "pending" && Boolean(credential.claimEndpoint);
  }

  async function claimInitialAccessCredential(
    credential: InstalledApplicationInitialAccessCredential,
  ): Promise<void> {
    initialAccessCredentialFeedback = {
      ...initialAccessCredentialFeedback,
      [credential.credentialId]: "",
    };
    try {
      await initialAccessCredentialClaimMutation.mutateAsync(credential);
    } catch (error) {
      initialAccessCredentialFeedback = {
        ...initialAccessCredentialFeedback,
        [credential.credentialId]: readErrorMessage(error),
      };
    }
  }

  async function copyInitialAccessCredential(credentialId: string): Promise<void> {
    const revealed = revealedInitialAccessCredentials[credentialId];
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.value);
      initialAccessCredentialCopyState = {
        ...initialAccessCredentialCopyState,
        [credentialId]: "copied",
      };
    } catch {
      initialAccessCredentialCopyState = {
        ...initialAccessCredentialCopyState,
        [credentialId]: "failed",
      };
    }
  }

  function initialAccessCredentialCopyLabel(credentialId: string): string {
    const state = initialAccessCredentialCopyState[credentialId] ?? "idle";
    if (state === "copied") {
      return $t(i18nKeys.console.installedApplications.initialAccessCredentialCopied);
    }
    if (state === "failed") {
      return $t(i18nKeys.console.installedApplications.initialAccessCredentialCopyFailed);
    }
    return $t(i18nKeys.console.installedApplications.initialAccessCredentialCopy);
  }
</script>

<svelte:head>
  <title>{installedApplication?.application?.name ?? applicationId} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={installedApplication?.application?.name ?? $t(i18nKeys.console.installedApplications.pageFallbackTitle)}
  description={$t(i18nKeys.console.installedApplications.pageDescription)}
  {breadcrumbs}
>
  <Skeleton
    name="installed-application-detail-page"
    loading={installedApplicationQuery.isPending}
    animate="pulse"
    transition
  >
    {#snippet fallback()}
      <div class="min-h-[28rem] w-full animate-pulse rounded-lg bg-muted/50" aria-hidden="true"></div>
    {/snippet}
    {#snippet fixture()}
      <div class="space-y-5 p-4 md:p-6">
        <header class="space-y-2">
          <h1 class="text-2xl font-semibold">Sample Application</h1>
          <p class="text-sm text-muted-foreground">Installed application detail</p>
        </header>
        <section class="console-panel space-y-3 p-5">
          <h2 class="text-lg font-semibold">Overview</h2>
          <p class="text-sm text-muted-foreground">running · marketplace install</p>
        </section>
      </div>
    {/snippet}
    {#if installedApplicationQuery.isPending}
      <div class="min-h-[28rem]" aria-hidden="true"></div>
    {:else if installedApplicationQuery.error || !installedApplication}
    <section class="console-panel m-4 p-5 md:m-6">
      <div class="flex items-start gap-3">
        <Package class="mt-0.5 size-5 text-destructive" />
        <div class="space-y-2">
          <Badge variant="outline">{$t(i18nKeys.console.installedApplications.notFoundBadge)}</Badge>
          <h1 class="text-xl font-semibold">{$t(i18nKeys.console.installedApplications.notFoundTitle)}</h1>
          <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.installedApplications.notFoundDescription)}
          </p>
          <Button href="/marketplace" variant="outline">
            <ArrowLeft class="size-4" />
            {$t(i18nKeys.console.installedApplications.backToMarketplace)}
          </Button>
        </div>
      </div>
    </section>
  {:else}
    <div
      class={[detailPageClass, "mx-auto w-full max-w-7xl space-y-0 p-4 md:p-6"]}
      data-installed-application-display-surface
    >
      <section class={detailHeaderClass} data-installed-application-overview>
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{installedApplication.status ?? "unknown"}</Badge>
              <Badge variant="outline">
                {installedApplication.application?.source?.marketplaceTitle ??
                  installedApplication.application?.source?.marketplaceSlug ??
                  "Blueprint"}
              </Badge>
              {#if installedApplication.progress?.userStatus}
                <Badge variant={installedApplication.progress.userStatus === "failed" ? "destructive" : "outline"}>
                  {installedApplication.progress.userStatus}
                </Badge>
              {/if}
            </div>
            <h1 class="text-2xl font-semibold md:text-3xl">
              {installedApplication.application?.name ?? installedApplication.applicationId ?? applicationId}
            </h1>
            <p class="text-sm leading-6 text-muted-foreground">
              {installedApplication.application?.projectName ??
                installedApplication.application?.projectId ??
                $t(i18nKeys.console.installedApplications.fallbackProject)}
              {" · "}
              {installedApplication.application?.environmentName ??
                installedApplication.application?.environmentId ??
                $t(i18nKeys.console.installedApplications.fallbackEnvironment)}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            {#if projectHref}
              <Button href={projectHref} variant="outline">
                {$t(i18nKeys.console.installedApplications.openProject)}
                <ArrowRight class="size-4" />
              </Button>
            {/if}
            {#if primaryResourceHref}
              <Button href={primaryResourceHref}>
                {$t(i18nKeys.console.installedApplications.openPrimaryResource)}
                <ArrowRight class="size-4" />
              </Button>
            {/if}
          </div>
        </div>
      </section>

      <ScrollArea class={detailTabsScrollAreaClass}>
        <nav class={detailTabsClass} aria-label={$t(i18nKeys.console.installedApplications.tabAriaLabel)}>
          {#each installedApplicationTabs as tab (tab.value)}
            <a
              href={installedApplicationTabHref(tab.value)}
              onclick={(event) => selectInstalledApplicationTab(tab.value, event)}
              class={detailTabClass}
              aria-current={activeTab === tab.value ? "page" : undefined}
            >
              {$t(tab.labelKey)}
            </a>
          {/each}
        </nav>
      </ScrollArea>

      <div class={detailTabPanelScrollClass}>
        {#if activeTab === "overview"}
          <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div class="min-w-0 space-y-5">
              <section class="grid gap-3 md:grid-cols-3" data-installed-application-outcome-summary>
                <article class="console-panel p-4">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <Boxes class="size-4 text-muted-foreground" />
                    {$t(i18nKeys.console.installedApplications.outcomeResources)}
                  </div>
                  <p class="mt-3 text-2xl font-semibold">{components.length}</p>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {$t(i18nKeys.console.installedApplications.outcomeResourcesDescription)}
                  </p>
                </article>
                <article class="console-panel p-4">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <PlugZap class="size-4 text-muted-foreground" />
                    {$t(i18nKeys.console.installedApplications.outcomeDependencies)}
                  </div>
                  <p class="mt-3 text-2xl font-semibold">{dependencies.length}</p>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {$t(i18nKeys.console.installedApplications.outcomeDependenciesDescription)}
                  </p>
                </article>
                <article class="console-panel p-4">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <Link2 class="size-4 text-muted-foreground" />
                    {$t(i18nKeys.console.installedApplications.outcomePublicUrls)}
                  </div>
                  <p class="mt-3 text-2xl font-semibold">{publicEndpoints.length}</p>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {$t(i18nKeys.console.installedApplications.outcomePublicUrlsDescription)}
                  </p>
                </article>
              </section>

              <section class="console-panel p-5" data-installed-application-owner-handoff>
                <div class="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 class="text-lg font-semibold">{$t(i18nKeys.console.installedApplications.nextActionsTitle)}</h2>
                    <p class="mt-1 text-sm leading-6 text-muted-foreground">
                      {$t(i18nKeys.console.installedApplications.nextActionsDescription)}
                    </p>
                  </div>
                  <ListChecks class="size-5 text-muted-foreground" />
                </div>
                <div class="grid gap-3 md:grid-cols-3">
                  <article class="rounded-md border bg-muted/20 p-4">
                    <p class="text-sm font-medium">{$t(i18nKeys.console.installedApplications.projectSummaryTitle)}</p>
                    <p class="mt-1 text-xs leading-5 text-muted-foreground">
                      {$t(i18nKeys.console.installedApplications.projectSummaryDescription)}
                    </p>
                    {#if projectHref}
                      <Button href={projectHref} variant="outline" size="sm" class="mt-3">
                        {$t(i18nKeys.console.installedApplications.openProject)}
                        <ArrowRight class="size-4" />
                      </Button>
                    {/if}
                  </article>
                  <article class="rounded-md border bg-muted/20 p-4">
                    <p class="text-sm font-medium">{$t(i18nKeys.console.installedApplications.resourceControlsTitle)}</p>
                    <p class="mt-1 text-xs leading-5 text-muted-foreground">
                      {$t(i18nKeys.console.installedApplications.resourceControlsDescription)}
                    </p>
                    {#if primaryResourceHref}
                      <Button href={primaryResourceHref} size="sm" class="mt-3">
                        {$t(i18nKeys.console.installedApplications.openPrimaryResource)}
                        <ArrowRight class="size-4" />
                      </Button>
                    {/if}
                  </article>
                  <article class="rounded-md border bg-muted/20 p-4">
                    <p class="text-sm font-medium">{$t(i18nKeys.console.installedApplications.deploymentObservationTitle)}</p>
                    <p class="mt-1 text-xs leading-5 text-muted-foreground">
                      {$t(i18nKeys.console.installedApplications.latestDeploymentLabel)}
                      <span class="font-mono">{latestDeploymentLabel}</span>
                    </p>
                    {#if latestDeploymentHref}
                      <Button href={latestDeploymentHref} variant="outline" size="sm" class="mt-3">
                        {$t(i18nKeys.console.installedApplications.openLatestDeployment)}
                        <ArrowRight class="size-4" />
                      </Button>
                    {/if}
                  </article>
                </div>
              </section>
            </div>

            <aside class="min-w-0 space-y-5 xl:sticky xl:top-20 xl:self-start">
              <section class="console-side-panel space-y-4" data-installed-application-handoff>
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h2 class="text-lg font-semibold">{$t(i18nKeys.console.installedApplications.installResultTitle)}</h2>
                    <p class="text-sm text-muted-foreground">
                      {$t(i18nKeys.console.installedApplications.installResultDescription)}
                    </p>
                  </div>
                  <ListChecks class="size-5 text-muted-foreground" />
                </div>

                <div class="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted-foreground">Application ID</span>
                    <span class="min-w-0 truncate font-mono">{installedApplication.applicationId ?? applicationId}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted-foreground">Blueprint</span>
                    <span class="min-w-0 truncate font-medium">
                      {installedApplication.application?.source?.blueprintName ??
                        installedApplication.application?.source?.blueprintId ??
                        "Blueprint"}
                    </span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted-foreground">{$t(i18nKeys.console.installedApplications.versionLabel)}</span>
                    <span class="font-mono">
                      {installedApplication.application?.source?.blueprintVersion ??
                        $t(i18nKeys.common.status.unknown)}
                    </span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted-foreground">{$t(i18nKeys.console.installedApplications.updatedAtLabel)}</span>
                    <span class="font-mono">
                      {installedApplication.lastChangedAt
                        ? formatTime(installedApplication.lastChangedAt)
                        : $t(i18nKeys.common.status.unknown)}
                    </span>
                  </div>
                </div>

                {#if installedApplication.progress}
                  <div class="console-subtle-panel px-3 py-2 text-sm">
                    <p class="font-medium">{installedApplication.progress.currentStep ?? installedApplication.status}</p>
                    <p class="mt-1 text-xs leading-5 text-muted-foreground">
                      {installedApplication.progress.message ??
                        $t(i18nKeys.console.installedApplications.progressFallback)}
                    </p>
                  </div>
                {/if}

                {#if installedApplication.executionFailure}
                  <div class="console-subtle-panel border-destructive/30 px-3 py-2 text-sm text-destructive">
                    {installedApplication.executionFailure.reason ?? installedApplication.executionFailure.code ?? "Install failed"}
                  </div>
                {/if}
              </section>
            </aside>
          </div>
        {:else if activeTab === "resources"}
          <section class="console-panel p-5" data-installed-application-resources>
            <div class="mb-4 flex items-center gap-2">
              <Boxes class="size-4 text-muted-foreground" />
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.installedApplications.resourcesTitle)}</h2>
            </div>
            <div class="space-y-3">
              {#each components as component (component.componentId)}
                <article class="console-subtle-panel p-4">
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0">
                      <h3 class="font-semibold">{component.name ?? component.componentId}</h3>
                      <p class="mt-1 text-sm text-muted-foreground">
                        {component.kind ?? $t(i18nKeys.console.installedApplications.componentFallback)} · {component.resource?.status ?? $t(i18nKeys.console.installedApplications.plannedStatus)}
                      </p>
                    </div>
                    {#if component.resource?.status === "realized" && component.resource.resourceId && installedApplication.application?.projectId && installedApplication.application.environmentId}
                      <Button
                        href={resourceDetailHref({
                          id: component.resource.resourceId,
                          projectId: installedApplication.application.projectId,
                          environmentId: installedApplication.application.environmentId,
                        })}
                        size="sm"
                        variant="outline"
                      >
                        {$t(i18nKeys.console.installedApplications.openResource)}
                        <ArrowRight class="size-4" />
                      </Button>
                    {/if}
                  </div>
                </article>
              {:else}
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.installedApplications.resourcesEmpty)}
                </p>
              {/each}
            </div>
          </section>
        {:else if activeTab === "dependencies"}
          <section class="console-panel p-5" data-installed-application-dependencies>
            <div class="mb-4 flex items-center gap-2">
              <PlugZap class="size-4 text-muted-foreground" />
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.installedApplications.dependenciesTitle)}</h2>
            </div>
            <div class="space-y-3">
              {#each dependencies as dependency (dependency.requirementId)}
                <article class="console-subtle-panel p-4">
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="font-semibold">{dependency.requirementId}</h3>
                        <Badge variant="outline">{dependency.bindingStatus ?? "planned"}</Badge>
                      </div>
                      <p class="mt-1 text-sm text-muted-foreground">
                        {dependency.kind ?? $t(i18nKeys.console.installedApplications.dependencyFallback)} · {dependency.plannedMode ?? $t(i18nKeys.console.installedApplications.dependencyModeFallback)}
                      </p>
                    </div>
                    <Button href={dependencyResourceHref(dependency.dependencyResourceId)} size="sm" variant="outline">
                      {$t(i18nKeys.console.installedApplications.openGovernance)}
                      <ArrowRight class="size-4" />
                    </Button>
                  </div>
                </article>
              {:else}
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.installedApplications.dependenciesEmpty)}
                </p>
              {/each}
            </div>
          </section>
        {:else if activeTab === "access"}
          <section class="console-panel p-5" data-installed-application-access>
            <div class="mb-4 flex items-center gap-2">
              <Link2 class="size-4 text-muted-foreground" />
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.installedApplications.accessTitle)}</h2>
            </div>
            <div class="space-y-5">
              {#if initialAccessCredentials.length > 0}
                <section class="space-y-3" data-installed-application-initial-access-credentials>
                  <div>
                    <h3 class="text-sm font-semibold">
                      {$t(i18nKeys.console.installedApplications.initialAccessCredentialsTitle)}
                    </h3>
                    <p class="mt-1 text-xs leading-5 text-muted-foreground">
                      {$t(i18nKeys.console.installedApplications.initialAccessCredentialsDescription)}
                    </p>
                  </div>
                  {#each initialAccessCredentials as credential (credential.credentialId)}
                    {@const revealedCredential = revealedInitialAccessCredentials[credential.credentialId]}
                    <article class="console-subtle-panel p-4" data-installed-application-initial-access-credential>
                      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div class="min-w-0 space-y-2">
                          <div class="flex flex-wrap items-center gap-2">
                            <KeyRound class="size-4 text-muted-foreground" />
                            <h4 class="font-semibold">{credential.key}</h4>
                            <Badge variant="outline">{initialAccessCredentialStatusLabel(credential)}</Badge>
                          </div>
                          <p class="text-xs leading-5 text-muted-foreground">
                            {#if credential.expiresAt && credential.status === "pending"}
                              {$t(i18nKeys.console.installedApplications.initialAccessCredentialExpiresAt)}
                              <span class="font-mono">{formatTime(credential.expiresAt)}</span>
                            {:else if credential.revealedAt}
                              {$t(i18nKeys.console.installedApplications.initialAccessCredentialRevealedAt)}
                              <span class="font-mono">{formatTime(credential.revealedAt)}</span>
                            {:else if credential.resetRequired}
                              {$t(i18nKeys.console.installedApplications.initialAccessCredentialResetRequired)}
                            {/if}
                          </p>
                          {#if revealedCredential}
                            <div class="rounded-md border bg-background p-3">
                              <p class="text-xs text-muted-foreground">
                                {$t(i18nKeys.console.installedApplications.initialAccessCredentialValueLabel)}
                              </p>
                              <p class="mt-1 break-all font-mono text-sm">{revealedCredential.value}</p>
                            </div>
                          {/if}
                          {#if initialAccessCredentialFeedback[credential.credentialId]}
                            <p class="text-xs leading-5 text-muted-foreground">
                              {initialAccessCredentialFeedback[credential.credentialId]}
                            </p>
                          {/if}
                        </div>
                        <div class="flex shrink-0 flex-wrap gap-2">
                          {#if revealedCredential}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onclick={() => copyInitialAccessCredential(credential.credentialId)}
                            >
                              {#if initialAccessCredentialCopyState[credential.credentialId] === "copied"}
                                <Check class="size-4" />
                              {:else}
                                <Copy class="size-4" />
                              {/if}
                              {initialAccessCredentialCopyLabel(credential.credentialId)}
                            </Button>
                          {:else if canClaimInitialAccessCredential(credential)}
                            <Button
                              type="button"
                              size="sm"
                              disabled={initialAccessCredentialClaimMutation.isPending}
                              onclick={() => claimInitialAccessCredential(credential)}
                            >
                              <KeyRound class="size-4" />
                              {$t(i18nKeys.console.installedApplications.initialAccessCredentialReveal)}
                            </Button>
                          {/if}
                        </div>
                      </div>
                    </article>
                  {/each}
                </section>
              {/if}
              {#if publicEndpoints.length > 0}
                <section class="space-y-3" data-installed-application-public-urls>
                  <h3 class="text-sm font-semibold">
                    {$t(i18nKeys.console.installedApplications.publicUrlsTitle)}
                  </h3>
              {#each publicEndpoints as endpoint (`${endpoint.componentId}-${endpoint.url}`)}
                <article class="console-subtle-panel p-4">
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0">
                      <h3 class="font-semibold">{endpoint.label}</h3>
                      <p class="mt-1 break-all font-mono text-xs text-muted-foreground">{endpoint.url}</p>
                    </div>
                    <Button href={endpoint.url} target="_blank" rel="noreferrer" size="sm" variant="outline">
                      {$t(i18nKeys.console.installedApplications.openPublicUrl)}
                      <ExternalLink class="size-4" />
                    </Button>
                  </div>
                </article>
                  {/each}
                </section>
              {:else if initialAccessCredentials.length === 0}
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.installedApplications.accessEmpty)}
                </p>
              {/if}
            </div>
          </section>
        {:else}
          <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section class="console-panel p-5" data-installed-application-history>
              <div class="mb-4 flex items-center gap-2">
                <ListChecks class="size-4 text-muted-foreground" />
                <h2 class="text-lg font-semibold">{$t(i18nKeys.console.installedApplications.historyTitle)}</h2>
              </div>
              <div class="space-y-3 text-sm">
                <div class="rounded-md border bg-muted/20 p-4">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.installedApplications.createdAtLabel)}</p>
                  <p class="mt-1 font-mono">
                    {installedApplication.createdAt
                      ? formatTime(installedApplication.createdAt)
                      : $t(i18nKeys.common.status.unknown)}
                  </p>
                </div>
                <div class="rounded-md border bg-muted/20 p-4">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.installedApplications.lastChangedAtLabel)}</p>
                  <p class="mt-1 font-mono">
                    {installedApplication.lastChangedAt
                      ? formatTime(installedApplication.lastChangedAt)
                      : $t(i18nKeys.common.status.unknown)}
                  </p>
                </div>
                {#if installedApplication.rollback}
                  <div class="rounded-md border bg-muted/20 p-4">
                    <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.installedApplications.rollbackTitle)}</p>
                    <p class="mt-1 text-sm">
                      {installedApplication.rollback.reason ?? "rollback requested"}
                    </p>
                  </div>
                {/if}
              </div>
            </section>

            <aside class="console-side-panel space-y-4" data-installed-application-lifecycle-gap>
              <div class="flex items-center gap-2">
                <Package class="size-4 text-muted-foreground" />
                <h2 class="text-sm font-semibold">{$t(i18nKeys.console.installedApplications.lifecycleTitle)}</h2>
              </div>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.installedApplications.lifecycleDescription)}
              </p>
              <div class="grid gap-3" data-installed-application-lifecycle-governance>
                <section class="rounded-md border bg-muted/20 p-3" data-installed-application-upgrade-governance>
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium">{$t(i18nKeys.console.installedApplications.upgradeTitle)}</p>
                    <Badge variant="outline">{$t(i18nKeys.console.installedApplications.upgradeBadge)}</Badge>
                  </div>
                  <p class="mt-2 text-xs leading-5 text-muted-foreground">
                    {$t(i18nKeys.console.installedApplications.upgradeDescription)}
                  </p>
                </section>
                <section class="rounded-md border bg-muted/20 p-3" data-installed-application-rollback-governance>
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium">{$t(i18nKeys.console.installedApplications.rollbackTitle)}</p>
                    <Badge variant="outline">
                      {installedApplication.rollback
                        ? $t(i18nKeys.console.installedApplications.rollbackRequested)
                        : $t(i18nKeys.console.installedApplications.rollbackNotRequested)}
                    </Badge>
                  </div>
                  <p class="mt-2 text-xs leading-5 text-muted-foreground">
                    {$t(i18nKeys.console.installedApplications.rollbackDescription)}
                  </p>
                </section>
                <section class="rounded-md border bg-muted/20 p-3" data-installed-application-uninstall-governance>
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium">{$t(i18nKeys.console.installedApplications.uninstallTitle)}</p>
                    <Badge variant="outline">{$t(i18nKeys.console.installedApplications.uninstallBadge)}</Badge>
                  </div>
                  <p class="mt-2 text-xs leading-5 text-muted-foreground">
                    {$t(i18nKeys.console.installedApplications.uninstallDescription)}
                  </p>
                </section>
              </div>
            </aside>
          </div>
        {/if}
      </div>
    </div>
    {/if}
  </Skeleton>
</ConsoleShell>

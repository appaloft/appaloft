<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    ArrowLeft,
    ArrowRight,
    Boxes,
    ExternalLink,
    Link2,
    ListChecks,
    Package,
    PlugZap,
  } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";

  import { request } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { deploymentDetailHref, formatTime, projectDetailHref, resourceDetailHref } from "$lib/console/utils";

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
    createdAt?: string;
    lastChangedAt?: string;
  };
  type InstalledApplicationTab = "overview" | "resources" | "dependencies" | "access" | "history";

  const installedApplicationTabs: { value: InstalledApplicationTab; label: string }[] = [
    { value: "overview", label: "概览" },
    { value: "resources", label: "资源" },
    { value: "dependencies", label: "依赖资源" },
    { value: "access", label: "访问入口" },
    { value: "history", label: "历史与生命周期" },
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
    { label: "应用市场", href: "/marketplace" },
    { label: "安装聚合", href: "/marketplace" },
    { label: installedApplication?.application?.name ?? applicationId },
  ]);
  const activeTab = $derived(parseInstalledApplicationTab(page.url.searchParams.get("tab")));
  const latestDeploymentHref = $derived(deploymentIds[0] ? deploymentHref(deploymentIds[0]) : "");
  const latestDeploymentLabel = $derived(deploymentIds[0] ?? "暂无部署记录");

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
</script>

<svelte:head>
  <title>{installedApplication?.application?.name ?? applicationId} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={installedApplication?.application?.name ?? "安装聚合"}
  description="Blueprint 安装产生的聚合视图；资源运行态、配置和网络治理仍回到 Resource owner surface。"
  {breadcrumbs}
>
  {#if installedApplicationQuery.isPending}
    <div class="space-y-5">
      <Skeleton class="h-7 w-72" />
      <Skeleton class="h-32 w-full" />
      <Skeleton class="h-72 w-full" />
    </div>
  {:else if installedApplicationQuery.error || !installedApplication}
    <section class="console-panel p-5">
      <div class="flex items-start gap-3">
        <Package class="mt-0.5 size-5 text-destructive" />
        <div class="space-y-2">
          <Badge variant="outline">not-found</Badge>
          <h1 class="text-xl font-semibold">安装聚合暂不可用</h1>
          <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
            没有读取到这个安装聚合。可以回到应用市场，或从安装完成后的 handoff 重新进入。
          </p>
          <Button href="/marketplace" variant="outline">
            <ArrowLeft class="size-4" />
            返回应用市场
          </Button>
        </div>
      </div>
    </section>
  {:else}
    <div class="console-detail-page mx-auto w-full max-w-7xl space-y-0" data-installed-application-display-surface>
      <section class="console-detail-header" data-installed-application-overview>
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
              {installedApplication.application?.projectName ?? installedApplication.application?.projectId ?? "项目"}
              {" · "}
              {installedApplication.application?.environmentName ?? installedApplication.application?.environmentId ?? "环境"}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            {#if projectHref}
              <Button href={projectHref} variant="outline">
                打开项目
                <ArrowRight class="size-4" />
              </Button>
            {/if}
            {#if primaryResourceHref}
              <Button href={primaryResourceHref}>
                打开首个资源
                <ArrowRight class="size-4" />
              </Button>
            {/if}
          </div>
        </div>
      </section>

      <nav class="console-detail-tabs" aria-label="安装聚合页面">
        {#each installedApplicationTabs as tab (tab.value)}
          <a
            href={installedApplicationTabHref(tab.value)}
            onclick={(event) => selectInstalledApplicationTab(tab.value, event)}
            class="console-detail-tab"
            aria-current={activeTab === tab.value ? "page" : undefined}
          >
            {tab.label}
          </a>
        {/each}
      </nav>

      <div class="console-detail-tab-panel console-detail-tab-panel-scroll">
        {#if activeTab === "overview"}
          <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div class="min-w-0 space-y-5">
              <section class="grid gap-3 md:grid-cols-3" data-installed-application-outcome-summary>
                <article class="console-panel p-4">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <Boxes class="size-4 text-muted-foreground" />
                    资源
                  </div>
                  <p class="mt-3 text-2xl font-semibold">{components.length}</p>
                  <p class="mt-1 text-xs text-muted-foreground">Resource owner 仍在资源页</p>
                </article>
                <article class="console-panel p-4">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <PlugZap class="size-4 text-muted-foreground" />
                    依赖
                  </div>
                  <p class="mt-3 text-2xl font-semibold">{dependencies.length}</p>
                  <p class="mt-1 text-xs text-muted-foreground">绑定和治理回到依赖资源页</p>
                </article>
                <article class="console-panel p-4">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <Link2 class="size-4 text-muted-foreground" />
                    公开 URL
                  </div>
                  <p class="mt-3 text-2xl font-semibold">{publicEndpoints.length}</p>
                  <p class="mt-1 text-xs text-muted-foreground">访问治理回到 Resource Networking</p>
                </article>
              </section>

              <section class="console-panel p-5" data-installed-application-owner-handoff>
                <div class="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 class="text-lg font-semibold">下一步</h2>
                    <p class="mt-1 text-sm leading-6 text-muted-foreground">
                      这里展示安装结果，不接管资源运行态。继续操作时回到对应 owner surface。
                    </p>
                  </div>
                  <ListChecks class="size-5 text-muted-foreground" />
                </div>
                <div class="grid gap-3 md:grid-cols-3">
                  <article class="rounded-md border bg-muted/20 p-4">
                    <p class="text-sm font-medium">项目聚合</p>
                    <p class="mt-1 text-xs leading-5 text-muted-foreground">
                      查看项目资源板、环境和部署 rollup。
                    </p>
                    {#if projectHref}
                      <Button href={projectHref} variant="outline" size="sm" class="mt-3">
                        打开项目
                        <ArrowRight class="size-4" />
                      </Button>
                    {/if}
                  </article>
                  <article class="rounded-md border bg-muted/20 p-4">
                    <p class="text-sm font-medium">资源 owner</p>
                    <p class="mt-1 text-xs leading-5 text-muted-foreground">
                      配置、网络、运行态和部署动作归 Resource。
                    </p>
                    {#if primaryResourceHref}
                      <Button href={primaryResourceHref} size="sm" class="mt-3">
                        打开首个资源
                        <ArrowRight class="size-4" />
                      </Button>
                    {/if}
                  </article>
                  <article class="rounded-md border bg-muted/20 p-4">
                    <p class="text-sm font-medium">部署观察</p>
                    <p class="mt-1 text-xs leading-5 text-muted-foreground">
                      最新部署：<span class="font-mono">{latestDeploymentLabel}</span>
                    </p>
                    {#if latestDeploymentHref}
                      <Button href={latestDeploymentHref} variant="outline" size="sm" class="mt-3">
                        打开最新部署
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
                    <h2 class="text-lg font-semibold">安装交接</h2>
                    <p class="text-sm text-muted-foreground">聚合视图，不承担资源配置所有权。</p>
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
                    <span class="text-muted-foreground">版本</span>
                    <span class="font-mono">
                      {installedApplication.application?.source?.blueprintVersion ?? "unknown"}
                    </span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted-foreground">更新时间</span>
                    <span class="font-mono">
                      {installedApplication.lastChangedAt ? formatTime(installedApplication.lastChangedAt) : "unknown"}
                    </span>
                  </div>
                </div>

                {#if installedApplication.progress}
                  <div class="console-subtle-panel px-3 py-2 text-sm">
                    <p class="font-medium">{installedApplication.progress.currentStep ?? installedApplication.status}</p>
                    <p class="mt-1 text-xs leading-5 text-muted-foreground">
                      {installedApplication.progress.message ?? "安装进度会跟随 read model 更新。"}
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
              <h2 class="text-lg font-semibold">创建的资源</h2>
            </div>
            <div class="space-y-3">
              {#each components as component (component.componentId)}
                <article class="console-subtle-panel p-4">
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0">
                      <h3 class="font-semibold">{component.name ?? component.componentId}</h3>
                      <p class="mt-1 text-sm text-muted-foreground">
                        {component.kind ?? "component"} · {component.resource?.status ?? "planned"}
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
                        打开资源
                        <ArrowRight class="size-4" />
                      </Button>
                    {/if}
                  </div>
                </article>
              {:else}
                <p class="text-sm text-muted-foreground">
                  还没有资源 readback。安装完成前这里保持为空态，不伪造运行结果。
                </p>
              {/each}
            </div>
          </section>
        {:else if activeTab === "dependencies"}
          <section class="console-panel p-5" data-installed-application-dependencies>
            <div class="mb-4 flex items-center gap-2">
              <PlugZap class="size-4 text-muted-foreground" />
              <h2 class="text-lg font-semibold">依赖资源</h2>
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
                        {dependency.kind ?? "dependency"} · {dependency.plannedMode ?? "bind"}
                      </p>
                    </div>
                    <Button href={dependencyResourceHref(dependency.dependencyResourceId)} size="sm" variant="outline">
                      打开治理
                      <ArrowRight class="size-4" />
                    </Button>
                  </div>
                </article>
              {:else}
                <p class="text-sm text-muted-foreground">这个安装聚合没有依赖资源 readback。</p>
              {/each}
            </div>
          </section>
        {:else if activeTab === "access"}
          <section class="console-panel p-5" data-installed-application-public-urls>
            <div class="mb-4 flex items-center gap-2">
              <Link2 class="size-4 text-muted-foreground" />
              <h2 class="text-lg font-semibold">公开 URL</h2>
            </div>
            <div class="space-y-3">
              {#each publicEndpoints as endpoint (`${endpoint.componentId}-${endpoint.url}`)}
                <article class="console-subtle-panel p-4">
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0">
                      <h3 class="font-semibold">{endpoint.label}</h3>
                      <p class="mt-1 break-all font-mono text-xs text-muted-foreground">{endpoint.url}</p>
                    </div>
                    <Button href={endpoint.url} target="_blank" rel="noreferrer" size="sm" variant="outline">
                      打开公开 URL
                      <ExternalLink class="size-4" />
                    </Button>
                  </div>
                </article>
              {:else}
                <p class="text-sm text-muted-foreground">
                  当前安装聚合没有公开访问摘要。域名、TLS 和访问策略仍在 Resource Networking 管理。
                </p>
              {/each}
            </div>
          </section>
        {:else}
          <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section class="console-panel p-5" data-installed-application-history>
              <div class="mb-4 flex items-center gap-2">
                <ListChecks class="size-4 text-muted-foreground" />
                <h2 class="text-lg font-semibold">安装历史</h2>
              </div>
              <div class="space-y-3 text-sm">
                <div class="rounded-md border bg-muted/20 p-4">
                  <p class="text-xs text-muted-foreground">创建时间</p>
                  <p class="mt-1 font-mono">{installedApplication.createdAt ? formatTime(installedApplication.createdAt) : "unknown"}</p>
                </div>
                <div class="rounded-md border bg-muted/20 p-4">
                  <p class="text-xs text-muted-foreground">最后变更</p>
                  <p class="mt-1 font-mono">{installedApplication.lastChangedAt ? formatTime(installedApplication.lastChangedAt) : "unknown"}</p>
                </div>
                {#if installedApplication.rollback}
                  <div class="rounded-md border bg-muted/20 p-4">
                    <p class="text-xs text-muted-foreground">回滚</p>
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
                <h2 class="text-sm font-semibold">生命周期</h2>
              </div>
              <p class="text-sm leading-6 text-muted-foreground">
                Upgrade、rollback 和 uninstall 需要 focused governed flow。当前页面只提供状态、影响面和 owner links，不在默认页展示表单。
              </p>
              <div class="grid gap-3" data-installed-application-lifecycle-governance>
                <section class="rounded-md border bg-muted/20 p-3" data-installed-application-upgrade-governance>
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium">Upgrade</p>
                    <Badge variant="outline">later phase</Badge>
                  </div>
                  <p class="mt-2 text-xs leading-5 text-muted-foreground">
                    升级需要先展示 blueprint diff、资源影响和 deployment plan，再进入 focused flow。
                  </p>
                </section>
                <section class="rounded-md border bg-muted/20 p-3" data-installed-application-rollback-governance>
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium">Rollback</p>
                    <Badge variant="outline">
                      {installedApplication.rollback ? "requested" : "not requested"}
                    </Badge>
                  </div>
                  <p class="mt-2 text-xs leading-5 text-muted-foreground">
                    回滚必须基于安装历史和资源 deployment readiness，不能在聚合页直接提交。
                  </p>
                </section>
                <section class="rounded-md border bg-muted/20 p-3" data-installed-application-uninstall-governance>
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium">Uninstall</p>
                    <Badge variant="outline">danger flow</Badge>
                  </div>
                  <p class="mt-2 text-xs leading-5 text-muted-foreground">
                    卸载需要列出将影响的 resources、dependency resources 和 public URLs，并通过 blocker/check 强确认。
                  </p>
                </section>
              </div>
            </aside>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</ConsoleShell>

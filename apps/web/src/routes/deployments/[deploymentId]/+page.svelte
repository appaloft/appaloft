<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onDestroy } from "svelte";
  import {
    ArrowLeft,
    Boxes,
    Check,
    Clock3,
    Copy,
    ExternalLink,
    FileText,
    FolderOpen,
    Link2,
    Server,
    ShieldCheck,
  } from "@lucide/svelte";
  import type { DeploymentProgressEvent, DeploymentSummary } from "@yundu/contracts";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import DeploymentProgressDialog from "$lib/components/console/DeploymentProgressDialog.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
  import {
    progressEventsFromDeployment,
    type DeploymentProgressDialogStatus,
  } from "$lib/console/deployment-progress";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    deploymentDetailHref,
    findDeployment,
    findEnvironment,
    findProject,
    findResource,
    findServer,
    formatTime,
    projectDetailHref,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  type AccessRoute = NonNullable<DeploymentSummary["runtimePlan"]["execution"]["accessRoutes"]>[number];
  type AccessUrlKind = "deployment" | "domain" | "direct";
  type AccessUrl = {
    url: string;
    kind: AccessUrlKind;
  };
  type DeploymentDetailTab = "overview" | "logs" | "timeline" | "snapshot";

  const deploymentDetailTabs = ["overview", "logs", "timeline", "snapshot"] as const;

  const { projectsQuery, serversQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser);

  let deploymentProgressDialogOpen = $state(false);
  let deploymentProgressDialogStatus = $state<DeploymentProgressDialogStatus>("idle");
  let deploymentProgressEvents = $state<DeploymentProgressEvent[]>([]);
  let deploymentProgressStreamError = $state("");
  let deploymentProgressRequestId = $state("");
  let deploymentProgressDeploymentId = $state("");
  let logsCopyState = $state<"idle" | "copied" | "failed">("idle");
  let accessUrlCopyState = $state<"idle" | "copied" | "failed">("idle");
  let logsCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;
  let accessUrlCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;

  const deploymentId = $derived(page.params.deploymentId ?? "");
  const projects = $derived(projectsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      serversQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      deploymentsQuery.isPending,
  );
  const deployment = $derived(findDeployment(deployments, deploymentId));
  const project = $derived(deployment ? findProject(projects, deployment.projectId) : null);
  const environment = $derived(
    deployment ? findEnvironment(environments, deployment.environmentId) : null,
  );
  const resource = $derived(deployment ? findResource(resources, deployment.resourceId) : null);
  const server = $derived(deployment ? findServer(servers, deployment.serverId) : null);
  const accessUrls = $derived(deployment ? deploymentAccessUrls(deployment, server?.host) : []);
  const primaryAccessUrl = $derived(accessUrls[0] ?? null);
  const activeTab = $derived(parseDeploymentDetailTab(page.url.searchParams.get("tab")));
  const logsCopyLabel = $derived(
    logsCopyState === "copied"
      ? $t(i18nKeys.console.deployments.copyLogsCopied)
      : logsCopyState === "failed"
        ? $t(i18nKeys.console.deployments.copyLogsFailed)
        : $t(i18nKeys.console.deployments.copyLogs),
  );
  const accessUrlCopyLabel = $derived(
    accessUrlCopyState === "copied"
      ? $t(i18nKeys.console.deployments.accessUrlCopied)
      : accessUrlCopyState === "failed"
        ? $t(i18nKeys.console.deployments.accessUrlCopyFailed)
        : $t(i18nKeys.console.deployments.copyAccessUrl),
  );

  function handleViewProgress(): void {
    const progressDeployment = deployment;

    if (!progressDeployment) {
      return;
    }

    deploymentProgressRequestId = "";
    deploymentProgressDeploymentId = progressDeployment.id;
    deploymentProgressEvents = progressEventsFromDeployment(progressDeployment);
    deploymentProgressStreamError = "";
    deploymentProgressDialogStatus =
      progressDeployment.status === "failed"
        ? "failed"
        : progressDeployment.status === "succeeded" || progressDeployment.status === "rolled-back"
          ? "succeeded"
          : "running";
    deploymentProgressDialogOpen = true;
  }

  function deploymentProgressHref(): string {
    const progressDeployment = deployments.find(
      (candidate) => candidate.id === deploymentProgressDeploymentId,
    );

    return progressDeployment
      ? deploymentDetailHref(progressDeployment)
      : `/deployments/${encodeURIComponent(deploymentProgressDeploymentId)}`;
  }

  function logLevelClass(level: DeploymentSummary["logs"][number]["level"]): string {
    switch (level) {
      case "error":
        return "text-red-300";
      case "warn":
        return "text-amber-200";
      case "debug":
        return "text-zinc-500";
      case "info":
        return "text-zinc-200";
    }
  }

  function logSourceLabel(log: DeploymentSummary["logs"][number]): string {
    return log.source === "application" ? "app" : "yundu";
  }

  function logTimeLabel(timestamp: string): string {
    return timestamp.slice(11, 19) || "--:--:--";
  }

  function normalizeAccessPath(pathPrefix: string): string {
    if (!pathPrefix || pathPrefix === "/") {
      return "/";
    }

    return pathPrefix.startsWith("/") ? pathPrefix : `/${pathPrefix}`;
  }

  function routeUrl(route: AccessRoute, executionPort: number | undefined, serverHost: string | undefined): AccessUrl[] {
    const pathPrefix = normalizeAccessPath(route.pathPrefix);

    if (route.domains.length > 0) {
      const scheme = route.tlsMode === "auto" ? "https" : "http";
      return route.domains.map((domain) => ({
        url: `${scheme}://${domain}${pathPrefix}`,
        kind: "domain" as const,
      }));
    }

    const directPort = route.targetPort ?? executionPort;
    if (route.proxyKind === "none" && serverHost && directPort) {
      return [
        {
          url: `http://${serverHost}:${directPort}${pathPrefix}`,
          kind: "direct",
        },
      ];
    }

    return [];
  }

  function addUniqueAccessUrl(urls: AccessUrl[], url: AccessUrl): AccessUrl[] {
    if (urls.some((existingUrl) => existingUrl.url === url.url)) {
      return urls;
    }

    return [...urls, url];
  }

  function deploymentAccessUrls(deployment: DeploymentSummary, serverHost: string | undefined): AccessUrl[] {
    const metadata = deployment.runtimePlan.execution.metadata ?? {};
    const metadataUrl = metadata.publicUrl ?? metadata.url;
    let urls: AccessUrl[] = [];

    for (const route of deployment.runtimePlan.execution.accessRoutes ?? []) {
      for (const url of routeUrl(route, deployment.runtimePlan.execution.port, serverHost)) {
        urls = addUniqueAccessUrl(urls, url);
      }
    }

    if (typeof metadataUrl === "string" && metadataUrl) {
      urls = addUniqueAccessUrl(urls, { url: metadataUrl, kind: "deployment" });
    }

    return urls;
  }

  function accessUrlKindLabel(kind: AccessUrlKind): string {
    switch (kind) {
      case "deployment":
        return $t(i18nKeys.console.deployments.deploymentAccess);
      case "domain":
        return $t(i18nKeys.console.deployments.domainAccess);
      case "direct":
        return $t(i18nKeys.console.deployments.directPortAccess);
    }
  }

  function formatDeploymentLogCopyLine(log: DeploymentSummary["logs"][number]): string {
    return [log.timestamp, log.source, log.level, log.phase, log.message].join(" ");
  }

  function formatDeploymentLogsCopyText(logs: DeploymentSummary["logs"]): string {
    return logs.map(formatDeploymentLogCopyLine).join("\n");
  }

  function markLogsCopyState(state: "copied" | "failed"): void {
    if (logsCopyResetTimeout) {
      clearTimeout(logsCopyResetTimeout);
    }

    logsCopyState = state;
    logsCopyResetTimeout = setTimeout(() => {
      logsCopyState = "idle";
      logsCopyResetTimeout = undefined;
    }, 1800);
  }

  function markAccessUrlCopyState(state: "copied" | "failed"): void {
    if (accessUrlCopyResetTimeout) {
      clearTimeout(accessUrlCopyResetTimeout);
    }

    accessUrlCopyState = state;
    accessUrlCopyResetTimeout = setTimeout(() => {
      accessUrlCopyState = "idle";
      accessUrlCopyResetTimeout = undefined;
    }, 1800);
  }

  async function copyTextToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall back for non-HTTPS previews or browsers with restrictive clipboard permissions.
      }
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.append(textArea);
    textArea.select();

    try {
      if (!document.execCommand("copy")) {
        throw new Error("Copy command failed");
      }
    } finally {
      textArea.remove();
    }
  }

  async function handleCopyDeploymentLogs(): Promise<void> {
    if (!browser || !deployment || deployment.logs.length === 0) {
      return;
    }

    try {
      await copyTextToClipboard(formatDeploymentLogsCopyText(deployment.logs));
      markLogsCopyState("copied");
    } catch {
      markLogsCopyState("failed");
    }
  }

  async function handleCopyAccessUrl(): Promise<void> {
    if (!browser || !primaryAccessUrl) {
      return;
    }

    try {
      await copyTextToClipboard(primaryAccessUrl.url);
      markAccessUrlCopyState("copied");
    } catch {
      markAccessUrlCopyState("failed");
    }
  }

  onDestroy(() => {
    if (logsCopyResetTimeout) {
      clearTimeout(logsCopyResetTimeout);
    }
    if (accessUrlCopyResetTimeout) {
      clearTimeout(accessUrlCopyResetTimeout);
    }
  });

  function parseDeploymentDetailTab(value: string | null): DeploymentDetailTab {
    return deploymentDetailTabs.includes(value as DeploymentDetailTab)
      ? (value as DeploymentDetailTab)
      : "overview";
  }

  function deploymentTabHref(tab: DeploymentDetailTab): string {
    const params = new URLSearchParams(page.url.searchParams);

    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectDeploymentTab(tab: DeploymentDetailTab, event: MouseEvent): void {
    event.preventDefault();
    void goto(deploymentTabHref(tab), { noScroll: true, keepFocus: true });
  }

  function deploymentTabLabel(tab: DeploymentDetailTab): string {
    switch (tab) {
      case "overview":
        return $t(i18nKeys.console.deployments.overviewTab);
      case "logs":
        return $t(i18nKeys.console.deployments.logsTab);
      case "timeline":
        return $t(i18nKeys.console.deployments.timelineTab);
      case "snapshot":
        return $t(i18nKeys.console.deployments.snapshotTab);
    }
  }
</script>

<svelte:head>
  <title>{deployment?.runtimePlan.source.displayName ?? $t(i18nKeys.console.deployments.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={deployment?.runtimePlan.source.displayName ?? $t(i18nKeys.console.deployments.pageTitle)}
  description={$t(i18nKeys.console.deployments.detailDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle), href: "/projects" },
    {
      label: project?.name ?? $t(i18nKeys.common.domain.project),
      href: project ? projectDetailHref(project.id) : undefined,
    },
    { label: environment?.name ?? $t(i18nKeys.common.domain.environment) },
    {
      label: resource?.name ?? $t(i18nKeys.common.domain.resource),
      href: resource ? resourceDetailHref(resource) : undefined,
    },
    { label: deployment?.runtimePlan.source.displayName ?? $t(i18nKeys.common.domain.deployment) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-40 w-full" />
      <div class="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Skeleton class="h-96 w-full" />
        <Skeleton class="h-96 w-full" />
      </div>
    </div>
  {:else if !deployment}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.errors.backend.notFound)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.deployments.notFoundTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.deployments.notFoundBody)}
        </p>
      </div>
      <div class="mt-6">
        <Button href="/deployments" variant="outline">
          <ArrowLeft class="size-4" />
          {$t(i18nKeys.common.actions.backToDeployments)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="space-y-6">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <DeploymentStatusBadge status={deployment.status} />
              <Badge variant="outline">{deployment.runtimePlan.source.kind}</Badge>
            </div>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold md:text-3xl">
                {deployment.runtimePlan.source.displayName}
              </h1>
              <p class="break-all text-sm leading-6 text-muted-foreground">
                {deployment.runtimePlan.source.locator}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button href="/deployments" variant="outline">
              <ArrowLeft class="size-4" />
              {$t(i18nKeys.common.actions.backToDeployments)}
            </Button>
            {#if project}
              <Button href={projectDetailHref(project.id)} variant="outline">
                <FolderOpen class="size-4" />
                {$t(i18nKeys.common.actions.openProject)}
              </Button>
            {/if}
            {#if resource}
              <Button href={resourceDetailHref(resource)} variant="outline">
                <Boxes class="size-4" />
                {$t(i18nKeys.common.actions.openResource)}
              </Button>
            {/if}
            <Button variant="outline" onclick={handleViewProgress}>
              <Clock3 class="size-4" />
              {$t(i18nKeys.common.actions.viewProgress)}
            </Button>
          </div>
        </div>

      </section>

      <Tabs.Root value={activeTab} class="space-y-5">
        <Tabs.List
          class="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b bg-transparent p-0"
        >
          {#each deploymentDetailTabs as tab (tab)}
            <Tabs.Trigger
              value={tab}
              class="h-11 flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 py-0 shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              onclick={(event) => selectDeploymentTab(tab, event)}
            >
              {deploymentTabLabel(tab)}
            </Tabs.Trigger>
          {/each}
        </Tabs.List>

        <Tabs.Content value="overview" class="mt-0 space-y-5">
          <section class="rounded-md border bg-background p-4">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div class="min-w-0 space-y-2">
                <p class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Link2 class="size-4" />
                  {$t(i18nKeys.console.deployments.accessUrlTitle)}
                </p>
                {#if primaryAccessUrl}
                  <a
                    class="block break-all text-lg font-semibold text-primary underline-offset-4 hover:underline md:text-xl"
                    href={primaryAccessUrl.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {primaryAccessUrl.url}
                  </a>
                  <Badge variant="outline" class="w-fit">
                    {accessUrlKindLabel(primaryAccessUrl.kind)}
                  </Badge>
                {:else}
                  <p class="text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.deployments.accessUrlEmpty)}
                  </p>
                {/if}
              </div>

              <div class="flex shrink-0 flex-wrap gap-2">
                {#if primaryAccessUrl}
                  <Button href={primaryAccessUrl.url} target="_blank" rel="noreferrer">
                    <ExternalLink class="size-4" />
                    {$t(i18nKeys.console.deployments.openAccessUrl)}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={accessUrlCopyLabel}
                    title={accessUrlCopyLabel}
                    onclick={handleCopyAccessUrl}
                  >
                    {#if accessUrlCopyState === "copied"}
                      <Check class="size-4" />
                    {:else}
                      <Copy class="size-4" />
                    {/if}
                    {accessUrlCopyLabel}
                  </Button>
                {/if}
              </div>
            </div>
          </section>

          <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-md border bg-background p-4">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <FolderOpen class="size-4" />
                {$t(i18nKeys.common.domain.project)}
              </p>
              <p class="mt-2 truncate font-medium">{project?.name ?? deployment.projectId}</p>
            </div>
            <div class="rounded-md border bg-background p-4">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ShieldCheck class="size-4" />
                {$t(i18nKeys.common.domain.environment)}
              </p>
              <p class="mt-2 truncate font-medium">
                {environment?.name ?? deployment.environmentId}
              </p>
            </div>
            <div class="rounded-md border bg-background p-4">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Boxes class="size-4" />
                {$t(i18nKeys.common.domain.resource)}
              </p>
              <p class="mt-2 truncate font-medium">{resource?.name ?? deployment.resourceId}</p>
            </div>
            <div class="rounded-md border bg-background p-4">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Server class="size-4" />
                {$t(i18nKeys.common.domain.server)}
              </p>
              <p class="mt-2 truncate font-medium">{server?.name ?? deployment.serverId}</p>
            </div>
          </section>

          <section class="rounded-md border bg-background p-4">
            <h2 class="text-lg font-semibold">{$t(i18nKeys.common.domain.source)}</h2>
            <div class="mt-4 grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)]">
              <div class="rounded-md bg-muted/30 px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.kind)}</p>
                <p class="mt-1 truncate text-sm font-medium">{deployment.runtimePlan.source.kind}</p>
              </div>
              <div class="rounded-md bg-muted/30 px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.source)}</p>
                <p class="mt-1 break-all text-sm font-medium">
                  {deployment.runtimePlan.source.locator}
                </p>
              </div>
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content value="logs" class="mt-0 space-y-4">
          <section class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="flex items-center gap-2 text-lg font-semibold">
                  <FileText class="size-5 text-muted-foreground" />
                  {$t(i18nKeys.console.deployments.logsTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.deployments.logsDescription, {
                    count: deployment.logCount,
                  })}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={deployment.logs.length === 0}
                aria-label={logsCopyLabel}
                title={logsCopyLabel}
                onclick={handleCopyDeploymentLogs}
              >
                {#if logsCopyState === "copied"}
                  <Check class="size-4" />
                {:else}
                  <Copy class="size-4" />
                {/if}
                {logsCopyLabel}
              </Button>
            </div>

            {#if deployment.logs.length > 0}
              <div class="max-h-[42rem] overflow-auto rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-200 shadow-inner">
                <div class="space-y-1">
                  {#each deployment.logs as log, index (`${log.timestamp}-${index}`)}
                    <div class="grid grid-cols-[4.75rem_5rem_3.5rem_5rem_minmax(0,1fr)] gap-2 leading-5">
                      <span class="text-zinc-600">{logTimeLabel(log.timestamp)}</span>
                      <span class={log.source === "application" ? "text-sky-300" : "text-emerald-300"}>
                        {logSourceLabel(log)}
                      </span>
                      <span class={logLevelClass(log.level)}>{log.level}</span>
                      <span class="text-zinc-500">{log.phase}</span>
                      <span
                        class={`min-w-0 break-words ${logLevelClass(log.level)} ${log.source === "application" ? "pl-3" : ""}`}
                      >
                        {log.source === "application" ? "└ " : ""}
                        {log.message}
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            {:else}
              <div class="rounded-md border bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
                {$t(i18nKeys.console.deployments.noLogs)}
              </div>
            {/if}
          </section>
        </Tabs.Content>

        <Tabs.Content value="timeline" class="mt-0 space-y-4">
          <section class="rounded-md border bg-background p-4">
            <h2 class="flex items-center gap-2 text-lg font-semibold">
              <Clock3 class="size-5 text-muted-foreground" />
              {$t(i18nKeys.console.deployments.timelineTitle)}
            </h2>
            <div class="mt-4 grid gap-3 md:grid-cols-3">
              <div class="rounded-md bg-muted/30 px-4 py-3">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.createdAt)}</p>
                <p class="mt-1 font-medium">{formatTime(deployment.createdAt)}</p>
              </div>
              <div class="rounded-md bg-muted/30 px-4 py-3">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.startedAt)}</p>
                <p class="mt-1 font-medium">
                  {deployment.startedAt ? formatTime(deployment.startedAt) : "-"}
                </p>
              </div>
              <div class="rounded-md bg-muted/30 px-4 py-3">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.finishedAt)}</p>
                <p class="mt-1 font-medium">
                  {deployment.finishedAt ? formatTime(deployment.finishedAt) : "-"}
                </p>
              </div>
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content value="snapshot" class="mt-0 space-y-4">
          <section class="rounded-md border bg-background p-4">
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.deployments.snapshotTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.deployments.snapshotDescription)}
            </p>

            <div class="mt-4 rounded-md bg-muted/30 px-4 py-3">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.deployments.precedence)}</p>
              <p class="mt-1 break-words text-sm font-medium">
                {deployment.environmentSnapshot.precedence.join(" / ")}
              </p>
            </div>

            <div class="mt-4 divide-y rounded-md border">
              {#if deployment.environmentSnapshot.variables.length > 0}
                {#each deployment.environmentSnapshot.variables as variable (variable.key)}
                  <div class="px-4 py-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <p class="font-medium">{variable.key}</p>
                      <Badge variant={variable.isSecret ? "secondary" : "outline"}>
                        {variable.isSecret
                          ? $t(i18nKeys.console.quickDeploy.secretStorage)
                          : $t(i18nKeys.console.quickDeploy.variablePlainStorage)}
                      </Badge>
                    </div>
                    <p class="mt-2 text-sm text-muted-foreground">
                      {variable.scope} · {variable.exposure} · {variable.kind}
                    </p>
                  </div>
                {/each}
              {:else}
                <div class="px-4 py-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.deployments.noSnapshotVariables)}
                </div>
              {/if}
            </div>
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  {/if}
</ConsoleShell>

<DeploymentProgressDialog
  open={deploymentProgressDialogOpen}
  status={deploymentProgressDialogStatus}
  events={deploymentProgressEvents}
  streamError={deploymentProgressStreamError}
  requestId={deploymentProgressRequestId}
  deploymentId={deploymentProgressDeploymentId}
  title={$t(i18nKeys.console.deployments.progressTitle)}
  description={$t(i18nKeys.console.deployments.progressDescription)}
  onClose={() => {
    deploymentProgressDialogOpen = false;
  }}
  onOpenDeployment={() => {
    void goto(deploymentProgressHref());
  }}
/>

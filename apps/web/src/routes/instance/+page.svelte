<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import type {
    DoctorResponse,
    InstanceUpgradeApplyResponse,
    InstanceUpgradeCheckResponse,
    InstanceUpgradeCheckStatus,
    MaintenanceWorkerStatus,
    TerminalSessionSummary,
  } from "@appaloft/contracts";
  import {
    Clock3,
    ClipboardList,
    Download,
    GitBranch,
    Globe2,
    Network,
    RefreshCw,
    ShieldCheck,
    Terminal,
    X,
  } from "@lucide/svelte";

  import { readErrorMessage, request } from "$lib/api/client";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type UpgradeFeedback = {
    kind: "success" | "error";
    title: string;
    detail: string;
  };
  type TerminalSessionFeedback = {
    kind: "success" | "error";
    title: string;
    detail: string;
  };
  type InstanceSection = "overview" | "maintenance" | "sessions" | "guidance";
  type RuntimeStatusResponse = {
    schemaVersion: "cloud-dev-runtime.status/v1";
    generatedAt: string;
    database: {
      driver: string;
      publicDatabaseUrl: string;
      cloudDatabaseUrl: string;
      supabaseBranchName?: string;
      supabaseProjectRef?: string;
    };
    git: {
      packageVersion?: string;
      cloudCommitSha?: string;
      publicAppaloftCommitSha?: string;
    };
  };

  const currentOrigin = $derived(page.url.origin);
  let upgradeFeedback = $state<UpgradeFeedback | null>(null);
  let terminalSessionFeedback = $state<TerminalSessionFeedback | null>(null);
  const activeSection = $derived(parseInstanceSection(page.url.searchParams.get("section")));
  const runtimeStatusQuery = createQuery(() =>
    queryOptions({
      queryKey: ["bootstrap", "runtime-status"],
      queryFn: () => request<RuntimeStatusResponse>("/api/bootstrap/runtime/status"),
      enabled: browser && activeSection === "overview",
      staleTime: 15_000,
      refetchInterval: 30_000,
      retry: 0,
    }),
  );
  const instanceUpgradeQuery = createQuery(() =>
    queryOptions({
      queryKey: ["instance-upgrade", "check"],
      queryFn: () => request<InstanceUpgradeCheckResponse>("/api/instance-upgrade/check"),
      enabled: browser && (activeSection === "overview" || activeSection === "guidance"),
      staleTime: 60_000,
      retry: 0,
    }),
  );
  const doctorQuery = createQuery(() =>
    queryOptions<DoctorResponse>({
      queryKey: ["system", "doctor"],
      queryFn: () => orpcClient.system.doctor(),
      enabled: browser && activeSection === "maintenance",
      staleTime: 30_000,
      refetchInterval: 60_000,
      retry: 0,
    }),
  );
  const terminalSessionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["terminal-sessions", "active"],
      queryFn: () => orpcClient.terminalSessions.list({ limit: 50 }),
      enabled: browser && activeSection === "sessions",
      staleTime: 15_000,
      refetchInterval: 30_000,
      retry: 0,
    }),
  );
  const applyUpgradeMutation = createMutation(() => ({
    mutationFn: () =>
      request<InstanceUpgradeApplyResponse>("/api/instance-upgrade/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          ...(instanceUpgradeQuery.data?.targetVersion
            ? { targetVersion: instanceUpgradeQuery.data.targetVersion }
            : {}),
        }),
      }),
    onSuccess: (result) => {
      upgradeFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.instance.upgradeSucceededTitle),
        detail: `${$t(i18nKeys.console.instance.targetVersionLabel)} ${result.targetVersion}`,
      };
      void queryClient.invalidateQueries({ queryKey: ["instance-upgrade"] });
    },
    onError: (error) => {
      upgradeFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.instance.upgradeFailedTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const closeTerminalSessionMutation = createMutation(() => ({
    mutationFn: (input: { sessionId: string }) => orpcClient.terminalSessions.close(input),
    onSuccess: (result) => {
      terminalSessionFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.terminal.lifecycleCloseSucceeded),
        detail: result.sessionId,
      };
      void queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
    },
    onError: (error) => {
      terminalSessionFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.terminal.lifecycleCloseFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const expireTerminalSessionsMutation = createMutation(() => ({
    mutationFn: () =>
      orpcClient.terminalSessions.expire({
        olderThan: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        limit: 50,
      }),
    onSuccess: (result) => {
      terminalSessionFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.terminal.lifecycleExpireSucceeded),
        detail: $t(i18nKeys.console.terminal.lifecycleExpiredCount, {
          count: result.expiredCount,
        }),
      };
      void queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
    },
    onError: (error) => {
      terminalSessionFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.terminal.lifecycleExpireFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const domainInstallCommand =
    "curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain console.example.com";
  const directInstallCommand = "curl -fsSL https://appaloft.com/install.sh | sudo sh";
  const rerunCommand =
    "curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain new-console.example.com";
  const fallbackUpgradeCommand = "curl -fsSL https://appaloft.com/install.sh | sudo sh";
  const upgradeStatus = $derived(instanceUpgradeQuery.data?.checkStatus ?? "unknown");
  const doctor = $derived(doctorQuery.data ?? null);
  const terminalSessions = $derived(terminalSessionsQuery.data?.items ?? []);
  const maintenanceWorkers = $derived(doctor?.maintenanceWorkers ?? []);
  const enabledMaintenanceWorkerCount = $derived(
    maintenanceWorkers.filter((worker) => worker.enabled).length,
  );
  const upgradeCommand = $derived(
    instanceUpgradeQuery.data?.upgradeCommand ?? fallbackUpgradeCommand,
  );
  const currentVersion = $derived(
    runtimeStatusQuery.data?.git.packageVersion ?? instanceUpgradeQuery.data?.currentVersion ?? "-",
  );
  const currentCommitSha = $derived(
    runtimeStatusQuery.data?.git.cloudCommitSha ??
      instanceUpgradeQuery.data?.currentCommitSha ??
      $t(i18nKeys.console.instance.noCommitSha),
  );
  const canApplyUpgrade = $derived(
    Boolean(
      instanceUpgradeQuery.data?.applySupported &&
        instanceUpgradeQuery.data.updateAvailable &&
        !applyUpgradeMutation.isPending,
    ),
  );
  const actionSnippet = $derived(`control-plane-mode: self-hosted
control-plane-url: ${currentOrigin}
server-config-deploy: true`);

  function parseInstanceSection(value: string | null): InstanceSection {
    if (value === "maintenance" || value === "sessions" || value === "guidance") {
      return value;
    }

    return "overview";
  }

  function instanceSectionHref(section: InstanceSection): string {
    const params = new URLSearchParams(page.url.searchParams);

    if (section === "overview") {
      params.delete("section");
    } else {
      params.set("section", section);
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectInstanceSection(section: InstanceSection, event: MouseEvent): void {
    event.preventDefault();
    void goto(instanceSectionHref(section), { noScroll: true, keepFocus: true });
  }

  function statusLabelKey(status: InstanceUpgradeCheckStatus) {
    if (status === "available") {
      return i18nKeys.console.instance.updateAvailableBadge;
    }

    if (status === "current") {
      return i18nKeys.console.instance.upToDateBadge;
    }

    return i18nKeys.console.instance.unknownUpdateBadge;
  }

  function workerLabelKey(worker: MaintenanceWorkerStatus) {
    switch (worker.key) {
      case "certificate-retry-scheduler":
        return i18nKeys.console.instance.workerCertificateRetry;
      case "preview-cleanup-retry-scheduler":
        return i18nKeys.console.instance.workerPreviewCleanupRetry;
      case "preview-expiry-cleanup-scheduler":
        return i18nKeys.console.instance.workerPreviewExpiryCleanup;
      case "scheduled-history-retention-runner":
        return i18nKeys.console.instance.workerScheduledHistoryRetention;
      case "scheduled-runtime-prune-runner":
        return i18nKeys.console.instance.workerScheduledRuntimePrune;
      case "scheduled-task-runner":
        return i18nKeys.console.instance.workerScheduledTask;
      case "runtime-monitoring-collector-runner":
        return i18nKeys.console.instance.workerRuntimeMonitoringCollector;
    }
  }

  function workerActivationLabelKey(worker: MaintenanceWorkerStatus) {
    return worker.activation === "starts-with-backend-service"
      ? i18nKeys.console.instance.workerActivationStarts
      : i18nKeys.console.instance.workerActivationDisabled;
  }

  function workerSafetyLabelKey(worker: MaintenanceWorkerStatus) {
    switch (worker.safetyMode) {
      case "certificate-retry":
        return i18nKeys.console.instance.workerSafetyCertificateRetry;
      case "preview-cleanup-retry":
        return i18nKeys.console.instance.workerSafetyPreviewCleanupRetry;
      case "preview-expiry-cleanup":
        return i18nKeys.console.instance.workerSafetyPreviewExpiryCleanup;
      case "policy-gated-prune":
        return i18nKeys.console.instance.workerSafetyPolicyGatedPrune;
      case "policy-gated-retention":
        return i18nKeys.console.instance.workerSafetyPolicyGatedRetention;
      case "read-only-collection":
        return i18nKeys.console.instance.workerSafetyReadOnlyCollection;
      case "runtime-execution":
        return i18nKeys.console.instance.workerSafetyRuntimeExecution;
    }
  }

  function terminalSessionScopeLabel(session: TerminalSessionSummary) {
    return session.scope === "resource"
      ? $t(i18nKeys.console.terminal.lifecycleScopeResource)
      : $t(i18nKeys.console.terminal.lifecycleScopeServer);
  }

  function terminalSessionTargetLabel(session: TerminalSessionSummary) {
    return session.scope === "resource" && session.resourceId
      ? session.resourceId
      : session.serverId;
  }

  function closeTerminalSession(session: TerminalSessionSummary) {
    if (!browser || closeTerminalSessionMutation.isPending) {
      return;
    }

    if (
      !window.confirm(
        $t(i18nKeys.console.terminal.lifecycleCloseConfirm, {
          sessionId: session.sessionId,
        }),
      )
    ) {
      return;
    }

    terminalSessionFeedback = null;
    closeTerminalSessionMutation.mutate({ sessionId: session.sessionId });
  }

  function expireOldTerminalSessions() {
    if (!browser || expireTerminalSessionsMutation.isPending) {
      return;
    }

    if (!window.confirm($t(i18nKeys.console.terminal.lifecycleExpireConfirm))) {
      return;
    }

    terminalSessionFeedback = null;
    expireTerminalSessionsMutation.mutate();
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.instance.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.instance.pageTitle)}
  description={$t(i18nKeys.console.instance.pageDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.instance.pageTitle) },
  ]}
>
  <ConsoleResourceCanvas class="max-w-6xl">
    <div class="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)] md:items-start">
      <aside class="console-subnav md:sticky md:top-20">
        <p class="console-subnav-kicker">{$t(i18nKeys.console.instance.pageTitle)}</p>
        <nav class="console-subnav-list" aria-label={$t(i18nKeys.console.instance.pageTitle)}>
          <a
            href={instanceSectionHref("overview")}
            onclick={(event) => selectInstanceSection("overview", event)}
            aria-current={activeSection === "overview" ? "page" : undefined}
            class="console-subnav-item"
          >
            <Globe2 class="console-subnav-item-icon" />
            <span class="console-subnav-item-title">
              {$t(i18nKeys.console.instance.overviewTitle)}
            </span>
          </a>

          <a
            href={instanceSectionHref("maintenance")}
            onclick={(event) => selectInstanceSection("maintenance", event)}
            aria-current={activeSection === "maintenance" ? "page" : undefined}
            class="console-subnav-item"
          >
            <ShieldCheck class="console-subnav-item-icon" />
            <span class="console-subnav-item-title">
              {$t(i18nKeys.console.instance.maintenanceWorkersTitle)}
            </span>
          </a>

          <a
            href={instanceSectionHref("sessions")}
            onclick={(event) => selectInstanceSection("sessions", event)}
            aria-current={activeSection === "sessions" ? "page" : undefined}
            class="console-subnav-item"
          >
            <Terminal class="console-subnav-item-icon" />
            <span class="console-subnav-item-title">
              {$t(i18nKeys.console.terminal.lifecycleTitle)}
            </span>
          </a>

          <a
            href={instanceSectionHref("guidance")}
            onclick={(event) => selectInstanceSection("guidance", event)}
            aria-current={activeSection === "guidance" ? "page" : undefined}
            class="console-subnav-item"
          >
            <ClipboardList class="console-subnav-item-icon" />
            <span class="console-subnav-item-title">
              {$t(i18nKeys.console.instance.guidanceTitle)}
            </span>
          </a>
        </nav>
      </aside>

      <div class="min-w-0 space-y-4">
        {#if activeSection === "overview"}
          <section class="console-panel p-5">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant={upgradeStatus === "available" ? "default" : "outline"}>
                    {$t(statusLabelKey(upgradeStatus))}
                  </Badge>
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.instance.overviewTitle)}
                  </h2>
                </div>
                <p class="mt-3 text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.instance.pageDescription)}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={instanceUpgradeQuery.isFetching}
                  onclick={() => {
                    upgradeFeedback = null;
                    void instanceUpgradeQuery.refetch();
                  }}
                >
                  <RefreshCw class="mr-2 size-4" />
                  {instanceUpgradeQuery.isFetching
                    ? $t(i18nKeys.console.instance.checkingForUpdates)
                    : $t(i18nKeys.console.instance.checkForUpdates)}
                </Button>
                <Button
                  type="button"
                  disabled={!canApplyUpgrade}
                  onclick={() => applyUpgradeMutation.mutate()}
                >
                  <Download class="mr-2 size-4" />
                  {applyUpgradeMutation.isPending
                    ? $t(i18nKeys.console.instance.applyingUpgrade)
                    : $t(i18nKeys.console.instance.applyUpgrade)}
                </Button>
              </div>
            </div>

            <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div class="rounded-md border bg-background p-4">
                <p class="text-xs uppercase text-muted-foreground">
                  {$t(i18nKeys.console.instance.currentVersionLabel)}
                </p>
                <p class="mt-1 break-all font-mono text-sm">
                  {currentVersion}
                </p>
              </div>
              <div class="rounded-md border bg-background p-4">
                <p class="text-xs uppercase text-muted-foreground">
                  {$t(i18nKeys.console.instance.commitShaLabel)}
                </p>
                <p class="mt-1 break-all font-mono text-sm">
                  {currentCommitSha}
                </p>
              </div>
              <div class="rounded-md border bg-background p-4">
                <p class="text-xs uppercase text-muted-foreground">
                  {$t(i18nKeys.console.instance.latestVersionLabel)}
                </p>
                <p class="mt-1 break-all font-mono text-sm">
                  {instanceUpgradeQuery.data?.latestVersion ?? "-"}
                </p>
              </div>
              <div class="rounded-md border bg-background p-4">
                <p class="text-xs uppercase text-muted-foreground">
                  {$t(i18nKeys.console.instance.targetVersionLabel)}
                </p>
                <p class="mt-1 break-all font-mono text-sm">
                  {instanceUpgradeQuery.data?.targetVersion ?? "-"}
                </p>
              </div>
              <div class="rounded-md border bg-background p-4 xl:col-span-2">
                <p class="text-xs uppercase text-muted-foreground">
                  {$t(i18nKeys.console.instance.currentOriginLabel)}
                </p>
                <p class="mt-1 break-all font-mono text-sm">{currentOrigin}</p>
              </div>
            </div>

            <div class="mt-5 grid gap-3 xl:grid-cols-2">
              <div class="rounded-md border bg-background p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-medium">{$t(i18nKeys.console.instance.databaseTitle)}</p>
                  <Badge variant="outline">
                    {runtimeStatusQuery.data?.database.driver ?? $t(i18nKeys.common.status.loading)}
                  </Badge>
                </div>
                <dl class="mt-4 space-y-3 text-sm">
                  <div>
                    <dt class="text-xs uppercase text-muted-foreground">
                      {$t(i18nKeys.console.instance.publicDatabaseUrlLabel)}
                    </dt>
                    <dd class="mt-1 break-all font-mono">
                      {runtimeStatusQuery.data?.database.publicDatabaseUrl ?? "-"}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase text-muted-foreground">
                      {$t(i18nKeys.console.instance.cloudDatabaseUrlLabel)}
                    </dt>
                    <dd class="mt-1 break-all font-mono">
                      {runtimeStatusQuery.data?.database.cloudDatabaseUrl ?? "-"}
                    </dd>
                  </div>
                  {#if runtimeStatusQuery.data?.database.supabaseBranchName || runtimeStatusQuery.data?.database.supabaseProjectRef}
                    <div>
                      <dt class="text-xs uppercase text-muted-foreground">
                        {$t(i18nKeys.console.instance.supabaseBranchLabel)}
                      </dt>
                      <dd class="mt-1 break-all font-mono">
                        {runtimeStatusQuery.data.database.supabaseBranchName ?? "-"}
                        {#if runtimeStatusQuery.data.database.supabaseProjectRef}
                          · {runtimeStatusQuery.data.database.supabaseProjectRef}
                        {/if}
                      </dd>
                    </div>
                  {/if}
                </dl>
              </div>

              <div class="rounded-md border bg-background p-4">
                <p class="text-sm font-medium">{$t(i18nKeys.console.instance.sourceTitle)}</p>
                <dl class="mt-4 space-y-3 text-sm">
                  <div>
                    <dt class="text-xs uppercase text-muted-foreground">
                      {$t(i18nKeys.console.instance.cloudCommitShaLabel)}
                    </dt>
                    <dd class="mt-1 break-all font-mono">
                      {runtimeStatusQuery.data?.git.cloudCommitSha ?? $t(i18nKeys.console.instance.noCommitSha)}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase text-muted-foreground">
                      {$t(i18nKeys.console.instance.publicAppaloftCommitShaLabel)}
                    </dt>
                    <dd class="mt-1 break-all font-mono">
                      {runtimeStatusQuery.data?.git.publicAppaloftCommitSha ??
                        $t(i18nKeys.console.instance.noCommitSha)}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase text-muted-foreground">
                      {$t(i18nKeys.console.instance.runtimeStatusGeneratedAtLabel)}
                    </dt>
                    <dd class="mt-1 break-all font-mono">
                      {runtimeStatusQuery.data?.generatedAt ?? "-"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {#if runtimeStatusQuery.error}
              <p
                class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {readErrorMessage(runtimeStatusQuery.error)}
              </p>
            {/if}

            <div class="mt-5 rounded-md border bg-muted/20 p-4">
              <div class="flex items-start gap-3">
                <Network class="mt-0.5 size-4 text-primary" />
                <div class="min-w-0">
                  <p class="text-sm font-medium">{$t(i18nKeys.console.instance.proxyTitle)}</p>
                  <p class="mt-1 text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.instance.proxyBody)}
                  </p>
                </div>
              </div>
            </div>

            {#if instanceUpgradeQuery.error}
              <p
                class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {readErrorMessage(instanceUpgradeQuery.error)}
              </p>
            {/if}

            {#if upgradeFeedback}
              <p
                class={`mt-4 rounded-md border p-3 text-sm ${
                  upgradeFeedback.kind === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                <span class="font-medium">{upgradeFeedback.title}</span>
                <span class="ml-2">{upgradeFeedback.detail}</span>
              </p>
            {/if}

            {#if instanceUpgradeQuery.data?.applyUnsupportedReason}
              <p class="mt-4 text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.instance.applyUnsupported)}
              </p>
            {/if}
          </section>
        {:else if activeSection === "maintenance"}
          <section class="console-panel p-5">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant={enabledMaintenanceWorkerCount > 0 ? "default" : "outline"}>
                    {$t(i18nKeys.console.instance.workerEnabledSummary, {
                      enabled: enabledMaintenanceWorkerCount,
                      total: maintenanceWorkers.length,
                    })}
                  </Badge>
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.instance.maintenanceWorkersTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.maintenanceWorkerActivation}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                  />
                </div>
                <p class="mt-3 text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.instance.maintenanceWorkersBody)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={doctorQuery.isFetching}
                onclick={() => void doctorQuery.refetch()}
              >
                <RefreshCw class="mr-2 size-4" />
                {doctorQuery.isFetching
                  ? $t(i18nKeys.common.status.loading)
                  : $t(i18nKeys.console.instance.refreshDoctor)}
              </Button>
            </div>

            {#if doctorQuery.error}
              <p
                class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {readErrorMessage(doctorQuery.error)}
              </p>
            {:else if doctorQuery.isPending}
              <div class="mt-5 rounded-md border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                {$t(i18nKeys.common.status.loading)}
              </div>
            {:else}
              <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {#each maintenanceWorkers as worker (worker.key)}
                  <div class="rounded-md border bg-background p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-medium">{$t(workerLabelKey(worker))}</p>
                        <p class="mt-1 font-mono text-xs text-muted-foreground">{worker.key}</p>
                      </div>
                      <Badge variant={worker.enabled ? "default" : "outline"}>
                        {worker.enabled
                          ? $t(i18nKeys.console.instance.workerStatusEnabled)
                          : $t(i18nKeys.console.instance.workerStatusDisabled)}
                      </Badge>
                    </div>
                    <div class="mt-4 space-y-2 text-sm text-muted-foreground">
                      <p class="flex items-center gap-2">
                        <ShieldCheck class="size-4" />
                        {$t(workerActivationLabelKey(worker))}
                      </p>
                      <p>{$t(workerSafetyLabelKey(worker))}</p>
                      <p>
                        {$t(i18nKeys.console.instance.workerIntervalSeconds, {
                          seconds: worker.intervalSeconds,
                        })}
                        {#if worker.batchSize}
                          · {$t(i18nKeys.console.instance.workerBatchSize, { count: worker.batchSize })}
                        {/if}
                        {#if worker.rawRetentionHours}
                          · {$t(i18nKeys.console.instance.workerRawRetentionHours, {
                            hours: worker.rawRetentionHours,
                          })}
                        {/if}
                      </p>
                      <p class="break-words font-mono text-xs">
                        {$t(i18nKeys.console.instance.workerConfigurationKeys)}:
                        {worker.configurationKeys.join(", ")}
                      </p>
                      <p class="break-words font-mono text-xs">{worker.operationKeys.join(", ")}</p>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        {:else if activeSection === "sessions"}
          <section class="console-panel p-5">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant={terminalSessions.length > 0 ? "default" : "outline"}>
                    {$t(i18nKeys.console.terminal.lifecycleActiveSummary, {
                      count: terminalSessions.length,
                    })}
                  </Badge>
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.terminal.lifecycleTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.serverTerminalSession}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                  />
                </div>
                <p class="mt-3 text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.terminal.lifecycleDescription)}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={terminalSessionsQuery.isFetching}
                  onclick={() => void terminalSessionsQuery.refetch()}
                >
                  <RefreshCw class="mr-2 size-4" />
                  {terminalSessionsQuery.isFetching
                    ? $t(i18nKeys.common.status.loading)
                    : $t(i18nKeys.console.terminal.lifecycleRefresh)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={expireTerminalSessionsMutation.isPending}
                  onclick={expireOldTerminalSessions}
                >
                  <Clock3 class="mr-2 size-4" />
                  {expireTerminalSessionsMutation.isPending
                    ? $t(i18nKeys.common.actions.saving)
                    : $t(i18nKeys.console.terminal.lifecycleExpireOld)}
                </Button>
              </div>
            </div>

            {#if terminalSessionsQuery.error}
              <p
                class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {readErrorMessage(terminalSessionsQuery.error)}
              </p>
            {/if}

            {#if terminalSessionFeedback}
              <p
                class={`mt-4 rounded-md border p-3 text-sm ${
                  terminalSessionFeedback.kind === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                <span class="font-medium">{terminalSessionFeedback.title}</span>
                <span class="ml-2">{terminalSessionFeedback.detail}</span>
              </p>
            {/if}

            <div class="mt-5 space-y-3">
              {#if terminalSessions.length > 0}
                {#each terminalSessions as session (session.sessionId)}
                  <article class="rounded-md border bg-background p-4">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div class="min-w-0 space-y-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <Terminal class="size-4 text-muted-foreground" />
                          <p class="break-all font-mono text-sm font-medium">{session.sessionId}</p>
                          <Badge variant={session.status === "active" ? "default" : "secondary"}>
                            {session.status}
                          </Badge>
                          <Badge variant="outline">{terminalSessionScopeLabel(session)}</Badge>
                        </div>
                        <p class="break-all text-sm text-muted-foreground">
                          {terminalSessionTargetLabel(session)}
                          {#if session.deploymentId}
                            · {session.deploymentId}
                          {/if}
                        </p>
                        {#if session.workingDirectory}
                          <p class="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
                            {session.workingDirectory}
                          </p>
                        {/if}
                        <p class="text-xs text-muted-foreground">
                          {$t(i18nKeys.console.terminal.lifecycleCreatedAt)}
                          {session.createdAt}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={closeTerminalSessionMutation.isPending}
                        onclick={() => closeTerminalSession(session)}
                      >
                        <X class="mr-2 size-4" />
                        {$t(i18nKeys.common.actions.closeTerminal)}
                      </Button>
                    </div>
                  </article>
                {/each}
              {:else if terminalSessionsQuery.isPending}
                <div class="rounded-md border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                  {$t(i18nKeys.common.status.loading)}
                </div>
              {:else}
                <div class="rounded-md border border-dashed bg-muted/15 px-4 py-6 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.terminal.lifecycleEmpty)}
                </div>
              {/if}
            </div>
          </section>
        {:else}
          <section class="console-panel p-5">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{$t(i18nKeys.console.instance.guidanceTitle)}</Badge>
                <h2 class="text-lg font-semibold">{$t(i18nKeys.console.instance.guidanceTitle)}</h2>
              </div>
              <p class="mt-3 text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.instance.guidanceBody)}
              </p>
            </div>

            <div class="mt-5 space-y-5">
              <div class="rounded-md border bg-background p-4">
                <p class="text-sm font-medium">{$t(i18nKeys.console.instance.upgradeCommandTitle)}</p>
                <pre class="mt-2 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{upgradeCommand}</code></pre>
              </div>

              <div class="grid gap-5 lg:grid-cols-2">
                <div class="rounded-md border bg-background p-4">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{$t(i18nKeys.console.instance.domainRouteBadge)}</Badge>
                    <h3 class="text-base font-semibold">
                      {$t(i18nKeys.console.instance.domainInstallTitle)}
                    </h3>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.instance.domainInstallBody)}
                  </p>
                  <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{domainInstallCommand}</code></pre>
                </div>

                <div class="rounded-md border bg-background p-4">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{$t(i18nKeys.console.instance.fallbackRouteBadge)}</Badge>
                    <h3 class="text-base font-semibold">
                      {$t(i18nKeys.console.instance.directInstallTitle)}
                    </h3>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.instance.directInstallBody)}
                  </p>
                  <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{directInstallCommand}</code></pre>
                </div>
              </div>

              <div class="grid gap-5 lg:grid-cols-2">
                <div class="rounded-md border bg-background p-4">
                  <div class="flex items-center gap-3">
                    <ClipboardList class="size-5 text-primary" />
                    <h3 class="text-base font-semibold">{$t(i18nKeys.console.instance.rerunTitle)}</h3>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.instance.rerunBody)}
                  </p>
                  <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{rerunCommand}</code></pre>
                </div>

                <div class="rounded-md border bg-background p-4">
                  <div class="flex items-center gap-3">
                    <GitBranch class="size-5 text-primary" />
                    <h3 class="text-base font-semibold">
                      {$t(i18nKeys.console.instance.actionControlPlaneTitle)}
                    </h3>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.instance.actionControlPlaneBody)}
                  </p>
                  <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{actionSnippet}</code></pre>
                </div>
              </div>
            </div>
          </section>
        {/if}
      </div>
    </div>
  </ConsoleResourceCanvas>
</ConsoleShell>

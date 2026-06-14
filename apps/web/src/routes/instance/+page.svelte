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
    OperatorWorkEvent,
    OperatorWorkItem,
    TerminalSessionSummary,
  } from "@appaloft/contracts";
  import {
    Activity,
    Clock3,
    ClipboardList,
    Download,
    GitBranch,
    Network,
    RefreshCw,
    ShieldCheck,
    Terminal,
    X,
  } from "@lucide/svelte";

  import { readErrorMessage, request } from "$lib/api/client";
  import ConsoleOrganizationSwitcher from "$lib/components/console/ConsoleOrganizationSwitcher.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { instanceSettingsItems } from "$lib/console/settings-nav";
  import { formatTime } from "$lib/console/utils";
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
  type InstanceSection = "overview" | "workers" | "maintenance" | "sessions" | "guidance";
  type InstanceRuntimeTopology = NonNullable<MaintenanceWorkerStatus["runtimeTopology"]>;
  type Props = {
    section?: InstanceSection | null;
  };
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
  let applyUpgradeDialogOpen = $state(false);
  let terminalSessionFeedback = $state<TerminalSessionFeedback | null>(null);
  let terminalSessionCloseDialogOpen = $state(false);
  let terminalSessionsExpireDialogOpen = $state(false);
  let selectedTerminalSessionId = $state("");
  let { section = null }: Props = $props();
  const activeSection = $derived.by<InstanceSection>(() => {
    if (section) {
      return section;
    }

    if (page.url.pathname.endsWith("/workers")) {
      return "workers";
    }
    if (page.url.pathname.endsWith("/maintenance")) {
      return "maintenance";
    }
    if (page.url.pathname.endsWith("/sessions")) {
      return "sessions";
    }
    if (page.url.pathname.endsWith("/guidance")) {
      return "guidance";
    }

    return parseInstanceSection(page.url.searchParams.get("section"));
  });
  const selectedWorkId = $derived(page.url.searchParams.get("workId") ?? "");
  const contextQuery = createQuery(() =>
    queryOptions({
      queryKey: ["organizations", "current-context"],
      queryFn: () => orpcClient.organizations.currentContext({}),
      enabled: browser,
      retry: 0,
      staleTime: 30_000,
    }),
  );
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
      enabled: browser && (activeSection === "maintenance" || activeSection === "workers"),
      staleTime: 30_000,
      refetchInterval: 60_000,
      retry: 0,
    }),
  );
  const operatorWorkQuery = createQuery(() =>
    queryOptions({
      queryKey: ["operator-work", "instance-workers", { limit: 25 }],
      queryFn: () => orpcClient.operatorWork.list({ limit: 25 }),
      enabled: browser && activeSection === "workers",
      staleTime: 10_000,
      refetchInterval: 15_000,
      retry: 0,
    }),
  );
  const selectedOperatorWorkQuery = createQuery(() =>
    queryOptions({
      queryKey: ["operator-work", selectedWorkId],
      queryFn: () => orpcClient.operatorWork.show({ workId: selectedWorkId }),
      enabled: browser && activeSection === "workers" && selectedWorkId.length > 0,
      staleTime: 5_000,
      refetchInterval: 10_000,
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
      applyUpgradeDialogOpen = false;
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
  const switchCurrentOrganizationMutation = createMutation(() => ({
    mutationFn: (organizationId: string) =>
      orpcClient.organizations.switchCurrent({ organizationId }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  }));
  const domainInstallCommand =
    "curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain console.example.com";
  const directInstallCommand = "curl -fsSL https://appaloft.com/install.sh | sudo sh";
  const rerunCommand =
    "curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain new-console.example.com";
  const fallbackUpgradeCommand = "curl -fsSL https://appaloft.com/install.sh | sudo sh";
  const upgradeStatus = $derived(instanceUpgradeQuery.data?.checkStatus ?? null);
  const visibleUpgradeStatus = $derived(
    upgradeStatus === "available" || upgradeStatus === "current" ? upgradeStatus : null,
  );
  const doctor = $derived(doctorQuery.data ?? null);
  const currentOrganization = $derived(contextQuery.data?.currentOrganization ?? null);
  const organizations = $derived(contextQuery.data?.organizations ?? []);
  const terminalSessions = $derived(terminalSessionsQuery.data?.items ?? []);
  const selectedTerminalSession = $derived(
    terminalSessions.find((session) => session.sessionId === selectedTerminalSessionId) ?? null,
  );
  const maintenanceWorkers = $derived(doctor?.maintenanceWorkers ?? []);
  const durableWorker = $derived(
    maintenanceWorkers.find((worker) => worker.key === "durable-worker-runtime") ?? null,
  );
  const durableRuntimeTopology = $derived(durableWorker?.runtimeTopology ?? null);
  const durableRuntimeWebExecutionDisabled = $derived(
    durableRuntimeTopology?.mode === "disabled" ||
      durableRuntimeTopology?.coordinationRole === "disabled" ||
      durableRuntimeTopology?.workerCount === 0,
  );
  const observedRuntimeHeartbeats = $derived(durableWorker?.observedRuntimeHeartbeats ?? []);
  const observedRuntimeExpectedWorkerCount = $derived.by(() =>
    observedRuntimeHeartbeats.reduce((sum, observed) => sum + observed.workerCount, 0),
  );
  const observedRuntimeOnlineWorkerCount = $derived.by(() =>
    observedRuntimeHeartbeats.reduce(
      (sum, observed) => sum + (observed.heartbeat?.onlineWorkerCount ?? 0),
      0,
    ),
  );
  const operatorWorkItems = $derived(operatorWorkQuery.data?.items ?? []);
  const selectedOperatorWork = $derived(selectedOperatorWorkQuery.data?.item ?? null);
  const selectedOperatorWorkEvents = $derived(selectedOperatorWorkQuery.data?.events ?? []);
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
    if (
      value === "workers" ||
      value === "maintenance" ||
      value === "sessions" ||
      value === "guidance"
    ) {
      return value;
    }

    return "overview";
  }

  function instanceSectionHref(section: InstanceSection): string {
    switch (section) {
      case "workers":
        return "/instance/workers";
      case "maintenance":
        return "/instance/maintenance";
      case "sessions":
        return "/instance/sessions";
      case "guidance":
        return "/instance/guidance";
      case "overview":
        return "/instance";
    }
  }

  function workerDetailHref(workId: string): string {
    const params = new URLSearchParams(page.url.searchParams);
    params.set("workId", workId);
    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function switchOrganization(organizationId: string): void {
    if (!organizationId || organizationId === currentOrganization?.organizationId) {
      return;
    }

    switchCurrentOrganizationMutation.mutate(organizationId);
  }

  function navigateTo(path: string): void {
    if (browser) {
      void goto(path);
    }
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
      case "durable-worker-runtime":
        return i18nKeys.console.instance.workerDurableRuntime;
    }
  }

  function workerActivationLabelKey(worker: MaintenanceWorkerStatus) {
    if (worker.activation === "starts-as-standalone-process") {
      return i18nKeys.console.instance.workerActivationStandalone;
    }

    if (worker.activation === "starts-with-backend-service") {
      return i18nKeys.console.instance.workerActivationStarts;
    }

    return i18nKeys.console.instance.workerActivationDisabled;
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
      case "durable-process-delivery":
        return i18nKeys.console.instance.workerSafetyDurableProcessDelivery;
    }
  }

  function runtimeModeVariant(mode: InstanceRuntimeTopology["mode"]) {
    if (mode === "embedded") {
      return "default";
    }

    if (mode === "standalone") {
      return "secondary";
    }

    return "outline";
  }

  function workerOnlineStatusLabel(
    worker: NonNullable<InstanceRuntimeTopology["heartbeat"]>["workers"][number],
  ): string {
    return worker.online ? $t(i18nKeys.common.status.active) : $t(i18nKeys.common.status.inactive);
  }

  function workStatusVariant(status: OperatorWorkItem["status"]) {
    if (status === "succeeded") {
      return "default";
    }

    if (status === "failed" || status === "dead-lettered") {
      return "destructive";
    }

    if (status === "running" || status === "retry-scheduled" || status === "pending") {
      return "secondary";
    }

    return "outline";
  }

  function workStatusLabel(status: OperatorWorkItem["status"]): string {
    if (status === "running") return $t(i18nKeys.common.status.running);
    if (status === "pending") return $t(i18nKeys.common.status.requested);
    if (status === "succeeded") return $t(i18nKeys.common.status.passed);
    if (status === "failed") return $t(i18nKeys.common.status.failed);
    if (status === "canceled") return $t(i18nKeys.common.actions.cancel);
    if (status === "retry-scheduled") return $t(i18nKeys.console.instance.workerWorkRetryScheduled);
    if (status === "dead-lettered") return $t(i18nKeys.console.instance.workerWorkDeadLettered);
    return $t(i18nKeys.common.status.unknown);
  }

  function eventStatusLabel(event: OperatorWorkEvent): string {
    return event.status ? workStatusLabel(event.status) : event.kind;
  }

  function workScopeLabel(work: OperatorWorkItem): string {
    return (
      work.deploymentId ??
      work.resourceId ??
      work.projectId ??
      work.serverId ??
      work.domainBindingId ??
      work.certificateId ??
      "-"
    );
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

  function openApplyUpgradeDialog(): void {
    upgradeFeedback = null;
    applyUpgradeDialogOpen = true;
  }

  function setApplyUpgradeDialogOpen(open: boolean): void {
    applyUpgradeDialogOpen = open;
  }

  function confirmApplyUpgrade(): void {
    if (!browser || !canApplyUpgrade || applyUpgradeMutation.isPending) {
      return;
    }

    upgradeFeedback = null;
    applyUpgradeMutation.mutate();
  }

  function openTerminalSessionCloseDialog(session: TerminalSessionSummary): void {
    selectedTerminalSessionId = session.sessionId;
    terminalSessionFeedback = null;
    terminalSessionCloseDialogOpen = true;
  }

  function setTerminalSessionCloseDialogOpen(open: boolean): void {
    terminalSessionCloseDialogOpen = open;
    if (!open) {
      selectedTerminalSessionId = "";
    }
  }

  function openTerminalSessionsExpireDialog(): void {
    terminalSessionFeedback = null;
    terminalSessionsExpireDialogOpen = true;
  }

  function setTerminalSessionsExpireDialogOpen(open: boolean): void {
    terminalSessionsExpireDialogOpen = open;
  }

  function confirmCloseTerminalSession(session: TerminalSessionSummary | null): void {
    if (!browser || closeTerminalSessionMutation.isPending || !session) {
      return;
    }

    terminalSessionFeedback = null;
    terminalSessionCloseDialogOpen = false;
    closeTerminalSessionMutation.mutate({ sessionId: session.sessionId });
  }

  function confirmExpireTerminalSessions(): void {
    if (!browser || expireTerminalSessionsMutation.isPending) {
      return;
    }

    terminalSessionFeedback = null;
    terminalSessionsExpireDialogOpen = false;
    expireTerminalSessionsMutation.mutate();
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.instance.pageTitle)} · Appaloft</title>
</svelte:head>

<SettingsShell
  title={$t(i18nKeys.console.instance.pageTitle)}
  description={$t(i18nKeys.console.instance.pageDescription)}
  groupLabel={$t(i18nKeys.console.instance.pageTitle)}
  activePath={instanceSectionHref(activeSection)}
  items={instanceSettingsItems()}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.instance.pageTitle) },
  ]}
>
  {#snippet sidebarHeader()}
    <ConsoleOrganizationSwitcher
      {currentOrganization}
      {organizations}
      pending={switchCurrentOrganizationMutation.isPending}
      onSwitch={switchOrganization}
      onNavigate={navigateTo}
    />
  {/snippet}

  <div class="mx-auto max-w-6xl space-y-4">
        {#if activeSection === "overview"}
          <section class="console-panel p-5" data-instance-overview-display-surface>
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  {#if visibleUpgradeStatus}
                    <Badge variant={visibleUpgradeStatus === "available" ? "default" : "outline"}>
                      {$t(statusLabelKey(visibleUpgradeStatus))}
                    </Badge>
                  {/if}
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
                  variant="outline"
                  disabled={!canApplyUpgrade}
                  onclick={openApplyUpgradeDialog}
                >
                  <ClipboardList class="mr-2 size-4" />
                  {applyUpgradeMutation.isPending
                    ? $t(i18nKeys.console.instance.applyingUpgrade)
                    : $t(i18nKeys.console.instance.reviewUpgrade)}
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
                <span class="font-medium">
                  {$t(i18nKeys.console.instance.updateCheckUnavailableTitle)}
                </span>
                <span class="ml-2">
                  {$t(i18nKeys.console.instance.updateCheckUnavailableBody)}
                </span>
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
        {:else if activeSection === "workers"}
          <section class="space-y-5" data-instance-workers-display-surface>
            <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div class="max-w-2xl space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  {#if observedRuntimeHeartbeats.length > 0}
                    <Badge
                      variant={observedRuntimeExpectedWorkerCount > 0 &&
                      observedRuntimeOnlineWorkerCount === observedRuntimeExpectedWorkerCount
                        ? "default"
                        : "outline"}
                    >
                      {$t(i18nKeys.console.instance.workerObservedRuntimeSummary, {
                        online: observedRuntimeOnlineWorkerCount,
                        expected: observedRuntimeExpectedWorkerCount,
                      })}
                    </Badge>
                  {:else}
                    <Badge variant={durableRuntimeTopology ? runtimeModeVariant(durableRuntimeTopology.mode) : "outline"}>
                      {durableRuntimeTopology?.mode ?? $t(i18nKeys.common.status.loading)}
                    </Badge>
                  {/if}
                  <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.instance.workerManagementTitle)}</h1>
                </div>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.instance.workerManagementBody)}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={doctorQuery.isFetching}
                  onclick={() => void doctorQuery.refetch()}
                >
                  <RefreshCw class={["mr-2 size-4", doctorQuery.isFetching ? "animate-spin" : ""]} />
                  {$t(i18nKeys.console.instance.refreshDoctor)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={operatorWorkQuery.isFetching}
                  onclick={() => void operatorWorkQuery.refetch()}
                >
                  <RefreshCw class={["mr-2 size-4", operatorWorkQuery.isFetching ? "animate-spin" : ""]} />
                  {$t(i18nKeys.console.instance.workerWorkRefresh)}
                </Button>
              </div>
            </div>

            {#if doctorQuery.error}
              <p class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {readErrorMessage(doctorQuery.error)}
              </p>
            {/if}

            <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div class="space-y-4">
                <section class="console-panel p-5">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                      <Activity class="size-5 text-primary" />
                      <div>
                        <h2 class="text-lg font-semibold">
                          {observedRuntimeHeartbeats.length > 0
                            ? $t(i18nKeys.console.instance.workerObservedRuntimeWorkers)
                            : $t(i18nKeys.console.instance.workerRuntimeTopology)}
                        </h2>
                        <p class="mt-1 text-sm text-muted-foreground">
                          {observedRuntimeHeartbeats.length > 0
                            ? $t(i18nKeys.console.instance.workerObservedRuntimeWorkersBody)
                            : $t(i18nKeys.console.instance.workerRuntimeTopologyBody)}
                        </p>
                      </div>
                    </div>
                    {#if durableWorker}
                      <Badge variant={durableWorker.enabled ? "default" : "outline"}>
                        {durableWorker.enabled
                          ? $t(i18nKeys.console.instance.workerStatusEnabled)
                          : $t(i18nKeys.console.instance.workerStatusDisabled)}
                      </Badge>
                    {/if}
                  </div>

                  {#if doctorQuery.isPending}
                    <div class="mt-5 rounded-md border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                      {$t(i18nKeys.common.status.loading)}
                    </div>
                  {:else if durableRuntimeTopology}
                    {#if observedRuntimeHeartbeats.length > 0}
                      <div class="mt-5 space-y-3">
                        {#each observedRuntimeHeartbeats as observed (observed.workerGroup)}
                          <div class="rounded-md border bg-muted/20 p-3">
                            <div class="grid gap-3 md:grid-cols-3">
                              <div>
                                <p class="text-xs uppercase text-muted-foreground">
                                  {$t(i18nKeys.console.instance.workerRuntimeGroup)}
                                </p>
                                <p class="mt-1 break-all font-mono text-sm">{observed.workerGroup}</p>
                              </div>
                              <div>
                                <p class="text-xs uppercase text-muted-foreground">
                                  {$t(i18nKeys.console.instance.workerObservedExpectedWorkers)}
                                </p>
                                <p class="mt-1 font-mono text-sm">{observed.workerCount}</p>
                              </div>
                              <div>
                                <p class="text-xs uppercase text-muted-foreground">
                                  {$t(i18nKeys.console.instance.workerRuntimeHeartbeat)}
                                </p>
                                <p class="mt-1 font-mono text-sm">
                                  {observed.heartbeat
                                    ? `${observed.heartbeat.onlineWorkerCount}/${observed.workerCount}`
                                    : "-"}
                                </p>
                              </div>
                            </div>

                            {#if observed.heartbeat}
                              <div class="mt-3 flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={observed.heartbeat.onlineWorkerCount === observed.workerCount
                                    ? "default"
                                    : "outline"}
                                >
                                  {$t(i18nKeys.console.instance.workerRuntimeOnlineWorkers)}:
                                  {observed.heartbeat.onlineWorkerCount}
                                </Badge>
                                <Badge
                                  variant={observed.heartbeat.staleWorkerCount > 0
                                    ? "destructive"
                                    : "outline"}
                                >
                                  {$t(i18nKeys.console.instance.workerRuntimeStaleWorkers)}:
                                  {observed.heartbeat.staleWorkerCount}
                                </Badge>
                                {#if observed.heartbeat.lastSeenAt}
                                  <span class="text-xs text-muted-foreground">
                                    {$t(i18nKeys.console.instance.workerRuntimeLastSeen)}
                                    {formatTime(observed.heartbeat.lastSeenAt)}
                                  </span>
                                {/if}
                              </div>

                              {#if observed.heartbeat.workers.length > 0}
                                <div class="console-record-list mt-3">
                                  {#each observed.heartbeat.workers as runtimeWorker (runtimeWorker.workerId)}
                                    <div class="console-record-row gap-4 lg:grid-cols-[minmax(0,1fr)_7rem_9rem_12rem] lg:items-center">
                                      <div class="min-w-0">
                                        <p class="text-xs font-medium text-muted-foreground">
                                          {$t(i18nKeys.console.instance.workerRuntimeWorkerId)}
                                        </p>
                                        <p class="mt-1 break-all font-mono text-xs">{runtimeWorker.workerId}</p>
                                      </div>
                                      <div class="text-sm">
                                        <p class="text-xs font-medium text-muted-foreground">
                                          {$t(i18nKeys.console.instance.workerRuntimeSlot)}
                                        </p>
                                        <p class="mt-1 font-mono">{runtimeWorker.slot}</p>
                                      </div>
                                      <div>
                                        <p class="text-xs font-medium text-muted-foreground">
                                          {$t(i18nKeys.common.domain.status)}
                                        </p>
                                        <Badge class="mt-1" variant={runtimeWorker.online ? "default" : "outline"}>
                                          {workerOnlineStatusLabel(runtimeWorker)}
                                        </Badge>
                                      </div>
                                      <div class="text-sm text-muted-foreground">
                                        <p class="text-xs font-medium">
                                          {$t(i18nKeys.console.instance.workerRuntimeLastSeen)}
                                        </p>
                                        <p class="mt-1">{formatTime(runtimeWorker.lastSeenAt)}</p>
                                      </div>
                                    </div>
                                  {/each}
                                </div>
                              {/if}
                            {:else}
                              <p class="mt-3 text-sm text-muted-foreground">
                                {$t(i18nKeys.console.instance.workerObservedRuntimeNoHeartbeat)}
                              </p>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}

                    <div class={observedRuntimeHeartbeats.length > 0 ? "mt-4" : "mt-5"}>
                      <div class="rounded-md border bg-muted/20 p-4">
                        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p class="text-xs uppercase text-muted-foreground">
                              {$t(i18nKeys.console.instance.workerRuntimeMode)}
                            </p>
                            <p class="mt-1 font-mono text-sm">{durableRuntimeTopology.mode}</p>
                          </div>
                          <div>
                            <p class="text-xs uppercase text-muted-foreground">
                              {$t(i18nKeys.console.instance.workerRuntimeWorkers)}
                            </p>
                            <p class="mt-1 font-mono text-sm">{durableRuntimeTopology.workerCount}</p>
                          </div>
                          <div>
                            <p class="text-xs uppercase text-muted-foreground">
                              {$t(i18nKeys.console.instance.workerRuntimeBackend)}
                            </p>
                            <p class="mt-1 font-mono text-sm">{durableRuntimeTopology.queueBackend}</p>
                          </div>
                          <div>
                            <p class="text-xs uppercase text-muted-foreground">
                              {$t(i18nKeys.console.instance.workerRuntimeRole)}
                            </p>
                            <p class="mt-1 font-mono text-sm">{durableRuntimeTopology.coordinationRole}</p>
                          </div>
                        </div>

                        <div class="mt-4 grid gap-3 lg:grid-cols-2">
                          <div>
                            <p class="text-xs uppercase text-muted-foreground">
                              {$t(i18nKeys.console.instance.workerRuntimeGroup)}
                            </p>
                            <p class="mt-1 break-all font-mono text-sm">
                              {durableRuntimeTopology.workerGroup}
                            </p>
                          </div>
                          <div>
                            <p class="text-xs uppercase text-muted-foreground">
                              {$t(i18nKeys.console.instance.workerRuntimeWorkerIds)}
                            </p>
                            <p class="mt-1 break-all font-mono text-sm">
                              {durableRuntimeTopology.workerIds.join(", ") || "-"}
                            </p>
                          </div>
                        </div>

                        {#if durableRuntimeWebExecutionDisabled}
                          <p class="mt-3 text-sm text-muted-foreground">
                            {$t(i18nKeys.console.instance.workerRuntimeWebDisabledHint)}
                          </p>
                        {/if}
                      </div>
                    </div>

                    {#if durableRuntimeTopology.heartbeat}
                      <div class="mt-4 space-y-3">
                        <div class="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {$t(i18nKeys.console.instance.workerRuntimeOnlineWorkers)}:
                            {durableRuntimeTopology.heartbeat.onlineWorkerCount}
                          </Badge>
                          <Badge variant="outline">
                            {$t(i18nKeys.console.instance.workerRuntimeStaleWorkers)}:
                            {durableRuntimeTopology.heartbeat.staleWorkerCount}
                          </Badge>
                          {#if durableRuntimeTopology.heartbeat.lastSeenAt}
                            <span class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.instance.workerRuntimeLastSeen)}
                              {formatTime(durableRuntimeTopology.heartbeat.lastSeenAt)}
                            </span>
                          {/if}
                        </div>

                        {#if durableRuntimeTopology.heartbeat.workers.length > 0}
                          <div class="console-record-list" data-instance-runtime-workers-list>
                            {#each durableRuntimeTopology.heartbeat.workers as runtimeWorker (runtimeWorker.workerId)}
                              <div class="console-record-row gap-4 lg:grid-cols-[minmax(0,1fr)_7rem_9rem_12rem] lg:items-center">
                                <div class="min-w-0">
                                  <p class="text-xs font-medium text-muted-foreground">
                                    {$t(i18nKeys.console.instance.workerRuntimeWorkerId)}
                                  </p>
                                  <p class="mt-1 break-all font-mono text-xs">{runtimeWorker.workerId}</p>
                                </div>
                                <div class="text-sm">
                                  <p class="text-xs font-medium text-muted-foreground">
                                    {$t(i18nKeys.console.instance.workerRuntimeSlot)}
                                  </p>
                                  <p class="mt-1 font-mono">{runtimeWorker.slot}</p>
                                </div>
                                <div>
                                  <p class="text-xs font-medium text-muted-foreground">
                                    {$t(i18nKeys.common.domain.status)}
                                  </p>
                                  <Badge class="mt-1" variant={runtimeWorker.online ? "default" : "outline"}>
                                    {workerOnlineStatusLabel(runtimeWorker)}
                                  </Badge>
                                </div>
                                <div class="text-sm text-muted-foreground">
                                  <p class="text-xs font-medium">
                                    {$t(i18nKeys.console.instance.workerRuntimeLastSeen)}
                                  </p>
                                  <p class="mt-1">{formatTime(runtimeWorker.lastSeenAt)}</p>
                                </div>
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  {:else}
                    <div class="mt-5 rounded-md border border-dashed bg-muted/15 px-4 py-6 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.instance.workerRuntimeUnavailable)}
                    </div>
                  {/if}
                </section>

                <section class="console-panel p-5">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 class="text-lg font-semibold">
                        {$t(i18nKeys.console.instance.workerWorkTitle)}
                      </h2>
                      <p class="mt-1 text-sm leading-6 text-muted-foreground">
                        {$t(i18nKeys.console.instance.workerWorkBody)}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {$t(i18nKeys.console.instance.workerWorkCount, { count: operatorWorkItems.length })}
                    </Badge>
                  </div>

                  {#if operatorWorkQuery.error}
                    <p class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      {readErrorMessage(operatorWorkQuery.error)}
                    </p>
                  {:else if operatorWorkQuery.isPending}
                    <div class="mt-5 rounded-md border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                      {$t(i18nKeys.common.status.loading)}
                    </div>
                  {:else if operatorWorkItems.length > 0}
                    <div class="mt-5 console-record-list" data-instance-operator-work-list>
                      {#each operatorWorkItems as work (work.id)}
                        <a
                          href={workerDetailHref(work.id)}
                          class={[
                            "console-record-row group gap-4 lg:grid-cols-[minmax(0,1fr)_9rem_12rem_12rem_auto] lg:items-center",
                            selectedWorkId === work.id ? "bg-primary/5" : "",
                          ]}
                        >
                          <div class="min-w-0">
                            <p class="truncate font-medium">{work.operationKey}</p>
                            <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                              {work.id}
                            </p>
                            {#if work.phase || work.step}
                              <p class="mt-1 truncate text-xs text-muted-foreground">
                                {work.phase ?? "-"}{#if work.step} / {work.step}{/if}
                              </p>
                            {/if}
                          </div>
                          <div>
                            <p class="text-xs font-medium text-muted-foreground">
                              {$t(i18nKeys.common.domain.status)}
                            </p>
                            <Badge class="mt-1" variant={workStatusVariant(work.status)}>
                              {workStatusLabel(work.status)}
                            </Badge>
                          </div>
                          <div class="min-w-0 text-sm">
                            <p class="text-xs font-medium text-muted-foreground">
                              {$t(i18nKeys.console.instance.workerWorkScope)}
                            </p>
                            <p class="mt-1 truncate font-mono text-xs">{workScopeLabel(work)}</p>
                          </div>
                          <div class="text-sm text-muted-foreground">
                            <p class="text-xs font-medium">
                              {$t(i18nKeys.console.instance.workerWorkUpdatedAt)}
                            </p>
                            <p class="mt-1">{formatTime(work.updatedAt)}</p>
                          </div>
                          <span
                            class="inline-flex items-center justify-end text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground"
                          >
                            {$t(i18nKeys.common.actions.viewDetails)}
                          </span>
                        </a>
                      {/each}
                    </div>
                  {:else}
                    <div class="mt-5 rounded-md border border-dashed bg-muted/15 px-4 py-6 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.instance.workerWorkEmpty)}
                    </div>
                  {/if}
                </section>
              </div>

              <aside class="console-panel p-5" data-instance-worker-events-observation>
                <div class="flex items-center gap-3">
                  <ClipboardList class="size-5 text-primary" />
                  <div>
                    <h2 class="text-lg font-semibold">
                      {$t(i18nKeys.console.instance.workerWorkEventsTitle)}
                    </h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.instance.workerWorkEventsBody)}
                    </p>
                  </div>
                </div>

                {#if !selectedWorkId}
                  <div class="mt-5 rounded-md border border-dashed bg-muted/15 px-4 py-6 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.instance.workerWorkEventsSelect)}
                  </div>
                {:else if selectedOperatorWorkQuery.error}
                  <p class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {readErrorMessage(selectedOperatorWorkQuery.error)}
                  </p>
                {:else if selectedOperatorWorkQuery.isPending}
                  <div class="mt-5 rounded-md border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                    {$t(i18nKeys.common.status.loading)}
                  </div>
                {:else if selectedOperatorWork}
                  <div class="mt-5 space-y-4">
                    <div class="rounded-md border bg-background p-3">
                      <p class="break-all font-mono text-xs">{selectedOperatorWork.id}</p>
                      <div class="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant={workStatusVariant(selectedOperatorWork.status)}>
                          {workStatusLabel(selectedOperatorWork.status)}
                        </Badge>
                        <Badge variant="outline">{selectedOperatorWork.kind}</Badge>
                      </div>
                    </div>

                    {#if selectedOperatorWork.errorCode || selectedOperatorWork.errorCategory || selectedOperatorWork.retriable !== undefined || selectedOperatorWork.safeDetails}
                      <div class="rounded-md border bg-muted/20 p-3 text-sm">
                        <p class="font-medium">
                          {$t(i18nKeys.console.instance.workerWorkFailureSummary)}
                        </p>
                        <dl class="mt-3 space-y-2">
                          {#if selectedOperatorWork.errorCode}
                            <div>
                              <dt class="text-xs uppercase text-muted-foreground">
                                {$t(i18nKeys.console.instance.workerWorkFailureErrorCode)}
                              </dt>
                              <dd class="mt-1 break-all font-mono text-xs">{selectedOperatorWork.errorCode}</dd>
                            </div>
                          {/if}
                          {#if selectedOperatorWork.errorCategory}
                            <div>
                              <dt class="text-xs uppercase text-muted-foreground">
                                {$t(i18nKeys.console.instance.workerWorkFailureCategory)}
                              </dt>
                              <dd class="mt-1 font-mono text-xs">{selectedOperatorWork.errorCategory}</dd>
                            </div>
                          {/if}
                          {#if selectedOperatorWork.retriable !== undefined}
                            <div>
                              <dt class="text-xs uppercase text-muted-foreground">
                                {$t(i18nKeys.console.instance.workerWorkFailureRetriable)}
                              </dt>
                              <dd class="mt-1 font-mono text-xs">{selectedOperatorWork.retriable ? "true" : "false"}</dd>
                            </div>
                          {/if}
                          {#if selectedOperatorWork.safeDetails}
                            <div>
                              <dt class="text-xs uppercase text-muted-foreground">
                                {$t(i18nKeys.console.instance.workerWorkFailureSafeDetails)}
                              </dt>
                              <dd class="mt-1 space-y-1 font-mono text-xs">
                                {#each Object.entries(selectedOperatorWork.safeDetails) as [key, value] (key)}
                                  <p class="break-all">{key}: {String(value)}</p>
                                {/each}
                              </dd>
                            </div>
                          {/if}
                        </dl>
                      </div>
                    {/if}

                    {#if selectedOperatorWorkEvents.length > 0}
                      <div class="space-y-3">
                        {#each selectedOperatorWorkEvents as event (event.id)}
                          <article class="rounded-md border bg-background p-3 text-sm">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                              <Badge variant={event.status ? workStatusVariant(event.status) : "outline"}>
                                {eventStatusLabel(event)}
                              </Badge>
                              <span class="text-xs text-muted-foreground">
                                #{event.sequence} · {formatTime(event.occurredAt)}
                              </span>
                            </div>
                            {#if event.message}
                              <p class="mt-3 leading-6">{event.message}</p>
                            {/if}
                            <div class="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
                              {#if event.phase || event.step}
                                <p>{event.phase ?? "-"}{#if event.step} / {event.step}{/if}</p>
                              {/if}
                              {#if event.workerId || event.workerGroup}
                                <p>
                                  {event.workerGroup ?? "-"}
                                  {#if event.workerId}
                                    · {event.workerId}
                                  {/if}
                                </p>
                              {/if}
                            </div>
                          </article>
                        {/each}
                      </div>
                    {:else}
                      <div class="rounded-md border border-dashed bg-muted/15 px-4 py-6 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.instance.workerWorkEventsEmpty)}
                      </div>
                    {/if}
                  </div>
                {/if}
              </aside>
            </div>
          </section>
        {:else if activeSection === "maintenance"}
          <section class="console-panel p-5" data-instance-maintenance-display-surface>
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
                      {#if worker.runtimeTopology}
                        <div class="space-y-1 rounded-md border bg-muted/30 p-3 text-xs">
                          <p class="font-medium text-foreground">
                            {$t(i18nKeys.console.instance.workerRuntimeTopology)}
                          </p>
                          <p class="break-words font-mono">
                            {$t(i18nKeys.console.instance.workerRuntimeMode)}:
                            {worker.runtimeTopology.mode}
                            · {$t(i18nKeys.console.instance.workerRuntimeBackend)}:
                            {worker.runtimeTopology.queueBackend}
                          </p>
                          <p class="break-words font-mono">
                            {$t(i18nKeys.console.instance.workerRuntimeGroup)}:
                            {worker.runtimeTopology.workerGroup}
                            · {$t(i18nKeys.console.instance.workerRuntimeRole)}:
                            {worker.runtimeTopology.coordinationRole}
                          </p>
                          <p class="break-words font-mono">
                            {$t(i18nKeys.console.instance.workerRuntimeWorkers)}:
                            {worker.runtimeTopology.workerIds.join(", ") || "-"}
                          </p>
                          {#if worker.runtimeTopology.heartbeat}
                            <div class="mt-3 space-y-1 border-t pt-3">
                              <p class="font-medium text-foreground">
                                {$t(i18nKeys.console.instance.workerRuntimeHeartbeat)}
                              </p>
                              <p class="break-words font-mono">
                                {$t(i18nKeys.console.instance.workerRuntimeOnlineWorkers)}:
                                {worker.runtimeTopology.heartbeat.onlineWorkerCount}
                                · {$t(i18nKeys.console.instance.workerRuntimeStaleWorkers)}:
                                {worker.runtimeTopology.heartbeat.staleWorkerCount}
                                {#if worker.runtimeTopology.heartbeat.lastSeenAt}
                                  · {$t(i18nKeys.console.instance.workerRuntimeLastSeen)}:
                                  {worker.runtimeTopology.heartbeat.lastSeenAt}
                                {/if}
                              </p>
                              {#if worker.runtimeTopology.heartbeat.workers.length > 0}
                                <p class="break-words font-mono">
                                  {worker.runtimeTopology.heartbeat.workers
                                    .map((runtimeWorker) =>
                                      `${runtimeWorker.workerId} ${runtimeWorker.online ? "online" : "stale"} ${runtimeWorker.lastSeenAt}`,
                                    )
                                    .join(", ")}
                                </p>
                              {/if}
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        {:else if activeSection === "sessions"}
          <section class="console-panel p-5" data-instance-sessions-display-surface>
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

            <div
              class="mt-5 rounded-md border bg-muted/15 px-3 py-2"
              data-instance-terminal-sessions-lifecycle-handoff
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex min-w-0 items-start gap-3">
                  <ShieldCheck class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div class="min-w-0">
                    <p class="text-sm font-semibold">
                      {$t(i18nKeys.console.terminal.lifecycleManageAction)}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {$t(i18nKeys.console.terminal.lifecycleExpireConfirm)}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={expireTerminalSessionsMutation.isPending}
                  onclick={openTerminalSessionsExpireDialog}
                >
                  <ShieldCheck class="size-4" />
                  {$t(i18nKeys.console.terminal.lifecycleManageAction)}
                </Button>
              </div>
            </div>

            <div class="console-record-list mt-5" data-instance-terminal-sessions-list>
              {#if terminalSessions.length > 0}
                {#each terminalSessions as session (session.sessionId)}
                  <article class="console-record-row lg:grid-cols-[minmax(0,1fr)_auto]">
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
                      onclick={() => openTerminalSessionCloseDialog(session)}
                    >
                      <ShieldCheck class="size-4" />
                      {$t(i18nKeys.console.terminal.lifecycleManageAction)}
                    </Button>
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
          <section class="console-panel p-5" data-instance-guidance-display-surface>
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

  <Dialog.Root bind:open={applyUpgradeDialogOpen} onOpenChange={setApplyUpgradeDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.instance.applyUpgrade)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.instance.updatesBody)}
        </Dialog.Description>
      </Dialog.Header>
      <div class="space-y-4 px-5 py-4" data-instance-apply-upgrade-dialog>
        <dl class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3">
            <dt class="text-xs font-medium uppercase text-muted-foreground">
              {$t(i18nKeys.console.instance.currentVersionLabel)}
            </dt>
            <dd class="mt-1 break-all font-mono text-sm">{currentVersion}</dd>
          </div>
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3">
            <dt class="text-xs font-medium uppercase text-muted-foreground">
              {$t(i18nKeys.console.instance.targetVersionLabel)}
            </dt>
            <dd class="mt-1 break-all font-mono text-sm">
              {instanceUpgradeQuery.data?.targetVersion ?? "-"}
            </dd>
          </div>
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3">
            <dt class="text-xs font-medium uppercase text-muted-foreground">
              {$t(i18nKeys.console.instance.latestVersionLabel)}
            </dt>
            <dd class="mt-1 break-all font-mono text-sm">
              {instanceUpgradeQuery.data?.latestVersion ?? "-"}
            </dd>
          </div>
        </dl>

        <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3">
          <p class="text-sm font-medium">{$t(i18nKeys.console.instance.upgradeCommandTitle)}</p>
          <pre class="mt-3 overflow-x-auto rounded-md border bg-background p-3 text-xs"><code>{upgradeCommand}</code></pre>
        </div>
      </div>
      <Dialog.Footer class="border-t p-5">
        <Button type="button" variant="outline" onclick={() => setApplyUpgradeDialogOpen(false)}>
          {$t(i18nKeys.common.actions.cancel)}
        </Button>
        <Button type="button" disabled={!canApplyUpgrade} onclick={confirmApplyUpgrade}>
          <Download class="size-4" />
          {applyUpgradeMutation.isPending
            ? $t(i18nKeys.console.instance.applyingUpgrade)
            : $t(i18nKeys.console.instance.applyUpgrade)}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root
    bind:open={terminalSessionsExpireDialogOpen}
    onOpenChange={setTerminalSessionsExpireDialogOpen}
  >
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.terminal.lifecycleExpireOld)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.terminal.lifecycleExpireConfirm)}
        </Dialog.Description>
      </Dialog.Header>
      <div class="space-y-4 px-5 py-4" data-instance-terminal-expire-dialog>
        <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3 text-sm">
          <p class="font-medium">
            {$t(i18nKeys.console.terminal.lifecycleActiveSummary, {
              count: terminalSessions.length,
            })}
          </p>
          <p class="mt-1 text-muted-foreground">
            {$t(i18nKeys.console.terminal.lifecycleDescription)}
          </p>
        </div>
      </div>
      <Dialog.Footer class="border-t p-5">
        <Button
          type="button"
          variant="outline"
          onclick={() => setTerminalSessionsExpireDialogOpen(false)}
        >
          {$t(i18nKeys.common.actions.cancel)}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={expireTerminalSessionsMutation.isPending}
          onclick={confirmExpireTerminalSessions}
        >
          <Clock3 class="size-4" />
          {expireTerminalSessionsMutation.isPending
            ? $t(i18nKeys.common.actions.saving)
            : $t(i18nKeys.console.terminal.lifecycleExpireOld)}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root
    bind:open={terminalSessionCloseDialogOpen}
    onOpenChange={setTerminalSessionCloseDialogOpen}
  >
    {#if selectedTerminalSession}
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.common.actions.closeTerminal)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.terminal.lifecycleCloseConfirm, {
              sessionId: selectedTerminalSession.sessionId,
            })}
          </Dialog.Description>
        </Dialog.Header>
        <div class="space-y-4 px-5 py-4" data-instance-terminal-close-dialog>
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3 text-sm">
            <p class="break-all font-mono font-medium">{selectedTerminalSession.sessionId}</p>
            <p class="mt-1 break-all text-muted-foreground">
              {terminalSessionScopeLabel(selectedTerminalSession)} · {terminalSessionTargetLabel(selectedTerminalSession)}
            </p>
            {#if selectedTerminalSession.workingDirectory}
              <p class="mt-2 break-all rounded-md bg-background px-3 py-2 font-mono text-xs">
                {selectedTerminalSession.workingDirectory}
              </p>
            {/if}
          </div>
        </div>
        <Dialog.Footer class="border-t p-5">
          <Button
            type="button"
            variant="outline"
            onclick={() => setTerminalSessionCloseDialogOpen(false)}
          >
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={closeTerminalSessionMutation.isPending}
            onclick={() => confirmCloseTerminalSession(selectedTerminalSession)}
          >
            <X class="size-4" />
            {closeTerminalSessionMutation.isPending
              ? $t(i18nKeys.common.actions.saving)
              : $t(i18nKeys.common.actions.closeTerminal)}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    {/if}
  </Dialog.Root>
</SettingsShell>

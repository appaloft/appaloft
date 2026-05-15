<script lang="ts">
  import { browser } from "$app/environment";
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
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import ManagementShell from "$lib/components/console/ManagementShell.svelte";
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

  const currentOrigin = $derived(browser ? window.location.origin : "http://SERVER_IP:3721");
  let upgradeFeedback = $state<UpgradeFeedback | null>(null);
  let terminalSessionFeedback = $state<TerminalSessionFeedback | null>(null);
  const instanceUpgradeQuery = createQuery(() =>
    queryOptions({
      queryKey: ["instance-upgrade", "check"],
      queryFn: () => request<InstanceUpgradeCheckResponse>("/api/instance-upgrade/check"),
      enabled: browser,
      staleTime: 60_000,
      retry: 0,
    }),
  );
  const doctorQuery = createQuery(() =>
    queryOptions<DoctorResponse>({
      queryKey: ["system", "doctor"],
      queryFn: () => orpcClient.system.doctor(),
      enabled: browser,
      staleTime: 30_000,
      refetchInterval: 60_000,
      retry: 0,
    }),
  );
  const terminalSessionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["terminal-sessions", "active"],
      queryFn: () => orpcClient.terminalSessions.list({ limit: 50 }),
      enabled: browser,
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

<ManagementShell
  title={$t(i18nKeys.console.instance.pageTitle)}
  description={$t(i18nKeys.console.instance.pageDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.instance.pageTitle) },
  ]}
>
  <div class="space-y-8">
    <section class="rounded-lg border bg-card p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant={upgradeStatus === "available" ? "default" : "outline"}>
              {$t(statusLabelKey(upgradeStatus))}
            </Badge>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.instance.updatesTitle)}</h2>
          </div>
          <p class="mt-3 text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.instance.updatesBody)}
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

      <div class="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <p class="text-xs uppercase text-muted-foreground">
            {$t(i18nKeys.console.instance.currentVersionLabel)}
          </p>
          <p class="mt-1 font-mono text-sm">{instanceUpgradeQuery.data?.currentVersion ?? "-"}</p>
        </div>
        <div>
          <p class="text-xs uppercase text-muted-foreground">
            {$t(i18nKeys.console.instance.latestVersionLabel)}
          </p>
          <p class="mt-1 font-mono text-sm">{instanceUpgradeQuery.data?.latestVersion ?? "-"}</p>
        </div>
        <div>
          <p class="text-xs uppercase text-muted-foreground">
            {$t(i18nKeys.console.instance.targetVersionLabel)}
          </p>
          <p class="mt-1 font-mono text-sm">{instanceUpgradeQuery.data?.targetVersion ?? "-"}</p>
        </div>
      </div>

      {#if instanceUpgradeQuery.error}
        <p class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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

      <div class="mt-4">
        <p class="text-sm font-medium">{$t(i18nKeys.console.instance.upgradeCommandTitle)}</p>
        <pre class="mt-2 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{upgradeCommand}</code></pre>
      </div>
    </section>

    <section class="rounded-lg border bg-card p-5">
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
        <p class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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

    <section class="rounded-lg border bg-card p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant={enabledMaintenanceWorkerCount > 0 ? "default" : "outline"}>
              {$t(i18nKeys.console.instance.workerEnabledSummary, {
                enabled: enabledMaintenanceWorkerCount,
                total: maintenanceWorkers.length,
              })}
            </Badge>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.instance.maintenanceWorkersTitle)}</h2>
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
        <p class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {readErrorMessage(doctorQuery.error)}
        </p>
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

    <section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="rounded-lg border bg-card p-5">
        <div class="flex items-center gap-3">
          <Globe2 class="size-5 text-primary" />
          <div>
            <p class="text-sm font-medium">{$t(i18nKeys.console.instance.currentOriginLabel)}</p>
            <p class="mt-1 break-all font-mono text-sm text-muted-foreground">{currentOrigin}</p>
          </div>
        </div>
      </div>
      <div class="rounded-lg border bg-card p-5">
        <div class="flex items-center gap-3">
          <Network class="size-5 text-primary" />
          <div>
            <p class="text-sm font-medium">{$t(i18nKeys.console.instance.proxyTitle)}</p>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.instance.proxyBody)}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-5 lg:grid-cols-2">
      <div class="rounded-lg border bg-card p-5">
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{$t(i18nKeys.console.instance.domainRouteBadge)}</Badge>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.instance.domainInstallTitle)}</h2>
        </div>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.instance.domainInstallBody)}
        </p>
        <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{domainInstallCommand}</code></pre>
      </div>

      <div class="rounded-lg border bg-card p-5">
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{$t(i18nKeys.console.instance.fallbackRouteBadge)}</Badge>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.instance.directInstallTitle)}</h2>
        </div>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.instance.directInstallBody)}
        </p>
        <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{directInstallCommand}</code></pre>
      </div>
    </section>

    <section class="grid gap-5 lg:grid-cols-2">
      <div class="rounded-lg border bg-card p-5">
        <div class="flex items-center gap-3">
          <ClipboardList class="size-5 text-primary" />
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.instance.rerunTitle)}</h2>
        </div>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.instance.rerunBody)}
        </p>
        <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{rerunCommand}</code></pre>
      </div>

      <div class="rounded-lg border bg-card p-5">
        <div class="flex items-center gap-3">
          <GitBranch class="size-5 text-primary" />
          <h2 class="text-lg font-semibold">
            {$t(i18nKeys.console.instance.actionControlPlaneTitle)}
          </h2>
        </div>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.instance.actionControlPlaneBody)}
        </p>
        <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{actionSnippet}</code></pre>
      </div>
    </section>
  </div>
</ManagementShell>

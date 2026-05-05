<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onDestroy } from "svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
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
    RefreshCw,
    Server,
    ShieldCheck,
  } from "@lucide/svelte";
  import {
    type DeploymentEventStreamEnvelope,
    type DeploymentDetailSummary,
    type DeploymentLogsResponse,
    type DeploymentRecoveryReadinessResponse,
    type DeploymentProgressEvent,
    type RedeployDeploymentInput,
    type RetryDeploymentInput,
    shortDeploymentSourceCommitSha,
    sourceCommitShaForDeployment,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import DeploymentProgressDialog from "$lib/components/console/DeploymentProgressDialog.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
  import {
    deploymentEventProgressEvents,
    deploymentEventProgressStatus,
    groupDeploymentProgressEvents,
    latestDeploymentEventCursor,
    mergeDeploymentEventEnvelopes,
    observeDeploymentProgressAfterAcceptance,
    progressSourceLabel,
    progressStatusVariant,
    progressEventsFromDeployment,
    type DeploymentProgressDialogStatus,
  } from "$lib/console/deployment-progress";
  import {
    deploymentDetailHref,
    formatTime,
    projectDetailHref,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type AccessRoute =
    NonNullable<DeploymentDetailSummary["runtimePlan"]["execution"]["accessRoutes"]>[number];
  type AccessUrlKind = "deployment" | "domain" | "direct";
  type AccessUrl = {
    url: string;
    kind: AccessUrlKind;
  };
  type DeploymentDetailTab = "overview" | "logs" | "timeline" | "snapshot";
  type DeploymentLogEntry = DeploymentLogsResponse["logs"][number];
  type DeploymentRecoveryAction = "retry" | "redeploy";

  const deploymentDetailTabs = ["overview", "logs", "timeline", "snapshot"] as const;

  let deploymentProgressDialogOpen = $state(false);
  let deploymentProgressRequestId = $state("");
  let deploymentProgressDeploymentId = $state("");
  let recoveryDeploymentProgressStatus = $state<DeploymentProgressDialogStatus>("idle");
  let recoveryDeploymentProgressEvents = $state<DeploymentProgressEvent[]>([]);
  let liveDeploymentEventEnvelopes = $state<DeploymentEventStreamEnvelope[]>([]);
  let deploymentEventFollowError = $state("");
  let deploymentEventsFollowing = $state(false);
  let deploymentEventFollowGeneration = 0;
  let deploymentEventStream: Awaited<
    ReturnType<typeof orpcClient.deployments.eventsStream>
  > | null = null;
  let logsCopyState = $state<"idle" | "copied" | "failed">("idle");
  let accessUrlCopyState = $state<"idle" | "copied" | "failed">("idle");
  let deploymentRecoveryActionError = $state("");
  let logsCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;
  let accessUrlCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;

  const deploymentId = $derived(page.params.deploymentId ?? "");
  const deploymentDetailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "show", deploymentId],
      queryFn: () =>
        orpcClient.deployments.show({
          deploymentId,
          includeTimeline: true,
          includeSnapshot: true,
          includeRelatedContext: true,
          includeLatestFailure: true,
        }),
      enabled: browser && deploymentId.length > 0,
      staleTime: 5_000,
    }),
  );
  const deploymentLogsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "logs", deploymentId],
      queryFn: () =>
        orpcClient.deployments.logs({
          deploymentId,
        }),
      enabled: browser && deploymentId.length > 0,
      staleTime: 5_000,
    }),
  );
  const deploymentEventsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "events", deploymentId],
      queryFn: () =>
        orpcClient.deployments.events({
          deploymentId,
          historyLimit: 100,
          includeHistory: true,
          follow: false,
          untilTerminal: true,
        }),
      enabled: browser && deploymentId.length > 0,
      staleTime: 5_000,
    }),
  );
  const deploymentRecoveryReadinessQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "recovery-readiness", deploymentId],
      queryFn: () =>
        orpcClient.deployments.recoveryReadiness({
          deploymentId,
          includeCandidates: true,
          maxCandidates: 3,
        }),
      enabled: browser && deploymentId.length > 0,
      staleTime: 5_000,
    }),
  );
  const retryDeploymentMutation = createMutation(() => ({
    mutationFn: (input: RetryDeploymentInput) => orpcClient.deployments.retry(input),
    onSuccess: (result) => observeAcceptedRecoveryDeployment(result.id),
    onError: (error) => {
      deploymentRecoveryActionError = readErrorMessage(error);
    },
  }));
  const redeployDeploymentMutation = createMutation(() => ({
    mutationFn: (input: RedeployDeploymentInput) => orpcClient.deployments.redeploy(input),
    onSuccess: (result) => observeAcceptedRecoveryDeployment(result.id),
    onError: (error) => {
      deploymentRecoveryActionError = readErrorMessage(error);
    },
  }));
  const pageLoading = $derived(
    deploymentDetailQuery.isPending ||
      deploymentLogsQuery.isPending ||
      deploymentEventsQuery.isPending ||
      deploymentRecoveryReadinessQuery.isPending,
  );
  const deploymentDetail = $derived(deploymentDetailQuery.data ?? null);
  const deployment = $derived(deploymentDetail?.deployment ?? null);
  const recoveryReadiness = $derived(deploymentRecoveryReadinessQuery.data ?? null);
  const deploymentLogs = $derived(deploymentLogsQuery.data?.logs ?? []);
  const replayDeploymentEventEnvelopes = $derived(deploymentEventsQuery.data?.envelopes ?? []);
  const deploymentEventEnvelopes = $derived(
    mergeDeploymentEventEnvelopes(replayDeploymentEventEnvelopes, liveDeploymentEventEnvelopes),
  );
  const deploymentObservedProgressEvents = $derived(
    deploymentEventProgressEvents(deploymentEventEnvelopes),
  );
  const replayDeploymentEventError = $derived(
    deploymentEventsQuery.error ? readErrorMessage(deploymentEventsQuery.error) : "",
  );
  const deploymentProgressEvents = $derived(
    deploymentObservedProgressEvents.length > 0
      ? deploymentObservedProgressEvents
      : deployment
        ? progressEventsFromDeployment(deployment, deploymentLogs)
        : [],
  );
  const deploymentProgressDialogEvents = $derived(
    recoveryDeploymentProgressEvents.length > 0
      ? recoveryDeploymentProgressEvents
      : deploymentProgressEvents,
  );
  const deploymentProgressDialogStatus = $derived<DeploymentProgressDialogStatus>(
    recoveryDeploymentProgressStatus !== "idle"
      ? recoveryDeploymentProgressStatus
      : deployment
      ? deploymentEventProgressStatus(deploymentEventEnvelopes, deployment.status)
      : "idle",
  );
  const deploymentProgressStreamError = $derived(
    deploymentEventFollowError || replayDeploymentEventError,
  );
  const deploymentTimelineSections = $derived(
    groupDeploymentProgressEvents(deploymentProgressEvents),
  );
  const sectionErrors = $derived(deploymentDetail?.sectionErrors ?? []);
  const project = $derived(deploymentDetail?.relatedContext?.project ?? null);
  const environment = $derived(deploymentDetail?.relatedContext?.environment ?? null);
  const resource = $derived(deploymentDetail?.relatedContext?.resource ?? null);
  const server = $derived(deploymentDetail?.relatedContext?.server ?? null);
  const accessUrls = $derived(deployment ? deploymentAccessUrls(deployment, server?.host) : []);
  const primaryAccessUrl = $derived(accessUrls[0] ?? null);
  const activeTab = $derived(parseDeploymentDetailTab(page.url.searchParams.get("tab")));
  const shouldFollowDeploymentEvents = $derived(
    browser &&
      Boolean(deployment) &&
      deploymentProgressDeploymentId === deployment?.id &&
      deploymentProgressDialogStatus === "running" &&
      (activeTab === "timeline" || deploymentProgressDialogOpen),
  );
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
  const retryDeploymentRecoveryAllowed = $derived(
    Boolean(
      recoveryReadiness?.retry.allowed &&
        recoveryReadiness.retry.commandActive &&
        !retryDeploymentMutation.isPending &&
        !redeployDeploymentMutation.isPending,
    ),
  );
  const redeployDeploymentRecoveryAllowed = $derived(
    Boolean(
      recoveryReadiness?.redeploy.allowed &&
        recoveryReadiness.redeploy.commandActive &&
        !retryDeploymentMutation.isPending &&
        !redeployDeploymentMutation.isPending,
    ),
  );


  function handleViewProgress(): void {
    const progressDeployment = deployment;

    if (!progressDeployment) {
      return;
    }

    deploymentProgressRequestId = "";
    deploymentProgressDeploymentId = progressDeployment.id;
    deploymentProgressDialogOpen = true;
  }

  function appendRecoveryDeploymentProgressEvent(event: DeploymentProgressEvent): void {
    liveDeploymentEventEnvelopes = [];
    recoveryDeploymentProgressEvents = [...recoveryDeploymentProgressEvents, event];
    deploymentProgressDeploymentId = event.deploymentId ?? deploymentProgressDeploymentId;

    if (event.status === "failed") {
      recoveryDeploymentProgressStatus = "failed";
    } else if (event.status === "succeeded") {
      recoveryDeploymentProgressStatus = "succeeded";
    } else {
      recoveryDeploymentProgressStatus = "running";
    }
  }

  async function observeAcceptedRecoveryDeployment(acceptedDeploymentId: string): Promise<void> {
    deploymentRecoveryActionError = "";
    deploymentProgressRequestId = "";
    deploymentProgressDeploymentId = acceptedDeploymentId;
    recoveryDeploymentProgressEvents = [];
    recoveryDeploymentProgressStatus = "running";
    deploymentProgressDialogOpen = true;
    deploymentEventFollowError = "";

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["deployments"] }),
      queryClient.invalidateQueries({ queryKey: ["deployments", "recovery-readiness", deploymentId] }),
      queryClient.invalidateQueries({ queryKey: ["deployments", "show", acceptedDeploymentId] }),
      queryClient.invalidateQueries({ queryKey: ["deployments", "events", acceptedDeploymentId] }),
    ]);

    await observeDeploymentProgressAfterAcceptance(
      acceptedDeploymentId,
      appendRecoveryDeploymentProgressEvent,
      {
        onStreamError: (message) => {
          deploymentEventFollowError = message;
        },
      },
    );
  }

  function runDeploymentRecoveryAction(action: DeploymentRecoveryAction): void {
    const readiness = recoveryReadiness;

    if (!deployment || !readiness) {
      return;
    }

    deploymentRecoveryActionError = "";

    if (action === "retry") {
      if (!retryDeploymentRecoveryAllowed) {
        return;
      }

      retryDeploymentMutation.mutate({
        deploymentId: deployment.id,
        resourceId: readiness.resourceId,
        readinessGeneratedAt: readiness.generatedAt,
      });
      return;
    }

    if (!redeployDeploymentRecoveryAllowed) {
      return;
    }

    redeployDeploymentMutation.mutate({
      resourceId: readiness.resourceId,
      projectId: deployment.projectId,
      environmentId: deployment.environmentId,
      serverId: deployment.serverId,
      destinationId: deployment.destinationId,
      sourceDeploymentId: deployment.id,
      readinessGeneratedAt: readiness.generatedAt,
    });
  }

  function deploymentProgressHref(): string {
    if (deployment && deploymentProgressDeploymentId) {
      return deploymentDetailHref({
        ...deployment,
        id: deploymentProgressDeploymentId,
      });
    }

    return `/deployments/${encodeURIComponent(deploymentProgressDeploymentId)}`;
  }

  function logLevelClass(level: DeploymentLogEntry["level"]): string {
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

  function logSourceLabel(log: DeploymentLogEntry): string {
    return log.source === "application" ? "app" : "appaloft";
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

  function deploymentAccessUrls(
    deployment: DeploymentDetailSummary,
    serverHost: string | undefined,
  ): AccessUrl[] {
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

  function recoveryStatusLabel(ready: boolean, commandActive: boolean): string {
    if (!ready) {
      return $t(i18nKeys.common.status.blocked);
    }

    return commandActive
      ? $t(i18nKeys.console.deployments.recoveryAvailable)
      : $t(i18nKeys.console.deployments.recoveryCommandNotActive);
  }

  function recoveryReasonLabel(reasonCode: string): string {
    switch (reasonCode) {
      case "attempt-not-terminal":
        return $t(i18nKeys.console.deployments.recoveryReasonAttemptNotTerminal);
      case "attempt-status-not-recoverable":
        return $t(i18nKeys.console.deployments.recoveryReasonAttemptStatusNotRecoverable);
      case "snapshot-missing":
      case "environment-snapshot-missing":
        return $t(i18nKeys.console.deployments.recoveryReasonSnapshotMissing);
      case "runtime-artifact-missing":
        return $t(i18nKeys.console.deployments.recoveryReasonRuntimeArtifactMissing);
      case "rollback-candidate-not-successful":
        return $t(i18nKeys.console.deployments.recoveryReasonNoRollbackCandidate);
      case "resource-profile-invalid":
        return $t(i18nKeys.console.deployments.recoveryReasonResourceProfileInvalid);
      case "resource-runtime-busy":
        return $t(i18nKeys.console.deployments.recoveryReasonResourceRuntimeBusy);
      case "recovery-command-not-active":
        return $t(i18nKeys.console.deployments.recoveryReasonCommandNotActive);
      default:
        return reasonCode;
    }
  }

  function recoveryActionReasons(
    readiness: DeploymentRecoveryReadinessResponse | null,
    action: "retry" | "redeploy" | "rollback",
  ): string[] {
    if (!readiness) {
      return [];
    }

    const reasons =
      action === "retry"
        ? readiness.retry.reasons
        : action === "redeploy"
          ? readiness.redeploy.reasons
          : readiness.rollback.reasons;

    return [...new Set(reasons.map((reason) => reason.code))].map(recoveryReasonLabel);
  }

  function deploymentSectionErrorMessage(code: string): string {
    switch (code) {
      case "deployment_related_context_unavailable":
        return $t(i18nKeys.console.deployments.relatedContextUnavailable);
      default:
        return $t(i18nKeys.console.deployments.sectionFallbackUnavailable);
    }
  }

  function formatDeploymentLogCopyLine(log: DeploymentLogEntry): string {
    return [log.timestamp, log.source, log.level, log.phase, log.message].join(" ");
  }

  function formatDeploymentLogsCopyText(logs: DeploymentLogsResponse["logs"]): string {
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
    if (!browser || !deployment || deploymentLogs.length === 0) {
      return;
    }

    try {
      await copyTextToClipboard(formatDeploymentLogsCopyText(deploymentLogs));
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

  function isActiveDeploymentEventFollow(
    currentDeploymentId: string,
    generation: number,
  ): boolean {
    return (
      deployment?.id === currentDeploymentId &&
      deploymentEventFollowGeneration === generation &&
      shouldFollowDeploymentEvents
    );
  }

  function stopDeploymentEventFollow(): void {
    deploymentEventFollowGeneration += 1;
    const stream = deploymentEventStream;
    deploymentEventStream = null;
    deploymentEventsFollowing = false;
    void stream?.return?.().catch(() => undefined);
  }

  async function consumeDeploymentEventStream(
    currentDeploymentId: string,
    generation: number,
    cursor: string | undefined,
  ): Promise<void> {
    try {
      const stream = await orpcClient.deployments.eventsStream({
        deploymentId: currentDeploymentId,
        historyLimit: 0,
        includeHistory: false,
        follow: true,
        untilTerminal: true,
        ...(cursor ? { cursor } : {}),
      });

      if (!isActiveDeploymentEventFollow(currentDeploymentId, generation)) {
        await stream.return?.();
        return;
      }

      deploymentEventStream = stream;
      let result = await stream.next();

      while (isActiveDeploymentEventFollow(currentDeploymentId, generation) && !result.done) {
        const envelope = result.value;

        liveDeploymentEventEnvelopes = mergeDeploymentEventEnvelopes(
          liveDeploymentEventEnvelopes,
          [envelope],
        );

        if (envelope.kind === "gap") {
          deploymentEventFollowError = $t(
            i18nKeys.console.deployments.progressStreamDisconnected,
          );
          break;
        }

        if (envelope.kind === "error") {
          deploymentEventFollowError = envelope.error.message;
          break;
        }

        if (envelope.kind === "closed") {
          break;
        }

        result = await stream.next();
      }
    } catch (error) {
      if (isActiveDeploymentEventFollow(currentDeploymentId, generation)) {
        deploymentEventFollowError = readErrorMessage(error);
      }
    } finally {
      if (
        deployment?.id === currentDeploymentId &&
        deploymentEventFollowGeneration === generation
      ) {
        deploymentEventStream = null;
        deploymentEventsFollowing = false;
      }
    }
  }

  $effect(() => {
    const currentDeploymentId = deploymentId;

    liveDeploymentEventEnvelopes = [];
    recoveryDeploymentProgressEvents = [];
    recoveryDeploymentProgressStatus = "idle";
    deploymentEventFollowError = "";
    deploymentProgressRequestId = "";
    deploymentProgressDeploymentId = currentDeploymentId;
    stopDeploymentEventFollow();
  });

  $effect(() => {
    if (
      !shouldFollowDeploymentEvents ||
      !deployment ||
      deploymentEventsFollowing ||
      deploymentEventsQuery.isPending
    ) {
      if (!shouldFollowDeploymentEvents) {
        stopDeploymentEventFollow();
      }
      return;
    }

    const generation = deploymentEventFollowGeneration + 1;
    deploymentEventFollowGeneration = generation;
    deploymentEventFollowError = "";
    deploymentEventsFollowing = true;
    void consumeDeploymentEventStream(
      deployment.id,
      generation,
      latestDeploymentEventCursor(deploymentEventEnvelopes),
    );
  });

  onDestroy(() => {
    stopDeploymentEventFollow();
    if (logsCopyResetTimeout) {
      clearTimeout(logsCopyResetTimeout);
    }
    if (accessUrlCopyResetTimeout) {
      clearTimeout(accessUrlCopyResetTimeout);
    }
  });

  function progressStatusLabel(status?: DeploymentProgressEvent["status"]): string {
    switch (status) {
      case "running":
        return $t(i18nKeys.console.deployments.progressStatusRunning);
      case "succeeded":
        return $t(i18nKeys.console.deployments.progressStatusSucceeded);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      default:
        return $t(i18nKeys.console.deployments.progressStatusLog);
    }
  }

  function progressPhaseLabel(phase: DeploymentProgressEvent["phase"]): string {
    switch (phase) {
      case "detect":
        return $t(i18nKeys.console.deployments.progressPhaseDetect);
      case "plan":
        return $t(i18nKeys.console.deployments.progressPhasePlan);
      case "package":
        return $t(i18nKeys.console.deployments.progressPhasePackage);
      case "deploy":
        return $t(i18nKeys.console.deployments.progressPhaseDeploy);
      case "verify":
        return $t(i18nKeys.console.deployments.progressPhaseVerify);
      case "rollback":
        return $t(i18nKeys.console.deployments.progressPhaseRollback);
    }
  }

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
  <title>{deployment?.runtimePlan.source.displayName ?? $t(i18nKeys.console.deployments.pageTitle)} · Appaloft</title>
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
      href: deployment
        ? resourceDetailHref({
            id: deployment.resourceId,
            projectId: deployment.projectId,
            environmentId: deployment.environmentId,
          })
        : undefined,
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
    {@const sourceCommitSha = sourceCommitShaForDeployment(deployment)}
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
              {#if sourceCommitSha}
                <p class="font-mono text-sm text-muted-foreground" title={sourceCommitSha}>
                  {$t(i18nKeys.console.deployments.sourceCommitSha)}
                  {shortDeploymentSourceCommitSha(sourceCommitSha)}
                </p>
              {/if}
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
              <Button
                href={resourceDetailHref({
                  id: deployment.resourceId,
                  projectId: deployment.projectId,
                  environmentId: deployment.environmentId,
                })}
                variant="outline"
              >
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

      {#if sectionErrors.length > 0}
        <section
          class="rounded-md border border-amber-500/30 bg-amber-500/5 p-4"
          data-testid="deployment-detail-section-errors"
        >
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{$t(i18nKeys.console.deployments.needsAttention)}</Badge>
                <Badge variant="secondary">{$t(i18nKeys.common.status.degraded)}</Badge>
              </div>
              <div class="space-y-1">
                <h2 class="text-base font-semibold">
                  {$t(i18nKeys.console.deployments.partialDataTitle)}
                </h2>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.deployments.partialDataDescription)}
                </p>
              </div>
            </div>
          </div>

          <div class="mt-4 space-y-2">
            {#each sectionErrors as sectionError, index (`${sectionError.code}-${index}`)}
              <div class="rounded-md border border-amber-500/20 bg-background/70 px-3 py-2 text-sm">
                {deploymentSectionErrorMessage(sectionError.code)}
              </div>
            {/each}
          </div>
        </section>
      {/if}

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

          {#if recoveryReadiness}
            <section class="rounded-md border bg-background p-4" data-testid="deployment-recovery-readiness">
              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div class="space-y-2">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.deployments.recoveryTitle)}
                  </h2>
                  <p class="text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.deployments.recoveryDescription)}
                  </p>
                </div>
                <Badge variant="outline">
                  {$t(i18nKeys.console.deployments.recoveryCandidateCount, {
                    count: recoveryReadiness.rollbackCandidateCount,
                  })}
                </Badge>
              </div>
              {#if deploymentRecoveryActionError}
                <div class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {deploymentRecoveryActionError}
                </div>
              {/if}

              <div class="mt-4 grid gap-3 md:grid-cols-3">
                <div class="rounded-md border bg-muted/20 p-3">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium">
                      {$t(i18nKeys.console.deployments.recoveryRetryTitle)}
                    </p>
                    <Badge variant={recoveryReadiness.retryable ? "secondary" : "outline"}>
                      {recoveryStatusLabel(
                        recoveryReadiness.retryable,
                        recoveryReadiness.retry.commandActive,
                      )}
                    </Badge>
                  </div>
                  <ul class="mt-3 space-y-1 text-sm text-muted-foreground">
                    {#each recoveryActionReasons(recoveryReadiness, "retry") as reason (reason)}
                      <li>{reason}</li>
                    {:else}
                      <li>{$t(i18nKeys.console.deployments.recoveryNoReasons)}</li>
                    {/each}
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    class="mt-3 w-full"
                    disabled={!retryDeploymentRecoveryAllowed}
                    onclick={() => runDeploymentRecoveryAction("retry")}
                  >
                    <RefreshCw class="size-4" />
                    {retryDeploymentMutation.isPending
                      ? $t(i18nKeys.console.deployments.recoveryRetryingAction)
                      : $t(i18nKeys.console.deployments.recoveryRetryAction)}
                  </Button>
                </div>

                <div class="rounded-md border bg-muted/20 p-3">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium">
                      {$t(i18nKeys.console.deployments.recoveryRedeployTitle)}
                    </p>
                    <Badge variant={recoveryReadiness.redeployable ? "secondary" : "outline"}>
                      {recoveryStatusLabel(
                        recoveryReadiness.redeployable,
                        recoveryReadiness.redeploy.commandActive,
                      )}
                    </Badge>
                  </div>
                  <ul class="mt-3 space-y-1 text-sm text-muted-foreground">
                    {#each recoveryActionReasons(recoveryReadiness, "redeploy") as reason (reason)}
                      <li>{reason}</li>
                    {:else}
                      <li>{$t(i18nKeys.console.deployments.recoveryNoReasons)}</li>
                    {/each}
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    class="mt-3 w-full"
                    disabled={!redeployDeploymentRecoveryAllowed}
                    onclick={() => runDeploymentRecoveryAction("redeploy")}
                  >
                    <RefreshCw class="size-4" />
                    {redeployDeploymentMutation.isPending
                      ? $t(i18nKeys.console.deployments.recoveryRedeployingAction)
                      : $t(i18nKeys.console.deployments.recoveryRedeployAction)}
                  </Button>
                </div>

                <div class="rounded-md border bg-muted/20 p-3">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-medium">
                      {$t(i18nKeys.console.deployments.recoveryRollbackTitle)}
                    </p>
                    <Badge variant={recoveryReadiness.rollbackReady ? "secondary" : "outline"}>
                      {recoveryStatusLabel(
                        recoveryReadiness.rollbackReady,
                        recoveryReadiness.rollback.commandActive,
                      )}
                    </Badge>
                  </div>
                  <ul class="mt-3 space-y-1 text-sm text-muted-foreground">
                    {#each recoveryActionReasons(recoveryReadiness, "rollback") as reason (reason)}
                      <li>{reason}</li>
                    {:else}
                      <li>{$t(i18nKeys.console.deployments.recoveryNoReasons)}</li>
                    {/each}
                  </ul>
                </div>
              </div>
            </section>
          {/if}

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
            <div class={sourceCommitSha ? "mt-4 grid gap-3 md:grid-cols-[10rem_14rem_minmax(0,1fr)]" : "mt-4 grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)]"}>
              <div class="rounded-md bg-muted/30 px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.kind)}</p>
                <p class="mt-1 truncate text-sm font-medium">{deployment.runtimePlan.source.kind}</p>
              </div>
              {#if sourceCommitSha}
                <div class="rounded-md bg-muted/30 px-3 py-2">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.deployments.sourceCommitSha)}</p>
                  <p class="mt-1 truncate font-mono text-sm font-medium" title={sourceCommitSha}>
                    {shortDeploymentSourceCommitSha(sourceCommitSha)}
                  </p>
                </div>
              {/if}
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
                disabled={deploymentLogs.length === 0}
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

            {#if deploymentLogs.length > 0}
              <div class="max-h-[42rem] overflow-auto rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-200 shadow-inner">
                <div class="space-y-1">
                  {#each deploymentLogs as log, index (`${log.timestamp}-${index}`)}
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
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="flex items-center gap-2 text-lg font-semibold">
                  <Clock3 class="size-5 text-muted-foreground" />
                  {$t(i18nKeys.console.deployments.timelineTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.deployments.progressDescription)}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <Badge
                  variant={progressStatusVariant(
                    deploymentProgressDialogStatus === "idle"
                      ? undefined
                      : deploymentProgressDialogStatus,
                  )}
                >
                  {progressStatusLabel(
                    deploymentProgressDialogStatus === "idle"
                      ? undefined
                      : deploymentProgressDialogStatus,
                  )}
                </Badge>
                {#if deploymentEventsFollowing}
                  <Badge variant="secondary">
                    {$t(i18nKeys.console.deployments.progressStatusRunning)}
                  </Badge>
                {/if}
              </div>
            </div>

            {#if deploymentProgressStreamError}
              <div class="mt-4 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {deploymentProgressStreamError}
              </div>
            {/if}

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

            <div class="mt-4 max-h-[42rem] overflow-auto rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-200 shadow-inner">
              {#if deploymentTimelineSections.length === 0}
                <p class="text-zinc-500">{$t(i18nKeys.console.deployments.progressWaiting)}</p>
              {:else}
                {#each deploymentTimelineSections as section (section.phase)}
                  <div class="border-t border-zinc-800/80 py-2 first:border-t-0 first:pt-0">
                    <div class="flex flex-wrap items-center gap-2 text-zinc-400">
                      <span class="text-emerald-300">
                        [{section.step?.current ?? "-"} / {section.step?.total ?? "-"}]
                      </span>
                      <span>{progressPhaseLabel(section.phase)}</span>
                      <span class="text-zinc-600">·</span>
                      <span>
                        {section.step?.label ??
                          $t(i18nKeys.console.deployments.progressStepFallback)}
                      </span>
                      {#if section.status}
                        <span class="text-zinc-600">·</span>
                        <span>{progressStatusLabel(section.status)}</span>
                      {/if}
                    </div>

                    <div class="mt-2 space-y-1">
                      {#each section.events as event, index (`${event.timestamp}-${section.phase}-${index}`)}
                        <div class="grid grid-cols-[4.75rem_6rem_3.5rem_minmax(0,1fr)] gap-2 leading-5">
                          <span class="text-zinc-600">{logTimeLabel(event.timestamp)}</span>
                          <span class={event.source === "application" ? "text-sky-300" : "text-emerald-300"}>
                            {progressSourceLabel(event)}
                          </span>
                          <span class={logLevelClass(event.level)}>{event.level}</span>
                          <span
                            class={`min-w-0 break-words ${logLevelClass(event.level)} ${event.source === "application" ? "pl-3" : ""}`}
                          >
                            {event.source === "application" ? "└ " : ""}
                            {event.message}
                          </span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              {/if}
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
  events={deploymentProgressDialogEvents}
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

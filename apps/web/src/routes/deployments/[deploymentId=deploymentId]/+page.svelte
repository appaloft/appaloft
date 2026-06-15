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
    ListChecks,
    LoaderCircle,
    RefreshCw,
    Terminal,
  } from "@lucide/svelte";
  import {
    type DeploymentDetailSummary,
    type DeploymentRecoveryReadinessResponse,
    type DeploymentProgressEvent,
    type DeploymentTimelineEnvelope,
    type DeploymentTimelineResponse,
    type RedeployDeploymentInput,
    type RetryDeploymentInput,
    type RollbackDeploymentInput,
    sourceVersionForDeployment,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import DeploymentProgressDialog from "$lib/components/console/DeploymentProgressDialog.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
  import {
    detailBodyClass,
    detailHeaderClass,
    detailPageClass,
    detailTabClass,
    detailTabPanelScrollClass,
    detailTabsClass,
  } from "$lib/console/layout-classes";
  import {
    deploymentTimelineProgressEvents,
    deploymentTimelineProgressStatus,
    groupDeploymentProgressEvents,
    latestDeploymentTimelineCursor,
    mergeDeploymentTimelineEnvelopes,
    observeDeploymentProgressAfterAcceptance,
    progressSourceLabel,
    progressStatusVariant,
    progressEventsFromDeployment,
    type DeploymentProgressDialogStatus,
  } from "$lib/console/deployment-progress";
  import {
    deploymentDetailHref,
    findDeployment,
    findEnvironment,
    findProject,
    findResource,
    formatTime,
    projectDetailHref,
    resourceDetailHref,
    resourceTerminalHref,
  } from "$lib/console/utils";
  import { createConsoleQueries } from "$lib/console/queries";
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
  type DeploymentDetailTab = "overview" | "timeline" | "snapshot";
  type DeploymentTimelineJournalEntry = DeploymentTimelineResponse["entries"][number];
  type DeploymentRecoveryAction = "retry" | "redeploy" | "rollback";
  type AppaloftDesktopBridge = {
    copyText?: (text: string) => Promise<void>;
  };
  type WindowWithAppaloftDesktopBridge = Window &
    typeof globalThis & {
      appaloftDesktop?: AppaloftDesktopBridge;
    };

  const deploymentDetailTabs = ["overview", "timeline", "snapshot"] as const;
  const { projectsQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser, {
      health: false,
      readiness: false,
      version: false,
      servers: false,
      domainBindings: false,
      previewEnvironments: false,
      certificates: false,
      providers: false,
    });

  let deploymentProgressDialogOpen = $state(false);
  let deploymentProgressRequestId = $state("");
  let deploymentProgressDeploymentId = $state("");
  let recoveryDeploymentProgressStatus = $state<DeploymentProgressDialogStatus>("idle");
  let recoveryDeploymentProgressEvents = $state<DeploymentProgressEvent[]>([]);
  let liveDeploymentTimelineEnvelopes = $state<DeploymentTimelineEnvelope[]>([]);
  let deploymentTimelineFollowError = $state("");
  let deploymentTimelineFollowing = $state(false);
  let deploymentTimelineFollowGeneration = 0;
  let deploymentTimelineStream: Awaited<
    ReturnType<typeof orpcClient.deployments.timelineStream>
  > | null = null;
  let timelineCopyState = $state<"idle" | "copied" | "failed">("idle");
  let accessUrlCopyState = $state<"idle" | "copied" | "failed">("idle");
  let diagnosticSummaryLoading = $state(false);
  let diagnosticSummaryCopyState = $state<"idle" | "copied" | "failed">("idle");
  let diagnosticSummaryError = $state<string | null>(null);
  let diagnosticSummaryCopyFallback = $state<string | null>(null);
  let deploymentRecoveryActionError = $state("");
  let recoveryDialogOpen = $state(false);
  let selectedRecoveryAction = $state<DeploymentRecoveryAction | null>(null);
  let selectedRollbackCandidateId = $state("");
  let timelineCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;
  let accessUrlCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;
  let diagnosticSummaryCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;

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
  const deploymentTimelineQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", "timeline", deploymentId],
      queryFn: () =>
        orpcClient.deployments.timeline({
          deploymentId,
          limit: 100,
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
  const rollbackDeploymentMutation = createMutation(() => ({
    mutationFn: (input: RollbackDeploymentInput) => orpcClient.deployments.rollback(input),
    onSuccess: (result) => observeAcceptedRecoveryDeployment(result.id),
    onError: (error) => {
      deploymentRecoveryActionError = readErrorMessage(error);
    },
  }));
  const pageLoading = $derived(deploymentDetailQuery.isPending && !deploymentDetailQuery.data);
  const deploymentDetail = $derived(deploymentDetailQuery.data ?? null);
  const deployment = $derived(deploymentDetail?.deployment ?? null);
  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const listedDeployment = $derived(findDeployment(deployments, deploymentId));
  const headerDeployment = $derived(deployment ?? listedDeployment);
  const recoveryReadiness = $derived(deploymentRecoveryReadinessQuery.data ?? null);
  const deploymentTimeline = $derived(deploymentTimelineQuery.data?.entries ?? []);
  const replayDeploymentTimelineEnvelopes = $derived(
    (deploymentTimelineQuery.data?.entries ?? []).map(
      (entry) =>
        ({
          schemaVersion: "deployments.timeline/v1",
          kind: "entry",
          entry,
        }) satisfies DeploymentTimelineEnvelope,
    ),
  );
  const deploymentTimelineEnvelopes = $derived(
    mergeDeploymentTimelineEnvelopes(
      replayDeploymentTimelineEnvelopes,
      liveDeploymentTimelineEnvelopes,
    ),
  );
  const deploymentObservedProgressEvents = $derived(
    deploymentTimelineProgressEvents(deploymentTimelineEnvelopes),
  );
  const replayDeploymentTimelineError = $derived(
    deploymentTimelineQuery.error ? readErrorMessage(deploymentTimelineQuery.error) : "",
  );
  const deploymentProgressEvents = $derived(
    deploymentObservedProgressEvents.length > 0
      ? deploymentObservedProgressEvents
      : deployment
        ? progressEventsFromDeployment(deployment)
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
      ? deploymentTimelineProgressStatus(deploymentTimelineEnvelopes, deployment.status)
      : "idle",
  );
  const deploymentProgressStreamError = $derived(
    deploymentTimelineFollowError || replayDeploymentTimelineError,
  );
  const deploymentTimelineSections = $derived(
    groupDeploymentProgressEvents(deploymentProgressEvents),
  );
  const sectionErrors = $derived(deploymentDetail?.sectionErrors ?? []);
  const project = $derived(
    deploymentDetail?.relatedContext?.project ??
      (headerDeployment ? findProject(projects, headerDeployment.projectId) : null),
  );
  const environment = $derived(
    deploymentDetail?.relatedContext?.environment ??
      (headerDeployment ? findEnvironment(environments, headerDeployment.environmentId) : null),
  );
  const resource = $derived(
    deploymentDetail?.relatedContext?.resource ??
      (headerDeployment ? findResource(resources, headerDeployment.resourceId) : null),
  );
  const currentResourceSummary = $derived(
    deployment ? findResource(resources, deployment.resourceId) : null,
  );
  const server = $derived(deploymentDetail?.relatedContext?.server ?? null);
  const projectHeaderLoading = $derived(
    !project && (deploymentDetailQuery.isPending || projectsQuery.isPending),
  );
  const environmentHeaderLoading = $derived(
    !environment && (deploymentDetailQuery.isPending || environmentsQuery.isPending),
  );
  const resourceHeaderLoading = $derived(
    !resource && (deploymentDetailQuery.isPending || resourcesQuery.isPending),
  );
  const deploymentHeaderLoading = $derived(
    !headerDeployment && (deploymentDetailQuery.isPending || deploymentsQuery.isPending),
  );
  const projectHeaderSwitchItems = $derived(
    projects.map((projectItem) => ({
      label: projectItem.name,
      href: projectDetailHref(projectItem.id),
      selected: projectItem.id === headerDeployment?.projectId,
    })),
  );
  const resourceHeaderSwitchItems = $derived(
    resources
      .filter(
        (resourceItem) =>
          !headerDeployment ||
          (resourceItem.projectId === headerDeployment.projectId &&
            resourceItem.environmentId === headerDeployment.environmentId),
      )
      .map((resourceItem) => ({
        label: resourceItem.name,
        href: resourceDetailHref(resourceItem),
        selected: resourceItem.id === headerDeployment?.resourceId,
      })),
  );
  const deploymentHeaderSwitchItems = $derived(
    deployments
      .filter(
        (deploymentItem) =>
          !headerDeployment || deploymentItem.resourceId === headerDeployment.resourceId,
      )
      .map((deploymentItem) => ({
        label: deploymentItem.runtimePlan.source.displayName,
        href: deploymentDetailHref(deploymentItem),
        selected: deploymentItem.id === deploymentId,
      })),
  );
  const accessUrls = $derived(deployment ? deploymentAccessUrls(deployment, server?.host) : []);
  const primaryAccessUrl = $derived(accessUrls[0] ?? null);
  const activeTab = $derived(parseDeploymentDetailTab(page.url.searchParams.get("tab")));
  const shouldFollowDeploymentTimeline = $derived(
    browser &&
      Boolean(deployment) &&
      deploymentProgressDeploymentId === deployment?.id &&
      deploymentProgressDialogStatus === "running" &&
      (activeTab === "timeline" || deploymentProgressDialogOpen),
  );
  const timelineCopyLabel = $derived(
    timelineCopyState === "copied"
      ? $t(i18nKeys.console.deployments.copyLogsCopied)
      : timelineCopyState === "failed"
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
  const diagnosticSummaryCopyLabel = $derived.by(() => {
    if (diagnosticSummaryLoading) {
      return $t(i18nKeys.console.resources.diagnosticSummaryLoading);
    }

    if (diagnosticSummaryCopyState === "copied") {
      return $t(i18nKeys.console.resources.diagnosticSummaryCopied);
    }

    return $t(i18nKeys.console.resources.diagnosticSummaryCopy);
  });
  const recoveryActionPending = $derived(
    retryDeploymentMutation.isPending ||
      redeployDeploymentMutation.isPending ||
      rollbackDeploymentMutation.isPending,
  );
  const rollbackDeploymentRecoveryCandidate = $derived(
    recoveryReadiness?.rollback.candidates.find(
      (candidate) =>
        candidate.deploymentId === selectedRollbackCandidateId && candidate.rollbackReady,
    ) ??
      recoveryReadiness?.rollback.candidates.find(
        (candidate) =>
          candidate.deploymentId === recoveryReadiness.rollback.recommendedCandidateId &&
          candidate.rollbackReady,
      ) ??
      recoveryReadiness?.rollback.candidates.find((candidate) => candidate.rollbackReady) ??
      null,
  );
  const retryDeploymentRecoveryAllowed = $derived(
    Boolean(
      recoveryReadiness?.retry.allowed &&
        recoveryReadiness.retry.commandActive &&
        !recoveryActionPending,
    ),
  );
  const redeployDeploymentRecoveryAllowed = $derived(
    Boolean(
      recoveryReadiness?.redeploy.allowed &&
        recoveryReadiness.redeploy.commandActive &&
        !recoveryActionPending,
    ),
  );
  const rollbackDeploymentRecoveryAllowed = $derived(
    Boolean(
      recoveryReadiness?.rollback.allowed &&
        recoveryReadiness.rollback.commandActive &&
        rollbackDeploymentRecoveryCandidate &&
        !recoveryActionPending,
    ),
  );
  const selectedRecoveryActionAllowed = $derived.by((): boolean => {
    switch (selectedRecoveryAction) {
      case "retry":
        return retryDeploymentRecoveryAllowed;
      case "redeploy":
        return redeployDeploymentRecoveryAllowed;
      case "rollback":
        return rollbackDeploymentRecoveryAllowed;
      default:
        return false;
    }
  });
  const selectedRecoveryActionTitle = $derived(
    selectedRecoveryAction ? recoveryActionTitle(selectedRecoveryAction) : "",
  );
  const recoveryDialogTitle = $derived(
    selectedRecoveryActionTitle || $t(i18nKeys.console.deployments.recoverySelectActionTitle),
  );
  const selectedRecoveryActionSubmitLabel = $derived(
    selectedRecoveryAction
      ? recoveryActionSubmitLabel(selectedRecoveryAction, recoveryActionPending)
      : "",
  );
  const deploymentResourceRef = $derived(
    deployment
      ? {
          id: deployment.resourceId,
          projectId: deployment.projectId,
          environmentId: deployment.environmentId,
        }
      : null,
  );
  const resourceOverviewHref = $derived(
    deploymentResourceRef ? resourceDetailHref(deploymentResourceRef) : "",
  );
  const resourceLogsHref = $derived(
    deploymentResourceRef ? `${resourceDetailHref(deploymentResourceRef)}?tab=logs` : "",
  );
  const resourceTerminalUrl = $derived(
    deploymentResourceRef ? resourceTerminalHref(deploymentResourceRef, deployment?.id) : "",
  );
  const deploymentTimelineHref = $derived(deployment ? deploymentTabHref("timeline") : "");
  const deploymentSnapshotHref = $derived(deployment ? deploymentTabHref("snapshot") : "");
  const deploymentIsCurrentResourceState = $derived(
    Boolean(
      currentResourceSummary?.lastDeploymentId &&
        deployment &&
        currentResourceSummary.lastDeploymentId === deployment.id,
    ),
  );
  const currentResourceDeploymentStateLabel = $derived.by(() => {
    if (!currentResourceSummary?.lastDeploymentId) {
      return $t(i18nKeys.console.deployments.currentResourceStateUnknown);
    }

    return deploymentIsCurrentResourceState
      ? $t(i18nKeys.console.deployments.currentResourceStateCurrent)
      : $t(i18nKeys.console.deployments.currentResourceStateChanged);
  });
  const currentResourceDeploymentStatus = $derived(
    currentResourceSummary?.lastDeploymentStatus ?? $t(i18nKeys.common.status.unknown),
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
    liveDeploymentTimelineEnvelopes = [];
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
    deploymentTimelineFollowError = "";

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["deployments"] }),
      queryClient.invalidateQueries({ queryKey: ["deployments", "recovery-readiness", deploymentId] }),
      queryClient.invalidateQueries({ queryKey: ["deployments", "show", acceptedDeploymentId] }),
      queryClient.invalidateQueries({
        queryKey: ["deployments", "timeline", acceptedDeploymentId],
      }),
    ]);

    await observeDeploymentProgressAfterAcceptance(
      acceptedDeploymentId,
      appendRecoveryDeploymentProgressEvent,
      {
        onStreamError: (message) => {
          deploymentTimelineFollowError = message;
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

    if (action === "redeploy") {
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
      return;
    }

    if (!rollbackDeploymentRecoveryAllowed || !rollbackDeploymentRecoveryCandidate) {
      return;
    }

    rollbackDeploymentMutation.mutate({
      deploymentId: deployment.id,
      rollbackCandidateDeploymentId: rollbackDeploymentRecoveryCandidate.deploymentId,
      resourceId: readiness.resourceId,
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

  function openRecoveryDialog(action: DeploymentRecoveryAction | null = null): void {
    deploymentRecoveryActionError = "";
    selectedRecoveryAction = action;
    recoveryDialogOpen = true;
  }

  function selectRecoveryAction(action: DeploymentRecoveryAction): void {
    deploymentRecoveryActionError = "";
    selectedRecoveryAction = action;
  }

  function closeRecoveryDialog(): void {
    if (recoveryActionPending) {
      return;
    }

    recoveryDialogOpen = false;
    selectedRecoveryAction = null;
  }

  function confirmSelectedRecoveryAction(): void {
    if (!selectedRecoveryAction || !selectedRecoveryActionAllowed) {
      return;
    }

    runDeploymentRecoveryAction(selectedRecoveryAction);
  }

  function recoveryActionTitle(action: DeploymentRecoveryAction): string {
    switch (action) {
      case "retry":
        return $t(i18nKeys.console.deployments.recoveryRetryTitle);
      case "redeploy":
        return $t(i18nKeys.console.deployments.recoveryRedeployTitle);
      case "rollback":
        return $t(i18nKeys.console.deployments.recoveryRollbackTitle);
    }
  }

  function recoveryActionSubmitLabel(
    action: DeploymentRecoveryAction,
    pending: boolean,
  ): string {
    switch (action) {
      case "retry":
        return pending
          ? $t(i18nKeys.console.deployments.recoveryRetryingAction)
          : $t(i18nKeys.console.deployments.recoveryRetryAction);
      case "redeploy":
        return pending
          ? $t(i18nKeys.console.deployments.recoveryRedeployingAction)
          : $t(i18nKeys.console.deployments.recoveryRedeployAction);
      case "rollback":
        return pending
          ? $t(i18nKeys.console.deployments.recoveryRollingBackAction)
          : $t(i18nKeys.console.deployments.recoveryRollbackAction);
    }
  }

  function recoveryActionAllowed(action: DeploymentRecoveryAction): boolean {
    switch (action) {
      case "retry":
        return retryDeploymentRecoveryAllowed;
      case "redeploy":
        return redeployDeploymentRecoveryAllowed;
      case "rollback":
        return rollbackDeploymentRecoveryAllowed;
    }
  }

  function logLevelClass(level: DeploymentTimelineJournalEntry["level"]): string {
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

  function logSourceLabel(log: DeploymentTimelineJournalEntry): string {
    return log.source === "application" ? "app" : log.source;
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

  function formatDeploymentTimelineCopyLine(log: DeploymentTimelineJournalEntry): string {
    return [log.occurredAt, log.source, log.level, log.phase ?? log.kind, log.message].join(" ");
  }

  function formatDeploymentTimelineCopyText(logs: DeploymentTimelineResponse["entries"]): string {
    return logs.map(formatDeploymentTimelineCopyLine).join("\n");
  }

  function markTimelineCopyState(state: "copied" | "failed"): void {
    if (timelineCopyResetTimeout) {
      clearTimeout(timelineCopyResetTimeout);
    }

    timelineCopyState = state;
    timelineCopyResetTimeout = setTimeout(() => {
      timelineCopyState = "idle";
      timelineCopyResetTimeout = undefined;
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

  function scheduleDiagnosticSummaryCopyReset(): void {
    if (diagnosticSummaryCopyResetTimeout) {
      clearTimeout(diagnosticSummaryCopyResetTimeout);
    }

    diagnosticSummaryCopyResetTimeout = setTimeout(() => {
      diagnosticSummaryCopyState = "idle";
      diagnosticSummaryCopyResetTimeout = undefined;
    }, 2200);
  }

  async function copyTextToClipboard(text: string): Promise<void> {
    const desktopCopyText = (window as WindowWithAppaloftDesktopBridge).appaloftDesktop?.copyText;
    if (desktopCopyText) {
      try {
        await desktopCopyText(text);
        return;
      } catch {
        // Fall back to browser clipboard APIs when an older desktop shell lacks permission.
      }
    }

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
    textArea.focus({ preventScroll: true });
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    try {
      if (!document.execCommand("copy")) {
        throw new Error("Copy command failed");
      }
    } finally {
      textArea.remove();
    }
  }

  async function handleCopyDeploymentDiagnosticSummary(): Promise<void> {
    if (!browser || !deployment || diagnosticSummaryLoading) {
      return;
    }

    diagnosticSummaryLoading = true;
    diagnosticSummaryError = null;
    diagnosticSummaryCopyFallback = null;

    try {
      const summary = await orpcClient.resources.diagnosticSummary({
        resourceId: deployment.resourceId,
        deploymentId: deployment.id,
        includeDeploymentTimelineTail: true,
        includeRuntimeLogTail: true,
        includeProxyConfiguration: true,
        tailLines: 20,
      });
      const copyJson = summary.copy.json;
      try {
        await copyTextToClipboard(copyJson);
      } catch (copyError) {
        diagnosticSummaryCopyFallback = copyJson;
        throw copyError;
      }
      diagnosticSummaryCopyState = "copied";
    } catch (error) {
      diagnosticSummaryCopyState = "failed";
      diagnosticSummaryError = readErrorMessage(error);
    } finally {
      diagnosticSummaryLoading = false;
      if (diagnosticSummaryCopyState === "copied") {
        scheduleDiagnosticSummaryCopyReset();
      }
    }
  }

  async function handleCopyDeploymentTimeline(): Promise<void> {
    if (!browser || !deployment || deploymentTimeline.length === 0) {
      return;
    }

    try {
      await copyTextToClipboard(formatDeploymentTimelineCopyText(deploymentTimeline));
      markTimelineCopyState("copied");
    } catch {
      markTimelineCopyState("failed");
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

  function isActiveDeploymentTimelineFollow(
    currentDeploymentId: string,
    generation: number,
  ): boolean {
    return (
      deployment?.id === currentDeploymentId &&
      deploymentTimelineFollowGeneration === generation &&
      shouldFollowDeploymentTimeline
    );
  }

  function stopDeploymentTimelineFollow(): void {
    deploymentTimelineFollowGeneration += 1;
    const stream = deploymentTimelineStream;
    deploymentTimelineStream = null;
    deploymentTimelineFollowing = false;
    void stream?.return?.().catch(() => undefined);
  }

  async function consumeDeploymentTimelineStream(
    currentDeploymentId: string,
    generation: number,
    cursor: string | undefined,
  ): Promise<void> {
    try {
      const stream = await orpcClient.deployments.timelineStream({
        deploymentId: currentDeploymentId,
        limit: 0,
        includeHistory: false,
        follow: true,
        untilTerminal: true,
        ...(cursor ? { cursor } : {}),
      });

      if (!isActiveDeploymentTimelineFollow(currentDeploymentId, generation)) {
        await stream.return?.();
        return;
      }

      deploymentTimelineStream = stream;
      let result = await stream.next();

      while (isActiveDeploymentTimelineFollow(currentDeploymentId, generation) && !result.done) {
        const envelope = result.value;

        liveDeploymentTimelineEnvelopes = mergeDeploymentTimelineEnvelopes(
          liveDeploymentTimelineEnvelopes,
          [envelope],
        );

        if (envelope.kind === "gap") {
          deploymentTimelineFollowError = $t(
            i18nKeys.console.deployments.progressStreamDisconnected,
          );
          break;
        }

        if (envelope.kind === "error") {
          deploymentTimelineFollowError = envelope.error.message;
          break;
        }

        if (envelope.kind === "closed") {
          break;
        }

        result = await stream.next();
      }
    } catch (error) {
      if (isActiveDeploymentTimelineFollow(currentDeploymentId, generation)) {
        deploymentTimelineFollowError = readErrorMessage(error);
      }
    } finally {
      if (
        deployment?.id === currentDeploymentId &&
        deploymentTimelineFollowGeneration === generation
      ) {
        deploymentTimelineStream = null;
        deploymentTimelineFollowing = false;
      }
    }
  }

  $effect(() => {
    const currentDeploymentId = deploymentId;

    liveDeploymentTimelineEnvelopes = [];
    recoveryDeploymentProgressEvents = [];
    recoveryDeploymentProgressStatus = "idle";
    deploymentTimelineFollowError = "";
    deploymentProgressRequestId = "";
    deploymentProgressDeploymentId = currentDeploymentId;
    stopDeploymentTimelineFollow();
  });

  $effect(() => {
    if (
      !shouldFollowDeploymentTimeline ||
      !deployment ||
      deploymentTimelineFollowing ||
      deploymentTimelineQuery.isPending
    ) {
      if (!shouldFollowDeploymentTimeline) {
        stopDeploymentTimelineFollow();
      }
      return;
    }

    const generation = deploymentTimelineFollowGeneration + 1;
    deploymentTimelineFollowGeneration = generation;
    deploymentTimelineFollowError = "";
    deploymentTimelineFollowing = true;
    void consumeDeploymentTimelineStream(
      deployment.id,
      generation,
      latestDeploymentTimelineCursor(deploymentTimelineEnvelopes),
    );
  });

  onDestroy(() => {
    stopDeploymentTimelineFollow();
    if (timelineCopyResetTimeout) {
      clearTimeout(timelineCopyResetTimeout);
    }
    if (accessUrlCopyResetTimeout) {
      clearTimeout(accessUrlCopyResetTimeout);
    }
    if (diagnosticSummaryCopyResetTimeout) {
      clearTimeout(diagnosticSummaryCopyResetTimeout);
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
    const params = new URLSearchParams();

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

{#snippet deploymentDetailLoadingSkeleton()}
  <div class={detailPageClass} data-deployment-detail-loading-skeleton>
    <section class={detailHeaderClass}>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-3xl space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <Skeleton class="h-5 w-24 rounded-md" />
            <Skeleton class="h-5 w-20 rounded-md" />
          </div>
          <div class="space-y-2">
            <Skeleton class="h-8 w-80 max-w-full" />
            <Skeleton class="h-4 w-full max-w-2xl" />
            <Skeleton class="h-4 w-3/5 max-w-xl" />
          </div>
        </div>

        <div class="flex flex-wrap gap-2" data-deployment-header-owner-actions>
          <Button href="/deployments" variant="outline">
            <ArrowLeft class="size-4" />
            {$t(i18nKeys.common.actions.backToDeployments)}
          </Button>
          <Button type="button" variant="outline" disabled>
            <FolderOpen class="size-4" />
            {$t(i18nKeys.common.actions.openProject)}
          </Button>
          <Button type="button" variant="outline" disabled>
            <Boxes class="size-4" />
            {$t(i18nKeys.common.actions.openResource)}
          </Button>
        </div>
      </div>
    </section>

    <Tabs.Root value={activeTab} class={detailBodyClass}>
      <nav aria-label={$t(i18nKeys.console.deployments.pageTitle)} class={detailTabsClass}>
        {#each deploymentDetailTabs as tab (tab)}
          <a
            href={deploymentTabHref(tab)}
            class={detailTabClass}
            aria-current={activeTab === tab ? "page" : undefined}
            onclick={(event) => selectDeploymentTab(tab, event)}
          >
            {deploymentTabLabel(tab)}
          </a>
        {/each}
      </nav>

      <Tabs.Content value="overview" class={[detailTabPanelScrollClass, "space-y-5"]}>
        <section class="console-panel p-4" data-deployment-attempt-snapshot>
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {$t(i18nKeys.console.deployments.attemptSnapshotTitle)}
                </Badge>
                <Skeleton class="h-5 w-24 rounded-md" />
              </div>
              <div class="space-y-1">
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.deployments.attemptSnapshotTitle)}
                </h2>
                <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.deployments.attemptSnapshotDescription)}
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" disabled>
              <Clock3 class="size-4" />
              {$t(i18nKeys.common.actions.viewProgress)}
            </Button>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.project)}</p>
              <Skeleton class="mt-2 h-4 w-32 max-w-full" />
            </div>
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</p>
              <Skeleton class="mt-2 h-4 w-32 max-w-full" />
            </div>
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</p>
              <Skeleton class="mt-2 h-4 w-32 max-w-full" />
            </div>
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.server)}</p>
              <Skeleton class="mt-2 h-4 w-32 max-w-full" />
            </div>
          </div>

          <div class="mt-3 grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)]">
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.kind)}</p>
              <Skeleton class="mt-2 h-4 w-20" />
            </div>
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.source)}</p>
              <Skeleton class="mt-2 h-4 w-full" />
              <Skeleton class="mt-2 h-4 w-3/5" />
            </div>
          </div>

          <div class="mt-3 grid gap-3 md:grid-cols-3">
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.createdAt)}</p>
              <Skeleton class="mt-2 h-4 w-32" />
            </div>
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.startedAt)}</p>
              <Skeleton class="mt-2 h-4 w-32" />
            </div>
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.finishedAt)}</p>
              <Skeleton class="mt-2 h-4 w-32" />
            </div>
          </div>

          <div class="mt-4 rounded-md border bg-muted/20 px-3 py-3">
            <Skeleton class="h-4 w-56 max-w-full" />
          </div>
        </section>

        <section class="console-panel p-4" data-deployment-access-snapshot>
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0 space-y-2">
              <p class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Link2 class="size-4" />
                {$t(i18nKeys.console.deployments.accessSnapshotTitle)}
              </p>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.deployments.accessSnapshotDescription)}
              </p>
              <Skeleton class="h-7 w-full max-w-xl" />
              <Skeleton class="h-5 w-24 rounded-md" />
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <Button type="button" disabled>
                <ExternalLink class="size-4" />
                {$t(i18nKeys.console.deployments.openAccessUrl)}
              </Button>
              <Button type="button" variant="outline" disabled>
                <Copy class="size-4" />
                {$t(i18nKeys.console.deployments.copyAccessUrl)}
              </Button>
            </div>
          </div>
        </section>

        <section class="console-panel p-4" data-deployment-current-resource-handoff>
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <Skeleton class="h-5 w-28 rounded-md" />
                <Skeleton class="h-5 w-32 rounded-md" />
              </div>
              <div class="space-y-1">
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.deployments.currentResourceStateTitle)}
                </h2>
                <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.deployments.currentResourceStateDescription)}
                </p>
              </div>
            </div>
          </div>
          <div class="mt-5 grid gap-4 lg:grid-cols-2">
            <div class="console-subtle-panel flex min-w-0 flex-col gap-4 p-4">
              <div class="space-y-1">
                <h3 class="text-sm font-semibold">
                  {$t(i18nKeys.console.deployments.attemptObservationTitle)}
                </h3>
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-4 w-3/4" />
              </div>
              <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <Button type="button" variant="outline" class="justify-start" disabled>
                  <Clock3 class="size-4" />
                  {$t(i18nKeys.console.deployments.timelineTab)}
                </Button>
                <Button type="button" variant="outline" class="justify-start" disabled>
                  <ListChecks class="size-4" />
                  {$t(i18nKeys.console.deployments.snapshotTab)}
                </Button>
                <Button type="button" variant="outline" class="justify-start" disabled>
                  <Copy class="size-4" />
                  {$t(i18nKeys.console.resources.diagnosticSummaryCopy)}
                </Button>
              </div>
            </div>

            <div class="console-subtle-panel flex min-w-0 flex-col gap-4 p-4">
              <div class="space-y-1">
                <h3 class="text-sm font-semibold">
                  {$t(i18nKeys.console.deployments.currentResourceObservationTitle)}
                </h3>
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-4 w-3/4" />
              </div>
              <div class="grid gap-2 sm:grid-cols-3">
                <Button type="button" variant="outline" class="justify-start" disabled>
                  <Boxes class="size-4" />
                  {$t(i18nKeys.common.actions.openResource)}
                </Button>
                <Button type="button" variant="outline" class="justify-start" disabled>
                  <FileText class="size-4" />
                  {$t(i18nKeys.console.deployments.openResourceLogs)}
                </Button>
                <Button type="button" variant="outline" class="justify-start" disabled>
                  <Terminal class="size-4" />
                  {$t(i18nKeys.common.actions.openTerminal)}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </Tabs.Content>
    </Tabs.Root>
  </div>
{/snippet}

<ConsoleShell
  title={deployment?.runtimePlan.source.displayName ?? $t(i18nKeys.console.deployments.pageTitle)}
  description={$t(i18nKeys.console.deployments.detailDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle), href: "/projects" },
    {
      label: project?.name ?? $t(i18nKeys.common.domain.project),
      kind: "project",
      loading: projectHeaderLoading,
      href: project ? projectDetailHref(project.id) : undefined,
      switcherLabel: $t(i18nKeys.console.projects.pageTitle),
      switcherItems: projectHeaderSwitchItems,
    },
    {
      label: environment?.name ?? $t(i18nKeys.common.domain.environment),
      kind: "environment",
      loading: environmentHeaderLoading,
    },
    {
      label: resource?.name ?? $t(i18nKeys.common.domain.resource),
      kind: "resource",
      loading: resourceHeaderLoading,
      href: headerDeployment
        ? resourceDetailHref({
            id: headerDeployment.resourceId,
            projectId: headerDeployment.projectId,
            environmentId: headerDeployment.environmentId,
          })
        : undefined,
      switcherLabel: $t(i18nKeys.console.resources.pageTitle),
      switcherItems: resourceHeaderSwitchItems,
    },
    {
      label: headerDeployment?.runtimePlan.source.displayName ?? $t(i18nKeys.common.domain.deployment),
      kind: "deployment",
      loading: deploymentHeaderLoading,
      href: headerDeployment ? deploymentDetailHref(headerDeployment) : undefined,
      switcherLabel: $t(i18nKeys.console.deployments.pageTitle),
      switcherItems: deploymentHeaderSwitchItems,
    },
  ]}
>
  {#if pageLoading}
    {@render deploymentDetailLoadingSkeleton()}
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
    {@const sourceVersion = sourceVersionForDeployment(deployment)}
    <div class={detailPageClass}>
      <section class={detailHeaderClass}>
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
              {#if sourceVersion}
                <p class="break-all font-mono text-sm text-muted-foreground" title={sourceVersion.value}>
                  {sourceVersion.label}
                  {sourceVersion.requested ? `${sourceVersion.requested} -> ` : ""}
                  {sourceVersion.shortValue}
                </p>
              {/if}
            </div>
          </div>

          <div class="flex flex-wrap gap-2" data-deployment-header-owner-actions>
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
              <Button href={resourceOverviewHref} variant="outline">
                <Boxes class="size-4" />
                {$t(i18nKeys.common.actions.openResource)}
              </Button>
            {/if}
          </div>
        </div>

      </section>

      <Tabs.Root value={activeTab} class={detailBodyClass}>
        <nav
          aria-label={$t(i18nKeys.console.deployments.pageTitle)}
          class={detailTabsClass}
        >
          {#each deploymentDetailTabs as tab (tab)}
            <a
              href={deploymentTabHref(tab)}
              class={detailTabClass}
              aria-current={activeTab === tab ? "page" : undefined}
              onclick={(event) => selectDeploymentTab(tab, event)}
            >
              {deploymentTabLabel(tab)}
            </a>
          {/each}
        </nav>

        <Tabs.Content
          value="overview"
          class={[detailTabPanelScrollClass, "space-y-5"]}
        >
          {#if diagnosticSummaryError || diagnosticSummaryCopyFallback}
            <section class="console-panel space-y-3 p-4">
              {#if diagnosticSummaryError}
                <p class="text-sm text-destructive">{diagnosticSummaryError}</p>
              {/if}
              {#if diagnosticSummaryCopyFallback}
                <div class="space-y-2">
                  <div class="space-y-1">
                    <p class="text-sm font-medium">
                      {$t(i18nKeys.console.resources.diagnosticSummaryCopyFallbackTitle)}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.resources.diagnosticSummaryCopyFallbackDescription)}
                    </p>
                  </div>
                  <div
                    class="max-h-64 overflow-auto rounded-md border bg-muted/25 p-3"
                    data-deployment-diagnostic-summary-fallback
                  >
                    <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">{diagnosticSummaryCopyFallback}</pre>
                  </div>
                </div>
              {/if}
            </section>
          {/if}

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

          <section class="console-panel p-4" data-deployment-attempt-snapshot>
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {$t(i18nKeys.console.deployments.attemptSnapshotTitle)}
                  </Badge>
                  <DeploymentStatusBadge status={deployment.status} />
                </div>
                <div class="space-y-1">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.deployments.attemptSnapshotTitle)}
                  </h2>
                  <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.deployments.attemptSnapshotDescription)}
                  </p>
                </div>
              </div>
              <Button type="button" variant="outline" onclick={handleViewProgress}>
                <Clock3 class="size-4" />
                {$t(i18nKeys.common.actions.viewProgress)}
              </Button>
            </div>

            <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div class="console-subtle-panel px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.project)}</p>
                <p class="mt-1 truncate text-sm font-medium">{project?.name ?? deployment.projectId}</p>
              </div>
              <div class="console-subtle-panel px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</p>
                <p class="mt-1 truncate text-sm font-medium">
                  {environment?.name ?? deployment.environmentId}
                </p>
              </div>
              <div class="console-subtle-panel px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</p>
                <p class="mt-1 truncate text-sm font-medium">{resource?.name ?? deployment.resourceId}</p>
              </div>
              <div class="console-subtle-panel px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.server)}</p>
                <p class="mt-1 truncate text-sm font-medium">{server?.name ?? deployment.serverId}</p>
              </div>
            </div>

            <div class={sourceVersion ? "mt-3 grid gap-3 md:grid-cols-[10rem_14rem_minmax(0,1fr)]" : "mt-3 grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)]"}>
              <div class="console-subtle-panel px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.kind)}</p>
                <p class="mt-1 truncate text-sm font-medium">{deployment.runtimePlan.source.kind}</p>
              </div>
              {#if sourceVersion}
                <div class="console-subtle-panel px-3 py-2">
                  <p class="text-xs text-muted-foreground">{sourceVersion.label}</p>
                  <p class="mt-1 truncate font-mono text-sm font-medium" title={sourceVersion.value}>
                    {sourceVersion.requested ? `${sourceVersion.requested} -> ` : ""}{sourceVersion.shortValue}
                  </p>
                </div>
              {/if}
              <div class="console-subtle-panel px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.source)}</p>
                <p class="mt-1 break-all text-sm font-medium">
                  {deployment.runtimePlan.source.locator}
                </p>
              </div>
            </div>

            <div class="mt-3 grid gap-3 md:grid-cols-3">
              <div class="console-subtle-panel px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.createdAt)}</p>
                <p class="mt-1 text-sm font-medium">{formatTime(deployment.createdAt)}</p>
              </div>
              <div class="console-subtle-panel px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.startedAt)}</p>
                <p class="mt-1 text-sm font-medium">
                  {deployment.startedAt ? formatTime(deployment.startedAt) : "-"}
                </p>
              </div>
              <div class="console-subtle-panel px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.finishedAt)}</p>
                <p class="mt-1 text-sm font-medium">
                  {deployment.finishedAt ? formatTime(deployment.finishedAt) : "-"}
                </p>
              </div>
            </div>

            {#if deploymentDetail?.latestFailure}
              <div class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">
                    {$t(i18nKeys.console.deployments.latestFailureTitle)}
                  </Badge>
                  <span class="text-xs text-muted-foreground">
                    {deploymentDetail.latestFailure.phase} · {formatTime(deploymentDetail.latestFailure.timestamp)}
                  </span>
                </div>
                <p class="mt-2 text-sm leading-6 text-destructive">
                  {deploymentDetail.latestFailure.message}
                </p>
              </div>
            {:else}
              <div class="mt-4 rounded-md border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                {$t(i18nKeys.console.deployments.noFailureSummary)}
              </div>
            {/if}
          </section>

          <section class="console-panel p-4" data-deployment-access-snapshot>
            <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div class="min-w-0 space-y-2">
                <p class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Link2 class="size-4" />
                  {$t(i18nKeys.console.deployments.accessSnapshotTitle)}
                </p>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.deployments.accessSnapshotDescription)}
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
                    {$t(i18nKeys.console.deployments.accessSnapshotEmpty)}
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

          <section class="console-panel p-4" data-deployment-current-resource-handoff>
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant={deploymentIsCurrentResourceState ? "secondary" : "outline"}>
                    {currentResourceDeploymentStateLabel}
                  </Badge>
                  <Badge variant="outline">
                    {$t(i18nKeys.common.domain.status)}: {currentResourceDeploymentStatus}
                  </Badge>
                </div>
                <div class="space-y-1">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.deployments.currentResourceStateTitle)}
                  </h2>
                  <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.deployments.currentResourceStateDescription)}
                  </p>
                </div>
              </div>

            </div>

            <div class="mt-5 grid gap-4 lg:grid-cols-2">
              <div
                class="console-subtle-panel flex min-w-0 flex-col gap-4 p-4"
                data-deployment-attempt-observation
              >
                <div class="space-y-1">
                  <h3 class="text-sm font-semibold">
                    {$t(i18nKeys.console.deployments.attemptObservationTitle)}
                  </h3>
                  <p class="text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.deployments.attemptObservationDescription)}
                  </p>
                </div>
                <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-deployment-observation-actions>
                  <Button href={deploymentTimelineHref} variant="outline" class="justify-start">
                    <Clock3 class="size-4" />
                    {$t(i18nKeys.console.deployments.timelineTab)}
                  </Button>
                  <Button href={deploymentSnapshotHref} variant="outline" class="justify-start">
                    <ListChecks class="size-4" />
                    {$t(i18nKeys.console.deployments.snapshotTab)}
                  </Button>
                  <Button
                    id="deployment-diagnostic-summary-copy"
                    type="button"
                    variant="outline"
                    class="justify-start"
                    disabled={diagnosticSummaryLoading}
                    aria-label={diagnosticSummaryCopyLabel}
                    title={diagnosticSummaryCopyLabel}
                    onclick={handleCopyDeploymentDiagnosticSummary}
                  >
                    {#if diagnosticSummaryLoading}
                      <LoaderCircle class="size-4 animate-spin" />
                    {:else if diagnosticSummaryCopyState === "copied"}
                      <Check class="size-4" />
                    {:else}
                      <Copy class="size-4" />
                    {/if}
                    {diagnosticSummaryCopyLabel}
                  </Button>
                </div>
              </div>

              <div
                class="console-subtle-panel flex min-w-0 flex-col gap-4 p-4"
                data-deployment-current-resource-observation
              >
                <div class="space-y-1">
                  <h3 class="text-sm font-semibold">
                    {$t(i18nKeys.console.deployments.currentResourceObservationTitle)}
                  </h3>
                  <p class="text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.deployments.currentResourceObservationDescription)}
                  </p>
                </div>
                {#if deploymentResourceRef}
                  <div class="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    <Button href={resourceOverviewHref} variant="outline" class="justify-start">
                      <Boxes class="size-4" />
                      {$t(i18nKeys.common.actions.openResource)}
                    </Button>
                    <Button href={resourceLogsHref} variant="outline" class="justify-start">
                      <FileText class="size-4" />
                      {$t(i18nKeys.console.deployments.openResourceLogs)}
                    </Button>
                    <Button href={resourceTerminalUrl} variant="outline" class="justify-start">
                      <Terminal class="size-4" />
                      {$t(i18nKeys.common.actions.openTerminal)}
                    </Button>
                  </div>
                {:else}
                  <div class="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.deployments.currentResourceObservationEmpty)}
                  </div>
                {/if}
              </div>
            </div>
          </section>

          {#if deploymentRecoveryReadinessQuery.isPending}
            <section class="console-panel p-4" data-testid="deployment-recovery-readiness-loading">
              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div class="space-y-2">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.deployments.recoveryTitle)}
                  </h2>
                  <p class="text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.deployments.recoveryDescription)}
                  </p>
                </div>
                <Skeleton class="h-9 w-36" />
              </div>
              <div class="mt-4 grid gap-3 sm:grid-cols-3">
                <Skeleton class="h-16 w-full" />
                <Skeleton class="h-16 w-full" />
                <Skeleton class="h-16 w-full" />
              </div>
            </section>
          {:else if recoveryReadiness}
            <section class="console-panel p-4" data-testid="deployment-recovery-readiness">
              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div class="space-y-2">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.deployments.recoveryTitle)}
                  </h2>
                  <p class="text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.deployments.recoveryDescription)}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {$t(i18nKeys.console.deployments.recoveryCandidateCount, {
                      count: recoveryReadiness.rollbackCandidateCount,
                    })}
                  </Badge>
                  <Button type="button" variant="outline" onclick={() => openRecoveryDialog()}>
                    <RefreshCw class="size-4" />
                    {$t(i18nKeys.console.deployments.recoveryOpenDialogAction)}
                  </Button>
                </div>
              </div>
              <div class="mt-4 grid gap-3 sm:grid-cols-3" data-deployment-recovery-summary>
                <div class="console-subtle-panel px-3 py-2" data-deployment-recovery-summary-item="retry">
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
                </div>

                <div class="console-subtle-panel px-3 py-2" data-deployment-recovery-summary-item="redeploy">
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
                </div>

                <div class="console-subtle-panel px-3 py-2" data-deployment-recovery-summary-item="rollback">
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
                  <p class="mt-2 text-xs text-muted-foreground">
                    {$t(i18nKeys.console.deployments.recoveryCandidateCount, {
                      count: recoveryReadiness.rollbackCandidateCount,
                    })}
                  </p>
                </div>
              </div>
            </section>
          {/if}

        </Tabs.Content>

        <Tabs.Content
          value="timeline"
          class={[detailTabPanelScrollClass, "space-y-4"]}
          data-deployment-attempt-timeline
        >
          <section class="console-panel p-4">
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
                {#if deploymentTimelineFollowing}
                  <Badge variant="secondary">
                    {$t(i18nKeys.console.deployments.progressStatusRunning)}
                  </Badge>
                {/if}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={deploymentTimeline.length === 0}
                  aria-label={timelineCopyLabel}
                  title={timelineCopyLabel}
                  onclick={handleCopyDeploymentTimeline}
                >
                  {#if timelineCopyState === "copied"}
                    <Check class="size-4" />
                  {:else}
                    <Copy class="size-4" />
                  {/if}
                  {timelineCopyLabel}
                </Button>
              </div>
            </div>

            {#if deploymentProgressStreamError}
              <div class="mt-4 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {deploymentProgressStreamError}
              </div>
            {/if}

            <div class="mt-4 grid gap-3 md:grid-cols-3">
              <div class="console-subtle-panel px-4 py-3">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.createdAt)}</p>
                <p class="mt-1 font-medium">{formatTime(deployment.createdAt)}</p>
              </div>
              <div class="console-subtle-panel px-4 py-3">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.startedAt)}</p>
                <p class="mt-1 font-medium">
                  {deployment.startedAt ? formatTime(deployment.startedAt) : "-"}
                </p>
              </div>
              <div class="console-subtle-panel px-4 py-3">
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
                        <div class="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-2 gap-y-1 leading-5 md:grid-cols-[4.75rem_6rem_3.5rem_minmax(0,1fr)]">
                          <span class="text-zinc-600">{logTimeLabel(event.timestamp)}</span>
                          <span class={event.source === "application" ? "text-sky-300" : "text-emerald-300"}>
                            {progressSourceLabel(event)}
                          </span>
                          <span class={logLevelClass(event.level)}>{event.level}</span>
                          <span
                            class={`col-span-2 min-w-0 break-words md:col-span-1 ${logLevelClass(event.level)} ${event.source === "application" ? "md:pl-3" : ""}`}
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

        <Tabs.Content
          value="snapshot"
          class={[detailTabPanelScrollClass, "space-y-4"]}
        >
          <section class="console-panel p-4">
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.deployments.snapshotTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.deployments.snapshotDescription)}
            </p>

            <div class="console-subtle-panel mt-4 px-4 py-3">
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

{#if deployment && recoveryReadiness}
  <Dialog.Root bind:open={recoveryDialogOpen} onOpenChange={(open) => {
    if (!open) {
      closeRecoveryDialog();
    }
  }}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-2xl">
      <Dialog.Header>
        <Dialog.Title>{recoveryDialogTitle}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.deployments.recoveryDialogDescription)}
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-4 px-5 pb-5">
        <section class="grid gap-3 sm:grid-cols-3" data-deployment-recovery-intent-picker>
          {#each (["retry", "redeploy", "rollback"] as const) as action (action)}
            <button
              type="button"
              class={[
                "rounded-md border bg-card px-3 py-3 text-left text-sm transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedRecoveryAction === action
                  ? "border-primary/40 bg-primary/5"
                  : "border-border",
              ]}
              onclick={() => selectRecoveryAction(action)}
            >
              <span class="block font-medium">{recoveryActionTitle(action)}</span>
              <span class="mt-2 block text-xs text-muted-foreground">
                {recoveryStatusLabel(
                  action === "retry"
                    ? recoveryReadiness.retryable
                    : action === "redeploy"
                      ? recoveryReadiness.redeployable
                      : recoveryReadiness.rollbackReady,
                  action === "retry"
                    ? recoveryReadiness.retry.commandActive
                    : action === "redeploy"
                      ? recoveryReadiness.redeploy.commandActive
                      : recoveryReadiness.rollback.commandActive,
                )}
              </span>
            </button>
          {/each}
        </section>

        {#if selectedRecoveryAction}
          <section class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-md border bg-muted/20 px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.deployment)}</p>
              <p class="mt-1 truncate font-mono text-sm font-medium">{deployment.id}</p>
            </div>
            <div class="rounded-md border bg-muted/20 px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</p>
              <p class="mt-1 truncate text-sm font-medium">{resource?.name ?? deployment.resourceId}</p>
            </div>
            <div class="rounded-md border bg-muted/20 px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.server)}</p>
              <p class="mt-1 truncate text-sm font-medium">{server?.name ?? deployment.serverId}</p>
            </div>
            <div class="rounded-md border bg-muted/20 px-3 py-2">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.deployments.generatedAt)}</p>
              <p class="mt-1 truncate text-sm font-medium">{formatTime(recoveryReadiness.generatedAt)}</p>
            </div>
          </section>

          <section class="rounded-md border bg-muted/20 px-3 py-3">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-medium">{selectedRecoveryActionTitle}</p>
              <Badge variant={recoveryActionAllowed(selectedRecoveryAction) ? "secondary" : "outline"}>
                {recoveryStatusLabel(
                  selectedRecoveryAction === "retry"
                    ? recoveryReadiness.retryable
                    : selectedRecoveryAction === "redeploy"
                      ? recoveryReadiness.redeployable
                      : recoveryReadiness.rollbackReady,
                  selectedRecoveryAction === "retry"
                    ? recoveryReadiness.retry.commandActive
                    : selectedRecoveryAction === "redeploy"
                      ? recoveryReadiness.redeploy.commandActive
                      : recoveryReadiness.rollback.commandActive,
                )}
              </Badge>
            </div>
            <ul class="mt-3 space-y-1 text-sm text-muted-foreground">
              {#each recoveryActionReasons(recoveryReadiness, selectedRecoveryAction) as reason (reason)}
                <li>{reason}</li>
              {:else}
                <li>{$t(i18nKeys.console.deployments.recoveryNoReasons)}</li>
              {/each}
            </ul>
          </section>

          {#if selectedRecoveryAction === "rollback"}
            <section class="rounded-md border bg-background p-3">
              <div class="space-y-1">
                <h3 class="text-sm font-medium">
                  {$t(i18nKeys.console.deployments.recoveryRollbackCandidateTitle)}
                </h3>
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.deployments.recoveryRollbackCandidateDescription)}
                </p>
              </div>
              {#if recoveryReadiness.rollback.candidates.length > 0}
                <div class="mt-3 space-y-2">
                  {#each recoveryReadiness.rollback.candidates as candidate (candidate.deploymentId)}
                    <label
                      class={[
                        "flex min-w-0 items-start gap-3 rounded-md border px-3 py-2 text-sm",
                        candidate.rollbackReady
                          ? "cursor-pointer bg-card hover:bg-primary/5"
                          : "bg-muted/30 text-muted-foreground",
                      ]}
                    >
                      <input
                        class="mt-1"
                        type="radio"
                        name="rollback-candidate"
                        value={candidate.deploymentId}
                        checked={rollbackDeploymentRecoveryCandidate?.deploymentId === candidate.deploymentId}
                        disabled={!candidate.rollbackReady || recoveryActionPending}
                        onchange={(event) => {
                          selectedRollbackCandidateId = event.currentTarget.value;
                        }}
                      />
                      <span class="min-w-0">
                        <span class="block truncate font-medium">
                          {$t(i18nKeys.console.deployments.recoveryRollbackCandidate, {
                            deploymentId: candidate.deploymentId,
                          })}
                        </span>
                        <span class="mt-1 block truncate text-xs text-muted-foreground">
                          {candidate.artifactSummary ??
                            candidate.sourceSummary ??
                            formatTime(candidate.finishedAt)}
                        </span>
                      </span>
                    </label>
                  {/each}
                </div>
              {:else}
                <div class="mt-3 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.deployments.recoveryReasonNoRollbackCandidate)}
                </div>
              {/if}
            </section>
          {/if}

          {#if deploymentRecoveryActionError}
            <div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {deploymentRecoveryActionError}
            </div>
          {/if}
        {:else}
          <div class="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            {$t(i18nKeys.console.deployments.recoverySelectActionDescription)}
          </div>
        {/if}

        <Dialog.Footer class="px-0 pb-0">
          <Button type="button" variant="outline" disabled={recoveryActionPending} onclick={closeRecoveryDialog}>
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button type="button" disabled={!selectedRecoveryActionAllowed} onclick={confirmSelectedRecoveryAction}>
            <RefreshCw class={["size-4", recoveryActionPending ? "animate-spin" : ""]} />
            {selectedRecoveryActionSubmitLabel}
          </Button>
        </Dialog.Footer>
      </div>
    </Dialog.Content>
  </Dialog.Root>
{/if}

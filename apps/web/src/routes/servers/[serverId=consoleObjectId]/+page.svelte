<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import {
    Activity,
    ArrowLeft,
    Boxes,
    CheckCircle2,
    CircleDashed,
    Gauge,
    Globe2,
    KeyRound,
    Network,
    RefreshCw,
    Server,
    ShieldAlert,
    Terminal,
    Trash2,
    TriangleAlert,
    XCircle,
  } from "@lucide/svelte";
  import type {
    DeactivateServerInput,
    DeleteServerInput,
    InspectServerCapacityResponse,
    PruneServerCapacityResponse,
    RenameServerInput,
    ServerDeleteSafety,
    ServerSummary,
    SshCredentialUsageServer,
    TestServerConnectivityResponse,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import RuntimeMonitorPanel from "$lib/components/console/RuntimeMonitorPanel.svelte";
  import TerminalSessionPanel from "$lib/components/console/TerminalSessionPanel.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import ConsoleDataSkeleton from "$lib/components/console/ConsoleDataSkeleton.svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import {
    detailBodyClass,
    detailHeaderClass,
    detailPageClass,
    detailSubnavClass,
    detailSubnavContentClass,
    detailSubnavLayoutClass,
    detailTabClass,
    detailTabPanelScrollClass,
    detailTabPanelSubnavClass,
    detailTabsClass,
    detailTabsScrollAreaClass,
    subnavItemClass,
    subnavListClass,
  } from "$lib/console/layout-classes";
  import {
    runtimeMonitoringRollupQueryOptions,
    runtimeMonitoringSamplesQueryOptions,
    runtimeMonitoringThresholdsQueryOptions,
    type RuntimeMonitoringTimeRangeId,
    runtimeUsageQueryOptions,
  } from "$lib/console/runtime-usage-query";
  import { serverProviderDisplayLabel } from "$lib/console/server-registration";
  import {
    formatRuntimeUsageBytes,
    runtimeMonitoringDeploymentInObservationWindow,
    runtimeMonitoringObservationHandoffFromSearchParams,
    runtimeMonitoringObservationHandoffMatchesScope,
  } from "$lib/console/runtime-usage";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const serverId = $derived(page.params.serverId ?? "");
  let runtimeMonitoringTimeRange = $state<RuntimeMonitoringTimeRangeId>("1h");
  type ServerDetailTab =
    | "overview"
    | "runtime"
    | "capacity"
    | "connectivity"
    | "deployments"
    | "settings";
  type ServerRuntimeSection = "monitor" | "terminal";
  type ServerSettingsSection = "general" | "credentials" | "danger";
  type ServerLifecycleAction = "deactivate" | "delete";
  const serverDetailTabs = [
    "overview",
    "runtime",
    "capacity",
    "connectivity",
    "deployments",
    "settings",
  ] as const;
  const serverRuntimeSections = ["monitor", "terminal"] as const;
  const serverSettingsSections = ["general", "credentials", "danger"] as const;
  const serverDetailListLimit = 100;
  const projectsQuery = createQuery(() =>
    orpc.projects.list.queryOptions({
      input: { limit: serverDetailListLimit },
      enabled: browser,
    }),
  );
  const deploymentsQuery = createQuery(() =>
    orpc.deployments.list.queryOptions({
      input: { limit: serverDetailListLimit },
      enabled: browser,
    }),
  );
  const serverDetailQuery = createQuery(() =>
    orpc.servers.show.queryOptions({
      input: {
        serverId,
        includeRollups: true,
      },
      enabled: browser && serverId.length > 0,
      staleTime: 5_000,
    }),
  );
  const serverDeleteSafetyQuery = createQuery(() =>
    orpc.servers.deleteCheck.queryOptions({
      input: {
        serverId,
      },
      enabled: browser && serverId.length > 0,
      staleTime: 5_000,
    }),
  );
  const serverRuntimeScope = $derived({
    kind: "server" as const,
    serverId,
  });
  const activeTab = $derived(parseServerDetailTab(page.url.searchParams.get("tab")));
  const serverRuntimeUsageQuery = createQuery(() =>
    runtimeUsageQueryOptions(serverRuntimeScope, browser && serverId.length > 0),
  );
  const serverRuntimeMonitoringSamplesQuery = createQuery(() =>
    runtimeMonitoringSamplesQueryOptions(
      serverRuntimeScope,
      browser && serverId.length > 0,
      runtimeMonitoringTimeRange,
    ),
  );
  const serverRuntimeMonitoringRollupQuery = createQuery(() =>
    runtimeMonitoringRollupQueryOptions(
      serverRuntimeScope,
      browser && serverId.length > 0,
      runtimeMonitoringTimeRange,
    ),
  );
  const serverRuntimeMonitoringThresholdsQuery = createQuery(() =>
    runtimeMonitoringThresholdsQueryOptions(serverRuntimeScope, browser && serverId.length > 0),
  );
  const serverCapacityQuery = createQuery(() =>
    orpc.servers.capacity.inspect.queryOptions({
      input: {
        serverId,
      },
      enabled: browser && serverId.length > 0,
      staleTime: 5_000,
    }),
  );
  const projects = $derived(projectsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      deploymentsQuery.isPending ||
      serverDetailQuery.isPending,
  );
  const serverDetail = $derived(serverDetailQuery.data ?? null);
  const server = $derived(serverDetail?.server ?? null);
  const storedSshCredentialId = $derived(
    server?.credential?.kind === "ssh-private-key" ? (server.credential.credentialId ?? "") : "",
  );
  const sshCredentialDetailQuery = createQuery(() =>
    orpc.credentials.ssh.show.queryOptions({
      input: {
        credentialId: storedSshCredentialId,
        includeUsage: true,
      },
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
  const serverRuntimeUsage = $derived(serverRuntimeUsageQuery.data ?? null);
  const serverRuntimeUsageError = $derived(
    serverRuntimeUsageQuery.error ? readErrorMessage(serverRuntimeUsageQuery.error) : "",
  );
  const serverRuntimeMonitoringSamples = $derived(
    serverRuntimeMonitoringSamplesQuery.data ?? null,
  );
  const serverRuntimeMonitoringSamplesError = $derived(
    serverRuntimeMonitoringSamplesQuery.error
      ? readErrorMessage(serverRuntimeMonitoringSamplesQuery.error)
      : "",
  );
  const serverRuntimeMonitoringRollup = $derived(serverRuntimeMonitoringRollupQuery.data ?? null);
  const serverRuntimeMonitoringRollupError = $derived(
    serverRuntimeMonitoringRollupQuery.error
      ? readErrorMessage(serverRuntimeMonitoringRollupQuery.error)
      : "",
  );
  const serverRuntimeMonitoringThresholds = $derived(
    serverRuntimeMonitoringThresholdsQuery.data ?? null,
  );
  const serverRuntimeMonitoringThresholdsError = $derived(
    serverRuntimeMonitoringThresholdsQuery.error
      ? readErrorMessage(serverRuntimeMonitoringThresholdsQuery.error)
      : "",
  );
  const serverCapacity = $derived(serverCapacityQuery.data ?? null);
  const serverCapacityError = $derived(
    serverCapacityQuery.error ? readErrorMessage(serverCapacityQuery.error) : "",
  );
  const runtimeMonitoringObservationHandoff = $derived(
    runtimeMonitoringObservationHandoffFromSearchParams(page.url.searchParams),
  );
  const serverRuntimeMonitoringObservationHandoff = $derived.by(() => {
    const handoff = runtimeMonitoringObservationHandoff;
    const currentServerId = server?.id ?? "";
    if (!currentServerId) {
      return null;
    }

    return runtimeMonitoringObservationHandoffMatchesScope(handoff, {
      kind: "server",
      serverId: currentServerId,
    })
      ? handoff
      : null;
  });
  const serverDeployments = $derived(
    server ? deployments.filter((deployment) => deployment.serverId === server.id) : [],
  );
  const serverDeploymentsInObservationWindow = $derived(
    serverRuntimeMonitoringObservationHandoff
      ? serverDeployments.filter((deployment) =>
          runtimeMonitoringDeploymentInObservationWindow(
            deployment,
            serverRuntimeMonitoringObservationHandoff,
          ),
        )
      : serverDeployments,
  );
  const relatedDeploymentCount = $derived(
    serverRuntimeMonitoringObservationHandoff
      ? serverDeploymentsInObservationWindow.length
      : (serverRollups?.deployments.total ?? serverDeployments.length),
  );
  let connectivityResult = $state<TestServerConnectivityResponse | null>(null);
  let connectivityError = $state("");
  let serverFormServerId = $state("");
  let serverName = $state("");
  let serverRenameDialogOpen = $state(false);
  let serverLifecycleDialogOpen = $state(false);
  let selectedServerLifecycleAction = $state<ServerLifecycleAction | null>(null);
  let serverLifecycleConfirmation = $state("");
  let settingsFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  type ServerCapacityPruneCategory = PruneServerCapacityResponse["categories"][number];
  const serverCapacityPruneCategories = [
    "stopped-containers",
    "preview-workspaces",
    "source-workspaces",
    "docker-build-cache",
    "unused-images",
    "remote-state-markers",
  ] as const satisfies ServerCapacityPruneCategory[];
  let capacityPruneBefore = $state("");
  let capacityPruneObservationHandoffKey = $state("");
  let capacityPruneSelectedCategories = $state<Record<ServerCapacityPruneCategory, boolean>>({
    "stopped-containers": true,
    "preview-workspaces": true,
    "source-workspaces": true,
    "docker-build-cache": false,
    "unused-images": false,
    "remote-state-markers": false,
  });
  let capacityPruneDialogOpen = $state(false);
  let capacityPruneConfirmation = $state("");
  let capacityPruneResult = $state<PruneServerCapacityResponse | null>(null);
  let capacityPruneFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let serverDeleteFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let serverDeactivateFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  const canRenameServer = $derived(
    Boolean(server) && serverName.trim().length > 0 && serverName.trim() !== server?.name,
  );
  const canSelectServerDelete = $derived(
    Boolean(server) && Boolean(serverDeleteSafety?.eligible) && !serverDeleteSafetyQuery.isPending,
  );
  const canSelectServerDeactivate = $derived(server?.lifecycleStatus === "active");
  const canSubmitServerDeactivate = $derived(
    Boolean(server) &&
      server?.lifecycleStatus === "active" &&
      selectedServerLifecycleAction === "deactivate" &&
      serverLifecycleConfirmation.trim() === server?.id,
  );
  const canSubmitServerDelete = $derived(
    Boolean(server) &&
      Boolean(serverDeleteSafety?.eligible) &&
      selectedServerLifecycleAction === "delete" &&
      serverLifecycleConfirmation.trim() === server?.id,
  );
  const selectedCapacityPruneCategories = $derived(
    serverCapacityPruneCategories.filter((category) => capacityPruneSelectedCategories[category]),
  );
  const canPreviewCapacityPrune = $derived(
    Boolean(server) &&
      capacityPruneBefore.trim().length > 0 &&
      selectedCapacityPruneCategories.length > 0,
  );
  const canApplyCapacityPrune = $derived(
    canPreviewCapacityPrune && Boolean(server) && capacityPruneConfirmation.trim() === server?.id,
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
  const renameServerMutation = createMutation(() => ({
    mutationFn: (input: RenameServerInput) => orpcClient.servers.rename(input),
    onSuccess: (result) => {
      serverName = serverName.trim();
      settingsFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.renameSucceeded),
        detail: result.id,
      };
      serverRenameDialogOpen = false;
      void queryClient.invalidateQueries({ queryKey: orpc.servers.key({ type: "query" }) });
    },
    onError: (error) => {
      settingsFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.renameFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const deactivateServerMutation = createMutation(() => ({
    mutationFn: (input: DeactivateServerInput) => orpcClient.servers.deactivate(input),
    onSuccess: (result) => {
      serverDeactivateFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.deactivateServerSucceeded),
        detail: result.id,
      };
      closeServerLifecycleDialog();
      void queryClient.invalidateQueries({ queryKey: orpc.servers.key({ type: "query" }) });
    },
    onError: (error) => {
      serverDeactivateFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.deactivateServerFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const deleteServerMutation = createMutation(() => ({
    mutationFn: (input: DeleteServerInput) => orpcClient.servers.delete(input),
    onSuccess: (result) => {
      serverDeleteFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.deleteServerSucceeded),
        detail: result.id,
      };
      closeServerLifecycleDialog();
      void queryClient.invalidateQueries({ queryKey: orpc.servers.key({ type: "query" }) });
      void goto("/servers");
    },
    onError: (error) => {
      serverDeleteFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.deleteServerFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const pruneServerCapacityMutation = createMutation(() => ({
    mutationFn: (input: {
      serverId: string;
      before: string;
      categories: ServerCapacityPruneCategory[];
      dryRun: boolean;
    }) => orpcClient.servers.capacity.prune(input),
    onSuccess: (result) => {
      capacityPruneResult = result;
      capacityPruneFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.capacityPruneSucceeded),
        detail: capacityPruneSummary(result),
      };
      if (!result.dryRun) {
        capacityPruneDialogOpen = false;
        capacityPruneConfirmation = "";
        void queryClient.invalidateQueries({
          queryKey: ["servers", "capacity", "inspect", result.server.id],
        });
      }
    },
    onError: (error) => {
      capacityPruneFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.capacityPruneFailed),
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
    serverRenameDialogOpen = false;
    settingsFeedback = null;
    serverDeactivateFeedback = null;
    selectedServerLifecycleAction = null;
    serverLifecycleConfirmation = "";
    serverLifecycleDialogOpen = false;
    serverDeleteFeedback = null;
    capacityPruneBefore = new Date().toISOString();
    capacityPruneObservationHandoffKey = "";
    capacityPruneDialogOpen = false;
    capacityPruneConfirmation = "";
    capacityPruneResult = null;
    capacityPruneFeedback = null;
  });

  $effect(() => {
    const handoff = serverRuntimeMonitoringObservationHandoff;
    const currentServerId = server?.id ?? "";
    if (!handoff || !currentServerId) {
      return;
    }

    const handoffKey = `${currentServerId}:${handoff.from}:${handoff.to}`;
    if (capacityPruneObservationHandoffKey === handoffKey) {
      return;
    }

    capacityPruneObservationHandoffKey = handoffKey;
    capacityPruneBefore = handoff.to;
    capacityPruneConfirmation = "";
    capacityPruneResult = null;
    capacityPruneFeedback = null;
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

    settingsFeedback = null;
    renameServerMutation.mutate({
      serverId: server.id,
      name: serverName.trim(),
    });
  }

  function openServerRenameDialog(): void {
    if (!server) {
      return;
    }

    serverName = server.name;
    settingsFeedback = null;
    serverRenameDialogOpen = true;
  }

  function closeServerRenameDialog(): void {
    if (renameServerMutation.isPending) {
      return;
    }

    serverRenameDialogOpen = false;
  }

  function openServerLifecycleDialog(): void {
    if (!server) {
      return;
    }

    selectedServerLifecycleAction = null;
    serverLifecycleConfirmation = "";
    serverDeactivateFeedback = null;
    serverDeleteFeedback = null;
    serverLifecycleDialogOpen = true;
  }

  function closeServerLifecycleDialog(): void {
    if (deactivateServerMutation.isPending || deleteServerMutation.isPending) {
      return;
    }

    serverLifecycleDialogOpen = false;
    selectedServerLifecycleAction = null;
    serverLifecycleConfirmation = "";
  }

  function selectServerLifecycleAction(action: ServerLifecycleAction): void {
    if (!server) {
      return;
    }

    if (action === "deactivate" && !canSelectServerDeactivate) {
      return;
    }
    if (action === "delete" && !canSelectServerDelete) {
      return;
    }

    selectedServerLifecycleAction = action;
    serverLifecycleConfirmation = "";
    serverDeactivateFeedback = null;
    serverDeleteFeedback = null;
  }

  function submitServerDeactivate(event: SubmitEvent): void {
    event.preventDefault();

    if (!server || !canSubmitServerDeactivate || deactivateServerMutation.isPending) {
      return;
    }

    serverDeactivateFeedback = null;
    deactivateServerMutation.mutate({
      serverId: server.id,
    });
  }

  function submitServerDelete(event: SubmitEvent): void {
    event.preventDefault();

    if (!server || !canSubmitServerDelete || deleteServerMutation.isPending) {
      return;
    }

    serverDeleteFeedback = null;
    deleteServerMutation.mutate({
      serverId: server.id,
      confirmation: {
        serverId: serverLifecycleConfirmation.trim(),
      },
    });
  }

  function setCapacityPruneCategory(category: ServerCapacityPruneCategory, event: Event): void {
    const checked =
      event.currentTarget instanceof HTMLInputElement ? event.currentTarget.checked : false;
    capacityPruneSelectedCategories = {
      ...capacityPruneSelectedCategories,
      [category]: checked,
    };
  }

  function openCapacityPruneDialog(): void {
    if (!server) {
      return;
    }

    capacityPruneConfirmation = "";
    capacityPruneFeedback = null;
    capacityPruneDialogOpen = true;
  }

  function closeCapacityPruneDialog(): void {
    if (pruneServerCapacityMutation.isPending) {
      return;
    }

    capacityPruneDialogOpen = false;
    capacityPruneConfirmation = "";
  }

  function runCapacityPrune(dryRun: boolean): void {
    if (!server || !canPreviewCapacityPrune || pruneServerCapacityMutation.isPending) {
      return;
    }

    if (!dryRun && !canApplyCapacityPrune) {
      return;
    }

    capacityPruneFeedback = null;
    pruneServerCapacityMutation.mutate({
      serverId: server.id,
      before: capacityPruneBefore.trim(),
      categories: selectedCapacityPruneCategories,
      dryRun,
    });
  }

  function refreshCapacity(): void {
    void queryClient.invalidateQueries({
      queryKey: orpc.servers.capacity.inspect.key({ input: { serverId } }),
    });
  }

  function refreshRuntimeMonitor(): void {
    void serverRuntimeUsageQuery.refetch();
    void serverRuntimeMonitoringSamplesQuery.refetch();
    void serverRuntimeMonitoringRollupQuery.refetch();
    void serverRuntimeMonitoringThresholdsQuery.refetch();
  }

  function capacityBytes(value: number | null | undefined): string {
    return formatRuntimeUsageBytes(value ?? undefined) ?? "-";
  }

  function capacityPruneCategoryLabel(category: ServerCapacityPruneCategory): string {
    switch (category) {
      case "docker-build-cache":
        return $t(i18nKeys.console.servers.capacityCategoryBuildCache);
      case "preview-workspaces":
        return $t(i18nKeys.console.servers.capacityCategoryPreviewWorkspaces);
      case "source-workspaces":
        return $t(i18nKeys.console.servers.capacityCategorySourceWorkspaces);
      case "stopped-containers":
        return $t(i18nKeys.console.servers.capacityCategoryStoppedContainers);
      case "unused-images":
        return $t(i18nKeys.console.servers.capacityCategoryUnusedImages);
      case "remote-state-markers":
        return $t(i18nKeys.console.servers.capacityCategoryRemoteStateMarkers);
    }
  }

  function capacityPruneActionLabel(
    action: PruneServerCapacityResponse["candidates"][number]["action"],
  ): string {
    switch (action) {
      case "excluded":
        return $t(i18nKeys.console.servers.capacityCandidateActionExcluded);
      case "matched":
        return $t(i18nKeys.console.servers.capacityCandidateActionMatched);
      case "pruned":
        return $t(i18nKeys.console.servers.capacityCandidateActionPruned);
      case "skipped":
        return $t(i18nKeys.console.servers.capacityCandidateActionSkipped);
    }
  }

  function capacityPruneSummary(result: PruneServerCapacityResponse): string {
    return $t(i18nKeys.console.servers.capacityPruneSummary, {
      inspected: result.summary.inspectedCount,
      matched: result.summary.matchedCount,
      pruned: result.summary.prunedCount,
      skipped: result.summary.skippedCount,
      excluded: result.summary.excludedCount,
      reclaimed: capacityBytes(result.summary.reclaimedBytes),
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

  function parseServerDetailTab(value: string | null): ServerDetailTab {
    return serverDetailTabs.includes(value as ServerDetailTab)
      ? (value as ServerDetailTab)
      : "overview";
  }

  function serverTabHref(tab: ServerDetailTab): string {
    const params = new URLSearchParams();
    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }

    const query = params.toString();
    return query ? `${page.url.pathname}?${query}` : page.url.pathname;
  }

  function selectServerTab(tab: ServerDetailTab, event: MouseEvent): void {
    event.preventDefault();
    void goto(serverTabHref(tab), { noScroll: true, keepFocus: true });
  }

  function parseServerRuntimeSection(value: string | null): ServerRuntimeSection {
    return serverRuntimeSections.includes(value as ServerRuntimeSection)
      ? (value as ServerRuntimeSection)
      : "monitor";
  }

  function parseServerSettingsSection(value: string | null): ServerSettingsSection {
    return serverSettingsSections.includes(value as ServerSettingsSection)
      ? (value as ServerSettingsSection)
      : "general";
  }

  const activeRuntimeSection = $derived(parseServerRuntimeSection(page.url.searchParams.get("section")));
  const activeSettingsSection = $derived(
    parseServerSettingsSection(page.url.searchParams.get("section")),
  );

  function serverSectionHref(tab: "runtime", section: ServerRuntimeSection): string;
  function serverSectionHref(tab: "settings", section: ServerSettingsSection): string;
  function serverSectionHref(
    tab: "runtime" | "settings",
    section: ServerRuntimeSection | ServerSettingsSection,
  ): string {
    const params = new URLSearchParams();
    params.set("tab", tab);

    if (
      (tab === "runtime" && section === "monitor") ||
      (tab === "settings" && section === "general")
    ) {
      params.delete("section");
    } else {
      params.set("section", section);
    }

    const query = params.toString();
    return `${page.url.pathname}${query ? `?${query}` : ""}`;
  }

  function selectServerRuntimeSection(section: ServerRuntimeSection, event: MouseEvent): void {
    event.preventDefault();
    void goto(serverSectionHref("runtime", section), { noScroll: true, keepFocus: true });
  }

  function selectServerSettingsSection(section: ServerSettingsSection, event: MouseEvent): void {
    event.preventDefault();
    void goto(serverSectionHref("settings", section), { noScroll: true, keepFocus: true });
  }

  function serverRuntimeSectionLabel(section: ServerRuntimeSection): string {
    switch (section) {
      case "monitor":
        return $t(i18nKeys.console.runtimeUsage.monitorTab);
      case "terminal":
        return $t(i18nKeys.console.terminal.title);
    }
  }

  function serverSettingsSectionLabel(section: ServerSettingsSection): string {
    switch (section) {
      case "general":
        return $t(i18nKeys.console.servers.settingsGeneralSection);
      case "credentials":
        return $t(i18nKeys.console.servers.credentialsTab);
      case "danger":
        return $t(i18nKeys.console.servers.dangerZoneTab);
    }
  }

  function serverTabLabel(tab: ServerDetailTab): string {
    switch (tab) {
      case "capacity":
        return $t(i18nKeys.console.servers.capacityTab);
      case "connectivity":
        return $t(i18nKeys.console.servers.connectivityTab);
      case "deployments":
        return $t(i18nKeys.common.domain.deployments);
      case "overview":
        return $t(i18nKeys.console.servers.overviewTab);
      case "runtime":
        return $t(i18nKeys.console.servers.runtimeTab);
      case "settings":
        return $t(i18nKeys.console.servers.settingsTab);
    }
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
<div class="min-h-[32rem] space-y-4 p-4" aria-hidden="true" data-server-detail-loading-skeleton>
        <div class="space-y-2">
          <Badge class="console-page-kicker" variant="outline">{$t(i18nKeys.common.domain.server)}</Badge>
          <ConsoleDataSkeleton name="detail-title" loading={true} class="block">
            {#snippet capture()}
              <h1 class="text-2xl font-semibold">Server name</h1>
            {/snippet}
            <h1 class="text-2xl font-semibold">Server name</h1>
          </ConsoleDataSkeleton>
          <ConsoleDataSkeleton name="detail-description" loading={true} class="block">
            {#snippet capture()}
              <p class="text-sm text-muted-foreground">host.example.com · ssh credential ready</p>
            {/snippet}
            <p class="text-sm text-muted-foreground">host.example.com · ssh credential ready</p>
          </ConsoleDataSkeleton>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {#each ["Provider", "Host", "Port", "Resources"] as label (label)}
            <div class="rounded-md border bg-card p-4 text-sm">
              <p class="text-xs text-muted-foreground">{label}</p>
              <p class="mt-1 font-medium">Sample value</p>
            </div>
          {/each}
        </div>
        <div class="min-h-48 rounded-md border bg-card p-4 text-sm text-muted-foreground">
          Server overview content
        </div>
      </div>
    {:else if !server}
    <section class="console-panel space-y-5 p-5">
      <Badge class="console-page-kicker" variant="outline">{$t(i18nKeys.errors.backend.notFound)}</Badge>
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
    <div class={detailPageClass}>
      <section class={detailHeaderClass}>
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge class="console-page-kicker" variant="outline">{$t(i18nKeys.common.domain.server)}</Badge>
              <Badge variant="secondary" title={server.providerKey}>
                {serverProviderDisplayLabel(server.providerKey, $t(i18nKeys.common.domain.server))}
              </Badge>
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
          </div>
        </div>
      </section>

      <Tabs.Root value={activeTab} class={detailBodyClass}>
          <ScrollArea class={detailTabsScrollAreaClass}>
            <nav
              aria-label={$t(i18nKeys.console.servers.pageTitle)}
              class={detailTabsClass}
            >
              {#each serverDetailTabs as tab (tab)}
                <a
                  href={serverTabHref(tab)}
                  class={detailTabClass}
                  aria-current={activeTab === tab ? "page" : undefined}
                  onclick={(event) => selectServerTab(tab, event)}
                >
                  {serverTabLabel(tab)}
                </a>
              {/each}
            </nav>
          </ScrollArea>

          <Tabs.Content
            value="overview"
            class={[detailTabPanelScrollClass, "space-y-5"]}
            data-server-overview-display-surface
          >
        <div class="console-metric-strip sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Network class="size-4" />
              {$t(i18nKeys.common.domain.provider)}
            </p>
            <p class="mt-2 truncate font-semibold" title={server.providerKey}>
              {serverProviderDisplayLabel(server.providerKey, $t(i18nKeys.common.domain.server))}
            </p>
          </div>
          <div>
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Server class="size-4" />
              {$t(i18nKeys.common.domain.host)}
            </p>
            <p class="mt-2 break-all font-mono text-sm font-semibold">{server.host}</p>
          </div>
          <div>
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CircleDashed class="size-4" />
              {$t(i18nKeys.common.domain.port)}
            </p>
            <p class="mt-2 font-semibold">{server.port}</p>
          </div>
          <div>
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
          <div>
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
            {#if server.edgeProxy?.status === "failed"}
              <p class="mt-2 text-xs leading-5 text-muted-foreground">
                {$t(i18nKeys.console.servers.edgeProxyFailedHint)}
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" href={serverTabHref("connectivity")}>
                  <Activity class="size-3.5" />
                  {$t(i18nKeys.console.servers.connectivityTab)}
                </Button>
              </div>
            {/if}
          </div>
        </div>

        {#if serverRollups}
          <div class="console-metric-strip sm:grid-cols-3">
            <div>
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Boxes class="size-4" />
                {$t(i18nKeys.common.domain.resources)}
              </p>
              <p class="mt-2 font-semibold">{serverRollups.resources.total}</p>
            </div>
            <div>
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Activity class="size-4" />
                {$t(i18nKeys.common.domain.deployments)}
              </p>
              <p class="mt-2 font-semibold">{serverRollups.deployments.total}</p>
            </div>
            <div>
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Globe2 class="size-4" />
                {$t(i18nKeys.common.domain.domainBindings)}
              </p>
              <p class="mt-2 font-semibold">{serverRollups.domains.total}</p>
            </div>
          </div>
        {/if}

        <section class="grid gap-4 xl:grid-cols-4" data-server-overview-operational-surfaces>
          <div class="console-subtle-panel flex min-w-0 flex-col gap-3 p-4">
            <div class="space-y-1">
              <h2 class="flex items-center gap-2 text-sm font-semibold">
                <Gauge class="size-4 text-muted-foreground" />
                {$t(i18nKeys.console.servers.runtimeSurfaceTitle)}
              </h2>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.servers.runtimeSurfaceDescription)}
              </p>
            </div>
            <div class="mt-auto flex flex-wrap gap-2">
              <Button href={serverSectionHref("runtime", "monitor")} size="sm" variant="outline">
                {$t(i18nKeys.console.runtimeUsage.monitorTab)}
              </Button>
              <Button href={serverSectionHref("runtime", "terminal")} size="sm" variant="outline">
                <Terminal class="size-3.5" />
                {$t(i18nKeys.common.actions.openTerminal)}
              </Button>
            </div>
          </div>

          <div class="console-subtle-panel flex min-w-0 flex-col gap-3 p-4">
            <div class="space-y-1">
              <h2 class="flex items-center gap-2 text-sm font-semibold">
                <Gauge class="size-4 text-muted-foreground" />
                {$t(i18nKeys.console.servers.capacitySurfaceTitle)}
              </h2>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.servers.capacitySurfaceDescription)}
              </p>
            </div>
            <Button class="mt-auto w-fit" href={serverTabHref("capacity")} size="sm" variant="outline">
              {$t(i18nKeys.console.servers.capacityTab)}
            </Button>
          </div>

          <div class="console-subtle-panel flex min-w-0 flex-col gap-3 p-4">
            <div class="space-y-1">
              <h2 class="flex items-center gap-2 text-sm font-semibold">
                <Activity class="size-4 text-muted-foreground" />
                {$t(i18nKeys.console.servers.connectivitySurfaceTitle)}
              </h2>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.servers.connectivitySurfaceDescription)}
              </p>
            </div>
            <Button class="mt-auto w-fit" href={serverTabHref("connectivity")} size="sm" variant="outline">
              {$t(i18nKeys.console.servers.connectivityTab)}
            </Button>
          </div>

          <div class="console-subtle-panel flex min-w-0 flex-col gap-3 p-4">
            <div class="space-y-1">
              <h2 class="flex items-center gap-2 text-sm font-semibold">
                <Boxes class="size-4 text-muted-foreground" />
                {$t(i18nKeys.console.servers.deploymentsSurfaceTitle)}
              </h2>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.servers.deploymentsSurfaceDescription)}
              </p>
            </div>
            <div class="mt-auto flex items-center justify-between gap-3">
              <Badge variant="outline">{relatedDeploymentCount}</Badge>
              <Button href={serverTabHref("deployments")} size="sm" variant="outline">
                {$t(i18nKeys.common.actions.openDeployments)}
              </Button>
            </div>
          </div>
        </section>

          </Tabs.Content>

          <Tabs.Content
            value="runtime"
            class={detailTabPanelSubnavClass}
          >
            <div class={[detailSubnavLayoutClass, "md:grid-cols-[13rem_minmax(0,1fr)]"]}>
              <aside class={detailSubnavClass}>
                <nav class="min-w-0" aria-label={$t(i18nKeys.console.servers.runtimeTab)}>
                  <div class={subnavListClass}>
                    {#each serverRuntimeSections as section (section)}
                      <a
                        class={[subnavItemClass, "min-h-10 text-sm"]}
                        href={serverSectionHref("runtime", section)}
                        aria-current={activeRuntimeSection === section ? "page" : undefined}
                        onclick={(event) => selectServerRuntimeSection(section, event)}
                      >
                        <span class="min-w-0 truncate">{serverRuntimeSectionLabel(section)}</span>
                      </a>
                    {/each}
                  </div>
                </nav>
              </aside>
              <div class={detailSubnavContentClass}>
                {#if activeRuntimeSection === "monitor"}
                  <RuntimeMonitorPanel
                    scope={serverRuntimeScope}
                    usage={serverRuntimeUsage}
                    loading={serverRuntimeUsageQuery.isPending}
                    error={serverRuntimeUsageError}
                    retainedSamples={serverRuntimeMonitoringSamples}
                    retainedSamplesLoading={serverRuntimeMonitoringSamplesQuery.isPending}
                    retainedSamplesError={serverRuntimeMonitoringSamplesError}
                    rollup={serverRuntimeMonitoringRollup}
                    rollupLoading={serverRuntimeMonitoringRollupQuery.isPending}
                    rollupError={serverRuntimeMonitoringRollupError}
                    thresholds={serverRuntimeMonitoringThresholds}
                    thresholdsLoading={serverRuntimeMonitoringThresholdsQuery.isPending}
                    thresholdsError={serverRuntimeMonitoringThresholdsError}
                    timeRange={runtimeMonitoringTimeRange}
                    refreshing={serverRuntimeUsageQuery.isFetching ||
                      serverRuntimeMonitoringSamplesQuery.isFetching ||
                      serverRuntimeMonitoringRollupQuery.isFetching ||
                      serverRuntimeMonitoringThresholdsQuery.isFetching}
                    onTimeRangeChange={(nextTimeRange) => {
                      runtimeMonitoringTimeRange = nextTimeRange;
                    }}
                    onRefresh={refreshRuntimeMonitor}
                    cleanupHref={serverTabHref("capacity")}
                  />
                {:else}
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
                {/if}
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content
            value="capacity"
            class={[detailTabPanelScrollClass, "space-y-5"]}
          >
        <section class="console-panel p-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <Gauge class="size-4 text-muted-foreground" />
                <h2 class="text-sm font-semibold">
                  {$t(i18nKeys.console.servers.capacityTitle)}
                </h2>
                <DocsHelpLink
                  href={webDocsHrefs.runtimeTargetCapacity}
                  ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                />
              </div>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.capacityDescription)}
              </p>
              {#if serverCapacity}
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.servers.capacityInspectedAt, {
                    time: formatTime(serverCapacity.inspectedAt),
                  })}
                </p>
              {/if}
            </div>
            <div class="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {$t(i18nKeys.console.servers.capacityDryRunBadge)}
              </Badge>
              <Button
                type="button"
                variant="outline"
                disabled={serverCapacityQuery.isPending}
                onclick={refreshCapacity}
              >
                <RefreshCw class="size-4" />
                {$t(i18nKeys.console.servers.capacityRefresh)}
              </Button>
            </div>
          </div>

          <Skeleton
            name="server-detail-capacity"
            loading={serverCapacityQuery.isPending}
            animate="pulse"
            transition
            class="mt-4"
          >
            {#snippet fallback()}
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
                {#each Array.from({ length: 4 }) as _, i (i)}
                  <div class="h-20 animate-pulse rounded-md bg-muted/50"></div>
                {/each}
              </div>
            {/snippet}
            {#snippet fixture()}
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
                {#each ["Safe reclaimable", "Stopped containers", "Unused images", "Build cache"] as label (label)}
                  <div class="rounded-md border bg-muted/15 px-3 py-2">
                    <p class="text-xs text-muted-foreground">{label}</p>
                    <p class="mt-1 text-lg font-semibold">1.2 GB</p>
                  </div>
                {/each}
              </div>
            {/snippet}
            {#if serverCapacityQuery.isPending}
              <div class="h-20" aria-hidden="true"></div>
            {:else if serverCapacityError}
            <div class="mt-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
              <p class="font-medium">{$t(i18nKeys.console.servers.capacityErrorTitle)}</p>
              <p class="mt-1">{serverCapacityError}</p>
            </div>
          {:else if serverCapacity}
            <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div class="rounded-md border bg-muted/15 px-3 py-2">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.servers.capacitySafeReclaimable)}
                </p>
                <p class="mt-1 text-lg font-semibold">
                  {capacityBytes(serverCapacity.safeReclaimableEstimate.total)}
                </p>
              </div>
              <div class="rounded-md border bg-muted/15 px-3 py-2">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.servers.capacityStoppedContainers)}
                </p>
                <p class="mt-1 text-lg font-semibold">
                  {capacityBytes(serverCapacity.safeReclaimableEstimate.stoppedContainersSize)}
                </p>
              </div>
              <div class="rounded-md border bg-muted/15 px-3 py-2">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.servers.capacityBuildCache)}
                </p>
                <p class="mt-1 text-lg font-semibold">
                  {capacityBytes(serverCapacity.safeReclaimableEstimate.oldBuildCacheSize)}
                </p>
              </div>
              <div class="rounded-md border bg-muted/15 px-3 py-2">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.resources.previewEnvironmentsTab)}
                </p>
                <p class="mt-1 text-lg font-semibold">
                  {capacityBytes(serverCapacity.safeReclaimableEstimate.oldPreviewWorkspaceCandidatesSize)}
                </p>
              </div>
            </div>

            {#if serverCapacity.warnings.length > 0}
              <div class="mt-4 rounded-md border bg-muted/15 p-3">
                <p class="text-sm font-medium">
                  {$t(i18nKeys.console.servers.capacityWarningsTitle)}
                </p>
                <div class="mt-2 space-y-2">
                  {#each serverCapacity.warnings as warning, index (index)}
                    <div class="text-sm text-muted-foreground">
                      <span class="font-medium text-foreground">{warning.code}</span>
                      {#if warning.message}
                        · {warning.message}
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
          </Skeleton>
        </section>

        <section class="console-panel p-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <ShieldAlert class="size-4 text-muted-foreground" />
                <h2 class="text-sm font-semibold">
                  {$t(i18nKeys.console.servers.capacityGovernanceTitle)}
                </h2>
              </div>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.capacityGovernanceDescription)}
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <Badge variant={capacityPruneResult?.dryRun === false ? "outline" : "secondary"}>
                {capacityPruneResult?.dryRun === false
                  ? $t(i18nKeys.console.servers.capacityCandidateActionPruned)
                  : $t(i18nKeys.console.servers.capacityDryRunBadge)}
              </Badge>
              <Button
                type="button"
                variant="outline"
                disabled={!server}
                onclick={openCapacityPruneDialog}
              >
                <ShieldAlert class="size-4" />
                {$t(i18nKeys.console.servers.capacityGovernanceAction)}
              </Button>
            </div>
          </div>

          {#if capacityPruneFeedback}
            <div
              class={[
                "mt-4 rounded-md border px-3 py-2 text-sm",
                capacityPruneFeedback.kind === "success"
                  ? "border-primary/25 bg-primary/5"
                  : "border-destructive/30 bg-destructive/5 text-destructive",
              ]}
            >
              <p class="font-medium">{capacityPruneFeedback.title}</p>
              <p class="mt-1 break-all text-xs">{capacityPruneFeedback.detail}</p>
            </div>
          {/if}

          {#if capacityPruneResult}
            <div class="mt-4 space-y-3">
              <div class="grid gap-2 sm:grid-cols-5">
                <div class="rounded-md border bg-muted/15 px-3 py-2">
                  <p class="text-xs text-muted-foreground">Inspected</p>
                  <p class="text-lg font-semibold">{capacityPruneResult.summary.inspectedCount}</p>
                </div>
                <div class="rounded-md border bg-muted/15 px-3 py-2">
                  <p class="text-xs text-muted-foreground">Matched</p>
                  <p class="text-lg font-semibold">{capacityPruneResult.summary.matchedCount}</p>
                </div>
                <div class="rounded-md border bg-muted/15 px-3 py-2">
                  <p class="text-xs text-muted-foreground">Pruned</p>
                  <p class="text-lg font-semibold">{capacityPruneResult.summary.prunedCount}</p>
                </div>
                <div class="rounded-md border bg-muted/15 px-3 py-2">
                  <p class="text-xs text-muted-foreground">Skipped</p>
                  <p class="text-lg font-semibold">{capacityPruneResult.summary.skippedCount}</p>
                </div>
                <div class="rounded-md border bg-muted/15 px-3 py-2">
                  <p class="text-xs text-muted-foreground">Reclaimed</p>
                  <p class="text-lg font-semibold">
                    {capacityBytes(capacityPruneResult.summary.reclaimedBytes)}
                  </p>
                </div>
              </div>

              <div>
                <p class="text-sm font-medium">
                  {$t(i18nKeys.console.servers.capacityCandidatesTitle)}
                </p>
                <div class="mt-2 space-y-2">
                  {#if capacityPruneResult.candidates.length > 0}
                    {#each capacityPruneResult.candidates as candidate (candidate.id)}
                      <div class="rounded-md border bg-muted/15 px-3 py-2 text-sm">
                        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div class="min-w-0">
                            <p class="break-all font-mono text-xs">{candidate.target}</p>
                            <p class="mt-1 text-xs text-muted-foreground">
                              {capacityPruneCategoryLabel(candidate.category)}
                              {#if candidate.updatedAt}
                                · {formatTime(candidate.updatedAt)}
                              {/if}
                              {#if candidate.size !== null}
                                · {capacityBytes(candidate.size)}
                              {/if}
                            </p>
                          </div>
                          <Badge variant={candidate.action === "pruned" ? "default" : "outline"}>
                            {capacityPruneActionLabel(candidate.action)}
                          </Badge>
                        </div>
                      </div>
                    {/each}
                  {:else}
                    <div class="rounded-md border border-dashed bg-muted/15 px-4 py-4 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.servers.capacityCandidatesEmpty)}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {:else}
            <div class="mt-4 rounded-md border border-dashed bg-muted/15 px-4 py-4 text-sm text-muted-foreground">
              {$t(i18nKeys.console.servers.capacityPruneDescription)}
            </div>
          {/if}
        </section>
          </Tabs.Content>

          <Tabs.Content
            value="settings"
            class={detailTabPanelSubnavClass}
            data-server-settings-display-surface
          >
            <div class={[detailSubnavLayoutClass, "md:grid-cols-[13rem_minmax(0,1fr)]"]}>
              <aside class={detailSubnavClass}>
                <nav class="min-w-0" aria-label={$t(i18nKeys.console.servers.settingsTab)}>
                  <div class={subnavListClass}>
                    {#each serverSettingsSections as section (section)}
                      <a
                        class={[subnavItemClass, "min-h-10 text-sm"]}
                        href={serverSectionHref("settings", section)}
                        aria-current={activeSettingsSection === section ? "page" : undefined}
                        onclick={(event) => selectServerSettingsSection(section, event)}
                      >
                        <span class="min-w-0 truncate">{serverSettingsSectionLabel(section)}</span>
                      </a>
                    {/each}
                  </div>
                </nav>
              </aside>
              <div class={detailSubnavContentClass}>
        {#if activeSettingsSection === "credentials"}
        {#if storedSshCredentialId}
          <div class="console-panel p-4">
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
                <div class="console-subtle-panel px-4 py-4">
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

                <div class="console-subtle-panel px-4 py-4">
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
                    <div class="console-subtle-panel mt-4 p-4">
                      <p class="text-sm font-medium">
                        {$t(i18nKeys.console.servers.credentialUsageEmptyTitle)}
                      </p>
                      <p class="mt-1 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.servers.credentialUsageEmptyBody)}
                      </p>
                    </div>
                  {:else if sshCredentialDetail.usage}
                    <div class="console-record-list mt-4">
                      {#each sshCredentialDetail.usage.servers as usageServer (usageServer.serverId)}
                        <a
                          class="console-record-row text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                          href={`/servers/${usageServer.serverId}`}
                        >
                          <span class="min-w-0">
                            <span class="block truncate font-medium">{usageServer.serverName}</span>
                            <span class="block truncate text-xs text-muted-foreground">
                              {serverProviderDisplayLabel(
                                usageServer.providerKey,
                                $t(i18nKeys.common.domain.server),
                              )} · {usageServer.host}
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
        {:else}
          <div class="console-panel p-4" data-server-settings-credential-summary>
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2">
                  <h2 class="text-sm font-semibold">
                    {$t(i18nKeys.console.servers.credentialReusableUnavailableTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.serverSshCredential}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                  />
                </div>
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.servers.credentialReusableUnavailableBody)}
                </p>
              </div>
              <Badge variant="outline">{$t(i18nKeys.common.status.notConfigured)}</Badge>
            </div>

            <dl class="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div class="console-subtle-panel px-4 py-3">
                <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {$t(i18nKeys.console.serverForm.sshCredentialTitle)}
                </dt>
                <dd class="mt-2 truncate font-medium">
                  {server.credential?.kind === "local-ssh-agent"
                    ? $t(i18nKeys.console.serverForm.localSshAgent)
                    : (server.credential?.credentialName ??
                      server.credential?.username ??
                      $t(i18nKeys.common.status.notConfigured))}
                </dd>
              </div>
              <div class="console-subtle-panel px-4 py-3">
                <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {$t(i18nKeys.console.servers.credentialDefaultUsername)}
                </dt>
                <dd class="mt-2 truncate font-medium">
                  {server.credential?.username ?? $t(i18nKeys.common.status.notConfigured)}
                </dd>
              </div>
              <div class="console-subtle-panel px-4 py-3">
                <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {$t(i18nKeys.console.servers.credentialPrivateKeyConfigured)}
                </dt>
                <dd class="mt-2">
                  <Badge variant={server.credential?.privateKeyConfigured ? "secondary" : "outline"}>
                    {server.credential?.privateKeyConfigured
                      ? $t(i18nKeys.common.status.configured)
                      : $t(i18nKeys.common.status.notConfigured)}
                  </Badge>
                </dd>
              </div>
              <div class="console-subtle-panel px-4 py-3">
                <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {$t(i18nKeys.console.servers.credentialPublicKeyConfigured)}
                </dt>
                <dd class="mt-2">
                  <Badge variant={server.credential?.publicKeyConfigured ? "secondary" : "outline"}>
                    {server.credential?.publicKeyConfigured
                      ? $t(i18nKeys.common.status.configured)
                      : $t(i18nKeys.common.status.notConfigured)}
                  </Badge>
                </dd>
              </div>
            </dl>
          </div>
        {/if}
        {:else if activeSettingsSection === "general"}
        <div class="console-panel p-4" data-server-settings-general>
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
            <Button type="button" variant="outline" onclick={openServerRenameDialog}>
              {$t(i18nKeys.common.actions.edit)}
            </Button>
          </div>

          <dl class="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div class="console-subtle-panel px-4 py-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {$t(i18nKeys.console.servers.renameLabel)}
              </dt>
              <dd class="mt-2 truncate font-medium" title={server.name}>{server.name}</dd>
            </div>
            <div class="console-subtle-panel px-4 py-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {$t(i18nKeys.console.servers.serverIdLabel)}
              </dt>
              <dd class="mt-2 truncate font-mono text-xs" title={server.id}>{server.id}</dd>
            </div>
            <div class="console-subtle-panel px-4 py-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {$t(i18nKeys.common.domain.host)}
              </dt>
              <dd class="mt-2 break-all font-mono text-xs">{server.host}:{server.port}</dd>
            </div>
            <div class="console-subtle-panel px-4 py-3">
              <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {$t(i18nKeys.common.domain.provider)}
              </dt>
              <dd class="mt-2 truncate font-medium" title={server.providerKey}>
                {serverProviderDisplayLabel(server.providerKey, $t(i18nKeys.common.domain.server))}
              </dd>
            </div>
          </dl>

          {#if settingsFeedback}
            <div
              class={`mt-4 rounded-md border p-3 text-sm ${settingsFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
            >
              <p class="font-medium">{settingsFeedback.title}</p>
              <p class="mt-1 text-muted-foreground">{settingsFeedback.detail}</p>
            </div>
          {/if}
        </div>
        {:else if activeSettingsSection === "danger"}
        <div class="space-y-4" data-server-settings-danger-display-surface>
        <div class="console-panel p-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 space-y-1">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <XCircle class="size-4" />
                {$t(i18nKeys.console.servers.lifecycleGovernanceTitle)}
              </p>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.lifecycleGovernanceDescription)}
              </p>
            </div>
            <Badge variant={server.lifecycleStatus === "active" ? "default" : "outline"}>
              {serverLifecycleLabel(server.lifecycleStatus)}
            </Badge>
          </div>

          {#if serverDeactivateFeedback}
            <div
              class={`mt-4 rounded-md border p-3 text-sm ${serverDeactivateFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
            >
              <p class="font-medium">{serverDeactivateFeedback.title}</p>
              <p class="mt-1 text-muted-foreground">{serverDeactivateFeedback.detail}</p>
            </div>
          {/if}

          <div class="mt-4 rounded-md border bg-muted/15 px-3 py-3 text-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="font-medium">{$t(i18nKeys.console.servers.deleteSafetyTitle)}</p>
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
            <p class="mt-2 text-muted-foreground">
              {#if serverDeleteSafety?.eligible}
                {$t(i18nKeys.console.servers.deleteServerReadyDescription)}
              {:else}
                {$t(i18nKeys.console.servers.deleteServerBlockedDescription)}
              {/if}
            </p>
          </div>

          <div class="mt-4 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onclick={openServerLifecycleDialog}
            >
              <ShieldAlert class="size-4" />
              {$t(i18nKeys.console.servers.lifecycleManageAction)}
            </Button>
          </div>

          {#if serverDeleteFeedback}
            <div
              class={`mt-4 rounded-md border p-3 text-sm ${serverDeleteFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
            >
              <p class="font-medium">{serverDeleteFeedback.title}</p>
              <p class="mt-1 text-muted-foreground">{serverDeleteFeedback.detail}</p>
            </div>
          {/if}
        </div>
        </div>

        {/if}
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content
            value="connectivity"
            class={detailTabPanelScrollClass}
          >
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
                <div class="flex flex-wrap items-center gap-2">
                  {#if connectivityResult}
                    <Badge variant={connectivityVariant(connectivityResult.status)}>
                      {connectivityLabel(connectivityResult.status)}
                    </Badge>
                  {/if}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={connectivityMutation.isPending}
                    onclick={testConnectivity}
                  >
                    <Activity class="size-4" />
                    {$t(i18nKeys.common.actions.testConnectivity)}
                  </Button>
                </div>
              </div>

              <div class="space-y-3">
                {#if connectivityMutation.isPending}
                  <div class="rounded-md border bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
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
                  <div class="rounded-md border bg-muted/25 px-4 py-3">
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
                    <div class="rounded-md border bg-muted/25 px-4 py-3">
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
                        <Badge variant={checkVariant(check.status)}>
                          {checkLabel(check.status)}
                        </Badge>
                      </div>
                      <p class="mt-2 text-sm leading-6 text-muted-foreground">{check.message}</p>
                      <p class="mt-2 text-xs text-muted-foreground">{check.durationMs}ms</p>
                    </div>
                  {/each}
                {:else}
                  <div class="rounded-md border bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.servers.connectivityNoResult)}
                  </div>
                {/if}
              </div>
            </section>
          </Tabs.Content>

          <Tabs.Content
            value="deployments"
            class={detailTabPanelScrollClass}
          >
            <section class="space-y-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.servers.connectedDeploymentsTitle)}
                  </h2>
                  <p class="mt-1 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.servers.connectedDeploymentsDescription)}
                  </p>
                  {#if serverRuntimeMonitoringObservationHandoff}
                    <p class="mt-2 text-xs text-muted-foreground">
                      {$t(i18nKeys.console.runtimeUsage.observationWindowHandoff, {
                        from: formatTime(serverRuntimeMonitoringObservationHandoff.from),
                        to: formatTime(serverRuntimeMonitoringObservationHandoff.to),
                        scopeKind: serverRuntimeMonitoringObservationHandoff.scope.kind,
                        scopeId: server?.id ?? "",
                      })}
                    </p>
                  {/if}
                </div>
                <Badge variant="outline">{relatedDeploymentCount}</Badge>
              </div>

              <div>
                {#if serverDeploymentsInObservationWindow.length > 0}
                  <DeploymentTable
                    deployments={serverDeploymentsInObservationWindow.slice(0, 8)}
                    {projects}
                    showEnvironment={false}
                    showServer={false}
                  />
                {:else}
                  <div class="console-subtle-panel px-4 py-6">
                    <div class="flex items-start gap-3">
                      <Server class="mt-0.5 size-4 text-muted-foreground" />
                      <div class="space-y-2">
                        <p class="text-sm font-medium">
                          {$t(i18nKeys.console.servers.noDeploymentsTitle)}
                        </p>
                        <p class="text-sm text-muted-foreground">
                          {$t(
                            serverRuntimeMonitoringObservationHandoff && serverDeployments.length > 0
                              ? i18nKeys.console.runtimeUsage.observationWindowEmpty
                              : i18nKeys.console.servers.noDeploymentsBody,
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            </section>
          </Tabs.Content>
        </Tabs.Root>
    </div>
  {/if}
</ConsoleShell>

<Dialog.Root bind:open={serverLifecycleDialogOpen} onOpenChange={(open) => {
  if (!open) {
    closeServerLifecycleDialog();
  } else {
    serverLifecycleDialogOpen = true;
  }
}}>
  {#if server}
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <form
        id="server-lifecycle-form"
        onsubmit={(event) => {
          if (selectedServerLifecycleAction === "deactivate") {
            submitServerDeactivate(event);
          } else {
            submitServerDelete(event);
          }
        }}
        data-server-lifecycle-dialog
      >
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.servers.lifecycleDialogTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.servers.lifecycleDialogDescription)}
          </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4 px-5 py-4">
          <div class="rounded-md border bg-muted/20 px-3 py-2 text-sm">
            <p class="font-medium">{server.name}</p>
            <p class="mt-1 break-all font-mono text-xs text-muted-foreground">{server.id}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.console.servers.lifecycleStatus)} · {serverLifecycleLabel(server.lifecycleStatus)}
            </p>
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={selectedServerLifecycleAction === "deactivate" ? "destructive" : "outline"}
              class="h-auto justify-start px-3 py-3 text-left"
              disabled={!canSelectServerDeactivate || deactivateServerMutation.isPending}
              onclick={() => selectServerLifecycleAction("deactivate")}
            >
              <XCircle class="size-4 shrink-0" />
              <span class="min-w-0">
                <span class="block font-medium">
                  {$t(i18nKeys.console.servers.deactivateServerAction)}
                </span>
                <span class="block text-xs font-normal opacity-80">
                  {$t(i18nKeys.console.servers.lifecycleDeactivateOption)}
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant={selectedServerLifecycleAction === "delete" ? "destructive" : "outline"}
              class="h-auto justify-start px-3 py-3 text-left"
              disabled={!canSelectServerDelete || deleteServerMutation.isPending}
              onclick={() => selectServerLifecycleAction("delete")}
            >
              <Trash2 class="size-4 shrink-0" />
              <span class="min-w-0">
                <span class="block font-medium">
                  {$t(i18nKeys.console.servers.deleteServerAction)}
                </span>
                <span class="block text-xs font-normal opacity-80">
                  {$t(i18nKeys.console.servers.lifecycleDeleteOption)}
                </span>
              </span>
            </Button>
          </div>

          {#if selectedServerLifecycleAction === "delete"}
            <div
              class={`rounded-md border p-3 text-sm ${serverDeleteSafety?.eligible ? "border-border" : "border-destructive/30 text-destructive"}`}
            >
              {#if serverDeleteSafetyQuery.isPending}
                <p class="font-medium">{$t(i18nKeys.common.status.loading)}</p>
              {:else if serverDeleteSafety?.eligible}
                <p class="font-medium">
                  {$t(i18nKeys.console.servers.deleteServerReadyDescription)}
                </p>
              {:else}
                <div class="flex items-start gap-2">
                  <TriangleAlert class="mt-0.5 size-4" />
                  <p class="font-medium">
                    {$t(i18nKeys.console.servers.deleteServerBlockedDescription)}
                  </p>
                </div>
              {/if}
            </div>
          {/if}

          {#if selectedServerLifecycleAction}
            <label class="space-y-1.5 text-sm font-medium">
              <span>
                {selectedServerLifecycleAction === "delete"
                  ? $t(i18nKeys.console.servers.deleteServerConfirmationLabel)
                  : $t(i18nKeys.console.servers.deactivateServerConfirmationLabel)}
              </span>
              <Input
                id="server-lifecycle-confirmation-input"
                bind:value={serverLifecycleConfirmation}
                autocomplete="off"
                aria-invalid={serverLifecycleConfirmation.length > 0 &&
                  serverLifecycleConfirmation.trim() !== server.id}
                placeholder={server.id}
              />
            </label>
          {/if}

          {#if serverLifecycleConfirmation.length > 0 && serverLifecycleConfirmation.trim() !== server.id}
            <p class="text-sm text-destructive">
              {selectedServerLifecycleAction === "delete"
                ? $t(i18nKeys.console.servers.deleteServerConfirmMismatch)
                : $t(i18nKeys.console.servers.deactivateServerConfirmMismatch)}
            </p>
          {/if}
        </div>

        <Dialog.Footer class="border-t p-5">
          <Button
            type="button"
            variant="outline"
            onclick={closeServerLifecycleDialog}
          >
            {$t(i18nKeys.common.actions.close)}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={!selectedServerLifecycleAction ||
              (selectedServerLifecycleAction === "deactivate"
                ? !canSubmitServerDeactivate || deactivateServerMutation.isPending
                : !canSubmitServerDelete || deleteServerMutation.isPending)}
          >
            {#if selectedServerLifecycleAction === "delete"}
              <Trash2 class="size-4" />
              {deleteServerMutation.isPending
                ? $t(i18nKeys.console.servers.deleteServerDeleting)
                : $t(i18nKeys.console.servers.deleteServerAction)}
            {:else}
              <XCircle class="size-4" />
              {deactivateServerMutation.isPending
                ? $t(i18nKeys.console.servers.deactivateServerDeactivating)
                : $t(i18nKeys.console.servers.deactivateServerAction)}
            {/if}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  {/if}
</Dialog.Root>


<Dialog.Root bind:open={capacityPruneDialogOpen} onOpenChange={(open) => {
  if (!open) {
    closeCapacityPruneDialog();
  }
}}>
  {#if server}
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-4xl">
      <form
        id="server-capacity-prune-form"
        onsubmit={(event) => {
          event.preventDefault();
          runCapacityPrune(false);
        }}
      >
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.servers.capacityPruneTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.servers.capacityPruneDescription)}
          </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-5 px-5 py-4">
          <label class="space-y-1.5 text-sm font-medium" for="server-capacity-prune-before">
            <span>{$t(i18nKeys.console.servers.capacityPruneBefore)}</span>
            <Input
              id="server-capacity-prune-before"
              bind:value={capacityPruneBefore}
              autocomplete="off"
              placeholder="2026-01-01T00:00:00.000Z"
            />
          </label>

          <fieldset class="space-y-2 text-sm">
            <legend class="font-medium">
              {$t(i18nKeys.console.servers.capacityPruneCategories)}
            </legend>
            <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {#each serverCapacityPruneCategories as category (category)}
                <label class="flex items-center gap-2 rounded-md border bg-muted/15 px-3 py-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={capacityPruneSelectedCategories[category]}
                    onchange={(event) => setCapacityPruneCategory(category, event)}
                  />
                  <span>{capacityPruneCategoryLabel(category)}</span>
                </label>
              {/each}
            </div>
          </fieldset>

          <div class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm">
            <p class="font-medium text-destructive">
              {$t(i18nKeys.console.servers.capacityConfirmApply, { serverId: server.id })}
            </p>
            <label class="mt-3 block space-y-1.5 font-medium">
              <span>{$t(i18nKeys.console.servers.deleteServerConfirmationLabel)}</span>
              <Input
                bind:value={capacityPruneConfirmation}
                autocomplete="off"
                placeholder={server.id}
                aria-invalid={capacityPruneConfirmation.length > 0 &&
                  capacityPruneConfirmation.trim() !== server.id}
              />
            </label>
            {#if capacityPruneConfirmation.length > 0 && capacityPruneConfirmation.trim() !== server.id}
              <p class="mt-2 text-sm text-destructive">
                {$t(i18nKeys.console.servers.deleteServerConfirmMismatch)}
              </p>
            {/if}
          </div>

          {#if capacityPruneFeedback}
            <div
              class={[
                "rounded-md border px-3 py-2 text-sm",
                capacityPruneFeedback.kind === "success"
                  ? "border-primary/25 bg-primary/5"
                  : "border-destructive/30 bg-destructive/5 text-destructive",
              ]}
            >
              <p class="font-medium">{capacityPruneFeedback.title}</p>
              <p class="mt-1 break-all text-xs">{capacityPruneFeedback.detail}</p>
            </div>
          {/if}
        </div>

        <Dialog.Footer class="border-t p-5">
          <Button type="button" variant="outline" onclick={closeCapacityPruneDialog}>
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canPreviewCapacityPrune || pruneServerCapacityMutation.isPending}
            onclick={() => runCapacityPrune(true)}
          >
            <RefreshCw class="size-4" />
            {$t(i18nKeys.console.servers.capacityPreviewAction)}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={!canApplyCapacityPrune || pruneServerCapacityMutation.isPending}
          >
            <Trash2 class="size-4" />
            {$t(i18nKeys.console.servers.capacityApplyAction)}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  {/if}
</Dialog.Root>

<Dialog.Root bind:open={serverRenameDialogOpen} onOpenChange={(open) => {
  if (open) {
    openServerRenameDialog();
  } else {
    closeServerRenameDialog();
  }
}}>
  {#if server}
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <form id="server-rename-dialog-form" onsubmit={renameServer}>
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.servers.renameDialogTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.servers.renameDialogDescription)}
          </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4 px-5 py-4">
          <label class="space-y-1.5 text-sm font-medium">
            <span>{$t(i18nKeys.console.servers.renameLabel)}</span>
            <Input id="server-display-name-input" bind:value={serverName} autocomplete="off" />
          </label>
        </div>

        <Dialog.Footer class="border-t p-5">
          <Button type="button" variant="outline" onclick={closeServerRenameDialog}>
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button type="submit" disabled={!canRenameServer || renameServerMutation.isPending}>
            {renameServerMutation.isPending
              ? $t(i18nKeys.common.actions.saving)
              : $t(i18nKeys.common.actions.save)}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  {/if}
</Dialog.Root>

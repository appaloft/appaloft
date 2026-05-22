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
    Save,
    Server,
    ShieldAlert,
    Terminal,
    Trash2,
    TriangleAlert,
    XCircle,
  } from "@lucide/svelte";
  import type {
    ConfigureDefaultAccessDomainPolicyInput,
    ConfigureServerEdgeProxyInput,
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
  import { configureServerEdgeProxyInputSchema } from "@appaloft/contracts";

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
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
  import { toDefaultAccessPolicyFormState } from "$lib/console/default-access-policy-form";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import {
    runtimeMonitoringRollupQueryOptions,
    runtimeMonitoringSamplesQueryOptions,
    runtimeMonitoringThresholdsQueryOptions,
    runtimeUsageQueryOptions,
  } from "$lib/console/runtime-usage-query";
  import {
    formatRuntimeUsageBytes,
    runtimeMonitoringDeploymentInObservationWindow,
    runtimeMonitoringObservationHandoffFromSearchParams,
    runtimeMonitoringObservationHandoffMatchesScope,
  } from "$lib/console/runtime-usage";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const serverId = $derived(page.params.serverId ?? "");
  type ServerDetailTab =
    | "overview"
    | "monitor"
    | "capacity"
    | "connectivity"
    | "credentials"
    | "proxy-access"
    | "deployments"
    | "terminal"
    | "danger";
  const serverDetailTabs = [
    "overview",
    "monitor",
    "capacity",
    "connectivity",
    "credentials",
    "proxy-access",
    "deployments",
    "terminal",
    "danger",
  ] as const;
  const serverDetailListLimit = 100;
  const projectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects", { limit: serverDetailListLimit }],
      queryFn: () => orpcClient.projects.list({ limit: serverDetailListLimit }),
      enabled: browser,
    }),
  );
  const deploymentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deployments", { limit: serverDetailListLimit }],
      queryFn: () => orpcClient.deployments.list({ limit: serverDetailListLimit }),
      enabled: browser,
    }),
  );
  const serverDetailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers", "show", serverId],
      queryFn: () =>
        orpcClient.servers.show({
          serverId,
          includeRollups: true,
        }),
      enabled: browser && serverId.length > 0,
      staleTime: 5_000,
    }),
  );
  const serverDeleteSafetyQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers", "delete-check", serverId],
      queryFn: () =>
        orpcClient.servers.deleteCheck({
          serverId,
        }),
      enabled: browser && serverId.length > 0,
      staleTime: 5_000,
    }),
  );
  const defaultAccessOverridePolicyQuery = createQuery(() =>
    queryOptions({
      queryKey: ["default-access-domain-policies", "show", "deployment-target", serverId],
      queryFn: () =>
        orpcClient.defaultAccessDomainPolicies.show({
          scopeKind: "deployment-target",
          serverId,
        }),
      enabled: browser && serverId.length > 0,
      staleTime: 5_000,
    }),
  );
  const serverRuntimeScope = $derived({
    kind: "server" as const,
    serverId,
  });
  const serverRuntimeUsageQuery = createQuery(() =>
    runtimeUsageQueryOptions(serverRuntimeScope, browser && serverId.length > 0),
  );
  const serverRuntimeMonitoringSamplesQuery = createQuery(() =>
    runtimeMonitoringSamplesQueryOptions(serverRuntimeScope, browser && serverId.length > 0),
  );
  const serverRuntimeMonitoringRollupQuery = createQuery(() =>
    runtimeMonitoringRollupQueryOptions(serverRuntimeScope, browser && serverId.length > 0),
  );
  const serverRuntimeMonitoringThresholdsQuery = createQuery(() =>
    runtimeMonitoringThresholdsQueryOptions(serverRuntimeScope, browser && serverId.length > 0),
  );
  const serverCapacityQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers", "capacity", "inspect", serverId],
      queryFn: () =>
        orpcClient.servers.capacity.inspect({
          serverId,
        }),
      enabled: browser && serverId.length > 0,
      staleTime: 5_000,
    }),
  );
  const projects = $derived(projectsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      deploymentsQuery.isPending ||
      serverDetailQuery.isPending ||
      defaultAccessOverridePolicyQuery.isPending,
  );
  const serverDetail = $derived(serverDetailQuery.data ?? null);
  const server = $derived(serverDetail?.server ?? null);
  const storedSshCredentialId = $derived(
    server?.credential?.kind === "ssh-private-key" ? (server.credential.credentialId ?? "") : "",
  );
  const sshCredentialDetailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["credentials", "ssh", "show", storedSshCredentialId],
      queryFn: () =>
        orpcClient.credentials.ssh.show({
          credentialId: storedSshCredentialId,
          includeUsage: true,
        }),
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
  const activeTab = $derived(parseServerDetailTab(page.url.searchParams.get("tab")));
  const defaultAccessModes = ["disabled", "provider", "custom-template"] as const;
  const edgeProxyKindOptions = configureServerEdgeProxyInputSchema.shape.proxyKind.options;

  let connectivityResult = $state<TestServerConnectivityResponse | null>(null);
  let connectivityError = $state("");
  let overrideMode = $state<ConfigureDefaultAccessDomainPolicyInput["mode"]>("provider");
  let overrideProviderKey = $state("sslip");
  let overrideTemplateRef = $state("");
  let overridePolicyReadbackSource = $state("");
  let serverFormServerId = $state("");
  let serverName = $state("");
  let serverDeactivateDialogOpen = $state(false);
  let serverDeactivateConfirmation = $state("");
  let serverDeleteDialogOpen = $state(false);
  let serverDeleteConfirmation = $state("");
  let edgeProxyKind = $state<ConfigureServerEdgeProxyInput["proxyKind"]>("none");
  let settingsFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let edgeProxyFeedback = $state<{
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
  let capacityPruneResult = $state<PruneServerCapacityResponse | null>(null);
  let capacityPruneFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let overrideFeedback = $state<{
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
  const canConfigureEdgeProxy = $derived(
    Boolean(server) &&
      server?.lifecycleStatus === "active" &&
      edgeProxyKind !== (server?.edgeProxy?.kind ?? "none"),
  );
  const canOpenServerDeleteDialog = $derived(
    Boolean(server) && Boolean(serverDeleteSafety?.eligible) && !serverDeleteSafetyQuery.isPending,
  );
  const canOpenServerDeactivateDialog = $derived(server?.lifecycleStatus === "active");
  const canSubmitServerDeactivate = $derived(
    Boolean(server) &&
      server?.lifecycleStatus === "active" &&
      serverDeactivateConfirmation.trim() === server?.id,
  );
  const canSubmitServerDelete = $derived(
    Boolean(server) &&
      Boolean(serverDeleteSafety?.eligible) &&
      serverDeleteConfirmation.trim() === server?.id,
  );
  const selectedCapacityPruneCategories = $derived(
    serverCapacityPruneCategories.filter((category) => capacityPruneSelectedCategories[category]),
  );
  const canPreviewCapacityPrune = $derived(
    Boolean(server) &&
      capacityPruneBefore.trim().length > 0 &&
      selectedCapacityPruneCategories.length > 0,
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
  const configureDefaultAccessOverrideMutation = createMutation(() => ({
    mutationFn: (input: ConfigureDefaultAccessDomainPolicyInput) =>
      orpcClient.defaultAccessDomainPolicies.configure(input),
    onSuccess: (result) => {
      overrideFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.defaultAccessSaveSuccessTitle),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["default-access-domain-policies"] });
    },
    onError: (error) => {
      overrideFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.defaultAccessSaveErrorTitle),
        detail: readErrorMessage(error),
      };
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
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      void queryClient.invalidateQueries({ queryKey: ["servers", "show", result.id] });
    },
    onError: (error) => {
      settingsFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.renameFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const configureEdgeProxyMutation = createMutation(() => ({
    mutationFn: (input: ConfigureServerEdgeProxyInput) =>
      orpcClient.servers.configureEdgeProxy(input),
    onSuccess: (result) => {
      edgeProxyKind = result.edgeProxy.kind;
      edgeProxyFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.edgeProxyConfigured),
        detail: `${result.edgeProxy.kind} · ${edgeProxyStatusLabel(result.edgeProxy.status)}`,
      };
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      void queryClient.invalidateQueries({ queryKey: ["servers", "show", result.id] });
    },
    onError: (error) => {
      edgeProxyFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.edgeProxyConfigureFailed),
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
      serverDeactivateDialogOpen = false;
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      void queryClient.invalidateQueries({ queryKey: ["servers", "show", result.id] });
      void queryClient.invalidateQueries({ queryKey: ["servers", "delete-check", result.id] });
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
      serverDeleteDialogOpen = false;
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      void queryClient.invalidateQueries({ queryKey: ["servers", "show", result.id] });
      void queryClient.invalidateQueries({ queryKey: ["servers", "delete-check", result.id] });
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
    edgeProxyKind = server.edgeProxy?.kind ?? "none";
    settingsFeedback = null;
    edgeProxyFeedback = null;
    serverDeactivateFeedback = null;
    serverDeactivateConfirmation = "";
    serverDeactivateDialogOpen = false;
    serverDeleteFeedback = null;
    serverDeleteConfirmation = "";
    serverDeleteDialogOpen = false;
    capacityPruneBefore = new Date().toISOString();
    capacityPruneObservationHandoffKey = "";
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
    capacityPruneResult = null;
    capacityPruneFeedback = null;
  });

  $effect(() => {
    const readback = defaultAccessOverridePolicyQuery.data;
    if (!readback || !serverId) {
      return;
    }

    const policy = readback.policy;
    const source = policy ? `${serverId}:${policy.id}:${policy.updatedAt}` : `${serverId}:none`;
    if (overridePolicyReadbackSource === source) {
      return;
    }

    const formState = toDefaultAccessPolicyFormState(policy);
    overrideMode = formState.mode;
    overrideProviderKey = formState.providerKey;
    overrideTemplateRef = formState.templateRef;
    overridePolicyReadbackSource = source;
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

  function configureEdgeProxy(event: SubmitEvent): void {
    event.preventDefault();

    if (!server || !canConfigureEdgeProxy || configureEdgeProxyMutation.isPending) {
      return;
    }

    edgeProxyFeedback = null;
    configureEdgeProxyMutation.mutate({
      serverId: server.id,
      proxyKind: edgeProxyKind,
    });
  }

  function saveDefaultAccessOverride(event: SubmitEvent): void {
    event.preventDefault();

    if (!server) {
      return;
    }

    configureDefaultAccessOverrideMutation.mutate({
      scope: {
        kind: "deployment-target",
        serverId: server.id,
      },
      mode: overrideMode,
      ...(overrideMode !== "disabled" && overrideProviderKey.trim()
        ? { providerKey: overrideProviderKey.trim() }
        : {}),
      ...(overrideMode === "custom-template" && overrideTemplateRef.trim()
        ? { templateRef: overrideTemplateRef.trim() }
        : {}),
    });
  }

  function openServerDeleteDialog(): void {
    if (!server || !canOpenServerDeleteDialog) {
      return;
    }

    serverDeleteConfirmation = "";
    serverDeleteFeedback = null;
    serverDeleteDialogOpen = true;
  }

  function openServerDeactivateDialog(): void {
    if (!server || !canOpenServerDeactivateDialog) {
      return;
    }

    serverDeactivateConfirmation = "";
    serverDeactivateFeedback = null;
    serverDeactivateDialogOpen = true;
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
        serverId: serverDeleteConfirmation.trim(),
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

  function runCapacityPrune(dryRun: boolean): void {
    if (!server || !canPreviewCapacityPrune || pruneServerCapacityMutation.isPending) {
      return;
    }

    if (
      !dryRun &&
      !window.confirm($t(i18nKeys.console.servers.capacityConfirmApply, { serverId: server.id }))
    ) {
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
    void queryClient.invalidateQueries({ queryKey: ["servers", "capacity", "inspect", serverId] });
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
    const params = new URLSearchParams(page.url.searchParams);
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

  function serverTabLabel(tab: ServerDetailTab): string {
    switch (tab) {
      case "capacity":
        return $t(i18nKeys.console.servers.capacityTab);
      case "connectivity":
        return $t(i18nKeys.console.servers.connectivityTab);
      case "credentials":
        return $t(i18nKeys.console.servers.credentialsTab);
      case "danger":
        return $t(i18nKeys.console.servers.dangerZoneTab);
      case "deployments":
        return $t(i18nKeys.common.domain.deployments);
      case "monitor":
        return $t(i18nKeys.console.runtimeUsage.monitorTab);
      case "overview":
        return $t(i18nKeys.console.servers.overviewTab);
      case "proxy-access":
        return $t(i18nKeys.console.servers.proxyAccessTab);
      case "terminal":
        return $t(i18nKeys.console.terminal.title);
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
    <div class="space-y-5">
      <Skeleton class="h-36 w-full" />
      <div class="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Skeleton class="h-72 w-full" />
        <Skeleton class="h-72 w-full" />
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
    <div class="space-y-8">
      <section class="space-y-6">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge class="console-page-kicker" variant="outline">{$t(i18nKeys.common.domain.server)}</Badge>
              <Badge variant="secondary">{server.providerKey}</Badge>
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
            <Button onclick={testConnectivity} disabled={connectivityMutation.isPending}>
              <Activity class="size-4" />
              {$t(i18nKeys.common.actions.testConnectivity)}
            </Button>
            <Button href={serverTabHref("terminal")} variant="outline">
              <Terminal class="size-4" />
              {$t(i18nKeys.common.actions.openTerminal)}
            </Button>
          </div>
        </div>

        <Tabs.Root value={activeTab} class="space-y-5">
          <Tabs.List
            class="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b bg-transparent p-0"
          >
            {#each serverDetailTabs as tab (tab)}
              <Tabs.Trigger
                value={tab}
                class="h-11 flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 py-0 shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                onclick={(event) => selectServerTab(tab, event)}
              >
                {serverTabLabel(tab)}
              </Tabs.Trigger>
            {/each}
          </Tabs.List>

          <Tabs.Content value="overview" class="mt-0 space-y-5">
        <div class="console-metric-strip sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Network class="size-4" />
              {$t(i18nKeys.common.domain.provider)}
            </p>
            <p class="mt-2 truncate font-semibold">{server.providerKey}</p>
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

          </Tabs.Content>

          <Tabs.Content value="monitor" class="mt-0">
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
          eventsHref={serverTabHref("deployments")}
          capacityHref={serverTabHref("capacity")}
        />
          </Tabs.Content>

          <Tabs.Content value="capacity" class="mt-0 space-y-5">
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

          {#if serverCapacityQuery.isPending}
            <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Skeleton class="h-20 w-full" />
              <Skeleton class="h-20 w-full" />
              <Skeleton class="h-20 w-full" />
              <Skeleton class="h-20 w-full" />
            </div>
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
        </section>

        <section class="console-panel p-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <Trash2 class="size-4 text-muted-foreground" />
                <h2 class="text-sm font-semibold">
                  {$t(i18nKeys.console.servers.capacityPruneTitle)}
                </h2>
              </div>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.capacityPruneDescription)}
              </p>
            </div>
            <Badge variant={capacityPruneResult?.dryRun === false ? "destructive" : "secondary"}>
              {capacityPruneResult?.dryRun === false
                ? $t(i18nKeys.console.servers.capacityCandidateActionPruned)
                : $t(i18nKeys.console.servers.capacityDryRunBadge)}
            </Badge>
          </div>

          <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
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
              <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
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
          </div>

          <div class="mt-4 flex flex-wrap justify-end gap-2">
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
              type="button"
              variant="outline"
              disabled={!canPreviewCapacityPrune || pruneServerCapacityMutation.isPending}
              onclick={() => runCapacityPrune(false)}
            >
              <Trash2 class="size-4" />
              {$t(i18nKeys.console.servers.capacityApplyAction)}
            </Button>
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
          {/if}
        </section>
          </Tabs.Content>

          <Tabs.Content value="credentials" class="mt-0">
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
                              {usageServer.providerKey} · {usageServer.host}
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
        {/if}
        <div class="console-panel p-4">
          <form
            id="server-rename-form"
            class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)_auto]"
            onsubmit={renameServer}
          >
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

            <label class="space-y-1.5 text-sm font-medium">
              <span>{$t(i18nKeys.console.servers.renameLabel)}</span>
              <Input id="server-display-name-input" bind:value={serverName} autocomplete="off" />
            </label>

            <div class="flex items-end">
              <Button
                type="submit"
                class="w-full sm:w-auto"
                disabled={!canRenameServer || renameServerMutation.isPending}
              >
                <Save class="size-4" />
                {renameServerMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.common.actions.save)}
              </Button>
            </div>
          </form>

          {#if settingsFeedback}
            <div
              class={`mt-4 rounded-md border p-3 text-sm ${settingsFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
            >
              <p class="font-medium">{settingsFeedback.title}</p>
              <p class="mt-1 text-muted-foreground">{settingsFeedback.detail}</p>
            </div>
          {/if}
        </div>
          </Tabs.Content>

          <Tabs.Content value="proxy-access" class="mt-0 space-y-5">
        <div class="console-panel p-4">
          <form
            id="server-edge-proxy-form"
            class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)_auto]"
            onsubmit={configureEdgeProxy}
          >
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold">
                  {$t(i18nKeys.console.servers.edgeProxyKindLabel)}
                </h2>
                <DocsHelpLink
                  href={webDocsHrefs.serverProxyReadiness}
                  ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                />
              </div>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.edgeProxyDescription)}
              </p>
            </div>

            <fieldset class="space-y-1.5 text-sm font-medium">
              <span>{$t(i18nKeys.console.servers.edgeProxyKindLabel)}</span>
              <div
                class="grid min-h-8 grid-cols-3 overflow-hidden rounded-lg border bg-background"
                aria-label={$t(i18nKeys.console.servers.edgeProxyKindLabel)}
              >
                {#each edgeProxyKindOptions as kind (kind)}
                  <Button
                    type="button"
                    size="sm"
                    variant={edgeProxyKind === kind ? "selected" : "ghost"}
                    class="h-8 rounded-none border-0"
                    disabled={server.lifecycleStatus !== "active" || configureEdgeProxyMutation.isPending}
                    onclick={() => {
                      edgeProxyKind = kind;
                    }}
                  >
                    {kind}
                  </Button>
                {/each}
              </div>
            </fieldset>

            <div class="flex items-end">
              <Button
                type="submit"
                class="w-full sm:w-auto"
                disabled={!canConfigureEdgeProxy || configureEdgeProxyMutation.isPending}
              >
                <Save class="size-4" />
                {configureEdgeProxyMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.common.actions.save)}
              </Button>
            </div>
          </form>

          {#if edgeProxyFeedback}
            <div
              class={`mt-4 rounded-md border p-3 text-sm ${edgeProxyFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
            >
              <p class="font-medium">{edgeProxyFeedback.title}</p>
              <p class="mt-1 text-muted-foreground">{edgeProxyFeedback.detail}</p>
            </div>
          {/if}
        </div>

      <section class="console-panel space-y-4 p-5">
        <div class="max-w-3xl space-y-1">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">
              {$t(i18nKeys.console.servers.defaultAccessOverrideTitle)}
            </h2>
            <DocsHelpLink
              href={webDocsHrefs.defaultAccessPolicy}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.servers.defaultAccessOverrideDescription)}
          </p>
        </div>

        <form
          id="server-default-access-override-form"
          class="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]"
          onsubmit={saveDefaultAccessOverride}
        >
          <label class="space-y-1.5 text-sm font-medium">
            <span class="inline-flex items-center gap-1.5">
              {$t(i18nKeys.console.servers.defaultAccessModeLabel)}
              <DocsHelpLink
                href={webDocsHrefs.defaultAccessPolicy}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                className="size-5"
              />
            </span>
            <Select.Root bind:value={overrideMode} type="single">
              <Select.Trigger class="w-full">
                {overrideMode === "disabled"
                  ? $t(i18nKeys.console.servers.defaultAccessDisabledOption)
                  : overrideMode === "custom-template"
                    ? $t(i18nKeys.console.servers.defaultAccessCustomTemplateOption)
                    : $t(i18nKeys.console.servers.defaultAccessProviderOption)}
              </Select.Trigger>
              <Select.Content>
                {#each defaultAccessModes as mode (mode)}
                  <Select.Item value={mode}>
                    {mode === "disabled"
                      ? $t(i18nKeys.console.servers.defaultAccessDisabledOption)
                      : mode === "custom-template"
                        ? $t(i18nKeys.console.servers.defaultAccessCustomTemplateOption)
                        : $t(i18nKeys.console.servers.defaultAccessProviderOption)}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>

          <div class="grid gap-4 md:grid-cols-2">
            {#if overrideMode !== "disabled"}
              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.console.servers.defaultAccessProviderKeyLabel)}
                  <DocsHelpLink
                    href={webDocsHrefs.defaultAccessPolicy}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input
                  id="server-default-access-provider-key-input"
                  bind:value={overrideProviderKey}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.servers.defaultAccessProviderKeyPlaceholder)}
                />
              </label>
            {/if}

            {#if overrideMode === "custom-template"}
              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.console.servers.defaultAccessTemplateRefLabel)}
                  <DocsHelpLink
                    href={webDocsHrefs.defaultAccessPolicy}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input
                  id="server-default-access-template-ref-input"
                  bind:value={overrideTemplateRef}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.servers.defaultAccessTemplateRefPlaceholder)}
                />
              </label>
            {/if}
          </div>

          <div class="flex items-end">
            <Button
              class="w-full sm:w-auto"
              disabled={configureDefaultAccessOverrideMutation.isPending}
              type="submit"
            >
              {configureDefaultAccessOverrideMutation.isPending
                ? $t(i18nKeys.common.actions.saving)
                : $t(i18nKeys.common.actions.save)}
            </Button>
          </div>
        </form>

        {#if overrideFeedback}
          <div
            class={`rounded-md border p-3 text-sm ${overrideFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
          >
            <p class="font-medium">{overrideFeedback.title}</p>
            <p class="mt-1 text-muted-foreground">{overrideFeedback.detail}</p>
          </div>
        {/if}
      </section>
          </Tabs.Content>

          <Tabs.Content value="danger" class="mt-0">
        <div class="space-y-4">
        <div class="console-panel p-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 space-y-1">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <XCircle class="size-4" />
                {$t(i18nKeys.console.servers.deactivateServerTitle)}
              </p>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.deactivateServerDescription)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!canOpenServerDeactivateDialog}
              onclick={openServerDeactivateDialog}
              aria-label={server
                ? $t(i18nKeys.console.servers.deactivateServerActionAria, { name: server.name })
                : $t(i18nKeys.console.servers.deactivateServerAction)}
            >
              <XCircle class="size-4" />
              {$t(i18nKeys.console.servers.deactivateServerAction)}
            </Button>
          </div>

          {#if serverDeactivateFeedback}
            <div
              class={`mt-4 rounded-md border p-3 text-sm ${serverDeactivateFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
            >
              <p class="font-medium">{serverDeactivateFeedback.title}</p>
              <p class="mt-1 text-muted-foreground">{serverDeactivateFeedback.detail}</p>
            </div>
          {/if}
        </div>

        <div class="console-panel p-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 space-y-1">
              <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ShieldAlert class="size-4" />
                {$t(i18nKeys.console.servers.deleteSafetyTitle)}
              </p>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.deleteSafetyDescription)}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
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
          </div>

          <div class="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0 text-sm text-muted-foreground">
              {#if serverDeleteSafety?.eligible}
                {$t(i18nKeys.console.servers.deleteServerReadyDescription)}
              {:else}
                {$t(i18nKeys.console.servers.deleteServerBlockedDescription)}
              {/if}
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={!canOpenServerDeleteDialog}
              onclick={openServerDeleteDialog}
              aria-label={server
                ? $t(i18nKeys.console.servers.deleteServerActionAria, { name: server.name })
                : $t(i18nKeys.console.servers.deleteServerAction)}
            >
              <Trash2 class="size-4" />
              {$t(i18nKeys.console.servers.deleteServerAction)}
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

        <Dialog.Root bind:open={serverDeactivateDialogOpen}>
          {#if server}
            <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
              <form id="server-deactivate-form" onsubmit={submitServerDeactivate}>
                <Dialog.Header>
                  <Dialog.Title>
                    {$t(i18nKeys.console.servers.deactivateServerDialogTitle)}
                  </Dialog.Title>
                  <Dialog.Description>
                    {$t(i18nKeys.console.servers.deactivateServerDialogDescription, {
                      id: server.id,
                    })}
                  </Dialog.Description>
                </Dialog.Header>

                <div class="space-y-4 px-5 py-4">
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>
                      {$t(i18nKeys.console.servers.deactivateServerConfirmationLabel)}
                    </span>
                    <Input
                      id="server-deactivate-confirmation-input"
                      bind:value={serverDeactivateConfirmation}
                      autocomplete="off"
                      aria-invalid={serverDeactivateConfirmation.length > 0 &&
                        serverDeactivateConfirmation.trim() !== server.id}
                      placeholder={server.id}
                    />
                  </label>

                  {#if serverDeactivateConfirmation.length > 0 && serverDeactivateConfirmation.trim() !== server.id}
                    <p class="text-sm text-destructive">
                      {$t(i18nKeys.console.servers.deactivateServerConfirmMismatch)}
                    </p>
                  {/if}
                </div>

                <Dialog.Footer class="border-t p-5">
                  <Button
                    type="button"
                    variant="outline"
                    onclick={() => {
                      serverDeactivateDialogOpen = false;
                    }}
                  >
                    {$t(i18nKeys.common.actions.close)}
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={!canSubmitServerDeactivate || deactivateServerMutation.isPending}
                  >
                    <XCircle class="size-4" />
                    {deactivateServerMutation.isPending
                      ? $t(i18nKeys.console.servers.deactivateServerDeactivating)
                      : $t(i18nKeys.console.servers.deactivateServerAction)}
                  </Button>
                </Dialog.Footer>
              </form>
            </Dialog.Content>
          {/if}
        </Dialog.Root>

        <Dialog.Root bind:open={serverDeleteDialogOpen}>
          {#if server}
            <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
              <form id="server-delete-form" onsubmit={submitServerDelete}>
                <Dialog.Header>
                  <Dialog.Title>
                    {$t(i18nKeys.console.servers.deleteServerDialogTitle)}
                  </Dialog.Title>
                  <Dialog.Description>
                    {$t(i18nKeys.console.servers.deleteServerDialogDescription, {
                      id: server.id,
                    })}
                  </Dialog.Description>
                </Dialog.Header>

                <div class="space-y-4 px-5 py-4">
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

                  <label class="space-y-1.5 text-sm font-medium">
                    <span>
                      {$t(i18nKeys.console.servers.deleteServerConfirmationLabel)}
                    </span>
                    <Input
                      id="server-delete-confirmation-input"
                      bind:value={serverDeleteConfirmation}
                      autocomplete="off"
                      aria-invalid={serverDeleteConfirmation.length > 0 &&
                        serverDeleteConfirmation.trim() !== server.id}
                      placeholder={server.id}
                    />
                  </label>

                  {#if serverDeleteConfirmation.length > 0 && serverDeleteConfirmation.trim() !== server.id}
                    <p class="text-sm text-destructive">
                      {$t(i18nKeys.console.servers.deleteServerConfirmMismatch)}
                    </p>
                  {/if}
                </div>

                <Dialog.Footer class="border-t p-5">
                  <Button
                    type="button"
                    variant="outline"
                    onclick={() => {
                      serverDeleteDialogOpen = false;
                    }}
                  >
                    {$t(i18nKeys.common.actions.close)}
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={!canSubmitServerDelete || deleteServerMutation.isPending}
                  >
                    <Trash2 class="size-4" />
                    {deleteServerMutation.isPending
                      ? $t(i18nKeys.console.servers.deleteServerDeleting)
                      : $t(i18nKeys.console.servers.deleteServerAction)}
                  </Button>
                </Dialog.Footer>
              </form>
            </Dialog.Content>
          {/if}
        </Dialog.Root>
          </Tabs.Content>

          <Tabs.Content value="connectivity" class="mt-0">
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
                {#if connectivityResult}
                  <Badge variant={connectivityVariant(connectivityResult.status)}>
                    {connectivityLabel(connectivityResult.status)}
                  </Badge>
                {/if}
              </div>

              <div class="space-y-3">
                {#if connectivityMutation.isPending}
                  <div class="bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
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
                  <div class="bg-muted/25 px-4 py-3">
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
                    <div class="bg-muted/25 px-4 py-3">
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
                  <div class="bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.servers.connectivityNoResult)}
                  </div>
                {/if}
              </div>
            </section>
          </Tabs.Content>

          <Tabs.Content value="deployments" class="mt-0">
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

          <Tabs.Content value="terminal" class="mt-0">
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
          </Tabs.Content>
        </Tabs.Root>
      </section>
    </div>
  {/if}
</ConsoleShell>

<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onDestroy, untrack } from "svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import {
    ArrowLeft,
    Archive,
    Check,
    Clipboard,
    Copy,
    Globe2,
    Link2,
    Plus,
    RefreshCw,
    Route,
    Terminal,
    Trash2,
  } from "@lucide/svelte";
  import type {
    ArchiveResourceInput,
    ConfigureResourceHealthInput,
    ConfigureResourceNetworkInput,
    ConfigureResourceRuntimeInput,
    ConfigureResourceSourceInput,
    ConfirmDomainBindingOwnershipInput,
    CreateDomainBindingInput,
    DeleteResourceInput,
    DomainBindingSummary,
    ProxyConfigurationView,
    ResourceDetail,
    ResourceHealthOverall,
    ResourceRuntimeLogEvent,
    ResourceRuntimeLogLine,
    ResourceSummary,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import ResourceProfileSummary from "$lib/components/console/ResourceProfileSummary.svelte";
  import ResourceStatusDot from "$lib/components/console/ResourceStatusDot.svelte";
  import TerminalSessionPanel from "$lib/components/console/TerminalSessionPanel.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Popover from "$lib/components/ui/popover";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Textarea } from "$lib/components/ui/textarea";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    findEnvironment,
    findProject,
    findServer,
    formatTime,
    projectDetailHref,
    resourceNewDeploymentHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type RuntimeLogClientStream = {
    next(): Promise<IteratorResult<ResourceRuntimeLogEvent, unknown>>;
    return?: () => Promise<IteratorResult<ResourceRuntimeLogEvent, unknown>>;
  };
  type AppaloftDesktopBridge = {
    copyText?: (text: string) => Promise<void>;
  };
  type WindowWithAppaloftDesktopBridge = Window &
    typeof globalThis & {
      appaloftDesktop?: AppaloftDesktopBridge;
    };
  type ResourceDetailTab = "settings" | "deployments" | "logs" | "terminal";
  type ResourceAccessSummary = NonNullable<ResourceSummary["accessSummary"]>;
  type ResourceAccessRoute =
    | NonNullable<ResourceAccessSummary["latestGeneratedAccessRoute"]>
    | NonNullable<ResourceAccessSummary["plannedGeneratedAccessRoute"]>
    | NonNullable<ResourceAccessSummary["latestDurableDomainRoute"]>;
  type ResourceAccessKind =
    | "domain-binding"
    | "durable-domain"
    | "generated-latest"
    | "generated-planned";
  type ResourceAccessStatus = NonNullable<ResourceAccessSummary["proxyRouteStatus"]>;
  type ResourceHealthViewStatus = ResourceHealthOverall | "loading";
  type HealthCheckHttpInput = NonNullable<ConfigureResourceHealthInput["healthCheck"]["http"]>;
  type HealthCheckMethod = HealthCheckHttpInput["method"];
  type HealthCheckScheme = HealthCheckHttpInput["scheme"];
  type NetworkProfileInput = ConfigureResourceNetworkInput["networkProfile"];
  type NetworkProtocol = NetworkProfileInput["upstreamProtocol"];
  type NetworkExposureMode = NetworkProfileInput["exposureMode"];
  type RuntimeProfileInput = ConfigureResourceRuntimeInput["runtimeProfile"];
  type RuntimePlanStrategy = NonNullable<RuntimeProfileInput["strategy"]>;
  type SourceProfileInput = ConfigureResourceSourceInput["source"];
  type SourceKind = SourceProfileInput["kind"];
  type DomainRouteMode = "serve" | "redirect";
  type RedirectStatusText = "301" | "302" | "307" | "308";
  type ResourceSettingsSection = "profile" | "domains" | "health" | "proxy" | "diagnostics";
  const resourceDetailTabs = ["settings", "deployments", "logs", "terminal"] as const;
  const resourceSettingsSections = [
    "profile",
    "domains",
    "health",
    "proxy",
    "diagnostics",
  ] as const;

  const {
    projectsQuery,
    environmentsQuery,
    resourcesQuery,
    serversQuery,
    deploymentsQuery,
    domainBindingsQuery,
  } = createConsoleQueries(browser);
  const resourceId = $derived(page.params.resourceId ?? "");
  const resourceDetailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resources", "show", resourceId],
      queryFn: () =>
        orpcClient.resources.show({
          resourceId,
          includeLatestDeployment: true,
          includeAccessSummary: true,
          includeProfileDiagnostics: true,
        }),
      enabled: browser && resourceId.length > 0,
      staleTime: 5_000,
    }),
  );
  const resourceHealthQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resources", "health", resourceId, "detail"],
      queryFn: () =>
        orpcClient.resources.health({
          resourceId,
          mode: "live",
          includeChecks: true,
          includePublicAccessProbe: true,
        }),
      enabled: browser && resourceId.length > 0,
      staleTime: 5_000,
    }),
  );

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const domainBindings = $derived(domainBindingsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      serversQuery.isPending ||
      deploymentsQuery.isPending ||
      domainBindingsQuery.isPending ||
      resourceDetailQuery.isPending,
  );
  const resourceDetail = $derived(resourceDetailQuery.data ?? null);
  const isResourceArchived = $derived(resourceDetail?.lifecycle.status === "archived");
  const resource = $derived(resourceDetail ? resourceSummaryFromDetail(resourceDetail) : null);
  const project = $derived(resource ? findProject(projects, resource.projectId) : null);
  const environment = $derived(
    resource ? findEnvironment(environments, resource.environmentId) : null,
  );
  const latestDeployment = $derived(
    resource ? deployments.find((deployment) => deployment.resourceId === resource.id) : null,
  );
  const resourceDeployments = $derived(
    resource ? deployments.filter((deployment) => deployment.resourceId === resource.id) : [],
  );
  const resourceDomainBindings = $derived(
    resource ? domainBindings.filter((binding) => binding.resourceId === resource.id) : [],
  );
  const resourceHealth = $derived(resourceHealthQuery.data ?? null);
  const resourceHealthOverall = $derived.by((): ResourceHealthViewStatus => {
    if (
      resourceHealthQuery.isPending ||
      (resourceHealthQuery.isFetching && resourceHealth?.overall === "unknown")
    ) {
      return "loading";
    }

    return resourceHealth?.overall ?? "unknown";
  });
  const latestGeneratedAccessRoute = $derived(
    resource?.accessSummary?.latestGeneratedAccessRoute ?? null,
  );
  const plannedGeneratedAccessRoute = $derived(
    resource?.accessSummary?.plannedGeneratedAccessRoute ?? null,
  );
  const latestDurableAccessRoute = $derived(
    resource?.accessSummary?.latestDurableDomainRoute ?? null,
  );
  const generatedAccessRoute = $derived(
    latestGeneratedAccessRoute ?? plannedGeneratedAccessRoute ?? null,
  );
  const defaultDestinationId = $derived(
    resource?.destinationId ?? latestDeployment?.destinationId ?? "",
  );
  const activeTab = $derived(parseResourceDetailTab(page.url.searchParams.get("tab")));
  const activeSettingsSection = $derived(
    parseResourceSettingsSection(page.url.searchParams.get("section")),
  );

  let serverId = $state("");
  let destinationId = $state("");
  let domainName = $state("");
  let pathPrefix = $state("/");
  let proxyKind = $state<CreateDomainBindingInput["proxyKind"]>("traefik");
  let tlsMode = $state<NonNullable<CreateDomainBindingInput["tlsMode"]>>("auto");
  let routeMode = $state<DomainRouteMode>("serve");
  let redirectTo = $state("");
  let redirectStatus = $state<RedirectStatusText>("308");
  let certificatePolicy = $state<NonNullable<CreateDomainBindingInput["certificatePolicy"]>>(
    "auto",
  );
  let createFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let healthFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let networkFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let runtimeFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let sourceFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let sourceFormResourceId = $state("");
  let sourceKind = $state<SourceKind>("git-public");
  let sourceLocator = $state("");
  let sourceDisplayName = $state("");
  let sourceGitRef = $state("");
  let sourceCommitSha = $state("");
  let sourceBaseDirectory = $state("");
  let sourceImageName = $state("");
  let sourceImageTag = $state("");
  let sourceImageDigest = $state("");
  let runtimeFormResourceId = $state("");
  let runtimeStrategy = $state<RuntimePlanStrategy>("auto");
  let runtimeInstallCommand = $state("");
  let runtimeBuildCommand = $state("");
  let runtimeStartCommand = $state("");
  let runtimePublishDirectory = $state("");
  let runtimeDockerfilePath = $state("");
  let runtimeDockerComposeFilePath = $state("");
  let runtimeBuildTarget = $state("");
  let networkFormResourceId = $state("");
  let networkInternalPort = $state("");
  let networkUpstreamProtocol = $state<NetworkProtocol>("http");
  let networkExposureMode = $state<NetworkExposureMode>("reverse-proxy");
  let networkTargetServiceName = $state("");
  let healthFormResourceId = $state("");
  let healthEnabled = $state(true);
  let healthMethod = $state<HealthCheckMethod>("GET");
  let healthScheme = $state<HealthCheckScheme>("http");
  let healthHost = $state("localhost");
  let healthPath = $state("/");
  let healthPort = $state("");
  let healthExpectedStatus = $state("200");
  let healthExpectedText = $state("");
  let healthIntervalSeconds = $state("5");
  let healthTimeoutSeconds = $state("5");
  let healthRetries = $state("10");
  let healthStartPeriodSeconds = $state("5");
  let runtimeLogResourceId = $state("");
  let runtimeLogs = $state<ResourceRuntimeLogLine[]>([]);
  let runtimeLogsLoading = $state(false);
  let runtimeLogsError = $state<string | null>(null);
  let runtimeLogsFollowing = $state(false);
  let runtimeLogStream = $state<RuntimeLogClientStream | null>(null);
  let runtimeLogRequestGeneration = $state(0);
  let proxyConfigurationResourceId = $state("");
  let proxyConfiguration = $state<ProxyConfigurationView | null>(null);
  let proxyConfigurationLoading = $state(false);
  let proxyConfigurationError = $state<string | null>(null);
  let diagnosticSummaryLoading = $state(false);
  let diagnosticSummaryCopyState = $state<"idle" | "copied" | "failed">("idle");
  let diagnosticSummaryError = $state<string | null>(null);
  let diagnosticSummaryCopyFallback = $state<string | null>(null);
  let diagnosticSummaryCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;
  let accessUrlCopyState = $state<"idle" | "copied" | "failed">("idle");
  let accessUrlCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;

  const selectedServer = $derived(findServer(servers, serverId));
  const canonicalRedirectTargets = $derived.by(() =>
    resourceDomainBindings.filter(
      (binding) =>
        !binding.redirectTo &&
        binding.domainName !== domainName.trim().toLowerCase() &&
        binding.pathPrefix === (pathPrefix.trim() || "/"),
    ),
  );
  const selectedCanonicalRedirectTarget = $derived(
    canonicalRedirectTargets.find((binding) => binding.domainName === redirectTo) ?? null,
  );
  const primaryDomainBinding = $derived(
    resourceDomainBindings.find((binding) => binding.status === "ready") ??
      resourceDomainBindings.find((binding) => binding.status === "bound") ??
      resourceDomainBindings[0] ??
      null,
  );
  const primaryAccessHref = $derived(
    primaryDomainBinding
      ? domainBindingHref(primaryDomainBinding)
      : (latestDurableAccessRoute?.url ?? generatedAccessRoute?.url ?? ""),
  );
  const primaryAccessKind = $derived.by((): ResourceAccessKind | null => {
    if (primaryDomainBinding) {
      return "domain-binding";
    }

    if (latestDurableAccessRoute) {
      return "durable-domain";
    }

    if (latestGeneratedAccessRoute) {
      return "generated-latest";
    }

    if (plannedGeneratedAccessRoute) {
      return "generated-planned";
    }

    return null;
  });
  const primaryAccessRoute = $derived.by((): ResourceAccessRoute | null => {
    if (primaryDomainBinding) {
      return null;
    }

    return latestDurableAccessRoute ?? generatedAccessRoute ?? null;
  });
  const shouldShowServerField = $derived(!latestDeployment?.serverId);
  const shouldShowDestinationField = $derived(!defaultDestinationId);
  const canCreateBinding = $derived(
    Boolean(
      resource &&
        serverId &&
        destinationId &&
        domainName.trim() &&
        pathPrefix.trim() &&
        proxyKind !== "none" &&
        (routeMode === "serve" || redirectTo),
    ),
  );
  const diagnosticSummaryButtonLabel = $derived(
    diagnosticSummaryLoading
      ? $t(i18nKeys.console.resources.diagnosticSummaryLoading)
      : diagnosticSummaryCopyState === "copied"
        ? $t(i18nKeys.console.resources.diagnosticSummaryCopied)
        : diagnosticSummaryCopyState === "failed"
          ? $t(i18nKeys.console.resources.diagnosticSummaryCopyFailed)
          : $t(i18nKeys.console.resources.diagnosticSummaryCopy),
  );
  const accessUrlCopyLabel = $derived(
    accessUrlCopyState === "copied"
      ? $t(i18nKeys.console.resources.accessUrlCopied)
      : accessUrlCopyState === "failed"
        ? $t(i18nKeys.console.resources.accessUrlCopyFailed)
        : $t(i18nKeys.console.resources.copyAccessUrl),
  );
  const sourceProfileStatusLabel = $derived(
    resourceDetail?.source
      ? $t(i18nKeys.common.status.configured)
      : $t(i18nKeys.common.status.notConfigured),
  );
  const sourceKindIsGit = $derived(isGitSourceKind(sourceKind));
  const sourceKindIsDockerImage = $derived(sourceKind === "docker-image");
  const canConfigureSource = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        sourceKind &&
        sourceLocator.trim() &&
        (!sourceKindIsDockerImage || !(sourceImageTag.trim() && sourceImageDigest.trim())),
    ),
  );
  const networkTargetServiceRequired = $derived(
    Boolean(resource?.kind === "compose-stack" && resource.services.length > 1),
  );
  const selectedNetworkTargetService = $derived(
    resource?.services.find((service) => service.name === networkTargetServiceName) ?? null,
  );
  const networkProfileStatusLabel = $derived(
    resource?.networkProfile
      ? $t(i18nKeys.common.status.configured)
      : $t(i18nKeys.common.status.notConfigured),
  );
  const runtimeProfileStatusLabel = $derived(
    resourceDetail?.runtimeProfile
      ? $t(i18nKeys.common.status.configured)
      : $t(i18nKeys.common.status.notConfigured),
  );
  const canConfigureRuntime = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        runtimeStrategy &&
        (runtimeStrategy !== "static" || runtimePublishDirectory.trim()) &&
        (runtimeStrategy !== "dockerfile" || runtimeDockerfilePath.trim()) &&
        (runtimeStrategy !== "docker-compose" || runtimeDockerComposeFilePath.trim()),
    ),
  );
  const canConfigureNetwork = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        isPortNumberText(networkInternalPort) &&
        (networkExposureMode === "none" || networkExposureMode === "reverse-proxy") &&
        (!networkTargetServiceRequired || networkTargetServiceName.trim()) &&
        (!networkTargetServiceName.trim() ||
          resource.services.some((service) => service.name === networkTargetServiceName.trim())),
    ),
  );
  const canConfigureHealth = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        (!healthEnabled ||
          (healthPath.trim() &&
            isPositiveIntegerText(healthExpectedStatus) &&
            Number(healthExpectedStatus) >= 100 &&
            Number(healthExpectedStatus) <= 599 &&
            isPositiveIntegerText(healthIntervalSeconds) &&
            isPositiveIntegerText(healthTimeoutSeconds) &&
            isPositiveIntegerText(healthRetries) &&
            isNonNegativeIntegerText(healthStartPeriodSeconds) &&
            (!healthPort.trim() || isPositiveIntegerText(healthPort)))),
    ),
  );
  const createDomainBindingMutation = createMutation(() => ({
    mutationFn: (input: CreateDomainBindingInput) => orpcClient.domainBindings.create(input),
    onSuccess: (result) => {
      createFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.domainBindings.createSuccessTitle),
        detail: result.id,
      };
      domainName = "";
      redirectTo = "";
      void queryClient.invalidateQueries({ queryKey: ["domain-bindings"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
    },
    onError: (error) => {
      createFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.createErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const confirmDomainBindingOwnershipMutation = createMutation(() => ({
    mutationFn: (input: ConfirmDomainBindingOwnershipInput) =>
      orpcClient.domainBindings.confirmOwnership(input),
    onSuccess: () => {
      createFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.domainBindings.confirmOwnershipSuccessTitle),
        detail: $t(i18nKeys.common.status.bound),
      };
      void queryClient.invalidateQueries({ queryKey: ["domain-bindings"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
    },
    onError: (error) => {
      createFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.confirmOwnershipErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const configureResourceHealthMutation = createMutation(() => ({
    mutationFn: (input: ConfigureResourceHealthInput) => orpcClient.resources.configureHealth(input),
    onSuccess: (result) => {
      healthFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.healthPolicySaved),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
      void queryClient.invalidateQueries({
        queryKey: ["resources", "health", resourceId, "detail"],
      });
    },
    onError: (error) => {
      healthFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.healthPolicySaveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const configureResourceSourceMutation = createMutation(() => ({
    mutationFn: (input: ConfigureResourceSourceInput) =>
      orpcClient.resources.configureSource(input),
    onSuccess: (result) => {
      sourceFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.sourceProfileSaved),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
    },
    onError: (error) => {
      sourceFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.sourceProfileSaveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const configureResourceRuntimeMutation = createMutation(() => ({
    mutationFn: (input: ConfigureResourceRuntimeInput) =>
      orpcClient.resources.configureRuntime(input),
    onSuccess: (result) => {
      runtimeFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.runtimeProfileSaved),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
    },
    onError: (error) => {
      runtimeFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.runtimeProfileSaveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const configureResourceNetworkMutation = createMutation(() => ({
    mutationFn: (input: ConfigureResourceNetworkInput) =>
      orpcClient.resources.configureNetwork(input),
    onSuccess: (result) => {
      networkFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.networkProfileSaved),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
      void queryClient.invalidateQueries({
        queryKey: ["resources", "health", resourceId, "detail"],
      });
      if (resource) {
        void loadProxyConfiguration(resource.id);
      }
    },
    onError: (error) => {
      networkFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.networkProfileSaveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  let archiveFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  const archiveResourceMutation = createMutation(() => ({
    mutationFn: (input: ArchiveResourceInput) => orpcClient.resources.archive(input),
    onSuccess: (result) => {
      archiveFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.archiveSucceeded),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
      void queryClient.invalidateQueries({
        queryKey: ["resources", "health", resourceId, "detail"],
      });
    },
    onError: (error) => {
      archiveFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.archiveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  let deleteFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  const deleteResourceMutation = createMutation(() => ({
    mutationFn: (input: DeleteResourceInput) => orpcClient.resources.delete(input),
    onSuccess: (result) => {
      deleteFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.deleteSucceeded),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
      void queryClient.invalidateQueries({
        queryKey: ["resources", "health", resourceId, "detail"],
      });
      void goto(project ? projectDetailHref(project.id) : "/projects");
    },
    onError: (error) => {
      deleteFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.deleteFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  let defaultedResourceId = $state("");

  function appendRuntimeLogLine(line: ResourceRuntimeLogLine): void {
    runtimeLogs = [...runtimeLogs, line].slice(-500);
  }

  function isActiveRuntimeLogRequest(currentResourceId: string, generation: number): boolean {
    return runtimeLogResourceId === currentResourceId && runtimeLogRequestGeneration === generation;
  }

  function isActiveRuntimeLogFollow(currentResourceId: string, generation: number): boolean {
    return isActiveRuntimeLogRequest(currentResourceId, generation) && runtimeLogsFollowing;
  }

  function handleRuntimeLogEvent(
    event: ResourceRuntimeLogEvent,
    currentResourceId: string,
    generation: number,
  ): void {
    if (!isActiveRuntimeLogRequest(currentResourceId, generation)) {
      return;
    }

    switch (event.kind) {
      case "line":
        appendRuntimeLogLine(event.line);
        break;
      case "error":
        runtimeLogsError = event.error.message;
        runtimeLogStream = null;
        runtimeLogsFollowing = false;
        break;
      case "closed":
        runtimeLogStream = null;
        runtimeLogsFollowing = false;
        break;
      case "heartbeat":
        break;
    }
  }

  function stopRuntimeLogFollow(): void {
    runtimeLogRequestGeneration += 1;
    const stream = runtimeLogStream;
    runtimeLogStream = null;
    runtimeLogsFollowing = false;
    void stream?.return?.().catch(() => undefined);
  }

  async function loadRuntimeLogs(currentResourceId: string): Promise<void> {
    const generation = runtimeLogRequestGeneration + 1;
    runtimeLogRequestGeneration = generation;
    runtimeLogResourceId = currentResourceId;
    runtimeLogsLoading = true;
    runtimeLogsError = null;

    try {
      const result = await orpcClient.resources.logs({
        resourceId: currentResourceId,
        tailLines: 100,
        follow: false,
      });

      if (isActiveRuntimeLogRequest(currentResourceId, generation)) {
        runtimeLogs = result.logs;
      }
    } catch (error) {
      if (isActiveRuntimeLogRequest(currentResourceId, generation)) {
        runtimeLogsError = readErrorMessage(error);
      }
    } finally {
      if (isActiveRuntimeLogRequest(currentResourceId, generation)) {
        runtimeLogsLoading = false;
      }
    }
  }

  async function consumeRuntimeLogStream(
    currentResourceId: string,
    generation: number,
    tailLines: number,
  ): Promise<void> {
    try {
      const stream = await orpcClient.resources.logsStream({
        resourceId: currentResourceId,
        tailLines,
        follow: true,
      });

      if (!isActiveRuntimeLogFollow(currentResourceId, generation)) {
        await stream.return?.();
        return;
      }

      runtimeLogStream = stream;
      let result = await stream.next();

      while (
        isActiveRuntimeLogFollow(currentResourceId, generation) &&
        !result.done
      ) {
        handleRuntimeLogEvent(result.value, currentResourceId, generation);

        if (!isActiveRuntimeLogFollow(currentResourceId, generation)) {
          break;
        }

        result = await stream.next();
      }
    } catch (error) {
      if (isActiveRuntimeLogFollow(currentResourceId, generation)) {
        runtimeLogsError = readErrorMessage(error);
      }
    } finally {
      if (isActiveRuntimeLogRequest(currentResourceId, generation)) {
        runtimeLogStream = null;
        runtimeLogsFollowing = false;
      }
    }
  }

  function startRuntimeLogFollow(): void {
    if (!browser || !resource || runtimeLogsFollowing || runtimeLogsLoading) {
      return;
    }

    const generation = runtimeLogRequestGeneration + 1;
    runtimeLogRequestGeneration = generation;
    runtimeLogResourceId = resource.id;
    runtimeLogsError = null;
    runtimeLogsFollowing = true;
    const tailLines = runtimeLogs.length > 0 ? 0 : 100;
    void consumeRuntimeLogStream(resource.id, generation, tailLines);
  }

  function refreshRuntimeLogs(): void {
    if (!resource) {
      return;
    }

    stopRuntimeLogFollow();
    void loadRuntimeLogs(resource.id);
  }

  async function loadProxyConfiguration(currentResourceId: string): Promise<void> {
    proxyConfigurationResourceId = currentResourceId;
    proxyConfigurationLoading = true;
    proxyConfigurationError = null;

    try {
      const result = await orpcClient.resources.proxyConfiguration({
        resourceId: currentResourceId,
        routeScope: "latest",
        includeDiagnostics: true,
      });

      if (proxyConfigurationResourceId === currentResourceId) {
        proxyConfiguration = result;
      }
    } catch (error) {
      if (proxyConfigurationResourceId === currentResourceId) {
        proxyConfigurationError = readErrorMessage(error);
      }
    } finally {
      if (proxyConfigurationResourceId === currentResourceId) {
        proxyConfigurationLoading = false;
      }
    }
  }

  function refreshProxyConfiguration(): void {
    if (!resource) {
      return;
    }

    void loadProxyConfiguration(resource.id);
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
        // Fall back for desktop previews or browsers with restrictive clipboard permissions.
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
        throw new Error($t(i18nKeys.console.resources.diagnosticSummaryCopyFailed));
      }
    } finally {
      textArea.remove();
    }
  }

  function selectDiagnosticSummaryFallback(event: Event): void {
    const target = event.currentTarget;
    if (target instanceof HTMLTextAreaElement) {
      target.select();
    }
  }

  async function copyResourceDiagnosticSummary(): Promise<void> {
    if (!resource || diagnosticSummaryLoading) {
      return;
    }

    diagnosticSummaryLoading = true;
    diagnosticSummaryError = null;
    diagnosticSummaryCopyFallback = null;

    try {
      const summary = await orpcClient.resources.diagnosticSummary({
        resourceId: resource.id,
        ...(latestDeployment?.id ? { deploymentId: latestDeployment.id } : {}),
        includeDeploymentLogTail: true,
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

  async function handleCopyAccessUrl(): Promise<void> {
    if (!browser || !primaryAccessHref) {
      return;
    }

    try {
      await copyTextToClipboard(primaryAccessHref);
      markAccessUrlCopyState("copied");
    } catch {
      markAccessUrlCopyState("failed");
    }
  }

  function archiveResource(): void {
    if (!browser || !resource || isResourceArchived || archiveResourceMutation.isPending) {
      return;
    }

    if (!window.confirm($t(i18nKeys.console.resources.archiveConfirm))) {
      return;
    }

    archiveFeedback = null;
    archiveResourceMutation.mutate({
      resourceId: resource.id,
    });
  }

  function deleteResource(): void {
    if (!browser || !resource || !isResourceArchived || deleteResourceMutation.isPending) {
      return;
    }

    const resourceSlug = window.prompt(
      `${$t(i18nKeys.console.resources.deleteConfirmPrompt)}\n${resource.slug}`,
    );
    if (resourceSlug === null) {
      return;
    }

    deleteFeedback = null;
    deleteResourceMutation.mutate({
      resourceId: resource.id,
      confirmation: {
        resourceSlug,
      },
    });
  }

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (defaultedResourceId === resource.id) {
      return;
    }

    defaultedResourceId = resource.id;
    destinationId = defaultDestinationId;
  });

  $effect(() => {
    if (!browser || serverId) {
      return;
    }

    serverId = latestDeployment?.serverId ?? servers[0]?.id ?? "";
  });

  $effect(() => {
    if (!browser || routeMode !== "redirect") {
      return;
    }

    if (canonicalRedirectTargets.some((binding) => binding.domainName === redirectTo)) {
      return;
    }

    redirectTo = canonicalRedirectTargets[0]?.domainName ?? "";
  });

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (sourceFormResourceId === resource.id) {
      return;
    }

    const source = resourceDetail?.source;
    sourceFormResourceId = resource.id;
    sourceKind = source?.kind ?? "git-public";
    sourceLocator = source?.locator ?? "";
    sourceDisplayName = source?.displayName ?? "";
    sourceGitRef = source?.gitRef ?? "";
    sourceCommitSha = source?.commitSha ?? "";
    sourceBaseDirectory = source?.baseDirectory ?? "";
    sourceImageName = source?.imageName ?? "";
    sourceImageTag = source?.imageTag ?? "";
    sourceImageDigest = source?.imageDigest ?? "";
    sourceFeedback = null;
  });

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (runtimeFormResourceId === resource.id) {
      return;
    }

    const profile = resourceDetail?.runtimeProfile;
    runtimeFormResourceId = resource.id;
    runtimeStrategy = profile?.strategy ?? "auto";
    runtimeInstallCommand = profile?.installCommand ?? "";
    runtimeBuildCommand = profile?.buildCommand ?? "";
    runtimeStartCommand = profile?.startCommand ?? "";
    runtimePublishDirectory = profile?.publishDirectory ?? "";
    runtimeDockerfilePath = profile?.dockerfilePath ?? "";
    runtimeDockerComposeFilePath = profile?.dockerComposeFilePath ?? "";
    runtimeBuildTarget = profile?.buildTarget ?? "";
    runtimeFeedback = null;
  });

  $effect(() => {
    if (!browser || !resource || !resourceHealth) {
      return;
    }

    if (healthFormResourceId === resource.id) {
      return;
    }

    const policy = resourceHealth.healthPolicy;
    healthFormResourceId = resource.id;
    healthEnabled = policy.status === "configured";
    healthPath = policy.path ?? "/";
    healthPort = policy.port ? String(policy.port) : "";
    healthExpectedStatus = policy.expectedStatusCode ? String(policy.expectedStatusCode) : "200";
    healthIntervalSeconds = policy.intervalSeconds ? String(policy.intervalSeconds) : "5";
    healthTimeoutSeconds = policy.timeoutSeconds ? String(policy.timeoutSeconds) : "5";
    healthRetries = policy.retries ? String(policy.retries) : "10";
    healthStartPeriodSeconds = policy.startPeriodSeconds
      ? String(policy.startPeriodSeconds)
      : "5";
  });

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (networkFormResourceId === resource.id) {
      return;
    }

    const profile = resource.networkProfile;
    networkFormResourceId = resource.id;
    networkInternalPort = profile?.internalPort ? String(profile.internalPort) : "";
    networkUpstreamProtocol = profile?.upstreamProtocol ?? "http";
    networkExposureMode = profile?.exposureMode ?? "reverse-proxy";
    networkTargetServiceName =
      profile?.targetServiceName ??
      (resource.kind === "compose-stack" && resource.services.length > 1
        ? (resource.services[0]?.name ?? "")
        : "");
    networkFeedback = null;
  });

  $effect(() => {
    const currentResourceId = resource?.id ?? "";

    if (!browser) {
      return;
    }

    untrack(() => {
      if (!currentResourceId) {
        proxyConfiguration = null;
        proxyConfigurationResourceId = "";
        return;
      }

      void loadProxyConfiguration(currentResourceId);
    });
  });

  $effect(() => {
    const currentResourceId = resource?.id ?? "";
    const currentTab = activeTab;

    if (!browser) {
      return;
    }

    untrack(() => {
      stopRuntimeLogFollow();

      if (!currentResourceId) {
        runtimeLogs = [];
        runtimeLogResourceId = "";
        runtimeLogsLoading = false;
        return;
      }

      if (currentTab !== "logs") {
        runtimeLogsLoading = false;
        return;
      }

      void loadRuntimeLogs(currentResourceId);
    });
  });

  onDestroy(() => {
    stopRuntimeLogFollow();
    if (diagnosticSummaryCopyResetTimeout) {
      clearTimeout(diagnosticSummaryCopyResetTimeout);
    }
    if (accessUrlCopyResetTimeout) {
      clearTimeout(accessUrlCopyResetTimeout);
    }
  });

  function resourceSummaryFromDetail(detail: ResourceDetail): ResourceSummary {
    const summary: ResourceSummary = {
      id: detail.resource.id,
      projectId: detail.resource.projectId,
      environmentId: detail.resource.environmentId,
      name: detail.resource.name,
      slug: detail.resource.slug,
      kind: detail.resource.kind,
      createdAt: detail.resource.createdAt,
      services: detail.resource.services,
      deploymentCount: detail.resource.deploymentCount,
    };

    if (detail.resource.destinationId) {
      summary.destinationId = detail.resource.destinationId;
    }
    if (detail.resource.description) {
      summary.description = detail.resource.description;
    }
    if (detail.resource.lastDeploymentId) {
      summary.lastDeploymentId = detail.resource.lastDeploymentId;
    }
    if (detail.resource.lastDeploymentStatus) {
      summary.lastDeploymentStatus = detail.resource.lastDeploymentStatus;
    }
    if (detail.networkProfile) {
      summary.networkProfile = detail.networkProfile;
    }
    if (detail.accessSummary) {
      summary.accessSummary = detail.accessSummary;
    }

    return summary;
  }

  function createResourceDomainBinding(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canCreateBinding || createDomainBindingMutation.isPending) {
      return;
    }

    createFeedback = null;
    createDomainBindingMutation.mutate({
      projectId: resource.projectId,
      environmentId: resource.environmentId,
      resourceId: resource.id,
      serverId,
      destinationId,
      domainName: domainName.trim(),
      pathPrefix: pathPrefix.trim() || "/",
      proxyKind,
      tlsMode,
      ...(routeMode === "redirect"
        ? {
            redirectTo,
            redirectStatus: parseRedirectStatus(redirectStatus),
          }
        : {}),
      certificatePolicy,
    });
  }

  function parseRedirectStatus(value: RedirectStatusText): 301 | 302 | 307 | 308 {
    switch (value) {
      case "301":
        return 301;
      case "302":
        return 302;
      case "307":
        return 307;
      case "308":
        return 308;
    }
  }

  function isPositiveIntegerText(value: string): boolean {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0;
  }

  function isPortNumberText(value: string): boolean {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535;
  }

  function isNonNegativeIntegerText(value: string): boolean {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0;
  }

  function isGitSourceKind(kind: SourceKind): boolean {
    return (
      kind === "remote-git" ||
      kind === "git-public" ||
      kind === "git-github-app" ||
      kind === "git-deploy-key" ||
      kind === "local-git"
    );
  }

  function configureResourceSource(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canConfigureSource || configureResourceSourceMutation.isPending) {
      return;
    }

    const displayName = sourceDisplayName.trim();
    const gitRef = sourceGitRef.trim();
    const commitSha = sourceCommitSha.trim();
    const baseDirectory = sourceBaseDirectory.trim();
    const imageName = sourceImageName.trim();
    const imageTag = sourceImageTag.trim();
    const imageDigest = sourceImageDigest.trim();
    const source: SourceProfileInput = {
      kind: sourceKind,
      locator: sourceLocator.trim(),
      ...(displayName ? { displayName } : {}),
      ...(gitRef ? { gitRef } : {}),
      ...(commitSha ? { commitSha } : {}),
      ...(baseDirectory ? { baseDirectory } : {}),
      ...(imageName ? { imageName } : {}),
      ...(imageTag ? { imageTag } : {}),
      ...(imageDigest ? { imageDigest } : {}),
    };

    sourceFeedback = null;
    configureResourceSourceMutation.mutate({
      resourceId: resource.id,
      source,
    });
  }

  function configureResourceRuntime(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canConfigureRuntime || configureResourceRuntimeMutation.isPending) {
      return;
    }

    const installCommand = runtimeInstallCommand.trim();
    const buildCommand = runtimeBuildCommand.trim();
    const startCommand = runtimeStartCommand.trim();
    const publishDirectory = runtimePublishDirectory.trim();
    const dockerfilePath = runtimeDockerfilePath.trim();
    const dockerComposeFilePath = runtimeDockerComposeFilePath.trim();
    const buildTarget = runtimeBuildTarget.trim();
    const runtimeProfile: RuntimeProfileInput = {
      strategy: runtimeStrategy,
      ...(installCommand ? { installCommand } : {}),
      ...(buildCommand ? { buildCommand } : {}),
      ...(startCommand ? { startCommand } : {}),
      ...(publishDirectory ? { publishDirectory } : {}),
      ...(dockerfilePath ? { dockerfilePath } : {}),
      ...(dockerComposeFilePath ? { dockerComposeFilePath } : {}),
      ...(buildTarget ? { buildTarget } : {}),
    };

    runtimeFeedback = null;
    configureResourceRuntimeMutation.mutate({
      resourceId: resource.id,
      runtimeProfile,
    });
  }

  function configureResourceNetwork(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canConfigureNetwork || configureResourceNetworkMutation.isPending) {
      return;
    }

    const targetServiceName = networkTargetServiceName.trim();
    networkFeedback = null;

    configureResourceNetworkMutation.mutate({
      resourceId: resource.id,
      networkProfile: {
        internalPort: Number(networkInternalPort),
        upstreamProtocol: networkUpstreamProtocol,
        exposureMode: networkExposureMode,
        ...(targetServiceName ? { targetServiceName } : {}),
      },
    });
  }

  function configureResourceHealth(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canConfigureHealth || configureResourceHealthMutation.isPending) {
      return;
    }

    const port = healthPort.trim() ? Number(healthPort) : undefined;
    const expectedResponseText = healthExpectedText.trim();
    healthFeedback = null;

    configureResourceHealthMutation.mutate({
      resourceId: resource.id,
      healthCheck: {
        enabled: healthEnabled,
        type: "http",
        intervalSeconds: Number(healthIntervalSeconds),
        timeoutSeconds: Number(healthTimeoutSeconds),
        retries: Number(healthRetries),
        startPeriodSeconds: Number(healthStartPeriodSeconds),
        ...(healthEnabled
          ? {
              http: {
                method: healthMethod,
                scheme: healthScheme,
                host: healthHost.trim() || "localhost",
                path: healthPath.trim() || "/",
                expectedStatusCode: Number(healthExpectedStatus),
                ...(port ? { port } : {}),
                ...(expectedResponseText ? { expectedResponseText } : {}),
              },
            }
          : {}),
      },
    });
  }

  function confirmDomainBindingOwnership(binding: DomainBindingSummary): void {
    if (binding.status !== "pending_verification" || confirmDomainBindingOwnershipMutation.isPending) {
      return;
    }

    createFeedback = null;
    confirmDomainBindingOwnershipMutation.mutate({
      domainBindingId: binding.id,
    });
  }

  function domainBindingHref(binding: DomainBindingSummary): string {
    const normalizedPath = binding.pathPrefix.startsWith("/")
      ? binding.pathPrefix
      : `/${binding.pathPrefix}`;
    const path = normalizedPath === "/" ? "" : normalizedPath;
    const protocol = binding.tlsMode === "disabled" ? "http" : "https";
    return `${protocol}://${binding.domainName}${path}`;
  }

  function resourceDeploymentHref(): string {
    if (!resource) {
      return "/deploy";
    }

    return resourceNewDeploymentHref(resource);
  }

  function parseResourceDetailTab(value: string | null): ResourceDetailTab {
    return resourceDetailTabs.includes(value as ResourceDetailTab)
      ? (value as ResourceDetailTab)
      : "settings";
  }

  function parseResourceSettingsSection(value: string | null): ResourceSettingsSection {
    return resourceSettingsSections.includes(value as ResourceSettingsSection)
      ? (value as ResourceSettingsSection)
      : "profile";
  }

  function resourceTabHref(tab: ResourceDetailTab): string {
    const params = new URLSearchParams(page.url.searchParams);

    if (tab === "settings") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
      params.delete("section");
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectResourceTab(tab: ResourceDetailTab, event: MouseEvent): void {
    event.preventDefault();
    void goto(resourceTabHref(tab), { noScroll: true, keepFocus: true });
  }

  function resourceTabLabel(tab: ResourceDetailTab): string {
    switch (tab) {
      case "deployments":
        return $t(i18nKeys.common.domain.deployments);
      case "logs":
        return $t(i18nKeys.console.resources.logsTab);
      case "settings":
        return $t(i18nKeys.console.resources.settingsTab);
      case "terminal":
        return $t(i18nKeys.console.terminal.title);
    }
  }

  function resourceSettingsSectionHref(section: ResourceSettingsSection): string {
    const params = new URLSearchParams(page.url.searchParams);
    params.delete("tab");

    if (section === "profile") {
      params.delete("section");
    } else {
      params.set("section", section);
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectResourceSettingsSection(section: ResourceSettingsSection, event: MouseEvent): void {
    event.preventDefault();
    void goto(resourceSettingsSectionHref(section), { noScroll: true, keepFocus: true });
  }

  function resourceSettingsSectionLabel(section: ResourceSettingsSection): string {
    switch (section) {
      case "profile":
        return $t(i18nKeys.console.resources.profileTitle);
      case "domains":
        return $t(i18nKeys.console.resources.domainBindingsTitle);
      case "health":
        return $t(i18nKeys.console.resources.healthPolicy);
      case "proxy":
        return $t(i18nKeys.console.resources.proxyConfigurationTitle);
      case "diagnostics":
        return $t(i18nKeys.console.resources.diagnosticsTitle);
    }
  }

  function sourceKindLabel(kind: SourceKind): string {
    switch (kind) {
      case "compose":
      case "docker-compose-inline":
        return $t(i18nKeys.console.resources.sourceKindCompose);
      case "docker-image":
        return $t(i18nKeys.console.resources.sourceKindDockerImage);
      case "git-public":
        return $t(i18nKeys.console.resources.sourceKindGitPublic);
      case "local-folder":
      case "local-git":
        return $t(i18nKeys.console.resources.sourceKindLocalFolder);
      case "remote-git":
      case "git-github-app":
      case "git-deploy-key":
        return $t(i18nKeys.console.resources.sourceKindRemoteGit);
      case "dockerfile-inline":
      case "zip-artifact":
        return kind;
    }
  }

  function runtimeStrategyLabel(strategy: RuntimePlanStrategy): string {
    switch (strategy) {
      case "auto":
        return $t(i18nKeys.console.resources.runtimeStrategyAuto);
      case "dockerfile":
        return $t(i18nKeys.console.resources.runtimeStrategyDockerfile);
      case "docker-compose":
        return $t(i18nKeys.console.resources.runtimeStrategyDockerCompose);
      case "prebuilt-image":
        return $t(i18nKeys.console.resources.runtimeStrategyPrebuiltImage);
      case "workspace-commands":
        return $t(i18nKeys.console.resources.runtimeStrategyWorkspaceCommands);
      case "static":
        return $t(i18nKeys.console.resources.runtimeStrategyStatic);
    }
  }

  function networkProtocolLabel(protocol: NetworkProtocol): string {
    switch (protocol) {
      case "http":
        return $t(i18nKeys.console.resources.networkProtocolHttp);
      case "tcp":
        return $t(i18nKeys.console.resources.networkProtocolTcp);
    }
  }

  function networkExposureModeLabel(mode: NetworkExposureMode): string {
    switch (mode) {
      case "none":
        return $t(i18nKeys.console.resources.networkExposureNone);
      case "reverse-proxy":
        return $t(i18nKeys.console.resources.networkExposureReverseProxy);
      case "direct-port":
        return $t(i18nKeys.console.resources.networkExposureDirectPort);
    }
  }

  function domainBindingStatusLabel(status: DomainBindingSummary["status"]): string {
    switch (status) {
      case "requested":
        return $t(i18nKeys.common.status.requested);
      case "pending_verification":
        return $t(i18nKeys.common.status.pendingVerification);
      case "bound":
        return $t(i18nKeys.common.status.bound);
      case "certificate_pending":
        return $t(i18nKeys.common.status.certificatePending);
      case "ready":
        return $t(i18nKeys.common.status.ready);
      case "not_ready":
        return $t(i18nKeys.common.status.notReady);
      case "failed":
        return $t(i18nKeys.common.status.failed);
    }
  }

  function domainBindingStatusVariant(
    status: DomainBindingSummary["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "ready":
      case "bound":
        return "default";
      case "failed":
      case "not_ready":
        return "destructive";
      case "certificate_pending":
      case "pending_verification":
      case "requested":
        return "secondary";
    }
  }

  function proxyConfigurationStatusLabel(status: ProxyConfigurationView["status"]): string {
    switch (status) {
      case "not-configured":
        return $t(i18nKeys.console.resources.proxyConfigurationStatusNotConfigured);
      case "planned":
        return $t(i18nKeys.console.resources.proxyConfigurationStatusPlanned);
      case "applied":
        return $t(i18nKeys.console.resources.proxyConfigurationStatusApplied);
      case "stale":
        return $t(i18nKeys.console.resources.proxyConfigurationStatusStale);
      case "failed":
        return $t(i18nKeys.common.status.failed);
    }
  }

  function proxyConfigurationStatusVariant(
    status: ProxyConfigurationView["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "applied":
        return "default";
      case "failed":
        return "destructive";
      case "planned":
      case "stale":
        return "secondary";
      case "not-configured":
        return "outline";
    }
  }

  function resourceAccessKindLabel(kind: ResourceAccessKind): string {
    switch (kind) {
      case "domain-binding":
      case "durable-domain":
        return $t(i18nKeys.console.resources.durableDomainAccess);
      case "generated-latest":
        return $t(i18nKeys.console.resources.generatedAccessRoute);
      case "generated-planned":
        return $t(i18nKeys.console.resources.plannedAccessRoute);
    }
  }

  function resourceAccessStatusLabel(status: ResourceAccessStatus | undefined): string {
    switch (status) {
      case "ready":
        return $t(i18nKeys.common.status.ready);
      case "not-ready":
        return $t(i18nKeys.common.status.notReady);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      case "unknown":
      default:
        return $t(i18nKeys.common.status.unknown);
    }
  }

  function resourceAccessStatusVariant(
    status: ResourceAccessStatus | undefined,
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "ready":
        return "default";
      case "failed":
        return "destructive";
      case "not-ready":
        return "secondary";
      case "unknown":
      default:
        return "outline";
    }
  }

  function resourceHealthStatusLabel(status: ResourceHealthViewStatus): string {
    switch (status) {
      case "healthy":
        return $t(i18nKeys.common.status.healthy);
      case "loading":
        return $t(i18nKeys.common.status.loading);
      case "degraded":
        return $t(i18nKeys.common.status.degraded);
      case "unhealthy":
        return $t(i18nKeys.common.status.unhealthy);
      case "starting":
        return $t(i18nKeys.common.status.starting);
      case "stopped":
        return $t(i18nKeys.common.status.stopped);
      case "not-deployed":
        return $t(i18nKeys.common.status.notDeployed);
      case "unknown":
        return $t(i18nKeys.common.status.unknown);
    }
  }

  function resourceHealthSectionStatusLabel(status: string | undefined): string {
    switch (status) {
      case "healthy":
        return $t(i18nKeys.common.status.healthy);
      case "degraded":
        return $t(i18nKeys.common.status.degraded);
      case "unhealthy":
        return $t(i18nKeys.common.status.unhealthy);
      case "starting":
        return $t(i18nKeys.common.status.starting);
      case "stopped":
        return $t(i18nKeys.common.status.stopped);
      case "not-deployed":
        return $t(i18nKeys.common.status.notDeployed);
      case "running":
        return $t(i18nKeys.common.status.running);
      case "ready":
        return $t(i18nKeys.common.status.ready);
      case "configured":
        return $t(i18nKeys.common.status.configured);
      case "not-ready":
        return $t(i18nKeys.common.status.notReady);
      case "not-configured":
        return $t(i18nKeys.common.status.notConfigured);
      case "failed":
      case "exited":
        return $t(i18nKeys.common.status.failed);
      case "passed":
        return $t(i18nKeys.common.status.passed);
      case "skipped":
        return $t(i18nKeys.common.status.skipped);
      case "unknown":
      default:
        return $t(i18nKeys.common.status.unknown);
    }
  }

  function resourceHealthSectionStatusVariant(
    status: string | undefined,
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "healthy":
      case "ready":
      case "running":
      case "configured":
      case "passed":
        return "default";
      case "degraded":
      case "starting":
      case "not-ready":
        return "secondary";
      case "unhealthy":
      case "stopped":
      case "failed":
      case "exited":
        return "destructive";
      case "not-deployed":
      case "not-configured":
      case "skipped":
      case "unknown":
      default:
        return "outline";
    }
  }

</script>

<svelte:head>
  <title>{resource?.name ?? $t(i18nKeys.console.resources.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={resource?.name ?? $t(i18nKeys.console.resources.pageTitle)}
  description={$t(i18nKeys.console.resources.detailDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle), href: "/projects" },
    {
      label: project?.name ?? $t(i18nKeys.common.domain.project),
      href: project ? projectDetailHref(project.id) : undefined,
    },
    { label: environment?.name ?? $t(i18nKeys.common.domain.environment) },
    { label: resource?.name ?? $t(i18nKeys.common.domain.resource) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-40 w-full" />
      <div class="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Skeleton class="h-80 w-full" />
        <Skeleton class="h-80 w-full" />
      </div>
    </div>
  {:else if !resource}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.errors.backend.notFound)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.resources.notFoundTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.resources.notFoundBody)}
        </p>
      </div>
      <div class="mt-6">
        <Button href="/projects" variant="outline">
          <ArrowLeft class="size-4" />
          {$t(i18nKeys.common.actions.backToProjects)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="border-b pb-4">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="break-words text-2xl font-semibold md:text-3xl">{resource.name}</h1>
              <Badge variant="secondary">{resource.kind}</Badge>
              {#if isResourceArchived}
                <Badge variant="outline">{$t(i18nKeys.console.resources.archived)}</Badge>
              {/if}
            </div>
            {#if resource.description}
              <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
                {resource.description}
              </p>
            {/if}
            {#if isResourceArchived}
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.resources.archiveNotice)}
                {#if resourceDetail?.lifecycle.archivedAt}
                  {$t(i18nKeys.console.resources.archivedAt)}
                  {formatTime(resourceDetail.lifecycle.archivedAt)}
                {/if}
              </p>
            {/if}
            {#if archiveFeedback}
              <div
                class={[
                  "max-w-3xl rounded-md border px-3 py-2 text-sm",
                  archiveFeedback.kind === "success"
                    ? "border-primary/25 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5 text-destructive",
                ]}
              >
                <p class="font-medium">{archiveFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{archiveFeedback.detail}</p>
              </div>
            {/if}
            {#if deleteFeedback}
              <div
                class={[
                  "max-w-3xl rounded-md border px-3 py-2 text-sm",
                  deleteFeedback.kind === "success"
                    ? "border-primary/25 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5 text-destructive",
                ]}
              >
                <p class="font-medium">{deleteFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{deleteFeedback.detail}</p>
              </div>
            {/if}
          </div>

          <div class="flex shrink-0 flex-wrap gap-2">
            <Popover.Root>
              <Popover.Trigger>
                {#snippet child({ props })}
                  <Button {...props} variant="outline" size="lg">
                    <ResourceStatusDot status={resourceHealthOverall} />
                    <span>{$t(i18nKeys.console.resources.healthTitle)}</span>
                    <span class="text-muted-foreground">
                      {resourceHealthStatusLabel(resourceHealthOverall)}
                    </span>
                  </Button>
                {/snippet}
              </Popover.Trigger>
              <Popover.Content align="end" sideOffset={8} class="w-96 max-w-[calc(100vw-2rem)] p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="flex items-center gap-2 text-sm font-medium">
                      <ResourceStatusDot status={resourceHealthOverall} />
                      {resourceHealthStatusLabel(resourceHealthOverall)}
                    </p>
                    {#if resourceHealth?.observedAt}
                      <p class="mt-1 text-xs text-muted-foreground">
                        {$t(i18nKeys.console.resources.healthObservedAt)}
                        {formatTime(resourceHealth.observedAt)}
                      </p>
                    {/if}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={resourceHealthQuery.isFetching}
                    onclick={() => resourceHealthQuery.refetch()}
                  >
                    <RefreshCw
                      class={["size-4", resourceHealthQuery.isFetching ? "animate-spin" : ""]}
                    />
                    {$t(i18nKeys.console.resources.healthRefresh)}
                  </Button>
                </div>

                {#if resourceHealthQuery.isPending}
                  <div class="mt-3 space-y-2">
                    <Skeleton class="h-8 w-full" />
                    <Skeleton class="h-8 w-full" />
                  </div>
                {:else if resourceHealthQuery.error}
                  <p class="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {readErrorMessage(resourceHealthQuery.error)}
                  </p>
                {:else if resourceHealth}
                  <div class="mt-3 space-y-2">
                    <div
                      class="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm"
                    >
                      <span class="font-medium">{$t(i18nKeys.console.resources.healthRuntime)}</span>
                      <Badge variant={resourceHealthSectionStatusVariant(resourceHealth.runtime.lifecycle)}>
                        {resourceHealthSectionStatusLabel(resourceHealth.runtime.lifecycle)}
                      </Badge>
                    </div>
                    <div class="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                      <div class="flex items-center justify-between gap-3">
                        <span class="font-medium">
                          {$t(i18nKeys.console.resources.healthPolicy)}
                        </span>
                        <Badge
                          variant={resourceHealthSectionStatusVariant(
                            resourceHealth.healthPolicy.status,
                          )}
                        >
                          {resourceHealthSectionStatusLabel(resourceHealth.healthPolicy.status)}
                        </Badge>
                      </div>
                      {#if resourceHealth.healthPolicy.path}
                        <p class="mt-1 truncate text-xs text-muted-foreground">
                          {resourceHealth.healthPolicy.path}
                        </p>
                      {/if}
                    </div>
                  </div>
                {/if}
              </Popover.Content>
            </Popover.Root>
            <Button href={resourceDeploymentHref()} disabled={isResourceArchived}>
              <Plus class="size-4" />
              {$t(i18nKeys.common.actions.newDeployment)}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isResourceArchived || archiveResourceMutation.isPending}
              onclick={archiveResource}
            >
              <Archive class="size-4" />
              {archiveResourceMutation.isPending
                ? $t(i18nKeys.common.actions.saving)
                : $t(i18nKeys.console.resources.archiveAction)}
            </Button>
            {#if isResourceArchived}
              <Button
                id="resource-delete-action"
                type="button"
                variant="destructive"
                disabled={deleteResourceMutation.isPending}
                onclick={deleteResource}
              >
                <Trash2 class="size-4" />
                {deleteResourceMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.console.resources.deleteAction)}
              </Button>
            {/if}
          </div>
        </div>
      </section>

      <Tabs.Root value={activeTab} class="space-y-5">
        <Tabs.List
          class="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b bg-transparent p-0"
        >
          {#each resourceDetailTabs as tab (tab)}
            <Tabs.Trigger
              value={tab}
              class="h-11 flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 py-0 shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              onclick={(event) => selectResourceTab(tab, event)}
            >
              {resourceTabLabel(tab)}
            </Tabs.Trigger>
          {/each}
        </Tabs.List>

        <Tabs.Content value="deployments" class="mt-0">
          <section id="resource-deployments" class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.resources.deploymentsTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.deploymentsDescription)}
                </p>
              </div>
              <Button href={resourceDeploymentHref()} disabled={isResourceArchived}>
                <Plus class="size-4" />
                {$t(i18nKeys.common.actions.newDeployment)}
              </Button>
            </div>

            <div>
              {#if resourceDeployments.length > 0}
                <DeploymentTable
                  deployments={resourceDeployments}
                  {servers}
                  showProject={false}
                  showEnvironment={false}
                  showResource={false}
                  showServer
                />
              {:else}
                <div class="border-y bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.noDeployments)}
                </div>
              {/if}
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content value="settings" class="mt-0">
          <div class="grid gap-6 lg:grid-cols-[10.5rem_minmax(0,1fr)]">
            <aside class="border-b pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
              <nav aria-label={$t(i18nKeys.console.resources.settingsTab)}>
                <div role="tablist" class="flex gap-1 overflow-x-auto lg:flex-col">
                  {#each resourceSettingsSections as section (section)}
                    <a
                      href={resourceSettingsSectionHref(section)}
                      role="tab"
                      aria-selected={activeSettingsSection === section}
                      class={[
                        "flex min-h-9 items-center whitespace-nowrap rounded-md border border-transparent px-2.5 py-2 text-sm font-medium transition-colors",
                        activeSettingsSection === section
                          ? "border-border bg-muted/60 text-foreground shadow-xs"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      ]}
                      onclick={(event) => selectResourceSettingsSection(section, event)}
                    >
                      {resourceSettingsSectionLabel(section)}
                    </a>
                  {/each}
                </div>
              </nav>
            </aside>

            <div class="space-y-8">
              {#if activeSettingsSection === "profile"}
              <div id="resource-overview-profile" class="space-y-4">
                <ResourceProfileSummary
                  {resource}
                  projectName={project?.name ?? resource.projectId}
                  environmentName={environment?.name ?? resource.environmentId}
                  destinationId={defaultDestinationId}
                />

                <form
                  id="resource-source-profile-form"
                  class="rounded-md border bg-background p-4"
                  onsubmit={configureResourceSource}
                >
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.resources.sourceProfileTitle)}
                        </h2>
                        <Badge variant={resourceDetail?.source ? "default" : "outline"}>
                          {sourceProfileStatusLabel}
                        </Badge>
                      </div>
                      <p class="mt-1 text-sm leading-6 text-muted-foreground">
                        {$t(i18nKeys.console.resources.sourceProfileFormDescription)}
                      </p>
                    </div>
                  </div>

                  <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.resources.sourceKind)}</span>
                      <Select.Root bind:value={sourceKind} type="single">
                        <Select.Trigger class="w-full">
                          {sourceKindLabel(sourceKind)}
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="git-public">
                            {$t(i18nKeys.console.resources.sourceKindGitPublic)}
                          </Select.Item>
                          <Select.Item value="remote-git">
                            {$t(i18nKeys.console.resources.sourceKindRemoteGit)}
                          </Select.Item>
                          <Select.Item value="local-folder">
                            {$t(i18nKeys.console.resources.sourceKindLocalFolder)}
                          </Select.Item>
                          <Select.Item value="docker-image">
                            {$t(i18nKeys.console.resources.sourceKindDockerImage)}
                          </Select.Item>
                          <Select.Item value="compose">
                            {$t(i18nKeys.console.resources.sourceKindCompose)}
                          </Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </label>

                    <label class="space-y-1.5 text-sm font-medium" for="resource-source-locator">
                      <span>{$t(i18nKeys.console.resources.sourceLocator)}</span>
                      <Input
                        id="resource-source-locator"
                        bind:value={sourceLocator}
                        autocomplete="off"
                      />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium" for="resource-source-display-name">
                      <span>{$t(i18nKeys.console.resources.sourceDisplayName)}</span>
                      <Input
                        id="resource-source-display-name"
                        bind:value={sourceDisplayName}
                        autocomplete="off"
                      />
                    </label>

                    {#if sourceKindIsGit}
                      <label class="space-y-1.5 text-sm font-medium" for="resource-source-git-ref">
                        <span>{$t(i18nKeys.console.resources.sourceGitRef)}</span>
                        <Input
                          id="resource-source-git-ref"
                          bind:value={sourceGitRef}
                          autocomplete="off"
                        />
                      </label>

                      <label class="space-y-1.5 text-sm font-medium" for="resource-source-base-directory">
                        <span>{$t(i18nKeys.console.resources.sourceBaseDirectory)}</span>
                        <Input
                          id="resource-source-base-directory"
                          bind:value={sourceBaseDirectory}
                          autocomplete="off"
                        />
                      </label>

                      <label class="space-y-1.5 text-sm font-medium" for="resource-source-commit-sha">
                        <span>{$t(i18nKeys.console.resources.sourceCommitSha)}</span>
                        <Input
                          id="resource-source-commit-sha"
                          bind:value={sourceCommitSha}
                          autocomplete="off"
                        />
                      </label>
                    {/if}

                    {#if sourceKindIsDockerImage}
                      <label class="space-y-1.5 text-sm font-medium" for="resource-source-image-name">
                        <span>{$t(i18nKeys.console.resources.sourceImageName)}</span>
                        <Input
                          id="resource-source-image-name"
                          bind:value={sourceImageName}
                          autocomplete="off"
                        />
                      </label>

                      <label class="space-y-1.5 text-sm font-medium" for="resource-source-image-tag">
                        <span>{$t(i18nKeys.console.resources.sourceImageTag)}</span>
                        <Input
                          id="resource-source-image-tag"
                          bind:value={sourceImageTag}
                          autocomplete="off"
                        />
                      </label>

                      <label class="space-y-1.5 text-sm font-medium" for="resource-source-image-digest">
                        <span>{$t(i18nKeys.console.resources.sourceImageDigest)}</span>
                        <Input
                          id="resource-source-image-digest"
                          bind:value={sourceImageDigest}
                          autocomplete="off"
                        />
                      </label>
                    {/if}
                  </div>

                  {#if sourceFeedback}
                    <div
                      class={[
                        "mt-4 rounded-md border px-3 py-2 text-sm",
                        sourceFeedback.kind === "success"
                          ? "border-primary/25 bg-primary/5"
                          : "border-destructive/30 bg-destructive/5 text-destructive",
                      ]}
                    >
                      <p class="font-medium">{sourceFeedback.title}</p>
                      <p class="mt-1 break-all text-xs">{sourceFeedback.detail}</p>
                    </div>
                  {/if}

                  <div class="mt-4 flex justify-end">
                    <Button
                      type="submit"
                      disabled={!canConfigureSource || configureResourceSourceMutation.isPending}
                    >
                      {configureResourceSourceMutation.isPending
                        ? $t(i18nKeys.common.actions.saving)
                        : $t(i18nKeys.common.actions.save)}
                    </Button>
                  </div>
                </form>

                <form
                  id="resource-runtime-profile-form"
                  class="rounded-md border bg-background p-4"
                  onsubmit={configureResourceRuntime}
                >
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.resources.runtimeProfileTitle)}
                        </h2>
                        <Badge variant={resourceDetail?.runtimeProfile ? "default" : "outline"}>
                          {runtimeProfileStatusLabel}
                        </Badge>
                      </div>
                      <p class="mt-1 text-sm leading-6 text-muted-foreground">
                        {$t(i18nKeys.console.resources.runtimeProfileFormDescription)}
                      </p>
                    </div>
                  </div>

                  <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.resources.runtimeStrategy)}</span>
                      <Select.Root bind:value={runtimeStrategy} type="single">
                        <Select.Trigger class="w-full">
                          {runtimeStrategyLabel(runtimeStrategy)}
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="auto">
                            {$t(i18nKeys.console.resources.runtimeStrategyAuto)}
                          </Select.Item>
                          <Select.Item value="workspace-commands">
                            {$t(i18nKeys.console.resources.runtimeStrategyWorkspaceCommands)}
                          </Select.Item>
                          <Select.Item value="static">
                            {$t(i18nKeys.console.resources.runtimeStrategyStatic)}
                          </Select.Item>
                          <Select.Item value="dockerfile">
                            {$t(i18nKeys.console.resources.runtimeStrategyDockerfile)}
                          </Select.Item>
                          <Select.Item value="docker-compose">
                            {$t(i18nKeys.console.resources.runtimeStrategyDockerCompose)}
                          </Select.Item>
                          <Select.Item value="prebuilt-image">
                            {$t(i18nKeys.console.resources.runtimeStrategyPrebuiltImage)}
                          </Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </label>

                    <label class="space-y-1.5 text-sm font-medium" for="resource-runtime-install-command">
                      <span>{$t(i18nKeys.console.resources.runtimeInstallCommand)}</span>
                      <Input
                        id="resource-runtime-install-command"
                        bind:value={runtimeInstallCommand}
                        autocomplete="off"
                      />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium" for="resource-runtime-build-command">
                      <span>{$t(i18nKeys.console.resources.runtimeBuildCommand)}</span>
                      <Input
                        id="resource-runtime-build-command"
                        bind:value={runtimeBuildCommand}
                        autocomplete="off"
                      />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium" for="resource-runtime-start-command">
                      <span>{$t(i18nKeys.console.resources.runtimeStartCommand)}</span>
                      <Input
                        id="resource-runtime-start-command"
                        bind:value={runtimeStartCommand}
                        autocomplete="off"
                      />
                    </label>

                    {#if runtimeStrategy === "static"}
                      <label class="space-y-1.5 text-sm font-medium" for="resource-runtime-publish-directory">
                        <span>{$t(i18nKeys.console.resources.runtimePublishDirectory)}</span>
                        <Input
                          id="resource-runtime-publish-directory"
                          bind:value={runtimePublishDirectory}
                          autocomplete="off"
                          placeholder={$t(i18nKeys.console.resources.runtimePublishDirectoryPlaceholder)}
                        />
                      </label>
                    {/if}

                    {#if runtimeStrategy === "dockerfile"}
                      <label class="space-y-1.5 text-sm font-medium" for="resource-runtime-dockerfile-path">
                        <span>{$t(i18nKeys.console.resources.runtimeDockerfilePath)}</span>
                        <Input
                          id="resource-runtime-dockerfile-path"
                          bind:value={runtimeDockerfilePath}
                          autocomplete="off"
                          placeholder={$t(i18nKeys.console.resources.runtimeDockerfilePathPlaceholder)}
                        />
                      </label>

                      <label class="space-y-1.5 text-sm font-medium" for="resource-runtime-build-target">
                        <span>{$t(i18nKeys.console.resources.runtimeBuildTarget)}</span>
                        <Input
                          id="resource-runtime-build-target"
                          bind:value={runtimeBuildTarget}
                          autocomplete="off"
                        />
                      </label>
                    {/if}

                    {#if runtimeStrategy === "docker-compose"}
                      <label class="space-y-1.5 text-sm font-medium" for="resource-runtime-docker-compose-file-path">
                        <span>{$t(i18nKeys.console.resources.runtimeDockerComposeFilePath)}</span>
                        <Input
                          id="resource-runtime-docker-compose-file-path"
                          bind:value={runtimeDockerComposeFilePath}
                          autocomplete="off"
                          placeholder={$t(
                            i18nKeys.console.resources.runtimeDockerComposeFilePathPlaceholder,
                          )}
                        />
                      </label>
                    {/if}
                  </div>

                  {#if runtimeFeedback}
                    <div
                      class={[
                        "mt-4 rounded-md border px-3 py-2 text-sm",
                        runtimeFeedback.kind === "success"
                          ? "border-primary/25 bg-primary/5"
                          : "border-destructive/30 bg-destructive/5 text-destructive",
                      ]}
                    >
                      <p class="font-medium">{runtimeFeedback.title}</p>
                      <p class="mt-1 break-all text-xs">{runtimeFeedback.detail}</p>
                    </div>
                  {/if}

                  <div class="mt-4 flex justify-end">
                    <Button
                      type="submit"
                      disabled={!canConfigureRuntime || configureResourceRuntimeMutation.isPending}
                    >
                      {configureResourceRuntimeMutation.isPending
                        ? $t(i18nKeys.common.actions.saving)
                        : $t(i18nKeys.common.actions.save)}
                    </Button>
                  </div>
                </form>

                <form
                  id="resource-network-profile-form"
                  class="rounded-md border bg-background p-4"
                  onsubmit={configureResourceNetwork}
                >
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.resources.networkProfileTitle)}
                        </h2>
                        <Badge variant={resource.networkProfile ? "default" : "outline"}>
                          {networkProfileStatusLabel}
                        </Badge>
                      </div>
                      <p class="mt-1 text-sm leading-6 text-muted-foreground">
                        {$t(i18nKeys.console.resources.networkProfileFormDescription)}
                      </p>
                    </div>
                  </div>

                  <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <label class="space-y-1.5 text-sm font-medium" for="resource-network-internal-port">
                      <span>{$t(i18nKeys.common.domain.port)}</span>
                      <Input
                        id="resource-network-internal-port"
                        bind:value={networkInternalPort}
                        autocomplete="off"
                        inputmode="numeric"
                        placeholder="3000"
                      />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.common.domain.protocol)}</span>
                      <Select.Root bind:value={networkUpstreamProtocol} type="single">
                        <Select.Trigger class="w-full">
                          {networkProtocolLabel(networkUpstreamProtocol)}
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="http">
                            {$t(i18nKeys.console.resources.networkProtocolHttp)}
                          </Select.Item>
                          <Select.Item value="tcp">
                            {$t(i18nKeys.console.resources.networkProtocolTcp)}
                          </Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.common.domain.exposure)}</span>
                      <Select.Root bind:value={networkExposureMode} type="single">
                        <Select.Trigger class="w-full">
                          {networkExposureModeLabel(networkExposureMode)}
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="reverse-proxy">
                            {$t(i18nKeys.console.resources.networkExposureReverseProxy)}
                          </Select.Item>
                          <Select.Item value="none">
                            {$t(i18nKeys.console.resources.networkExposureNone)}
                          </Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </label>

                    {#if resource.services.length > 0}
                      <label class="space-y-1.5 text-sm font-medium">
                        <span>{$t(i18nKeys.console.resources.targetServiceName)}</span>
                        <Select.Root bind:value={networkTargetServiceName} type="single">
                          <Select.Trigger class="w-full">
                            {selectedNetworkTargetService?.name ??
                              $t(i18nKeys.console.resources.networkTargetServicePlaceholder)}
                          </Select.Trigger>
                          <Select.Content>
                            {#each resource.services as service (service.name)}
                              <Select.Item value={service.name}>{service.name}</Select.Item>
                            {/each}
                          </Select.Content>
                        </Select.Root>
                      </label>
                    {/if}
                  </div>

                  <p class="mt-3 text-xs leading-5 text-muted-foreground">
                    {$t(i18nKeys.console.resources.networkDirectPortDeferred)}
                  </p>

                  {#if networkFeedback}
                    <div
                      class={[
                        "mt-4 rounded-md border px-3 py-2 text-sm",
                        networkFeedback.kind === "success"
                          ? "border-primary/25 bg-primary/5"
                          : "border-destructive/30 bg-destructive/5 text-destructive",
                      ]}
                    >
                      <p class="font-medium">{networkFeedback.title}</p>
                      <p class="mt-1 break-all text-xs">{networkFeedback.detail}</p>
                    </div>
                  {/if}

                  <div class="mt-4 flex justify-end">
                    <Button
                      type="submit"
                      disabled={!canConfigureNetwork || configureResourceNetworkMutation.isPending}
                    >
                      {configureResourceNetworkMutation.isPending
                        ? $t(i18nKeys.common.actions.saving)
                        : $t(i18nKeys.common.actions.save)}
                    </Button>
                  </div>
                </form>

                <section id="resource-overview-access" class="rounded-md border bg-background p-4">
                  <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div class="min-w-0 space-y-2">
                      <p class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Link2 class="size-4" />
                        {$t(i18nKeys.console.resources.accessUrlTitle)}
                      </p>
                      {#if primaryAccessHref}
                        <a
                          class="block break-all text-lg font-semibold text-primary underline-offset-4 hover:underline md:text-xl"
                          href={primaryAccessHref}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {primaryAccessHref}
                        </a>
                        <div class="flex flex-wrap items-center gap-2">
                          {#if primaryAccessKind}
                            <Badge variant="outline">{resourceAccessKindLabel(primaryAccessKind)}</Badge>
                          {/if}
                          {#if primaryDomainBinding}
                            <Badge variant={domainBindingStatusVariant(primaryDomainBinding.status)}>
                              {domainBindingStatusLabel(primaryDomainBinding.status)}
                            </Badge>
                          {:else}
                            <Badge
                              variant={resourceAccessStatusVariant(
                                resource?.accessSummary?.proxyRouteStatus,
                              )}
                            >
                              {resourceAccessStatusLabel(resource?.accessSummary?.proxyRouteStatus)}
                            </Badge>
                          {/if}
                          {#if primaryAccessRoute?.targetPort}
                            <Badge variant="secondary">
                              {$t(i18nKeys.common.domain.port)} {primaryAccessRoute.targetPort}
                            </Badge>
                          {/if}
                        </div>
                      {:else}
                        <p class="text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.accessUrlEmpty)}
                        </p>
                      {/if}
                      <p class="text-xs leading-5 text-muted-foreground">
                        {$t(i18nKeys.console.resources.accessUrlDescription)}
                      </p>
                    </div>

                    {#if primaryAccessHref}
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
                </section>
              </div>

              {:else if activeSettingsSection === "domains"}
              <section id="resource-overview-domains" class="space-y-4">
                <div>
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.resources.domainBindingsTitle)}
                  </h2>
                  <p class="mt-1 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.resources.domainBindingsDescription)}
                  </p>
                </div>

                <form class="rounded-md border bg-background p-4" onsubmit={createResourceDomainBinding}>
                  <div class="flex flex-wrap gap-x-4 gap-y-1 border-b pb-3 text-xs text-muted-foreground">
                    <span>{$t(i18nKeys.common.domain.resource)}: {resource.name}</span>
                    <span>
                      {$t(i18nKeys.common.domain.server)}:
                      {selectedServer?.name ?? latestDeployment?.serverId ?? "-"}
                    </span>
                    <span>{$t(i18nKeys.common.domain.destination)}: {destinationId || "-"}</span>
                  </div>

                  <div class="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem_10rem_12rem]">
                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.common.domain.domainName)}</span>
                      <Input
                        bind:value={domainName}
                        autocomplete="off"
                        placeholder={$t(i18nKeys.console.domainBindings.formDomainPlaceholder)}
                      />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.common.domain.pathPrefix)}</span>
                      <Input bind:value={pathPrefix} autocomplete="off" placeholder="/" />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.common.domain.tls)}</span>
                      <Select.Root bind:value={tlsMode} type="single">
                        <Select.Trigger class="w-full">{tlsMode}</Select.Trigger>
                        <Select.Content>
                          <Select.Item value="auto">auto</Select.Item>
                          <Select.Item value="disabled">disabled</Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.common.domain.routeBehavior)}</span>
                      <Select.Root bind:value={routeMode} type="single">
                        <Select.Trigger class="w-full">
                          {routeMode === "redirect"
                            ? $t(i18nKeys.console.domainBindings.routeModeRedirect)
                            : $t(i18nKeys.console.domainBindings.routeModeServe)}
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="serve">
                            {$t(i18nKeys.console.domainBindings.routeModeServe)}
                          </Select.Item>
                          <Select.Item value="redirect">
                            {$t(i18nKeys.console.domainBindings.routeModeRedirect)}
                          </Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </label>
                  </div>

                  {#if routeMode === "redirect"}
                    <div class="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                      <label class="space-y-1.5 text-sm font-medium">
                        <span>{$t(i18nKeys.common.domain.redirectTo)}</span>
                        <Select.Root
                          bind:value={redirectTo}
                          type="single"
                          disabled={canonicalRedirectTargets.length === 0}
                        >
                          <Select.Trigger class="w-full">
                            {selectedCanonicalRedirectTarget?.domainName ??
                              $t(i18nKeys.console.domainBindings.noCanonicalDomainOptions)}
                          </Select.Trigger>
                          <Select.Content>
                            {#each canonicalRedirectTargets as binding (binding.id)}
                              <Select.Item value={binding.domainName}>{binding.domainName}</Select.Item>
                            {/each}
                          </Select.Content>
                        </Select.Root>
                      </label>

                      <label class="space-y-1.5 text-sm font-medium">
                        <span>{$t(i18nKeys.common.domain.redirectStatus)}</span>
                        <Select.Root bind:value={redirectStatus} type="single">
                          <Select.Trigger class="w-full">{redirectStatus}</Select.Trigger>
                          <Select.Content>
                            <Select.Item value="308">308</Select.Item>
                            <Select.Item value="301">301</Select.Item>
                            <Select.Item value="307">307</Select.Item>
                            <Select.Item value="302">302</Select.Item>
                          </Select.Content>
                        </Select.Root>
                      </label>
                    </div>
                  {/if}

                  {#if shouldShowServerField || shouldShowDestinationField}
                    <div class="mt-4 grid gap-4 sm:grid-cols-2">
                      {#if shouldShowServerField}
                        <label class="space-y-1.5 text-sm font-medium">
                          <span>{$t(i18nKeys.common.domain.server)}</span>
                          <Select.Root bind:value={serverId} type="single">
                            <Select.Trigger class="w-full">
                              {selectedServer?.name ??
                                $t(i18nKeys.console.domainBindings.noServerOptions)}
                            </Select.Trigger>
                            <Select.Content>
                              {#each servers as server (server.id)}
                                <Select.Item value={server.id}>{server.name}</Select.Item>
                              {/each}
                            </Select.Content>
                          </Select.Root>
                        </label>
                      {/if}

                      {#if shouldShowDestinationField}
                        <label class="space-y-1.5 text-sm font-medium">
                          <span>{$t(i18nKeys.common.domain.destination)}</span>
                          <Input
                            bind:value={destinationId}
                            autocomplete="off"
                            placeholder={$t(i18nKeys.console.domainBindings.formDestinationPlaceholder)}
                          />
                        </label>
                      {/if}
                    </div>
                  {/if}

                  {#if createFeedback}
                    <div
                      class={[
                        "mt-4 rounded-md border px-3 py-2 text-sm",
                        createFeedback.kind === "success"
                          ? "border-primary/25 bg-primary/5"
                          : "border-destructive/30 bg-destructive/5 text-destructive",
                      ]}
                    >
                      <p class="font-medium">{createFeedback.title}</p>
                      <p class="mt-1 break-all text-xs">{createFeedback.detail}</p>
                    </div>
                  {/if}

                  <div class="mt-4 flex justify-end">
                    <Button
                      type="submit"
                      disabled={!canCreateBinding || createDomainBindingMutation.isPending}
                    >
                      <Globe2 class="size-4" />
                      {createDomainBindingMutation.isPending
                        ? $t(i18nKeys.console.domainBindings.formSubmitting)
                        : $t(i18nKeys.common.actions.bindDomain)}
                    </Button>
                  </div>
                </form>

                <div class="space-y-3">
                  {#if resourceDomainBindings.length > 0}
                    {#each resourceDomainBindings as binding (binding.id)}
                      {@const server = findServer(servers, binding.serverId)}
                      <article class="rounded-md border bg-background p-4">
                        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div class="min-w-0 space-y-2">
                            <div class="flex flex-wrap items-center gap-2">
                              <Globe2 class="size-4 text-muted-foreground" />
                              <a
                                class="truncate font-medium text-primary underline-offset-4 hover:underline"
                                href={domainBindingHref(binding)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {binding.domainName}
                              </a>
                              <Badge variant={domainBindingStatusVariant(binding.status)}>
                                {domainBindingStatusLabel(binding.status)}
                              </Badge>
                            </div>
                            <p class="text-sm text-muted-foreground">
                              {binding.pathPrefix} · {binding.proxyKind} · {$t(
                                i18nKeys.common.domain.tls,
                              )}
                              {" "}
                              {binding.tlsMode}
                              {#if binding.redirectTo}
                                · {$t(i18nKeys.common.domain.redirectTo)} {binding.redirectTo}
                                ({binding.redirectStatus ?? 308})
                              {/if}
                            </p>
                          </div>
                          <div class="flex flex-wrap items-center gap-2">
                            {#if binding.status === "pending_verification"}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={confirmDomainBindingOwnershipMutation.isPending}
                                onclick={() => confirmDomainBindingOwnership(binding)}
                              >
                                <Check class="size-4" />
                                {confirmDomainBindingOwnershipMutation.isPending
                                  ? $t(i18nKeys.console.domainBindings.confirmingOwnership)
                                  : $t(i18nKeys.console.domainBindings.confirmOwnership)}
                              </Button>
                            {/if}
                            <p class="text-xs text-muted-foreground">{formatTime(binding.createdAt)}</p>
                          </div>
                        </div>
                        <div class="mt-3 grid gap-3 sm:grid-cols-3">
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <p class="text-xs text-muted-foreground">
                              {$t(i18nKeys.common.domain.server)}
                            </p>
                            <p class="mt-1 truncate text-sm font-medium">
                              {server?.name ?? binding.serverId}
                            </p>
                          </div>
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <p class="text-xs text-muted-foreground">
                              {$t(i18nKeys.common.domain.destination)}
                            </p>
                            <p class="mt-1 truncate text-sm font-medium">{binding.destinationId}</p>
                          </div>
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <p class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.domainBindings.verificationAttempts, {
                                count: binding.verificationAttemptCount,
                              })}
                            </p>
                            <p class="mt-1 truncate text-sm font-medium">
                              {binding.certificatePolicy}
                            </p>
                          </div>
                        </div>
                      </article>
                    {/each}
                  {:else}
                    <div class="rounded-md border bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.resources.noDomainBindings)}
                    </div>
                  {/if}
                </div>
              </section>

              {:else if activeSettingsSection === "health"}
              <section id="resource-overview-health" class="rounded-md border bg-background p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 class="text-lg font-semibold">
                      {$t(i18nKeys.console.resources.healthPolicy)}
                    </h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.resources.healthDescription)}
                    </p>
                  </div>
                  <Badge variant={resourceHealthSectionStatusVariant(resourceHealth?.healthPolicy.status)}>
                    {resourceHealthSectionStatusLabel(resourceHealth?.healthPolicy.status)}
                  </Badge>
                </div>

                <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div class="rounded-md bg-muted/30 px-3 py-2">
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.resources.healthChecks)}
                    </p>
                    <p class="mt-1 truncate text-sm font-medium">
                      {resourceHealth?.healthPolicy.type ?? "-"}
                    </p>
                  </div>
                  <div class="rounded-md bg-muted/30 px-3 py-2">
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.quickDeploy.healthCheckPath)}
                    </p>
                    <p class="mt-1 truncate text-sm font-medium">
                      {resourceHealth?.healthPolicy.path ?? "-"}
                    </p>
                  </div>
                  <div class="rounded-md bg-muted/30 px-3 py-2">
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.quickDeploy.healthCheckIntervalSeconds)}
                    </p>
                    <p class="mt-1 truncate text-sm font-medium">
                      {resourceHealth?.healthPolicy.intervalSeconds ?? "-"}
                    </p>
                  </div>
                  <div class="rounded-md bg-muted/30 px-3 py-2">
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.quickDeploy.healthCheckRetries)}
                    </p>
                    <p class="mt-1 truncate text-sm font-medium">
                      {resourceHealth?.healthPolicy.retries ?? "-"}
                    </p>
                  </div>
                </div>

                <form class="mt-5 border-t pt-4" onsubmit={configureResourceHealth}>
                  <Button
                    type="button"
                    variant={healthEnabled ? "selected" : "outline"}
                    aria-pressed={healthEnabled}
                    onclick={() => {
                      healthEnabled = !healthEnabled;
                    }}
                  >
                    {$t(i18nKeys.console.quickDeploy.healthCheckToggle)}
                  </Button>

                  <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckMethod)}</span>
                      <Select.Root bind:value={healthMethod} type="single">
                        <Select.Trigger class="w-full">{healthMethod}</Select.Trigger>
                        <Select.Content>
                          <Select.Item value="GET">GET</Select.Item>
                          <Select.Item value="HEAD">HEAD</Select.Item>
                          <Select.Item value="POST">POST</Select.Item>
                          <Select.Item value="OPTIONS">OPTIONS</Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckScheme)}</span>
                      <Select.Root bind:value={healthScheme} type="single">
                        <Select.Trigger class="w-full">{healthScheme}</Select.Trigger>
                        <Select.Content>
                          <Select.Item value="http">http</Select.Item>
                          <Select.Item value="https">https</Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckHost)}</span>
                      <Input bind:value={healthHost} autocomplete="off" disabled={!healthEnabled} />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckPath)}</span>
                      <Input bind:value={healthPath} autocomplete="off" disabled={!healthEnabled} />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckPort)}</span>
                      <Input bind:value={healthPort} autocomplete="off" disabled={!healthEnabled} />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckExpectedStatusCode)}</span>
                      <Input
                        bind:value={healthExpectedStatus}
                        autocomplete="off"
                        disabled={!healthEnabled}
                      />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckIntervalSeconds)}</span>
                      <Input bind:value={healthIntervalSeconds} autocomplete="off" />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckTimeoutSeconds)}</span>
                      <Input bind:value={healthTimeoutSeconds} autocomplete="off" />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckRetries)}</span>
                      <Input bind:value={healthRetries} autocomplete="off" />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckStartPeriodSeconds)}</span>
                      <Input bind:value={healthStartPeriodSeconds} autocomplete="off" />
                    </label>

                    <label class="space-y-1.5 text-sm font-medium sm:col-span-2">
                      <span>{$t(i18nKeys.console.quickDeploy.healthCheckResponseText)}</span>
                      <Input
                        bind:value={healthExpectedText}
                        autocomplete="off"
                        disabled={!healthEnabled}
                      />
                    </label>
                  </div>

                  {#if healthFeedback}
                    <div
                      class={[
                        "mt-4 rounded-md border px-3 py-2 text-sm",
                        healthFeedback.kind === "success"
                          ? "border-primary/25 bg-primary/5"
                          : "border-destructive/30 bg-destructive/5 text-destructive",
                      ]}
                    >
                      <p class="font-medium">{healthFeedback.title}</p>
                      <p class="mt-1 break-all text-xs">{healthFeedback.detail}</p>
                    </div>
                  {/if}

                  <div class="mt-4 flex justify-end">
                    <Button
                      type="submit"
                      disabled={!canConfigureHealth || configureResourceHealthMutation.isPending}
                    >
                      {configureResourceHealthMutation.isPending
                        ? $t(i18nKeys.common.actions.saving)
                        : $t(i18nKeys.common.actions.save)}
                    </Button>
                  </div>
                </form>
              </section>

              {:else if activeSettingsSection === "proxy"}
              <section id="resource-overview-proxy" class="space-y-4">
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div class="flex items-start gap-3">
                    <div class="bg-muted p-2">
                      <Route class="size-4" />
                    </div>
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.resources.proxyConfigurationTitle)}
                        </h2>
                        {#if proxyConfiguration}
                          <Badge variant={proxyConfigurationStatusVariant(proxyConfiguration.status)}>
                            {proxyConfigurationStatusLabel(proxyConfiguration.status)}
                          </Badge>
                        {/if}
                      </div>
                      <p class="mt-1 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.proxyConfigurationDescription)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onclick={refreshProxyConfiguration}
                    disabled={proxyConfigurationLoading}
                  >
                    <RefreshCw class={["size-4", proxyConfigurationLoading ? "animate-spin" : ""]} />
                    {$t(i18nKeys.console.resources.proxyConfigurationRefresh)}
                  </Button>
                </div>

                {#if proxyConfigurationError}
                  <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {proxyConfigurationError}
                  </div>
                {/if}

                <div class="space-y-3">
                  {#if proxyConfigurationLoading}
                    <div class="rounded-md bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.resources.proxyConfigurationLoading)}
                    </div>
                  {:else if !proxyConfiguration || proxyConfiguration.sections.length === 0}
                    <div class="rounded-md bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.resources.proxyConfigurationEmpty)}
                    </div>
                  {:else}
                    <div class="grid gap-3 md:grid-cols-3">
                      <div class="rounded-md bg-muted/30 px-3 py-2 text-sm">
                        <span class="text-muted-foreground">{$t(i18nKeys.common.domain.proxy)}</span>
                        <span class="ml-2 font-medium">{proxyConfiguration.providerKey}</span>
                      </div>
                      <div class="rounded-md bg-muted/30 px-3 py-2 text-sm">
                        <span class="text-muted-foreground">
                          {$t(i18nKeys.common.domain.resources)}
                        </span>
                        <span class="ml-2 font-medium">{proxyConfiguration.routes.length}</span>
                      </div>
                      <div class="rounded-md bg-muted/30 px-3 py-2 text-sm">
                        <span class="text-muted-foreground">
                          {$t(i18nKeys.console.resources.proxyConfigurationGeneratedAt)}
                        </span>
                        <span class="ml-2 font-medium">
                          {formatTime(proxyConfiguration.generatedAt)}
                        </span>
                      </div>
                    </div>

                    {#each proxyConfiguration.sections as section (section.id)}
                      <article class="rounded-md bg-muted/20">
                        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                          <h3 class="font-medium">{section.title}</h3>
                          <Badge variant="outline">{section.format}</Badge>
                        </div>
                        <pre class="max-h-80 overflow-auto p-4 text-xs"><code>{section.content}</code></pre>
                      </article>
                    {/each}
                  {/if}
                </div>
              </section>

              {:else if activeSettingsSection === "diagnostics"}
              <section id="resource-overview-diagnostics" class="rounded-md border bg-background p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 class="text-lg font-semibold">
                      {$t(i18nKeys.console.resources.diagnosticsTitle)}
                    </h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.resources.diagnosticsDescription)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onclick={copyResourceDiagnosticSummary}
                    disabled={diagnosticSummaryLoading}
                  >
                    <Clipboard class="size-4" />
                    {diagnosticSummaryButtonLabel}
                  </Button>
                </div>

                {#if diagnosticSummaryError}
                  <div class="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {diagnosticSummaryError}
                  </div>
                {/if}
                {#if diagnosticSummaryCopyFallback}
                  <div class="mt-4 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <div class="space-y-1">
                      <p class="text-sm font-medium text-destructive">
                        {$t(i18nKeys.console.resources.diagnosticSummaryCopyFallbackTitle)}
                      </p>
                      <p class="text-xs leading-5 text-muted-foreground">
                        {$t(i18nKeys.console.resources.diagnosticSummaryCopyFallbackDescription)}
                      </p>
                    </div>
                    <Textarea
                      class="min-h-48 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs leading-5"
                      readonly
                      value={diagnosticSummaryCopyFallback}
                      onclick={selectDiagnosticSummaryFallback}
                      onfocus={selectDiagnosticSummaryFallback}
                    />
                  </div>
                {/if}
              </section>
              {/if}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="logs" class="mt-0">
          <section id="resource-runtime-logs" class="space-y-4">
              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div class="flex items-start gap-3">
                  <div class="bg-muted p-2">
                    <Terminal class="size-4" />
                  </div>
                  <div>
                    <h2 class="text-lg font-semibold">
                      {$t(i18nKeys.console.resources.runtimeLogsTitle)}
                    </h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.resources.runtimeLogsDescription)}
                    </p>
                    {#if runtimeLogsLoading || runtimeLogsFollowing}
                      <p class="mt-2 text-xs text-muted-foreground">
                        {runtimeLogsLoading
                          ? $t(i18nKeys.console.resources.runtimeLogsConnecting)
                          : $t(i18nKeys.console.resources.runtimeLogsFollowing)}
                      </p>
                    {/if}
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onclick={refreshRuntimeLogs}
                    disabled={runtimeLogsLoading || runtimeLogsFollowing}
                  >
                    <RefreshCw class={["size-4", runtimeLogsLoading ? "animate-spin" : ""]} />
                    {$t(i18nKeys.console.resources.runtimeLogsRefresh)}
                  </Button>
                  <Button
                    variant={runtimeLogsFollowing ? "secondary" : "default"}
                    onclick={runtimeLogsFollowing ? stopRuntimeLogFollow : startRuntimeLogFollow}
                    disabled={runtimeLogsLoading && !runtimeLogsFollowing}
                  >
                    <Terminal class="size-4" />
                    {runtimeLogsFollowing
                      ? $t(i18nKeys.console.resources.runtimeLogsStopFollow)
                      : $t(i18nKeys.console.resources.runtimeLogsStartFollow)}
                  </Button>
                </div>
              </div>

              {#if runtimeLogsError}
                <div class="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {runtimeLogsError}
                </div>
              {/if}

              <div class="mt-4 max-h-96 overflow-auto rounded-md border bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
                {#if runtimeLogsLoading}
                  <p class="text-zinc-400">{$t(i18nKeys.console.resources.runtimeLogsLoading)}</p>
                {:else if runtimeLogs.length === 0}
                  <p class="text-zinc-400">{$t(i18nKeys.console.resources.runtimeLogsEmpty)}</p>
                {:else}
                  <div class="space-y-1">
                    {#each runtimeLogs as line, index (`${line.sequence ?? index}-${line.timestamp ?? ""}-${line.message}`)}
                      <div class="grid gap-2 sm:grid-cols-[10rem_1fr]">
                        <span class="truncate text-zinc-500">
                          {line.timestamp ? formatTime(line.timestamp) : line.stream}
                        </span>
                        <span
                          class={["break-words", line.masked ? "text-amber-200" : "text-zinc-100"]}
                        >
                          {line.message}
                        </span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
          </section>
        </Tabs.Content>

        <Tabs.Content value="terminal" class="mt-0">
          <TerminalSessionPanel
            title={$t(i18nKeys.console.terminal.resourceTitle)}
            description={$t(i18nKeys.console.terminal.resourceDescription)}
            disabled={resourceDeployments.length === 0}
            scope={{
              kind: "resource",
              resourceId: resource.id,
            }}
          />
        </Tabs.Content>
      </Tabs.Root>

    </div>
  {/if}
</ConsoleShell>

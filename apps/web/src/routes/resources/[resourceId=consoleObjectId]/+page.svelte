<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onDestroy, untrack } from "svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import {
    ArrowLeft,
    ArrowRight,
    Archive,
    Check,
    Clipboard,
    Copy,
    Database,
    Eye,
    Gauge,
    HardDrive,
    Globe2,
    Link2,
    Play,
    Plus,
    RefreshCw,
    RotateCw,
    Route,
    GitBranch,
    Server,
    ShieldCheck,
    Square,
    Terminal,
    Trash2,
    X,
  } from "@lucide/svelte";
  import type { TranslationKey } from "@appaloft/i18n";
  import type {
    ArchiveResourceInput,
    AttachResourceStorageInput,
    CertificateSummary,
    CleanupStorageVolumeRuntimeResponse,
    ConfigureResourceAutoDeployInput,
    ConfigureResourceAccessInput,
    ConfigureResourceHealthInput,
    ConfigureResourceNetworkInput,
    ConfigureResourceRuntimeInput,
    ConfigureResourceSourceInput,
    ConfirmDomainBindingOwnershipInput,
    CreateDeploymentInput,
    CreateDomainBindingInput,
    CreateStorageVolumeInput,
    DeleteResourceInput,
    DependencyResourceSummary,
    DeploymentPlanResponse,
    DeploymentProgressEvent,
    DomainBindingSummary,
    ImportCertificateInput,
    InspectRuntimeUsageResponse,
    ProxyConfigurationView,
    PreviewEnvironmentSummary,
    ResourceConfigEntry,
    ResourceDetail,
    ResourceEffectiveConfig,
    ResourceHealthOverall,
    ResourceRuntimeLogEvent,
    ResourceRuntimeLogLine,
    ResourceDependencyBindingSummary,
    ResourceStorageAttachmentSummary,
    ResourceSummary,
    RuntimeUsageScope,
    ScheduledTaskDefinitionSummary,
    ScheduledTaskRunLogEntry,
    ScheduledTaskRunStatus,
    ScheduledTaskRunSummary,
    ScheduledTaskRunTriggerKind,
    SourceEventListItem,
    RestartResourceRuntimeInput,
    RenameStorageVolumeInput,
    SetResourceVariableInput,
    StartResourceRuntimeInput,
    StopResourceRuntimeInput,
    StorageVolumeBackupPlanResponse,
    StorageVolumeBackupSummary,
    StorageVolumeSummary,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import { capabilities, capabilityKey, type CapabilityQuery } from "$lib/capabilities";
  import CapabilityGate from "$lib/components/console/CapabilityGate.svelte";
  import ConsoleStatePanel from "$lib/components/console/ConsoleStatePanel.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentProgressDialog from "$lib/components/console/DeploymentProgressDialog.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import ResourceProfileSummary from "$lib/components/console/ResourceProfileSummary.svelte";
  import RuntimeMonitorPanel from "$lib/components/console/RuntimeMonitorPanel.svelte";
  import RuntimeUsagePanel from "$lib/components/console/RuntimeUsagePanel.svelte";
  import ResourceStatusDot from "$lib/components/console/ResourceStatusDot.svelte";
  import TerminalSessionPanel from "$lib/components/console/TerminalSessionPanel.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as Popover from "$lib/components/ui/popover";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Textarea } from "$lib/components/ui/textarea";
  import {
    createDeploymentWithProgress,
    type DeploymentProgressDialogStatus,
  } from "$lib/console/deployment-progress";
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
    subnavItemClass,
    subnavItemTitleClass,
    subnavListClass,
  } from "$lib/console/layout-classes";
  import { createConsoleQueries } from "$lib/console/queries";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";
  import {
    selectCurrentResourceAccessRoute,
    type CurrentResourceAccessRoute,
    type CurrentResourceAccessRouteKind,
  } from "$lib/console/resource-access-route";
  import {
    sourceEventDeploymentHref,
    sourceEventRevisionLabel,
    sourceEventVisibleOutcomes,
  } from "$lib/console/source-events";
  import {
    runtimeMonitoringRollupQueryOptions,
    runtimeMonitoringSamplesQueryOptions,
    runtimeMonitoringThresholdsQueryOptions,
    type RuntimeMonitoringTimeRangeId,
    runtimeUsageQueryOptions,
  } from "$lib/console/runtime-usage-query";
  import {
    runtimeMonitoringDeploymentInObservationWindow,
    runtimeMonitoringObservationHandoffFromSearchParams,
    runtimeMonitoringObservationHandoffMatchesScope,
    runtimeMonitoringSampleFromUsage,
    runtimeMonitoringTimestampInObservationWindow,
  } from "$lib/console/runtime-usage";
  import {
    deploymentDetailHref,
    findEnvironment,
    findProject,
    findServer,
    formatTime,
    projectDetailHref,
    resourceDetailHref,
    resourcePreviewEnvironmentDetailHref,
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

  function runtimeUsageHasMonitorSignals(usage: InspectRuntimeUsageResponse | null): boolean {
    const sample = runtimeMonitoringSampleFromUsage(usage);

    return Boolean(
      sample &&
        (sample.cpuLoadPercent !== null ||
          sample.memoryPercent !== null ||
          sample.diskPercent !== null),
    );
  }
  type WindowWithAppaloftDesktopBridge = Window &
    typeof globalThis & {
      appaloftDesktop?: AppaloftDesktopBridge;
  };
  type ResourceDetailTab =
    | "overview"
    | "deployments"
    | "monitor"
    | "logs"
    | "terminal"
    | "networking"
    | "configuration"
    | "dependencies"
    | "previews"
    | "jobs"
    | "settings";
  let runtimeMonitoringTimeRange = $state<RuntimeMonitoringTimeRangeId>("1h");
  type ResourceAccessSummary = NonNullable<ResourceSummary["accessSummary"]>;
  type ResourceAccessRoute = CurrentResourceAccessRoute["route"];
  type ResourceAccessKind = "domain-binding" | CurrentResourceAccessRouteKind;
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
  type AccessProfileInput = ConfigureResourceAccessInput["accessProfile"];
  type GeneratedAccessMode = AccessProfileInput["generatedAccessMode"];
  type SourceProfileInput = ConfigureResourceSourceInput["source"];
  type SourceKind = SourceProfileInput["kind"];
  type SourceVersionKind = NonNullable<SourceProfileInput["versionKind"]>;
  type AutoDeployPolicyInput = NonNullable<ConfigureResourceAutoDeployInput["policy"]>;
  type AutoDeployTriggerKind = AutoDeployPolicyInput["triggerKind"];
  type AutoDeployEventKind = AutoDeployPolicyInput["eventKinds"][number];
  type CreateScheduledTaskInput = Parameters<typeof orpcClient.scheduledTasks.create>[0];
  type ConfigureScheduledTaskInput = Parameters<typeof orpcClient.scheduledTasks.configure>[0];
  type DeleteScheduledTaskInput = Parameters<typeof orpcClient.scheduledTasks.delete>[0];
  type RunScheduledTaskNowInput = Parameters<typeof orpcClient.scheduledTasks.runNow>[0];
  type ImportResourceVariablesInput = Parameters<typeof orpcClient.resources.importVariables>[0];
  type BindResourceDependencyInput = Parameters<typeof orpcClient.resources.dependencyBindings.bind>[0];
  type UnbindResourceDependencyInput = Parameters<typeof orpcClient.resources.dependencyBindings.unbind>[0];
  type RotateResourceDependencyBindingSecretInput = Parameters<
    typeof orpcClient.resources.dependencyBindings.rotateSecret
  >[0];
  type CleanupStorageVolumeRuntimeInput = Parameters<
    typeof orpcClient.storageVolumes.cleanupRuntime
  >[0];
  type CreateStorageVolumeBackupPlanInput = Parameters<
    typeof orpcClient.storageVolumes.backups.plan
  >[0];
  type CreateStorageVolumeBackupInput = Parameters<typeof orpcClient.storageVolumes.backups.create>[0];
  type RestoreStorageVolumeBackupInput = Parameters<
    typeof orpcClient.storageVolumes.backups.restore
  >[0];
  type StorageRuntimeCleanupCandidate = CleanupStorageVolumeRuntimeResponse["candidates"][number];
  type StorageVolumeCardAttachment = ResourceStorageAttachmentSummary | StorageVolumeSummary["attachments"][number];
  type RelinkSourceLinkInput = Parameters<typeof orpcClient.sourceLinks.relink>[0];
  type DomainRouteMode = "serve" | "redirect";
  type RedirectStatusText = "301" | "302" | "307" | "308";
  type ResourceDetailSection =
    | "access"
    | "general"
    | "profile"
    | "auto-deploy"
    | "storage"
    | "configuration"
    | "domains"
    | "dependencies"
    | "health"
    | "proxy"
    | "diagnostics"
    | "scheduled-tasks"
    | "source-events"
    | "danger";
  type ResourceLifecycleAction = "archive" | "delete";
  type ResourceVariableKind = SetResourceVariableInput["kind"];
  type ResourceVariableExposure = SetResourceVariableInput["exposure"];
  const resourceDetailTabs = [
    "overview",
    "deployments",
    "monitor",
    "logs",
    "terminal",
    "networking",
    "configuration",
    "dependencies",
    "previews",
    "jobs",
    "settings",
  ] as const;
  const resourceNetworkingSections = ["access", "domains", "proxy"] as const;
  const resourceConfigurationSections = [
    "profile",
    "configuration",
    "auto-deploy",
    "health",
  ] as const;
  const resourceDependenciesSections = ["dependencies", "storage"] as const;
  const resourceJobsSections = ["scheduled-tasks", "source-events"] as const;
  const resourceSettingsSections = [
    "general",
    "diagnostics",
    "danger",
  ] as const;
  const allResourceDetailSections = [
    ...resourceNetworkingSections,
    ...resourceConfigurationSections,
    ...resourceDependenciesSections,
    ...resourceJobsSections,
    ...resourceSettingsSections,
  ] as const satisfies readonly ResourceDetailSection[];

  const {
    projectsQuery,
    environmentsQuery,
    resourcesQuery,
    serversQuery,
    deploymentsQuery,
    domainBindingsQuery,
    certificatesQuery,
  } = createConsoleQueries(browser);
  const resourceId = $derived(page.params.resourceId ?? "");
  const activeTab = $derived(
    parseResourceDetailTab(page.url.searchParams.get("tab")),
  );
  const activeResourceSection = $derived(
    parseResourceDetailSection(activeTab, page.url.searchParams.get("section")),
  );
  const resourceRuntimeMonitorActive = $derived(
    activeTab === "monitor",
  );
  const resourceRuntimeMonitorEnabled = $derived(
    browser && resourceId.length > 0 && resourceRuntimeMonitorActive,
  );
  const resourceSourceEventsEnabled = $derived(
    browser &&
      resourceId.length > 0 &&
      activeTab === "jobs" &&
      activeResourceSection === "source-events",
  );
  const resourcePreviewsEnabled = $derived(
    browser && resourceId.length > 0 && activeTab === "previews",
  );
  const resourceScheduledTasksEnabled = $derived(
    browser &&
      resourceId.length > 0 &&
      activeTab === "jobs" &&
      activeResourceSection === "scheduled-tasks",
  );
  let storageBackupVolumeId = $state("");
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
  const resourceEffectiveConfigQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resources", "effective-config", resourceId],
      queryFn: () =>
        orpcClient.resources.effectiveConfig({
          resourceId,
        }),
      enabled: browser && resourceId.length > 0,
      staleTime: 5_000,
    }),
  );
  const resourceSourceEventsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["source-events", "resource", resourceId],
      queryFn: () =>
        orpcClient.sourceEvents.list({
          resourceId,
          limit: 25,
        }),
      enabled: resourceSourceEventsEnabled,
      staleTime: 5_000,
    }),
  );
  const resourcePreviewEnvironmentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["preview-environments", "resource", resourceId],
      queryFn: () =>
        orpcClient.previewEnvironments.list({
          resourceId,
          limit: 50,
        }),
      enabled: resourcePreviewsEnabled,
      staleTime: 5_000,
    }),
  );
  const scheduledTasksQuery = createQuery(() =>
    queryOptions({
      queryKey: ["scheduled-tasks", "resource", resourceId],
      queryFn: () =>
        orpcClient.scheduledTasks.list({
          resourceId,
          limit: 25,
        }),
      enabled: resourceScheduledTasksEnabled,
      staleTime: 5_000,
    }),
  );
  const scheduledTaskRunsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["scheduled-task-runs", "resource", resourceId],
      queryFn: () =>
        orpcClient.scheduledTasks.runs.list({
          resourceId,
          limit: 25,
        }),
      enabled: browser && resourceId.length > 0,
      staleTime: 5_000,
    }),
  );
  const resourceRuntimeScope = $derived({
    kind: "resource" as const,
    resourceId,
  });
  const resourceRuntimeUsageQuery = createQuery(() =>
    runtimeUsageQueryOptions(resourceRuntimeScope, resourceRuntimeMonitorEnabled),
  );
  const resourceRuntimeUsage = $derived(resourceRuntimeUsageQuery.data ?? null);
  const resourceRuntimeUsageHasMonitorValues = $derived(
    runtimeUsageHasMonitorSignals(resourceRuntimeUsage),
  );
  const resourceRuntimeMonitoringSamplesQuery = createQuery(() =>
    runtimeMonitoringSamplesQueryOptions(
      resourceRuntimeScope,
      resourceRuntimeMonitorEnabled,
      runtimeMonitoringTimeRange,
    ),
  );
  const resourceRuntimeMonitoringRollupQuery = createQuery(() =>
    runtimeMonitoringRollupQueryOptions(
      resourceRuntimeScope,
      resourceRuntimeMonitorEnabled,
      runtimeMonitoringTimeRange,
    ),
  );
  const resourceRuntimeMonitoringThresholdsQuery = createQuery(() =>
    runtimeMonitoringThresholdsQueryOptions(resourceRuntimeScope, resourceRuntimeMonitorEnabled),
  );

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const domainBindings = $derived(domainBindingsQuery.data?.items ?? []);
  const certificates = $derived(certificatesQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      serversQuery.isPending ||
      deploymentsQuery.isPending ||
      domainBindingsQuery.isPending ||
      certificatesQuery.isPending ||
      resourceDetailQuery.isPending,
  );
  const resourceDetail = $derived(resourceDetailQuery.data ?? null);
  const isResourceArchived = $derived(resourceDetail?.lifecycle.status === "archived");
  const resource = $derived(resourceDetail ? resourceSummaryFromDetail(resourceDetail) : null);
  const resourceProjectId = $derived(resource?.projectId ?? "");
  const resourceEnvironmentId = $derived(resource?.environmentId ?? "");
  const resourceCapabilityRefs = $derived(
    resource ? { projectId: resource.projectId, resourceId: resource.id } : undefined,
  );
  const resourceCapabilityQueries = $derived<CapabilityQuery[]>(
    resourceCapabilityRefs
      ? [
          {
            operationKey: "resources.configure-runtime",
            resourceRefs: resourceCapabilityRefs,
          },
          { operationKey: "resources.runtime.stop", resourceRefs: resourceCapabilityRefs },
          { operationKey: "resources.runtime.start", resourceRefs: resourceCapabilityRefs },
          { operationKey: "resources.runtime.restart", resourceRefs: resourceCapabilityRefs },
        ]
      : [],
  );
  const resourceCapabilityLoadKey = $derived(resourceCapabilityQueries.map(capabilityKey).join("\n"));
  const configureRuntimeCapabilityKey = $derived(
    resourceCapabilityRefs
      ? capabilityKey({
          operationKey: "resources.configure-runtime",
          resourceRefs: resourceCapabilityRefs,
        })
      : "",
  );
  const stopRuntimeCapabilityKey = $derived(
    resourceCapabilityRefs
      ? capabilityKey({ operationKey: "resources.runtime.stop", resourceRefs: resourceCapabilityRefs })
      : "",
  );
  const startRuntimeCapabilityKey = $derived(
    resourceCapabilityRefs
      ? capabilityKey({ operationKey: "resources.runtime.start", resourceRefs: resourceCapabilityRefs })
      : "",
  );
  const restartRuntimeCapabilityKey = $derived(
    resourceCapabilityRefs
      ? capabilityKey({
          operationKey: "resources.runtime.restart",
          resourceRefs: resourceCapabilityRefs,
        })
      : "",
  );
  const canConfigureRuntimeByCapability = $derived(
    configureRuntimeCapabilityKey
      ? $capabilities.capabilities[configureRuntimeCapabilityKey]?.allowed === true
      : false,
  );
  const canStopRuntimeByCapability = $derived(
    stopRuntimeCapabilityKey
      ? $capabilities.capabilities[stopRuntimeCapabilityKey]?.allowed === true
      : false,
  );
  const canStartRuntimeByCapability = $derived(
    startRuntimeCapabilityKey
      ? $capabilities.capabilities[startRuntimeCapabilityKey]?.allowed === true
      : false,
  );
  const canRestartRuntimeByCapability = $derived(
    restartRuntimeCapabilityKey
      ? $capabilities.capabilities[restartRuntimeCapabilityKey]?.allowed === true
      : false,
  );
  let loadedResourceCapabilityLoadKey = $state("");
  $effect(() => {
    if (
      !browser ||
      resourceCapabilityQueries.length === 0 ||
      resourceCapabilityLoadKey === loadedResourceCapabilityLoadKey
    ) {
      return;
    }

    loadedResourceCapabilityLoadKey = resourceCapabilityLoadKey;
    void capabilities.fetch(resourceCapabilityQueries);
  });
  const storageVolumesQuery = createQuery(() =>
    queryOptions({
      queryKey: [
        "storage-volumes",
        "resource-attach",
        resourceProjectId,
        resourceEnvironmentId,
      ],
      queryFn: () =>
        orpcClient.storageVolumes.list({
          projectId: resourceProjectId,
          environmentId: resourceEnvironmentId,
        }),
      enabled: browser && resourceProjectId.length > 0 && resourceEnvironmentId.length > 0,
      staleTime: 5_000,
    }),
  );
  const dependencyResourcesQuery = createQuery(() =>
    queryOptions({
      queryKey: [
        "dependency-resources",
        "resource-bind",
        resourceProjectId,
        resourceEnvironmentId,
      ],
      queryFn: () =>
        orpcClient.dependencyResources.list({
          projectId: resourceProjectId,
          environmentId: resourceEnvironmentId,
        }),
      enabled: browser && resourceProjectId.length > 0 && resourceEnvironmentId.length > 0,
      staleTime: 5_000,
    }),
  );
  const resourceDependencyBindingsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resource-dependency-bindings", resourceId],
      queryFn: () =>
        orpcClient.resources.dependencyBindings.list({
          resourceId,
        }),
      enabled: browser && resourceId.length > 0,
      staleTime: 5_000,
    }),
  );
  const storageVolumeBackupsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["storage-volume-backups", storageBackupVolumeId],
      queryFn: () =>
        orpcClient.storageVolumes.backups.list({
          storageVolumeId: storageBackupVolumeId,
        }),
      enabled: browser && storageBackupVolumeId.length > 0,
      staleTime: 5_000,
    }),
  );
  const project = $derived(resource ? findProject(projects, resource.projectId) : null);
  const environment = $derived(
    resource ? findEnvironment(environments, resource.environmentId) : null,
  );
  const projectHeaderLoading = $derived(!project && (resourceDetailQuery.isPending || projectsQuery.isPending));
  const resourceHeaderLoading = $derived(resourceDetailQuery.isPending && !resource);
  const environmentHeaderLoading = $derived(
    !environment && (resourceDetailQuery.isPending || environmentsQuery.isPending),
  );
  const projectHeaderSwitchItems = $derived(
    projects.map((projectItem) => ({
      label: projectItem.name,
      href: projectDetailHref(projectItem.id),
      selected: projectItem.id === resource?.projectId,
    })),
  );
  const resourceHeaderSwitchItems = $derived(
    resources
      .filter(
        (resourceItem) =>
          !resource ||
          (resourceItem.projectId === resource.projectId &&
            resourceItem.environmentId === resource.environmentId),
      )
      .map((resourceItem) => ({
        label: resourceItem.name,
        href: resourceDetailHref(resourceItem),
        selected: resourceItem.id === resourceId,
      })),
  );
  const isPreviewEnvironmentResource = $derived(environment?.kind === "preview");
  const latestDeployment = $derived(
    resource ? deployments.find((deployment) => deployment.resourceId === resource.id) : null,
  );
  const sourceLinkServerLabel = $derived(
    latestDeployment?.serverId
      ? (findServer(servers, latestDeployment.serverId)?.name ?? latestDeployment.serverId)
      : "-",
  );
  const resourceFallbackServerScope = $derived<RuntimeUsageScope | null>(
    latestDeployment?.serverId
      ? {
          kind: "server",
          serverId: latestDeployment.serverId,
        }
      : null,
  );
  const shouldLoadResourceFallbackServerRuntime = $derived(
    resourceRuntimeMonitorEnabled &&
      resourceFallbackServerScope !== null &&
      !resourceRuntimeUsageQuery.isPending &&
      !resourceRuntimeUsageHasMonitorValues,
  );
  const resourceFallbackServerRuntimeUsageQuery = createQuery(() =>
    runtimeUsageQueryOptions(
      resourceFallbackServerScope ?? resourceRuntimeScope,
      shouldLoadResourceFallbackServerRuntime,
    ),
  );
  const resourceFallbackServerRuntimeMonitoringSamplesQuery = createQuery(() =>
    runtimeMonitoringSamplesQueryOptions(
      resourceFallbackServerScope ?? resourceRuntimeScope,
      shouldLoadResourceFallbackServerRuntime,
      runtimeMonitoringTimeRange,
    ),
  );
  const resourceFallbackServerRuntimeMonitoringRollupQuery = createQuery(() =>
    runtimeMonitoringRollupQueryOptions(
      resourceFallbackServerScope ?? resourceRuntimeScope,
      shouldLoadResourceFallbackServerRuntime,
      runtimeMonitoringTimeRange,
    ),
  );
  const resourceDeployments = $derived(
    resource ? deployments.filter((deployment) => deployment.resourceId === resource.id) : [],
  );
  const runtimeMonitoringObservationHandoff = $derived(
    runtimeMonitoringObservationHandoffFromSearchParams(page.url.searchParams),
  );
  const resourceRuntimeMonitoringObservationHandoff = $derived.by(() => {
    const handoff = runtimeMonitoringObservationHandoff;
    const currentResourceId = resource?.id ?? "";
    if (!currentResourceId) {
      return null;
    }

    return runtimeMonitoringObservationHandoffMatchesScope(handoff, {
      kind: "resource",
      resourceId: currentResourceId,
    })
      ? handoff
      : null;
  });
  const resourceDeploymentsInObservationWindow = $derived(
    resourceRuntimeMonitoringObservationHandoff
      ? resourceDeployments.filter((deployment) =>
          runtimeMonitoringDeploymentInObservationWindow(
            deployment,
            resourceRuntimeMonitoringObservationHandoff,
          ),
        )
      : resourceDeployments,
  );
  const terminalDeploymentId = $derived.by(() => {
    const requestedDeploymentId = page.url.searchParams.get("deploymentId")?.trim();
    if (
      requestedDeploymentId &&
      resourceDeployments.some((deployment) => deployment.id === requestedDeploymentId)
    ) {
      return requestedDeploymentId;
    }

    return latestDeployment?.id;
  });
  const resourceDomainBindings = $derived(
    resource ? domainBindings.filter((binding) => binding.resourceId === resource.id) : [],
  );
  const resourceCertificates = $derived(
    resourceDomainBindings.length > 0
      ? certificates.filter((certificate) =>
          resourceDomainBindings.some((binding) => binding.id === certificate.domainBindingId),
        )
      : [],
  );
  const resourceHealth = $derived(resourceHealthQuery.data ?? null);
  const resourceEffectiveConfig = $derived<ResourceEffectiveConfig | null>(
    resourceEffectiveConfigQuery.data ?? null,
  );
  const storageVolumes = $derived(storageVolumesQuery.data?.items ?? []);
  const resourceStorageAttachments = $derived(resourceDetail?.storageAttachments ?? []);
  const dependencyResources = $derived(dependencyResourcesQuery.data?.items ?? []);
  const resourceDependencyBindings = $derived(resourceDependencyBindingsQuery.data?.items ?? []);
  const storageVolumeBackups = $derived(storageVolumeBackupsQuery.data?.items ?? []);
  const bindableDependencyResources = $derived(
    dependencyResources.filter(
      (dependency) =>
        dependency.lifecycleStatus === "ready" &&
        dependency.bindingReadiness.status === "ready" &&
        !resourceDependencyBindings.some(
          (binding) =>
            binding.status === "active" && binding.dependencyResourceId === dependency.id,
        ),
    ),
  );
  $effect(() => {
    if (!dependencyBindingResourceId && bindableDependencyResources.length === 1) {
      dependencyBindingResourceId = bindableDependencyResources[0]?.id ?? "";
    }
  });
  const resourceSourceEvents = $derived(resourceSourceEventsQuery.data?.items ?? []);
  const resourcePreviewEnvironments = $derived(
    resourcePreviewEnvironmentsQuery.data?.items ?? [],
  );
  const activePreviewEnvironmentCount = $derived(
    resourcePreviewEnvironments.filter(
      (previewEnvironment) => previewEnvironment.status === "active",
    ).length,
  );
  const cleanupRequestedPreviewEnvironmentCount = $derived(
    resourcePreviewEnvironments.filter(
      (previewEnvironment) => previewEnvironment.status === "cleanup-requested",
    ).length,
  );
  const scheduledTasks = $derived(scheduledTasksQuery.data?.items ?? []);
  const scheduledTaskRuns = $derived(scheduledTaskRunsQuery.data?.items ?? []);
  const resourceRuntimeUsageError = $derived(
    resourceRuntimeUsageQuery.error ? readErrorMessage(resourceRuntimeUsageQuery.error) : "",
  );
  const resourceFallbackServerRuntimeUsage = $derived(
    resourceFallbackServerRuntimeUsageQuery.data ?? null,
  );
  const resourceFallbackServerRuntimeUsageHasMonitorValues = $derived(
    runtimeUsageHasMonitorSignals(resourceFallbackServerRuntimeUsage),
  );
  const showResourceServerRuntimeFallback = $derived(
    !resourceRuntimeUsageHasMonitorValues && resourceFallbackServerRuntimeUsageHasMonitorValues,
  );
  const effectiveResourceRuntimeUsage = $derived(
    showResourceServerRuntimeFallback ? resourceFallbackServerRuntimeUsage : resourceRuntimeUsage,
  );
  const effectiveResourceRuntimeUsageLoading = $derived(
    resourceRuntimeUsageQuery.isPending ||
      (!resourceRuntimeUsageHasMonitorValues &&
        resourceFallbackServerScope !== null &&
        resourceFallbackServerRuntimeUsageQuery.isPending),
  );
  const effectiveResourceRuntimeUsageError = $derived(
    showResourceServerRuntimeFallback
      ? resourceFallbackServerRuntimeUsageQuery.error
        ? readErrorMessage(resourceFallbackServerRuntimeUsageQuery.error)
        : ""
      : resourceRuntimeUsageError,
  );
  const resourceRuntimeMonitoringSamples = $derived(
    resourceRuntimeMonitoringSamplesQuery.data ?? null,
  );
  const resourceFallbackServerRuntimeMonitoringSamples = $derived(
    resourceFallbackServerRuntimeMonitoringSamplesQuery.data ?? null,
  );
  const effectiveResourceRuntimeMonitoringSamples = $derived(
    showResourceServerRuntimeFallback
      ? resourceFallbackServerRuntimeMonitoringSamples
      : resourceRuntimeMonitoringSamples,
  );
  const resourceRuntimeMonitoringSamplesError = $derived(
    resourceRuntimeMonitoringSamplesQuery.error
      ? readErrorMessage(resourceRuntimeMonitoringSamplesQuery.error)
      : "",
  );
  const effectiveResourceRuntimeMonitoringSamplesError = $derived(
    showResourceServerRuntimeFallback
      ? resourceFallbackServerRuntimeMonitoringSamplesQuery.error
        ? readErrorMessage(resourceFallbackServerRuntimeMonitoringSamplesQuery.error)
        : ""
      : resourceRuntimeMonitoringSamplesError,
  );
  const resourceRuntimeMonitoringRollup = $derived(resourceRuntimeMonitoringRollupQuery.data ?? null);
  const resourceFallbackServerRuntimeMonitoringRollup = $derived(
    resourceFallbackServerRuntimeMonitoringRollupQuery.data ?? null,
  );
  const effectiveResourceRuntimeMonitoringRollup = $derived(
    showResourceServerRuntimeFallback
      ? resourceFallbackServerRuntimeMonitoringRollup
      : resourceRuntimeMonitoringRollup,
  );
  const resourceRuntimeMonitoringRollupError = $derived(
    resourceRuntimeMonitoringRollupQuery.error
      ? readErrorMessage(resourceRuntimeMonitoringRollupQuery.error)
      : "",
  );
  const effectiveResourceRuntimeMonitoringRollupError = $derived(
    showResourceServerRuntimeFallback
      ? resourceFallbackServerRuntimeMonitoringRollupQuery.error
        ? readErrorMessage(resourceFallbackServerRuntimeMonitoringRollupQuery.error)
        : ""
      : resourceRuntimeMonitoringRollupError,
  );
  const effectiveResourceRuntimeMonitoringObservationScope = $derived(
    showResourceServerRuntimeFallback
      ? (resourceFallbackServerScope ?? resourceRuntimeScope)
      : resourceRuntimeScope,
  );
  const resourceRuntimeMonitoringThresholds = $derived(
    resourceRuntimeMonitoringThresholdsQuery.data ?? null,
  );
  const resourceRuntimeMonitoringThresholdsError = $derived(
    resourceRuntimeMonitoringThresholdsQuery.error
      ? readErrorMessage(resourceRuntimeMonitoringThresholdsQuery.error)
      : "",
  );
  const autoDeployPolicy = $derived(resourceDetail?.autoDeployPolicy ?? null);
  const profileDiagnostics = $derived(resourceDetail?.diagnostics ?? []);
  const resourceHealthOverall = $derived.by((): ResourceHealthViewStatus => {
    if (
      resourceHealthQuery.isPending ||
      (resourceHealthQuery.isFetching && resourceHealth?.overall === "unknown")
    ) {
      return "loading";
    }

    return resourceHealth?.overall ?? "unknown";
  });
  const currentAccessRoute = $derived(selectCurrentResourceAccessRoute(resource?.accessSummary));
  const latestAccessFailure = $derived(resource?.accessSummary?.latestAccessFailureDiagnostic);
  const defaultDestinationId = $derived(
    resource?.destinationId ?? latestDeployment?.destinationId ?? "",
  );
  let deploymentDialogOpen = $state(false);
  let deploymentServerId = $state("");
  let deploymentDestinationId = $state("");
  let deploymentCreatePending = $state(false);
  let deploymentProgressDialogOpen = $state(false);
  let deploymentProgressDialogStatus = $state<DeploymentProgressDialogStatus>("idle");
  let deploymentProgressEvents = $state<DeploymentProgressEvent[]>([]);
  let deploymentProgressStreamError = $state("");
  let deploymentProgressDeploymentId = $state("");
  let deploymentProgressRequestId = $state("");
  let deploymentProgressTraceLink = $state("");
  let deploymentPlanPending = $state(false);
  let deploymentPlanPreview = $state<DeploymentPlanResponse | null>(null);
  let deploymentPlanError = $state("");
  let deploymentFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let deploymentDialogInitializedForResourceId = $state("");
  let domainBindingCreateDialogOpen = $state(false);
  let domainBindingDialogInitializedForResourceId = $state("");
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
  let importFeedback = $state<{
    bindingId: string;
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let certificateActionFeedback = $state<{
    bindingId: string;
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let importBindingId = $state("");
  let certificateImportDialogOpen = $state(false);
  let importCertificateChain = $state("");
  let importPrivateKey = $state("");
  let importPassphrase = $state("");
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
  let accessFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let runtimeFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let runtimeControlFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let runtimeControlDialogOpen = $state(false);
  let selectedRuntimeControlOperation = $state<"stop" | "start" | "restart" | null>(null);
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
  let sourceVersion = $state("");
  let sourceVersionKind = $state<SourceVersionKind | "">("");
  let sourceLinkDialogOpen = $state(false);
  let sourceLinkFormResourceId = $state("");
  let sourceLinkFingerprint = $state("");
  let sourceLinkServerId = $state("");
  let sourceLinkDestinationId = $state("");
  let sourceLinkFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let previewEnvironmentFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let autoDeployFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let autoDeployFormStateKey = $state("");
  let autoDeployTriggerKind = $state<AutoDeployTriggerKind>("git-push");
  let autoDeployRefs = $state("");
  let autoDeployEventKind = $state<AutoDeployEventKind>("push");
  let autoDeployGenericWebhookSecretRef = $state("");
  let autoDeployDedupeWindowSeconds = $state("");
  let scheduledTaskFormResourceId = $state("");
  let scheduledTaskCreateDialogOpen = $state(false);
  let scheduledTaskSchedule = $state("*/5 * * * *");
  let scheduledTaskTimezone = $state("UTC");
  let scheduledTaskCommandIntent = $state("");
  let scheduledTaskTimeoutSeconds = $state("300");
  let scheduledTaskRetryLimit = $state("0");
  let scheduledTaskStatus = $state<"enabled" | "disabled">("enabled");
  let scheduledTaskFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let scheduledTaskManageDialogOpen = $state(false);
  let selectedScheduledTaskForManage = $state<ScheduledTaskDefinitionSummary | null>(null);
  let scheduledTaskDeleteDialogOpen = $state(false);
  let selectedScheduledTaskForDelete = $state<ScheduledTaskDefinitionSummary | null>(null);
  let selectedScheduledTaskRunId = $state("");
  let scheduledTaskRunLogs = $state<ScheduledTaskRunLogEntry[]>([]);
  let scheduledTaskRunLogsLoading = $state(false);
  let scheduledTaskRunLogsError = $state<string | null>(null);
  let scheduledTaskRunLogsRequestId = 0;
  let runtimeFormResourceId = $state("");
  let runtimeStrategy = $state<RuntimePlanStrategy>("auto");
  let runtimeInstallCommand = $state("");
  let runtimeBuildCommand = $state("");
  let runtimeStartCommand = $state("");
  let runtimeName = $state("");
  let runtimePublishDirectory = $state("");
  let runtimeDockerfilePath = $state("");
  let runtimeDockerComposeFilePath = $state("");
  let runtimeBuildTarget = $state("");
  let networkFormResourceId = $state("");
  let networkInternalPort = $state("");
  let networkUpstreamProtocol = $state<NetworkProtocol>("http");
  let networkExposureMode = $state<NetworkExposureMode>("reverse-proxy");
  let networkTargetServiceName = $state("");
  let accessFormResourceId = $state("");
  let accessGeneratedAccessMode = $state<GeneratedAccessMode>("inherit");
  let accessPathPrefix = $state("/");
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
  let runtimeLogsUnavailable = $state(false);
  let runtimeLogsFollowing = $state(false);
  let runtimeLogStream = $state<RuntimeLogClientStream | null>(null);
  let runtimeLogRequestGeneration = $state(0);
  const runtimeLogsInObservationWindow = $derived(
    resourceRuntimeMonitoringObservationHandoff
      ? runtimeLogs.filter((line) =>
          runtimeMonitoringTimestampInObservationWindow(
            line.timestamp,
            resourceRuntimeMonitoringObservationHandoff,
          ),
        )
      : runtimeLogs,
  );
  let configFormResourceId = $state("");
  let configKey = $state("");
  let configValue = $state("");
  let configKind = $state<ResourceVariableKind>("plain-config");
  let configExposure = $state<ResourceVariableExposure>("runtime");
  let configSecret = $state(false);
  let configImportContent = $state("");
  let configImportExposure = $state<ResourceVariableExposure>("runtime");
  let configImportSecretKeys = $state("");
  let configImportPlainKeys = $state("");
  let configFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let storageAttachmentFormResourceId = $state("");
  let storageAttachmentVolumeId = $state("");
  let storageAttachmentDestinationPath = $state("/data");
  let storageAttachmentMountMode = $state<AttachResourceStorageInput["mountMode"]>("read-write");
  let storageAttachDialogOpen = $state(false);
  let storageAttachmentFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let storageVolumeName = $state("");
  let storageVolumeKind = $state<CreateStorageVolumeInput["kind"]>("named-volume");
  let storageVolumeDescription = $state("");
  let storageVolumeSourcePath = $state("");
  let storageVolumeRenameNames = $state<Record<string, string>>({});
  let storageCreateDialogOpen = $state(false);
  let storageRenameDialogOpen = $state(false);
  let storageRenameVolumeId = $state("");
  let storageVolumeFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let storageRuntimeCleanupVolumeId = $state("");
  let storageRuntimeCleanupServerId = $state("");
  let storageRuntimeCleanupBefore = $state("");
  let storageRuntimeCleanupObservationHandoffKey = $state("");
  let storageRuntimeCleanupHandoffOpenedKey = $state("");
  let storageRuntimeCleanupDialogOpen = $state(false);
  let storageRuntimeCleanupResult = $state<CleanupStorageVolumeRuntimeResponse | null>(null);
  let storageRuntimeCleanupFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let storageBackupDestinationPath = $state("/data");
  let storageBackupDataFormat = $state<CreateStorageVolumeBackupPlanInput["source"]["dataFormat"]>("unknown");
  let storageBackupLiveWrites = $state(true);
  let storageBackupConsistency = $state<CreateStorageVolumeBackupPlanInput["requestedConsistency"]>(
    "application-consistent",
  );
  let storageBackupTargetProvider = $state<
    CreateStorageVolumeBackupPlanInput["target"]["providerKey"]
  >("local-filesystem");
  let storageBackupTargetRef = $state("/var/lib/appaloft/backups");
  let storageBackupRetentionMaxCount = $state("3");
  let storageBackupRetentionMinFreeBytes = $state("1073741824");
  let storageBackupDialogOpen = $state(false);
  let storageBackupPlan = $state<StorageVolumeBackupPlanResponse | null>(null);
  let storageBackupRestoreNames = $state<Record<string, string>>({});
  let storageBackupFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let dependencyBindingResourceId = $state("");
  let dependencyBindingTargetName = $state("DATABASE_URL");
  let dependencyBindDialogOpen = $state(false);
  let dependencyBindingSecretRefs = $state<Record<string, string>>({});
  let dependencyBindingSecretValues = $state<Record<string, string>>({});
  let dependencyBindingSecretRotationAcks = $state<Record<string, boolean>>({});
  let dependencyFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  const dependencyResourceKindOrder = [
    "postgres",
    "redis",
    "mysql",
    "clickhouse",
    "object-storage",
    "opensearch",
  ] as const satisfies readonly DependencyResourceSummary["kind"][];
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
  let previewEnvironmentCleanupDialogOpen = $state(false);
  let selectedPreviewEnvironmentForCleanup = $state<PreviewEnvironmentSummary | null>(null);
  let resourceLifecycleDialogOpen = $state(false);
  let selectedResourceLifecycleAction = $state<ResourceLifecycleAction | null>(null);
  let resourceDeleteConfirmation = $state("");

  const selectedDeploymentServer = $derived(findServer(servers, deploymentServerId));
  const selectedServer = $derived(findServer(servers, serverId));
  const deploymentSource = $derived(
    latestDeployment?.runtimePlan.source ?? resourceDetail?.source ?? null,
  );
  const canCreateDeployment = $derived(
    Boolean(resource && deploymentServerId && !isResourceArchived && !deploymentCreatePending),
  );
  const canPreviewDeploymentPlan = $derived(
    Boolean(resource && deploymentServerId && !isResourceArchived && !deploymentPlanPending),
  );
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
    primaryDomainBinding ? domainBindingHref(primaryDomainBinding) : (currentAccessRoute?.route.url ?? ""),
  );
  const primaryAccessKind = $derived.by((): ResourceAccessKind | null => {
    if (primaryDomainBinding) {
      return "domain-binding";
    }

    return currentAccessRoute?.kind ?? null;
  });
  const primaryAccessRoute = $derived.by((): ResourceAccessRoute | null => {
    if (primaryDomainBinding) {
      return null;
    }

    return currentAccessRoute?.route ?? null;
  });
  const isServerlessStaticArtifactAccess = $derived(
    currentAccessRoute?.kind === "static-artifact" &&
      !latestDeployment?.serverId &&
      !defaultDestinationId,
  );
  const shouldShowServerField = $derived(
    !isServerlessStaticArtifactAccess && !latestDeployment?.serverId,
  );
  const shouldShowDestinationField = $derived(
    !isServerlessStaticArtifactAccess && !defaultDestinationId,
  );
  const canCreateBinding = $derived(
    Boolean(
      !isServerlessStaticArtifactAccess &&
        resource &&
        serverId &&
        destinationId &&
        domainName.trim() &&
        pathPrefix.trim() &&
        proxyKind !== "none" &&
        (routeMode === "serve" || redirectTo),
    ),
  );
  const canImportCertificate = $derived(
    Boolean(
      importBindingId &&
        importCertificateChain.trim() &&
        importPrivateKey.trim() &&
        resourceDomainBindings.some(
          (binding) => binding.id === importBindingId && binding.certificatePolicy === "manual",
        ),
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
  const sourceVersionKindOptions = $derived<SourceVersionKind[]>(
    sourceKindIsGit
      ? ["branch", "tag", "commit-sha", "release"]
      : sourceKindIsDockerImage
        ? ["image-tag", "image-digest"]
        : ["literal", "tag", "release", "content-digest"],
  );
  const sourceVersionIsEditable = $derived(sourceKind !== "local-folder");
  const sourceSupportsAutoDeploy = $derived(
    Boolean(resourceDetail?.source && isGitSourceKind(resourceDetail.source.kind)),
  );
  const canConfigureSource = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        sourceKind &&
        sourceLocator.trim() &&
        (!sourceKindIsDockerImage || !(sourceImageTag.trim() && sourceImageDigest.trim())),
    ),
  );
  const canRelinkSourceLink = $derived(
    Boolean(resource && !isResourceArchived && sourceLinkFingerprint.trim() && sourceLinkServerId),
  );
  const canConfigureAutoDeploy = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        sourceSupportsAutoDeploy &&
        autoDeployRefs.trim() &&
        (autoDeployTriggerKind !== "generic-signed-webhook" ||
          autoDeployGenericWebhookSecretRef.trim()) &&
        (!autoDeployDedupeWindowSeconds.trim() ||
          isPositiveIntegerText(autoDeployDedupeWindowSeconds)),
    ),
  );
  const canAcknowledgeAutoDeploySource = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        autoDeployPolicy?.status === "blocked" &&
        autoDeployPolicy.blockedReason === "source-binding-changed" &&
        resourceDetail?.source?.sourceBindingFingerprint,
    ),
  );
  const canCreateScheduledTask = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        scheduledTaskSchedule.trim() &&
        scheduledTaskTimezone.trim() &&
        scheduledTaskCommandIntent.trim() &&
        isPositiveIntegerText(scheduledTaskTimeoutSeconds) &&
        Number(scheduledTaskTimeoutSeconds) <= 86_400 &&
        isNonNegativeIntegerText(scheduledTaskRetryLimit) &&
        Number(scheduledTaskRetryLimit) <= 10,
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
        canConfigureRuntimeByCapability &&
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
  const canConfigureAccess = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        accessGeneratedAccessMode &&
        accessPathPrefix.trim().startsWith("/"),
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
  const canSetResourceVariable = $derived(Boolean(resource && !isResourceArchived && configKey.trim()));
  const canImportResourceVariables = $derived(
    Boolean(resource && !isResourceArchived && configImportContent.trim()),
  );
  const selectedStorageVolume = $derived(
    storageVolumes.find((volume) => volume.id === storageAttachmentVolumeId) ?? null,
  );
  const selectedStorageBackupVolume = $derived(
    storageVolumes.find((volume) => volume.id === storageBackupVolumeId) ?? null,
  );
  const selectedStorageBackupAttachment = $derived(
    resourceStorageAttachments.find(
      (attachment) => attachment.storageVolumeId === storageBackupVolumeId,
    ) ?? null,
  );
  const selectedStorageRuntimeCleanupServer = $derived(
    findServer(servers, storageRuntimeCleanupServerId),
  );
  const selectedStorageRenameVolume = $derived(
    storageVolumes.find((volume) => volume.id === storageRenameVolumeId) ?? null,
  );
  const canAttachStorage = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        storageAttachmentVolumeId &&
        storageAttachmentDestinationPath.trim().startsWith("/") &&
        storageAttachmentDestinationPath.trim() !== "/" &&
        !storageAttachmentDestinationPath.includes(".."),
    ),
  );
  const canCreateStorageVolume = $derived(
    Boolean(
      resource &&
        resourceProjectId &&
        resourceEnvironmentId &&
        storageVolumeName.trim() &&
        (storageVolumeKind === "named-volume" ||
          (storageVolumeSourcePath.trim().startsWith("/") &&
            storageVolumeSourcePath.trim() !== "/" &&
            !storageVolumeSourcePath.includes(".."))),
    ),
  );
  const canPlanStorageBackup = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        storageBackupVolumeId &&
        storageBackupTargetRef.trim() &&
        isPositiveIntegerText(storageBackupRetentionMaxCount) &&
        isPositiveIntegerText(storageBackupRetentionMinFreeBytes),
    ),
  );
  const canCreateStorageBackup = $derived(
    canPlanStorageBackup &&
      Boolean(storageBackupPlan && storageBackupPlan.blockers.length === 0),
  );
  const canCleanupStorageRuntime = $derived(
    Boolean(
      resource &&
        storageRuntimeCleanupVolumeId &&
        storageRuntimeCleanupServerId &&
        storageRuntimeCleanupBefore.trim(),
    ),
  );
  const selectedDependencyResource = $derived(
    bindableDependencyResources.find((dependency) => dependency.id === dependencyBindingResourceId) ??
      null,
  );
  const canBindDependencyResource = $derived(
    Boolean(
      resource &&
        !isResourceArchived &&
        selectedDependencyResource &&
        dependencyBindingTargetName.trim(),
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
      setResourceDomainBindingCreateDialogOpen(false);
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
  const importCertificateMutation = createMutation(() => ({
    mutationFn: (input: ImportCertificateInput) => orpcClient.certificates.import(input),
    onSuccess: (result, variables) => {
      importFeedback = {
        bindingId: variables.domainBindingId,
        kind: "success",
        title: $t(i18nKeys.console.resources.certificateImportSuccessTitle),
        detail: result.certificateId,
      };
      closeCertificateImportDialog();
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["domain-bindings"] });
      void queryClient.invalidateQueries({ queryKey: ["certificates"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
    },
    onError: (error, variables) => {
      importFeedback = {
        bindingId: variables?.domainBindingId ?? importBindingId,
        kind: "error",
        title: $t(i18nKeys.console.resources.certificateImportErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const retryCertificateMutation = createMutation(() => ({
    mutationFn: (input: { certificateId: string }) => orpcClient.certificates.retry(input),
    onSuccess: (result, variables) => {
      certificateActionFeedback = {
        bindingId: certificateBindingId(variables.certificateId),
        kind: "success",
        title: $t(i18nKeys.console.resources.certificateRetrySuccessTitle),
        detail: result.attemptId,
      };
      void queryClient.invalidateQueries({ queryKey: ["certificates"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
    },
    onError: (error, variables) => {
      certificateActionFeedback = {
        bindingId: certificateBindingId(variables?.certificateId),
        kind: "error",
        title: $t(i18nKeys.console.resources.certificateRetryErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const revokeCertificateMutation = createMutation(() => ({
    mutationFn: (input: { certificateId: string }) => orpcClient.certificates.revoke(input),
    onSuccess: (result, variables) => {
      certificateActionFeedback = {
        bindingId: certificateBindingId(variables.certificateId),
        kind: "success",
        title: $t(i18nKeys.console.resources.certificateRevokeSuccessTitle),
        detail: result.certificateId,
      };
      void queryClient.invalidateQueries({ queryKey: ["certificates"] });
      void queryClient.invalidateQueries({ queryKey: ["domain-bindings"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
    },
    onError: (error, variables) => {
      certificateActionFeedback = {
        bindingId: certificateBindingId(variables?.certificateId),
        kind: "error",
        title: $t(i18nKeys.console.resources.certificateRevokeErrorTitle),
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
  const relinkSourceLinkMutation = createMutation(() => ({
    mutationFn: (input: RelinkSourceLinkInput) => orpcClient.sourceLinks.relink(input),
    onSuccess: (result) => {
      sourceLinkFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.sourceLinkRelinked),
        detail: result.sourceFingerprint,
      };
      sourceLinkDialogOpen = false;
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
    },
    onError: (error) => {
      sourceLinkFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.sourceLinkRelinkFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const configureResourceAutoDeployMutation = createMutation(() => ({
    mutationFn: (input: ConfigureResourceAutoDeployInput) =>
      orpcClient.resources.configureAutoDeploy(input),
    onSuccess: (result) => {
      autoDeployFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.autoDeploySaved),
        detail: autoDeployStatusLabel(result.status),
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
      void queryClient.invalidateQueries({ queryKey: ["source-events", "resource", resourceId] });
    },
    onError: (error) => {
      autoDeployFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.autoDeploySaveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const cleanupPreviewEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: { previewEnvironmentId: string; resourceId: string }) =>
      orpcClient.previewEnvironments.delete(input),
    onSuccess: (result) => {
      previewEnvironmentFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.previewEnvironments.cleanupSucceeded),
        detail: result.attemptId,
      };
      void queryClient.invalidateQueries({ queryKey: ["preview-environments"] });
      void queryClient.invalidateQueries({
        queryKey: ["preview-environments", "resource", resourceId],
      });
    },
    onError: (error) => {
      previewEnvironmentFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.previewEnvironments.cleanupFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  function appendDeploymentProgressEvent(event: DeploymentProgressEvent): void {
    deploymentProgressEvents = [...deploymentProgressEvents, event];
    deploymentProgressDeploymentId = event.deploymentId ?? deploymentProgressDeploymentId;

    if (event.status === "failed") {
      deploymentProgressDialogStatus = "failed";
    } else if (event.status === "succeeded") {
      deploymentProgressDialogStatus = "succeeded";
    } else {
      deploymentProgressDialogStatus = "running";
    }
  }

  async function refreshResourceDeploymentData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["resources"] }),
      queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] }),
      queryClient.invalidateQueries({ queryKey: ["deployments"] }),
    ]);
  }

  function prepareResourceDeploymentDialog(): void {
    if (!resource || isResourceArchived || isPreviewEnvironmentResource) {
      return;
    }

    deploymentServerId = (latestDeployment?.serverId ?? deploymentServerId) || (servers[0]?.id ?? "");
    deploymentDestinationId = defaultDestinationId;
    deploymentPlanPreview = null;
    deploymentPlanError = "";
    deploymentFeedback = null;
    deploymentDialogOpen = true;
    deploymentDialogInitializedForResourceId = resource.id;
  }

  function openResourceDeploymentDialog(): void {
    if (!resource || isResourceArchived || isPreviewEnvironmentResource) {
      return;
    }

    void setModalOpen(page, "deployment", true);
  }

  function setResourceDeploymentDialogOpen(open: boolean): void {
    if (open) {
      prepareResourceDeploymentDialog();
      if (!modalIsOpen(page, "deployment")) {
        void setModalOpen(page, "deployment", true);
      }
      return;
    }

    deploymentDialogOpen = false;
    deploymentDialogInitializedForResourceId = "";
    if (modalIsOpen(page, "deployment")) {
      void setModalOpen(page, "deployment", false);
    }
  }

  function prepareResourceDomainBindingCreateDialog(): void {
    if (!resource || isResourceArchived || isServerlessStaticArtifactAccess) {
      return;
    }

    serverId = (latestDeployment?.serverId ?? serverId) || (servers[0]?.id ?? "");
    destinationId = defaultDestinationId || destinationId;
    domainName = "";
    pathPrefix = "/";
    proxyKind = "traefik";
    tlsMode = "auto";
    routeMode = "serve";
    redirectTo = "";
    redirectStatus = "308";
    certificatePolicy = "auto";
    createFeedback = null;
    domainBindingCreateDialogOpen = true;
    domainBindingDialogInitializedForResourceId = resource.id;
  }

  function openResourceDomainBindingCreateDialog(): void {
    if (!resource || isResourceArchived || isServerlessStaticArtifactAccess) {
      return;
    }

    void setModalOpen(page, "domain-binding", true);
  }

  function setResourceDomainBindingCreateDialogOpen(open: boolean): void {
    if (open) {
      prepareResourceDomainBindingCreateDialog();
      if (!modalIsOpen(page, "domain-binding")) {
        void setModalOpen(page, "domain-binding", true);
      }
      return;
    }

    domainBindingCreateDialogOpen = false;
    domainBindingDialogInitializedForResourceId = "";
    if (modalIsOpen(page, "domain-binding")) {
      void setModalOpen(page, "domain-binding", false);
    }
  }

  async function createResourceDeployment(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!resource || !canCreateDeployment) {
      return;
    }

    const input: CreateDeploymentInput = {
      projectId: resource.projectId,
      environmentId: resource.environmentId,
      resourceId: resource.id,
      serverId: deploymentServerId,
      ...(deploymentDestinationId.trim()
        ? { destinationId: deploymentDestinationId.trim() }
        : {}),
    };

    deploymentCreatePending = true;
    deploymentFeedback = null;
    deploymentProgressDialogOpen = true;
    deploymentProgressDialogStatus = "running";
    deploymentProgressEvents = [];
    deploymentProgressStreamError = "";
    deploymentProgressDeploymentId = "";
    deploymentProgressRequestId = "";
    deploymentProgressTraceLink = "";

    try {
      const result = await createDeploymentWithProgress(input, appendDeploymentProgressEvent, {
        onRequestId: (requestId) => {
          deploymentProgressRequestId = requestId;
        },
        onStreamError: (message) => {
          deploymentProgressStreamError = message;
        },
        onTraceLink: (traceLink) => {
          deploymentProgressTraceLink = traceLink;
        },
      });
      deploymentProgressDeploymentId = result.id;
      deploymentProgressDialogStatus = "succeeded";
      deploymentFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.newDeploymentSuccessTitle),
        detail: result.id,
      };
      setResourceDeploymentDialogOpen(false);
      await refreshResourceDeploymentData();
    } catch (error) {
      deploymentProgressDialogStatus = "failed";
      deploymentProgressStreamError = readErrorMessage(error);
      deploymentFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.newDeploymentErrorTitle),
        detail: readErrorMessage(error),
      };
    } finally {
      deploymentCreatePending = false;
    }
  }

  async function previewResourceDeploymentPlan(): Promise<void> {
    if (!resource || !canPreviewDeploymentPlan) {
      return;
    }

    deploymentPlanPending = true;
    deploymentPlanError = "";
    deploymentPlanPreview = null;

    try {
      deploymentPlanPreview = await orpcClient.deployments.plan({
        projectId: resource.projectId,
        environmentId: resource.environmentId,
        resourceId: resource.id,
        serverId: deploymentServerId,
        ...(deploymentDestinationId.trim()
          ? { destinationId: deploymentDestinationId.trim() }
          : {}),
      });
    } catch (error) {
      deploymentPlanError = readErrorMessage(error);
    } finally {
      deploymentPlanPending = false;
    }
  }

  function deploymentPlanStatusLabel(status: DeploymentPlanResponse["readiness"]["status"]): string {
    if (status === "ready") {
      return $t(i18nKeys.console.resources.newDeploymentPlanReady);
    }
    if (status === "warning") {
      return $t(i18nKeys.console.resources.newDeploymentPlanWarning);
    }
    return $t(i18nKeys.console.resources.newDeploymentPlanBlocked);
  }

  function deploymentProgressHref(): string {
    if (!resource || !deploymentProgressDeploymentId) {
      return "/deployments";
    }

    return deploymentDetailHref({
      id: deploymentProgressDeploymentId,
      projectId: resource.projectId,
      environmentId: resource.environmentId,
      resourceId: resource.id,
    });
  }

  const createScheduledTaskMutation = createMutation(() => ({
    mutationFn: (input: CreateScheduledTaskInput) => orpcClient.scheduledTasks.create(input),
    onSuccess: (result) => {
      scheduledTaskFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.scheduledTaskCreateSucceeded),
        detail: result.task.taskId,
      };
      scheduledTaskCreateDialogOpen = false;
      resetScheduledTaskForm();
      void invalidateScheduledTaskQueries();
    },
    onError: (error) => {
      scheduledTaskFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.scheduledTaskCreateFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const configureScheduledTaskMutation = createMutation(() => ({
    mutationFn: (input: ConfigureScheduledTaskInput) =>
      orpcClient.scheduledTasks.configure(input),
    onSuccess: (result) => {
      scheduledTaskFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.scheduledTaskConfigureSucceeded),
        detail: result.task.taskId,
      };
      void invalidateScheduledTaskQueries();
    },
    onError: (error) => {
      scheduledTaskFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.scheduledTaskConfigureFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const deleteScheduledTaskMutation = createMutation(() => ({
    mutationFn: (input: DeleteScheduledTaskInput) => orpcClient.scheduledTasks.delete(input),
    onSuccess: (result) => {
      scheduledTaskFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.scheduledTaskDeleteSucceeded),
        detail: result.taskId,
      };
      void invalidateScheduledTaskQueries();
    },
    onError: (error) => {
      scheduledTaskFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.scheduledTaskDeleteFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const runScheduledTaskNowMutation = createMutation(() => ({
    mutationFn: (input: RunScheduledTaskNowInput) => orpcClient.scheduledTasks.runNow(input),
    onSuccess: (result) => {
      scheduledTaskFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.scheduledTaskRunAccepted),
        detail: result.run.runId,
      };
      scheduledTaskRunLogsRequestId += 1;
      selectedScheduledTaskRunId = result.run.runId;
      scheduledTaskRunLogs = [];
      scheduledTaskRunLogsError = null;
      scheduledTaskRunLogsLoading = false;
      void invalidateScheduledTaskQueries();
    },
    onError: (error) => {
      scheduledTaskFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.scheduledTaskRunFailed),
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
  const stopResourceRuntimeMutation = createMutation(() => ({
    mutationFn: (input: StopResourceRuntimeInput) => orpcClient.resources.runtime.stop(input),
    onSuccess: (result) => {
      runtimeControlFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.runtimeControlStopSuccess),
        detail: result.runtimeControlAttemptId,
      };
      runtimeControlDialogOpen = false;
      selectedRuntimeControlOperation = null;
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
      void queryClient.invalidateQueries({
        queryKey: ["resources", "health", resourceId, "detail"],
      });
    },
    onError: (error) => {
      runtimeControlFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.runtimeControlFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const startResourceRuntimeMutation = createMutation(() => ({
    mutationFn: (input: StartResourceRuntimeInput) => orpcClient.resources.runtime.start(input),
    onSuccess: (result) => {
      runtimeControlFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.runtimeControlStartSuccess),
        detail: result.runtimeControlAttemptId,
      };
      runtimeControlDialogOpen = false;
      selectedRuntimeControlOperation = null;
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
      void queryClient.invalidateQueries({
        queryKey: ["resources", "health", resourceId, "detail"],
      });
    },
    onError: (error) => {
      runtimeControlFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.runtimeControlFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const restartResourceRuntimeMutation = createMutation(() => ({
    mutationFn: (input: RestartResourceRuntimeInput) => orpcClient.resources.runtime.restart(input),
    onSuccess: (result) => {
      runtimeControlFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.runtimeControlRestartSuccess),
        detail: result.runtimeControlAttemptId,
      };
      runtimeControlDialogOpen = false;
      selectedRuntimeControlOperation = null;
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] });
      void queryClient.invalidateQueries({
        queryKey: ["resources", "health", resourceId, "detail"],
      });
    },
    onError: (error) => {
      runtimeControlFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.runtimeControlFailed),
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
  const configureResourceAccessMutation = createMutation(() => ({
    mutationFn: (input: ConfigureResourceAccessInput) =>
      orpcClient.resources.configureAccess(input),
    onSuccess: (result) => {
      accessFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.accessProfileSaved),
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
      accessFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.accessProfileSaveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const setResourceVariableMutation = createMutation(() => ({
    mutationFn: (input: SetResourceVariableInput) => orpcClient.resources.setVariable(input),
    onSuccess: () => {
      configFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.configurationSaved),
        detail: configKey.trim(),
      };
      configValue = "";
      void queryClient.invalidateQueries({
        queryKey: ["resources", "effective-config", resourceId],
      });
    },
    onError: (error) => {
      configFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.configurationSaveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const importResourceVariablesMutation = createMutation(() => ({
    mutationFn: (input: ImportResourceVariablesInput) => orpcClient.resources.importVariables(input),
    onSuccess: (result) => {
      configFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.configurationImportSucceeded),
        detail: $t(i18nKeys.console.resources.configurationImportSummary, {
          count: result.importedEntries.length,
        }),
      };
      configImportContent = "";
      void queryClient.invalidateQueries({
        queryKey: ["resources", "effective-config", resourceId],
      });
    },
    onError: (error) => {
      configFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.configurationImportFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const unsetResourceVariableMutation = createMutation(() => ({
    mutationFn: (input: { resourceId: string; key: string; exposure: ResourceVariableExposure }) =>
      orpcClient.resources.unsetVariable(input),
    onSuccess: (_result, variables) => {
      configFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.configurationUnsetSucceeded),
        detail: variables.key,
      };
      void queryClient.invalidateQueries({
        queryKey: ["resources", "effective-config", resourceId],
      });
    },
    onError: (error) => {
      configFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.configurationUnsetFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const attachResourceStorageMutation = createMutation(() => ({
    mutationFn: (input: AttachResourceStorageInput) => orpcClient.resources.attachStorage(input),
    onSuccess: (result) => {
      storageAttachmentFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.storageAttachSucceeded),
        detail: result.id,
      };
      storageAttachmentDestinationPath = "/data";
      storageAttachDialogOpen = false;
      void invalidateStorageAttachmentQueries();
    },
    onError: (error) => {
      storageAttachmentFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.storageAttachFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const createStorageVolumeMutation = createMutation(() => ({
    mutationFn: (input: CreateStorageVolumeInput) => orpcClient.storageVolumes.create(input),
    onSuccess: (result) => {
      storageVolumeFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.storageVolumeCreateSucceeded),
        detail: result.id,
      };
      storageVolumeName = "";
      storageVolumeDescription = "";
      storageVolumeSourcePath = "";
      storageCreateDialogOpen = false;
      void invalidateStorageAttachmentQueries();
    },
    onError: (error) => {
      storageVolumeFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.storageVolumeCreateFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const renameStorageVolumeMutation = createMutation(() => ({
    mutationFn: (input: RenameStorageVolumeInput) => orpcClient.storageVolumes.rename(input),
    onSuccess: (result) => {
      storageVolumeFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.storageVolumeRenameSucceeded),
        detail: result.id,
      };
      storageRenameDialogOpen = false;
      storageRenameVolumeId = "";
      void invalidateStorageAttachmentQueries();
    },
    onError: (error) => {
      storageVolumeFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.storageVolumeRenameFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const cleanupStorageRuntimeMutation = createMutation(() => ({
    mutationFn: (input: CleanupStorageVolumeRuntimeInput) =>
      orpcClient.storageVolumes.cleanupRuntime(input),
    onSuccess: (result) => {
      storageRuntimeCleanupResult = result;
      storageRuntimeCleanupFeedback = {
        kind: "success",
        title: result.dryRun
          ? $t(i18nKeys.console.resources.storageRuntimeCleanupPreviewSucceeded)
          : $t(i18nKeys.console.resources.storageRuntimeCleanupSucceeded),
        detail: storageRuntimeCleanupSummary(result),
      };
      void invalidateStorageAttachmentQueries();
    },
    onError: (error) => {
      storageRuntimeCleanupFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.storageRuntimeCleanupFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const planStorageVolumeBackupMutation = createMutation(() => ({
    mutationFn: (input: CreateStorageVolumeBackupPlanInput) =>
      orpcClient.storageVolumes.backups.plan(input),
    onSuccess: (result) => {
      storageBackupPlan = result;
      storageBackupFeedback = {
        kind: result.blockers.length === 0 ? "success" : "error",
        title:
          result.blockers.length === 0
            ? $t(i18nKeys.console.resources.storageBackupPlanSucceeded)
            : $t(i18nKeys.console.resources.storageBackupPlanBlocked),
        detail: storageBackupPlanSummary(result),
      };
    },
    onError: (error) => {
      storageBackupFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.storageBackupPlanFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const createStorageVolumeBackupMutation = createMutation(() => ({
    mutationFn: (input: CreateStorageVolumeBackupInput) =>
      orpcClient.storageVolumes.backups.create(input),
    onSuccess: (result) => {
      storageBackupFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.storageBackupCreateSucceeded),
        detail: result.id,
      };
      storageBackupPlan = null;
      void invalidateStorageBackupQueries();
    },
    onError: (error) => {
      storageBackupFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.storageBackupCreateFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const restoreStorageVolumeBackupMutation = createMutation(() => ({
    mutationFn: (input: RestoreStorageVolumeBackupInput) =>
      orpcClient.storageVolumes.backups.restore(input),
    onSuccess: (result) => {
      storageBackupFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.storageBackupRestoreSucceeded),
        detail: result.restoredStorageVolumeId ?? result.id,
      };
      storageBackupRestoreNames = {};
      void invalidateStorageBackupQueries();
      void invalidateStorageAttachmentQueries();
    },
    onError: (error) => {
      storageBackupFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.storageBackupRestoreFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const pruneStorageVolumeBackupMutation = createMutation(() => ({
    mutationFn: (input: Parameters<typeof orpcClient.storageVolumes.backups.prune>[0]) =>
      orpcClient.storageVolumes.backups.prune(input),
    onSuccess: (result) => {
      storageBackupFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.storageBackupPruneSucceeded),
        detail: result.id,
      };
      void invalidateStorageBackupQueries();
    },
    onError: (error) => {
      storageBackupFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.storageBackupPruneFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const bindResourceDependencyMutation = createMutation(() => ({
    mutationFn: (input: BindResourceDependencyInput) =>
      orpcClient.resources.dependencyBindings.bind(input),
    onSuccess: (result) => {
      dependencyFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.dependencyBindSucceeded),
        detail: result.id,
      };
      dependencyBindingResourceId = "";
      dependencyBindingTargetName = "DATABASE_URL";
      dependencyBindDialogOpen = false;
      void invalidateDependencyQueries();
    },
    onError: (error) => {
      dependencyFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.dependencyBindFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const rotateResourceDependencyBindingSecretMutation = createMutation(() => ({
    mutationFn: (input: RotateResourceDependencyBindingSecretInput) =>
      orpcClient.resources.dependencyBindings.rotateSecret(input),
    onSuccess: (result) => {
      dependencyFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.dependencySecretRotateSucceeded),
        detail: result.secretVersion,
      };
      delete dependencyBindingSecretRefs[result.id];
      delete dependencyBindingSecretValues[result.id];
      delete dependencyBindingSecretRotationAcks[result.id];
      void invalidateDependencyQueries();
    },
    onError: (error) => {
      dependencyFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.dependencySecretRotateFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const unbindResourceDependencyMutation = createMutation(() => ({
    mutationFn: (input: UnbindResourceDependencyInput) =>
      orpcClient.resources.dependencyBindings.unbind(input),
    onSuccess: (result) => {
      dependencyFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.dependencyUnbindSucceeded),
        detail: result.id,
      };
      void invalidateDependencyQueries();
    },
    onError: (error) => {
      dependencyFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.dependencyUnbindFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const runtimeControlPending = $derived(
    stopResourceRuntimeMutation.isPending ||
      startResourceRuntimeMutation.isPending ||
      restartResourceRuntimeMutation.isPending,
  );
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
  const deletePreviewResourceMutation = createMutation(() => ({
    mutationFn: async (input: DeleteResourceInput & { archiveBeforeDelete: boolean }) => {
      if (input.archiveBeforeDelete) {
        await orpcClient.resources.archive({
          resourceId: input.resourceId,
          reason: "preview-resource-cleanup",
        });
      }

      return orpcClient.resources.delete({
        resourceId: input.resourceId,
        confirmation: input.confirmation,
      });
    },
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

  function readDomainErrorCode(error: unknown): string {
    if (!error || typeof error !== "object") {
      return "";
    }

    const data = "data" in error ? (error as { data?: unknown }).data : undefined;

    if (data && typeof data === "object" && "domainCode" in data) {
      return String((data as { domainCode?: unknown }).domainCode ?? "");
    }

    if ("code" in error && typeof (error as { code?: unknown }).code === "string") {
      return (error as { code: string }).code;
    }

    return "";
  }

  function readRuntimeLogErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (error && typeof error === "object" && "message" in error) {
      return String((error as { message?: unknown }).message ?? "");
    }

    return "";
  }

  function isRuntimeLogsUnavailableError(error: unknown): boolean {
    if (readDomainErrorCode(error) === "resource_runtime_logs_unavailable") {
      return true;
    }

    const message = readRuntimeLogErrorMessage(error);
    return message === "Resource has no observable runtime deployment" ||
      message.includes("no observable runtime deployment");
  }

  function markRuntimeLogsUnavailable(): void {
    runtimeLogs = [];
    runtimeLogsError = null;
    runtimeLogsUnavailable = true;
    runtimeLogStream = null;
    runtimeLogsFollowing = false;
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
        if (isRuntimeLogsUnavailableError(event.error)) {
          markRuntimeLogsUnavailable();
        } else {
          runtimeLogsError = event.error.message;
          runtimeLogsUnavailable = false;
          runtimeLogStream = null;
          runtimeLogsFollowing = false;
        }
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

  async function loadRuntimeLogs(currentResourceId: string, since?: string): Promise<void> {
    const generation = runtimeLogRequestGeneration + 1;
    runtimeLogRequestGeneration = generation;
    runtimeLogResourceId = currentResourceId;
    runtimeLogsLoading = true;
    runtimeLogsError = null;
    runtimeLogsUnavailable = false;

    try {
      const result = await orpcClient.resources.logs({
        resourceId: currentResourceId,
        tailLines: 100,
        ...(since ? { since } : {}),
        follow: false,
      });

      if (isActiveRuntimeLogRequest(currentResourceId, generation)) {
        runtimeLogs = result.logs;
      }
    } catch (error) {
      if (isActiveRuntimeLogRequest(currentResourceId, generation)) {
        if (isRuntimeLogsUnavailableError(error)) {
          markRuntimeLogsUnavailable();
        } else {
          runtimeLogsError = readErrorMessage(error);
        }
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
    since?: string,
  ): Promise<void> {
    try {
      const stream = await orpcClient.resources.logsStream({
        resourceId: currentResourceId,
        tailLines,
        ...(since ? { since } : {}),
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
        if (isRuntimeLogsUnavailableError(error)) {
          markRuntimeLogsUnavailable();
        } else {
          runtimeLogsError = readErrorMessage(error);
          runtimeLogsUnavailable = false;
        }
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
    runtimeLogsUnavailable = false;
    runtimeLogsFollowing = true;
    const tailLines = runtimeLogs.length > 0 ? 0 : 100;
    void consumeRuntimeLogStream(
      resource.id,
      generation,
      tailLines,
      resourceRuntimeMonitoringObservationHandoff?.from,
    );
  }

  function refreshRuntimeLogs(): void {
    if (!resource) {
      return;
    }

    stopRuntimeLogFollow();
    void loadRuntimeLogs(resource.id, resourceRuntimeMonitoringObservationHandoff?.from);
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
        ...(resourceRuntimeMonitoringObservationHandoff
          ? {
              observationFrom: resourceRuntimeMonitoringObservationHandoff.from,
              observationTo: resourceRuntimeMonitoringObservationHandoff.to,
            }
          : {}),
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

  function openResourceLifecycleDialog(): void {
    if (!browser || !resource) {
      return;
    }

    selectedResourceLifecycleAction = null;
    resourceDeleteConfirmation = "";
    archiveFeedback = null;
    deleteFeedback = null;
    resourceLifecycleDialogOpen = true;
  }

  function closeResourceLifecycleDialog(): void {
    resourceLifecycleDialogOpen = false;
    selectedResourceLifecycleAction = null;
    resourceDeleteConfirmation = "";
  }

  function selectResourceLifecycleAction(action: ResourceLifecycleAction): void {
    if (!resource) {
      return;
    }

    if (action === "archive" && (isResourceArchived || isPreviewEnvironmentResource)) {
      return;
    }
    if (action === "delete" && !isPreviewEnvironmentResource && !isResourceArchived) {
      return;
    }

    selectedResourceLifecycleAction = action;
    resourceDeleteConfirmation = "";
    archiveFeedback = null;
    deleteFeedback = null;
  }

  function archiveResource(): void {
    if (!resource || isResourceArchived || archiveResourceMutation.isPending) {
      return;
    }

    archiveFeedback = null;
    closeResourceLifecycleDialog();
    archiveResourceMutation.mutate({
      resourceId: resource.id,
    });
  }

  function deleteResource(): void {
    if (!resource || !isResourceArchived || deleteResourceMutation.isPending) {
      return;
    }

    const confirmationResourceSlug = resourceDeleteConfirmation;
    deleteFeedback = null;
    closeResourceLifecycleDialog();
    deleteResourceMutation.mutate({
      resourceId: resource.id,
      confirmation: {
        resourceSlug: confirmationResourceSlug,
      },
    });
  }

  function deletePreviewResource(): void {
    if (
      !resource ||
      !isPreviewEnvironmentResource ||
      deletePreviewResourceMutation.isPending
    ) {
      return;
    }

    const confirmationResourceSlug = resourceDeleteConfirmation;
    archiveFeedback = null;
    deleteFeedback = null;
    closeResourceLifecycleDialog();
    deletePreviewResourceMutation.mutate({
      resourceId: resource.id,
      archiveBeforeDelete: !isResourceArchived,
      confirmation: {
        resourceSlug: confirmationResourceSlug,
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
    deploymentDestinationId = defaultDestinationId;
    deploymentServerId = latestDeployment?.serverId ?? servers[0]?.id ?? "";
    deploymentFeedback = null;
    deploymentPlanPreview = null;
    deploymentPlanError = "";
    deploymentDialogInitializedForResourceId = "";
  });

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (modalIsOpen(page, "deployment")) {
      if (
        !deploymentDialogOpen ||
        deploymentDialogInitializedForResourceId !== resource.id
      ) {
        prepareResourceDeploymentDialog();
      }
      return;
    }

    if (deploymentDialogOpen) {
      deploymentDialogOpen = false;
      deploymentDialogInitializedForResourceId = "";
    }
  });

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (modalIsOpen(page, "domain-binding")) {
      if (
        !domainBindingCreateDialogOpen ||
        domainBindingDialogInitializedForResourceId !== resource.id
      ) {
        prepareResourceDomainBindingCreateDialog();
      }
      return;
    }

    if (domainBindingCreateDialogOpen) {
      domainBindingCreateDialogOpen = false;
      domainBindingDialogInitializedForResourceId = "";
    }
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
    sourceVersion = source?.version ?? "";
    sourceVersionKind = source?.versionKind ?? "";
    sourceFeedback = null;
  });

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (sourceLinkFormResourceId === resource.id) {
      return;
    }

    sourceLinkFormResourceId = resource.id;
    sourceLinkFingerprint = "";
    sourceLinkServerId = latestDeployment?.serverId ?? servers[0]?.id ?? "";
    sourceLinkDestinationId = defaultDestinationId;
    sourceLinkFeedback = null;
  });

  $effect(() => {
    if (!browser || sourceLinkServerId || !resource) {
      return;
    }

    sourceLinkServerId = latestDeployment?.serverId ?? servers[0]?.id ?? "";
  });

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    const stateKey = [
      resource.id,
      resourceDetail?.source?.sourceBindingFingerprint ?? "no-source",
      autoDeployPolicy?.updatedAt ?? "no-policy",
    ].join(":");
    if (autoDeployFormStateKey === stateKey) {
      return;
    }

    autoDeployFormStateKey = stateKey;
    autoDeployTriggerKind = autoDeployPolicy?.triggerKind ?? "git-push";
    autoDeployRefs =
      autoDeployPolicy?.refs.join(", ") ??
      resourceDetail?.source?.gitRef ??
      resourceDetail?.source?.defaultBranch ??
      "main";
    autoDeployEventKind = autoDeployPolicy?.eventKinds[0] ?? "push";
    autoDeployGenericWebhookSecretRef = autoDeployPolicy?.genericWebhookSecretRef ?? "";
    autoDeployDedupeWindowSeconds = autoDeployPolicy?.dedupeWindowSeconds
      ? String(autoDeployPolicy.dedupeWindowSeconds)
      : "";
    autoDeployFeedback = null;
  });

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (scheduledTaskFormResourceId === resource.id) {
      return;
    }

    scheduledTaskFormResourceId = resource.id;
    scheduledTaskCreateDialogOpen = false;
    resetScheduledTaskForm();
    scheduledTaskFeedback = null;
    selectedScheduledTaskRunId = "";
    scheduledTaskRunLogs = [];
    scheduledTaskRunLogsError = null;
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
    runtimeName = profile?.runtimeName ?? "";
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
    if (!browser || !resource) {
      return;
    }

    if (accessFormResourceId === resource.id) {
      return;
    }

    const profile = resource.accessProfile;
    accessFormResourceId = resource.id;
    accessGeneratedAccessMode = profile?.generatedAccessMode ?? "inherit";
    accessPathPrefix = profile?.pathPrefix ?? "/";
    accessFeedback = null;
  });

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (configFormResourceId === resource.id) {
      return;
    }

    configFormResourceId = resource.id;
    configKey = "";
    configValue = "";
    configKind = "plain-config";
    configExposure = "runtime";
    configSecret = false;
    configFeedback = null;
  });

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (storageAttachmentFormResourceId !== resource.id) {
      storageAttachmentFormResourceId = resource.id;
      storageAttachmentVolumeId = "";
      storageAttachmentDestinationPath = "/data";
      storageAttachmentMountMode = "read-write";
      storageAttachmentFeedback = null;
      storageVolumeName = "";
      storageVolumeKind = "named-volume";
      storageVolumeDescription = "";
      storageVolumeSourcePath = "";
      storageVolumeFeedback = null;
      storageVolumeRenameNames = {};
      storageRuntimeCleanupVolumeId = "";
      storageRuntimeCleanupServerId = "";
      storageRuntimeCleanupBefore = new Date().toISOString();
      storageRuntimeCleanupObservationHandoffKey = "";
      storageRuntimeCleanupHandoffOpenedKey = "";
      storageRuntimeCleanupResult = null;
      storageRuntimeCleanupFeedback = null;
      storageBackupVolumeId = "";
      storageBackupDestinationPath = "/data";
      storageBackupDataFormat = "unknown";
      storageBackupLiveWrites = true;
      storageBackupConsistency = "application-consistent";
      storageBackupTargetProvider = "local-filesystem";
      storageBackupTargetRef = "/var/lib/appaloft/backups";
      storageBackupRetentionMaxCount = "3";
      storageBackupRetentionMinFreeBytes = "1073741824";
      storageBackupPlan = null;
      storageBackupRestoreNames = {};
      storageBackupFeedback = null;
    }

    if (!storageAttachmentVolumeId && storageVolumes.length > 0) {
      storageAttachmentVolumeId = storageVolumes[0]?.id ?? "";
    }

    if (!storageRuntimeCleanupVolumeId && storageVolumes.length > 0) {
      storageRuntimeCleanupVolumeId = storageVolumes[0]?.id ?? "";
    }

    if (!storageBackupVolumeId && storageVolumes.length > 0) {
      storageBackupVolumeId =
        resourceStorageAttachments[0]?.storageVolumeId ?? storageVolumes[0]?.id ?? "";
    }

    if (
      storageRuntimeCleanupVolumeId &&
      !storageVolumes.some((volume) => volume.id === storageRuntimeCleanupVolumeId)
    ) {
      storageRuntimeCleanupVolumeId = storageVolumes[0]?.id ?? "";
      storageRuntimeCleanupResult = null;
    }

    if (
      storageBackupVolumeId &&
      !storageVolumes.some((volume) => volume.id === storageBackupVolumeId)
    ) {
      storageBackupVolumeId =
        resourceStorageAttachments[0]?.storageVolumeId ?? storageVolumes[0]?.id ?? "";
      storageBackupPlan = null;
      storageBackupFeedback = null;
    }

    const backupAttachment = resourceStorageAttachments.find(
      (attachment) => attachment.storageVolumeId === storageBackupVolumeId,
    );
    if (backupAttachment) {
      if (
        backupAttachment.destinationPath &&
        (!storageBackupDestinationPath || storageBackupDestinationPath === "/data")
      ) {
        storageBackupDestinationPath = backupAttachment.destinationPath;
      }
      if (
        backupAttachment.dataFormat &&
        (!storageBackupDataFormat || storageBackupDataFormat === "unknown")
      ) {
        storageBackupDataFormat = backupAttachment.dataFormat;
      }
    }

    if (!storageRuntimeCleanupServerId) {
      storageRuntimeCleanupServerId = latestDeployment?.serverId ?? servers[0]?.id ?? "";
    }

    const observationHandoff = resourceRuntimeMonitoringObservationHandoff;
    const observationHandoffKey = observationHandoff
      ? `${resource.id}:${observationHandoff.from}:${observationHandoff.to}`
      : "";
    if (observationHandoff && storageRuntimeCleanupObservationHandoffKey !== observationHandoffKey) {
      storageRuntimeCleanupObservationHandoffKey = observationHandoffKey;
      storageRuntimeCleanupBefore = observationHandoff.to;
      storageRuntimeCleanupResult = null;
      storageRuntimeCleanupFeedback = null;
    }
    if (
      observationHandoff &&
      activeResourceSection === "storage" &&
      storageRuntimeCleanupHandoffOpenedKey !== observationHandoffKey
    ) {
      storageRuntimeCleanupHandoffOpenedKey = observationHandoffKey;
      openStorageRuntimeCleanupDialog();
    }
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
    const currentObservationHandoff = resourceRuntimeMonitoringObservationHandoff;

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

      void loadRuntimeLogs(currentResourceId, currentObservationHandoff?.from);
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
    if (detail.accessProfile) {
      summary.accessProfile = detail.accessProfile;
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

  function parseAutoDeployRefs(value: string): string[] {
    return value
      .split(/[\n,]/)
      .map((ref) => ref.trim())
      .filter((ref) => ref.length > 0);
  }

  function refreshRuntimeMonitor(): void {
    void resourceRuntimeUsageQuery.refetch();
    void resourceRuntimeMonitoringSamplesQuery.refetch();
    void resourceRuntimeMonitoringRollupQuery.refetch();
    void resourceRuntimeMonitoringThresholdsQuery.refetch();
    void resourceFallbackServerRuntimeUsageQuery.refetch();
    void resourceFallbackServerRuntimeMonitoringSamplesQuery.refetch();
    void resourceFallbackServerRuntimeMonitoringRollupQuery.refetch();
  }

  async function invalidateScheduledTaskQueries(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["scheduled-tasks", "resource", resourceId] }),
      queryClient.invalidateQueries({ queryKey: ["scheduled-task-runs", "resource", resourceId] }),
    ]);
  }

  async function invalidateStorageAttachmentQueries(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["resources"] }),
      queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] }),
      queryClient.invalidateQueries({ queryKey: ["storage-volumes"] }),
    ]);
  }

  async function invalidateStorageBackupQueries(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["storage-volume-backups"] }),
      queryClient.invalidateQueries({ queryKey: ["storage-volumes"] }),
      queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] }),
    ]);
  }

  async function invalidateDependencyQueries(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dependency-resources"] }),
      queryClient.invalidateQueries({ queryKey: ["resource-dependency-bindings", resourceId] }),
      queryClient.invalidateQueries({ queryKey: ["resources", "show", resourceId] }),
    ]);
  }

  function resetScheduledTaskForm(): void {
    scheduledTaskSchedule = "*/5 * * * *";
    scheduledTaskTimezone = "UTC";
    scheduledTaskCommandIntent = "";
    scheduledTaskTimeoutSeconds = "300";
    scheduledTaskRetryLimit = "0";
    scheduledTaskStatus = "enabled";
  }

  function openScheduledTaskCreateDialog(): void {
    resetScheduledTaskForm();
    scheduledTaskFeedback = null;
    scheduledTaskCreateDialogOpen = true;
  }

  function createScheduledTask(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canCreateScheduledTask || createScheduledTaskMutation.isPending) {
      return;
    }

    scheduledTaskFeedback = null;
    createScheduledTaskMutation.mutate({
      resourceId: resource.id,
      schedule: scheduledTaskSchedule.trim(),
      timezone: scheduledTaskTimezone.trim(),
      commandIntent: scheduledTaskCommandIntent.trim(),
      timeoutSeconds: Number(scheduledTaskTimeoutSeconds),
      retryLimit: Number(scheduledTaskRetryLimit),
      concurrencyPolicy: "forbid",
      status: scheduledTaskStatus,
    });
  }

  function openScheduledTaskManageDialog(task: ScheduledTaskDefinitionSummary): void {
    if (!resource || isResourceArchived) {
      return;
    }

    selectedScheduledTaskForManage = task;
    scheduledTaskFeedback = null;
    scheduledTaskManageDialogOpen = true;
  }

  function configureScheduledTaskStatus(task: ScheduledTaskDefinitionSummary): void {
    if (!resource || isResourceArchived || configureScheduledTaskMutation.isPending) {
      return;
    }

    scheduledTaskFeedback = null;
    scheduledTaskManageDialogOpen = false;
    configureScheduledTaskMutation.mutate({
      taskId: task.taskId,
      resourceId: resource.id,
      status: task.status === "enabled" ? "disabled" : "enabled",
    });
  }

  function runScheduledTaskNow(task: ScheduledTaskDefinitionSummary): void {
    if (!resource || isResourceArchived || runScheduledTaskNowMutation.isPending) {
      return;
    }

    scheduledTaskFeedback = null;
    scheduledTaskManageDialogOpen = false;
    runScheduledTaskNowMutation.mutate({
      taskId: task.taskId,
      resourceId: resource.id,
    });
  }

  function openScheduledTaskDeleteDialog(task: ScheduledTaskDefinitionSummary): void {
    if (!resource || isResourceArchived || deleteScheduledTaskMutation.isPending) {
      return;
    }

    selectedScheduledTaskForDelete = task;
    scheduledTaskFeedback = null;
    scheduledTaskDeleteDialogOpen = true;
  }

  function deleteScheduledTask(): void {
    if (
      !resource ||
      !selectedScheduledTaskForDelete ||
      isResourceArchived ||
      deleteScheduledTaskMutation.isPending
    ) {
      return;
    }

    scheduledTaskFeedback = null;
    scheduledTaskDeleteDialogOpen = false;
    deleteScheduledTaskMutation.mutate({
      taskId: selectedScheduledTaskForDelete.taskId,
      resourceId: resource.id,
    });
  }

  async function loadScheduledTaskRunLogs(run: ScheduledTaskRunSummary): Promise<void> {
    if (!resource) {
      return;
    }

    const requestId = scheduledTaskRunLogsRequestId + 1;
    scheduledTaskRunLogsRequestId = requestId;
    selectedScheduledTaskRunId = run.runId;
    scheduledTaskRunLogsLoading = true;
    scheduledTaskRunLogsError = null;

    try {
      const result = await orpcClient.scheduledTasks.runs.logs({
        runId: run.runId,
        taskId: run.taskId,
        resourceId: resource.id,
        limit: 100,
      });

      if (scheduledTaskRunLogsRequestId === requestId && selectedScheduledTaskRunId === run.runId) {
        scheduledTaskRunLogs = result.entries;
      }
    } catch (error) {
      if (scheduledTaskRunLogsRequestId === requestId && selectedScheduledTaskRunId === run.runId) {
        scheduledTaskRunLogsError = readErrorMessage(error);
      }
    } finally {
      if (scheduledTaskRunLogsRequestId === requestId) {
        scheduledTaskRunLogsLoading = false;
      }
    }
  }

  function clearScheduledTaskRunLogs(): void {
    scheduledTaskRunLogsRequestId += 1;
    selectedScheduledTaskRunId = "";
    scheduledTaskRunLogs = [];
    scheduledTaskRunLogsError = null;
    scheduledTaskRunLogsLoading = false;
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
    const version = sourceVersion.trim();
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
      ...(sourceVersionIsEditable && version ? { version } : {}),
      ...(sourceVersionIsEditable && sourceVersionKind ? { versionKind: sourceVersionKind } : {}),
    };

    sourceFeedback = null;
    configureResourceSourceMutation.mutate({
      resourceId: resource.id,
      source,
    });
  }

  function openSourceLinkDialog(): void {
    if (!resource || isResourceArchived) {
      return;
    }

    sourceLinkFingerprint = resourceDetail?.source?.sourceBindingFingerprint ?? "";
    sourceLinkServerId = latestDeployment?.serverId ?? servers[0]?.id ?? "";
    sourceLinkDestinationId = defaultDestinationId;
    sourceLinkFeedback = null;
    sourceLinkDialogOpen = true;
  }

  function closeSourceLinkDialog(): void {
    sourceLinkDialogOpen = false;
  }

  function relinkSourceLink(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canRelinkSourceLink || relinkSourceLinkMutation.isPending) {
      return;
    }

    const destination = sourceLinkDestinationId.trim();
    sourceLinkFeedback = null;
    relinkSourceLinkMutation.mutate({
      sourceFingerprint: sourceLinkFingerprint.trim(),
      projectId: resource.projectId,
      environmentId: resource.environmentId,
      resourceId: resource.id,
      serverId: sourceLinkServerId,
      ...(destination ? { destinationId: destination } : {}),
      reason: "web-console-source-link-relink",
    });
  }

  function configureResourceAutoDeploy(event: SubmitEvent): void {
    event.preventDefault();

    if (
      !resource ||
      !canConfigureAutoDeploy ||
      configureResourceAutoDeployMutation.isPending
    ) {
      return;
    }

    const genericWebhookSecretRef = autoDeployGenericWebhookSecretRef.trim();
    const dedupeWindowSeconds = autoDeployDedupeWindowSeconds.trim();
    const policy: AutoDeployPolicyInput = {
      triggerKind: autoDeployTriggerKind,
      refs: parseAutoDeployRefs(autoDeployRefs),
      eventKinds: [autoDeployEventKind],
      ...(autoDeployTriggerKind === "generic-signed-webhook" && genericWebhookSecretRef
        ? { genericWebhookSecretRef }
        : {}),
      ...(dedupeWindowSeconds ? { dedupeWindowSeconds: Number(dedupeWindowSeconds) } : {}),
    };

    autoDeployFeedback = null;
    configureResourceAutoDeployMutation.mutate({
      resourceId: resource.id,
      mode: autoDeployPolicy ? "replace" : "enable",
      policy,
    });
  }

  function disableResourceAutoDeploy(): void {
    if (!resource || isResourceArchived || configureResourceAutoDeployMutation.isPending) {
      return;
    }

    autoDeployFeedback = null;
    configureResourceAutoDeployMutation.mutate({
      resourceId: resource.id,
      mode: "disable",
    });
  }

  function acknowledgeAutoDeploySourceBinding(): void {
    const sourceBindingFingerprint = resourceDetail?.source?.sourceBindingFingerprint;
    if (
      !resource ||
      !sourceBindingFingerprint ||
      !canAcknowledgeAutoDeploySource ||
      configureResourceAutoDeployMutation.isPending
    ) {
      return;
    }

    autoDeployFeedback = null;
    configureResourceAutoDeployMutation.mutate({
      resourceId: resource.id,
      mode: "acknowledge-source-binding",
      sourceBindingFingerprint,
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
    const requestedRuntimeName = runtimeName.trim();
    const publishDirectory = runtimePublishDirectory.trim();
    const dockerfilePath = runtimeDockerfilePath.trim();
    const dockerComposeFilePath = runtimeDockerComposeFilePath.trim();
    const buildTarget = runtimeBuildTarget.trim();
    const runtimeProfile: RuntimeProfileInput = {
      strategy: runtimeStrategy,
      ...(installCommand ? { installCommand } : {}),
      ...(buildCommand ? { buildCommand } : {}),
      ...(startCommand ? { startCommand } : {}),
      ...(requestedRuntimeName ? { runtimeName: requestedRuntimeName } : {}),
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

  function canControlResourceRuntime(operation: "stop" | "start" | "restart"): boolean {
    if (operation === "stop") {
      return canStopRuntimeByCapability;
    }
    if (operation === "start") {
      return canStartRuntimeByCapability;
    }
    return canRestartRuntimeByCapability;
  }

  function openRuntimeControlDialog(): void {
    if (!resource || isResourceArchived || runtimeControlPending) {
      return;
    }

    runtimeControlFeedback = null;
    selectedRuntimeControlOperation = null;
    runtimeControlDialogOpen = true;
  }

  function closeRuntimeControlDialog(): void {
    runtimeControlDialogOpen = false;
    selectedRuntimeControlOperation = null;
  }

  function confirmSelectedRuntimeControl(): void {
    if (!selectedRuntimeControlOperation) {
      return;
    }

    controlResourceRuntime(selectedRuntimeControlOperation);
  }

  function controlResourceRuntime(operation: "stop" | "start" | "restart"): void {
    if (!resource || isResourceArchived || !canControlResourceRuntime(operation) || runtimeControlPending) {
      return;
    }

    runtimeControlFeedback = null;
    const input = {
      resourceId: resource.id,
      ...(operation === "start" || operation === "restart"
        ? { acknowledgeRetainedRuntimeMetadata: true }
        : {}),
    };

    if (operation === "stop") {
      stopResourceRuntimeMutation.mutate(input);
      return;
    }

    if (operation === "start") {
      startResourceRuntimeMutation.mutate(input);
      return;
    }

    restartResourceRuntimeMutation.mutate(input);
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

  function configureResourceAccess(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canConfigureAccess || configureResourceAccessMutation.isPending) {
      return;
    }

    accessFeedback = null;
    configureResourceAccessMutation.mutate({
      resourceId: resource.id,
      accessProfile: {
        generatedAccessMode: accessGeneratedAccessMode,
        pathPrefix: accessPathPrefix.trim() || "/",
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

  function setResourceVariable(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canSetResourceVariable || setResourceVariableMutation.isPending) {
      return;
    }

    configFeedback = null;
    setResourceVariableMutation.mutate({
      resourceId: resource.id,
      key: configKey.trim(),
      value: configValue,
      kind: configKind,
      exposure: configExposure,
      ...(configSecret ? { isSecret: true } : {}),
    });
  }

  function parseImportKeyList(value: string): string[] {
    return value
      .split(/[\s,]+/)
      .map((key) => key.trim())
      .filter(Boolean);
  }

  function importResourceVariables(event: SubmitEvent): void {
    event.preventDefault();

    if (
      !resource ||
      !canImportResourceVariables ||
      importResourceVariablesMutation.isPending
    ) {
      return;
    }

    configFeedback = null;
    importResourceVariablesMutation.mutate({
      resourceId: resource.id,
      content: configImportContent,
      exposure: configImportExposure,
      secretKeys: parseImportKeyList(configImportSecretKeys),
      plainKeys: parseImportKeyList(configImportPlainKeys),
    });
  }

  function unsetResourceVariable(entry: ResourceConfigEntry): void {
    if (!resource || isResourceArchived || unsetResourceVariableMutation.isPending) {
      return;
    }

    configFeedback = null;
    unsetResourceVariableMutation.mutate({
      resourceId: resource.id,
      key: entry.key,
      exposure: entry.exposure,
    });
  }

  function attachResourceStorage(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canAttachStorage || attachResourceStorageMutation.isPending) {
      return;
    }

    storageAttachmentFeedback = null;
    attachResourceStorageMutation.mutate({
      resourceId: resource.id,
      storageVolumeId: storageAttachmentVolumeId,
      destinationPath: storageAttachmentDestinationPath.trim(),
      mountMode: storageAttachmentMountMode,
    });
  }

  function openStorageCreateDialog(): void {
    storageVolumeFeedback = null;
    storageVolumeName = "";
    storageVolumeKind = "named-volume";
    storageVolumeDescription = "";
    storageVolumeSourcePath = "";
    storageCreateDialogOpen = true;
  }

  function openStorageRenameDialog(volume: StorageVolumeSummary): void {
    storageVolumeFeedback = null;
    storageRenameVolumeId = volume.id;
    storageVolumeRenameNames = {
      ...storageVolumeRenameNames,
      [volume.id]: storageVolumeRenameNames[volume.id] ?? volume.name,
    };
    storageRenameDialogOpen = true;
  }

  function openStorageAttachDialog(volume?: StorageVolumeSummary): void {
    storageAttachmentFeedback = null;
    storageAttachmentVolumeId = volume?.id ?? storageAttachmentVolumeId ?? storageVolumes[0]?.id ?? "";
    storageAttachmentDestinationPath = "/data";
    storageAttachmentMountMode = "read-write";
    storageAttachDialogOpen = true;
  }

  function openStorageBackupDialog(volume?: StorageVolumeSummary): void {
    const targetVolumeId =
      volume?.id ?? storageBackupVolumeId ?? resourceStorageAttachments[0]?.storageVolumeId ?? "";
    const attachment = resourceStorageAttachments.find(
      (candidate) => candidate.storageVolumeId === targetVolumeId,
    );

    storageBackupVolumeId = targetVolumeId;
    storageBackupDestinationPath = attachment?.destinationPath ?? "/data";
    storageBackupDataFormat = attachment?.dataFormat ?? "unknown";
    storageBackupFeedback = null;
    storageBackupPlan = null;
    storageBackupDialogOpen = true;
  }

  function openStorageRuntimeCleanupDialog(volume?: StorageVolumeSummary): void {
    storageRuntimeCleanupVolumeId = volume?.id ?? storageRuntimeCleanupVolumeId ?? storageVolumes[0]?.id ?? "";
    storageRuntimeCleanupServerId =
      storageRuntimeCleanupServerId || latestDeployment?.serverId || servers[0]?.id || "";
    storageRuntimeCleanupBefore = storageRuntimeCleanupBefore || new Date().toISOString();
    storageRuntimeCleanupFeedback = null;
    storageRuntimeCleanupResult = null;
    storageRuntimeCleanupDialogOpen = true;
  }

  function createStorageVolume(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canCreateStorageVolume || createStorageVolumeMutation.isPending) {
      return;
    }

    storageVolumeFeedback = null;
    createStorageVolumeMutation.mutate({
      projectId: resource.projectId,
      environmentId: resource.environmentId,
      name: storageVolumeName.trim(),
      kind: storageVolumeKind,
      ...(storageVolumeDescription.trim()
        ? { description: storageVolumeDescription.trim() }
        : {}),
      ...(storageVolumeKind === "bind-mount"
        ? { sourcePath: storageVolumeSourcePath.trim() }
        : {}),
    });
  }

  function updateStorageVolumeRenameName(storageVolumeId: string, event: Event): void {
    storageVolumeRenameNames = {
      ...storageVolumeRenameNames,
      [storageVolumeId]: (event.currentTarget as HTMLInputElement).value,
    };
  }

  function renameStorageVolume(volume: StorageVolumeSummary): void {
    if (renameStorageVolumeMutation.isPending) {
      return;
    }

    const name = (storageVolumeRenameNames[volume.id] ?? volume.name).trim();
    if (!name || name === volume.name) {
      return;
    }

    storageVolumeFeedback = null;
    renameStorageVolumeMutation.mutate({
      storageVolumeId: volume.id,
      name,
    });
  }

  function cleanupStorageRuntime(dryRun: boolean): void {
    if (!canCleanupStorageRuntime || cleanupStorageRuntimeMutation.isPending) {
      return;
    }

    storageRuntimeCleanupFeedback = null;
    cleanupStorageRuntimeMutation.mutate({
      storageVolumeId: storageRuntimeCleanupVolumeId,
      serverId: storageRuntimeCleanupServerId,
      before: storageRuntimeCleanupBefore.trim(),
      dryRun,
    });
  }

  function previewStorageRuntimeCleanup(): void {
    cleanupStorageRuntime(true);
  }

  function createStorageBackupPlanRequest(): CreateStorageVolumeBackupPlanInput {
    return {
      storageVolumeId: storageBackupVolumeId,
      source: {
        storageVolumeId: storageBackupVolumeId,
        ...(resource ? { resourceId: resource.id } : {}),
        ...(latestDeployment?.serverId ? { serverId: latestDeployment.serverId } : {}),
        ...(storageBackupDestinationPath.trim()
          ? { destinationPath: storageBackupDestinationPath.trim() }
          : {}),
        ...(storageBackupDataFormat ? { dataFormat: storageBackupDataFormat } : {}),
        liveWrites: storageBackupLiveWrites,
      },
      requestedConsistency: storageBackupConsistency,
      target: {
        providerKey: storageBackupTargetProvider,
        targetRef: storageBackupTargetRef.trim(),
      },
      retention: {
        maxCount: Number(storageBackupRetentionMaxCount),
        minFreeBytes: Number(storageBackupRetentionMinFreeBytes),
      },
    };
  }

  function planStorageBackup(): void {
    if (!canPlanStorageBackup || planStorageVolumeBackupMutation.isPending) {
      return;
    }

    storageBackupFeedback = null;
    storageBackupPlan = null;
    planStorageVolumeBackupMutation.mutate(createStorageBackupPlanRequest());
  }

  function createStorageBackup(): void {
    if (!canCreateStorageBackup || createStorageVolumeBackupMutation.isPending) {
      return;
    }

    storageBackupFeedback = null;
    createStorageVolumeBackupMutation.mutate({
      storageVolumeId: storageBackupVolumeId,
      planRequest: createStorageBackupPlanRequest(),
    });
  }

  function restoreStorageBackup(backup: StorageVolumeBackupSummary): void {
    if (
      !resource ||
      isResourceArchived ||
      backup.status !== "ready" ||
      restoreStorageVolumeBackupMutation.isPending
    ) {
      return;
    }

    storageBackupFeedback = null;
    restoreStorageVolumeBackupMutation.mutate({
      backupId: backup.id,
      targetMode: "new-volume",
      ...(storageBackupRestoreNames[backup.id]?.trim()
        ? { restoredVolumeName: storageBackupRestoreNames[backup.id].trim() }
        : {}),
    });
  }

  function pruneStorageBackup(backup: StorageVolumeBackupSummary): void {
    if (
      !resource ||
      isResourceArchived ||
      backup.status === "pruned" ||
      pruneStorageVolumeBackupMutation.isPending
    ) {
      return;
    }

    storageBackupFeedback = null;
    pruneStorageVolumeBackupMutation.mutate({ backupId: backup.id });
  }

  function bindDependencyResource(event: SubmitEvent): void {
    event.preventDefault();

    if (!resource || !canBindDependencyResource || bindResourceDependencyMutation.isPending) {
      return;
    }

    dependencyFeedback = null;
    bindResourceDependencyMutation.mutate({
      resourceId: resource.id,
      dependencyResourceId: dependencyBindingResourceId,
      targetName: dependencyBindingTargetName.trim(),
      scope: "runtime-only",
      injectionMode: "env",
    });
  }

  function openDependencyBindDialog(): void {
    dependencyFeedback = null;
    dependencyBindingResourceId =
      dependencyBindingResourceId || bindableDependencyResources[0]?.id || "";
    dependencyBindingTargetName = dependencyBindingTargetName || "DATABASE_URL";
    dependencyBindDialogOpen = true;
  }

  function closeDependencyBindDialog(): void {
    dependencyBindDialogOpen = false;
    dependencyFeedback = null;
  }

  function canRotateDependencyBindingSecret(bindingId: string): boolean {
    const hasSecretRef = Boolean((dependencyBindingSecretRefs[bindingId] ?? "").trim());
    const hasSecretValue = Boolean((dependencyBindingSecretValues[bindingId] ?? "").trim());

    return (
      Boolean(resource) &&
      !isResourceArchived &&
      hasSecretRef !== hasSecretValue &&
      dependencyBindingSecretRotationAcks[bindingId] === true &&
      !rotateResourceDependencyBindingSecretMutation.isPending
    );
  }

  function rotateDependencyBindingSecret(binding: ResourceDependencyBindingSummary): void {
    if (!resource || !canRotateDependencyBindingSecret(binding.id)) {
      return;
    }

    const secretRef = (dependencyBindingSecretRefs[binding.id] ?? "").trim();
    const secretValue = (dependencyBindingSecretValues[binding.id] ?? "").trim();

    dependencyFeedback = null;
    rotateResourceDependencyBindingSecretMutation.mutate({
      resourceId: resource.id,
      bindingId: binding.id,
      confirmHistoricalSnapshotsRemainUnchanged: true,
      ...(secretRef ? { secretRef } : { secretValue }),
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

  const selectedImportBinding = $derived(
    resourceDomainBindings.find((binding) => binding.id === importBindingId) ?? null,
  );

  function resetImportCertificateForm(): void {
    importBindingId = "";
    importCertificateChain = "";
    importPrivateKey = "";
    importPassphrase = "";
  }

  function closeCertificateImportDialog(): void {
    certificateImportDialogOpen = false;
    resetImportCertificateForm();
  }

  function openCertificateImportDialog(binding: DomainBindingSummary): void {
    if (binding.certificatePolicy !== "manual") {
      return;
    }

    importBindingId = binding.id;
    importCertificateChain = "";
    importPrivateKey = "";
    importPassphrase = "";
    importFeedback = null;
    certificateImportDialogOpen = true;
  }

  function importCertificateForBinding(binding: DomainBindingSummary, event: SubmitEvent): void {
    event.preventDefault();

    if (
      binding.certificatePolicy !== "manual" ||
      importBindingId !== binding.id ||
      !canImportCertificate ||
      importCertificateMutation.isPending
    ) {
      return;
    }

    importFeedback = null;
    importCertificateMutation.mutate({
      domainBindingId: binding.id,
      certificateChain: importCertificateChain.trim(),
      privateKey: importPrivateKey.trim(),
      ...(importPassphrase.trim() ? { passphrase: importPassphrase } : {}),
    });
  }

  function certificateBindingId(certificateId: string | undefined): string {
    return certificates.find((certificate) => certificate.id === certificateId)?.domainBindingId ?? "";
  }

  function retryCertificate(certificate: CertificateSummary): void {
    if (
      certificate.source !== "managed" ||
      certificate.latestAttempt?.status !== "retry_scheduled" ||
      retryCertificateMutation.isPending
    ) {
      return;
    }

    certificateActionFeedback = null;
    retryCertificateMutation.mutate({ certificateId: certificate.id });
  }

  function revokeCertificate(certificate: CertificateSummary): void {
    if (certificate.status !== "active" || revokeCertificateMutation.isPending) {
      return;
    }

    certificateActionFeedback = null;
    revokeCertificateMutation.mutate({ certificateId: certificate.id });
  }

  function domainBindingHref(binding: DomainBindingSummary): string {
    const normalizedPath = binding.pathPrefix.startsWith("/")
      ? binding.pathPrefix
      : `/${binding.pathPrefix}`;
    const path = normalizedPath === "/" ? "" : normalizedPath;
    const protocol = binding.tlsMode === "disabled" ? "http" : "https";
    return `${protocol}://${binding.domainName}${path}`;
  }

  function serverTerminalHref(serverId: string): string {
    return `/servers/${encodeURIComponent(serverId)}?tab=runtime&section=terminal`;
  }

  function parseResourceDetailTab(value: string | null): ResourceDetailTab {
    if (!value) {
      return "overview";
    }

    return resourceDetailTabs.includes(value as ResourceDetailTab)
      ? (value as ResourceDetailTab)
      : "overview";
  }

  function resourceSectionsForTab(tab: ResourceDetailTab): readonly ResourceDetailSection[] {
    switch (tab) {
      case "networking":
        return resourceNetworkingSections;
      case "configuration":
        return resourceConfigurationSections;
      case "dependencies":
        return resourceDependenciesSections;
      case "jobs":
        return resourceJobsSections;
      case "settings":
        return resourceSettingsSections;
      case "overview":
      case "deployments":
      case "monitor":
      case "logs":
      case "terminal":
      case "previews":
        return [];
    }
  }

  function resourceDefaultSectionForTab(tab: ResourceDetailTab): ResourceDetailSection | null {
    return resourceSectionsForTab(tab)[0] ?? null;
  }

  function parseResourceDetailSection(
    tab: ResourceDetailTab,
    value: string | null,
  ): ResourceDetailSection {
    const sections = resourceSectionsForTab(tab);
    const defaultSection = resourceDefaultSectionForTab(tab) ?? "general";
    if (value && allResourceDetailSections.includes(value as ResourceDetailSection)) {
      const section = value as ResourceDetailSection;
      return sections.includes(section) ? section : defaultSection;
    }

    return defaultSection;
  }

  function resourceTabHref(tab: ResourceDetailTab): string {
    const params = new URLSearchParams();

    if (tab === "overview") {
      params.delete("tab");
      params.delete("deploymentId");
      params.delete("section");
    } else {
      params.set("tab", tab);
      params.delete("section");
      params.delete("deploymentId");
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function resourceSectionTab(section: ResourceDetailSection): ResourceDetailTab {
    switch (section) {
      case "access":
      case "domains":
      case "proxy":
        return "networking";
      case "profile":
      case "configuration":
      case "auto-deploy":
      case "health":
        return "configuration";
      case "dependencies":
      case "storage":
        return "dependencies";
      case "scheduled-tasks":
      case "source-events":
        return "jobs";
      case "general":
      case "diagnostics":
      case "danger":
        return "settings";
    }
  }

  function selectResourceTab(tab: ResourceDetailTab, event: MouseEvent): void {
    event.preventDefault();
    void goto(resourceTabHref(tab), { noScroll: true, keepFocus: true });
  }

  function resourceTabLabel(tab: ResourceDetailTab): string {
    switch (tab) {
      case "overview":
        return $t(i18nKeys.console.resources.overviewTitle);
      case "deployments":
        return $t(i18nKeys.common.domain.deployments);
      case "monitor":
        return $t(i18nKeys.console.runtimeUsage.monitorTab);
      case "logs":
        return $t(i18nKeys.console.resources.logsTab);
      case "terminal":
        return $t(i18nKeys.console.terminal.title);
      case "networking":
        return $t(i18nKeys.console.resources.networkingTab);
      case "configuration":
        return $t(i18nKeys.console.resources.configurationTab);
      case "dependencies":
        return $t(i18nKeys.console.resources.dependenciesTitle);
      case "previews":
        return $t(i18nKeys.console.resources.previewEnvironmentsTab);
      case "jobs":
        return $t(i18nKeys.console.resources.jobsTab);
      case "settings":
        return $t(i18nKeys.console.resources.settingsTab);
    }
  }

  function previewEnvironmentStatusLabel(
    status: PreviewEnvironmentSummary["status"],
  ): string {
    return status === "cleanup-requested"
      ? $t(i18nKeys.console.previewEnvironments.statusCleanupRequested)
      : $t(i18nKeys.console.previewEnvironments.statusActive);
  }

  function previewEnvironmentStatusVariant(
    status: PreviewEnvironmentSummary["status"],
  ): "default" | "secondary" {
    return status === "cleanup-requested" ? "secondary" : "default";
  }

  function previewEnvironmentExpired(previewEnvironment: PreviewEnvironmentSummary): boolean {
    return previewEnvironment.expiresAt
      ? Date.parse(previewEnvironment.expiresAt) <= Date.now()
      : false;
  }

  function openPreviewEnvironmentCleanupDialog(
    previewEnvironment: PreviewEnvironmentSummary,
  ): void {
    if (
      !browser ||
      cleanupPreviewEnvironmentMutation.isPending ||
      previewEnvironment.status !== "active"
    ) {
      return;
    }

    selectedPreviewEnvironmentForCleanup = previewEnvironment;
    previewEnvironmentFeedback = null;
    previewEnvironmentCleanupDialogOpen = true;
  }

  function cleanupPreviewEnvironment(): void {
    if (
      !selectedPreviewEnvironmentForCleanup ||
      cleanupPreviewEnvironmentMutation.isPending ||
      selectedPreviewEnvironmentForCleanup.status !== "active"
    ) {
      return;
    }

    previewEnvironmentCleanupDialogOpen = false;
    cleanupPreviewEnvironmentMutation.mutate({
      previewEnvironmentId: selectedPreviewEnvironmentForCleanup.previewEnvironmentId,
      resourceId: selectedPreviewEnvironmentForCleanup.resourceId,
    });
  }

  function resourceSectionHref(section: ResourceDetailSection): string {
    const params = new URLSearchParams();

    const tab = resourceSectionTab(section);
    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }

    if (section === resourceDefaultSectionForTab(tab)) {
      params.delete("section");
    } else {
      params.set("section", section);
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectResourceDetailSection(section: ResourceDetailSection, event: MouseEvent): void {
    event.preventDefault();
    void goto(resourceSectionHref(section), { noScroll: true, keepFocus: true });
  }

  function resourceSectionLabel(section: ResourceDetailSection): string {
    switch (section) {
      case "access":
        return $t(i18nKeys.console.resources.accessTab);
      case "general":
        return $t(i18nKeys.console.resources.generalSection);
      case "profile":
        return $t(i18nKeys.console.resources.profileTitle);
      case "auto-deploy":
        return $t(i18nKeys.console.resources.autoDeployTitle);
      case "configuration":
        return $t(i18nKeys.console.resources.configurationTitle);
      case "storage":
        return $t(i18nKeys.console.resources.storageTitle);
      case "dependencies":
        return $t(i18nKeys.console.resources.dependenciesTitle);
      case "domains":
        return $t(i18nKeys.console.resources.domainBindingsTitle);
      case "health":
        return $t(i18nKeys.console.resources.healthPolicy);
      case "proxy":
        return $t(i18nKeys.console.resources.proxyConfigurationTitle);
      case "diagnostics":
        return $t(i18nKeys.console.resources.diagnosticsTitle);
      case "scheduled-tasks":
        return $t(i18nKeys.console.resources.scheduledTasksTab);
      case "source-events":
        return $t(i18nKeys.console.resources.sourceEventsTab);
      case "danger":
        return $t(i18nKeys.console.resources.dangerZoneTitle);
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

  function autoDeployTriggerKindLabel(kind: AutoDeployTriggerKind): string {
    switch (kind) {
      case "generic-signed-webhook":
        return $t(i18nKeys.console.resources.autoDeployTriggerGenericSigned);
      case "git-push":
        return $t(i18nKeys.console.resources.autoDeployTriggerGitPush);
    }
  }

  function autoDeployEventKindLabel(kind: AutoDeployEventKind): string {
    switch (kind) {
      case "push":
        return $t(i18nKeys.console.resources.autoDeployEventPush);
      case "tag":
        return $t(i18nKeys.console.resources.autoDeployEventTag);
    }
  }

  function autoDeployStatusLabel(status: NonNullable<typeof autoDeployPolicy>["status"]): string {
    switch (status) {
      case "blocked":
        return $t(i18nKeys.console.resources.autoDeployStatusBlocked);
      case "disabled":
        return $t(i18nKeys.console.resources.autoDeployStatusDisabled);
      case "enabled":
        return $t(i18nKeys.console.resources.autoDeployStatusEnabled);
    }
  }

  function autoDeployStatusVariant(
    status: NonNullable<typeof autoDeployPolicy>["status"],
  ): "default" | "destructive" | "outline" | "secondary" {
    switch (status) {
      case "blocked":
        return "destructive";
      case "disabled":
        return "outline";
      case "enabled":
        return "default";
    }
  }

  function sourceEventStatusLabel(status: SourceEventListItem["status"]): string {
    switch (status) {
      case "accepted":
        return $t(i18nKeys.console.resources.sourceEventStatusAccepted);
      case "blocked":
        return $t(i18nKeys.common.status.blocked);
      case "deduped":
        return $t(i18nKeys.console.resources.sourceEventStatusDeduped);
      case "dispatched":
        return $t(i18nKeys.console.resources.sourceEventStatusDispatched);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      case "ignored":
        return $t(i18nKeys.console.resources.sourceEventStatusIgnored);
    }
  }

  function sourceEventStatusVariant(
    status: SourceEventListItem["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "dispatched":
        return "default";
      case "accepted":
      case "deduped":
        return "secondary";
      case "blocked":
      case "failed":
        return "destructive";
      case "ignored":
        return "outline";
    }
  }

  function sourceEventDedupeStatusLabel(
    status: SourceEventListItem["dedupeStatus"],
  ): string {
    return status === "duplicate"
      ? $t(i18nKeys.console.resources.sourceEventDedupeDuplicate)
      : $t(i18nKeys.console.resources.sourceEventDedupeNew);
  }

  function sourceEventIgnoredReasonLabel(
    reason: SourceEventListItem["ignoredReasons"][number],
  ): string {
    switch (reason) {
      case "no-matching-policy":
        return $t(i18nKeys.console.resources.sourceEventIgnoredNoMatchingPolicy);
      case "policy-blocked":
        return $t(i18nKeys.console.resources.sourceEventIgnoredPolicyBlocked);
      case "policy-disabled":
        return $t(i18nKeys.console.resources.sourceEventIgnoredPolicyDisabled);
      case "ref-not-matched":
        return $t(i18nKeys.console.resources.sourceEventIgnoredRefNotMatched);
    }
  }

  function scheduledTaskStatusLabel(status: ScheduledTaskDefinitionSummary["status"]): string {
    return status === "enabled"
      ? $t(i18nKeys.console.resources.scheduledTaskStatusEnabled)
      : $t(i18nKeys.console.resources.scheduledTaskStatusDisabled);
  }

  function scheduledTaskRunStatusLabel(status: ScheduledTaskRunStatus): string {
    switch (status) {
      case "accepted":
        return $t(i18nKeys.console.resources.scheduledTaskRunStatusAccepted);
      case "running":
        return $t(i18nKeys.common.status.running);
      case "succeeded":
        return $t(i18nKeys.console.resources.scheduledTaskRunStatusSucceeded);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      case "skipped":
        return $t(i18nKeys.common.status.skipped);
    }
  }

  function scheduledTaskRunStatusVariant(
    status: ScheduledTaskRunStatus,
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "succeeded":
        return "default";
      case "accepted":
      case "running":
        return "secondary";
      case "failed":
        return "destructive";
      case "skipped":
        return "outline";
    }
  }

  function scheduledTaskRunTriggerLabel(triggerKind: ScheduledTaskRunTriggerKind): string {
    return triggerKind === "manual"
      ? $t(i18nKeys.console.resources.scheduledTaskTriggerManual)
      : $t(i18nKeys.console.resources.scheduledTaskTriggerScheduled);
  }

  function configScopeBadgeVariant(scope: ResourceConfigEntry["scope"]): "default" | "outline" {
    return scope === "resource" ? "default" : "outline";
  }

  function configExposureLabel(exposure: ResourceVariableExposure): string {
    return exposure === "build-time"
      ? $t(i18nKeys.console.resources.configurationExposureBuildTime)
      : $t(i18nKeys.console.resources.configurationExposureRuntime);
  }

  function configKindLabel(kind: ResourceVariableKind): string {
    switch (kind) {
      case "plain-config":
        return $t(i18nKeys.console.resources.configurationKindPlain);
      case "secret":
        return $t(i18nKeys.console.resources.configurationKindSecret);
      case "provider-specific":
        return $t(i18nKeys.console.resources.configurationKindProviderSpecific);
      case "deployment-strategy":
        return $t(i18nKeys.console.resources.configurationKindDeploymentStrategy);
    }
  }

  function storageVolumeKindLabel(kind: StorageVolumeSummary["kind"]): string {
    return kind === "bind-mount"
      ? $t(i18nKeys.console.resources.storageKindBindMount)
      : $t(i18nKeys.console.resources.storageKindNamedVolume);
  }

  function storageMountModeLabel(mode: AttachResourceStorageInput["mountMode"]): string {
    return mode === "read-only"
      ? $t(i18nKeys.console.resources.storageMountModeReadOnly)
      : $t(i18nKeys.console.resources.storageMountModeReadWrite);
  }

  function storageVolumeOptionLabel(volume: StorageVolumeSummary): string {
    return `${volume.name} (${storageVolumeKindLabel(volume.kind)})`;
  }

  function storageVolumeCurrentResourceAttachments(
    volume: StorageVolumeSummary,
  ): ResourceStorageAttachmentSummary[] {
    return resourceStorageAttachments.filter((attachment) => attachment.storageVolumeId === volume.id);
  }

  function storageVolumeDisplayAttachments(
    volume: StorageVolumeSummary,
  ): StorageVolumeCardAttachment[] {
    const currentAttachments = storageVolumeCurrentResourceAttachments(volume);
    return currentAttachments.length > 0 ? currentAttachments : volume.attachments;
  }

  function storageVolumeAttachmentDisplayLabel(attachment: StorageVolumeCardAttachment): string {
    return "storageVolumeId" in attachment
      ? storageAttachmentApplicationDataLabel(attachment)
      : (attachment.applicationDataLabel ?? attachment.resourceName ?? attachment.resourceSlug ?? attachment.resourceId);
  }

  function storageVolumeBackupPolicyLabel(volume: StorageVolumeSummary): string {
    return volume.backupRelationship?.retentionRequired
      ? $t(i18nKeys.console.resources.storageBackupRetentionRequired)
      : $t(i18nKeys.console.resources.storageBackupPolicyOptional);
  }

  function storageVolumeLatestBackup(volume: StorageVolumeSummary): StorageVolumeBackupSummary | null {
    if (storageBackupVolumeId !== volume.id || storageVolumeBackups.length === 0) {
      return null;
    }

    return storageVolumeBackups[0] ?? null;
  }

  function storageRuntimeCleanupSummary(result: CleanupStorageVolumeRuntimeResponse): string {
    return $t(i18nKeys.console.resources.storageRuntimeCleanupSummary, {
      inspected: String(result.summary.inspectedCount),
      matched: String(result.summary.matchedCount),
      cleaned: String(result.summary.cleanedCount),
      skipped: String(result.summary.skippedCount),
      blocked: String(result.summary.blockedCount),
    });
  }

  function storageRuntimeCleanupCandidateDetail(candidate: StorageRuntimeCleanupCandidate): string {
    return candidate.blockedReason
      ? `${candidate.action} / ${candidate.blockedReason}`
      : candidate.action;
  }

  function storageAttachmentVolumeLabel(
    attachment: ResourceStorageAttachmentSummary,
  ): string {
    return attachment.storageVolumeName ?? attachment.storageVolumeId;
  }

  function storageAttachmentApplicationDataLabel(
    attachment: ResourceStorageAttachmentSummary,
  ): string {
    return attachment.applicationDataLabel ?? storageAttachmentVolumeLabel(attachment);
  }

  function storageBackupPlanSummary(plan: StorageVolumeBackupPlanResponse): string {
    if (plan.blockers.length > 0) {
      return plan.blockers.map((blocker) => blocker.code).join(", ");
    }
    return `${plan.sourceAdapterKey} -> ${plan.targetProviderKey} · ${plan.consistency}`;
  }

  function storageBackupLabel(backup: StorageVolumeBackupSummary): string {
    return `${backup.id} · ${backup.status} · ${backup.requestedAt}`;
  }

  function storageBackupArtifactLabel(backup: StorageVolumeBackupSummary): string {
    return backup.artifactHandle ?? backup.failureCode ?? backup.targetRef;
  }

  function dependencyResourceKindLabel(kind: DependencyResourceSummary["kind"]): string {
    const labels = {
      postgres: i18nKeys.console.dependencyResources.kindPostgres,
      redis: i18nKeys.console.dependencyResources.kindRedis,
      mysql: i18nKeys.console.dependencyResources.kindMysql,
      clickhouse: i18nKeys.console.dependencyResources.kindClickHouse,
      "object-storage": i18nKeys.console.dependencyResources.kindObjectStorage,
      opensearch: i18nKeys.console.dependencyResources.kindOpenSearch,
    } satisfies Record<DependencyResourceSummary["kind"], TranslationKey>;
    return $t(labels[kind]);
  }

  function dependencyResourceOptionLabel(dependency: DependencyResourceSummary): string {
    return `${dependency.name} (${dependencyResourceKindLabel(dependency.kind)})`;
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

  function generatedAccessModeLabel(mode: GeneratedAccessMode): string {
    switch (mode) {
      case "inherit":
        return $t(i18nKeys.console.resources.accessGeneratedModeInherit);
      case "disabled":
        return $t(i18nKeys.console.resources.accessGeneratedModeDisabled);
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
      case "deleted":
        return $t(i18nKeys.common.status.deleted);
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
      case "deleted":
        return "outline";
      case "certificate_pending":
      case "pending_verification":
      case "requested":
        return "secondary";
    }
  }

  function domainDnsObservationStatusLabel(
    status: NonNullable<DomainBindingSummary["dnsObservation"]>["status"] | undefined,
  ): string {
    switch (status) {
      case "matched":
        return $t(i18nKeys.console.domainBindings.dnsMatched);
      case "mismatch":
        return $t(i18nKeys.console.domainBindings.dnsMismatch);
      case "unresolved":
        return $t(i18nKeys.console.domainBindings.dnsUnresolved);
      case "lookup_failed":
        return $t(i18nKeys.console.domainBindings.dnsLookupFailed);
      case "skipped":
        return $t(i18nKeys.console.domainBindings.dnsSkipped);
      case "pending":
      case undefined:
        return $t(i18nKeys.console.domainBindings.dnsPending);
    }
  }

  function domainDnsObservationStatusVariant(
    status: NonNullable<DomainBindingSummary["dnsObservation"]>["status"] | undefined,
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "matched":
        return "default";
      case "mismatch":
      case "unresolved":
      case "lookup_failed":
        return "destructive";
      case "skipped":
        return "outline";
      case "pending":
      case undefined:
        return "secondary";
    }
  }

  function latestCertificateForBinding(bindingId: string): CertificateSummary | null {
    const bindingCertificates = resourceCertificates.filter(
      (certificate) => certificate.domainBindingId === bindingId,
    );

    if (bindingCertificates.length === 0) {
      return null;
    }

    return bindingCertificates.reduce((latest, candidate) =>
      certificateSortTimestamp(candidate) > certificateSortTimestamp(latest) ? candidate : latest,
    );
  }

  function certificateSortTimestamp(certificate: CertificateSummary): number {
    return Date.parse(certificate.issuedAt ?? certificate.createdAt) || 0;
  }

  function certificateSourceLabel(source: CertificateSummary["source"]): string {
    switch (source) {
      case "imported":
        return $t(i18nKeys.console.resources.certificateSourceImported);
      case "managed":
        return $t(i18nKeys.console.resources.certificateSourceManaged);
    }
  }

  function certificateStatusLabel(status: CertificateSummary["status"]): string {
    switch (status) {
      case "active":
        return $t(i18nKeys.console.resources.certificateStatusActive);
      case "deleted":
        return $t(i18nKeys.console.resources.certificateStatusDeleted);
      case "disabled":
        return $t(i18nKeys.console.resources.certificateStatusDisabled);
      case "expired":
        return $t(i18nKeys.console.resources.certificateStatusExpired);
      case "failed":
        return $t(i18nKeys.console.resources.certificateStatusFailed);
      case "issuing":
        return $t(i18nKeys.console.resources.certificateStatusIssuing);
      case "pending":
        return $t(i18nKeys.console.resources.certificateStatusPending);
      case "renewing":
        return $t(i18nKeys.console.resources.certificateStatusRenewing);
      case "revoked":
        return $t(i18nKeys.console.resources.certificateStatusRevoked);
    }
  }

  function certificateStatusVariant(
    status: CertificateSummary["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "active":
        return "default";
      case "failed":
      case "expired":
        return "destructive";
      case "issuing":
      case "pending":
      case "renewing":
        return "secondary";
      case "disabled":
      case "deleted":
      case "revoked":
        return "outline";
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
      case "server-applied-domain":
        return $t(i18nKeys.console.resources.serverAppliedDomainAccess);
      case "static-artifact":
        return $t(i18nKeys.console.resources.staticArtifactAccessRoute);
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

  function resourceLatestDeploymentTime(deployment: typeof latestDeployment): string {
    if (!deployment) {
      return "-";
    }

    return formatTime(deployment.finishedAt ?? deployment.startedAt ?? deployment.createdAt);
  }

  function resourceSourceSummary(): string {
    const source = resourceDetail?.source;
    if (!source) {
      return $t(i18nKeys.common.status.notConfigured);
    }

    return source.displayName || source.locator || source.kind;
  }

  function resourceRuntimeSummary(): string {
    const runtimeProfile = resourceDetail?.runtimeProfile;
    if (!runtimeProfile) {
      return $t(i18nKeys.common.status.notConfigured);
    }

    return runtimeStrategyLabel(runtimeProfile.strategy);
  }

  function resourceNetworkSummary(): string {
    const profile = resource?.networkProfile;
    if (!profile) {
      return $t(i18nKeys.common.status.notConfigured);
    }

    return [
      `${$t(i18nKeys.common.domain.port)} ${profile.internalPort}`,
      networkProtocolLabel(profile.upstreamProtocol),
      networkExposureModeLabel(profile.exposureMode),
    ].join(" · ");
  }

  function resourceDependencySummary(): string {
    if (resourceDependencyBindings.length > 0) {
      return $t(i18nKeys.console.resources.overviewDependencyBindingsSummary, {
        count: String(resourceDependencyBindings.length),
      });
    }

    if (dependencyResources.length > 0) {
      return $t(i18nKeys.console.resources.overviewDependencyResourcesSummary, {
        count: String(dependencyResources.length),
      });
    }

    return $t(i18nKeys.console.resources.overviewDependenciesEmpty);
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

{#snippet resourceSectionNavigation()}
  <aside class={detailSubnavClass}>
    <nav class="min-w-0" aria-label={resourceTabLabel(activeTab)}>
      <div
        role="tablist"
        class={[subnavListClass, "flex min-w-0 overflow-x-auto lg:grid lg:overflow-visible"]}
      >
        {#each resourceSectionsForTab(activeTab) as section (section)}
          <a
            href={resourceSectionHref(section)}
            role="tab"
            aria-selected={activeResourceSection === section}
            aria-current={activeResourceSection === section ? "page" : undefined}
            class={[
              subnavItemClass,
              "min-h-10 flex-none whitespace-nowrap lg:flex lg:w-full lg:whitespace-normal",
            ]}
            onclick={(event) => selectResourceDetailSection(section, event)}
          >
            <span class={[subnavItemTitleClass, "lg:whitespace-normal"]}>{resourceSectionLabel(section)}</span>
          </a>
        {/each}
      </div>
    </nav>
  </aside>
{/snippet}

{#snippet resourceRuntimeControlPanel()}
  {#if resource}
    <section id="resource-runtime-control" class="space-y-4">
      <div class="rounded-md border bg-card p-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-semibold">
                {$t(i18nKeys.console.resources.runtimeControlsTitle)}
              </h2>
              <DocsHelpLink
                href={webDocsHrefs.resourceRuntimeControls}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
              />
            </div>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.resources.runtimeControlsDescription)}
            </p>
            {#if resourceHealth?.latestRuntimeControl}
              <p class="mt-2 text-xs text-muted-foreground">
                {$t(i18nKeys.console.resources.runtimeControlsLatest)}:
                {resourceHealth.latestRuntimeControl.operation} ·
                {resourceHealth.latestRuntimeControl.status} ·
                {resourceHealth.latestRuntimeControl.runtimeState}
              </p>
            {/if}
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onclick={openRuntimeControlDialog}
              disabled={isResourceArchived || runtimeControlPending}
            >
              <Gauge class={["size-4", runtimeControlPending ? "animate-spin" : ""]} />
              {$t(i18nKeys.console.resources.runtimeControlManageAction)}
            </Button>
          </div>
        </div>
        {#if runtimeControlFeedback}
          <div
            class={[
              "mt-4 rounded-md border px-3 py-2 text-sm",
              runtimeControlFeedback.kind === "success"
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                : "border-destructive/30 bg-destructive/5 text-destructive",
            ]}
          >
            <span class="font-medium">{runtimeControlFeedback.title}</span>
            <span class="ml-2">{runtimeControlFeedback.detail}</span>
          </div>
        {/if}
      </div>
    </section>
  {/if}
{/snippet}

{#snippet resourceRuntimeLogsPanel()}
  <section id="resource-runtime-logs" class="space-y-4">
    <div class="rounded-md border bg-card p-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div class="flex items-start gap-3">
          <div class="bg-muted p-2">
            <Terminal class="size-4" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-semibold">
                {$t(i18nKeys.console.resources.runtimeLogsTitle)}
              </h2>
              <DocsHelpLink
                href={webDocsHrefs.observabilityRuntimeLogs}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
              />
            </div>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.resources.runtimeLogsDescription)}
            </p>
            {#if resourceRuntimeMonitoringObservationHandoff}
              <p class="mt-2 text-xs text-muted-foreground">
                {$t(i18nKeys.console.runtimeUsage.observationWindowHandoff, {
                  from: formatTime(resourceRuntimeMonitoringObservationHandoff.from),
                  to: formatTime(resourceRuntimeMonitoringObservationHandoff.to),
                  scopeKind: resourceRuntimeMonitoringObservationHandoff.scope.kind,
                  scopeId: resource?.id ?? "",
                })}
              </p>
            {/if}
            {#if runtimeLogsLoading || runtimeLogsFollowing}
              <p class="mt-2 text-xs text-muted-foreground">
                {runtimeLogsLoading
                  ? $t(i18nKeys.console.resources.runtimeLogsConnecting)
                  : $t(i18nKeys.console.resources.runtimeLogsFollowing)}
              </p>
            {/if}
          </div>
        </div>
        {#if !runtimeLogsUnavailable}
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
        {/if}
      </div>

      {#if runtimeLogsUnavailable}
        <div
          class="mt-4 rounded-md border border-dashed bg-muted/25 px-4 py-6"
          data-resource-runtime-logs-unavailable-state
        >
          <p class="text-sm font-medium">
            {$t(i18nKeys.console.resources.runtimeLogsUnavailableTitle)}
          </p>
          <p class="mt-1 text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.resources.runtimeLogsUnavailableBody)}
          </p>
        </div>
      {:else if runtimeLogsError}
        <div class="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {runtimeLogsError}
        </div>
      {:else}
        <div class="mt-4 max-h-96 overflow-auto rounded-md border bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
          {#if runtimeLogsLoading}
            <p class="text-zinc-400">{$t(i18nKeys.console.resources.runtimeLogsLoading)}</p>
          {:else if runtimeLogsInObservationWindow.length === 0}
            <p class="text-zinc-400">
              {$t(
                resourceRuntimeMonitoringObservationHandoff && runtimeLogs.length > 0
                  ? i18nKeys.console.runtimeUsage.observationWindowEmpty
                  : i18nKeys.console.resources.runtimeLogsEmpty,
              )}
            </p>
          {:else}
            <div class="space-y-1">
              {#each runtimeLogsInObservationWindow as line, index (`${line.sequence ?? index}-${line.timestamp ?? ""}-${line.message}`)}
                <div class="grid gap-2 sm:grid-cols-[10rem_1fr]">
                  <span class="truncate text-zinc-500">
                    {line.timestamp ? formatTime(line.timestamp) : line.stream}
                  </span>
                  <span class={["break-words", line.masked ? "text-amber-200" : "text-zinc-100"]}>
                    {line.message}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </section>
{/snippet}

<ConsoleShell
  title={resource?.name ?? $t(i18nKeys.console.resources.pageTitle)}
  description={$t(i18nKeys.console.resources.detailDescription)}
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
      href: resource ? resourceDetailHref(resource) : undefined,
      switcherLabel: $t(i18nKeys.console.resources.pageTitle),
      switcherItems: resourceHeaderSwitchItems,
    },
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
    <div class={detailPageClass}>
      <section class={detailHeaderClass}>
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
            <Button
              type="button"
              disabled={isResourceArchived || isPreviewEnvironmentResource}
              onclick={openResourceDeploymentDialog}
            >
              <Play class="size-4" />
              {$t(i18nKeys.common.actions.createDeployment)}
            </Button>
          </div>
        </div>
      </section>

      <div class={detailBodyClass}>
        <nav
          aria-label={$t(i18nKeys.console.resources.overviewTitle)}
          class={detailTabsClass}
        >
          {#each resourceDetailTabs as tab (tab)}
            <a
              href={resourceTabHref(tab)}
              class={detailTabClass}
              aria-current={activeTab === tab ? "page" : undefined}
              onclick={(event) => selectResourceTab(tab, event)}
            >
              {resourceTabLabel(tab)}
            </a>
          {/each}
        </nav>

        {#if activeTab === "deployments"}
          <div class={detailTabPanelScrollClass}>

          <section id="resource-deployments" class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.resources.deploymentsTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.deploymentsDescription)}
                </p>
                {#if resourceRuntimeMonitoringObservationHandoff}
                  <p class="mt-2 text-xs text-muted-foreground">
                    {$t(i18nKeys.console.runtimeUsage.observationWindowHandoff, {
                      from: formatTime(resourceRuntimeMonitoringObservationHandoff.from),
                      to: formatTime(resourceRuntimeMonitoringObservationHandoff.to),
                      scopeKind: resourceRuntimeMonitoringObservationHandoff.scope.kind,
                      scopeId: resource?.id ?? "",
                    })}
                  </p>
                {/if}
              </div>
              <Button
                type="button"
                disabled={isResourceArchived || isPreviewEnvironmentResource}
                onclick={openResourceDeploymentDialog}
              >
                <Play class="size-4" />
                {$t(i18nKeys.common.actions.createDeployment)}
              </Button>
            </div>

            <div>
              {#if resourceDeploymentsInObservationWindow.length > 0}
                <DeploymentTable
                  deployments={resourceDeploymentsInObservationWindow}
                  {servers}
                  showProject={false}
                  showEnvironment={false}
                  showResource={false}
                  showServer
                />
              {:else}
                <div class="border-y bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                  {$t(
                    resourceRuntimeMonitoringObservationHandoff && resourceDeployments.length > 0
                      ? i18nKeys.console.runtimeUsage.observationWindowEmpty
                      : i18nKeys.console.resources.noDeployments,
                  )}
                </div>
              {/if}
            </div>
          </section>
        </div>
        {:else if activeTab === "jobs"}
          <div class={detailTabPanelSubnavClass}>
            <div class={[detailSubnavLayoutClass, "md:grid-cols-[12rem_minmax(0,1fr)]"]}>
              {@render resourceSectionNavigation()}

              {#if activeResourceSection === "scheduled-tasks"}
                <section id="resource-scheduled-tasks" class="space-y-5 p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.resources.scheduledTasksTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.scheduledTaskLifecycle}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                  />
                </div>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.scheduledTasksDescription)}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={scheduledTasksQuery.isFetching || scheduledTaskRunsQuery.isFetching}
                  onclick={() => {
                    void scheduledTasksQuery.refetch();
                    void scheduledTaskRunsQuery.refetch();
                  }}
                >
                  <RefreshCw
                    class={[
                      "size-4",
                      scheduledTasksQuery.isFetching || scheduledTaskRunsQuery.isFetching
                        ? "animate-spin"
                        : "",
                    ]}
                  />
                  {$t(i18nKeys.console.resources.scheduledTasksRefresh)}
                </Button>
                <Button
                  type="button"
                  disabled={isResourceArchived}
                  onclick={openScheduledTaskCreateDialog}
                >
                  <Plus class="size-4" />
                  {$t(i18nKeys.console.resources.scheduledTaskCreateAction)}
                </Button>
              </div>
            </div>

            <div class="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
              <section class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="text-base font-semibold">
                    {$t(i18nKeys.console.resources.scheduledTaskDefinitionsTitle)}
                  </h3>
                  <Badge variant="outline">{scheduledTasks.length}</Badge>
                </div>

                {#if scheduledTasksQuery.isPending}
                  <div class="space-y-3">
                    <Skeleton class="h-36 w-full" />
                    <Skeleton class="h-36 w-full" />
                  </div>
                {:else if scheduledTasksQuery.error}
                  <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <p class="font-medium">
                      {$t(i18nKeys.console.resources.scheduledTasksLoadFailed)}
                    </p>
                    <p class="mt-1 break-all text-xs">
                      {readErrorMessage(scheduledTasksQuery.error)}
                    </p>
                  </div>
                {:else if scheduledTasks.length === 0}
                  <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.resources.scheduledTasksEmpty)}
                  </div>
                {:else}
                  <div class="space-y-3">
                    {#each scheduledTasks as task (task.taskId)}
                      <article class="rounded-md border bg-background p-4">
                        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div class="min-w-0 space-y-2">
                            <div class="flex flex-wrap items-center gap-2">
                              <p class="font-mono text-sm font-medium">{task.taskId}</p>
                              <Badge variant={task.status === "enabled" ? "default" : "outline"}>
                                {scheduledTaskStatusLabel(task.status)}
                              </Badge>
                              <Badge variant="outline">{task.concurrencyPolicy}</Badge>
                            </div>
                            <p class="break-all font-mono text-sm">{task.commandIntent}</p>
                            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                {$t(i18nKeys.console.resources.scheduledTaskSchedule)}:
                                <code class="rounded bg-muted px-1 py-0.5">{task.schedule}</code>
                              </span>
                              <span>{task.timezone}</span>
                              <span>
                                {$t(i18nKeys.console.resources.scheduledTaskTimeoutSeconds)}:
                                {task.timeoutSeconds}
                              </span>
                              <span>
                                {$t(i18nKeys.console.resources.scheduledTaskRetryLimit)}:
                                {task.retryLimit}
                              </span>
                            </div>
                            {#if task.latestRun}
                              <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>{$t(i18nKeys.console.resources.scheduledTaskLatestRun)}:</span>
                                <Badge variant={scheduledTaskRunStatusVariant(task.latestRun.status)}>
                                  {scheduledTaskRunStatusLabel(task.latestRun.status)}
                                </Badge>
                                <span>{formatTime(task.latestRun.createdAt)}</span>
                              </div>
                            {/if}
                          </div>

                          <div class="flex flex-wrap gap-2 lg:justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isResourceArchived}
                              onclick={() => openScheduledTaskManageDialog(task)}
                            >
                              <Play class="size-4" />
                              {$t(i18nKeys.console.resources.scheduledTaskRunManageAction)}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isResourceArchived || deleteScheduledTaskMutation.isPending}
                              onclick={() => openScheduledTaskDeleteDialog(task)}
                            >
                              <ShieldCheck class="size-4" />
                              {$t(i18nKeys.console.resources.scheduledTaskLifecycleAction)}
                            </Button>
                          </div>
                        </div>
                      </article>
                    {/each}
                  </div>
                {/if}
              </section>

              <section class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="text-base font-semibold">
                    {$t(i18nKeys.console.resources.scheduledTaskRunsTitle)}
                  </h3>
                  <Badge variant="outline">{scheduledTaskRuns.length}</Badge>
                </div>

                {#if scheduledTaskRunsQuery.isPending}
                  <Skeleton class="h-64 w-full" />
                {:else if scheduledTaskRunsQuery.error}
                  <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <p class="font-medium">
                      {$t(i18nKeys.console.resources.scheduledTaskRunsLoadFailed)}
                    </p>
                    <p class="mt-1 break-all text-xs">
                      {readErrorMessage(scheduledTaskRunsQuery.error)}
                    </p>
                  </div>
                {:else if scheduledTaskRuns.length === 0}
                  <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.resources.scheduledTaskRunsEmpty)}
                  </div>
                {:else}
                  <div class="space-y-2">
                    {#each scheduledTaskRuns as run (run.runId)}
                      <article class="rounded-md border bg-background p-3">
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0 space-y-1">
                            <div class="flex flex-wrap items-center gap-2">
                              <p class="font-mono text-xs font-medium">{run.runId}</p>
                              <Badge variant={scheduledTaskRunStatusVariant(run.status)}>
                                {scheduledTaskRunStatusLabel(run.status)}
                              </Badge>
                              <Badge variant="outline">
                                {scheduledTaskRunTriggerLabel(run.triggerKind)}
                              </Badge>
                            </div>
                            <p class="truncate text-xs text-muted-foreground">
                              {run.taskId} · {formatTime(run.createdAt)}
                            </p>
                            {#if run.failureSummary}
                              <p class="break-words text-xs text-destructive">{run.failureSummary}</p>
                            {/if}
                          </div>
                          <Button
                            id={`scheduled-task-run-logs-${run.runId}`}
                            type="button"
                            size="sm"
                            variant={selectedScheduledTaskRunId === run.runId ? "selected" : "outline"}
                            onclick={() => void loadScheduledTaskRunLogs(run)}
                          >
                            <Terminal class="size-4" />
                            {$t(i18nKeys.console.resources.scheduledTaskRunLogs)}
                          </Button>
                        </div>
                      </article>
                    {/each}
                  </div>
                {/if}

                {#if selectedScheduledTaskRunId || scheduledTaskRunLogsLoading || scheduledTaskRunLogsError}
                  <div class="rounded-md border bg-card" data-resource-scheduled-task-run-log-detail>
                    <div class="flex items-center justify-between gap-3 border-b px-3 py-2">
                      <div class="min-w-0">
                        <h4 class="text-sm font-medium">
                          {$t(i18nKeys.console.resources.scheduledTaskRunLogs)}
                        </h4>
                        {#if selectedScheduledTaskRunId}
                          <p class="truncate font-mono text-xs text-muted-foreground">
                            {selectedScheduledTaskRunId}
                          </p>
                        {/if}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onclick={clearScheduledTaskRunLogs}
                      >
                        <X class="size-4" />
                        {$t(i18nKeys.common.actions.close)}
                      </Button>
                    </div>
                    <div class="max-h-96 overflow-auto bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
                      {#if scheduledTaskRunLogsLoading}
                        <p class="text-zinc-400">
                          {$t(i18nKeys.console.resources.scheduledTaskRunLogsLoading)}
                        </p>
                      {:else if scheduledTaskRunLogsError}
                        <p class="text-destructive">{scheduledTaskRunLogsError}</p>
                      {:else if scheduledTaskRunLogs.length === 0}
                        <p class="text-zinc-400">
                          {$t(i18nKeys.console.resources.scheduledTaskRunLogsEmpty)}
                        </p>
                      {:else}
                        <div class="space-y-1">
                          {#each scheduledTaskRunLogs as entry, index (`${entry.timestamp}-${entry.stream}-${index}`)}
                            <div class="grid gap-2 sm:grid-cols-[10rem_4rem_1fr]">
                              <span class="truncate text-zinc-500">{formatTime(entry.timestamp)}</span>
                              <span class="text-zinc-500">{entry.stream}</span>
                              <span class="break-words">{entry.message}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              </section>
            </div>
                </section>
              {:else if activeResourceSection === "source-events"}
                <section
                  id="resource-source-events"
                  class="space-y-4 p-5"
                  data-resource-source-events-diagnostics
                >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.resources.sourceEventsTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.sourceAutoDeployDedupe}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                  />
                  <DocsHelpLink
                    href={webDocsHrefs.sourceAutoDeployIgnoredEvents}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                  />
                  <DocsHelpLink
                    href={webDocsHrefs.sourceAutoDeployRecovery}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                  />
                </div>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.sourceEventsDescription)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={resourceSourceEventsQuery.isFetching}
                onclick={() => resourceSourceEventsQuery.refetch()}
              >
                <RefreshCw
                  class={["size-4", resourceSourceEventsQuery.isFetching ? "animate-spin" : ""]}
                />
                {$t(i18nKeys.console.resources.sourceEventsRefresh)}
              </Button>
            </div>

            {#if resourceSourceEventsQuery.isPending}
              <div class="space-y-3">
                <Skeleton class="h-28 w-full" />
                <Skeleton class="h-28 w-full" />
              </div>
            {:else if resourceSourceEventsQuery.error}
              <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <p class="font-medium">
                  {$t(i18nKeys.console.resources.sourceEventsLoadFailed)}
                </p>
                <p class="mt-1 break-all text-xs">
                  {readErrorMessage(resourceSourceEventsQuery.error)}
                </p>
              </div>
            {:else if resourceSourceEvents.length === 0}
              <div class="border-y bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                {$t(i18nKeys.console.resources.sourceEventsEmpty)}
              </div>
            {:else}
              <div class="space-y-3">
                {#each resourceSourceEvents as sourceEvent (sourceEvent.sourceEventId)}
                  {@const outcomes = sourceEventVisibleOutcomes(sourceEvent)}
                  <article class="rounded-md border bg-card p-4">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div class="min-w-0 space-y-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <div class="bg-muted p-2">
                            <GitBranch class="size-4" />
                          </div>
                          <span class="font-mono text-sm font-medium">
                            {sourceEvent.sourceEventId}
                          </span>
                          <Badge variant={sourceEventStatusVariant(sourceEvent.status)}>
                            {sourceEventStatusLabel(sourceEvent.status)}
                          </Badge>
                          <Badge variant="outline">
                            {sourceEventDedupeStatusLabel(sourceEvent.dedupeStatus)}
                          </Badge>
                        </div>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>
                            {$t(i18nKeys.console.resources.sourceEventsRef)}:
                            <code class="rounded bg-muted px-1 py-0.5">{sourceEvent.ref}</code>
                          </span>
                          <span>
                            {$t(i18nKeys.console.resources.sourceEventsRevision)}:
                            <code class="rounded bg-muted px-1 py-0.5">
                              {sourceEventRevisionLabel(sourceEvent.revision)}
                            </code>
                          </span>
                          <span>
                            {$t(i18nKeys.console.resources.sourceEventsReceived)}:
                            {formatTime(sourceEvent.receivedAt)}
                          </span>
                        </div>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {$t(i18nKeys.console.resources.sourceEventsSourceKind)}:
                            {sourceEvent.sourceKind}
                          </span>
                          <span>
                            {$t(i18nKeys.console.resources.sourceEventsEventKind)}:
                            {sourceEvent.eventKind}
                          </span>
                        </div>
                      </div>

                      {#if outcomes.length > 0}
                        <div class="flex max-w-full flex-wrap gap-2 lg:max-w-md lg:justify-end">
                          {#each outcomes as outcome (`${outcome.kind}-${outcome.value}`)}
                            {#if outcome.kind === "created-deployment"}
                              <Button
                                size="sm"
                                variant="outline"
                                href={sourceEventDeploymentHref(outcome.value)}
                              >
                                {$t(i18nKeys.console.resources.sourceEventsCreatedDeployment)}
                                <span class="font-mono">{outcome.value}</span>
                              </Button>
                            {:else if outcome.kind === "dedupe"}
                              <Badge variant="secondary">
                                {$t(i18nKeys.console.resources.sourceEventsDedupeStatus)}:
                                {sourceEventDedupeStatusLabel(outcome.value)}
                              </Badge>
                            {:else}
                              <Badge variant="outline">
                                {$t(i18nKeys.console.resources.sourceEventIgnoredReason)}:
                                {sourceEventIgnoredReasonLabel(outcome.value)}
                              </Badge>
                            {/if}
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </article>
                {/each}
              </div>
            {/if}
                </section>
              {/if}
            </div>
          </div>
        {:else if activeTab === "previews"}
          <div class={detailTabPanelScrollClass}>
            <section id="resource-preview-environments" class="space-y-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.resources.previewEnvironmentsTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.productGradePreviews}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                  />
                </div>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.previewEnvironmentsDescription)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={resourcePreviewEnvironmentsQuery.isFetching}
                onclick={() => resourcePreviewEnvironmentsQuery.refetch()}
              >
                <RefreshCw
                  class={[
                    "size-4",
                    resourcePreviewEnvironmentsQuery.isFetching ? "animate-spin" : "",
                  ]}
                />
                {$t(i18nKeys.console.resources.previewEnvironmentsRefresh)}
              </Button>
            </div>

            <section class="console-metric-strip sm:grid-cols-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {$t(i18nKeys.console.previewEnvironments.totalCount)}
                </p>
                <p class="mt-1 text-2xl font-semibold">{resourcePreviewEnvironments.length}</p>
              </div>
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {$t(i18nKeys.console.previewEnvironments.activeCount)}
                </p>
                <p class="mt-1 text-2xl font-semibold">{activePreviewEnvironmentCount}</p>
              </div>
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {$t(i18nKeys.console.previewEnvironments.cleanupRequestedCount)}
                </p>
                <p class="mt-1 text-2xl font-semibold">
                  {cleanupRequestedPreviewEnvironmentCount}
                </p>
              </div>
            </section>

            {#if previewEnvironmentFeedback}
              <div
                class={[
                  "rounded-md border px-3 py-2 text-sm",
                  previewEnvironmentFeedback.kind === "success"
                    ? "border-primary/25 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5 text-destructive",
                ]}
              >
                <p class="font-medium">{previewEnvironmentFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{previewEnvironmentFeedback.detail}</p>
              </div>
            {/if}

            {#if resourcePreviewEnvironmentsQuery.isPending}
              <div class="space-y-3">
                <Skeleton class="h-28 w-full" />
                <Skeleton class="h-28 w-full" />
              </div>
            {:else if resourcePreviewEnvironmentsQuery.error}
              <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <p class="font-medium">
                  {$t(i18nKeys.console.resources.previewEnvironmentsLoadFailed)}
                </p>
                <p class="mt-1 break-all text-xs">
                  {readErrorMessage(resourcePreviewEnvironmentsQuery.error)}
                </p>
              </div>
            {:else if resourcePreviewEnvironments.length === 0}
              <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                {$t(i18nKeys.console.resources.previewEnvironmentsEmpty)}
              </div>
            {:else}
              <div class="space-y-3">
                {#each resourcePreviewEnvironments as previewEnvironment (previewEnvironment.previewEnvironmentId)}
                  {@const isExpired = previewEnvironmentExpired(previewEnvironment)}
                  <article class="rounded-md border bg-card p-4">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div class="min-w-0 space-y-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <div class="bg-muted p-2">
                            <GitBranch class="size-4" />
                          </div>
                          <span class="font-mono text-sm font-medium">
                            {previewEnvironment.previewEnvironmentId}
                          </span>
                          <Badge variant={previewEnvironmentStatusVariant(previewEnvironment.status)}>
                            {previewEnvironmentStatusLabel(previewEnvironment.status)}
                          </Badge>
                          {#if isExpired && previewEnvironment.status === "active"}
                            <Badge variant="destructive">
                              {$t(i18nKeys.console.resources.previewEnvironmentsExpired)}
                            </Badge>
                          {/if}
                        </div>
                        <p class="truncate text-sm font-medium">
                          {previewEnvironment.source.repositoryFullName} #{previewEnvironment.source.pullRequestNumber}
                        </p>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {$t(i18nKeys.console.previewEnvironments.baseRef)}:
                            <code class="rounded bg-muted px-1 py-0.5">
                              {previewEnvironment.source.baseRef}
                            </code>
                          </span>
                          <span>
                            {$t(i18nKeys.console.previewEnvironments.expiresAt)}:
                            {previewEnvironment.expiresAt
                              ? formatTime(previewEnvironment.expiresAt)
                              : $t(i18nKeys.console.previewEnvironments.noExpiry)}
                          </span>
                          <span>
                            {$t(i18nKeys.console.previewEnvironments.updatedAt)}:
                            {formatTime(previewEnvironment.updatedAt)}
                          </span>
                        </div>
                        <p class="break-all font-mono text-xs text-muted-foreground">
                          {$t(i18nKeys.console.previewEnvironments.sourceBinding)}:
                          {previewEnvironment.source.sourceBindingFingerprint}
                        </p>
                      </div>

                      <div class="flex flex-wrap gap-2 lg:justify-end">
                        {#if resource}
                          <Button
                            size="sm"
                            variant="outline"
                            href={resourcePreviewEnvironmentDetailHref(
                              resource,
                              previewEnvironment.previewEnvironmentId,
                            )}
                          >
                            {$t(i18nKeys.common.actions.viewDetails)}
                          </Button>
                        {/if}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            cleanupPreviewEnvironmentMutation.isPending ||
                            previewEnvironment.status !== "active"
                          }
                          onclick={() => openPreviewEnvironmentCleanupDialog(previewEnvironment)}
                        >
                          <ShieldCheck class="size-4" />
                          {$t(i18nKeys.console.previewEnvironments.lifecycleManageAction)}
                        </Button>
                      </div>
                    </div>
                  </article>
                {/each}
              </div>
            {/if}
            </section>
          </div>
        {:else if activeTab === "overview"}
          <div class={detailTabPanelScrollClass}>
            <section id="resource-overview" class="space-y-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.resources.overviewTitle)}
                  </h2>
                  <p class="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.resources.overviewDescription)}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  {#if primaryAccessHref}
                    <Button href={primaryAccessHref} target="_blank" rel="noreferrer" variant="outline">
                      <Globe2 class="size-4" />
                      {$t(i18nKeys.console.deployments.openAccessUrl)}
                    </Button>
                  {/if}
                </div>
              </div>

              <div class="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
                <section class="rounded-md border bg-background p-4">
                  <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div class="min-w-0 space-y-2">
                      <p class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Link2 class="size-4" />
                        {$t(i18nKeys.console.resources.overviewCurrentAccess)}
                      </p>
                      {#if primaryAccessHref}
                        <a
                          class="block break-all text-lg font-semibold text-primary underline-offset-4 hover:underline"
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
                        </div>
                      {:else}
                        <div class="rounded-md border border-dashed bg-muted/25 px-4 py-5">
                          <p class="font-medium">{$t(i18nKeys.console.resources.overviewNoAccessTitle)}</p>
                          <p class="mt-1 text-sm leading-6 text-muted-foreground">
                            {$t(i18nKeys.console.resources.overviewNoAccessDescription)}
                          </p>
                        </div>
                      {/if}
                      {#if latestAccessFailure}
                        <div class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="font-medium text-destructive">
                              {$t(i18nKeys.console.resources.accessFailureTitle)}
                            </p>
                            <Badge variant="destructive">{latestAccessFailure.code}</Badge>
                          </div>
                          <p class="mt-2 break-words text-xs text-muted-foreground">
                            {latestAccessFailure.nextAction}
                          </p>
                        </div>
                      {/if}
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

                <section class="rounded-md border bg-background p-4">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <p class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Gauge class="size-4" />
                        {$t(i18nKeys.console.resources.overviewCurrentHealth)}
                      </p>
                      <p class="mt-2 flex items-center gap-2 text-lg font-semibold">
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
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <div class="rounded-md bg-muted/25 px-3 py-2">
                      <p class="text-xs text-muted-foreground">
                        {$t(i18nKeys.console.resources.healthRuntime)}
                      </p>
                      <p class="mt-1 text-sm font-medium">
                        {resourceHealthSectionStatusLabel(resourceHealth?.runtime.lifecycle)}
                      </p>
                    </div>
                    <div class="rounded-md bg-muted/25 px-3 py-2">
                      <p class="text-xs text-muted-foreground">
                        {$t(i18nKeys.console.resources.healthPolicy)}
                      </p>
                      <p class="mt-1 text-sm font-medium">
                        {resourceHealthSectionStatusLabel(resourceHealth?.healthPolicy.status)}
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <div class="grid gap-4 xl:grid-cols-3">
                <section class="rounded-md border bg-background p-4 xl:col-span-2">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <h3 class="text-base font-semibold">
                        {$t(i18nKeys.console.resources.overviewLatestDeployment)}
                      </h3>
                      <p class="mt-1 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.deploymentsDescription)}
                      </p>
                    </div>
                    <Button href={resourceTabHref("deployments")} variant="outline" size="sm">
                      {$t(i18nKeys.common.actions.viewDeployments)}
                    </Button>
                  </div>
                  {#if latestDeployment}
                    <div
                      class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_12rem]"
                      data-resource-latest-deployment-summary
                    >
                      <div class="min-w-0 rounded-md border border-border bg-muted/25 px-3 py-2">
                        <p class="text-xs text-muted-foreground">
                          {$t(i18nKeys.common.domain.deployment)}
                        </p>
                        <a
                          class="mt-1 block truncate font-mono text-sm font-medium text-primary underline-offset-4 hover:underline"
                          href={deploymentDetailHref(latestDeployment)}
                        >
                          {latestDeployment.id}
                        </a>
                      </div>
                      <div class="rounded-md border border-border bg-muted/25 px-3 py-2">
                        <p class="text-xs text-muted-foreground">
                          {$t(i18nKeys.common.domain.status)}
                        </p>
                        <div class="mt-1">
                          <DeploymentStatusBadge status={latestDeployment.status} />
                        </div>
                      </div>
                      <div class="rounded-md border border-border bg-muted/25 px-3 py-2">
                        <p class="text-xs text-muted-foreground">
                          {$t(i18nKeys.common.domain.time)}
                        </p>
                        <p class="mt-1 truncate text-sm font-medium">
                          {resourceLatestDeploymentTime(latestDeployment)}
                        </p>
                      </div>
                    </div>
                  {:else}
                    <div class="mt-4 rounded-md border border-dashed bg-muted/25 px-4 py-5">
                      <p class="font-medium">{$t(i18nKeys.console.resources.overviewNoDeploymentTitle)}</p>
                      <p class="mt-1 text-sm leading-6 text-muted-foreground">
                        {$t(i18nKeys.console.resources.overviewNoDeploymentDescription)}
                      </p>
                    </div>
                  {/if}
                </section>

                <section class="rounded-md border bg-background p-4">
                  <h3 class="text-base font-semibold">
                    {$t(i18nKeys.console.resources.overviewNextActions)}
                  </h3>
                  <div class="mt-4 flex flex-col gap-2">
                    <Button href={resourceSectionHref("access")} variant="outline">
                      <Globe2 class="size-4" />
                      {$t(i18nKeys.console.projects.manageAccessAction)}
                    </Button>
                    <Button href={resourceTabHref("logs")} variant="outline">
                      <Terminal class="size-4" />
                      {$t(i18nKeys.console.resources.runtimeLogsTitle)}
                    </Button>
                  </div>
                </section>
              </div>

              <section class="rounded-md border bg-background p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 class="text-base font-semibold">
                      {$t(i18nKeys.console.resources.overviewConfigurationSummary)}
                    </h3>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.resources.profileEditBoundaryDescription)}
                    </p>
                  </div>
                  <Button href={resourceTabHref("configuration")} variant="outline" size="sm">
                    {$t(i18nKeys.console.resources.configurationTab)}
                  </Button>
                </div>
                <dl class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div class="rounded-md bg-muted/25 px-3 py-2">
                    <dt class="text-xs text-muted-foreground">
                      {$t(i18nKeys.common.domain.source)}
                    </dt>
                    <dd class="mt-1 truncate text-sm font-medium">{resourceSourceSummary()}</dd>
                  </div>
                  <div class="rounded-md bg-muted/25 px-3 py-2">
                    <dt class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.resources.runtimeProfileTitle)}
                    </dt>
                    <dd class="mt-1 truncate text-sm font-medium">{resourceRuntimeSummary()}</dd>
                  </div>
                  <div class="rounded-md bg-muted/25 px-3 py-2 sm:col-span-2">
                    <dt class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.resources.networkProfileTitle)}
                    </dt>
                    <dd class="mt-1 truncate text-sm font-medium">{resourceNetworkSummary()}</dd>
                  </div>
                </dl>
              </section>

              <section class="rounded-md border bg-background p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 class="text-base font-semibold">
                      {$t(i18nKeys.console.resources.dependenciesTitle)}
                    </h3>
                    <p class="mt-1 text-sm text-muted-foreground">{resourceDependencySummary()}</p>
                  </div>
                  <Button href={resourceTabHref("dependencies")} variant="outline" size="sm">
                    {$t(i18nKeys.console.resources.dependenciesTitle)}
                  </Button>
                </div>
              </section>
            </section>
          </div>
        {:else if activeTab === "networking" || activeTab === "configuration" || activeTab === "dependencies" || activeTab === "settings"}
          <div class={detailTabPanelSubnavClass}>
            <div class={[detailSubnavLayoutClass, "md:grid-cols-[12rem_minmax(0,1fr)]"]}>
              {@render resourceSectionNavigation()}

              <div class="space-y-8 p-5">
                {#if activeResourceSection === "general"}
                  <div id="resource-settings-general" class="space-y-4" data-resource-settings-general>
                    <section class="rounded-md border bg-background p-4" data-resource-settings-identity>
                      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div class="min-w-0">
                          <h2 class="text-lg font-semibold">
                            {$t(i18nKeys.console.resources.settingsTitle)}
                          </h2>
                          <p class="mt-1 text-sm leading-6 text-muted-foreground">
                            {$t(i18nKeys.console.resources.settingsDescription)}
                          </p>
                        </div>
                        <Badge variant={isResourceArchived ? "destructive" : "outline"}>
                          {isResourceArchived
                            ? $t(i18nKeys.console.resources.archived)
                            : $t(i18nKeys.common.status.active)}
                        </Badge>
                      </div>

                      <dl class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.common.domain.resource)}
                          </dt>
                          <dd class="mt-1 min-w-0">
                            <p class="truncate text-sm font-medium">{resource.name}</p>
                            <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                              {resource.id}
                            </p>
                          </dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.common.domain.project)}
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">
                            {project?.name ?? resource.projectId}
                          </dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.common.domain.environment)}
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">
                            {environment?.name ?? resource.environmentId}
                          </dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.common.domain.kind)}
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">{resource.kind}</dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.common.domain.slug)}
                          </dt>
                          <dd class="mt-1 truncate font-mono text-sm font-medium">{resource.slug}</dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.common.domain.destination)}
                          </dt>
                          <dd class="mt-1 truncate font-mono text-sm font-medium">
                            {defaultDestinationId || "-"}
                          </dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.common.domain.createdAt)}
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">
                            {formatTime(resource.createdAt)}
                          </dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.common.domain.status)}
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">
                            {isResourceArchived
                              ? $t(i18nKeys.console.resources.archived)
                              : $t(i18nKeys.common.status.active)}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section class="rounded-md border bg-background p-4" data-resource-settings-lifecycle>
                      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div class="space-y-1">
                          <h3 class="text-base font-semibold">
                            {$t(i18nKeys.console.resources.lifecycleStatus)}
                          </h3>
                          {#if resourceDetail?.lifecycle.archivedAt}
                            <p class="text-sm leading-6 text-muted-foreground">
                              {$t(i18nKeys.console.resources.archivedAt)} · {formatTime(resourceDetail.lifecycle.archivedAt)}
                            </p>
                          {:else}
                            <p class="text-sm leading-6 text-muted-foreground">
                              {$t(i18nKeys.console.resources.lifecycleDescription)}
                            </p>
                          {/if}
                          {#if isPreviewEnvironmentResource}
                            <p class="text-sm leading-6 text-muted-foreground">
                              {$t(i18nKeys.console.resources.lifecyclePreviewResourceNotice)}
                            </p>
                          {/if}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onclick={openResourceLifecycleDialog}
                        >
                          <Archive class="size-4" />
                          {$t(i18nKeys.console.resources.lifecycleManageAction)}
                        </Button>
                      </div>
                    </section>

                    <section class="rounded-md border bg-background p-4" data-resource-settings-handoffs>
                      <h3 class="text-base font-semibold">
                        {$t(i18nKeys.console.resources.settingsHandoffsTitle)}
                      </h3>
                      <p class="mt-1 text-sm leading-6 text-muted-foreground">
                        {$t(i18nKeys.console.resources.settingsHandoffsDescription)}
                      </p>
                      <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <Button href={resourceSectionHref("profile")} variant="outline" class="justify-start">
                          {$t(i18nKeys.console.resources.profileTitle)}
                        </Button>
                        <Button href={resourceSectionHref("access")} variant="outline" class="justify-start">
                          {$t(i18nKeys.console.resources.accessUrlTitle)}
                        </Button>
                        <Button href={resourceSectionHref("diagnostics")} variant="outline" class="justify-start">
                          {$t(i18nKeys.console.resources.diagnosticsTitle)}
                        </Button>
                        <Button href={resourceSectionHref("danger")} variant="outline" class="justify-start">
                          {$t(i18nKeys.console.resources.dangerZoneTitle)}
                        </Button>
                      </div>
                    </section>
                  </div>
                {:else if activeResourceSection === "access"}
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
                {:else if activeResourceSection === "domains"}
                  <section id="resource-domain-bindings" class="space-y-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <h2 class="text-lg font-semibold">
                            {$t(i18nKeys.console.resources.domainBindingsTitle)}
                          </h2>
                          <DocsHelpLink
                            href={webDocsHrefs.domainCustomDomainBinding}
                            ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                          />
                        </div>
                        <p class="mt-1 text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.domainBindingsDescription)}
                        </p>
                      </div>
                      <div class="flex shrink-0 flex-wrap items-center gap-2">
                        <Badge variant="outline">{resourceDomainBindings.length}</Badge>
                        {#if !isServerlessStaticArtifactAccess}
                          <Button
                            type="button"
                            size="sm"
                            disabled={isResourceArchived}
                            onclick={openResourceDomainBindingCreateDialog}
                          >
                            <Plus class="size-4" />
                            {$t(i18nKeys.console.domainBindings.createTitle)}
                          </Button>
                        {/if}
                      </div>
                    </div>

                    {#if isServerlessStaticArtifactAccess}
                      <div
                        class="rounded-md border border-dashed bg-muted/25 px-4 py-6"
                        data-resource-static-artifact-domain-unavailable
                      >
                        <p class="text-sm font-medium">
                          {$t(i18nKeys.console.resources.staticArtifactDomainBindingsUnavailableTitle)}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.staticArtifactDomainBindingsUnavailableDescription)}
                        </p>
                      </div>
                    {:else if resourceDomainBindings.length === 0}
                      <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6">
                        <p class="text-sm text-muted-foreground">
                          {$t(i18nKeys.console.domainBindings.emptyBody)}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          class="mt-4"
                          disabled={isResourceArchived}
                          onclick={openResourceDomainBindingCreateDialog}
                        >
                          <Plus class="size-4" />
                          {$t(i18nKeys.console.domainBindings.createTitle)}
                        </Button>
                      </div>
                    {:else}
                      <div class="space-y-3">
                        {#each resourceDomainBindings as binding (binding.id)}
                          {@const certificate = latestCertificateForBinding(binding.id)}
                          <article class="rounded-md border bg-background p-4">
                            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div class="min-w-0 space-y-2">
                                <div class="flex flex-wrap items-center gap-2">
                                  <a
                                    class="break-all font-medium text-primary underline-offset-4 hover:underline"
                                    href={domainBindingHref(binding)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {domainBindingHref(binding)}
                                  </a>
                                  <Badge variant={domainBindingStatusVariant(binding.status)}>
                                    {domainBindingStatusLabel(binding.status)}
                                  </Badge>
                                  <Badge variant="outline">{binding.proxyKind}</Badge>
                                  <Badge variant="secondary">{binding.tlsMode}</Badge>
                                </div>
                                <div class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                                  <span>
                                    {$t(i18nKeys.common.domain.pathPrefix)}:
                                    <code class="rounded bg-muted px-1 py-0.5">{binding.pathPrefix}</code>
                                  </span>
                                  <span>
                                    {$t(i18nKeys.common.domain.server)}:
                                    <code class="rounded bg-muted px-1 py-0.5">{binding.serverId ?? "-"}</code>
                                  </span>
                                  <span>
                                    {$t(i18nKeys.common.domain.destination)}:
                                    <code class="rounded bg-muted px-1 py-0.5">{binding.destinationId ?? "-"}</code>
                                  </span>
                                  <span>
                                    {$t(i18nKeys.common.domain.createdAt)}:
                                    {formatTime(binding.createdAt)}
                                  </span>
                                </div>
                                {#if binding.dnsObservation}
                                  <div class="rounded-md bg-muted/25 px-3 py-2 text-xs">
                                    <div class="flex flex-wrap items-center gap-2">
                                      <span class="font-medium">
                                        {$t(i18nKeys.console.domainBindings.dnsStepTitle)}
                                      </span>
                                      <Badge variant={domainDnsObservationStatusVariant(binding.dnsObservation.status)}>
                                        {domainDnsObservationStatusLabel(binding.dnsObservation.status)}
                                      </Badge>
                                      {#if binding.dnsObservation.checkedAt}
                                        <span class="text-muted-foreground">
                                          {formatTime(binding.dnsObservation.checkedAt)}
                                        </span>
                                      {/if}
                                    </div>
                                    {#if binding.dnsObservation.message}
                                      <p class="mt-1 text-muted-foreground">
                                        {binding.dnsObservation.message}
                                      </p>
                                    {/if}
                                  </div>
                                {/if}
                              </div>

                              <div class="min-w-0 space-y-2 lg:w-64">
                                <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                  <p>{$t(i18nKeys.console.domainBindings.tlsStepTitle)}</p>
                                  <DocsHelpLink
                                    href={webDocsHrefs.certificateReadiness}
                                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                                  />
                                </div>
                                {#if certificate}
                                  <div class="rounded-md border bg-muted/15 px-3 py-2 text-xs">
                                    <div class="flex flex-wrap items-center gap-2">
                                      <Badge variant={certificateStatusVariant(certificate.status)}>
                                        {certificateStatusLabel(certificate.status)}
                                      </Badge>
                                      <Badge variant="outline">{certificateSourceLabel(certificate.source)}</Badge>
                                    </div>
                                    {#if certificate.expiresAt}
                                      <p class="mt-2 text-muted-foreground">
                                        {$t(i18nKeys.console.resources.certificateExpiresAt)}:
                                        {formatTime(certificate.expiresAt)}
                                      </p>
                                    {/if}
                                  </div>
                                {:else}
                                  <div class="rounded-md border border-dashed bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
                                    {$t(i18nKeys.console.resources.certificateSummaryEmpty)}
                                  </div>
                                {/if}
                                {#if binding.certificatePolicy === "manual"}
                                  <Button
                                    id={`resource-domain-binding-import-toggle-${binding.id}`}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onclick={() => openCertificateImportDialog(binding)}
                                  >
                                    <ShieldCheck class="size-4" />
                                    {$t(i18nKeys.console.resources.certificateImportOpen)}
                                  </Button>
                                {:else if binding.certificatePolicy === "auto"}
                                  <p class="text-xs leading-5 text-muted-foreground">
                                    {$t(i18nKeys.console.resources.certificateImportAutoPolicy)}
                                  </p>
                                {:else if binding.certificatePolicy === "disabled"}
                                  <p class="text-xs leading-5 text-muted-foreground">
                                    {$t(i18nKeys.console.resources.certificateImportDisabledPolicy)}
                                  </p>
                                {/if}
                                {#if importFeedback?.bindingId === binding.id}
                                  <div
                                    class={[
                                      "rounded-md border px-3 py-2 text-xs",
                                      importFeedback.kind === "success"
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                                        : "border-destructive/30 bg-destructive/5 text-destructive",
                                    ]}
                                  >
                                    <p class="font-medium">{importFeedback.title}</p>
                                    <p class="mt-1 break-all">{importFeedback.detail}</p>
                                  </div>
                                {/if}
                              </div>
                            </div>
                          </article>
                        {/each}
                      </div>
                    {/if}
                  </section>
                {:else if activeResourceSection === "proxy"}
                  <section id="resource-proxy-configuration" class="space-y-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0">
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.resources.proxyConfigurationTitle)}
                        </h2>
                        <p class="mt-1 text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.proxyConfigurationDescription)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={proxyConfigurationLoading}
                        onclick={refreshProxyConfiguration}
                      >
                        <RefreshCw class={["size-4", proxyConfigurationLoading ? "animate-spin" : ""]} />
                        {$t(i18nKeys.console.resources.proxyConfigurationRefresh)}
                      </Button>
                    </div>

                    {#if proxyConfigurationLoading}
                      <Skeleton class="h-40 w-full" />
                    {:else if proxyConfigurationError}
                      <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {proxyConfigurationError}
                      </div>
                    {:else if !proxyConfiguration}
                      <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.proxyConfigurationEmpty)}
                      </div>
                    {:else}
                      <section class="rounded-md border bg-background p-4">
                        <div class="flex flex-wrap items-center gap-2">
                          <Badge variant={proxyConfigurationStatusVariant(proxyConfiguration.status)}>
                            {proxyConfigurationStatusLabel(proxyConfiguration.status)}
                          </Badge>
                          <Badge variant="outline">{proxyConfiguration.providerKey}</Badge>
                          <Badge variant="secondary">{proxyConfiguration.routeScope}</Badge>
                          {#if proxyConfiguration.stale}
                            <Badge variant="secondary">
                              {$t(i18nKeys.console.resources.proxyConfigurationStatusStale)}
                            </Badge>
                          {/if}
                        </div>
                        <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <dt class="text-xs text-muted-foreground">
                              {$t(i18nKeys.common.domain.deployment)}
                            </dt>
                            <dd class="mt-1 truncate font-medium">
                              {proxyConfiguration.deploymentId ?? proxyConfiguration.lastAppliedDeploymentId ?? "-"}
                            </dd>
                          </div>
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <dt class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.resources.proxyConfigurationGeneratedAt)}
                            </dt>
                            <dd class="mt-1 truncate font-medium">
                              {formatTime(proxyConfiguration.generatedAt)}
                            </dd>
                          </div>
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <dt class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.domainBindings.routeReadiness)}
                            </dt>
                            <dd class="mt-1 font-medium">{proxyConfiguration.routes.length}</dd>
                          </div>
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <dt class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.resources.profileDiagnosticsTitle)}
                            </dt>
                            <dd class="mt-1 font-medium">{proxyConfiguration.warnings.length}</dd>
                          </div>
                        </dl>
                      </section>

                      {#if proxyConfiguration.routes.length > 0}
                        <section class="space-y-3">
                          {#each proxyConfiguration.routes as route (`${route.hostname}-${route.pathPrefix}-${route.source}`)}
                            <article class="rounded-md border bg-background p-3">
                              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div class="min-w-0">
                                  <a
                                    href={route.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="break-all text-sm font-medium text-primary underline-offset-4 hover:underline"
                                  >
                                    {route.url}
                                  </a>
                                  <p class="mt-1 text-xs text-muted-foreground">
                                    {route.source} · {route.scheme} · {route.pathPrefix}
                                  </p>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                  <Badge variant="outline">{route.tlsMode}</Badge>
                                  {#if route.targetPort}
                                    <Badge variant="secondary">
                                      {$t(i18nKeys.common.domain.port)} {route.targetPort}
                                    </Badge>
                                  {/if}
                                </div>
                              </div>
                            </article>
                          {/each}
                        </section>
                      {/if}

                      {#if proxyConfiguration.sections.length > 0}
                        <section class="space-y-3">
                          {#each proxyConfiguration.sections.slice(0, 3) as section (section.id)}
                            <article class="rounded-md border bg-background p-4">
                              <div class="flex flex-wrap items-center gap-2">
                                <h3 class="text-sm font-semibold">{section.title}</h3>
                                <Badge variant="outline">{section.format}</Badge>
                                {#if section.redacted}
                                  <Badge variant="secondary">
                                    {$t(i18nKeys.console.resources.configurationSecretBadge)}
                                  </Badge>
                                {/if}
                              </div>
                              <pre class="mt-3 max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-100">{section.content}</pre>
                            </article>
                          {/each}
                        </section>
                      {/if}
                    {/if}
                  </section>
                {:else if activeResourceSection === "profile"}
                  <div id="resource-configuration-profile" class="space-y-4">
                    <ResourceProfileSummary
                      {resource}
                      projectName={project?.name ?? resource.projectId}
                      environmentName={environment?.name ?? resource.environmentId}
                      destinationId={defaultDestinationId}
                    />

                    <section class="rounded-md border bg-background p-4">
                      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div class="flex flex-wrap items-center gap-2">
                            <h2 class="text-lg font-semibold">
                              {$t(i18nKeys.console.resources.overviewConfigurationSummary)}
                            </h2>
                            <DocsHelpLink
                              href={webDocsHrefs.resourceSourceProfile}
                              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                            />
                            <DocsHelpLink
                              href={webDocsHrefs.resourceRuntimeProfile}
                              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                            />
                            <DocsHelpLink
                              href={webDocsHrefs.resourceNetworkProfile}
                              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                            />
                          </div>
                          <p class="mt-1 text-sm leading-6 text-muted-foreground">
                            {$t(i18nKeys.console.resources.profileEditBoundaryDescription)}
                          </p>
                        </div>
                        <Badge variant="outline">{resourceDetail?.generatedAt ? formatTime(resourceDetail.generatedAt) : "-"}</Badge>
                      </div>
                      <dl class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {$t(i18nKeys.common.domain.source)}
                            <DocsHelpLink
                              href={webDocsHrefs.resourceSourceProfile}
                              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                              className="size-4"
                            />
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">{resourceSourceSummary()}</dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.runtimeProfileTitle)}
                            <DocsHelpLink
                              href={webDocsHrefs.resourceRuntimeProfile}
                              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                              className="size-4"
                            />
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">{resourceRuntimeSummary()}</dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.networkProfileTitle)}
                            <DocsHelpLink
                              href={webDocsHrefs.resourceNetworkProfile}
                              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                              className="size-4"
                            />
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">{resourceNetworkSummary()}</dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.accessProfileTitle)}
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">
                            {resource.accessProfile
                              ? generatedAccessModeLabel(resource.accessProfile.generatedAccessMode)
                              : $t(i18nKeys.common.status.notConfigured)}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section
                      class="rounded-md border bg-background p-4"
                      data-resource-source-link-surface
                    >
                      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div class="min-w-0">
                          <div class="flex flex-wrap items-center gap-2">
                            <h2 class="text-lg font-semibold">
                              {$t(i18nKeys.console.resources.sourceLinkTitle)}
                            </h2>
                            <DocsHelpLink
                              href={webDocsHrefs.sourceAutoDeploySetup}
                              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                            />
                            <Badge variant={resourceDetail?.source?.sourceBindingFingerprint ? "default" : "outline"}>
                              {resourceDetail?.source?.sourceBindingFingerprint
                                ? $t(i18nKeys.common.status.configured)
                                : $t(i18nKeys.common.status.notConfigured)}
                            </Badge>
                          </div>
                          <p class="mt-1 text-sm leading-6 text-muted-foreground">
                            {$t(i18nKeys.console.resources.sourceLinkDescription)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isResourceArchived}
                          onclick={openSourceLinkDialog}
                        >
                          <Link2 class="size-4" />
                          {$t(i18nKeys.console.resources.sourceLinkRelink)}
                        </Button>
                      </div>

                      <dl class="mt-4 grid gap-3 sm:grid-cols-3">
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.sourceLinkFingerprint)}
                          </dt>
                          <dd class="mt-1 break-all font-mono text-xs">
                            {resourceDetail?.source?.sourceBindingFingerprint ?? "-"}
                          </dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.sourceLinkServer)}
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">
                            {sourceLinkServerLabel}
                          </dd>
                        </div>
                        <div class="rounded-md bg-muted/25 px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.sourceLinkDestination)}
                          </dt>
                          <dd class="mt-1 truncate text-sm font-medium">
                            {defaultDestinationId || "-"}
                          </dd>
                        </div>
                      </dl>

                      {#if sourceLinkFeedback}
                        <div
                          class={[
                            "mt-4 rounded-md border px-3 py-2 text-sm",
                            sourceLinkFeedback.kind === "success"
                              ? "border-primary/25 bg-primary/5"
                              : "border-destructive/30 bg-destructive/5 text-destructive",
                          ]}
                        >
                          <p class="font-medium">{sourceLinkFeedback.title}</p>
                          <p class="mt-1 break-all text-xs">{sourceLinkFeedback.detail}</p>
                        </div>
                      {/if}
                    </section>
                  </div>
                {:else if activeResourceSection === "configuration"}
                  <section id="resource-effective-configuration" class="space-y-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.resources.configurationTitle)}
                        </h2>
                        <p class="mt-1 text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.configurationDescription)}
                        </p>
                      </div>
                      {#if resourceEffectiveConfig}
                        <Badge variant="outline">{formatTime(resourceEffectiveConfig.generatedAt)}</Badge>
                      {/if}
                    </div>

                    {#if resourceEffectiveConfigQuery.isPending}
                      <Skeleton class="h-40 w-full" />
                    {:else if resourceEffectiveConfigQuery.error}
                      <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {readErrorMessage(resourceEffectiveConfigQuery.error)}
                      </div>
                    {:else}
                      <section class="rounded-md border bg-background p-4">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 class="text-base font-semibold">
                              {$t(i18nKeys.console.resources.configurationOwnedTitle)}
                            </h3>
                            <p class="mt-1 text-sm text-muted-foreground">
                              {$t(i18nKeys.console.resources.configurationOwnedDescription)}
                            </p>
                          </div>
                          <Badge variant="outline">{resourceEffectiveConfig?.ownedEntries.length ?? 0}</Badge>
                        </div>

                        {#if !resourceEffectiveConfig || resourceEffectiveConfig.ownedEntries.length === 0}
                          <div class="mt-4 rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                            {$t(i18nKeys.console.resources.configurationOwnedEmpty)}
                          </div>
                        {:else}
                          <div class="mt-4 divide-y rounded-md border">
                            {#each resourceEffectiveConfig.ownedEntries as entry (`${entry.key}-${entry.exposure}`)}
                              <div class="grid gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem]">
                                <div class="min-w-0">
                                  <p class="truncate font-medium">{entry.key}</p>
                                  <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    {entry.isSecret ? "****" : entry.value}
                                  </p>
                                </div>
                                <Badge class="w-fit" variant={configScopeBadgeVariant(entry.scope)}>
                                  {entry.scope}
                                </Badge>
                                <Badge class="w-fit" variant="outline">
                                  {configExposureLabel(entry.exposure)}
                                </Badge>
                                <Badge class="w-fit" variant={entry.isSecret ? "secondary" : "outline"}>
                                  {entry.kind}
                                </Badge>
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </section>

                      <section class="rounded-md border bg-background p-4">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 class="text-base font-semibold">
                              {$t(i18nKeys.console.resources.configurationEffectiveTitle)}
                            </h3>
                            <p class="mt-1 text-sm text-muted-foreground">
                              {$t(i18nKeys.console.resources.configurationEffectiveDescription)}
                            </p>
                          </div>
                          <Badge variant="outline">{resourceEffectiveConfig?.effectiveEntries.length ?? 0}</Badge>
                        </div>

                        {#if resourceEffectiveConfig?.precedence.length}
                          <p class="mt-4 rounded-md bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.configurationPrecedence)}:
                            {resourceEffectiveConfig.precedence.join(" -> ")}
                          </p>
                        {/if}

                        {#if !resourceEffectiveConfig || resourceEffectiveConfig.effectiveEntries.length === 0}
                          <div class="mt-4 rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                            {$t(i18nKeys.console.resources.configurationEffectiveEmpty)}
                          </div>
                        {:else}
                          <div class="mt-4 divide-y rounded-md border">
                            {#each resourceEffectiveConfig.effectiveEntries.slice(0, 12) as entry (`${entry.scope}-${entry.key}-${entry.exposure}`)}
                              <div class="grid gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem]">
                                <div class="min-w-0">
                                  <p class="truncate font-medium">{entry.key}</p>
                                  <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    {entry.isSecret ? "****" : entry.value}
                                  </p>
                                </div>
                                <Badge class="w-fit" variant={configScopeBadgeVariant(entry.scope)}>
                                  {entry.scope}
                                </Badge>
                                <Badge class="w-fit" variant="outline">
                                  {configExposureLabel(entry.exposure)}
                                </Badge>
                                <Badge class="w-fit" variant={entry.isSecret ? "secondary" : "outline"}>
                                  {entry.kind}
                                </Badge>
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </section>
                    {/if}
                  </section>
                {:else if activeResourceSection === "auto-deploy"}
                  <section id="resource-auto-deploy-settings" class="space-y-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <h2 class="text-lg font-semibold">
                            {$t(i18nKeys.console.resources.autoDeployTitle)}
                          </h2>
                          <DocsHelpLink
                            href={webDocsHrefs.sourceAutoDeploySetup}
                            ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                          />
                          <DocsHelpLink
                            href={webDocsHrefs.sourceAutoDeploySignatures}
                            ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                          />
                          {#if autoDeployPolicy}
                            <Badge variant={autoDeployStatusVariant(autoDeployPolicy.status)}>
                              {autoDeployStatusLabel(autoDeployPolicy.status)}
                            </Badge>
                          {:else}
                            <Badge variant="outline">
                              {$t(i18nKeys.console.resources.autoDeployStatusDisabled)}
                            </Badge>
                          {/if}
                        </div>
                        <p class="mt-1 text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.autoDeployDescription)}
                        </p>
                      </div>
                      <Button href={resourceSectionHref("source-events")} variant="outline">
                        <GitBranch class="size-4" />
                        {$t(i18nKeys.console.resources.sourceEventsTitle)}
                      </Button>
                    </div>

                    {#if !resourceDetail?.source}
                      <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.autoDeploySourceMissing)}
                      </div>
                    {:else if !sourceSupportsAutoDeploy}
                      <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.autoDeploySourceUnsupported)}
                      </div>
                    {:else if !autoDeployPolicy}
                      <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.autoDeployStatusDisabled)}
                      </div>
                    {:else}
                      <section class="rounded-md border bg-background p-4">
                        <dl class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <dt class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.resources.autoDeployTriggerKind)}
                            </dt>
                            <dd class="mt-1 text-sm font-medium">
                              {autoDeployTriggerKindLabel(autoDeployPolicy.triggerKind)}
                            </dd>
                          </div>
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <dt class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.resources.autoDeployRefs)}
                            </dt>
                            <dd class="mt-1 truncate text-sm font-medium">
                              {autoDeployPolicy.refs.join(", ")}
                            </dd>
                          </div>
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <dt class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.resources.autoDeployEventKind)}
                            </dt>
                            <dd class="mt-1 truncate text-sm font-medium">
                              {autoDeployPolicy.eventKinds.join(", ")}
                            </dd>
                          </div>
                          <div class="rounded-md bg-muted/25 px-3 py-2">
                            <dt class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.resources.autoDeployUpdatedAt)}
                            </dt>
                            <dd class="mt-1 truncate text-sm font-medium">
                              {formatTime(autoDeployPolicy.updatedAt)}
                            </dd>
                          </div>
                        </dl>
                        <div class="mt-3 rounded-md bg-muted/25 px-3 py-2">
                          <p class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.autoDeployCurrentFingerprint)}
                          </p>
                          <p class="mt-1 break-all font-mono text-xs">
                            {autoDeployPolicy.sourceBindingFingerprint}
                          </p>
                        </div>
                        {#if autoDeployPolicy.status === "blocked"}
                          <div class="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                            {$t(i18nKeys.console.resources.autoDeployBlockedSourceChanged)}
                          </div>
                        {/if}
                      </section>
                    {/if}
                  </section>
                {:else if activeResourceSection === "health"}
                  <section id="resource-health-policy" class="space-y-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.resources.healthTitle)}
                        </h2>
                        <p class="mt-1 text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.healthDescription)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={resourceHealthQuery.isFetching}
                        onclick={() => resourceHealthQuery.refetch()}
                      >
                        <RefreshCw class={["size-4", resourceHealthQuery.isFetching ? "animate-spin" : ""]} />
                        {$t(i18nKeys.console.resources.healthRefresh)}
                      </Button>
                    </div>

                    <section class="rounded-md border bg-background p-4">
                      <div class="flex flex-wrap items-center gap-2">
                        <ResourceStatusDot status={resourceHealthOverall} />
                        <span class="text-lg font-semibold">
                          {resourceHealthStatusLabel(resourceHealthOverall)}
                        </span>
                        {#if resourceHealth?.observedAt}
                          <span class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.healthObservedAt)}
                            {formatTime(resourceHealth.observedAt)}
                          </span>
                        {/if}
                      </div>
                      <dl class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div class="rounded-md border bg-background px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.healthRuntime)}
                          </dt>
                          <dd class="mt-1 text-sm font-medium">
                            {resourceHealthSectionStatusLabel(resourceHealth?.runtime.lifecycle)}
                          </dd>
                        </div>
                        <div class="rounded-md border bg-background px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.healthPolicy)}
                          </dt>
                          <dd class="mt-1 text-sm font-medium">
                            {resourceHealthSectionStatusLabel(resourceHealth?.healthPolicy.status)}
                          </dd>
                        </div>
                        <div class="rounded-md border bg-background px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.healthPublicAccess)}
                          </dt>
                          <dd class="mt-1 text-sm font-medium">
                            {resourceHealthSectionStatusLabel(resourceHealth?.publicAccess.status)}
                          </dd>
                        </div>
                        <div class="rounded-md border bg-background px-3 py-2">
                          <dt class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.resources.healthProxy)}
                          </dt>
                          <dd class="mt-1 text-sm font-medium">
                            {resourceHealthSectionStatusLabel(resourceHealth?.proxy.status)}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    {#if resourceHealth?.checks.length}
                      <section class="rounded-md border bg-background p-4">
                        <h3 class="text-base font-semibold">
                          {$t(i18nKeys.console.resources.healthChecks)}
                        </h3>
                        <div class="mt-3 space-y-2">
                          {#each resourceHealth.checks as check (`${check.name}-${check.observedAt}`)}
                            <div class="rounded-md border bg-muted/15 px-3 py-2 text-sm">
                              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div class="min-w-0">
                                  <p class="font-medium">{check.name}</p>
                                  <p class="mt-1 text-xs text-muted-foreground">
                                    {check.target} · {formatTime(check.observedAt)}
                                  </p>
                                  {#if check.message}
                                    <p class="mt-1 break-words text-xs text-muted-foreground">
                                      {check.message}
                                    </p>
                                  {/if}
                                </div>
                                <Badge variant={check.status === "failed" ? "destructive" : check.status === "passed" ? "default" : "outline"}>
                                  {check.status}
                                </Badge>
                              </div>
                            </div>
                          {/each}
                        </div>
                      </section>
                    {:else}
                      <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.healthNoChecks)}
                      </div>
                    {/if}

                    {#if resourceHealth?.sourceErrors.length}
                      <section class="rounded-md border bg-background p-4">
                        <h3 class="text-base font-semibold">
                          {$t(i18nKeys.console.resources.healthSourceIssues)}
                        </h3>
                        <div class="mt-3 space-y-2">
                          {#each resourceHealth.sourceErrors as error (`${error.source}-${error.code}-${error.phase}`)}
                            <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                              <p class="font-medium text-destructive">{error.code}</p>
                              <p class="mt-1 text-xs text-muted-foreground">
                                {error.source} · {error.phase}
                              </p>
                              {#if error.message}
                                <p class="mt-1 break-words text-xs">{error.message}</p>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      </section>
                    {/if}
                  </section>
                {:else if activeResourceSection === "dependencies"}
                  <section id="resource-dependency-bindings" class="space-y-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div class="flex flex-wrap items-center gap-2">
                          <h2 class="text-lg font-semibold">
                            {$t(i18nKeys.console.resources.dependenciesTitle)}
                          </h2>
                          <DocsHelpLink
                            href={webDocsHrefs.dependencyResourceLifecycle}
                            ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                          />
                          <DocsHelpLink
                            href={webDocsHrefs.dependencyRuntimeInjection}
                            ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                          />
                        </div>
                        <p class="mt-1 text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.dependenciesDescription)}
                        </p>
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{resourceDependencyBindings.length}</Badge>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isResourceArchived || bindableDependencyResources.length === 0}
                          onclick={openDependencyBindDialog}
                        >
                          <Link2 class="size-4" />
                          {$t(i18nKeys.console.resources.dependencyBindAction)}
                        </Button>
                      </div>
                    </div>

                    {#if resourceDependencyBindingsQuery.isPending}
                      <Skeleton class="h-40 w-full" />
                    {:else if resourceDependencyBindingsQuery.error}
                      <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {readErrorMessage(resourceDependencyBindingsQuery.error)}
                      </div>
                    {:else if resourceDependencyBindings.length === 0}
                      <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.dependenciesEmpty)}
                      </div>
                    {:else}
                      <div class="space-y-3">
                        {#each resourceDependencyBindings as binding (binding.id)}
                          <article class="rounded-md border bg-background p-4">
                            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div class="min-w-0 space-y-2">
                                <div class="flex flex-wrap items-center gap-2">
                                  <p class="font-medium">
                                    {binding.dependencyResourceName ?? binding.dependencyResourceSlug ?? binding.dependencyResourceId}
                                  </p>
                                  <Badge variant="outline">{dependencyResourceKindLabel(binding.kind)}</Badge>
                                  <Badge variant="secondary">{binding.sourceMode}</Badge>
                                  <Badge variant={binding.status === "active" ? "default" : "outline"}>
                                    {binding.status}
                                  </Badge>
                                </div>
                                {#if binding.connection?.maskedConnection}
                                  <p class="break-all rounded-md bg-muted/25 px-3 py-2 font-mono text-xs">
                                    {binding.connection.maskedConnection}
                                  </p>
                                {/if}
                                <dl class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                                  <div>
                                    <dt>{$t(i18nKeys.common.domain.name)}</dt>
                                    <dd class="mt-1 font-medium text-foreground">
                                      {binding.target.targetName}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>{$t(i18nKeys.common.domain.mode)}</dt>
                                    <dd class="mt-1 font-medium text-foreground">
                                      {binding.target.injectionMode}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>{$t(i18nKeys.common.domain.readiness)}</dt>
                                    <dd class="mt-1 font-medium text-foreground">
                                      {binding.bindingReadiness.status}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>{$t(i18nKeys.common.domain.createdAt)}</dt>
                                    <dd class="mt-1 font-medium text-foreground">
                                      {formatTime(binding.createdAt)}
                                    </dd>
                                  </div>
                                </dl>
                              </div>
                              <Badge variant={binding.snapshotReadiness.status === "blocked" ? "destructive" : "outline"}>
                                {binding.snapshotReadiness.status}
                              </Badge>
                            </div>
                          </article>
                        {/each}
                      </div>
                    {/if}

                    <section class="rounded-md border bg-background p-4">
                      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 class="text-base font-semibold">
                            {$t(i18nKeys.console.resources.dependencyResourceManagementTitle)}
                          </h3>
                          <p class="mt-1 text-sm text-muted-foreground">
                            {$t(i18nKeys.console.resources.dependencyResourceManagementDescription)}
                          </p>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{dependencyResources.length}</Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isResourceArchived || bindableDependencyResources.length === 0}
                            onclick={openDependencyBindDialog}
                          >
                            {$t(i18nKeys.console.resources.dependencyBindAction)}
                          </Button>
                          <Button href="/dependency-resources" variant="outline" size="sm">
                            {$t(i18nKeys.common.actions.viewDetails)}
                          </Button>
                        </div>
                      </div>
                    </section>
                  </section>
                {:else if activeResourceSection === "storage"}
                  <section id="resource-storage" class="space-y-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.resources.storageTitle)}
                        </h2>
                        <p class="mt-1 text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.storageDescription)}
                        </p>
                      </div>
                      <Badge variant="outline">{resourceStorageAttachments.length}</Badge>
                    </div>

                    {#if resourceStorageAttachments.length === 0}
                      <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.storageAttachmentsEmpty)}
                      </div>
                    {:else}
                      <div class="space-y-3">
                        {#each resourceStorageAttachments as attachment (attachment.id)}
                          <article class="rounded-md border bg-background p-4">
                            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div class="min-w-0">
                                <p class="break-all text-sm font-medium">
                                  {storageAttachmentApplicationDataLabel(attachment)}
                                </p>
                                <p class="mt-1 break-all font-mono text-xs text-muted-foreground">
                                  {storageAttachmentVolumeLabel(attachment)} · {attachment.storageVolumeId}
                                </p>
                              </div>
                              <div class="flex flex-wrap gap-2">
                                {#if attachment.storageVolumeKind}
                                  <Badge variant="outline">
                                    {storageVolumeKindLabel(attachment.storageVolumeKind)}
                                  </Badge>
                                {/if}
                                <Badge variant="secondary">
                                  {storageMountModeLabel(attachment.mountMode)}
                                </Badge>
                              </div>
                            </div>
                            <dl class="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                              <div>
                                <dt class="text-muted-foreground">
                                  {$t(i18nKeys.console.resources.storageDestinationPath)}
                                </dt>
                                <dd class="mt-1 break-all font-mono font-medium">
                                  {attachment.destinationPath}
                                </dd>
                              </div>
                              <div>
                                <dt class="text-muted-foreground">
                                  {$t(i18nKeys.console.resources.storageMountMode)}
                                </dt>
                                <dd class="mt-1 font-medium">
                                  {storageMountModeLabel(attachment.mountMode)}
                                </dd>
                              </div>
                              <div>
                                <dt class="text-muted-foreground">
                                  {$t(i18nKeys.console.resources.storageAttachedAt)}
                                </dt>
                                <dd class="mt-1 font-medium">{formatTime(attachment.attachedAt)}</dd>
                              </div>
                            </dl>
                          </article>
                        {/each}
                      </div>
                    {/if}

                    <section class="rounded-md border bg-background p-4">
                      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 class="text-base font-semibold">
                            {$t(i18nKeys.console.resources.storageVolumeBackupSummaryTitle)}
                          </h3>
                          <p class="mt-1 text-sm text-muted-foreground">
                            {$t(i18nKeys.console.resources.storageVolumeBackupSummaryDescription)}
                          </p>
                        </div>
                        <Badge variant="outline">{storageVolumes.length}</Badge>
                      </div>
                    </section>
                  </section>
                {:else if activeResourceSection === "diagnostics"}
                  <section id="resource-diagnostics" class="space-y-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div class="flex flex-wrap items-center gap-2">
                          <h2 class="text-lg font-semibold">
                            {$t(i18nKeys.console.resources.diagnosticsTitle)}
                          </h2>
                          <DocsHelpLink
                            href={webDocsHrefs.diagnosticsSafeSupportPayload}
                            ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                          />
                        </div>
                        <p class="mt-1 text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.diagnosticsDescription)}
                        </p>
                      </div>
                      <Button
                        id="resource-diagnostic-summary-copy"
                        type="button"
                        variant="outline"
                        disabled={diagnosticSummaryLoading}
                        onclick={copyResourceDiagnosticSummary}
                      >
                        <Clipboard class="size-4" />
                        {diagnosticSummaryButtonLabel}
                      </Button>
                    </div>

                    {#if diagnosticSummaryError}
                      <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {diagnosticSummaryError}
                      </div>
                    {/if}
                    {#if diagnosticSummaryCopyFallback}
                      <section class="rounded-md border bg-background p-4">
                        <h3 class="text-base font-semibold">
                          {$t(i18nKeys.console.resources.diagnosticSummaryCopyFallbackTitle)}
                        </h3>
                        <p class="mt-1 text-sm text-muted-foreground">
                          {$t(i18nKeys.console.resources.diagnosticSummaryCopyFallbackDescription)}
                        </p>
                        <div class="mt-3 max-h-64 overflow-auto rounded-md border bg-muted/25 p-3">
                          <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">{diagnosticSummaryCopyFallback}</pre>
                        </div>
                      </section>
                    {/if}

                    <section class="rounded-md border bg-background p-4">
                      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div class="flex items-center gap-2">
                            <h3 class="text-base font-semibold">
                              {$t(i18nKeys.console.resources.profileDiagnosticsTitle)}
                            </h3>
                            <DocsHelpLink
                              href={webDocsHrefs.resourceProfileDrift}
                              ariaLabel={$t(i18nKeys.common.actions.openDocumentation)}
                            />
                          </div>
                          <p class="mt-1 text-sm text-muted-foreground">
                            {$t(i18nKeys.console.resources.healthSourceIssues)}
                          </p>
                        </div>
                        <Badge variant="outline">{profileDiagnostics.length}</Badge>
                      </div>

                      {#if profileDiagnostics.length === 0}
                        <div class="mt-4 rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                          {$t(i18nKeys.console.resources.profileDiagnosticsEmpty)}
                        </div>
                      {:else}
                        <div class="mt-4 space-y-2">
                          {#each profileDiagnostics as diagnostic (`${diagnostic.code}-${diagnostic.fieldPath ?? diagnostic.path ?? diagnostic.message}`)}
                            <div class="rounded-md border bg-muted/15 px-3 py-2 text-sm">
                              <div class="flex flex-wrap items-center gap-2">
                                <Badge variant={diagnostic.severity === "blocking" ? "destructive" : "outline"}>
                                  {diagnostic.severity}
                                </Badge>
                                {#if diagnostic.section}
                                  <Badge variant="secondary">{diagnostic.section}</Badge>
                                {/if}
                                <span class="font-mono text-xs text-muted-foreground">
                                  {diagnostic.code}
                                </span>
                              </div>
                              <p class="mt-2 break-words">{diagnostic.message}</p>
                              {#if diagnostic.suggestedCommand}
                                <p class="mt-1 text-xs text-muted-foreground">
                                  {$t(i18nKeys.console.resources.profileDiagnosticsSuggestedCommand)}:
                                  <code class="rounded bg-muted px-1 py-0.5">
                                    {diagnostic.suggestedCommand}
                                  </code>
                                </p>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </section>
                  </section>
                {:else if activeResourceSection === "danger"}
                  <section
                    id="resource-danger-zone"
                    class="console-panel space-y-4 border-destructive/25 bg-destructive/5 p-5"
                    data-resource-danger-display-surface
                  >
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="space-y-1">
                        <h2 class="text-lg font-semibold text-destructive">
                          {$t(i18nKeys.console.resources.dangerZoneTitle)}
                        </h2>
                        <p class="text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.resources.dangerZoneDescription)}
                        </p>
                      </div>
                      <Badge variant={isResourceArchived ? "destructive" : "outline"}>
                        {isResourceArchived
                          ? $t(i18nKeys.console.resources.archived)
                          : $t(i18nKeys.common.status.active)}
                      </Badge>
                    </div>

                    {#if archiveFeedback}
                      <div
                        class={[
                          "rounded-md border px-3 py-2 text-sm",
                          archiveFeedback.kind === "success"
                            ? "border-primary/25 bg-background"
                            : "border-destructive/30 bg-background text-destructive",
                        ]}
                      >
                        <p class="font-medium">{archiveFeedback.title}</p>
                        <p class="mt-1 break-all text-xs">{archiveFeedback.detail}</p>
                      </div>
                    {/if}
                    {#if deleteFeedback}
                      <div
                        class={[
                          "rounded-md border px-3 py-2 text-sm",
                          deleteFeedback.kind === "success"
                            ? "border-primary/25 bg-background"
                            : "border-destructive/30 bg-background text-destructive",
                        ]}
                      >
                        <p class="font-medium">{deleteFeedback.title}</p>
                        <p class="mt-1 break-all text-xs">{deleteFeedback.detail}</p>
                      </div>
                    {/if}

                    <div class="rounded-md border bg-background px-3 py-2 text-sm">
                      <p class="font-medium">
                        {isResourceArchived
                          ? $t(i18nKeys.console.resources.archived)
                          : $t(i18nKeys.common.status.active)}
                      </p>
                      {#if resourceDetail?.lifecycle.archivedAt}
                        <p class="mt-1 text-muted-foreground">
                          {$t(i18nKeys.console.resources.archivedAt)} · {formatTime(resourceDetail.lifecycle.archivedAt)}
                        </p>
                      {:else}
                        <p class="mt-1 text-muted-foreground">
                          {$t(i18nKeys.console.resources.lifecycleDescription)}
                        </p>
                      {/if}
                      {#if isPreviewEnvironmentResource}
                        <p class="mt-2 text-muted-foreground">
                          {$t(i18nKeys.console.resources.lifecyclePreviewResourceNotice)}
                        </p>
                      {/if}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      class="w-full justify-start"
                      onclick={openResourceLifecycleDialog}
                    >
                      <Archive class="size-4" />
                      {$t(i18nKeys.console.resources.lifecycleManageAction)}
                    </Button>
                  </section>
                {/if}
              </div>
            </div>
        </div>
        {:else if activeTab === "monitor"}
          <div class={detailTabPanelScrollClass}>
            <div class="space-y-8">
              {#if showResourceServerRuntimeFallback}
                <p class="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.runtimeUsage.resourceServerFallbackNotice)}
                </p>
              {/if}
              <RuntimeMonitorPanel
                scope={resourceRuntimeScope}
                observationScope={effectiveResourceRuntimeMonitoringObservationScope}
                usage={effectiveResourceRuntimeUsage}
                loading={effectiveResourceRuntimeUsageLoading}
                error={effectiveResourceRuntimeUsageError}
                retainedSamples={effectiveResourceRuntimeMonitoringSamples}
                retainedSamplesLoading={showResourceServerRuntimeFallback
                  ? resourceFallbackServerRuntimeMonitoringSamplesQuery.isPending
                  : resourceRuntimeMonitoringSamplesQuery.isPending}
                retainedSamplesError={effectiveResourceRuntimeMonitoringSamplesError}
                rollup={effectiveResourceRuntimeMonitoringRollup}
                rollupLoading={showResourceServerRuntimeFallback
                  ? resourceFallbackServerRuntimeMonitoringRollupQuery.isPending
                  : resourceRuntimeMonitoringRollupQuery.isPending}
                rollupError={effectiveResourceRuntimeMonitoringRollupError}
                thresholds={resourceRuntimeMonitoringThresholds}
                thresholdsLoading={resourceRuntimeMonitoringThresholdsQuery.isPending}
                thresholdsError={resourceRuntimeMonitoringThresholdsError}
                timeRange={runtimeMonitoringTimeRange}
                refreshing={resourceRuntimeUsageQuery.isFetching ||
                  resourceRuntimeMonitoringSamplesQuery.isFetching ||
                  resourceRuntimeMonitoringRollupQuery.isFetching ||
                  resourceRuntimeMonitoringThresholdsQuery.isFetching ||
                  resourceFallbackServerRuntimeUsageQuery.isFetching ||
                  resourceFallbackServerRuntimeMonitoringSamplesQuery.isFetching ||
                  resourceFallbackServerRuntimeMonitoringRollupQuery.isFetching}
                onTimeRangeChange={(nextTimeRange) => {
                  runtimeMonitoringTimeRange = nextTimeRange;
                }}
                onRefresh={refreshRuntimeMonitor}
                logsHref={resourceTabHref("logs")}
                diagnosticsHref={resourceSectionHref("diagnostics")}
                cleanupHref={resourceSectionHref("storage")}
              />
              {@render resourceRuntimeControlPanel()}
            </div>
          </div>
        {:else if activeTab === "terminal"}
          <div class={detailTabPanelScrollClass}>
            <section class="space-y-3" data-resource-terminal-panel>
              {#if terminalDeploymentId}
                <TerminalSessionPanel
                  title={$t(i18nKeys.console.terminal.resourceTitle)}
                  description={$t(i18nKeys.console.terminal.resourceDescription)}
                  docsHref={webDocsHrefs.serverTerminalSession}
                  docsAriaLabel={$t(i18nKeys.common.actions.openDocs)}
                  fallbackHref={latestDeployment?.serverId ? serverTerminalHref(latestDeployment.serverId) : ""}
                  fallbackLabel={$t(i18nKeys.console.terminal.serverTitle)}
                  scope={{
                    kind: "resource",
                    resourceId: resource.id,
                    deploymentId: terminalDeploymentId,
                  }}
                />
              {:else}
                <div
                  class="rounded-md border border-dashed bg-card px-4 py-6"
                  data-resource-terminal-unavailable-state
                >
                  <p class="text-sm font-medium">
                    {$t(i18nKeys.console.terminal.resourceUnavailableTitle)}
                  </p>
                  <p class="mt-1 text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.terminal.resourceUnavailableBody)}
                  </p>
                  <div class="mt-4 flex flex-wrap gap-2">
                    <Button href={resourceTabHref("deployments")} variant="outline">
                      {resourceTabLabel("deployments")}
                      <ArrowRight class="size-4" />
                    </Button>
                    {#if latestDeployment?.serverId}
                      <Button href={serverTerminalHref(latestDeployment.serverId)} variant="outline">
                        <Terminal class="size-4" />
                        {$t(i18nKeys.console.terminal.serverTitle)}
                      </Button>
                    {/if}
                  </div>
                </div>
              {/if}
            </section>
          </div>
        {:else if activeTab === "logs"}
          <div class={detailTabPanelScrollClass}>
            {@render resourceRuntimeLogsPanel()}
          </div>
        {/if}
      </div>

      <Dialog.Root bind:open={deploymentDialogOpen} onOpenChange={setResourceDeploymentDialogOpen}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-6xl">
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.common.actions.createDeployment)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.resources.newDeploymentDescription)}
            </Dialog.Description>
          </Dialog.Header>

          <form
            class="max-h-[calc(100vh-12rem)] overflow-y-auto px-5 pb-5"
            onsubmit={createResourceDeployment}
          >
            <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div class="space-y-0 border-y">
                <section class="grid gap-5 py-5 md:grid-cols-[11rem_minmax(0,1fr)]">
                  <div class="flex items-start gap-2">
                    <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
                      <Server class="size-[18px]" />
                    </span>
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <h3 class="font-semibold">
                          {$t(i18nKeys.console.resources.newDeploymentTargetTitle)}
                        </h3>
                        <DocsHelpLink
                          href={webDocsHrefs.deploymentLifecycle}
                          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                          className="size-5"
                        />
                      </div>
                      <p class="text-sm leading-6 text-muted-foreground">
                        {$t(i18nKeys.console.resources.newDeploymentTargetDescription)}
                      </p>
                    </div>
                  </div>

                  <div class="grid gap-4 sm:grid-cols-2">
                    <label class="space-y-1.5 text-sm font-medium">
                      <span class="inline-flex items-center gap-1.5">
                        {$t(i18nKeys.common.domain.server)}
                        <DocsHelpLink
                          href={webDocsHrefs.serverDeploymentTarget}
                          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                          className="size-5"
                        />
                      </span>
                      <Select.Root bind:value={deploymentServerId} type="single">
                        <Select.Trigger class="w-full">
                          {selectedDeploymentServer?.name ?? $t(i18nKeys.console.domainBindings.noServerOptions)}
                        </Select.Trigger>
                        <Select.Content>
                          {#each servers as server (server.id)}
                            <Select.Item value={server.id}>{server.name}</Select.Item>
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    </label>

                    <label class="space-y-1.5 text-sm font-medium">
                      <span class="inline-flex items-center gap-1.5">
                        {$t(i18nKeys.common.domain.destination)}
                        <DocsHelpLink
                          href={webDocsHrefs.domainGeneratedAccessRoute}
                          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                          className="size-5"
                        />
                      </span>
                      <Input
                        bind:value={deploymentDestinationId}
                        autocomplete="off"
                        placeholder={$t(i18nKeys.console.domainBindings.formDestinationPlaceholder)}
                      />
                    </label>
                  </div>
                </section>

                <section class="grid gap-5 border-t py-5 md:grid-cols-[11rem_minmax(0,1fr)]">
                  <div class="flex items-start gap-2">
                    <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
                      <GitBranch class="size-[18px]" />
                    </span>
                    <div class="space-y-1">
                      <h3 class="font-semibold">
                        {$t(i18nKeys.console.resources.newDeploymentSourceTitle)}
                      </h3>
                      <p class="text-sm leading-6 text-muted-foreground">
                        {$t(i18nKeys.console.resources.newDeploymentSourceDescription)}
                      </p>
                    </div>
                  </div>

                  <div>
                    {#if deploymentSource}
                      <div class="divide-y rounded-md border bg-background">
                        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                          <p class="min-w-0 truncate text-sm font-medium">
                            {deploymentSource.displayName}
                          </p>
                          <Badge variant="secondary">{deploymentSource.kind}</Badge>
                        </div>
                        <p class="truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                          {deploymentSource.locator}
                        </p>
                      </div>
                    {:else}
                      <div class="rounded-md border border-dashed px-4 py-4 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.resources.newDeploymentNoSourceSnapshot)}
                      </div>
                    {/if}
                  </div>
                </section>

                <section class="grid gap-5 border-t py-5 md:grid-cols-[11rem_minmax(0,1fr)]">
                  <div class="flex items-start gap-2">
                    <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
                      <Eye class="size-[18px]" />
                    </span>
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <h3 class="font-semibold">
                          {$t(i18nKeys.console.resources.newDeploymentPlanTitle)}
                        </h3>
                        <DocsHelpLink
                          href={webDocsHrefs.deploymentPlanPreview}
                          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                          className="size-5"
                        />
                      </div>
                      <p class="text-sm leading-6 text-muted-foreground">
                        {$t(i18nKeys.console.resources.newDeploymentPlanDescription)}
                      </p>
                    </div>
                  </div>

                  <div class="space-y-4">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canPreviewDeploymentPlan}
                      onclick={previewResourceDeploymentPlan}
                    >
                      <Eye class="size-4" />
                      {deploymentPlanPending
                        ? $t(i18nKeys.console.resources.newDeploymentPlanPending)
                        : $t(i18nKeys.console.resources.newDeploymentPlanAction)}
                    </Button>

                    {#if deploymentPlanError}
                      <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        <p class="font-medium">
                          {$t(i18nKeys.console.resources.newDeploymentPlanErrorTitle)}
                        </p>
                        <p class="mt-1 break-all text-xs">{deploymentPlanError}</p>
                      </div>
                    {/if}

                    {#if deploymentPlanPreview}
                      <div class="divide-y rounded-md border bg-background">
                        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium">
                              {deploymentPlanPreview.source.framework ??
                                deploymentPlanPreview.source.runtimeFamily ??
                                deploymentPlanPreview.source.kind}
                            </p>
                            <p class="mt-1 truncate text-xs text-muted-foreground">
                              {deploymentPlanPreview.source.displayName}
                            </p>
                          </div>
                          <Badge variant={deploymentPlanPreview.readiness.ready ? "secondary" : "outline"}>
                            {deploymentPlanStatusLabel(deploymentPlanPreview.readiness.status)}
                          </Badge>
                        </div>

                        <dl class="grid gap-3 px-4 py-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt class="text-muted-foreground">
                              {$t(i18nKeys.console.resources.newDeploymentPlanPlanner)}
                            </dt>
                            <dd class="mt-1 font-medium">
                              {deploymentPlanPreview.planner.plannerKey} · {deploymentPlanPreview.planner.supportTier}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-muted-foreground">
                              {$t(i18nKeys.console.resources.newDeploymentPlanArtifact)}
                            </dt>
                            <dd class="mt-1 font-medium">{deploymentPlanPreview.artifact.kind}</dd>
                          </div>
                          <div>
                            <dt class="text-muted-foreground">
                              {$t(i18nKeys.console.resources.newDeploymentPlanNetworkHealth)}
                            </dt>
                            <dd class="mt-1 font-medium">
                              {deploymentPlanPreview.network.internalPort ?? "-"} · {deploymentPlanPreview.health.kind}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-muted-foreground">
                              {$t(i18nKeys.console.resources.generatedAccessRoute)}
                            </dt>
                            <dd class="mt-1 font-medium">
                              {deploymentPlanPreview.access?.hostname ?? "-"}
                            </dd>
                          </div>
                        </dl>

                        {#if deploymentPlanPreview.commands.length > 0}
                          <div class="px-4 py-3">
                            <h4 class="text-sm font-medium">
                              {$t(i18nKeys.console.resources.newDeploymentPlanCommands)}
                            </h4>
                            <div class="mt-2 space-y-2">
                              {#each deploymentPlanPreview.commands as command (`${command.kind}:${command.command}`)}
                                <p class="rounded-md bg-muted px-3 py-2 font-mono text-xs">
                                  {command.kind}: {command.command}
                                </p>
                              {/each}
                            </div>
                          </div>
                        {/if}

                        {#if deploymentPlanPreview.warnings.length > 0 || deploymentPlanPreview.unsupportedReasons.length > 0}
                          <div class="px-4 py-3">
                            <h4 class="text-sm font-medium">
                              {$t(i18nKeys.console.resources.newDeploymentPlanReasons)}
                            </h4>
                            <ul class="mt-2 space-y-2 text-sm">
                              {#each [...deploymentPlanPreview.unsupportedReasons, ...deploymentPlanPreview.warnings] as reason (`${reason.code}:${reason.phase}`)}
                                <li class="rounded-md border px-3 py-2">
                                  <p class="font-medium">{reason.code}</p>
                                  <p class="mt-1 text-muted-foreground">{reason.message}</p>
                                </li>
                              {/each}
                            </ul>
                          </div>
                        {/if}
                      </div>
                    {/if}

                    {#if deploymentFeedback}
                      <div
                        class={[
                          "rounded-md border px-3 py-2 text-sm",
                          deploymentFeedback.kind === "success"
                            ? "border-primary/25 bg-primary/5"
                            : "border-destructive/30 bg-destructive/5 text-destructive",
                        ]}
                      >
                        <p class="font-medium">{deploymentFeedback.title}</p>
                        <p class="mt-1 break-all text-xs">{deploymentFeedback.detail}</p>
                      </div>
                    {/if}
                  </div>
                </section>
              </div>

              <aside class="rounded-md border bg-muted/15 p-4">
                <h3 class="text-base font-semibold">
                  {$t(i18nKeys.console.resources.newDeploymentContextTitle)}
                </h3>
                <p class="mt-1 text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.resources.profileDescription)}
                </p>
                <dl class="mt-4 divide-y text-sm">
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.project)}</dt>
                    <dd class="truncate font-medium">{project?.name ?? resource.projectId}</dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</dt>
                    <dd class="truncate font-medium">{environment?.name ?? resource.environmentId}</dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</dt>
                    <dd class="min-w-0">
                      <p class="truncate font-medium">{resource.name}</p>
                      <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {resource.id}
                      </p>
                    </dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.server)}</dt>
                    <dd class="truncate font-medium">
                      {(selectedDeploymentServer?.name ?? deploymentServerId) || "-"}
                    </dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.destination)}</dt>
                    <dd class="truncate font-medium">{deploymentDestinationId || "-"}</dd>
                  </div>
                </dl>
              </aside>
            </div>

            <Dialog.Footer class="mt-5 px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                onclick={() => setResourceDeploymentDialogOpen(false)}
              >
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button type="submit" disabled={!canCreateDeployment}>
                <Play class="size-4" />
                {deploymentCreatePending
                  ? $t(i18nKeys.console.quickDeploy.submitPending)
                  : $t(i18nKeys.common.actions.createDeployment)}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root
        bind:open={domainBindingCreateDialogOpen}
        onOpenChange={setResourceDomainBindingCreateDialogOpen}
      >
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-4xl">
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.domainBindings.createTitle)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.domainBindings.resourceScopedDescription)}
            </Dialog.Description>
          </Dialog.Header>

          <form
            class="max-h-[calc(100vh-12rem)] overflow-y-auto px-5 pb-5"
            onsubmit={createResourceDomainBinding}
            data-resource-domain-binding-create-dialog
          >
            <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div class="space-y-5">
                <section class="grid gap-4 rounded-md border bg-background p-4 sm:grid-cols-2">
                  <label class="space-y-1.5 text-sm font-medium sm:col-span-2" for="resource-domain-binding-domain">
                    <span>{$t(i18nKeys.common.domain.domainName)}</span>
                    <Input
                      id="resource-domain-binding-domain"
                      bind:value={domainName}
                      autocomplete="off"
                      placeholder={$t(i18nKeys.console.domainBindings.formDomainPlaceholder)}
                    />
                  </label>

                  <label class="space-y-1.5 text-sm font-medium" for="resource-domain-binding-path-prefix">
                    <span>{$t(i18nKeys.common.domain.pathPrefix)}</span>
                    <Input
                      id="resource-domain-binding-path-prefix"
                      bind:value={pathPrefix}
                      autocomplete="off"
                      placeholder="/"
                    />
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
                        <Select.Item value="redirect" disabled={canonicalRedirectTargets.length === 0}>
                          {$t(i18nKeys.console.domainBindings.routeModeRedirect)}
                        </Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </label>

                  {#if routeMode === "redirect"}
                    <label class="space-y-1.5 text-sm font-medium" for="resource-domain-binding-redirect-to">
                      <span>{$t(i18nKeys.common.domain.redirectTo)}</span>
                      <Select.Root bind:value={redirectTo} type="single">
                        <Select.Trigger class="w-full">
                          {selectedCanonicalRedirectTarget?.domainName ??
                            $t(i18nKeys.console.domainBindings.noCanonicalDomainOptions)}
                        </Select.Trigger>
                        <Select.Content>
                          {#each canonicalRedirectTargets as target (target.id)}
                            <Select.Item value={target.domainName}>{target.domainName}</Select.Item>
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
                  {/if}
                </section>

                <section class="grid gap-4 rounded-md border bg-background p-4 sm:grid-cols-2">
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.common.domain.server)}</span>
                    <Select.Root bind:value={serverId} type="single" disabled={!shouldShowServerField}>
                      <Select.Trigger class="w-full">
                        {selectedServer?.name ?? serverId ?? $t(i18nKeys.console.domainBindings.noServerOptions)}
                      </Select.Trigger>
                      <Select.Content>
                        {#each servers as server (server.id)}
                          <Select.Item value={server.id}>{server.name}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </label>

                  <label class="space-y-1.5 text-sm font-medium" for="resource-domain-binding-destination">
                    <span>{$t(i18nKeys.common.domain.destination)}</span>
                    <Input
                      id="resource-domain-binding-destination"
                      bind:value={destinationId}
                      autocomplete="off"
                      disabled={!shouldShowDestinationField}
                      placeholder={$t(i18nKeys.console.domainBindings.formDestinationPlaceholder)}
                    />
                    <span class="block text-xs leading-5 text-muted-foreground">
                      {defaultDestinationId
                        ? $t(i18nKeys.console.domainBindings.selectedResourceDestination, {
                            destinationId: defaultDestinationId,
                          })
                        : $t(i18nKeys.console.domainBindings.destinationHelp)}
                    </span>
                  </label>

                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.common.domain.proxy)}</span>
                    <Select.Root bind:value={proxyKind} type="single">
                      <Select.Trigger class="w-full">{proxyKind}</Select.Trigger>
                      <Select.Content>
                        <Select.Item value="none">none</Select.Item>
                        <Select.Item value="traefik">traefik</Select.Item>
                        <Select.Item value="caddy">caddy</Select.Item>
                      </Select.Content>
                    </Select.Root>
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

                  <label class="space-y-1.5 text-sm font-medium sm:col-span-2">
                    <span>{$t(i18nKeys.console.domainBindings.tlsStepTitle)}</span>
                    <Select.Root bind:value={certificatePolicy} type="single">
                      <Select.Trigger class="w-full">{certificatePolicy}</Select.Trigger>
                      <Select.Content>
                        <Select.Item value="auto">auto</Select.Item>
                        <Select.Item value="manual">manual</Select.Item>
                        <Select.Item value="disabled">disabled</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </label>
                </section>

                {#if createFeedback}
                  <div
                    class={[
                      "rounded-md border px-3 py-2 text-sm",
                      createFeedback.kind === "success"
                        ? "border-primary/25 bg-primary/5"
                        : "border-destructive/30 bg-destructive/5 text-destructive",
                    ]}
                  >
                    <p class="font-medium">{createFeedback.title}</p>
                    <p class="mt-1 break-all text-xs">{createFeedback.detail}</p>
                  </div>
                {/if}
              </div>

              <aside class="rounded-md border bg-muted/15 p-4">
                <h3 class="text-base font-semibold">
                  {$t(i18nKeys.console.domainBindings.resourceScopedTitle)}
                </h3>
                <p class="mt-1 text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.resourceScopedDescription)}
                </p>
                <dl class="mt-4 divide-y text-sm">
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.project)}</dt>
                    <dd class="truncate font-medium">{project?.name ?? resource.projectId}</dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</dt>
                    <dd class="truncate font-medium">{environment?.name ?? resource.environmentId}</dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</dt>
                    <dd class="min-w-0">
                      <p class="truncate font-medium">{resource.name}</p>
                      <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {resource.id}
                      </p>
                    </dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.server)}</dt>
                    <dd class="truncate font-medium">{(selectedServer?.name ?? serverId) || "-"}</dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.destination)}</dt>
                    <dd class="truncate font-medium">{destinationId || "-"}</dd>
                  </div>
                </dl>
              </aside>
            </div>

            <Dialog.Footer class="mt-5 px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                onclick={() => setResourceDomainBindingCreateDialogOpen(false)}
              >
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button
                type="submit"
                disabled={!canCreateBinding || createDomainBindingMutation.isPending}
              >
                <Plus class="size-4" />
                {createDomainBindingMutation.isPending
                  ? $t(i18nKeys.console.domainBindings.formSubmitting)
                  : $t(i18nKeys.console.domainBindings.formSubmit)}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root bind:open={certificateImportDialogOpen} onOpenChange={(open) => {
        if (!open) {
          closeCertificateImportDialog();
        } else {
          certificateImportDialogOpen = true;
        }
      }}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-3xl">
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.resources.certificateImportTitle)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.resources.certificateImportDescription)}
            </Dialog.Description>
          </Dialog.Header>

          {#if selectedImportBinding}
            <form
              id={`resource-domain-binding-import-form-${selectedImportBinding.id}`}
              class="space-y-5 px-5 pb-5"
              onsubmit={(event) => importCertificateForBinding(selectedImportBinding, event)}
              data-resource-certificate-import-dialog
            >
              <div class="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <p class="break-all font-medium">{selectedImportBinding.domainName}</p>
                <p class="mt-1 font-mono text-xs text-muted-foreground">
                  {selectedImportBinding.id}
                </p>
              </div>

              <label class="space-y-1.5 text-sm font-medium" for={`resource-domain-binding-import-certificate-chain-${selectedImportBinding.id}`}>
                <span>{$t(i18nKeys.console.resources.certificateImportCertificateChain)}</span>
                <Textarea
                  id={`resource-domain-binding-import-certificate-chain-${selectedImportBinding.id}`}
                  bind:value={importCertificateChain}
                  class="min-h-28 font-mono text-xs"
                  placeholder={$t(i18nKeys.console.resources.certificateImportCertificateChainPlaceholder)}
                />
              </label>
              <label class="space-y-1.5 text-sm font-medium" for={`resource-domain-binding-import-private-key-${selectedImportBinding.id}`}>
                <span>{$t(i18nKeys.console.resources.certificateImportPrivateKey)}</span>
                <Textarea
                  id={`resource-domain-binding-import-private-key-${selectedImportBinding.id}`}
                  bind:value={importPrivateKey}
                  class="min-h-28 font-mono text-xs"
                  placeholder={$t(i18nKeys.console.resources.certificateImportPrivateKeyPlaceholder)}
                />
              </label>
              <label class="space-y-1.5 text-sm font-medium" for={`resource-domain-binding-import-passphrase-${selectedImportBinding.id}`}>
                <span>{$t(i18nKeys.console.resources.certificateImportPassphrase)}</span>
                <Input
                  id={`resource-domain-binding-import-passphrase-${selectedImportBinding.id}`}
                  bind:value={importPassphrase}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.resources.certificateImportPassphrasePlaceholder)}
                />
              </label>
              <Dialog.Footer class="px-0 pb-0">
                <Button
                  type="button"
                  variant="outline"
                  onclick={closeCertificateImportDialog}
                >
                  {$t(i18nKeys.common.actions.cancel)}
                </Button>
                <Button
                  type="submit"
                  disabled={!canImportCertificate || importCertificateMutation.isPending}
                >
                  <ShieldCheck class="size-4" />
                  {importCertificateMutation.isPending
                    ? $t(i18nKeys.console.resources.certificateImportSubmitting)
                    : $t(i18nKeys.console.resources.certificateImportSubmit)}
                </Button>
              </Dialog.Footer>
            </form>
          {/if}
        </Dialog.Content>
      </Dialog.Root>

      <DeploymentProgressDialog
        open={deploymentProgressDialogOpen}
        status={deploymentProgressDialogStatus}
        events={deploymentProgressEvents}
        streamError={deploymentProgressStreamError}
        requestId={deploymentProgressRequestId}
        deploymentId={deploymentProgressDeploymentId}
        traceLink={deploymentProgressTraceLink}
        title={$t(i18nKeys.console.deployments.progressTitle)}
        description={$t(i18nKeys.console.deployments.progressDescription)}
        onClose={() => {
          deploymentProgressDialogOpen = false;
        }}
        onOpenDeployment={() => {
          void goto(deploymentProgressHref());
        }}
      />

      <Dialog.Root bind:open={runtimeControlDialogOpen}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.resources.runtimeControlsTitle)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.resources.runtimeControlsDescription)}
            </Dialog.Description>
          </Dialog.Header>
          <div class="space-y-5 px-5 pb-5" data-resource-runtime-control-dialog>
            <div class="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <p class="font-medium">{resource.name}</p>
              <p class="mt-1 font-mono text-xs text-muted-foreground">{resource.slug}</p>
            </div>
            {#if resourceHealth?.latestRuntimeControl}
              <div class="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                <p class="font-medium text-foreground">
                  {$t(i18nKeys.console.resources.runtimeControlsLatest)}
                </p>
                <p class="mt-1">
                  {resourceHealth.latestRuntimeControl.operation} ·
                  {resourceHealth.latestRuntimeControl.status} ·
                  {resourceHealth.latestRuntimeControl.runtimeState}
                </p>
              </div>
            {/if}
            <div class="grid gap-2 sm:grid-cols-3" data-resource-runtime-control-intent-picker>
              <CapabilityGate
                operationKey="resources.runtime.stop"
                resourceRefs={{ projectId: resource.projectId, resourceId: resource.id }}
              >
                {#snippet children({ disabled })}
                  <Button
                    type="button"
                    variant={selectedRuntimeControlOperation === "stop" ? "default" : "outline"}
                    class="h-auto justify-start px-3 py-3 text-left"
                    disabled={disabled || isResourceArchived || runtimeControlPending}
                    onclick={() => {
                      selectedRuntimeControlOperation = "stop";
                    }}
                  >
                    <Square class="size-4 shrink-0" />
                    <span class="min-w-0">
                      <span class="block font-medium">
                        {$t(i18nKeys.console.resources.runtimeControlStop)}
                      </span>
                    </span>
                  </Button>
                {/snippet}
              </CapabilityGate>
              <CapabilityGate
                operationKey="resources.runtime.start"
                resourceRefs={{ projectId: resource.projectId, resourceId: resource.id }}
              >
                {#snippet children({ disabled })}
                  <Button
                    type="button"
                    variant={selectedRuntimeControlOperation === "start" ? "default" : "outline"}
                    class="h-auto justify-start px-3 py-3 text-left"
                    disabled={disabled || isResourceArchived || runtimeControlPending}
                    onclick={() => {
                      selectedRuntimeControlOperation = "start";
                    }}
                  >
                    <Play class="size-4 shrink-0" />
                    <span class="min-w-0">
                      <span class="block font-medium">
                        {$t(i18nKeys.console.resources.runtimeControlStart)}
                      </span>
                    </span>
                  </Button>
                {/snippet}
              </CapabilityGate>
              <CapabilityGate
                operationKey="resources.runtime.restart"
                resourceRefs={{ projectId: resource.projectId, resourceId: resource.id }}
              >
                {#snippet children({ disabled })}
                  <Button
                    type="button"
                    variant={selectedRuntimeControlOperation === "restart" ? "default" : "outline"}
                    class="h-auto justify-start px-3 py-3 text-left"
                    disabled={disabled || isResourceArchived || runtimeControlPending}
                    onclick={() => {
                      selectedRuntimeControlOperation = "restart";
                    }}
                  >
                    <RotateCw class={["size-4 shrink-0", runtimeControlPending ? "animate-spin" : ""]} />
                    <span class="min-w-0">
                      <span class="block font-medium">
                        {$t(i18nKeys.console.resources.runtimeControlRestart)}
                      </span>
                    </span>
                  </Button>
                {/snippet}
              </CapabilityGate>
            </div>
            <Dialog.Footer class="px-0 pb-0">
              <Button type="button" variant="outline" onclick={closeRuntimeControlDialog}>
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button
                type="button"
                disabled={!selectedRuntimeControlOperation || runtimeControlPending}
                onclick={confirmSelectedRuntimeControl}
              >
                {#if selectedRuntimeControlOperation === "stop"}
                  <Square class="size-4" />
                  {$t(i18nKeys.console.resources.runtimeControlStop)}
                {:else if selectedRuntimeControlOperation === "start"}
                  <Play class="size-4" />
                  {$t(i18nKeys.console.resources.runtimeControlStart)}
                {:else}
                  <RotateCw class={["size-4", runtimeControlPending ? "animate-spin" : ""]} />
                  {$t(i18nKeys.console.resources.runtimeControlRestart)}
                {/if}
              </Button>
            </Dialog.Footer>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root bind:open={sourceLinkDialogOpen}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-3xl">
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.resources.sourceLinkTitle)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.resources.sourceLinkDescription)}
            </Dialog.Description>
          </Dialog.Header>

          <form
            class="space-y-5 px-5 pb-5"
            onsubmit={relinkSourceLink}
            data-resource-source-link-dialog
          >
            <section class="grid gap-4 rounded-md border bg-background p-4 sm:grid-cols-2">
              <label class="space-y-1.5 text-sm font-medium sm:col-span-2" for="resource-source-link-fingerprint">
                <span>{$t(i18nKeys.console.resources.sourceLinkFingerprint)}</span>
                <Input
                  id="resource-source-link-fingerprint"
                  bind:value={sourceLinkFingerprint}
                  autocomplete="off"
                  spellcheck={false}
                  placeholder="sha256:..."
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.console.resources.sourceLinkServer)}</span>
                <Select.Root bind:value={sourceLinkServerId} type="single">
                  <Select.Trigger class="w-full">
                    {servers.find((server) => server.id === sourceLinkServerId)?.name ??
                      sourceLinkServerId ??
                      "-"}
                  </Select.Trigger>
                  <Select.Content>
                    {#each servers as server (server.id)}
                      <Select.Item value={server.id}>{server.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium" for="resource-source-link-destination">
                <span>{$t(i18nKeys.console.resources.sourceLinkDestination)}</span>
                <Input
                  id="resource-source-link-destination"
                  bind:value={sourceLinkDestinationId}
                  autocomplete="off"
                  spellcheck={false}
                  placeholder={defaultDestinationId || "web"}
                />
              </label>
            </section>

            {#if sourceLinkFeedback?.kind === "error"}
              <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <p class="font-medium">{sourceLinkFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{sourceLinkFeedback.detail}</p>
              </div>
            {/if}

            <Dialog.Footer class="px-0 pb-0">
              <Button type="button" variant="outline" onclick={closeSourceLinkDialog}>
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button
                type="submit"
                disabled={!canRelinkSourceLink || relinkSourceLinkMutation.isPending}
              >
                <Link2 class="size-4" />
                {relinkSourceLinkMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.console.resources.sourceLinkRelink)}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root bind:open={previewEnvironmentCleanupDialogOpen}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.previewEnvironments.cleanupAction)}</Dialog.Title>
            <Dialog.Description>
              {#if selectedPreviewEnvironmentForCleanup}
                {$t(i18nKeys.console.previewEnvironments.cleanupConfirm, {
                  previewEnvironmentId: selectedPreviewEnvironmentForCleanup.previewEnvironmentId,
                })}
              {/if}
            </Dialog.Description>
          </Dialog.Header>
          <div class="space-y-5 px-5 pb-5" data-resource-preview-cleanup-dialog>
            {#if selectedPreviewEnvironmentForCleanup}
              <div class="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <p class="font-mono font-medium">
                  {selectedPreviewEnvironmentForCleanup.previewEnvironmentId}
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {selectedPreviewEnvironmentForCleanup.source.repositoryFullName}
                  #{selectedPreviewEnvironmentForCleanup.source.pullRequestNumber}
                </p>
              </div>
            {/if}
            <Dialog.Footer class="px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                onclick={() => {
                  previewEnvironmentCleanupDialogOpen = false;
                }}
              >
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={cleanupPreviewEnvironmentMutation.isPending}
                onclick={cleanupPreviewEnvironment}
              >
                <Trash2 class="size-4" />
                {$t(i18nKeys.console.previewEnvironments.cleanupAction)}
              </Button>
            </Dialog.Footer>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root bind:open={scheduledTaskCreateDialogOpen}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-4xl">
          <Dialog.Header>
            <Dialog.Title>
              {$t(i18nKeys.console.resources.scheduledTaskCreateTitle)}
            </Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.resources.scheduledTaskCreateDescription)}
            </Dialog.Description>
          </Dialog.Header>
          <form
            id="resource-scheduled-task-create-form"
            class="space-y-5 px-5 pb-5"
            onsubmit={createScheduledTask}
          >
            <div class="flex flex-wrap justify-end">
              <Badge variant="outline">
                {$t(i18nKeys.console.resources.scheduledTaskConcurrencyForbid)}
              </Badge>
            </div>

            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <label class="space-y-1.5 text-sm font-medium xl:col-span-2" for="scheduled-task-schedule">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.console.resources.scheduledTaskSchedule)}
                  <DocsHelpLink
                    href={webDocsHrefs.scheduledTaskLifecycle}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input
                  id="scheduled-task-schedule"
                  bind:value={scheduledTaskSchedule}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.resources.scheduledTaskSchedulePlaceholder)}
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium" for="scheduled-task-timezone">
                <span>{$t(i18nKeys.console.resources.scheduledTaskTimezone)}</span>
                <Input
                  id="scheduled-task-timezone"
                  bind:value={scheduledTaskTimezone}
                  autocomplete="off"
                  placeholder="UTC"
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium" for="scheduled-task-timeout">
                <span>{$t(i18nKeys.console.resources.scheduledTaskTimeoutSeconds)}</span>
                <Input
                  id="scheduled-task-timeout"
                  bind:value={scheduledTaskTimeoutSeconds}
                  autocomplete="off"
                  inputmode="numeric"
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium" for="scheduled-task-retry">
                <span>{$t(i18nKeys.console.resources.scheduledTaskRetryLimit)}</span>
                <Input
                  id="scheduled-task-retry"
                  bind:value={scheduledTaskRetryLimit}
                  autocomplete="off"
                  inputmode="numeric"
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.status)}</span>
                <Select.Root bind:value={scheduledTaskStatus} type="single">
                  <Select.Trigger class="w-full">
                    {scheduledTaskStatusLabel(scheduledTaskStatus)}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="enabled">
                      {$t(i18nKeys.console.resources.scheduledTaskStatusEnabled)}
                    </Select.Item>
                    <Select.Item value="disabled">
                      {$t(i18nKeys.console.resources.scheduledTaskStatusDisabled)}
                    </Select.Item>
                  </Select.Content>
                </Select.Root>
              </label>

              <label
                class="space-y-1.5 text-sm font-medium sm:col-span-2 xl:col-span-6"
                for="scheduled-task-command-intent"
              >
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.console.resources.scheduledTaskCommandIntent)}
                  <DocsHelpLink
                    href={webDocsHrefs.scheduledTaskLifecycle}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Textarea
                  id="scheduled-task-command-intent"
                  bind:value={scheduledTaskCommandIntent}
                  rows={3}
                  spellcheck={false}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.resources.scheduledTaskCommandIntentPlaceholder)}
                />
              </label>
            </div>

            {#if scheduledTaskFeedback}
              <div
                class={[
                  "rounded-md border px-3 py-2 text-sm",
                  scheduledTaskFeedback.kind === "success"
                    ? "border-primary/25 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5 text-destructive",
                ]}
              >
                <p class="font-medium">{scheduledTaskFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{scheduledTaskFeedback.detail}</p>
              </div>
            {/if}

            <div class="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onclick={() => {
                  scheduledTaskCreateDialogOpen = false;
                }}
              >
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button
                type="submit"
                disabled={!canCreateScheduledTask || createScheduledTaskMutation.isPending}
              >
                <Plus class="size-4" />
                {createScheduledTaskMutation.isPending
                  ? $t(i18nKeys.common.actions.creating)
                  : $t(i18nKeys.console.resources.scheduledTaskCreateAction)}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root bind:open={dependencyBindDialogOpen}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-3xl">
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.resources.dependencyBindTitle)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.resources.dependencyBindDescription)}
            </Dialog.Description>
          </Dialog.Header>

          <form
            class="space-y-5 px-5 pb-5"
            onsubmit={bindDependencyResource}
            data-resource-dependency-bind-dialog
          >
            <section class="grid gap-4 rounded-md border bg-background p-4 sm:grid-cols-2">
              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.console.resources.dependencySelect)}</span>
                <Select.Root bind:value={dependencyBindingResourceId} type="single">
                  <Select.Trigger class="w-full">
                    {selectedDependencyResource
                      ? dependencyResourceOptionLabel(selectedDependencyResource)
                      : $t(i18nKeys.console.resources.dependenciesEmpty)}
                  </Select.Trigger>
                  <Select.Content>
                    {#each bindableDependencyResources as dependency (dependency.id)}
                      <Select.Item value={dependency.id}>
                        {dependencyResourceOptionLabel(dependency)}
                      </Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium" for="resource-dependency-target-name">
                <span>{$t(i18nKeys.console.resources.dependencyTargetName)}</span>
                <Input
                  id="resource-dependency-target-name"
                  bind:value={dependencyBindingTargetName}
                  autocomplete="off"
                  placeholder="DATABASE_URL"
                />
              </label>
            </section>

            {#if selectedDependencyResource}
              <aside class="rounded-md border bg-muted/15 p-4 text-sm">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {dependencyResourceKindLabel(selectedDependencyResource.kind)}
                  </Badge>
                  <Badge variant="secondary">
                    {selectedDependencyResource.sourceMode}
                  </Badge>
                  <Badge
                    variant={selectedDependencyResource.bindingReadiness.status === "ready"
                      ? "default"
                      : "outline"}
                  >
                    {selectedDependencyResource.bindingReadiness.status}
                  </Badge>
                  <Badge variant="outline">
                    {$t(i18nKeys.console.resources.dependencyRuntimeBadge)}
                  </Badge>
                </div>
                <p class="mt-3 font-medium">{selectedDependencyResource.name}</p>
                <p class="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {selectedDependencyResource.id}
                </p>
              </aside>
            {:else}
              <div class="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                {$t(i18nKeys.console.resources.dependenciesEmpty)}
              </div>
            {/if}

            {#if dependencyFeedback}
              <div
                class={[
                  "rounded-md border px-3 py-2 text-sm",
                  dependencyFeedback.kind === "success"
                    ? "border-primary/25 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5 text-destructive",
                ]}
              >
                <p class="font-medium">{dependencyFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{dependencyFeedback.detail}</p>
              </div>
            {/if}

            <Dialog.Footer class="px-0 pb-0">
              <Button type="button" variant="outline" onclick={closeDependencyBindDialog}>
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button
                type="submit"
                disabled={!canBindDependencyResource || bindResourceDependencyMutation.isPending}
              >
                <Link2 class="size-4" />
                {bindResourceDependencyMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.console.resources.dependencyBindAction)}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root bind:open={scheduledTaskManageDialogOpen}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.resources.scheduledTaskRunManageTitle)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.resources.scheduledTaskRunManageDescription)}
            </Dialog.Description>
          </Dialog.Header>
          <div class="space-y-5 px-5 pb-5" data-resource-scheduled-task-manage-dialog>
            {#if selectedScheduledTaskForManage}
              {@const task = selectedScheduledTaskForManage}
              <div class="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-mono font-medium">{task.taskId}</p>
                  <Badge variant={task.status === "enabled" ? "default" : "outline"}>
                    {scheduledTaskStatusLabel(task.status)}
                  </Badge>
                </div>
                <p class="mt-2 break-all text-xs text-muted-foreground">
                  {task.commandIntent}
                </p>
                <p class="mt-1 font-mono text-xs text-muted-foreground">
                  {task.schedule} · {task.timezone}
                </p>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    task.status === "disabled" ||
                    runScheduledTaskNowMutation.isPending
                  }
                  onclick={() => runScheduledTaskNow(task)}
                >
                  <Play class="size-4" />
                  {$t(i18nKeys.console.resources.scheduledTaskRunNow)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={configureScheduledTaskMutation.isPending}
                  onclick={() => configureScheduledTaskStatus(task)}
                >
                  {task.status === "enabled"
                    ? $t(i18nKeys.console.resources.scheduledTaskDisable)
                    : $t(i18nKeys.console.resources.scheduledTaskEnable)}
                </Button>
              </div>
            {/if}
            <Dialog.Footer class="px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                onclick={() => {
                  scheduledTaskManageDialogOpen = false;
                }}
              >
                {$t(i18nKeys.common.actions.close)}
              </Button>
            </Dialog.Footer>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root bind:open={scheduledTaskDeleteDialogOpen}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.resources.scheduledTaskDelete)}</Dialog.Title>
            <Dialog.Description>
              {#if selectedScheduledTaskForDelete}
                {$t(i18nKeys.console.resources.scheduledTaskDeleteConfirm, {
                  taskId: selectedScheduledTaskForDelete.taskId,
                })}
              {/if}
            </Dialog.Description>
          </Dialog.Header>
          <div class="space-y-5 px-5 pb-5" data-resource-scheduled-task-delete-dialog>
            {#if selectedScheduledTaskForDelete}
              <div class="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <p class="font-mono font-medium">{selectedScheduledTaskForDelete.taskId}</p>
                <p class="mt-1 break-all text-xs text-muted-foreground">
                  {selectedScheduledTaskForDelete.commandIntent}
                </p>
              </div>
            {/if}
            <Dialog.Footer class="px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                onclick={() => {
                  scheduledTaskDeleteDialogOpen = false;
                }}
              >
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteScheduledTaskMutation.isPending}
                onclick={deleteScheduledTask}
              >
                <Trash2 class="size-4" />
                {$t(i18nKeys.console.resources.scheduledTaskDelete)}
              </Button>
            </Dialog.Footer>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root bind:open={resourceLifecycleDialogOpen} onOpenChange={(open) => {
        if (!open) {
          closeResourceLifecycleDialog();
        } else {
          resourceLifecycleDialogOpen = true;
        }
      }}>
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-2xl">
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.resources.lifecycleDialogTitle)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.resources.lifecycleDialogDescription)}
            </Dialog.Description>
          </Dialog.Header>
          <form
            class="box-border min-w-0 w-full space-y-5 overflow-x-hidden px-5 pb-5"
            onsubmit={(event) => {
              event.preventDefault();
              if (selectedResourceLifecycleAction === "archive") {
                archiveResource();
              } else if (isPreviewEnvironmentResource) {
                deletePreviewResource();
              } else {
                deleteResource();
              }
            }}
            data-resource-lifecycle-dialog
          >
            <div class="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <p class="font-medium">{resource.name}</p>
              <p class="mt-1 break-all font-mono text-xs text-muted-foreground">{resource.slug}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {$t(i18nKeys.console.resources.lifecycleStatus)} · {isResourceArchived
                  ? $t(i18nKeys.console.resources.archived)
                  : $t(i18nKeys.common.status.active)}
              </p>
            </div>

            <div class="grid min-w-0 gap-2 sm:grid-cols-2">
              {#if !isPreviewEnvironmentResource}
                <Button
                  type="button"
                  variant={selectedResourceLifecycleAction === "archive" ? "destructive" : "outline"}
                  class="h-auto min-w-0 w-full max-w-full items-start justify-start whitespace-normal px-3 py-3 text-left"
                  disabled={isResourceArchived || archiveResourceMutation.isPending}
                  onclick={() => selectResourceLifecycleAction("archive")}
                >
                  <Archive class="mt-0.5 size-4 shrink-0" />
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium">
                      {$t(i18nKeys.console.resources.archiveAction)}
                    </span>
                    <span class="block break-words text-xs font-normal leading-snug opacity-80">
                      {$t(i18nKeys.console.resources.lifecycleArchiveOption)}
                    </span>
                  </span>
                </Button>
              {/if}
              <Button
                type="button"
                variant={selectedResourceLifecycleAction === "delete" ? "destructive" : "outline"}
                class="h-auto min-w-0 w-full max-w-full items-start justify-start whitespace-normal px-3 py-3 text-left"
                disabled={!isPreviewEnvironmentResource &&
                  (!isResourceArchived || deleteResourceMutation.isPending)}
                onclick={() => selectResourceLifecycleAction("delete")}
              >
                <Trash2 class="mt-0.5 size-4 shrink-0" />
                <span class="min-w-0 flex-1">
                  <span class="block font-medium">
                    {$t(i18nKeys.console.resources.deleteAction)}
                  </span>
                  <span class="block break-words text-xs font-normal leading-snug opacity-80">
                    {#if isPreviewEnvironmentResource}
                      {$t(i18nKeys.console.resources.lifecyclePreviewDeleteOption)}
                    {:else}
                      {$t(i18nKeys.console.resources.lifecycleDeleteOption)}
                    {/if}
                  </span>
                </span>
              </Button>
            </div>

            {#if selectedResourceLifecycleAction === "delete"}
              <label class="space-y-1.5 text-sm font-medium" for="resource-delete-confirmation">
                <span>{$t(i18nKeys.console.resources.deleteConfirmPrompt)}</span>
                <Input
                  id="resource-delete-confirmation"
                  bind:value={resourceDeleteConfirmation}
                  autocomplete="off"
                  placeholder={resource.slug}
                />
              </label>
            {/if}

            {#if archiveFeedback?.kind === "error"}
              <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <p class="font-medium">{archiveFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{archiveFeedback.detail}</p>
              </div>
            {/if}
            {#if deleteFeedback?.kind === "error"}
              <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <p class="font-medium">{deleteFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{deleteFeedback.detail}</p>
              </div>
            {/if}

            <Dialog.Footer class="px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                onclick={closeResourceLifecycleDialog}
              >
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button
                type="submit"
                variant={selectedResourceLifecycleAction === "archive" ||
                  selectedResourceLifecycleAction === "delete"
                  ? "destructive"
                  : "default"}
                disabled={!selectedResourceLifecycleAction ||
                  (selectedResourceLifecycleAction === "archive" &&
                    (isResourceArchived || archiveResourceMutation.isPending)) ||
                  (selectedResourceLifecycleAction === "delete" &&
                    (resourceDeleteConfirmation.trim() !== resource.slug ||
                      (!isPreviewEnvironmentResource && !isResourceArchived) ||
                      deleteResourceMutation.isPending ||
                      deletePreviewResourceMutation.isPending))}
              >
                {#if selectedResourceLifecycleAction === "archive"}
                  <Archive class="size-4" />
                  {archiveResourceMutation.isPending
                    ? $t(i18nKeys.common.actions.saving)
                    : $t(i18nKeys.console.resources.archiveAction)}
                {:else if selectedResourceLifecycleAction === "delete"}
                  <Trash2 class="size-4" />
                  {deleteResourceMutation.isPending || deletePreviewResourceMutation.isPending
                    ? $t(i18nKeys.common.actions.saving)
                    : $t(i18nKeys.console.resources.deleteAction)}
                {:else}
                  <Archive class="size-4" />
                  {$t(i18nKeys.console.resources.lifecycleManageAction)}
                {/if}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  {/if}
</ConsoleShell>

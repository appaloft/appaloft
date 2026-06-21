<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import {
    Archive,
    ArrowLeft,
    ArrowRight,
    ChevronDown,
    Copy,
    Eye,
    ExternalLink,
    FolderOpen,
    Gauge,
    GitBranch,
    GitPullRequestArrow,
    Lock,
    Pencil,
    Play,
    Plus,
    RotateCcw,
    Save,
    Search,
    Server,
    ShieldCheck,
    Trash2,
    Unlock,
  } from "@lucide/svelte";
  import type {
    ArchiveEnvironmentInput,
    ArchiveProjectInput,
    CheckProjectDeleteSafetyResponse,
    CloneEnvironmentInput,
    CreateDeploymentInput,
    DeleteProjectInput,
    DeploymentPlanResponse,
    DeploymentProgressEvent,
    LockEnvironmentInput,
    PreviewEnvironmentStatus,
    RenameEnvironmentInput,
    RenameProjectInput,
    RestoreProjectInput,
    RuntimeMonitoringRollupResponse,
    UnlockEnvironmentInput,
    EnvironmentSummary,
    OperatorWorkItem,
    ResourceSummary,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import { capabilities, capabilityKey, type CapabilityQuery } from "$lib/capabilities";
  import CapabilityGate from "$lib/components/console/CapabilityGate.svelte";
  import ConsoleDetailSubnav from "$lib/components/console/ConsoleDetailSubnav.svelte";
  import ConsoleDetailTabs from "$lib/components/console/ConsoleDetailTabs.svelte";
  import ConsoleExtensionPanelHost from "$lib/components/console/ConsoleExtensionPanelHost.svelte";
  import DeploymentProgressDialog from "$lib/components/console/DeploymentProgressDialog.svelte";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import DeploymentStatusBadge from "$lib/components/console/DeploymentStatusBadge.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import EnvironmentCreateForm from "$lib/components/console/EnvironmentCreateForm.svelte";
  import QuickDeploySheet from "$lib/components/console/QuickDeploySheet.svelte";
  import ResourceListTable from "$lib/components/console/ResourceListTable.svelte";
  import type { DomainBindingVerificationFeedback } from "$lib/components/console/DomainBindingVerifyDnsButton.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
  import {
    createDeploymentWithProgress,
    type DeploymentProgressDialogStatus,
  } from "$lib/console/deployment-progress";
  import { selectCurrentResourceAccessRoute } from "$lib/console/resource-access-route";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import {
    detailBodyClass,
    detailHeaderClass,
    detailPageClass,
    detailSubnavContentClass,
    detailSubnavLayoutClass,
    detailTabPanelSubnavClass,
    detailTabPanelScrollClass,
  } from "$lib/console/layout-classes";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";
  import { createConsoleQueries } from "$lib/console/queries";
  import { runtimeMonitoringRollupQueryOptions } from "$lib/console/runtime-usage-query";
  import {
    formatRuntimeMonitoringPercent,
    latestRuntimeMonitoringRollupValue,
    runtimeMonitoringRollupSummary,
    runtimeMonitoringTopContributorItems,
    type RuntimeMonitoringSignalKey,
  } from "$lib/console/runtime-usage";
  import {
    deploymentDetailHref,
    findEnvironment,
    findProject,
    findResource,
    findServer,
    formatTime,
    hrefWithSearchParams,
    latestResourceDeployment,
    previewEnvironmentDetailHref,
    projectDetailHref,
    resourceDetailHref,
    resourcePreviewEnvironmentDetailHref,
  } from "$lib/console/utils";
  import { operatorWorkReadableFailure } from "$lib/console/blueprint-install-progress";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type ProjectDetailTab =
    | "overview"
    | "resources"
    | "deployments"
    | "environments"
    | "previews"
    | "activity"
    | "settings";
  type ProjectSettingsSection = "general" | "danger";
  const projectDetailTabs = [
    "overview",
    "resources",
    "deployments",
    "environments",
    "previews",
    "activity",
    "settings",
  ] as const;
  const projectSettingsSections = ["general", "danger"] as const;
  type ProjectAttentionItem = {
    key: string;
    kind:
      | "failed-deployment"
      | "running-deployment"
      | "operator-work"
      | "missing-access"
      | "no-deployment";
    title: string;
    detail: string;
    href?: string;
    action: string;
    intent?: "resource-create-deployment" | "operator-work-refresh";
    resourceId?: string;
    tone: "destructive" | "warning" | "neutral";
  };
  type ProjectNextAction = {
    label: string;
    href?: string;
    intent?: "project-quick-deploy" | "resource-create-deployment";
    resourceId?: string;
  };
  type QuickDeployModalTarget = {
    resource?: ResourceSummary;
  };
  type ProjectLifecycleAction = "archive" | "restore" | "delete";
  type EnvironmentLifecycleAction = "archive" | "lock" | "unlock";
  type ProjectDeleteBlocker = CheckProjectDeleteSafetyResponse["blockers"][number];

  const {
    projectsQuery,
    serversQuery,
    environmentsQuery,
    resourcesQuery,
    deploymentsQuery,
    domainBindingsQuery,
  } =
    createConsoleQueries(browser, {
      health: false,
      readiness: false,
      version: false,
      previewEnvironments: false,
      certificates: false,
      providers: false,
    });

  const projectId = $derived(page.params.projectId ?? "");
  const activeProjectTab = $derived(parseProjectDetailTab(page.url.searchParams.get("tab")));
  const activeProjectSettingsSection = $derived(
    parseProjectSettingsSection(page.url.searchParams.get("section")),
  );
  const projectDetailTabItems = $derived(
    projectDetailTabs.map((tab) => ({
      id: tab,
      label: projectTabLabel(tab),
      href: projectTabHref(tab),
      active: activeProjectTab === tab,
      onSelect: (event: MouseEvent) => selectProjectTab(tab, event),
    })),
  );
  const projectSettingsSubnavItems = $derived(
    projectSettingsSections.map((section) => ({
      id: section,
      label: projectSettingsSectionLabel(section),
      href: projectSettingsSectionHref(section),
      active: activeProjectSettingsSection === section,
      onSelect: (event: MouseEvent) => selectProjectSettingsSection(section, event),
    })),
  );
  let projectLifecycleDialogOpen = $state(false);
  const projectDetailQuery = createQuery(() =>
    orpc.projects.show.queryOptions({
      input: { projectId },
      enabled: browser && projectId.length > 0,
      staleTime: 5_000,
    }),
  );
  const projectPreviewEnvironmentsQuery = createQuery(() =>
    orpc.previewEnvironments.list.queryOptions({
      input: {
        projectId,
        limit: 50,
      },
      enabled: browser && projectId.length > 0 && activeProjectTab === "previews",
      staleTime: 5_000,
    }),
  );
  const projectPreviewResourcesQuery = createQuery(() =>
    orpc.resources.list.queryOptions({
      input: {
        projectId,
        includePreviewResources: true,
        limit: 100,
      },
      enabled: browser && projectId.length > 0 && activeProjectTab === "previews",
      staleTime: 5_000,
    }),
  );
  const projectOperatorWorkQuery = createQuery(() =>
    orpc.operatorWork.list.queryOptions({
      input: {
        projectId,
        limit: 25,
      },
      enabled: browser && projectId.length > 0,
      staleTime: 2_000,
      refetchInterval: 5_000,
    }),
  );
  const projects = $derived(projectsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const domainBindings = $derived(domainBindingsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      domainBindingsQuery.isPending ||
      deploymentsQuery.isPending ||
      projectDetailQuery.isPending,
  );
  const project = $derived(projectDetailQuery.data ?? findProject(projects, projectId));
  const projectHeaderLoading = $derived(projectDetailQuery.isPending && !project);
  const projectHeaderSwitchItems = $derived(
    projects.map((projectItem) => ({
      label: projectItem.name,
      href: projectDetailHrefWithActiveSearch(projectItem.id),
      selected: projectItem.id === projectId,
    })),
  );
  const isProjectArchived = $derived(project?.lifecycleStatus === "archived");
  const projectDeleteSafetyQuery = createQuery(() =>
    orpc.projects.deleteCheck.queryOptions({
      input: { projectId },
      enabled: browser && isProjectArchived && projectId.length > 0 && projectDetailQuery.isSuccess,
      staleTime: 5_000,
    }),
  );
  const projectDeleteSafety = $derived(projectDeleteSafetyQuery.data ?? null);
  const projectDeleteBlockers = $derived<ProjectDeleteBlocker[]>(projectDeleteSafety?.blockers ?? []);
  const projectDeleteBlockerCount = $derived(projectDeleteBlockers.length);
  const projectDeleteSafetyLoading = $derived(
    isProjectArchived && projectDeleteSafetyQuery.isPending,
  );
  const canDeleteProject = $derived(
    Boolean(project) &&
      isProjectArchived &&
      projectDeleteSafety?.eligible === true &&
      !projectDeleteSafetyQuery.isPending,
  );
  const projectCapabilityQueries = $derived<CapabilityQuery[]>(
    project
      ? [
          { operationKey: "projects.rename", resourceRefs: { projectId: project.id } },
          { operationKey: "projects.archive", resourceRefs: { projectId: project.id } },
          { operationKey: "projects.restore", resourceRefs: { projectId: project.id } },
          { operationKey: "projects.delete", resourceRefs: { projectId: project.id } },
          { operationKey: "resources.create", resourceRefs: { projectId: project.id } },
        ]
      : [],
  );
  const projectCapabilityLoadKey = $derived(projectCapabilityQueries.map(capabilityKey).join("\n"));
  const projectRenameCapabilityKey = $derived(
    project ? capabilityKey({ operationKey: "projects.rename", resourceRefs: { projectId: project.id } }) : "",
  );
  const projectArchiveCapabilityKey = $derived(
    project ? capabilityKey({ operationKey: "projects.archive", resourceRefs: { projectId: project.id } }) : "",
  );
  const projectRestoreCapabilityKey = $derived(
    project ? capabilityKey({ operationKey: "projects.restore", resourceRefs: { projectId: project.id } }) : "",
  );
  const projectDeleteCapabilityKey = $derived(
    project ? capabilityKey({ operationKey: "projects.delete", resourceRefs: { projectId: project.id } }) : "",
  );
  const canRenameProjectByCapability = $derived(
    projectRenameCapabilityKey
      ? $capabilities.capabilities[projectRenameCapabilityKey]?.allowed === true
      : false,
  );
  const canArchiveProjectByCapability = $derived(
    projectArchiveCapabilityKey
      ? $capabilities.capabilities[projectArchiveCapabilityKey]?.allowed === true
      : false,
  );
  const canRestoreProjectByCapability = $derived(
    projectRestoreCapabilityKey
      ? $capabilities.capabilities[projectRestoreCapabilityKey]?.allowed === true
      : false,
  );
  const canDeleteProjectByCapability = $derived(
    projectDeleteCapabilityKey
      ? $capabilities.capabilities[projectDeleteCapabilityKey]?.allowed === true
      : false,
  );
  const projectEnvironments = $derived(
    project ? environments.filter((environment) => environment.projectId === project.id) : [],
  );
  let selectedMonitoringEnvironmentId = $state("");
  $effect(() => {
    if (projectEnvironments.length === 0) {
      selectedMonitoringEnvironmentId = "";
      return;
    }

    if (
      !selectedMonitoringEnvironmentId ||
      !projectEnvironments.some((environment) => environment.id === selectedMonitoringEnvironmentId)
    ) {
      selectedMonitoringEnvironmentId = projectEnvironments[0]?.id ?? "";
    }
  });
  const projectResources = $derived(
    project ? resources.filter((resource) => resource.projectId === project.id) : [],
  );
  const projectArchivedResources = $derived(
    projectResources.filter((resource) => resource.lifecycleStatus === "archived"),
  );
  const projectDomainBindings = $derived(
    project ? domainBindings.filter((binding) => binding.projectId === project.id) : [],
  );
  const projectPreviewEnvironments = $derived(projectPreviewEnvironmentsQuery.data?.items ?? []);
  const projectPreviewEnvironmentIds = $derived(
    new Set([
      ...projectEnvironments
        .filter((environment) => environment.kind === "preview")
        .map((environment) => environment.id),
      ...projectPreviewEnvironments.map((previewEnvironment) => previewEnvironment.environmentId),
    ]),
  );
  const projectPreviewResources = $derived(
    (projectPreviewResourcesQuery.data?.items ?? []).filter((resource) =>
      projectPreviewEnvironmentIds.has(resource.environmentId),
    ),
  );
  const projectDeployments = $derived(
    project ? deployments.filter((deployment) => deployment.projectId === project.id) : [],
  );
  const latestProjectDeploymentSummary = $derived(projectDeployments[0] ?? null);
  const failedProjectDeployments = $derived(
    projectDeployments.filter((deployment) => deployment.status === "failed"),
  );
  const runningProjectDeployments = $derived(
    projectDeployments.filter((deployment) =>
      ["created", "planning", "planned", "running", "cancel-requested"].includes(deployment.status),
    ),
  );
  const projectOperatorWorkItems = $derived(projectOperatorWorkQuery.data?.items ?? []);
  const activeProjectOperatorWorkItems = $derived(
    projectOperatorWorkItems.filter(
      (item) =>
        item.kind === "blueprint-install" &&
        (item.status === "running" ||
          item.status === "pending" ||
          item.status === "retry-scheduled"),
    ),
  );
  const projectRuntimeMonitoringScope = $derived({
    kind: "project" as const,
    projectId,
  });
  const environmentRuntimeMonitoringScope = $derived({
    kind: "environment" as const,
    environmentId: selectedMonitoringEnvironmentId,
  });
  const projectRuntimeMonitoringRollupQuery = createQuery(() =>
    runtimeMonitoringRollupQueryOptions(
      projectRuntimeMonitoringScope,
      browser && projectId.length > 0,
    ),
  );
  const environmentRuntimeMonitoringRollupQuery = createQuery(() =>
    runtimeMonitoringRollupQueryOptions(
      environmentRuntimeMonitoringScope,
      browser && selectedMonitoringEnvironmentId.length > 0,
    ),
  );
  const projectRuntimeMonitoringRollup = $derived(projectRuntimeMonitoringRollupQuery.data ?? null);
  const environmentRuntimeMonitoringRollup = $derived(
    environmentRuntimeMonitoringRollupQuery.data ?? null,
  );
  const projectMonitoringRollupSummary = $derived(
    runtimeMonitoringRollupSummary(projectRuntimeMonitoringRollup),
  );
  const environmentMonitoringRollupSummary = $derived(
    runtimeMonitoringRollupSummary(environmentRuntimeMonitoringRollup),
  );
  const projectMonitoringTopContributors = $derived(
    runtimeMonitoringTopContributorItems(projectRuntimeMonitoringRollup),
  );
  const environmentMonitoringTopContributors = $derived(
    runtimeMonitoringTopContributorItems(environmentRuntimeMonitoringRollup),
  );
  const projectAccessRoutes = $derived.by(() =>
    projectResources.flatMap((resource) => {
      const currentAccessRoute = selectCurrentResourceAccessRoute(resource.accessSummary);
      if (!currentAccessRoute) {
        return [];
      }

      return [
        {
          resourceId: resource.id,
          resourceName: resource.name,
          kind: currentAccessRoute.kind,
          hostname: currentAccessRoute.route.hostname,
          pathPrefix: currentAccessRoute.route.pathPrefix,
          scheme: currentAccessRoute.route.scheme,
          url: currentAccessRoute.route.url,
        },
      ];
    }),
  );
  const resourcesWithoutAccess = $derived.by(() =>
    projectResources.filter((resource) => !selectCurrentResourceAccessRoute(resource.accessSummary)),
  );
  const deployedProjectResources = $derived.by(() =>
    projectResources.filter((resource) => resource.deploymentCount > 0 || resource.lastDeploymentId),
  );
  const undeployedProjectResources = $derived.by(() =>
    projectResources.filter((resource) => !resource.deploymentCount && !resource.lastDeploymentId),
  );
  const projectResourceGroups = $derived.by(() =>
    projectEnvironments.map((environment) => ({
      environment,
      resources: projectResources.filter((resource) => resource.environmentId === environment.id),
    })),
  );
  const nonEmptyProjectResourceGroups = $derived(
    projectResourceGroups.filter((group) => group.resources.length > 0),
  );
  const projectResourcesWithoutKnownEnvironment = $derived.by(() =>
    projectResources.filter(
      (resource) =>
        !projectEnvironments.some((environment) => environment.id === resource.environmentId),
    ),
  );
  const primaryResource = $derived(projectResources[0] ?? null);
  const latestDeploymentResource = $derived(
    latestProjectDeploymentSummary
      ? findResource(projectResources, latestProjectDeploymentSummary.resourceId)
      : null,
  );
  const latestDeploymentEnvironment = $derived(
    latestProjectDeploymentSummary
      ? findEnvironment(projectEnvironments, latestProjectDeploymentSummary.environmentId)
      : null,
  );
  const projectAttentionItems = $derived.by<ProjectAttentionItem[]>(() => {
    const items: ProjectAttentionItem[] = [];
    for (const work of activeProjectOperatorWorkItems.slice(0, 2)) {
      const readableFailure = operatorWorkReadableFailure(work);
      items.push({
        key: `operator-work-${work.id}`,
        kind: "operator-work",
        title:
          work.status === "failed" || work.status === "dead-lettered"
            ? readableFailure.title
            : $t(i18nKeys.console.projects.attentionRunningOperatorWorkTitle),
        detail: operatorWorkAttentionDetail(work),
        action: $t(i18nKeys.console.projects.attentionOperatorWorkRefreshAction),
        intent: "operator-work-refresh",
        tone: work.status === "failed" || work.status === "dead-lettered" ? "destructive" : "warning",
      });
    }

    for (const deployment of failedProjectDeployments.slice(0, 2)) {
      if (items.length >= 3) break;
      const resource = findResource(projectResources, deployment.resourceId);
      items.push({
        key: `failed-deployment-${deployment.id}`,
        kind: "failed-deployment",
        title: $t(i18nKeys.console.projects.attentionFailedDeploymentTitle),
        detail: `${resource?.name ?? deployment.resourceId} · ${formatTime(deployment.createdAt)}`,
        href: deploymentDetailHref(deployment),
        action: $t(i18nKeys.common.actions.openDeployments),
        tone: "destructive",
      });
    }

    for (const deployment of runningProjectDeployments.slice(0, Math.max(0, 3 - items.length))) {
      const resource = findResource(projectResources, deployment.resourceId);
      items.push({
        key: `running-deployment-${deployment.id}`,
        kind: "running-deployment",
        title: $t(i18nKeys.console.projects.attentionRunningDeploymentTitle),
        detail: `${resource?.name ?? deployment.resourceId} · ${deployment.status}`,
        href: deploymentDetailHref(deployment),
        action: $t(i18nKeys.common.actions.openDeployments),
        tone: "warning",
      });
    }

    if (items.length < 3 && projectResources.length > 0 && projectAccessRoutes.length === 0) {
      const resource = primaryResource;
      if (resource) {
        items.push({
          key: `missing-access-${resource.id}`,
          kind: "missing-access",
          title: $t(i18nKeys.console.projects.attentionNoAccessTitle),
          detail: $t(i18nKeys.console.projects.attentionNoAccessDetail),
          href: `${resourceDetailHref(resource)}?tab=networking&section=domains`,
          action: $t(i18nKeys.console.projects.manageAccessAction),
          tone: "neutral",
        });
      }
    }

    if (items.length < 3 && projectResources.length > 0 && projectDeployments.length === 0) {
      const resource = primaryResource;
      if (resource) {
        items.push({
          key: `no-deployment-${resource.id}`,
          kind: "no-deployment",
          title: $t(i18nKeys.console.projects.attentionNoDeploymentTitle),
          detail: $t(i18nKeys.console.projects.attentionNoDeploymentDetail),
          action: $t(i18nKeys.common.actions.createDeployment),
          intent: "resource-create-deployment",
          resourceId: resource.id,
          tone: "neutral",
        });
      }
    }

    return items;
  });
  const projectNextAction = $derived.by<ProjectNextAction>(() => {
    if (failedProjectDeployments[0]) {
      return {
        label: $t(i18nKeys.console.projects.openFailedDeploymentAction),
        href: deploymentDetailHref(failedProjectDeployments[0]),
      };
    }
    if (runningProjectDeployments[0]) {
      return {
        label: $t(i18nKeys.console.projects.openRunningDeploymentAction),
        href: deploymentDetailHref(runningProjectDeployments[0]),
      };
    }
    if (!primaryResource) {
      return {
        label: $t(i18nKeys.console.projects.addResourceAction),
        intent: "project-quick-deploy",
      };
    }
    if (projectDeployments.length === 0) {
      return {
        label: $t(i18nKeys.common.actions.createDeployment),
        intent: "resource-create-deployment",
        resourceId: primaryResource.id,
      };
    }
    if (projectAccessRoutes.length === 0) {
      return {
        label: $t(i18nKeys.console.projects.manageAccessAction),
        href: `${resourceDetailHref(primaryResource)}?tab=networking&section=domains`,
      };
    }
    return {
      label: $t(i18nKeys.common.actions.openResource),
      href: resourceDetailHref(primaryResource),
    };
  });
  const selectedMonitoringEnvironment = $derived(
    projectEnvironments.find((environment) => environment.id === selectedMonitoringEnvironmentId) ??
      null,
  );
  let lifecycleFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let projectFormProjectId = $state("");
  let projectName = $state("");
  let quickDeployDialogOpen = $state(false);
  let quickDeployProgressDialogOpen = $state(false);
  let projectResourceDeploymentDialogOpen = $state(false);
  let selectedProjectResourceDeploymentId = $state("");
  let projectResourceDeploymentServerId = $state("");
  let projectResourceDeploymentDestinationId = $state("");
  let projectResourceDeploymentCreatePending = $state(false);
  let projectResourceDeploymentProgressDialogOpen = $state(false);
  let projectResourceDeploymentProgressDialogStatus =
    $state<DeploymentProgressDialogStatus>("idle");
  let projectResourceDeploymentProgressEvents = $state<DeploymentProgressEvent[]>([]);
  let projectResourceDeploymentProgressStreamError = $state("");
  let projectResourceDeploymentProgressDeploymentId = $state("");
  let projectResourceDeploymentProgressRequestId = $state("");
  let projectResourceDeploymentProgressTraceLink = $state("");
  let projectResourceDeploymentPlanPending = $state(false);
  let projectResourceDeploymentPlanPreview = $state<DeploymentPlanResponse | null>(null);
  let projectResourceDeploymentPlanError = $state("");
  let projectResourceDeploymentFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let domainBindingFeedback = $state<DomainBindingVerificationFeedback | null>(null);
  let projectRenameDialogOpen = $state(false);
  let environmentCreateDialogOpen = $state(false);
  let environmentRenameDialogOpen = $state(false);
  let environmentCloneDialogOpen = $state(false);
  let environmentLifecycleDialogOpen = $state(false);
  let selectedEnvironmentId = $state("");
  let selectedEnvironmentLifecycleAction = $state<EnvironmentLifecycleAction | null>(null);
  let selectedProjectLifecycleAction = $state<ProjectLifecycleAction | null>(null);
  let projectDeleteConfirmation = $state("");
  let resourceFilterQuery = $state("");
  let resourceEnvironmentFilter = $state("all");
  const selectedResourceEnvironmentFilterLabel = $derived(
    resourceEnvironmentFilter === "all"
      ? $t(i18nKeys.console.projects.allEnvironments)
      : findEnvironment(projectEnvironments, resourceEnvironmentFilter)?.name ??
          $t(i18nKeys.console.projects.allEnvironments),
  );
  let cloneEnvironmentNames = $state<Record<string, string>>({});
  let renameEnvironmentNames = $state<Record<string, string>>({});
  const filteredProjectResources = $derived(
    projectResources.filter((resource) => {
      const query = resourceFilterQuery.trim().toLowerCase();
      const matchesQuery =
        !query ||
        resource.name.toLowerCase().includes(query) ||
        resource.slug.toLowerCase().includes(query) ||
        resource.kind.toLowerCase().includes(query) ||
        (resource.description?.toLowerCase().includes(query) ?? false);
      const matchesEnvironment =
        resourceEnvironmentFilter === "all" || resource.environmentId === resourceEnvironmentFilter;

      return matchesQuery && matchesEnvironment;
    }),
  );
  const selectedEnvironment = $derived(
    projectEnvironments.find((environment) => environment.id === selectedEnvironmentId) ?? null,
  );
  const selectedProjectResourceDeployment = $derived(
    projectResources.find((resource) => resource.id === selectedProjectResourceDeploymentId) ?? null,
  );
  const selectedProjectResourceDeploymentEnvironment = $derived(
    selectedProjectResourceDeployment
      ? findEnvironment(projectEnvironments, selectedProjectResourceDeployment.environmentId)
      : null,
  );
  const selectedProjectResourceLatestDeployment = $derived(
    selectedProjectResourceDeployment
      ? latestResourceDeployment(selectedProjectResourceDeployment, projectDeployments)
      : null,
  );
  const selectedProjectResourceDeploymentServer = $derived(
    findServer(servers, projectResourceDeploymentServerId),
  );
  const selectedProjectResourceDeploymentSource = $derived(
    selectedProjectResourceLatestDeployment?.runtimePlan.source ?? null,
  );
  const canCreateProjectResourceDeployment = $derived(
    Boolean(selectedProjectResourceDeployment && projectResourceDeploymentServerId) &&
      !isProjectArchived &&
      !projectResourceDeploymentCreatePending,
  );
  const canPreviewProjectResourceDeploymentPlan = $derived(
    Boolean(selectedProjectResourceDeployment && projectResourceDeploymentServerId) &&
      !isProjectArchived &&
      !projectResourceDeploymentPlanPending,
  );
  const canRenameProject = $derived(
    Boolean(project) &&
      canRenameProjectByCapability &&
      !isProjectArchived &&
      projectName.trim().length > 0 &&
      projectName.trim() !== project?.name,
  );
  const canRenameSelectedEnvironment = $derived(
    Boolean(selectedEnvironment) &&
      selectedEnvironment?.lifecycleStatus === "active" &&
      !isProjectArchived &&
      renameEnvironmentName(selectedEnvironment?.id ?? "", selectedEnvironment?.name ?? "")
        .trim()
        .length > 0 &&
      renameEnvironmentName(selectedEnvironment?.id ?? "", selectedEnvironment?.name ?? "")
        .trim() !== selectedEnvironment?.name,
  );
  const canCloneSelectedEnvironment = $derived(
    Boolean(selectedEnvironment) &&
      selectedEnvironment?.lifecycleStatus === "active" &&
      !isProjectArchived &&
      cloneEnvironmentName(selectedEnvironment?.id ?? "").trim().length > 0,
  );
  const canSubmitProjectLifecycleAction = $derived.by(() => {
    if (!project || !selectedProjectLifecycleAction) {
      return false;
    }

    switch (selectedProjectLifecycleAction) {
      case "archive":
        return (
          !isProjectArchived &&
          canArchiveProjectByCapability &&
          !archiveProjectMutation.isPending
        );
      case "restore":
        return (
          isProjectArchived &&
          canRestoreProjectByCapability &&
          !restoreProjectMutation.isPending
        );
      case "delete":
        return (
          canDeleteProject &&
          canDeleteProjectByCapability &&
          projectDeleteConfirmation.trim() === project.id &&
          !deleteProjectMutation.isPending
        );
    }
  });
  const canSubmitEnvironmentLifecycleAction = $derived.by(() => {
    if (!project || !selectedEnvironment || !selectedEnvironmentLifecycleAction) {
      return false;
    }

    switch (selectedEnvironmentLifecycleAction) {
      case "archive":
        return (
          selectedEnvironment.lifecycleStatus !== "archived" &&
          !archiveEnvironmentMutation.isPending
        );
      case "lock":
        return (
          !isProjectArchived &&
          selectedEnvironment.lifecycleStatus === "active" &&
          !lockEnvironmentMutation.isPending
        );
      case "unlock":
        return (
          !isProjectArchived &&
          selectedEnvironment.lifecycleStatus === "locked" &&
          !unlockEnvironmentMutation.isPending
        );
    }
  });

  function invalidateProjectQueries(): void {
    void queryClient.invalidateQueries({ queryKey: orpc.projects.key({ type: "query" }) });
  }

  function invalidateEnvironmentAndProjectQueries(): void {
    void queryClient.invalidateQueries({ queryKey: orpc.environments.key({ type: "query" }) });
    invalidateProjectQueries();
  }

  const renameProjectMutation = createMutation(() => ({
    mutationFn: (input: RenameProjectInput) => orpcClient.projects.rename(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.renameSucceeded),
        detail: result.id,
      };
      invalidateProjectQueries();
      projectRenameDialogOpen = false;
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.renameFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const archiveProjectMutation = createMutation(() => ({
    mutationFn: (input: ArchiveProjectInput) => orpcClient.projects.archive(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.archiveSucceeded),
        detail: result.id,
      };
      invalidateProjectQueries();
      setProjectLifecycleDialogOpen(false);
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.archiveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const restoreProjectMutation = createMutation(() => ({
    mutationFn: (input: RestoreProjectInput) => orpcClient.projects.restore(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.restoreSucceeded),
        detail: result.id,
      };
      invalidateProjectQueries();
      setProjectLifecycleDialogOpen(false);
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.restoreFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  let loadedProjectCapabilityLoadKey = $state("");
  const deleteProjectMutation = createMutation(() => ({
    mutationFn: (input: DeleteProjectInput) => orpcClient.projects.delete(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.deleteSucceeded),
        detail: result.id,
      };
      invalidateProjectQueries();
      setProjectLifecycleDialogOpen(false);
      window.location.href = "/projects";
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.deleteFailed),
        detail: readErrorMessage(error),
      };
      invalidateProjectQueries();
    },
  }));
  const archiveEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: ArchiveEnvironmentInput) => orpcClient.environments.archive(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.environmentArchiveSucceeded),
        detail: result.id,
      };
      invalidateEnvironmentAndProjectQueries();
      setEnvironmentLifecycleDialogOpen(false);
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentArchiveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const cloneEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: CloneEnvironmentInput) => orpcClient.environments.clone(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.environmentCloneSucceeded),
        detail: result.id,
      };
      cloneEnvironmentNames = {};
      environmentCloneDialogOpen = false;
      selectedEnvironmentId = "";
      invalidateEnvironmentAndProjectQueries();
      setEnvironmentLifecycleDialogOpen(false);
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentCloneFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const renameEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: RenameEnvironmentInput) => orpcClient.environments.rename(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.environmentRenameSucceeded),
        detail: result.id,
      };
      renameEnvironmentNames = {};
      environmentRenameDialogOpen = false;
      selectedEnvironmentId = "";
      invalidateEnvironmentAndProjectQueries();
      setEnvironmentLifecycleDialogOpen(false);
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentRenameFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const lockEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: LockEnvironmentInput) => orpcClient.environments.lock(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.environmentLockSucceeded),
        detail: result.id,
      };
      invalidateEnvironmentAndProjectQueries();
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentLockFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const unlockEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: UnlockEnvironmentInput) => orpcClient.environments.unlock(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.environmentUnlockSucceeded),
        detail: result.id,
      };
      invalidateEnvironmentAndProjectQueries();
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentUnlockFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  $effect(() => {
    if (!project || projectFormProjectId === project.id) {
      return;
    }

    projectFormProjectId = project.id;
    projectName = project.name;
    lifecycleFeedback = null;
  });

  $effect(() => {
    if (
      !browser ||
      projectCapabilityQueries.length === 0 ||
      projectCapabilityLoadKey === loadedProjectCapabilityLoadKey
    ) {
      return;
    }

    loadedProjectCapabilityLoadKey = projectCapabilityLoadKey;
    void capabilities.fetch(projectCapabilityQueries);
  });

  $effect(() => {
    quickDeployDialogOpen = modalIsOpen(page, "quick-deploy");
  });

  function cloneEnvironmentName(environmentId: string): string {
    return cloneEnvironmentNames[environmentId] ?? "";
  }

  function setCloneEnvironmentName(environmentId: string, value: string): void {
    cloneEnvironmentNames = {
      ...cloneEnvironmentNames,
      [environmentId]: value,
    };
  }

  function renameEnvironmentName(environmentId: string, currentName: string): string {
    return renameEnvironmentNames[environmentId] ?? currentName;
  }

  function setRenameEnvironmentName(environmentId: string, value: string): void {
    renameEnvironmentNames = {
      ...renameEnvironmentNames,
      [environmentId]: value,
    };
  }

  function renameProject(): void {
    if (!browser || !project || !canRenameProject || renameProjectMutation.isPending) {
      return;
    }

    lifecycleFeedback = null;
    renameProjectMutation.mutate({
      projectId: project.id,
      name: projectName.trim(),
    });
  }

  function openProjectLifecycleDialog(): void {
    if (!browser || !project) {
      return;
    }

    selectedProjectLifecycleAction = null;
    projectDeleteConfirmation = "";
    lifecycleFeedback = null;
    projectLifecycleDialogOpen = true;
  }

  function setProjectLifecycleDialogOpen(open: boolean): void {
    projectLifecycleDialogOpen = open;
    if (!open) {
      selectedProjectLifecycleAction = null;
      projectDeleteConfirmation = "";
    }
  }

  function projectLifecycleDialogTitle(action: ProjectLifecycleAction | null): string {
    switch (action) {
      case "archive":
        return $t(i18nKeys.console.projects.archiveDialogTitle);
      case "restore":
        return $t(i18nKeys.console.projects.restoreDialogTitle);
      case "delete":
        return $t(i18nKeys.console.projects.deleteDialogTitle);
      default:
        return $t(i18nKeys.console.projects.lifecycleTitle);
    }
  }

  function projectLifecycleDialogDescription(action: ProjectLifecycleAction | null): string {
    switch (action) {
      case "archive":
        return $t(i18nKeys.console.projects.archiveConfirm);
      case "restore":
        return $t(i18nKeys.console.projects.restoreConfirm);
      case "delete":
        return $t(i18nKeys.console.projects.deleteDialogDescription);
      default:
        return $t(i18nKeys.console.projects.settingsLifecycleDescription);
    }
  }

  function submitProjectLifecycleAction(): void {
    if (!project || !selectedProjectLifecycleAction || !canSubmitProjectLifecycleAction) {
      return;
    }

    lifecycleFeedback = null;

    if (selectedProjectLifecycleAction === "archive") {
      archiveProjectMutation.mutate({
        projectId: project.id,
      });
      return;
    }

    if (selectedProjectLifecycleAction === "restore") {
      restoreProjectMutation.mutate({
        projectId: project.id,
      });
      return;
    }

    deleteProjectMutation.mutate({
      projectId: project.id,
      confirmation: { projectId: projectDeleteConfirmation.trim() },
    });
  }

  function openEnvironmentLifecycleDialog(environment: EnvironmentSummary): void {
    if (!browser || !project) {
      return;
    }

    selectedEnvironmentId = environment.id;
    selectedEnvironmentLifecycleAction = null;
    lifecycleFeedback = null;
    environmentLifecycleDialogOpen = true;
  }

  function setEnvironmentLifecycleDialogOpen(open: boolean): void {
    environmentLifecycleDialogOpen = open;
    if (!open) {
      selectedEnvironmentLifecycleAction = null;
      selectedEnvironmentId = "";
    }
  }

  function environmentLifecycleDialogTitle(action: EnvironmentLifecycleAction | null): string {
    switch (action) {
      case "archive":
        return $t(i18nKeys.console.projects.environmentArchiveDialogTitle);
      case "lock":
        return $t(i18nKeys.console.projects.environmentLockDialogTitle);
      case "unlock":
        return $t(i18nKeys.console.projects.environmentUnlockDialogTitle);
      default:
        return $t(i18nKeys.console.projects.environmentLifecycleDialogTitle);
    }
  }

  function environmentLifecycleDialogDescription(action: EnvironmentLifecycleAction | null): string {
    switch (action) {
      case "archive":
        return $t(i18nKeys.console.projects.environmentArchiveConfirm);
      case "lock":
        return $t(i18nKeys.console.projects.environmentLockConfirm);
      case "unlock":
        return $t(i18nKeys.console.projects.environmentUnlockConfirm);
      default:
        return $t(i18nKeys.console.projects.environmentLifecycleDialogDescription);
    }
  }

  function submitEnvironmentLifecycleAction(): void {
    if (!selectedEnvironment || !selectedEnvironmentLifecycleAction || !canSubmitEnvironmentLifecycleAction) {
      return;
    }

    lifecycleFeedback = null;

    if (selectedEnvironmentLifecycleAction === "archive") {
      archiveEnvironmentMutation.mutate({
        environmentId: selectedEnvironment.id,
      });
      return;
    }

    if (selectedEnvironmentLifecycleAction === "lock") {
      lockEnvironmentMutation.mutate({
        environmentId: selectedEnvironment.id,
      });
      return;
    }

    unlockEnvironmentMutation.mutate({
      environmentId: selectedEnvironment.id,
    });
  }

  function cloneEnvironment(environmentId: string): void {
    if (!browser || !project || isProjectArchived || cloneEnvironmentMutation.isPending) {
      return;
    }

    const environment = projectEnvironments.find((item) => item.id === environmentId);
    if (!environment || environment.lifecycleStatus !== "active") {
      return;
    }

    const targetName = cloneEnvironmentName(environmentId).trim();
    if (!targetName) {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentCloneFailed),
        detail: $t(i18nKeys.console.projects.environmentCloneValidation),
      };
      return;
    }

    lifecycleFeedback = null;
    cloneEnvironmentMutation.mutate({
      environmentId,
      targetName,
    });
  }

  function renameEnvironment(environmentId: string): void {
    if (!browser || !project || isProjectArchived || renameEnvironmentMutation.isPending) {
      return;
    }

    const environment = projectEnvironments.find((item) => item.id === environmentId);
    if (!environment || environment.lifecycleStatus !== "active") {
      return;
    }

    const name = renameEnvironmentName(environmentId, environment.name).trim();
    if (!name || name === environment.name) {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentRenameFailed),
        detail: $t(i18nKeys.console.projects.environmentRenameValidation),
      };
      return;
    }

    lifecycleFeedback = null;
    renameEnvironmentMutation.mutate({
      environmentId,
      name,
    });
  }

  function monitoringSignalItems(rollup: RuntimeMonitoringRollupResponse | null) {
    const signals: Array<{ key: RuntimeMonitoringSignalKey; label: string }> = [
      { key: "cpu", label: $t(i18nKeys.console.runtimeUsage.cpu) },
      { key: "memory", label: $t(i18nKeys.console.runtimeUsage.memory) },
      { key: "disk", label: $t(i18nKeys.console.runtimeUsage.disk) },
    ];

    return signals.map((signal) => ({
      ...signal,
      value: formatRuntimeMonitoringPercent(
        latestRuntimeMonitoringRollupValue(rollup, signal.key),
      ),
    }));
  }

  function operatorWorkAttentionDetail(work: OperatorWorkItem): string {
    const safeDetails = work.safeDetails ?? {};
    const isFailure = work.status === "failed" || work.status === "dead-lettered";
    if (isFailure) {
      const readableFailure = operatorWorkReadableFailure(work);
      return [
        readableFailure.detail,
        readableFailure.recovery,
        readableFailure.phase,
        readableFailure.code,
        readableFailure.operation,
        formatTime(work.updatedAt),
      ]
        .filter((part, index, parts): part is string => Boolean(part) && parts.indexOf(part) === index)
        .join(" · ");
    }
    const failureCode = isFailure
      ? stringSafeDetail(safeDetails.failure_code) ??
        stringSafeDetail(safeDetails.code) ??
        work.errorCode ??
        work.status
      : undefined;
    const currentPhase =
      (isFailure ? stringSafeDetail(safeDetails.failure_phase) : undefined) ??
      work.phase ??
      work.step ??
      work.status;
    const operation =
      stringSafeDetail(safeDetails.failure_operation) ?? work.operationKey;
    const statusLabel = operatorWorkStatusLabel(work.status);

    return [statusLabel, currentPhase, work.step, failureCode, operation, formatTime(work.updatedAt)]
      .filter((part, index, parts): part is string => Boolean(part) && parts.indexOf(part) === index)
      .join(" · ");
  }

  function operatorWorkStatusLabel(status: OperatorWorkItem["status"]): string {
    switch (status) {
      case "failed":
      case "dead-lettered":
        return $t(i18nKeys.common.status.failed);
      case "running":
      case "pending":
      case "retry-scheduled":
        return $t(i18nKeys.common.status.running);
      case "succeeded":
        return $t(i18nKeys.console.deployments.progressStatusSucceeded);
      case "canceled":
        return $t(i18nKeys.common.status.stopped);
      default:
        return $t(i18nKeys.common.status.unknown);
    }
  }

  function projectAttentionStatusLabel(item: ProjectAttentionItem): string {
    if (item.tone === "destructive") {
      return $t(i18nKeys.common.status.failed);
    }

    if (item.tone === "warning") {
      return $t(i18nKeys.common.status.running);
    }

    return $t(i18nKeys.common.status.unknown);
  }

  function projectAttentionIsLive(item: ProjectAttentionItem): boolean {
    return item.tone === "warning";
  }

  function projectAttentionCardClass(item: ProjectAttentionItem): string {
    if (item.tone === "destructive") {
      return "border-destructive/30 bg-destructive/5";
    }

    if (item.tone === "warning") {
      return "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20";
    }

    return "border-border bg-background";
  }

  function stringSafeDetail(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  function parseProjectDetailTab(value: string | null): ProjectDetailTab {
    return projectDetailTabs.includes(value as ProjectDetailTab)
      ? (value as ProjectDetailTab)
      : "overview";
  }

  function parseProjectSettingsSection(value: string | null): ProjectSettingsSection {
    return projectSettingsSections.includes(value as ProjectSettingsSection)
      ? (value as ProjectSettingsSection)
      : "general";
  }

  function projectTabHref(tab: ProjectDetailTab): string {
    const params = new URLSearchParams();

    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function projectDetailHrefWithActiveSearch(projectId: string): string {
    const params = new URLSearchParams();

    if (activeProjectTab !== "overview") {
      params.set("tab", activeProjectTab);
    }

    if (activeProjectTab === "settings" && activeProjectSettingsSection !== "general") {
      params.set("section", activeProjectSettingsSection);
    }

    return hrefWithSearchParams(projectDetailHref(projectId), params);
  }

  function projectSettingsSectionHref(section: ProjectSettingsSection): string {
    const params = new URLSearchParams();
    params.set("tab", "settings");

    if (section !== "general") {
      params.set("section", section);
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function projectPreviewPolicyHref(): string {
    const params = new URLSearchParams({
      projectId,
      scope: "project",
    });

    return `/preview-policies?${params.toString()}`;
  }

  function projectModalBaseSearch(): string {
    const params = new URLSearchParams();
    if (activeProjectTab !== "overview") {
      params.set("tab", activeProjectTab);
    }
    return params.toString();
  }

  function projectModalBaseHref(): string {
    const search = projectModalBaseSearch();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function openQuickDeployModal(target: QuickDeployModalTarget = {}): void {
    const params = new URLSearchParams(projectModalBaseSearch());
    params.set("modal", "quick-deploy");
    params.set("projectMode", "existing");
    params.set("projectId", target.resource?.projectId ?? projectId);

    if (target.resource) {
      params.set("editResource", "true");
      params.set("resourceMode", "existing");
      params.set("resourceId", target.resource.id);
    } else {
      params.delete("resourceId");
      params.delete("resourceMode");
      params.delete("editResource");
    }

    const search = params.toString();
    void goto(`${page.url.pathname}${search ? `?${search}` : ""}`, {
      noScroll: true,
      keepFocus: true,
    });
  }

  function selectProjectTab(tab: ProjectDetailTab, event: MouseEvent): void {
    event.preventDefault();
    void goto(projectTabHref(tab), { noScroll: true, keepFocus: true });
  }

  function selectProjectSettingsSection(section: ProjectSettingsSection, event: MouseEvent): void {
    event.preventDefault();
    void goto(projectSettingsSectionHref(section), { noScroll: true, keepFocus: true });
  }

  function setQuickDeployDialogOpen(open: boolean): void {
    if (!open && quickDeployProgressDialogOpen) {
      return;
    }

    quickDeployDialogOpen = open;
    if (!open) {
      quickDeployProgressDialogOpen = false;
    }
    if (open) {
      void setModalOpen(page, "quick-deploy", open);
      return;
    }

    void goto(projectModalBaseHref(), {
      keepFocus: true,
      noScroll: true,
      replaceState: true,
    });
  }

  function closeQuickDeployDialog(): void {
    quickDeployProgressDialogOpen = false;
    setQuickDeployDialogOpen(false);
  }

  function appendProjectResourceDeploymentProgressEvent(event: DeploymentProgressEvent): void {
    projectResourceDeploymentProgressEvents = [...projectResourceDeploymentProgressEvents, event];
    projectResourceDeploymentProgressDeploymentId =
      event.deploymentId ?? projectResourceDeploymentProgressDeploymentId;

    if (event.status === "failed") {
      projectResourceDeploymentProgressDialogStatus = "failed";
    } else if (event.status === "succeeded") {
      projectResourceDeploymentProgressDialogStatus = "succeeded";
    } else {
      projectResourceDeploymentProgressDialogStatus = "running";
    }
  }

  async function refreshProjectResourceDeploymentData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.resources.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.deployments.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.projects.key({ type: "query" }) }),
    ]);
  }

  function prepareProjectResourceDeploymentDialog(resource: ResourceSummary): void {
    const latestDeployment = latestResourceDeployment(resource, projectDeployments);
    selectedProjectResourceDeploymentId = resource.id;
    projectResourceDeploymentServerId =
      (latestDeployment?.serverId ?? projectResourceDeploymentServerId) || (servers[0]?.id ?? "");
    projectResourceDeploymentDestinationId =
      resource.destinationId ?? latestDeployment?.destinationId ?? "";
    projectResourceDeploymentPlanPreview = null;
    projectResourceDeploymentPlanError = "";
    projectResourceDeploymentFeedback = null;
    projectResourceDeploymentDialogOpen = true;
  }

  function openProjectResourceDeploymentDialog(resource: ResourceSummary): void {
    if (isProjectArchived) {
      return;
    }

    prepareProjectResourceDeploymentDialog(resource);
  }

  function setProjectResourceDeploymentDialogOpen(open: boolean): void {
    if (open) {
      if (selectedProjectResourceDeployment) {
        prepareProjectResourceDeploymentDialog(selectedProjectResourceDeployment);
      }
      return;
    }

    projectResourceDeploymentDialogOpen = false;
  }

  async function createProjectResourceDeployment(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!selectedProjectResourceDeployment || !canCreateProjectResourceDeployment) {
      return;
    }

    const input: CreateDeploymentInput = {
      projectId: selectedProjectResourceDeployment.projectId,
      environmentId: selectedProjectResourceDeployment.environmentId,
      resourceId: selectedProjectResourceDeployment.id,
      serverId: projectResourceDeploymentServerId,
      ...(projectResourceDeploymentDestinationId.trim()
        ? { destinationId: projectResourceDeploymentDestinationId.trim() }
        : {}),
    };

    projectResourceDeploymentCreatePending = true;
    projectResourceDeploymentFeedback = null;
    projectResourceDeploymentProgressDialogOpen = true;
    projectResourceDeploymentProgressDialogStatus = "running";
    projectResourceDeploymentProgressEvents = [];
    projectResourceDeploymentProgressStreamError = "";
    projectResourceDeploymentProgressDeploymentId = "";
    projectResourceDeploymentProgressRequestId = "";
    projectResourceDeploymentProgressTraceLink = "";

    try {
      const result = await createDeploymentWithProgress(
        input,
        appendProjectResourceDeploymentProgressEvent,
        {
          onRequestId: (requestId) => {
            projectResourceDeploymentProgressRequestId = requestId;
          },
          onStreamError: (message) => {
            projectResourceDeploymentProgressStreamError = message;
          },
          onTraceLink: (traceLink) => {
            projectResourceDeploymentProgressTraceLink = traceLink;
          },
        },
      );
      projectResourceDeploymentProgressDeploymentId = result.id;
      projectResourceDeploymentProgressDialogStatus = "succeeded";
      projectResourceDeploymentFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.resources.newDeploymentSuccessTitle),
        detail: result.id,
      };
      setProjectResourceDeploymentDialogOpen(false);
      await refreshProjectResourceDeploymentData();
    } catch (error) {
      projectResourceDeploymentProgressDialogStatus = "failed";
      projectResourceDeploymentProgressStreamError = readErrorMessage(error);
      projectResourceDeploymentFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.resources.newDeploymentErrorTitle),
        detail: readErrorMessage(error),
      };
    } finally {
      projectResourceDeploymentCreatePending = false;
    }
  }

  async function previewProjectResourceDeploymentPlan(): Promise<void> {
    if (!selectedProjectResourceDeployment || !canPreviewProjectResourceDeploymentPlan) {
      return;
    }

    projectResourceDeploymentPlanPending = true;
    projectResourceDeploymentPlanError = "";
    projectResourceDeploymentPlanPreview = null;

    try {
      projectResourceDeploymentPlanPreview = await orpcClient.deployments.plan({
        projectId: selectedProjectResourceDeployment.projectId,
        environmentId: selectedProjectResourceDeployment.environmentId,
        resourceId: selectedProjectResourceDeployment.id,
        serverId: projectResourceDeploymentServerId,
        ...(projectResourceDeploymentDestinationId.trim()
          ? { destinationId: projectResourceDeploymentDestinationId.trim() }
          : {}),
      });
    } catch (error) {
      projectResourceDeploymentPlanError = readErrorMessage(error);
    } finally {
      projectResourceDeploymentPlanPending = false;
    }
  }

  function projectResourceDeploymentPlanStatusLabel(
    status: DeploymentPlanResponse["readiness"]["status"],
  ): string {
    if (status === "ready") {
      return $t(i18nKeys.console.resources.newDeploymentPlanReady);
    }
    if (status === "warning") {
      return $t(i18nKeys.console.resources.newDeploymentPlanWarning);
    }
    return $t(i18nKeys.console.resources.newDeploymentPlanBlocked);
  }

  function projectResourceDeploymentProgressHref(): string {
    if (!selectedProjectResourceDeployment || !projectResourceDeploymentProgressDeploymentId) {
      return "/deployments";
    }

    return deploymentDetailHref({
      id: projectResourceDeploymentProgressDeploymentId,
      projectId: selectedProjectResourceDeployment.projectId,
      environmentId: selectedProjectResourceDeployment.environmentId,
      resourceId: selectedProjectResourceDeployment.id,
    });
  }

  function openProjectQuickDeploy(): void {
    openQuickDeployModal();
  }

  function openProjectDeploymentAction(): void {
    if (primaryResource) {
      openProjectResourceDeploymentDialog(primaryResource);
      return;
    }

    openProjectQuickDeploy();
  }

  function openProjectNextAction(): void {
    if (projectNextAction.intent === "project-quick-deploy") {
      openProjectQuickDeploy();
      return;
    }

    if (projectNextAction.intent === "resource-create-deployment") {
      const resource = projectResources.find((item) => item.id === projectNextAction.resourceId);
      if (resource) {
        openProjectResourceDeploymentDialog(resource);
      } else {
        openProjectQuickDeploy();
      }
    }
  }

  function openProjectAttentionAction(item: ProjectAttentionItem): void {
    if (item.intent === "operator-work-refresh") {
      void queryClient.invalidateQueries({ queryKey: orpc.operatorWork.key({ type: "query" }) });
      return;
    }

    if (item.intent !== "resource-create-deployment") return;

    const resource = projectResources.find((projectResource) => projectResource.id === item.resourceId);
    if (resource) {
      openProjectResourceDeploymentDialog(resource);
    } else {
      openProjectQuickDeploy();
    }
  }

  function openProjectRenameDialog(): void {
    if (!project) return;
    projectName = project.name;
    projectRenameDialogOpen = true;
  }

  function openEnvironmentCreateDialog(): void {
    environmentCreateDialogOpen = true;
  }

  function closeEnvironmentCreateDialog(): void {
    environmentCreateDialogOpen = false;
  }

  function openEnvironmentRenameDialog(environment: EnvironmentSummary): void {
    selectedEnvironmentId = environment.id;
    setRenameEnvironmentName(environment.id, environment.name);
    environmentRenameDialogOpen = true;
  }

  function openEnvironmentCloneDialog(environment: EnvironmentSummary): void {
    selectedEnvironmentId = environment.id;
    setCloneEnvironmentName(environment.id, "");
    environmentCloneDialogOpen = true;
  }

  function projectTabLabel(tab: ProjectDetailTab): string {
    switch (tab) {
      case "overview":
        return $t(i18nKeys.console.deployments.overviewTab);
      case "resources":
        return $t(i18nKeys.common.domain.resources);
      case "deployments":
        return $t(i18nKeys.common.domain.deployments);
      case "environments":
        return $t(i18nKeys.common.domain.environments);
      case "previews":
        return $t(i18nKeys.console.projects.previewsTitle);
      case "activity":
        return $t(i18nKeys.console.projects.activityTitle);
      case "settings":
        return $t(i18nKeys.console.projects.settingsTitle);
    }
  }

  function projectSettingsSectionLabel(section: ProjectSettingsSection): string {
    switch (section) {
      case "general":
        return $t(i18nKeys.console.projects.generalSettingsTitle);
      case "danger":
        return $t(i18nKeys.console.projects.dangerZoneTitle);
    }
  }

  function previewEnvironmentStatusLabelKey(status: PreviewEnvironmentStatus) {
    if (status === "cleanup-requested") {
      return i18nKeys.console.previewEnvironments.statusCleanupRequested;
    }

    return i18nKeys.console.previewEnvironments.statusActive;
  }

  function previewEnvironmentStatusVariant(
    status: PreviewEnvironmentStatus,
  ): "default" | "secondary" {
    return status === "cleanup-requested" ? "secondary" : "default";
  }

</script>

<svelte:head>
  <title>{project?.name ?? $t(i18nKeys.console.projects.pageTitle)} · Appaloft</title>
</svelte:head>

{#snippet projectDetailLoadingSkeleton()}
  <div class={detailPageClass} data-project-detail-loading-skeleton>
    <section class={detailHeaderClass}>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-3xl space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{$t(i18nKeys.common.domain.project)}</Badge>
            <Skeleton class="h-5 w-32 rounded-md" />
            <Skeleton class="h-5 w-16 rounded-md" />
          </div>
          <div class="space-y-2">
            <Skeleton class="h-8 w-72 max-w-full" />
            <Skeleton class="h-4 w-full max-w-2xl" />
            <Skeleton class="h-4 w-3/5 max-w-xl" />
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span class="inline-flex items-center gap-2">
              {$t(i18nKeys.common.domain.createdAt)} · <Skeleton class="h-3 w-32" />
            </span>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button type="button" disabled>
            <Plus class="size-4" />
            {$t(i18nKeys.console.projects.addResourceAction)}
          </Button>
          <Button type="button" variant="outline" disabled>
            {$t(i18nKeys.common.actions.viewAll)}
            <ArrowRight class="size-4" />
          </Button>
        </div>
      </div>

      <section class="console-metric-strip mt-5 lg:grid-cols-4" aria-label={$t(i18nKeys.console.projects.operationalSummaryTitle)}>
        {#each [
          i18nKeys.common.domain.resources,
          i18nKeys.console.projects.publicAccessTitle,
          i18nKeys.console.projects.latestDeploymentTitle,
          i18nKeys.console.projects.attentionTitle,
        ] as summaryTitle}
          <article>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(summaryTitle)}
            </p>
            <Skeleton class="mt-2 h-8 w-12" />
            <Skeleton class="mt-2 h-3 w-32 max-w-full" />
          </article>
        {/each}
      </section>
    </section>

    <Tabs.Root value={activeProjectTab} class={detailBodyClass}>
      <ConsoleDetailTabs
        ariaLabel={$t(i18nKeys.console.projects.pageTitle)}
        items={projectDetailTabItems}
      />

      <Tabs.Content value="overview" class={[detailTabPanelScrollClass, "flex flex-col gap-6"]}>
        <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div class="space-y-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.projects.resourcesTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.resourcesDescription)}
                </p>
              </div>
              <Button type="button" variant="outline" disabled>
                {$t(i18nKeys.common.actions.viewAll)}
                <ArrowRight class="size-4" />
              </Button>
            </div>

            <div class="space-y-4">
              {#each Array.from({ length: 2 }) as _, groupIndex}
                <section class="space-y-2">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="min-w-0">
                      <Skeleton class="h-5 w-36" />
                      <Skeleton class="mt-2 h-3 w-20" />
                    </div>
                    <Skeleton class="h-5 w-20 rounded-md" />
                  </div>
                  <div class="console-record-list">
                    {#each Array.from({ length: 2 }) as _}
                      <div class="console-record-row">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div class="min-w-0">
                            <div class="flex min-w-0 flex-wrap items-center gap-2">
                              <Skeleton class="h-4 w-40" />
                              <Skeleton class="h-5 w-16 rounded-md" />
                              <Skeleton class="h-5 w-20 rounded-md" />
                            </div>
                            <Skeleton class="mt-2 h-3 w-full max-w-sm" />
                          </div>
                          <div class="flex shrink-0 flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" disabled>
                              <Play class="size-4" />
                              {$t(i18nKeys.common.actions.createDeployment)}
                            </Button>
                            <Button type="button" size="sm" variant="outline" disabled>
                              {$t(i18nKeys.common.actions.openResource)}
                            </Button>
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                </section>
              {/each}
            </div>
          </div>

          <aside class="space-y-4">
            <section class="console-side-panel space-y-3">
              <div>
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-sm font-semibold">
                    {$t(i18nKeys.console.projects.publicAccessTitle)}
                  </h2>
                  <Skeleton class="h-4 w-8" />
                </div>
                <p class="mt-1 text-xs leading-5 text-muted-foreground">
                  {$t(i18nKeys.console.projects.publicAccessDescription)}
                </p>
              </div>
              <div class="console-record-list">
                {#each Array.from({ length: 2 }) as _}
                  <div class="console-record-row">
                    <Skeleton class="h-4 w-40" />
                    <Skeleton class="mt-2 h-3 w-56 max-w-full" />
                  </div>
                {/each}
              </div>
            </section>

            <section class="console-side-panel space-y-3">
              <h2 class="text-sm font-semibold">
                {$t(i18nKeys.console.projects.latestDeploymentTitle)}
              </h2>
              <div class="console-record-row">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <Skeleton class="h-4 w-24" />
                  <Skeleton class="h-5 w-24 rounded-md" />
                </div>
                <Skeleton class="mt-2 h-3 w-36" />
                <Skeleton class="mt-2 h-3 w-28" />
              </div>
            </section>

            <section class="console-side-panel space-y-3">
              <h2 class="text-sm font-semibold">
                {$t(i18nKeys.console.projects.attentionTitle)}
              </h2>
              <div class="space-y-2">
                {#each Array.from({ length: 2 }) as _}
                  <article class="rounded-md border border-border bg-background px-3 py-2">
                    <div class="flex min-w-0 items-center justify-between gap-2">
                      <div class="flex min-w-0 items-center gap-2">
                        <span class="relative inline-flex size-2.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true"></span>
                        <Skeleton class="h-4 w-36" />
                      </div>
                      <Button type="button" size="icon" variant="ghost" disabled aria-label={$t(i18nKeys.common.actions.viewProgress)}>
                        <ChevronDown class="size-3.5" />
                      </Button>
                    </div>
                    <Skeleton class="mt-2 h-3 w-full" />
                    <Skeleton class="mt-2 h-3 w-2/3" />
                    <div class="mt-2">
                      <Button type="button" size="sm" variant="outline" disabled>
                        {$t(i18nKeys.common.actions.viewProgress)}
                      </Button>
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          </aside>
        </section>
      </Tabs.Content>
    </Tabs.Root>
  </div>
{/snippet}

<ConsoleShell
  title={project?.name ?? $t(i18nKeys.console.projects.pageTitle)}
  description={$t(i18nKeys.console.projects.detailDescription)}
  quickDeployModalEnabled={false}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle), href: "/projects" },
    {
      label: project?.name ?? $t(i18nKeys.console.projects.pageTitle),
      kind: "project",
      loading: projectHeaderLoading,
      href: project ? projectDetailHrefWithActiveSearch(project.id) : undefined,
      switcherLabel: $t(i18nKeys.console.projects.pageTitle),
      switcherItems: projectHeaderSwitchItems,
    },
  ]}
>
  {#if pageLoading}
    {@render projectDetailLoadingSkeleton()}
  {:else if !project}
    <section class="space-y-5 p-4 md:p-6">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.errors.backend.notFound)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.projects.notFoundTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.projects.notFoundBody)}
        </p>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
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
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{$t(i18nKeys.common.domain.project)}</Badge>
              <Badge variant="secondary">{project.slug}</Badge>
              <Badge variant={isProjectArchived ? "destructive" : "secondary"}>
                {isProjectArchived
                  ? $t(i18nKeys.console.projects.archived)
                  : $t(i18nKeys.console.projects.active)}
              </Badge>
            </div>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold md:text-3xl">{project.name}</h1>
              <p class="text-sm leading-6 text-muted-foreground">
                {project.description ?? $t(i18nKeys.console.projects.noDescription)}
              </p>
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{$t(i18nKeys.common.domain.createdAt)} · {formatTime(project.createdAt)}</span>
              {#if project.archivedAt}
                <span>{$t(i18nKeys.console.projects.archivedAt)} · {formatTime(project.archivedAt)}</span>
              {/if}
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <CapabilityGate operationKey="resources.create" resourceRefs={{ projectId: project.id }}>
              {#snippet children({ disabled })}
                <Button
                  type="button"
                  onclick={openProjectQuickDeploy}
                  disabled={disabled || isProjectArchived}
                >
                  <Plus class="size-4" />
                  {$t(i18nKeys.console.projects.addResourceAction)}
                </Button>
              {/snippet}
            </CapabilityGate>
            {#if projectNextAction.href}
              <Button href={projectNextAction.href} variant="outline">
                {projectNextAction.label}
                <ArrowRight class="size-4" />
              </Button>
            {:else}
              <Button
                type="button"
                variant="outline"
                onclick={openProjectNextAction}
                disabled={isProjectArchived}
              >
                {projectNextAction.label}
                <ArrowRight class="size-4" />
              </Button>
            {/if}
          </div>
        </div>

        <section class="console-metric-strip mt-5 lg:grid-cols-4" aria-label={$t(i18nKeys.console.projects.operationalSummaryTitle)}>
          <article>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.resources)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{projectResources.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {deployedProjectResources.length} {$t(i18nKeys.console.projects.deployedResourcesLabel)}
            </p>
          </article>
          <article>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.projects.publicAccessTitle)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{projectAccessRoutes.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {resourcesWithoutAccess.length} {$t(i18nKeys.console.projects.noAccessResourcesLabel)}
            </p>
          </article>
          <article>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.projects.latestDeploymentTitle)}
            </p>
            {#if latestProjectDeploymentSummary}
              <div class="mt-2">
                <DeploymentStatusBadge status={latestProjectDeploymentSummary.status} />
              </div>
              <a
                href={deploymentDetailHref(latestProjectDeploymentSummary)}
                class="mt-2 block truncate text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                title={`${latestDeploymentResource?.name ?? latestProjectDeploymentSummary.resourceId} · ${formatTime(latestProjectDeploymentSummary.createdAt)}`}
              >
                {latestDeploymentResource?.name ?? latestProjectDeploymentSummary.resourceId} · {formatTime(latestProjectDeploymentSummary.createdAt)}
              </a>
            {:else}
              <p class="mt-2 text-sm font-semibold">{$t(i18nKeys.console.projects.noDeploymentShort)}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {undeployedProjectResources.length} {$t(i18nKeys.console.projects.undeployedResourcesLabel)}
              </p>
            {/if}
          </article>
          <article>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.projects.attentionTitle)}
            </p>
            <p class="mt-2 text-2xl font-semibold">
              {failedProjectDeployments.length + runningProjectDeployments.length}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {failedProjectDeployments.length} {$t(i18nKeys.console.projects.failedDeploymentsLabel)}
              · {runningProjectDeployments.length} {$t(i18nKeys.console.projects.runningDeploymentsLabel)}
            </p>
          </article>
        </section>
      </section>

      <Tabs.Root value={activeProjectTab} class={detailBodyClass}>
        <ConsoleDetailTabs
          ariaLabel={$t(i18nKeys.console.projects.pageTitle)}
          items={projectDetailTabItems}
        />

        <Tabs.Content
          value="overview"
          class={[detailTabPanelScrollClass, "flex flex-col gap-6"]}
        >
          <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div class="space-y-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.projects.resourcesTitle)}
                  </h2>
                  <p class="mt-1 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.projects.resourcesDescription)}
                  </p>
                </div>
                <Button href={projectTabHref("resources")} variant="outline">
                  {$t(i18nKeys.common.actions.viewAll)}
                  <ArrowRight class="size-4" />
                </Button>
              </div>

              {#if projectResources.length > 0}
                <div class="space-y-4">
                  {#each nonEmptyProjectResourceGroups as group (group.environment.id)}
                    <section class="space-y-2">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="min-w-0">
                          <h3 class="truncate text-sm font-semibold">{group.environment.name}</h3>
                          <p class="text-xs text-muted-foreground">
                            {group.resources.length} {$t(i18nKeys.common.domain.resources)}
                          </p>
                        </div>
                        <Badge variant="secondary">{group.environment.kind}</Badge>
                      </div>
                      <div class="console-record-list">
                        {#each group.resources.slice(0, 4) as resource (resource.id)}
                          {@const currentAccessRoute = selectCurrentResourceAccessRoute(resource.accessSummary)}
                          {@const latestDeployment = latestResourceDeployment(resource, projectDeployments)}
                          <div class="console-record-row">
                            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div class="min-w-0">
                                <div class="flex min-w-0 flex-wrap items-center gap-2">
                                  <a
                                    href={resourceDetailHref(resource)}
                                    class="truncate text-sm font-medium underline-offset-4 hover:underline"
                                  >
                                    {resource.name}
                                  </a>
                                  <Badge variant="secondary">{resource.kind}</Badge>
                                  <DeploymentStatusBadge
                                    status={resource.lastDeploymentStatus ?? latestDeployment?.status}
                                  />
                                </div>
                                <p class="mt-1 truncate text-xs text-muted-foreground">
                                  {currentAccessRoute?.route.url ?? $t(i18nKeys.console.projects.noPublicAccess)}
                                </p>
                              </div>
                              <div class="flex shrink-0 flex-wrap gap-2">
                                <Button
                                  type="button"
                                  onclick={() => openProjectResourceDeploymentDialog(resource)}
                                  size="sm"
                                  variant="outline"
                                >
                                  <Play class="size-4" />
                                  {$t(i18nKeys.common.actions.createDeployment)}
                                </Button>
                                <Button
                                  href={resourceDetailHref(resource)}
                                  size="sm"
                                  variant="outline"
                                >
                                  {$t(i18nKeys.common.actions.openResource)}
                                </Button>
                              </div>
                            </div>
                          </div>
                        {/each}
                        {#if group.resources.length > 4}
                          <a
                            href={projectTabHref("resources")}
                            class="console-record-row block text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          >
                            {$t(i18nKeys.common.actions.viewAll)} · {group.resources.length}
                          </a>
                        {/if}
                      </div>
                    </section>
                  {/each}

                  {#if projectResourcesWithoutKnownEnvironment.length > 0}
                    <section class="space-y-2">
                      <div>
                        <h3 class="text-sm font-semibold">{$t(i18nKeys.console.projects.noEnvironment)}</h3>
                      </div>
                      <ResourceListTable
                        resources={projectResourcesWithoutKnownEnvironment}
                        deployments={projectDeployments}
                        domainBindings={projectDomainBindings}
                        {environments}
                        emptyTitle={$t(i18nKeys.console.projects.noResourcesShort)}
                        emptyDescription={$t(i18nKeys.console.projects.noResources)}
                        onDomainBindingVerificationFeedback={(feedback) => {
                          domainBindingFeedback = feedback;
                        }}
                        showEnvironment
                      />
                    </section>
                  {/if}
                </div>
              {:else}
                <div class="console-subtle-panel px-4 py-6">
                  <div class="flex items-start gap-3">
                    <FolderOpen class="mt-0.5 size-4 text-muted-foreground" />
                    <div class="space-y-2">
                      <p class="text-sm font-medium">
                        {$t(i18nKeys.console.projects.noResourcesShort)}
                      </p>
                      <p class="text-sm text-muted-foreground">
                        {$t(i18nKeys.console.projects.noResources)}
                      </p>
                      <CapabilityGate
                        operationKey="resources.create"
                        resourceRefs={{ projectId: project.id }}
                      >
                        {#snippet children({ disabled })}
                          <Button
                            size="sm"
                            type="button"
                            onclick={openProjectQuickDeploy}
                            disabled={disabled || isProjectArchived}
                          >
                            <Plus class="size-4" />
                            {$t(i18nKeys.console.projects.addResourceAction)}
                          </Button>
                        {/snippet}
                      </CapabilityGate>
                    </div>
                  </div>
                </div>
              {/if}
            </div>

            <aside class="space-y-4">
              <section class="console-side-panel space-y-3">
                <div>
                  <div class="flex items-center justify-between gap-3">
                    <h2 class="text-sm font-semibold">
                      {$t(i18nKeys.console.projects.publicAccessTitle)}
                    </h2>
                    <span class="text-sm text-muted-foreground">{projectAccessRoutes.length}</span>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-muted-foreground">
                    {$t(i18nKeys.console.projects.publicAccessDescription)}
                  </p>
                </div>

                <div class="console-record-list">
                  {#if projectAccessRoutes.length > 0}
                    {#each projectAccessRoutes.slice(0, 4) as route (`${route.resourceId}-${route.hostname}-${route.pathPrefix}`)}
                      <a
                        href={route.url}
                        target="_blank"
                        rel="noreferrer"
                        class="console-record-row block"
                      >
                        <div class="flex min-w-0 items-center justify-between gap-2">
                          <p class="min-w-0 truncate text-sm font-medium">{route.hostname}</p>
                          <ExternalLink class="size-3 shrink-0 text-muted-foreground" />
                        </div>
                        <p class="mt-1 truncate text-xs text-muted-foreground">
                          {route.resourceName} · {route.pathPrefix} · {route.scheme.toUpperCase()}
                        </p>
                      </a>
                    {/each}
                  {:else}
                    <p class="px-4 py-4 text-sm leading-6 text-muted-foreground">
                      {$t(i18nKeys.console.projects.noPublicAccess)}
                    </p>
                  {/if}
                </div>
              </section>

              <section class="console-side-panel space-y-3">
                <h2 class="text-sm font-semibold">
                  {$t(i18nKeys.console.projects.latestDeploymentTitle)}
                </h2>
                {#if latestProjectDeploymentSummary}
                  <div class="console-record-row">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <DeploymentStatusBadge status={latestProjectDeploymentSummary.status} />
                      <Badge variant="outline">
                        {latestDeploymentEnvironment?.name ?? latestProjectDeploymentSummary.environmentId}
                      </Badge>
                    </div>
                    <a
                      href={deploymentDetailHref(latestProjectDeploymentSummary)}
                      class="mt-1 block truncate text-sm font-medium underline-offset-4 hover:underline"
                      title={latestDeploymentResource?.name ?? latestProjectDeploymentSummary.resourceId}
                    >
                      {latestDeploymentResource?.name ?? latestProjectDeploymentSummary.resourceId}
                    </a>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {formatTime(latestProjectDeploymentSummary.createdAt)}
                    </p>
                  </div>
                {:else}
                  <p class="text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.projects.noProjectDeploymentBody)}
                  </p>
                {/if}
              </section>

              <section class="console-side-panel space-y-3">
                <h2 class="text-sm font-semibold">
                  {$t(i18nKeys.console.projects.attentionTitle)}
                </h2>
                {#if projectAttentionItems.length > 0}
                  <div class="space-y-2">
                    {#each projectAttentionItems as item (item.key)}
                      <article
                        class={[
                          "rounded-md border px-3 py-2 transition hover:bg-muted/40",
                          projectAttentionCardClass(item),
                        ]}
                        data-project-attention-progress-item
                      >
                        <div class="min-w-0">
                          <div class="flex min-w-0 items-center justify-between gap-2">
                            <div class="flex min-w-0 items-center gap-2">
                              <span
                                class="relative flex size-2.5 shrink-0"
                                aria-hidden="true"
                                data-project-attention-status-signal
                              >
                                {#if projectAttentionIsLive(item)}
                                  <span
                                    class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70 motion-reduce:animate-none"
                                  ></span>
                                {/if}
                                <span
                                  class={[
                                    "relative inline-flex size-2.5 rounded-full",
                                    item.tone === "destructive"
                                      ? "bg-destructive"
                                      : item.tone === "warning"
                                        ? "bg-amber-500"
                                        : "bg-muted-foreground",
                                  ]}
                                ></span>
                              </span>
                              <p class="min-w-0 truncate text-sm font-medium">{item.title}</p>
                            </div>

                            <DropdownMenu>
                              <DropdownMenuTrigger
                                class="group/dropdown-trigger inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={$t(i18nKeys.common.actions.viewProgress)}
                                title={$t(i18nKeys.common.actions.viewProgress)}
                                data-project-attention-progress-trigger
                              >
                                <ChevronDown class="size-3.5 transition-transform group-data-[state=open]/dropdown-trigger:rotate-180" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" sideOffset={6} class="w-72">
                                <DropdownMenuLabel class="truncate">{item.title}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <div class="space-y-2 px-2 py-1.5 text-xs">
                                  <div class="flex items-center justify-between gap-3">
                                    <span class="text-muted-foreground">
                                      {$t(i18nKeys.common.domain.status)}
                                    </span>
                                    <span class="font-medium">{projectAttentionStatusLabel(item)}</span>
                                  </div>
                                  <p class="leading-5 text-muted-foreground">{item.detail}</p>
                                </div>
                                <DropdownMenuSeparator />
                                {#if item.href}
                                  <DropdownMenuItem
                                    onclick={() => {
                                      if (item.href) void goto(item.href);
                                    }}
                                  >
                                    <ArrowRight class="size-4" />
                                    {$t(i18nKeys.common.actions.viewDeployment)}
                                  </DropdownMenuItem>
                                {:else}
                                  <DropdownMenuItem
                                    disabled={isProjectArchived}
                                    onclick={() => openProjectAttentionAction(item)}
                                  >
                                    <RotateCcw class="size-4" />
                                    {item.action}
                                  </DropdownMenuItem>
                                {/if}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <p class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {item.detail}
                          </p>
                        </div>

                        <div class="mt-2">
                          {#if item.href}
                            <Button href={item.href} size="sm" variant="outline">
                              {item.action}
                            </Button>
                          {:else}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isProjectArchived}
                              onclick={() => openProjectAttentionAction(item)}
                            >
                              {item.action}
                            </Button>
                          {/if}
                        </div>
                      </article>
                    {/each}
                  </div>
                {:else}
                  <p class="text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.projects.noAttentionTitle)}
                  </p>
                {/if}
              </section>

              <section class="console-side-panel space-y-2">
                <h2 class="text-sm font-semibold">{$t(i18nKeys.common.domain.status)}</h2>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.projects.healthSummaryGap)}
                </p>
              </section>
            </aside>
          </section>

          <section class="console-panel space-y-5 p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <Gauge class="size-5 text-muted-foreground" />
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.runtimeUsage.monitorTitle)}
                  </h2>
                </div>
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.runtimeUsage.monitorDescription)}
                </p>
              </div>
              {#if projectEnvironments.length > 0}
                <div
                  class="grid gap-1 text-sm sm:w-64"
                  data-project-monitor-environment-select
                >
                  <span class="font-medium">{$t(i18nKeys.common.domain.environment)}</span>
                  <Select.Root bind:value={selectedMonitoringEnvironmentId} type="single">
                    <Select.Trigger class="w-full min-w-0">
                      {selectedMonitoringEnvironment?.name ?? $t(i18nKeys.console.projects.noEnvironment)}
                    </Select.Trigger>
                    <Select.Content>
                      {#each projectEnvironments as environment (environment.id)}
                        <Select.Item value={environment.id}>{environment.name}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
              {/if}
            </div>

            <div class="grid min-w-0 gap-4 xl:grid-cols-2">
              <article class="console-subtle-panel min-w-0 p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate text-sm font-semibold">
                      {$t(i18nKeys.common.domain.project)} · {project.name}
                    </h3>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {#if projectRuntimeMonitoringRollupQuery.isPending}
                        {$t(i18nKeys.console.runtimeUsage.rollupLoading)}
                      {:else if projectMonitoringRollupSummary}
                        {$t(i18nKeys.console.runtimeUsage.rollupBucket, {
                          bucket: projectMonitoringRollupSummary.bucket,
                        })}
                      {:else}
                        {$t(i18nKeys.console.runtimeUsage.rollupUnavailable)}
                      {/if}
                    </p>
                  </div>
                  <Badge class="w-fit shrink-0" variant="outline">
                    {$t(i18nKeys.console.runtimeUsage.rollupTitle)}
                  </Badge>
                </div>

                <div class="mt-4 grid gap-2 sm:grid-cols-3">
                  {#each monitoringSignalItems(projectRuntimeMonitoringRollup) as signal (signal.key)}
                    <div class="rounded-md bg-background p-3">
                      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {signal.label}
                      </p>
                      <p class="mt-1 text-sm font-semibold">
                        {signal.value ?? $t(i18nKeys.console.runtimeUsage.unavailable)}
                      </p>
                    </div>
                  {/each}
                </div>

                {#if projectMonitoringTopContributors.length > 0}
                  <ul class="mt-4 space-y-2">
                    {#each projectMonitoringTopContributors as contributor (contributor.scope.kind + contributor.scopeId)}
                      <li class="text-xs">
                        <a class="font-medium hover:underline" href={contributor.href}>
                          {contributor.scope.kind} · {contributor.scopeId}
                        </a>
                        <span class="text-muted-foreground">
                          · {$t(i18nKeys.console.runtimeUsage.rollupContributorSamples, {
                            count: contributor.sampleCount,
                          })}
                        </span>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </article>

              <article class="console-subtle-panel min-w-0 p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate text-sm font-semibold">
                      {$t(i18nKeys.common.domain.environment)} · {selectedMonitoringEnvironment?.name ??
                        $t(i18nKeys.console.projects.noEnvironment)}
                    </h3>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {#if projectEnvironments.length === 0}
                        {$t(i18nKeys.console.projects.noEnvironment)}
                      {:else if environmentRuntimeMonitoringRollupQuery.isPending}
                        {$t(i18nKeys.console.runtimeUsage.rollupLoading)}
                      {:else if environmentMonitoringRollupSummary}
                        {$t(i18nKeys.console.runtimeUsage.rollupBucket, {
                          bucket: environmentMonitoringRollupSummary.bucket,
                        })}
                      {:else}
                        {$t(i18nKeys.console.runtimeUsage.rollupUnavailable)}
                      {/if}
                    </p>
                  </div>
                  <Badge class="w-fit shrink-0" variant="outline">
                    {$t(i18nKeys.console.runtimeUsage.rollupTitle)}
                  </Badge>
                </div>

                <div class="mt-4 grid gap-2 sm:grid-cols-3">
                  {#each monitoringSignalItems(environmentRuntimeMonitoringRollup) as signal (signal.key)}
                    <div class="rounded-md bg-background p-3">
                      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {signal.label}
                      </p>
                      <p class="mt-1 text-sm font-semibold">
                        {signal.value ?? $t(i18nKeys.console.runtimeUsage.unavailable)}
                      </p>
                    </div>
                  {/each}
                </div>

                {#if environmentMonitoringTopContributors.length > 0}
                  <ul class="mt-4 space-y-2">
                    {#each environmentMonitoringTopContributors as contributor (contributor.scope.kind + contributor.scopeId)}
                      <li class="text-xs">
                        <a class="font-medium hover:underline" href={contributor.href}>
                          {contributor.scope.kind} · {contributor.scopeId}
                        </a>
                        <span class="text-muted-foreground">
                          · {$t(i18nKeys.console.runtimeUsage.rollupContributorSamples, {
                            count: contributor.sampleCount,
                          })}
                        </span>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </article>
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content
          value="resources"
          class={detailTabPanelScrollClass}
        >
          <section class="space-y-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.resourcesTitle)}</h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.resourcesDescription)}
                </p>
              </div>
              <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label class="grid gap-1 text-sm sm:w-64" for="project-resource-filter">
                  <span class="font-medium">{$t(i18nKeys.console.projects.resourceSearchLabel)}</span>
                  <Input
                    id="project-resource-filter"
                    bind:value={resourceFilterQuery}
                    autocomplete="off"
                    placeholder={$t(i18nKeys.console.projects.resourceSearchPlaceholder)}
                  />
                </label>
                {#if projectEnvironments.length > 0}
                  <div
                    class="grid gap-1 text-sm sm:w-56"
                    data-project-resource-environment-filter
                  >
                    <span class="font-medium">
                      {$t(i18nKeys.console.projects.environmentFilterLabel)}
                    </span>
                    <Select.Root bind:value={resourceEnvironmentFilter} type="single">
                      <Select.Trigger class="w-full min-w-0">
                        {selectedResourceEnvironmentFilterLabel}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="all">
                          {$t(i18nKeys.console.projects.allEnvironments)}
                        </Select.Item>
                        {#each projectEnvironments as environment (environment.id)}
                          <Select.Item value={environment.id}>{environment.name}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </div>
                {/if}
                <CapabilityGate
                  operationKey="resources.create"
                  resourceRefs={{ projectId: project.id }}
                >
                  {#snippet children({ disabled })}
                    <Button
                      type="button"
                      onclick={openProjectQuickDeploy}
                      disabled={disabled || isProjectArchived}
                    >
                      <Plus class="size-4" />
                      {$t(i18nKeys.console.projects.addResourceAction)}
                    </Button>
                  {/snippet}
                </CapabilityGate>
              </div>
            </div>

            {#if domainBindingFeedback}
              <div
                class={[
                  "rounded-md border px-3 py-2 text-sm",
                  domainBindingFeedback.kind === "success"
                    ? "border-primary/25 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5 text-destructive",
                ]}
              >
                <p class="font-medium">{domainBindingFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{domainBindingFeedback.detail}</p>
              </div>
            {/if}

            <ResourceListTable
              resources={filteredProjectResources}
              {deployments}
              domainBindings={projectDomainBindings}
              environments={projectEnvironments}
              emptyTitle={$t(i18nKeys.console.projects.noResourcesShort)}
              emptyDescription={projectResources.length === 0
                ? $t(i18nKeys.console.projects.noResources)
                : $t(i18nKeys.console.projects.noFilteredResources)}
              createAction={openProjectQuickDeploy}
              createLabel={$t(i18nKeys.console.projects.addResourceAction)}
              createDisabled={isProjectArchived}
              onDeployResource={openProjectResourceDeploymentDialog}
              onDomainBindingVerificationFeedback={(feedback) => {
                domainBindingFeedback = feedback;
              }}
              showEnvironment
            />
          </section>
        </Tabs.Content>

        <Tabs.Content
          value="previews"
          class={detailTabPanelScrollClass}
        >
          <section class="space-y-6">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.projects.previewTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.productGradePreviews}
                    ariaLabel={$t(i18nKeys.common.actions.openDocumentation)}
                  />
                </div>
                <p class="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.projects.previewDescription)}
                </p>
              </div>
              <Badge variant="outline">
                {projectPreviewEnvironments.length + projectPreviewResources.length}
              </Badge>
            </div>

            <dl class="console-metric-strip sm:grid-cols-3">
              <div>
                <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {$t(i18nKeys.console.projects.previewEnvironmentsTitle)}
                </dt>
                <dd class="mt-1 text-2xl font-semibold">{projectPreviewEnvironments.length}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {$t(i18nKeys.console.projects.previewResourcesTitle)}
                </dt>
                <dd class="mt-1 text-2xl font-semibold">{projectPreviewResources.length}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {$t(i18nKeys.console.projects.previewEnvironmentCountTitle)}
                </dt>
                <dd class="mt-1 text-2xl font-semibold">{projectPreviewEnvironmentIds.size}</dd>
              </div>
            </dl>

            <div class="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <section class="space-y-3">
                <div>
                  <h3 class="text-base font-semibold">
                    {$t(i18nKeys.console.projects.previewEnvironmentsTitle)}
                  </h3>
                  <p class="mt-1 text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.projects.previewEnvironmentsDescription)}
                  </p>
                </div>

                {#if projectPreviewEnvironmentsQuery.isPending}
                  <div class="space-y-3">
                    {#each Array.from({ length: 3 }) as _, index (index)}
                      <Skeleton class="h-20 w-full" />
                    {/each}
                  </div>
                {:else if projectPreviewEnvironments.length > 0}
                  <div class="console-record-list">
                    {#each projectPreviewEnvironments as previewEnvironment (previewEnvironment.previewEnvironmentId)}
                      {@const previewResource = findResource(
                        projectPreviewResources,
                        previewEnvironment.resourceId,
                      )}
                      {@const previewEnvironmentRecord = findEnvironment(
                        projectEnvironments,
                        previewEnvironment.environmentId,
                      )}
                      <a
                        href={previewResource
                          ? resourcePreviewEnvironmentDetailHref(
                              previewResource,
                              previewEnvironment.previewEnvironmentId,
                            )
                          : previewEnvironmentDetailHref(previewEnvironment.previewEnvironmentId)}
                        class="console-record-row block"
                      >
                        <div class="flex flex-wrap items-start justify-between gap-3">
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium">
                              {previewEnvironment.source.repositoryFullName}
                              <span class="text-muted-foreground">
                                #{previewEnvironment.source.pullRequestNumber}
                              </span>
                            </p>
                            <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                              {previewEnvironment.previewEnvironmentId}
                            </p>
                            <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                              {previewEnvironment.source.sourceBindingFingerprint}
                            </p>
                          </div>
                          <Badge variant={previewEnvironmentStatusVariant(previewEnvironment.status)}>
                            {$t(previewEnvironmentStatusLabelKey(previewEnvironment.status))}
                          </Badge>
                        </div>
                        <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {$t(i18nKeys.common.domain.environment)} · {previewEnvironmentRecord?.name ??
                              previewEnvironment.environmentId}
                          </span>
                          <span>
                            {$t(i18nKeys.common.domain.resource)} · {previewResource?.name ??
                              previewEnvironment.resourceId}
                          </span>
                          <span>
                            {$t(i18nKeys.console.previewEnvironments.updatedAt)} · {formatTime(
                              previewEnvironment.updatedAt,
                            )}
                          </span>
                          <span>
                            {$t(i18nKeys.console.previewEnvironments.expiresAt)} · {previewEnvironment.expiresAt
                              ? formatTime(previewEnvironment.expiresAt)
                              : $t(i18nKeys.console.previewEnvironments.noExpiry)}
                          </span>
                        </div>
                      </a>
                    {/each}
                  </div>
                {:else}
                  <div class="console-subtle-panel px-4 py-6">
                    <div class="flex items-start gap-3">
                      <GitPullRequestArrow class="mt-0.5 size-4 text-muted-foreground" />
                      <div class="space-y-1">
                        <p class="text-sm font-medium">
                          {$t(i18nKeys.console.projects.noPreviewEnvironmentsTitle)}
                        </p>
                        <p class="text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.projects.noPreviewEnvironments)}
                        </p>
                      </div>
                    </div>
                  </div>
                {/if}
              </section>

              <section class="space-y-3">
                <div>
                  <h3 class="text-base font-semibold">
                    {$t(i18nKeys.console.projects.previewResourcesTitle)}
                  </h3>
                  <p class="mt-1 text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.projects.previewResourcesDescription)}
                  </p>
                </div>

                {#if projectPreviewResourcesQuery.isPending}
                  <div class="space-y-3">
                    {#each Array.from({ length: 3 }) as _, index (index)}
                      <Skeleton class="h-20 w-full" />
                    {/each}
                  </div>
                {:else}
                  <ResourceListTable
                    resources={projectPreviewResources}
                    deployments={deployments}
                    domainBindings={projectDomainBindings}
                    environments={projectEnvironments}
                    emptyTitle={$t(i18nKeys.console.projects.noPreviewResourcesTitle)}
                    emptyDescription={$t(i18nKeys.console.projects.noPreviewResources)}
                    onDomainBindingVerificationFeedback={(feedback) => {
                      domainBindingFeedback = feedback;
                    }}
                    showEnvironment
                  />
                {/if}
              </section>
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content
          value="environments"
          class={detailTabPanelScrollClass}
        >
          <section class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.projects.environmentsTitle)}
                  </h2>
                  <DocsHelpLink
                    href={webDocsHrefs.environmentLifecycle}
                    ariaLabel={$t(i18nKeys.common.actions.openDocumentation)}
                  />
                </div>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.environmentsDescription)}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{projectEnvironments.length}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isProjectArchived}
                  onclick={openEnvironmentCreateDialog}
                >
                  <Plus class="size-4" />
                  {$t(i18nKeys.console.projects.environmentCreateAction)}
                </Button>
              </div>
            </div>

            <div class="grid gap-4 xl:grid-cols-2">
              {#if projectEnvironments.length > 0}
                {#each projectEnvironments as environment (environment.id)}
                  <article class="console-panel p-5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 space-y-1">
                        <div class="flex min-w-0 flex-wrap items-center gap-2">
                          <p class="truncate text-base font-semibold">{environment.name}</p>
                          <Badge variant="secondary">{environment.kind}</Badge>
                          {#if environment.lifecycleStatus === "archived"}
                            <Badge variant="destructive">
                              {$t(i18nKeys.console.projects.environmentArchived)}
                            </Badge>
                          {:else if environment.lifecycleStatus === "locked"}
                            <Badge variant="outline">
                              {$t(i18nKeys.console.projects.environmentLocked)}
                            </Badge>
                          {/if}
                        </div>
                        <p class="text-sm text-muted-foreground">
                          {$t(i18nKeys.console.projects.environmentCount, {
                            count: environment.maskedVariables.length,
                          })}
                        </p>
                        {#if environment.archivedAt}
                          <p class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.projects.environmentArchivedAt)} · {formatTime(
                              environment.archivedAt,
                            )}
                          </p>
                        {:else if environment.lockedAt}
                          <p class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.projects.environmentLockedAt)} · {formatTime(
                              environment.lockedAt,
                            )}
                          </p>
                        {/if}
                      </div>
                      <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isProjectArchived || environment.lifecycleStatus !== "active"}
                          onclick={() => openEnvironmentRenameDialog(environment)}
                        >
                          <Pencil class="size-4" />
                          {$t(i18nKeys.console.projects.environmentRenameAction)}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isProjectArchived || environment.lifecycleStatus !== "active"}
                          onclick={() => openEnvironmentCloneDialog(environment)}
                        >
                          <Copy class="size-4" />
                          {$t(i18nKeys.console.projects.environmentCloneAction)}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onclick={() => openEnvironmentLifecycleDialog(environment)}
                        >
                          <Gauge class="size-4" />
                          {$t(i18nKeys.console.projects.lifecycleManageAction)}
                        </Button>
                      </div>
                    </div>
                    <p class="mt-4 text-sm leading-6 text-muted-foreground">
                      {$t(i18nKeys.console.projects.environmentManageDescription)}
                    </p>
                    <ConsoleExtensionPanelHost
                      class="mt-4"
                      placement="project-environment-panel"
                      {projectId}
                      environmentId={environment.id}
                    />
                  </article>
                {/each}
              {:else}
                <div class="console-subtle-panel px-4 py-6 xl:col-span-2">
                  <div class="flex items-start gap-3">
                    <FolderOpen class="mt-0.5 size-4 text-muted-foreground" />
                    <div class="space-y-2">
                      <p class="text-sm font-medium">{$t(i18nKeys.console.projects.noEnvironment)}</p>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isProjectArchived}
                        onclick={openEnvironmentCreateDialog}
                      >
                        <Plus class="size-4" />
                        {$t(i18nKeys.console.projects.environmentCreateAction)}
                      </Button>
                    </div>
                  </div>
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
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.projects.recentDeploymentsTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.recentDeploymentsDescription)}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                {#if projectDeployments.length > 0}
                  <CapabilityGate
                    operationKey="resources.create"
                    resourceRefs={{ projectId: project.id }}
                  >
                    {#snippet children({ disabled })}
                      <Button
                        type="button"
                        data-testid="project-deployments-open-deploy"
                        onclick={openProjectDeploymentAction}
                        disabled={disabled || isProjectArchived}
                      >
                        <Play class="size-4" />
                        {primaryResource
                          ? $t(i18nKeys.common.actions.createDeployment)
                          : $t(i18nKeys.console.projects.addResourceAction)}
                      </Button>
                    {/snippet}
                  </CapabilityGate>
                {/if}
              </div>
            </div>

            {#if projectDeployments.length > 0}
              <DeploymentTable
                deployments={projectDeployments}
                {environments}
                {resources}
                showProject={false}
                showServer={false}
              />
            {:else}
              <div class="console-subtle-panel px-4 py-6">
                <div class="flex items-start gap-3">
                  <FolderOpen class="mt-0.5 size-4 text-muted-foreground" />
                  <div class="space-y-2">
                    <p class="text-sm font-medium">
                      {$t(i18nKeys.console.projects.noProjectDeploymentTitle)}
                    </p>
                    <p class="text-sm text-muted-foreground">
                      {$t(i18nKeys.console.projects.noProjectDeploymentBody)}
                    </p>
                    <CapabilityGate
                      operationKey="resources.create"
                      resourceRefs={{ projectId: project.id }}
                    >
                      {#snippet children({ disabled })}
                        <Button
                          size="sm"
                          type="button"
                          data-testid="project-deployments-empty-open-deploy"
                          onclick={openProjectDeploymentAction}
                          disabled={disabled || isProjectArchived}
                        >
                          <Play class="size-4" />
                          {primaryResource
                            ? $t(i18nKeys.common.actions.createDeployment)
                            : $t(i18nKeys.console.projects.addResourceAction)}
                        </Button>
                      {/snippet}
                    </CapabilityGate>
                  </div>
                </div>
              </div>
            {/if}
          </section>
        </Tabs.Content>

        <Tabs.Content
          value="activity"
          class={detailTabPanelScrollClass}
          data-project-activity-display-surface
        >
          <section class="console-panel space-y-5 p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="space-y-1">
                <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.activityTitle)}</h2>
                <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.projects.activityDescription)}
                </p>
              </div>
            </div>

            <div class="console-subtle-panel px-4 py-6" data-project-activity-read-model-gap>
              <div class="flex items-start gap-3">
                <Search class="mt-0.5 size-4 text-muted-foreground" />
                <div class="space-y-2">
                  <p class="text-sm font-medium">
                    {$t(i18nKeys.console.projects.activityGapTitle)}
                  </p>
                  <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.projects.activityGapDescription)}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <Button href={projectTabHref("resources")} size="sm" variant="outline">
                      {$t(i18nKeys.common.domain.resources)}
                    </Button>
                    <Button href={projectTabHref("deployments")} size="sm" variant="outline">
                      {$t(i18nKeys.common.domain.deployments)}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content
          value="settings"
          class={detailTabPanelSubnavClass}
          data-project-settings-display-surface
        >
          <div class={[detailSubnavLayoutClass, "md:grid-cols-[13rem_minmax(0,1fr)]"]}>
            <ConsoleDetailSubnav
              ariaLabel={$t(i18nKeys.console.projects.settingsTitle)}
              items={projectSettingsSubnavItems}
            />

            <div class={detailSubnavContentClass}>
              {#if activeProjectSettingsSection === "general"}
                <section class="space-y-4" data-project-settings-general>
                  <section class="console-panel space-y-4 p-5">
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.projects.generalSettingsTitle)}
                        </h2>
                        <DocsHelpLink
                          href={webDocsHrefs.projectLifecycle}
                          ariaLabel={$t(i18nKeys.common.actions.openDocumentation)}
                        />
                      </div>
                      <p class="text-sm text-muted-foreground">
                        {$t(i18nKeys.console.projects.settingsDescription)}
                      </p>
                    </div>

                    {#if lifecycleFeedback}
                      <div
                        class={`rounded-md border px-3 py-2 text-sm ${
                          lifecycleFeedback.kind === "success"
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-destructive/20 bg-destructive/5 text-destructive"
                        }`}
                      >
                        <p class="font-medium">{lifecycleFeedback.title}</p>
                        <p class="mt-1 opacity-80">{lifecycleFeedback.detail}</p>
                      </div>
                    {/if}

                    <dl class="grid gap-4 sm:grid-cols-2">
                      <div class="rounded-md border bg-background p-3">
                        <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {$t(i18nKeys.console.projects.renameLabel)}
                        </dt>
                        <dd class="mt-1 truncate text-sm font-medium">{project.name}</dd>
                      </div>
                      <div class="rounded-md border bg-background p-3">
                        <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {$t(i18nKeys.console.projects.settingsSlugLabel)}
                        </dt>
                        <dd class="mt-1 truncate font-mono text-sm">{project.slug}</dd>
                      </div>
                      <div class="rounded-md border bg-background p-3 sm:col-span-2">
                        <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          ID
                        </dt>
                        <dd class="mt-1 break-all font-mono text-sm">{project.id}</dd>
                      </div>
                      <div class="rounded-md border bg-background p-3 sm:col-span-2">
                        <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {$t(i18nKeys.console.projects.settingsDescriptionLabel)}
                        </dt>
                        <dd class="mt-1 text-sm">
                          {project.description ?? $t(i18nKeys.console.projects.noDescription)}
                        </dd>
                      </div>
                    </dl>

                    <CapabilityGate
                      operationKey="projects.rename"
                      resourceRefs={{ projectId: project.id }}
                    >
                      {#snippet children({ disabled })}
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled || isProjectArchived}
                          onclick={openProjectRenameDialog}
                        >
                          <Pencil class="size-4" />
                          {$t(i18nKeys.console.projects.settingsEditProjectAction)}
                        </Button>
                      {/snippet}
                    </CapabilityGate>
                  </section>

                  <section class="console-panel space-y-4 p-5">
                    <div class="space-y-1">
                      <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.lifecycleTitle)}</h2>
                      <p class="text-sm text-muted-foreground">
                        {$t(i18nKeys.console.projects.settingsLifecycleDescription)}
                      </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <Badge variant={isProjectArchived ? "destructive" : "secondary"}>
                        {isProjectArchived
                          ? $t(i18nKeys.console.projects.archived)
                          : $t(i18nKeys.console.projects.active)}
                      </Badge>
                      {#if project.archivedAt}
                        <span class="text-sm text-muted-foreground">
                          {$t(i18nKeys.console.projects.archivedAt)} · {formatTime(project.archivedAt)}
                        </span>
                      {/if}
                    </div>
                  </section>

                  <section class="console-panel space-y-4 p-5" data-project-settings-archived-resources>
                    <div class="space-y-1">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.projects.archivedResourcesTitle)}
                        </h2>
                        <Badge variant="outline">
                          {$t(i18nKeys.console.projects.archivedResourcesCount, {
                            count: projectArchivedResources.length,
                          })}
                        </Badge>
                      </div>
                      <p class="text-sm text-muted-foreground">
                        {$t(i18nKeys.console.projects.archivedResourcesDescription)}
                      </p>
                    </div>

                    {#if projectArchivedResources.length > 0}
                      <div class="console-record-list">
                        {#each projectArchivedResources as resource (resource.id)}
                          {@const environment = findEnvironment(projectEnvironments, resource.environmentId)}
                          <a
                            href={resourceDetailHref(resource)}
                            class="console-record-row block underline-offset-4 hover:underline"
                          >
                            <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div class="min-w-0">
                                <div class="flex min-w-0 flex-wrap items-center gap-2">
                                  <span class="truncate text-sm font-medium">{resource.name}</span>
                                  <Badge variant="secondary">{resource.kind}</Badge>
                                  <Badge variant="destructive">
                                    {$t(i18nKeys.console.projects.archived)}
                                  </Badge>
                                </div>
                                <p class="mt-1 truncate text-xs text-muted-foreground">
                                  {environment?.name ?? resource.environmentId}
                                </p>
                              </div>
                              <div class="shrink-0 text-xs text-muted-foreground">
                                {#if resource.archivedAt}
                                  {$t(i18nKeys.console.projects.archivedAt)} · {formatTime(resource.archivedAt)}
                                {:else}
                                  {resource.id}
                                {/if}
                              </div>
                            </div>
                          </a>
                        {/each}
                      </div>
                    {:else}
                      <div class="rounded-md border border-dashed px-4 py-4 text-sm text-muted-foreground">
                        {$t(i18nKeys.console.projects.archivedResourcesEmpty)}
                      </div>
                    {/if}
                  </section>

                  <section class="console-panel space-y-4 p-5" data-project-preview-policy-link>
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0 space-y-1">
                        <h2 class="text-lg font-semibold">
                          {$t(i18nKeys.console.projects.previewPolicyTitle)}
                        </h2>
                        <p class="text-sm leading-6 text-muted-foreground">
                          {$t(i18nKeys.console.projects.previewPolicyDescription)}
                        </p>
                      </div>
                      <Button href={projectPreviewPolicyHref()} variant="outline">
                        <ShieldCheck class="size-4" />
                        {$t(i18nKeys.console.projects.previewPolicyAction)}
                      </Button>
                    </div>
                  </section>
                </section>
              {:else if activeProjectSettingsSection === "danger"}
                <section
                  class="console-panel space-y-4 border-destructive/25 bg-destructive/5 p-5"
                  data-project-danger-display-surface
                >
                  <div class="space-y-1">
                    <h2 class="text-lg font-semibold text-destructive">
                      {$t(i18nKeys.console.projects.dangerZoneTitle)}
                    </h2>
                    <p class="text-sm leading-6 text-muted-foreground">
                      {$t(i18nKeys.console.projects.dangerZoneDescription)}
                    </p>
                  </div>

                  {#if isProjectArchived}
                    <div class="rounded-md border border-destructive/20 bg-background px-3 py-2 text-sm text-destructive">
                      {$t(i18nKeys.console.projects.archiveNotice)}
                    </div>
                  {/if}

                  <div class="rounded-md border bg-background px-3 py-2 text-sm">
                    <p class="font-medium">
                      {isProjectArchived
                        ? $t(i18nKeys.console.projects.archived)
                        : $t(i18nKeys.console.projects.active)}
                    </p>
                    {#if project.archivedAt}
                      <p class="mt-1 text-muted-foreground">
                        {$t(i18nKeys.console.projects.archivedAt)} · {formatTime(project.archivedAt)}
                      </p>
                    {:else}
                      <p class="mt-1 text-muted-foreground">
                        {$t(i18nKeys.console.projects.settingsLifecycleDescription)}
                      </p>
                    {/if}
                    {#if projectDeleteBlockerCount > 0}
                      <p class="mt-2 text-destructive">
                        {$t(i18nKeys.console.projects.deleteBlocked, {
                          count: projectDeleteBlockerCount,
                        })}
                      </p>
                      <ul class="mt-2 space-y-1 text-xs text-destructive">
                        {#each projectDeleteBlockers as blocker}
                          <li class="break-all font-mono">
                            {blocker.kind}
                            {#if typeof blocker.count === "number"}
                              · {blocker.count}
                            {/if}
                            {#if blocker.relatedEntityType}
                              · {blocker.relatedEntityType}
                            {/if}
                            {#if blocker.relatedEntityId}
                              · {blocker.relatedEntityId}
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {:else if projectDeleteSafetyLoading}
                      <p class="mt-2 text-muted-foreground">
                        {$t(i18nKeys.console.projects.deleteCheckLoading)}
                      </p>
                    {:else if projectDeleteSafetyQuery.error}
                      <p class="mt-2 break-words text-destructive">
                        {readErrorMessage(projectDeleteSafetyQuery.error)}
                      </p>
                    {/if}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    class="w-full justify-start sm:w-fit"
                    onclick={openProjectLifecycleDialog}
                  >
                    <Archive class="size-4" />
                    {$t(i18nKeys.console.projects.lifecycleManageAction)}
                  </Button>
                </section>
              {/if}
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>

    <Dialog.Root bind:open={quickDeployDialogOpen} onOpenChange={setQuickDeployDialogOpen}>
      <Dialog.Content
        closeLabel={$t(i18nKeys.common.actions.close)}
        showCloseButton={!quickDeployProgressDialogOpen}
        class={quickDeployProgressDialogOpen ? "max-w-6xl border-0 bg-transparent shadow-none" : "max-w-7xl"}
      >
        {#if !quickDeployProgressDialogOpen}
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.common.actions.quickDeploy)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.projects.detailDescription)}
            </Dialog.Description>
          </Dialog.Header>
        {/if}
        <div
          class={quickDeployProgressDialogOpen
            ? "px-4 pb-4 pt-4"
            : "max-h-[calc(100vh-12rem)] overflow-y-auto px-5 pb-5"}
        >
          <QuickDeploySheet
            lockedProjectId={project.id}
            lockedProjectName={project.name}
            statePath={page.url.pathname}
            stateBaseSearch={projectModalBaseSearch()}
            stateModal="quick-deploy"
            onClose={closeQuickDeployDialog}
            onProgressDialogOpenChange={(open) => {
              quickDeployProgressDialogOpen = open;
            }}
          />
        </div>
      </Dialog.Content>
    </Dialog.Root>

    <Dialog.Root
      bind:open={projectResourceDeploymentDialogOpen}
      onOpenChange={setProjectResourceDeploymentDialogOpen}
    >
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-6xl">
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.common.actions.createDeployment)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.resources.newDeploymentDescription)}
          </Dialog.Description>
        </Dialog.Header>

        {#if selectedProjectResourceDeployment}
          <form
            class="max-h-[calc(100vh-12rem)] overflow-y-auto px-5 pb-5"
            onsubmit={createProjectResourceDeployment}
            data-project-resource-deployment-create-dialog
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
                      <Select.Root bind:value={projectResourceDeploymentServerId} type="single">
                        <Select.Trigger class="w-full">
                          {selectedProjectResourceDeploymentServer?.name ??
                            $t(i18nKeys.console.domainBindings.noServerOptions)}
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
                        bind:value={projectResourceDeploymentDestinationId}
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
                    {#if selectedProjectResourceDeploymentSource}
                      <div class="divide-y rounded-md border bg-background">
                        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                          <p class="min-w-0 truncate text-sm font-medium">
                            {selectedProjectResourceDeploymentSource.displayName}
                          </p>
                          <Badge variant="secondary">
                            {selectedProjectResourceDeploymentSource.kind}
                          </Badge>
                        </div>
                        <p class="truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                          {selectedProjectResourceDeploymentSource.locator}
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
                      disabled={!canPreviewProjectResourceDeploymentPlan}
                      onclick={previewProjectResourceDeploymentPlan}
                    >
                      <Eye class="size-4" />
                      {projectResourceDeploymentPlanPending
                        ? $t(i18nKeys.console.resources.newDeploymentPlanPending)
                        : $t(i18nKeys.console.resources.newDeploymentPlanAction)}
                    </Button>

                    {#if projectResourceDeploymentPlanError}
                      <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        <p class="font-medium">
                          {$t(i18nKeys.console.resources.newDeploymentPlanErrorTitle)}
                        </p>
                        <p class="mt-1 break-all text-xs">
                          {projectResourceDeploymentPlanError}
                        </p>
                      </div>
                    {/if}

                    {#if projectResourceDeploymentPlanPreview}
                      <div class="divide-y rounded-md border bg-background">
                        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium">
                              {projectResourceDeploymentPlanPreview.source.framework ??
                                projectResourceDeploymentPlanPreview.source.runtimeFamily ??
                                projectResourceDeploymentPlanPreview.source.kind}
                            </p>
                            <p class="mt-1 truncate text-xs text-muted-foreground">
                              {projectResourceDeploymentPlanPreview.source.displayName}
                            </p>
                          </div>
                          <Badge
                            variant={projectResourceDeploymentPlanPreview.readiness.ready
                              ? "secondary"
                              : "outline"}
                          >
                            {projectResourceDeploymentPlanStatusLabel(
                              projectResourceDeploymentPlanPreview.readiness.status,
                            )}
                          </Badge>
                        </div>

                        <dl class="grid gap-3 px-4 py-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt class="text-muted-foreground">
                              {$t(i18nKeys.console.resources.newDeploymentPlanPlanner)}
                            </dt>
                            <dd class="mt-1 font-medium">
                              {projectResourceDeploymentPlanPreview.planner.plannerKey} · {projectResourceDeploymentPlanPreview.planner.supportTier}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-muted-foreground">
                              {$t(i18nKeys.console.resources.newDeploymentPlanArtifact)}
                            </dt>
                            <dd class="mt-1 font-medium">
                              {projectResourceDeploymentPlanPreview.artifact.kind}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-muted-foreground">
                              {$t(i18nKeys.console.resources.newDeploymentPlanNetworkHealth)}
                            </dt>
                            <dd class="mt-1 font-medium">
                              {projectResourceDeploymentPlanPreview.network.internalPort ?? "-"} · {projectResourceDeploymentPlanPreview.health.kind}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-muted-foreground">
                              {$t(i18nKeys.console.resources.generatedAccessRoute)}
                            </dt>
                            <dd class="mt-1 font-medium">
                              {projectResourceDeploymentPlanPreview.access?.hostname ?? "-"}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    {/if}

                    {#if projectResourceDeploymentFeedback}
                      <div
                        class={[
                          "rounded-md border px-3 py-2 text-sm",
                          projectResourceDeploymentFeedback.kind === "success"
                            ? "border-primary/25 bg-primary/5"
                            : "border-destructive/30 bg-destructive/5 text-destructive",
                        ]}
                      >
                        <p class="font-medium">{projectResourceDeploymentFeedback.title}</p>
                        <p class="mt-1 break-all text-xs">
                          {projectResourceDeploymentFeedback.detail}
                        </p>
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
                    <dd class="truncate font-medium">{project.name}</dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">
                      {$t(i18nKeys.common.domain.environment)}
                    </dt>
                    <dd class="truncate font-medium">
                      {selectedProjectResourceDeploymentEnvironment?.name ??
                        selectedProjectResourceDeployment.environmentId}
                    </dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</dt>
                    <dd class="min-w-0">
                      <p class="truncate font-medium">{selectedProjectResourceDeployment.name}</p>
                      <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {selectedProjectResourceDeployment.id}
                      </p>
                    </dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.server)}</dt>
                    <dd class="truncate font-medium">
                      {(selectedProjectResourceDeploymentServer?.name ??
                        projectResourceDeploymentServerId) || "-"}
                    </dd>
                  </div>
                  <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
                    <dt class="text-muted-foreground">
                      {$t(i18nKeys.common.domain.destination)}
                    </dt>
                    <dd class="truncate font-medium">
                      {projectResourceDeploymentDestinationId || "-"}
                    </dd>
                  </div>
                </dl>
              </aside>
            </div>

            <Dialog.Footer class="mt-5 px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                onclick={() => setProjectResourceDeploymentDialogOpen(false)}
              >
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button type="submit" disabled={!canCreateProjectResourceDeployment}>
                <Play class="size-4" />
                {projectResourceDeploymentCreatePending
                  ? $t(i18nKeys.console.quickDeploy.submitPending)
                  : $t(i18nKeys.common.actions.createDeployment)}
              </Button>
            </Dialog.Footer>
          </form>
        {/if}
      </Dialog.Content>
    </Dialog.Root>

    <DeploymentProgressDialog
      open={projectResourceDeploymentProgressDialogOpen}
      status={projectResourceDeploymentProgressDialogStatus}
      events={projectResourceDeploymentProgressEvents}
      streamError={projectResourceDeploymentProgressStreamError}
      requestId={projectResourceDeploymentProgressRequestId}
      deploymentId={projectResourceDeploymentProgressDeploymentId}
      traceLink={projectResourceDeploymentProgressTraceLink}
      title={$t(i18nKeys.console.deployments.progressTitle)}
      description={$t(i18nKeys.console.deployments.progressDescription)}
      onClose={() => {
        projectResourceDeploymentProgressDialogOpen = false;
      }}
      onOpenDeployment={() => {
        void goto(projectResourceDeploymentProgressHref());
      }}
    />

    <Dialog.Root bind:open={projectLifecycleDialogOpen} onOpenChange={setProjectLifecycleDialogOpen}>
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <Dialog.Header>
          <Dialog.Title>
            {projectLifecycleDialogTitle(selectedProjectLifecycleAction)}
          </Dialog.Title>
          <Dialog.Description>
            {projectLifecycleDialogDescription(selectedProjectLifecycleAction)}
          </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4 px-5 py-4" data-project-lifecycle-dialog>
          <div class="rounded-md border bg-muted/30 p-3 text-sm">
            <p class="font-medium">{project.name}</p>
            <p class="mt-1 break-all font-mono text-muted-foreground">{project.id}</p>
            <p class="mt-1 text-muted-foreground">
              {$t(i18nKeys.console.projects.lifecycleTitle)} · {isProjectArchived
                ? $t(i18nKeys.console.projects.archived)
                : $t(i18nKeys.console.projects.active)}
            </p>
          </div>

          <div class="grid gap-2">
            {#if isProjectArchived}
              <Button
                type="button"
                variant={selectedProjectLifecycleAction === "restore" ? "default" : "outline"}
                class="h-auto w-full items-start justify-start gap-3 overflow-hidden px-3 py-3 text-left whitespace-normal"
                disabled={!canRestoreProjectByCapability || restoreProjectMutation.isPending}
                onclick={() => {
                  selectedProjectLifecycleAction = "restore";
                  projectDeleteConfirmation = "";
                  lifecycleFeedback = null;
                }}
              >
                <RotateCcw class="size-4 shrink-0" />
                <span class="min-w-0 flex-1">
                  <span class="block font-medium">
                    {$t(i18nKeys.console.projects.restoreAction)}
                  </span>
                  <span class="block break-words text-xs leading-5 font-normal opacity-80">
                    {$t(i18nKeys.console.projects.lifecycleRestoreOption)}
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant={selectedProjectLifecycleAction === "delete" ? "destructive" : "outline"}
                class="h-auto w-full items-start justify-start gap-3 overflow-hidden px-3 py-3 text-left whitespace-normal"
                disabled={!canDeleteProject || !canDeleteProjectByCapability ||
                  deleteProjectMutation.isPending}
                title={projectDeleteBlockerCount > 0
                  ? $t(i18nKeys.console.projects.deleteBlocked, {
                      count: projectDeleteBlockerCount,
                    })
                  : undefined}
                onclick={() => {
                  selectedProjectLifecycleAction = "delete";
                  lifecycleFeedback = null;
                }}
              >
                <Trash2 class="size-4 shrink-0" />
                <span class="min-w-0 flex-1">
                  <span class="block font-medium">
                    {$t(i18nKeys.console.projects.deleteAction)}
                  </span>
                  <span class="block break-words text-xs leading-5 font-normal opacity-80">
                    {$t(i18nKeys.console.projects.lifecycleDeleteOption)}
                  </span>
                </span>
              </Button>
            {:else}
              <Button
                type="button"
                variant={selectedProjectLifecycleAction === "archive" ? "destructive" : "outline"}
                class="h-auto w-full items-start justify-start gap-3 overflow-hidden px-3 py-3 text-left whitespace-normal"
                disabled={!canArchiveProjectByCapability || archiveProjectMutation.isPending}
                onclick={() => {
                  selectedProjectLifecycleAction = "archive";
                  projectDeleteConfirmation = "";
                  lifecycleFeedback = null;
                }}
              >
                <Archive class="size-4 shrink-0" />
                <span class="min-w-0 flex-1">
                  <span class="block font-medium">
                    {$t(i18nKeys.console.projects.archiveAction)}
                  </span>
                  <span class="block break-words text-xs leading-5 font-normal opacity-80">
                    {$t(i18nKeys.console.projects.lifecycleArchiveOption)}
                  </span>
                </span>
              </Button>
            {/if}
          </div>

          {#if selectedProjectLifecycleAction === "delete"}
            <label class="grid gap-1 text-sm" for="project-delete-confirmation">
              <span class="font-medium">{$t(i18nKeys.console.projects.deleteConfirmPrompt)}</span>
              <Input
                id="project-delete-confirmation"
                bind:value={projectDeleteConfirmation}
                autocomplete="off"
                placeholder={project.id}
                aria-invalid={projectDeleteConfirmation.length > 0 &&
                  projectDeleteConfirmation.trim() !== project.id}
              />
            </label>
            {#if projectDeleteBlockerCount > 0}
              <div class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <p class="font-medium">
                  {$t(i18nKeys.console.projects.deleteBlockedTitle)}
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {$t(i18nKeys.console.projects.deleteBlocked, {
                    count: projectDeleteBlockerCount,
                  })}
                </p>
                <ul class="mt-2 space-y-1 text-xs">
                  {#each projectDeleteBlockers as blocker}
                    <li class="break-all font-mono">
                      {blocker.kind}
                      {#if typeof blocker.count === "number"}
                        · {blocker.count}
                      {/if}
                      {#if blocker.relatedEntityType}
                        · {blocker.relatedEntityType}
                      {/if}
                      {#if blocker.relatedEntityId}
                        · {blocker.relatedEntityId}
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            {:else if projectDeleteSafetyLoading}
              <div class="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {$t(i18nKeys.console.projects.deleteCheckLoading)}
              </div>
            {:else if projectDeleteSafetyQuery.error}
              <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {readErrorMessage(projectDeleteSafetyQuery.error)}
              </div>
            {/if}
          {/if}

          {#if lifecycleFeedback?.kind === "error"}
            <div class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p class="font-medium text-destructive">{lifecycleFeedback.title}</p>
              <p class="mt-1 break-words text-destructive">{lifecycleFeedback.detail}</p>
            </div>
          {/if}
        </div>

        <Dialog.Footer class="border-t p-5">
          <Button type="button" variant="outline" onclick={() => setProjectLifecycleDialogOpen(false)}>
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button
            type="button"
            variant={selectedProjectLifecycleAction === "delete" || selectedProjectLifecycleAction === "archive"
              ? "destructive"
              : "default"}
            disabled={!canSubmitProjectLifecycleAction}
            onclick={submitProjectLifecycleAction}
          >
            {#if selectedProjectLifecycleAction === "restore"}
              <RotateCcw class="size-4" />
              {restoreProjectMutation.isPending
                ? $t(i18nKeys.common.actions.saving)
                : $t(i18nKeys.console.projects.restoreAction)}
            {:else if selectedProjectLifecycleAction === "delete"}
              <Trash2 class="size-4" />
              {deleteProjectMutation.isPending
                ? $t(i18nKeys.common.actions.saving)
                : $t(i18nKeys.console.projects.deleteAction)}
            {:else if selectedProjectLifecycleAction === "archive"}
              <Archive class="size-4" />
              {archiveProjectMutation.isPending
                ? $t(i18nKeys.common.actions.saving)
                : $t(i18nKeys.console.projects.archiveAction)}
            {:else}
              <Archive class="size-4" />
              {$t(i18nKeys.console.projects.lifecycleManageAction)}
            {/if}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>

    <Dialog.Root
      bind:open={environmentLifecycleDialogOpen}
      onOpenChange={setEnvironmentLifecycleDialogOpen}
    >
      {#if selectedEnvironment}
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
          <Dialog.Header>
            <Dialog.Title>
              {environmentLifecycleDialogTitle(selectedEnvironmentLifecycleAction)}
            </Dialog.Title>
            <Dialog.Description>
              {environmentLifecycleDialogDescription(selectedEnvironmentLifecycleAction)}
            </Dialog.Description>
          </Dialog.Header>

          <div class="space-y-4 px-5 py-4" data-project-environment-lifecycle-dialog>
            <div class="rounded-md border bg-muted/30 p-3 text-sm">
              <p class="font-medium">{selectedEnvironment.name}</p>
              <p class="mt-1 break-all font-mono text-muted-foreground">
                {selectedEnvironment.id}
              </p>
              <p class="mt-1 text-muted-foreground">
                {$t(i18nKeys.common.domain.environment)} · {selectedEnvironment.lifecycleStatus}
              </p>
            </div>

            <div class="grid gap-2 sm:grid-cols-2">
              {#if selectedEnvironment.lifecycleStatus === "locked"}
                <Button
                  type="button"
                  variant={selectedEnvironmentLifecycleAction === "unlock" ? "default" : "outline"}
                  class="h-auto justify-start px-3 py-3 text-left"
                  disabled={isProjectArchived || unlockEnvironmentMutation.isPending}
                  onclick={() => {
                    selectedEnvironmentLifecycleAction = "unlock";
                    lifecycleFeedback = null;
                  }}
                >
                  <Unlock class="size-4 shrink-0" />
                  <span class="min-w-0">
                    <span class="block font-medium">
                      {$t(i18nKeys.console.projects.environmentUnlockAction)}
                    </span>
                    <span class="block text-xs font-normal opacity-80">
                      {$t(i18nKeys.console.projects.environmentLifecycleUnlockOption)}
                    </span>
                  </span>
                </Button>
              {:else}
                <Button
                  type="button"
                  variant={selectedEnvironmentLifecycleAction === "lock" ? "default" : "outline"}
                  class="h-auto justify-start px-3 py-3 text-left"
                  disabled={isProjectArchived ||
                    selectedEnvironment.lifecycleStatus !== "active" ||
                    lockEnvironmentMutation.isPending}
                  onclick={() => {
                    selectedEnvironmentLifecycleAction = "lock";
                    lifecycleFeedback = null;
                  }}
                >
                  <Lock class="size-4 shrink-0" />
                  <span class="min-w-0">
                    <span class="block font-medium">
                      {$t(i18nKeys.console.projects.environmentLockAction)}
                    </span>
                    <span class="block text-xs font-normal opacity-80">
                      {$t(i18nKeys.console.projects.environmentLifecycleLockOption)}
                    </span>
                  </span>
                </Button>
              {/if}
              <Button
                type="button"
                variant={selectedEnvironmentLifecycleAction === "archive" ? "destructive" : "outline"}
                class="h-auto justify-start px-3 py-3 text-left"
                disabled={selectedEnvironment.lifecycleStatus === "archived" ||
                  archiveEnvironmentMutation.isPending}
                onclick={() => {
                  selectedEnvironmentLifecycleAction = "archive";
                  lifecycleFeedback = null;
                }}
              >
                <Archive class="size-4 shrink-0" />
                <span class="min-w-0">
                  <span class="block font-medium">
                    {$t(i18nKeys.console.projects.environmentArchiveAction)}
                  </span>
                  <span class="block text-xs font-normal opacity-80">
                    {$t(i18nKeys.console.projects.environmentLifecycleArchiveOption)}
                  </span>
                </span>
              </Button>
            </div>

            {#if lifecycleFeedback?.kind === "error"}
              <div class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p class="font-medium text-destructive">{lifecycleFeedback.title}</p>
                <p class="mt-1 break-words text-destructive">{lifecycleFeedback.detail}</p>
              </div>
            {/if}
          </div>

          <Dialog.Footer class="border-t p-5">
            <Button type="button" variant="outline" onclick={() => setEnvironmentLifecycleDialogOpen(false)}>
              {$t(i18nKeys.common.actions.cancel)}
            </Button>
            <Button
              type="button"
              variant={selectedEnvironmentLifecycleAction === "archive" ? "destructive" : "default"}
              disabled={!canSubmitEnvironmentLifecycleAction}
              onclick={submitEnvironmentLifecycleAction}
            >
              {#if selectedEnvironmentLifecycleAction === "unlock"}
                <Unlock class="size-4" />
                {unlockEnvironmentMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.console.projects.environmentUnlockAction)}
              {:else if selectedEnvironmentLifecycleAction === "lock"}
                <Lock class="size-4" />
                {lockEnvironmentMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.console.projects.environmentLockAction)}
              {:else}
                <Archive class="size-4" />
                {archiveEnvironmentMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.console.projects.environmentArchiveAction)}
              {/if}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      {/if}
    </Dialog.Root>

    <Dialog.Root bind:open={projectRenameDialogOpen}>
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.projects.settingsEditProjectAction)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.projects.settingsDescription)}
          </Dialog.Description>
        </Dialog.Header>
        <form
          class="space-y-5 px-5 pb-5"
          onsubmit={(event) => {
            event.preventDefault();
            renameProject();
          }}
        >
          <label class="grid gap-1 text-sm" for="project-rename-dialog-name">
            <span class="font-medium">{$t(i18nKeys.console.projects.renameLabel)}</span>
            <Input
              id="project-rename-dialog-name"
              bind:value={projectName}
              autocomplete="off"
              disabled={isProjectArchived || renameProjectMutation.isPending}
            />
          </label>
          <div class="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onclick={() => {
                projectRenameDialogOpen = false;
              }}
            >
              {$t(i18nKeys.common.actions.cancel)}
            </Button>
            <CapabilityGate
              operationKey="projects.rename"
              resourceRefs={{ projectId: project.id }}
            >
              {#snippet children({ disabled })}
                <Button
                  type="submit"
                  disabled={disabled || !canRenameProject || renameProjectMutation.isPending}
                >
                  <Save class="size-4" />
                  {renameProjectMutation.isPending
                    ? $t(i18nKeys.common.actions.saving)
                    : $t(i18nKeys.common.actions.save)}
                </Button>
              {/snippet}
            </CapabilityGate>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>

    <Dialog.Root bind:open={environmentCreateDialogOpen}>
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.projects.environmentCreateTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.projects.environmentCreateDescription)}
          </Dialog.Description>
        </Dialog.Header>
        <div class="px-5 pb-5">
          <EnvironmentCreateForm
            projectId={project.id}
            panel={false}
            showIntro={false}
            idPrefix="project-environment-create"
            onCreated={closeEnvironmentCreateDialog}
          />
        </div>
      </Dialog.Content>
    </Dialog.Root>

    <Dialog.Root bind:open={environmentRenameDialogOpen}>
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.projects.environmentRenameAction)}</Dialog.Title>
          <Dialog.Description>
            {selectedEnvironment?.name ?? $t(i18nKeys.common.domain.environment)}
          </Dialog.Description>
        </Dialog.Header>
        {#if selectedEnvironment}
          <form
            class="space-y-5 px-5 pb-5"
            onsubmit={(event) => {
              event.preventDefault();
              renameEnvironment(selectedEnvironment.id);
            }}
          >
            <label class="grid gap-1 text-sm" for="environment-rename-dialog-name">
              <span class="font-medium">
                {$t(i18nKeys.console.projects.environmentRenameNameLabel)}
              </span>
              <Input
                id="environment-rename-dialog-name"
                value={renameEnvironmentName(selectedEnvironment.id, selectedEnvironment.name)}
                placeholder={$t(i18nKeys.console.projects.environmentRenameNamePlaceholder)}
                disabled={isProjectArchived || renameEnvironmentMutation.isPending}
                oninput={(event) =>
                  setRenameEnvironmentName(selectedEnvironment.id, event.currentTarget.value)}
              />
            </label>
            <div class="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onclick={() => {
                  environmentRenameDialogOpen = false;
                }}
              >
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button
                type="submit"
                disabled={!canRenameSelectedEnvironment || renameEnvironmentMutation.isPending}
              >
                <Save class="size-4" />
                {renameEnvironmentMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.common.actions.save)}
              </Button>
            </div>
          </form>
        {/if}
      </Dialog.Content>
    </Dialog.Root>

    <Dialog.Root bind:open={environmentCloneDialogOpen}>
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.projects.environmentCloneAction)}</Dialog.Title>
          <Dialog.Description>
            {selectedEnvironment?.name ?? $t(i18nKeys.common.domain.environment)}
          </Dialog.Description>
        </Dialog.Header>
        {#if selectedEnvironment}
          <form
            class="space-y-5 px-5 pb-5"
            onsubmit={(event) => {
              event.preventDefault();
              cloneEnvironment(selectedEnvironment.id);
            }}
          >
            <label class="grid gap-1 text-sm" for="environment-clone-dialog-name">
              <span class="font-medium">
                {$t(i18nKeys.console.projects.environmentCloneNameLabel)}
              </span>
              <Input
                id="environment-clone-dialog-name"
                value={cloneEnvironmentName(selectedEnvironment.id)}
                placeholder={$t(i18nKeys.console.projects.environmentCloneNamePlaceholder)}
                disabled={isProjectArchived || cloneEnvironmentMutation.isPending}
                oninput={(event) =>
                  setCloneEnvironmentName(selectedEnvironment.id, event.currentTarget.value)}
              />
            </label>
            <div class="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onclick={() => {
                  environmentCloneDialogOpen = false;
                }}
              >
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button
                type="submit"
                disabled={!canCloneSelectedEnvironment || cloneEnvironmentMutation.isPending}
              >
                <Copy class="size-4" />
                {cloneEnvironmentMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.console.projects.environmentCloneAction)}
              </Button>
            </div>
          </form>
        {/if}
      </Dialog.Content>
    </Dialog.Root>
  {/if}
</ConsoleShell>

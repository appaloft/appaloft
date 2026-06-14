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
    ExternalLink,
    FolderOpen,
    Gauge,
    GitPullRequestArrow,
    Lock,
    Pencil,
    Play,
    Plus,
    RotateCcw,
    Save,
    Search,
    Trash2,
    Unlock,
  } from "@lucide/svelte";
  import type {
    ArchiveEnvironmentInput,
    ArchiveProjectInput,
    CloneEnvironmentInput,
    DeleteProjectInput,
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
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import EnvironmentCreateForm from "$lib/components/console/EnvironmentCreateForm.svelte";
  import QuickDeploySheet from "$lib/components/console/QuickDeploySheet.svelte";
  import ResourceListTable from "$lib/components/console/ResourceListTable.svelte";
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
  import { selectCurrentResourceAccessRoute } from "$lib/console/resource-access-route";
  import { webDocsHrefs } from "$lib/console/docs-help";
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
    formatTime,
    latestResourceDeployment,
    previewEnvironmentDetailHref,
    projectDetailHref,
    resourceDetailHref,
    resourcePreviewEnvironmentDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type ProjectDetailTab =
    | "overview"
    | "resources"
    | "deployments"
    | "environments"
    | "previews"
    | "activity"
    | "settings";
  const projectDetailTabs = [
    "overview",
    "resources",
    "deployments",
    "environments",
    "previews",
    "activity",
    "settings",
  ] as const;
  type ProjectAttentionItem = {
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
    intent?: "resource-quick-deploy" | "operator-work-refresh";
    resourceId?: string;
    tone: "destructive" | "warning" | "neutral";
  };
  type ProjectNextAction = {
    label: string;
    href?: string;
    intent?: "project-quick-deploy" | "resource-quick-deploy";
    resourceId?: string;
  };
  type QuickDeployModalTarget = {
    resource?: ResourceSummary;
  };
  type ProjectLifecycleAction = "archive" | "restore" | "delete";
  type EnvironmentLifecycleAction = "archive" | "lock" | "unlock";

  const { projectsQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser);

  const projectId = $derived(page.params.projectId ?? "");
  const projectDetailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects", "show", projectId],
      queryFn: () => orpcClient.projects.show({ projectId }),
      enabled: browser && projectId.length > 0,
      staleTime: 5_000,
    }),
  );
  const projectDeleteSafetyQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects", "delete-check", projectId],
      queryFn: () => orpcClient.projects.deleteCheck({ projectId }),
      enabled: browser && projectId.length > 0,
      staleTime: 5_000,
    }),
  );
  const projectPreviewEnvironmentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["preview-environments", "project", projectId, { limit: 50 }],
      queryFn: () =>
        orpcClient.previewEnvironments.list({
          projectId,
          limit: 50,
        }),
      enabled: browser && projectId.length > 0,
      staleTime: 5_000,
    }),
  );
  const projectPreviewResourcesQuery = createQuery(() =>
    queryOptions({
      queryKey: [
        "resources",
        "project-preview",
        projectId,
        { includePreviewResources: true, limit: 100 },
      ],
      queryFn: () =>
        orpcClient.resources.list({
          projectId,
          includePreviewResources: true,
          limit: 100,
        }),
      enabled: browser && projectId.length > 0,
      staleTime: 5_000,
    }),
  );
  const projectOperatorWorkQuery = createQuery(() =>
    queryOptions({
      queryKey: ["operator-work", "project", projectId, { limit: 25 }],
      queryFn: () =>
        orpcClient.operatorWork.list({
          projectId,
          limit: 25,
        }),
      enabled: browser && projectId.length > 0,
      staleTime: 2_000,
      refetchInterval: 5_000,
    }),
  );
  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      deploymentsQuery.isPending ||
      projectDetailQuery.isPending,
  );
  const project = $derived(projectDetailQuery.data ?? findProject(projects, projectId));
  const projectHeaderLoading = $derived(projectDetailQuery.isPending && !project);
  const projectHeaderSwitchItems = $derived(
    projects.map((projectItem) => ({
      label: projectItem.name,
      href: projectDetailHref(projectItem.id),
      selected: projectItem.id === projectId,
    })),
  );
  const isProjectArchived = $derived(project?.lifecycleStatus === "archived");
  const projectDeleteSafety = $derived(projectDeleteSafetyQuery.data ?? null);
  const projectDeleteBlockerCount = $derived(projectDeleteSafety?.blockers.length ?? 0);
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
  const actionableProjectOperatorWorkItems = $derived(
    projectOperatorWorkItems.filter(
      (item) =>
        item.kind === "blueprint-install" &&
        (item.status === "failed" ||
          item.status === "dead-lettered" ||
          item.status === "running" ||
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
    for (const work of actionableProjectOperatorWorkItems.slice(0, 2)) {
      items.push({
        kind: "operator-work",
        title:
          work.status === "failed" || work.status === "dead-lettered"
            ? $t(i18nKeys.console.projects.attentionFailedOperatorWorkTitle)
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
          kind: "no-deployment",
          title: $t(i18nKeys.console.projects.attentionNoDeploymentTitle),
          detail: $t(i18nKeys.console.projects.attentionNoDeploymentDetail),
          action: $t(i18nKeys.common.actions.createDeployment),
          intent: "resource-quick-deploy",
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
        intent: "resource-quick-deploy",
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
  let projectRenameDialogOpen = $state(false);
  let projectLifecycleDialogOpen = $state(false);
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
  const activeProjectTab = $derived(parseProjectDetailTab(page.url.searchParams.get("tab")));
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
  const renameProjectMutation = createMutation(() => ({
    mutationFn: (input: RenameProjectInput) => orpcClient.projects.rename(input),
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.renameSucceeded),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "show", result.id] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "delete-check", result.id] });
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
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "show", result.id] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "delete-check", result.id] });
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
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "show", result.id] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "delete-check", result.id] });
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
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setProjectLifecycleDialogOpen(false);
      window.location.href = "/projects";
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.deleteFailed),
        detail: readErrorMessage(error),
      };
      if (project) {
        void queryClient.invalidateQueries({ queryKey: ["projects", "delete-check", project.id] });
      }
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
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEnvironmentLifecycleDialogOpen(false);
      if (project) {
        void queryClient.invalidateQueries({ queryKey: ["projects", "show", project.id] });
      }
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
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEnvironmentLifecycleDialogOpen(false);
      if (project) {
        void queryClient.invalidateQueries({ queryKey: ["projects", "show", project.id] });
      }
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
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEnvironmentLifecycleDialogOpen(false);
      if (project) {
        void queryClient.invalidateQueries({ queryKey: ["projects", "show", project.id] });
      }
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
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (project) {
        void queryClient.invalidateQueries({ queryKey: ["projects", "show", project.id] });
      }
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
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (project) {
        void queryClient.invalidateQueries({ queryKey: ["projects", "show", project.id] });
      }
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

  function setQuickDeployDialogOpen(open: boolean): void {
    quickDeployDialogOpen = open;
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

  function openProjectQuickDeploy(): void {
    openQuickDeployModal();
  }

  function openResourceQuickDeploy(resource: ResourceSummary): void {
    openQuickDeployModal({ resource });
  }

  function openProjectDeploymentAction(): void {
    if (primaryResource) {
      openResourceQuickDeploy(primaryResource);
      return;
    }

    openProjectQuickDeploy();
  }

  function openProjectNextAction(): void {
    if (projectNextAction.intent === "project-quick-deploy") {
      openProjectQuickDeploy();
      return;
    }

    if (projectNextAction.intent === "resource-quick-deploy") {
      const resource = projectResources.find((item) => item.id === projectNextAction.resourceId);
      if (resource) {
        openResourceQuickDeploy(resource);
      } else {
        openProjectQuickDeploy();
      }
    }
  }

  function openProjectAttentionAction(item: ProjectAttentionItem): void {
    if (item.intent === "operator-work-refresh") {
      void queryClient.invalidateQueries({ queryKey: ["operator-work", "project", projectId] });
      return;
    }

    if (item.intent !== "resource-quick-deploy") return;

    const resource = projectResources.find((projectResource) => projectResource.id === item.resourceId);
    if (resource) {
      openResourceQuickDeploy(resource);
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
      href: project ? projectDetailHref(project.id) : undefined,
      switcherLabel: $t(i18nKeys.console.projects.pageTitle),
      switcherItems: projectHeaderSwitchItems,
    },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-36 w-full" />
      <div class="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Skeleton class="h-96 w-full" />
        <Skeleton class="h-96 w-full" />
      </div>
    </div>
  {:else if !project}
    <section class="space-y-5 py-2">
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
    <div class="console-detail-page">
      <section class="console-detail-header">
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

        <section class="grid gap-3 lg:grid-cols-4" aria-label={$t(i18nKeys.console.projects.operationalSummaryTitle)}>
          <article class="console-subtle-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.resources)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{projectResources.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {deployedProjectResources.length} {$t(i18nKeys.console.projects.deployedResourcesLabel)}
            </p>
          </article>
          <article class="console-subtle-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.projects.publicAccessTitle)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{projectAccessRoutes.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {resourcesWithoutAccess.length} {$t(i18nKeys.console.projects.noAccessResourcesLabel)}
            </p>
          </article>
          <article class="console-subtle-panel p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.projects.latestDeploymentTitle)}
            </p>
            {#if latestProjectDeploymentSummary}
              <a
                href={deploymentDetailHref(latestProjectDeploymentSummary)}
                class="mt-2 block truncate text-sm font-semibold underline-offset-4 hover:underline"
              >
                {latestProjectDeploymentSummary.status}
              </a>
              <p class="mt-1 truncate text-xs text-muted-foreground">
                {latestDeploymentResource?.name ?? latestProjectDeploymentSummary.resourceId} · {formatTime(latestProjectDeploymentSummary.createdAt)}
              </p>
            {:else}
              <p class="mt-2 text-sm font-semibold">{$t(i18nKeys.console.projects.noDeploymentShort)}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {undeployedProjectResources.length} {$t(i18nKeys.console.projects.undeployedResourcesLabel)}
              </p>
            {/if}
          </article>
          <article class="console-subtle-panel p-4">
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

      <Tabs.Root value={activeProjectTab} class="console-detail-body">
        <nav
          aria-label={$t(i18nKeys.console.projects.pageTitle)}
          class="console-detail-tabs"
        >
          {#each projectDetailTabs as tab (tab)}
            <a
              href={projectTabHref(tab)}
              class="console-detail-tab"
              aria-current={activeProjectTab === tab ? "page" : undefined}
              onclick={(event) => selectProjectTab(tab, event)}
            >
              {projectTabLabel(tab)}
            </a>
          {/each}
        </nav>

        <Tabs.Content
          value="overview"
          class="console-detail-tab-panel console-detail-tab-panel-scroll flex flex-col gap-6"
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
                                  <Badge variant="outline">
                                    {resource.lastDeploymentStatus ?? latestDeployment?.status ?? $t(i18nKeys.console.projects.noDeploymentShort)}
                                  </Badge>
                                </div>
                                <p class="mt-1 truncate text-xs text-muted-foreground">
                                  {currentAccessRoute?.route.url ?? $t(i18nKeys.console.projects.noPublicAccess)}
                                </p>
                              </div>
                              <div class="flex shrink-0 flex-wrap gap-2">
                                <Button
                                  type="button"
                                  onclick={() => openResourceQuickDeploy(resource)}
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
                        {environments}
                        emptyTitle={$t(i18nKeys.console.projects.noResourcesShort)}
                        emptyDescription={$t(i18nKeys.console.projects.noResources)}
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
                  <a
                    href={deploymentDetailHref(latestProjectDeploymentSummary)}
                    class="console-record-row block"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="text-sm font-medium">{latestProjectDeploymentSummary.status}</span>
                      <Badge variant="outline">
                        {latestDeploymentEnvironment?.name ?? latestProjectDeploymentSummary.environmentId}
                      </Badge>
                    </div>
                    <p class="mt-1 truncate text-xs text-muted-foreground">
                      {latestDeploymentResource?.name ?? latestProjectDeploymentSummary.resourceId}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {formatTime(latestProjectDeploymentSummary.createdAt)}
                    </p>
                  </a>
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
                    {#each projectAttentionItems as item (`${item.kind}-${item.href ?? item.resourceId ?? item.title}`)}
                      <article
                        class={[
                          "rounded-md border px-3 py-2 transition hover:bg-muted/40",
                          projectAttentionCardClass(item),
                        ]}
                        data-project-attention-progress-item
                      >
                        <div class="flex min-w-0 items-start justify-between gap-2">
                          <div class="min-w-0">
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
                            <p class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {item.detail}
                            </p>
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
          class="console-detail-tab-panel console-detail-tab-panel-scroll"
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

            <ResourceListTable
              resources={filteredProjectResources}
              {deployments}
              environments={projectEnvironments}
              emptyTitle={$t(i18nKeys.console.projects.noResourcesShort)}
              emptyDescription={projectResources.length === 0
                ? $t(i18nKeys.console.projects.noResources)
                : $t(i18nKeys.console.projects.noFilteredResources)}
              createAction={openProjectQuickDeploy}
              createLabel={$t(i18nKeys.console.projects.addResourceAction)}
              createDisabled={isProjectArchived}
              onDeployResource={openResourceQuickDeploy}
              showEnvironment
            />
          </section>
        </Tabs.Content>

        <Tabs.Content
          value="previews"
          class="console-detail-tab-panel console-detail-tab-panel-scroll"
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
                    environments={projectEnvironments}
                    emptyTitle={$t(i18nKeys.console.projects.noPreviewResourcesTitle)}
                    emptyDescription={$t(i18nKeys.console.projects.noPreviewResources)}
                    showEnvironment
                  />
                {/if}
              </section>
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content
          value="environments"
          class="console-detail-tab-panel console-detail-tab-panel-scroll"
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
          class="console-detail-tab-panel console-detail-tab-panel-scroll"
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
          class="console-detail-tab-panel console-detail-tab-panel-scroll"
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
          class="console-detail-tab-panel console-detail-tab-panel-scroll"
        >
          <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div class="space-y-4">
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
            </div>

            <aside
              class="console-side-panel space-y-4 border-destructive/25 bg-destructive/5"
              data-project-danger-display-surface
            >
              <div class="space-y-1">
                <h2 class="text-sm font-semibold text-destructive">
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
                {/if}
              </div>

              <Button
                type="button"
                variant="outline"
                class="w-full justify-start"
                onclick={openProjectLifecycleDialog}
              >
                <Archive class="size-4" />
                {$t(i18nKeys.console.projects.lifecycleManageAction)}
              </Button>
            </aside>
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </div>

    <Dialog.Root bind:open={quickDeployDialogOpen} onOpenChange={setQuickDeployDialogOpen}>
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-7xl">
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.common.actions.quickDeploy)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.projects.detailDescription)}
          </Dialog.Description>
        </Dialog.Header>
        <div class="max-h-[calc(100vh-12rem)] overflow-y-auto px-5 pb-5">
          <QuickDeploySheet
            lockedProjectId={project.id}
            lockedProjectName={project.name}
            statePath={page.url.pathname}
            stateBaseSearch={projectModalBaseSearch()}
            stateModal="quick-deploy"
          />
        </div>
      </Dialog.Content>
    </Dialog.Root>

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

          <div class="grid gap-2 sm:grid-cols-2">
            {#if isProjectArchived}
              <Button
                type="button"
                variant={selectedProjectLifecycleAction === "restore" ? "default" : "outline"}
                class="h-auto justify-start px-3 py-3 text-left"
                disabled={!canRestoreProjectByCapability || restoreProjectMutation.isPending}
                onclick={() => {
                  selectedProjectLifecycleAction = "restore";
                  projectDeleteConfirmation = "";
                  lifecycleFeedback = null;
                }}
              >
                <RotateCcw class="size-4 shrink-0" />
                <span class="min-w-0">
                  <span class="block font-medium">
                    {$t(i18nKeys.console.projects.restoreAction)}
                  </span>
                  <span class="block text-xs font-normal opacity-80">
                    {$t(i18nKeys.console.projects.lifecycleRestoreOption)}
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant={selectedProjectLifecycleAction === "delete" ? "destructive" : "outline"}
                class="h-auto justify-start px-3 py-3 text-left"
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
                <span class="min-w-0">
                  <span class="block font-medium">
                    {$t(i18nKeys.console.projects.deleteAction)}
                  </span>
                  <span class="block text-xs font-normal opacity-80">
                    {$t(i18nKeys.console.projects.lifecycleDeleteOption)}
                  </span>
                </span>
              </Button>
            {:else}
              <Button
                type="button"
                variant={selectedProjectLifecycleAction === "archive" ? "destructive" : "outline"}
                class="h-auto justify-start px-3 py-3 text-left"
                disabled={!canArchiveProjectByCapability || archiveProjectMutation.isPending}
                onclick={() => {
                  selectedProjectLifecycleAction = "archive";
                  projectDeleteConfirmation = "";
                  lifecycleFeedback = null;
                }}
              >
                <Archive class="size-4 shrink-0" />
                <span class="min-w-0">
                  <span class="block font-medium">
                    {$t(i18nKeys.console.projects.archiveAction)}
                  </span>
                  <span class="block text-xs font-normal opacity-80">
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
                {$t(i18nKeys.console.projects.deleteBlocked, {
                  count: projectDeleteBlockerCount,
                })}
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

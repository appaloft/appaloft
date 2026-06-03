<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import {
    Archive,
    ArrowLeft,
    ArrowRight,
    Copy,
    FolderOpen,
    Gauge,
    Lock,
    Play,
    Plus,
    RotateCcw,
    Save,
    Trash2,
    Unlock,
  } from "@lucide/svelte";
  import type {
    ArchiveEnvironmentInput,
    ArchiveProjectInput,
    CloneEnvironmentInput,
    DeleteProjectInput,
    LockEnvironmentInput,
    RenameEnvironmentInput,
    RenameProjectInput,
    RestoreProjectInput,
    RuntimeMonitoringRollupResponse,
    UnlockEnvironmentInput,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import { capabilities, capabilityKey, type CapabilityQuery } from "$lib/capabilities";
  import CapabilityGate from "$lib/components/console/CapabilityGate.svelte";
  import DeploymentTable from "$lib/components/console/DeploymentTable.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import ResourceListTable from "$lib/components/console/ResourceListTable.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
  import { webDocsHrefs } from "$lib/console/docs-help";
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
    findProject,
    formatTime,
    projectCreateResourceHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type ProjectDetailTab = "overview" | "resources" | "environments" | "deployments" | "settings";
  const projectDetailTabs = [
    "overview",
    "resources",
    "environments",
    "deployments",
    "settings",
  ] as const;

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
  const projectDeployments = $derived(
    project ? deployments.filter((deployment) => deployment.projectId === project.id) : [],
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
    projectDeployments.flatMap((deployment) =>
      (deployment.runtimePlan.execution.accessRoutes ?? []).flatMap((route) =>
        route.domains.map((domain) => ({
          deployment,
          domain,
          pathPrefix: route.pathPrefix,
          proxyKind: route.proxyKind,
          resourceName:
            projectResources.find((resource) => resource.id === deployment.resourceId)?.name ??
            deployment.resourceId,
          tlsMode: route.tlsMode,
        })),
      ),
    ),
  );
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
  let resourceFilterQuery = $state("");
  let resourceEnvironmentFilter = $state("all");
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
  const canRenameProject = $derived(
    Boolean(project) &&
      canRenameProjectByCapability &&
      !isProjectArchived &&
      projectName.trim().length > 0 &&
      projectName.trim() !== project?.name,
  );
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
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
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
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
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

  function archiveProject(): void {
    if (
      !browser ||
      !project ||
      isProjectArchived ||
      !canArchiveProjectByCapability ||
      archiveProjectMutation.isPending
    ) {
      return;
    }

    if (!window.confirm($t(i18nKeys.console.projects.archiveConfirm))) {
      return;
    }

    lifecycleFeedback = null;
    archiveProjectMutation.mutate({
      projectId: project.id,
    });
  }

  function restoreProject(): void {
    if (
      !browser ||
      !project ||
      !isProjectArchived ||
      !canRestoreProjectByCapability ||
      restoreProjectMutation.isPending
    ) {
      return;
    }

    if (!window.confirm($t(i18nKeys.console.projects.restoreConfirm))) {
      return;
    }

    lifecycleFeedback = null;
    restoreProjectMutation.mutate({
      projectId: project.id,
    });
  }

  function deleteProject(): void {
    if (
      !browser ||
      !project ||
      !canDeleteProject ||
      !canDeleteProjectByCapability ||
      deleteProjectMutation.isPending
    ) {
      return;
    }

    const confirmation = window.prompt($t(i18nKeys.console.projects.deleteConfirmPrompt), "");
    if (confirmation !== project.id) {
      return;
    }

    lifecycleFeedback = null;
    deleteProjectMutation.mutate({
      projectId: project.id,
      confirmation: { projectId: confirmation },
    });
  }

  function archiveEnvironment(environmentId: string): void {
    if (!browser || !project || isProjectArchived || archiveEnvironmentMutation.isPending) {
      return;
    }

    const environment = projectEnvironments.find((item) => item.id === environmentId);
    if (!environment || environment.lifecycleStatus === "archived") {
      return;
    }

    if (!window.confirm($t(i18nKeys.console.projects.environmentArchiveConfirm))) {
      return;
    }

    lifecycleFeedback = null;
    archiveEnvironmentMutation.mutate({
      environmentId,
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

  function lockEnvironment(environmentId: string): void {
    if (!browser || !project || isProjectArchived || lockEnvironmentMutation.isPending) {
      return;
    }

    const environment = projectEnvironments.find((item) => item.id === environmentId);
    if (!environment || environment.lifecycleStatus !== "active") {
      return;
    }

    if (!window.confirm($t(i18nKeys.console.projects.environmentLockConfirm))) {
      return;
    }

    lifecycleFeedback = null;
    lockEnvironmentMutation.mutate({
      environmentId,
    });
  }

  function unlockEnvironment(environmentId: string): void {
    if (!browser || !project || isProjectArchived || unlockEnvironmentMutation.isPending) {
      return;
    }

    const environment = projectEnvironments.find((item) => item.id === environmentId);
    if (!environment || environment.lifecycleStatus !== "locked") {
      return;
    }

    lifecycleFeedback = null;
    unlockEnvironmentMutation.mutate({
      environmentId,
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

  function parseProjectDetailTab(value: string | null): ProjectDetailTab {
    return projectDetailTabs.includes(value as ProjectDetailTab)
      ? (value as ProjectDetailTab)
      : "overview";
  }

  function projectTabHref(tab: ProjectDetailTab): string {
    const params = new URLSearchParams(page.url.searchParams);

    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectProjectTab(tab: ProjectDetailTab, event: MouseEvent): void {
    event.preventDefault();
    void goto(projectTabHref(tab), { noScroll: true, keepFocus: true });
  }

  function projectTabLabel(tab: ProjectDetailTab): string {
    switch (tab) {
      case "overview":
        return $t(i18nKeys.console.deployments.overviewTab);
      case "resources":
        return $t(i18nKeys.common.domain.resources);
      case "environments":
        return $t(i18nKeys.common.domain.environments);
      case "deployments":
        return $t(i18nKeys.common.domain.deployments);
      case "settings":
        return $t(i18nKeys.console.projects.settingsTitle);
    }
  }

</script>

<svelte:head>
  <title>{project?.name ?? $t(i18nKeys.console.projects.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={project?.name ?? $t(i18nKeys.console.projects.pageTitle)}
  description={$t(i18nKeys.console.projects.detailDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle), href: "/projects" },
    { label: project?.name ?? $t(i18nKeys.console.projects.pageTitle) },
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
    <div class="space-y-8">
      <section class="space-y-6">
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
            <p class="text-xs text-muted-foreground">
              {$t(i18nKeys.common.domain.createdAt)} · {formatTime(project.createdAt)}
            </p>
            {#if project.archivedAt}
              <p class="text-xs text-muted-foreground">
                {$t(i18nKeys.console.projects.archivedAt)} · {formatTime(project.archivedAt)}
              </p>
            {/if}
          </div>

          <div class="flex flex-wrap gap-2">
            <CapabilityGate operationKey="resources.create" resourceRefs={{ projectId: project.id }}>
              {#snippet children({ disabled })}
                <Button
                  href={projectCreateResourceHref(project.id)}
                  disabled={disabled || isProjectArchived}
                >
                  <Plus class="size-4" />
                  {$t(i18nKeys.common.actions.createResource)}
                </Button>
              {/snippet}
            </CapabilityGate>
            <Button href={`/deployments?projectId=${project.id}`} variant="outline">
              {$t(i18nKeys.common.actions.viewDeployments)}
            </Button>
          </div>
        </div>

        <dl class="console-metric-strip sm:grid-cols-4">
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.resources)}
            </dt>
            <dd class="mt-1 text-2xl font-semibold">{projectResources.length}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.environments)}
            </dt>
            <dd class="mt-1 text-2xl font-semibold">{projectEnvironments.length}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.deployments)}
            </dt>
            <dd class="mt-1 text-2xl font-semibold">{projectDeployments.length}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.projects.publicAccessTitle)}
            </dt>
            <dd class="mt-1 text-2xl font-semibold">{projectAccessRoutes.length}</dd>
          </div>
        </dl>
      </section>

      <Tabs.Root value={activeProjectTab} class="space-y-6">
        <Tabs.List
          class="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b bg-transparent p-0"
        >
          {#each projectDetailTabs as tab (tab)}
            <Tabs.Trigger
              value={tab}
              class="h-11 flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 py-0 shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              onclick={(event) => selectProjectTab(tab, event)}
            >
              {projectTabLabel(tab)}
            </Tabs.Trigger>
          {/each}
        </Tabs.List>

        <Tabs.Content value="overview" class="mt-0 flex flex-col gap-6">
          <section class="console-panel order-2 space-y-5 p-5">
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
                <label class="grid gap-1 text-sm sm:w-64" for="project-monitor-environment">
                  <span class="font-medium">{$t(i18nKeys.common.domain.environment)}</span>
                  <select
                    id="project-monitor-environment"
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    bind:value={selectedMonitoringEnvironmentId}
                  >
                    {#each projectEnvironments as environment (environment.id)}
                      <option value={environment.id}>{environment.name}</option>
                    {/each}
                  </select>
                </label>
              {/if}
            </div>

            <div class="grid gap-4 xl:grid-cols-2">
              <article class="console-subtle-panel p-4">
                <div class="flex items-center justify-between gap-3">
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
                  <Badge variant="outline">
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

              <article class="console-subtle-panel p-4">
                <div class="flex items-center justify-between gap-3">
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
                  <Badge variant="outline">
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

          <section class="order-1 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div class="space-y-4">
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
                <ResourceListTable
                  resources={projectResources}
                  deployments={projectDeployments}
                  {environments}
                  emptyTitle={$t(i18nKeys.console.projects.noResourcesShort)}
                  emptyDescription={$t(i18nKeys.console.projects.noResources)}
                  createHref={projectCreateResourceHref(project.id)}
                  createLabel={$t(i18nKeys.common.actions.createResource)}
                  createDisabled={isProjectArchived}
                  showEnvironment
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
                            href={projectCreateResourceHref(project.id)}
                            disabled={disabled || isProjectArchived}
                          >
                            <Play class="size-4" />
                            {$t(i18nKeys.common.actions.deploy)}
                          </Button>
                        {/snippet}
                      </CapabilityGate>
                    </div>
                  </div>
                </div>
              {/if}
            </div>

            <aside class="console-side-panel space-y-3">
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
                  {#each projectAccessRoutes.slice(0, 5) as route (`${route.deployment.id}-${route.domain}-${route.pathPrefix}`)}
                    <a
                      href={deploymentDetailHref(route.deployment)}
                      class="console-record-row block"
                    >
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <p class="min-w-0 truncate text-sm font-medium">{route.domain}</p>
                        <Badge variant="secondary">{route.proxyKind}</Badge>
                      </div>
                      <p class="mt-1 text-xs text-muted-foreground">
                        {route.resourceName} · {route.pathPrefix} · {$t(i18nKeys.common.domain.tls)}
                        {route.tlsMode}
                      </p>
                    </a>
                  {/each}
                {:else}
                  <p class="px-4 py-4 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.projects.noPublicAccess)}
                  </p>
                {/if}
              </div>
            </aside>
          </section>
        </Tabs.Content>

        <Tabs.Content value="resources" class="mt-0">
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
                  <label class="grid gap-1 text-sm sm:w-56" for="project-resource-environment-filter">
                    <span class="font-medium">
                      {$t(i18nKeys.console.projects.environmentFilterLabel)}
                    </span>
                    <select
                      id="project-resource-environment-filter"
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      bind:value={resourceEnvironmentFilter}
                    >
                      <option value="all">{$t(i18nKeys.console.projects.allEnvironments)}</option>
                      {#each projectEnvironments as environment (environment.id)}
                        <option value={environment.id}>{environment.name}</option>
                      {/each}
                    </select>
                  </label>
                {/if}
                <CapabilityGate
                  operationKey="resources.create"
                  resourceRefs={{ projectId: project.id }}
                >
                  {#snippet children({ disabled })}
                    <Button
                      href={projectCreateResourceHref(project.id)}
                      disabled={disabled || isProjectArchived}
                    >
                      <Plus class="size-4" />
                      {$t(i18nKeys.common.actions.createResource)}
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
              createHref={projectCreateResourceHref(project.id)}
              createLabel={$t(i18nKeys.common.actions.createResource)}
              createDisabled={isProjectArchived}
              showEnvironment
            />
          </section>
        </Tabs.Content>

        <Tabs.Content value="environments" class="mt-0">
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
              <Badge variant="outline">{projectEnvironments.length}</Badge>
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
                      <div class="flex shrink-0 items-center gap-1">
                        {#if environment.lifecycleStatus === "locked"}
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={$t(i18nKeys.console.projects.environmentUnlockAction)}
                            title={$t(i18nKeys.console.projects.environmentUnlockAction)}
                            disabled={isProjectArchived || unlockEnvironmentMutation.isPending}
                            onclick={() => unlockEnvironment(environment.id)}
                          >
                            <Unlock class="size-4" />
                          </Button>
                        {:else}
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={$t(i18nKeys.console.projects.environmentLockAction)}
                            title={$t(i18nKeys.console.projects.environmentLockAction)}
                            disabled={isProjectArchived ||
                              environment.lifecycleStatus !== "active" ||
                              lockEnvironmentMutation.isPending}
                            onclick={() => lockEnvironment(environment.id)}
                          >
                            <Lock class="size-4" />
                          </Button>
                        {/if}
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={$t(i18nKeys.console.projects.environmentArchiveAction)}
                          title={$t(i18nKeys.console.projects.environmentArchiveAction)}
                          disabled={isProjectArchived ||
                            environment.lifecycleStatus === "archived" ||
                            archiveEnvironmentMutation.isPending}
                          onclick={() => archiveEnvironment(environment.id)}
                        >
                          <Archive class="size-4" />
                        </Button>
                      </div>
                    </div>
                    {#if environment.lifecycleStatus === "active"}
                      <div class="mt-5 grid gap-3">
                        <form
                          id={`environment-rename-form-${environment.id}`}
                          class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                          onsubmit={(event) => {
                            event.preventDefault();
                            renameEnvironment(environment.id);
                          }}
                        >
                          <label class="sr-only" for={`environment-rename-name-${environment.id}`}>
                            {$t(i18nKeys.console.projects.environmentRenameNameLabel)}
                          </label>
                          <Input
                            id={`environment-rename-name-${environment.id}`}
                            value={renameEnvironmentName(environment.id, environment.name)}
                            placeholder={$t(
                              i18nKeys.console.projects.environmentRenameNamePlaceholder,
                            )}
                            disabled={isProjectArchived || renameEnvironmentMutation.isPending}
                            oninput={(event) =>
                              setRenameEnvironmentName(
                                environment.id,
                                event.currentTarget.value,
                              )}
                          />
                          <Button
                            type="submit"
                            variant="outline"
                            aria-label={$t(i18nKeys.console.projects.environmentRenameAction)}
                            title={$t(i18nKeys.console.projects.environmentRenameAction)}
                            disabled={isProjectArchived ||
                              renameEnvironmentMutation.isPending ||
                              renameEnvironmentName(environment.id, environment.name).trim()
                                .length === 0 ||
                              renameEnvironmentName(environment.id, environment.name).trim() ===
                                environment.name}
                          >
                            <Save class="size-4" />
                            {$t(i18nKeys.console.projects.environmentRenameAction)}
                          </Button>
                        </form>
                        <form
                          id={`environment-clone-form-${environment.id}`}
                          class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                          onsubmit={(event) => {
                            event.preventDefault();
                            cloneEnvironment(environment.id);
                          }}
                        >
                          <label class="sr-only" for={`environment-clone-name-${environment.id}`}>
                            {$t(i18nKeys.console.projects.environmentCloneNameLabel)}
                          </label>
                          <Input
                            id={`environment-clone-name-${environment.id}`}
                            value={cloneEnvironmentName(environment.id)}
                            placeholder={$t(
                              i18nKeys.console.projects.environmentCloneNamePlaceholder,
                            )}
                            disabled={isProjectArchived || cloneEnvironmentMutation.isPending}
                            oninput={(event) =>
                              setCloneEnvironmentName(environment.id, event.currentTarget.value)}
                          />
                          <Button
                            type="submit"
                            variant="outline"
                            aria-label={$t(i18nKeys.console.projects.environmentCloneAction)}
                            title={$t(i18nKeys.console.projects.environmentCloneAction)}
                            disabled={isProjectArchived ||
                              cloneEnvironmentMutation.isPending ||
                              cloneEnvironmentName(environment.id).trim().length === 0}
                          >
                            <Copy class="size-4" />
                            {$t(i18nKeys.console.projects.environmentCloneAction)}
                          </Button>
                        </form>
                      </div>
                    {/if}
                  </article>
                {/each}
              {:else}
                <div class="console-subtle-panel px-4 py-6 text-sm text-muted-foreground xl:col-span-2">
                  {$t(i18nKeys.console.projects.noEnvironment)}
                </div>
              {/if}
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content value="deployments" class="mt-0">
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
              <Button href={`/deployments?projectId=${project.id}`} variant="outline">
                {$t(i18nKeys.common.actions.viewAll)}
                <ArrowRight class="size-4" />
              </Button>
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
                          href={projectCreateResourceHref(project.id)}
                          disabled={disabled || isProjectArchived}
                        >
                          <Play class="size-4" />
                          {$t(i18nKeys.common.actions.deploy)}
                        </Button>
                      {/snippet}
                    </CapabilityGate>
                  </div>
                </div>
              </div>
            {/if}
          </section>
        </Tabs.Content>

        <Tabs.Content value="settings" class="mt-0">
          <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div class="console-panel space-y-4 p-5">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.projects.settingsTitle)}
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

              <form
                id="project-rename-form"
                class="grid gap-3 sm:grid-cols-[minmax(0,22rem)_auto] sm:items-end"
                onsubmit={(event) => {
                  event.preventDefault();
                  renameProject();
                }}
              >
                <label class="grid gap-1 text-sm" for="project-name">
                  <span class="font-medium">{$t(i18nKeys.console.projects.renameLabel)}</span>
                  <Input
                    id="project-name"
                    bind:value={projectName}
                    autocomplete="off"
                    disabled={isProjectArchived || renameProjectMutation.isPending}
                  />
                </label>
                <CapabilityGate
                  operationKey="projects.rename"
                  resourceRefs={{ projectId: project.id }}
                >
                  {#snippet children({ disabled })}
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={disabled || !canRenameProject || renameProjectMutation.isPending}
                    >
                      <Save class="size-4" />
                      {renameProjectMutation.isPending
                        ? $t(i18nKeys.common.actions.saving)
                        : $t(i18nKeys.common.actions.save)}
                    </Button>
                  {/snippet}
                </CapabilityGate>
              </form>
            </div>

            <aside class="console-side-panel space-y-4 border-destructive/25 bg-destructive/5">
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
                <div class="flex flex-wrap gap-2">
                  <CapabilityGate
                    operationKey="projects.restore"
                    resourceRefs={{ projectId: project.id }}
                  >
                    {#snippet children({ disabled })}
                      <Button
                        id="project-restore-button"
                        type="button"
                        disabled={disabled || restoreProjectMutation.isPending}
                        onclick={restoreProject}
                      >
                        <RotateCcw class="size-4" />
                        {restoreProjectMutation.isPending
                          ? $t(i18nKeys.common.actions.saving)
                          : $t(i18nKeys.console.projects.restoreAction)}
                      </Button>
                    {/snippet}
                  </CapabilityGate>
                  <CapabilityGate
                    operationKey="projects.delete"
                    resourceRefs={{ projectId: project.id }}
                  >
                    {#snippet children({ disabled })}
                      <Button
                        id="project-delete-button"
                        type="button"
                        variant="destructive"
                        disabled={disabled || !canDeleteProject || deleteProjectMutation.isPending}
                        title={projectDeleteBlockerCount > 0
                          ? $t(i18nKeys.console.projects.deleteBlocked, {
                              count: projectDeleteBlockerCount,
                            })
                          : undefined}
                        onclick={deleteProject}
                      >
                        <Trash2 class="size-4" />
                        {deleteProjectMutation.isPending
                          ? $t(i18nKeys.common.actions.saving)
                          : $t(i18nKeys.console.projects.deleteAction)}
                      </Button>
                    {/snippet}
                  </CapabilityGate>
                </div>
              {:else}
                <CapabilityGate
                  operationKey="projects.archive"
                  resourceRefs={{ projectId: project.id }}
                >
                  {#snippet children({ disabled })}
                    <Button
                      id="project-archive-button"
                      type="button"
                      variant="destructive"
                      disabled={disabled || archiveProjectMutation.isPending}
                      onclick={archiveProject}
                    >
                      <Archive class="size-4" />
                      {archiveProjectMutation.isPending
                        ? $t(i18nKeys.common.actions.saving)
                        : $t(i18nKeys.console.projects.archiveAction)}
                    </Button>
                  {/snippet}
                </CapabilityGate>
              {/if}
            </aside>
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  {/if}
</ConsoleShell>

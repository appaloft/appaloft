<script lang="ts">
  import { browser } from "$app/environment";
  import { afterNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { createMutation, createQuery } from "@tanstack/svelte-query";
  import { ArchiveRestore, BadgeCheck, HardDriveDownload, Settings2, Trash2 } from "@lucide/svelte";
  import type {
    DependencyResourceBackupPolicyRead,
    DependencyResourceBackupSummary,
    DependencyResourceSummary,
  } from "@appaloft/contracts";
  import type { TranslationKey } from "@appaloft/i18n";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleDetailSubnav from "$lib/components/console/ConsoleDetailSubnav.svelte";
  import ConsoleDetailTabs from "$lib/components/console/ConsoleDetailTabs.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import ConsoleStatePanel from "$lib/components/console/ConsoleStatePanel.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { canRunProductQueries } from "$lib/console/auth-query-gate";
  import {
    detailBodyClass,
    detailHeaderClass,
    detailPageClass,
    detailSubnavContentClass,
    detailSubnavLayoutClass,
    detailTabPanelScrollClass,
    detailTabPanelSubnavClass,
  } from "$lib/console/layout-classes";
  import { createConsoleQueries } from "$lib/console/queries";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type Feedback = {
    kind: "success" | "error";
    title: string;
    detail: string;
  };
  type DeleteBlocker = NonNullable<DependencyResourceSummary["deleteSafety"]>["blockers"][number];
  type DependencyResourceDetailTab = "overview" | "backups" | "settings" | "danger";
  type DependencyResourceBackupSection = "backup-history" | "backup-policy";

  const dependencyResourceDetailTabs = ["overview", "backups", "settings", "danger"] as const;
  const dependencyResourceBackupSections = ["backup-history", "backup-policy"] as const;

  const dependencyResourceId = $derived(page.params.dependencyResourceId ?? "");
  let dependencyResourceLocationSearch = $state(page.url.search);
  $effect(() => {
    const search = page.url.search;
    dependencyResourceLocationSearch = browser ? (window.location.search || search) : search;
  });
  afterNavigate(({ to }) => {
    dependencyResourceLocationSearch =
      to?.url.search ?? (browser ? window.location.search : page.url.search);
  });
  onMount(() => {
    const syncDependencyResourceLocationSearch = () => {
      dependencyResourceLocationSearch = window.location.search;
    };
    syncDependencyResourceLocationSearch();
    window.addEventListener("popstate", syncDependencyResourceLocationSearch);

    return () => {
      window.removeEventListener("popstate", syncDependencyResourceLocationSearch);
    };
  });
  const { authSessionQuery, projectsQuery, environmentsQuery } = createConsoleQueries(browser, {
    resources: false,
    deployments: false,
    previewEnvironments: false,
    domainBindings: false,
    certificates: false,
    providers: false,
  });
  const dependencyResourceQueriesEnabled = $derived(
    browser && canRunProductQueries(authSessionQuery.data),
  );
  const dependencyResourceQuery = createQuery(() =>
    orpc.dependencyResources.show.queryOptions({
      input: { dependencyResourceId },
      enabled: dependencyResourceQueriesEnabled && dependencyResourceId.length > 0,
      staleTime: 5_000,
    }),
  );
  const selectedResourceBackupsQuery = createQuery(() =>
    orpc.dependencyResources.listBackups.queryOptions({
      input: { dependencyResourceId },
      enabled: dependencyResourceQueriesEnabled && dependencyResourceId.length > 0,
      staleTime: 5_000,
    }),
  );
  const backupPoliciesQuery = createQuery(() =>
    orpc.dependencyResources.listBackupPolicies.queryOptions({
      input: { dependencyResourceId },
      enabled: dependencyResourceQueriesEnabled && dependencyResourceId.length > 0,
      staleTime: 5_000,
    }),
  );

  let selectedBackupId = $state("");
  let restoreAcknowledgeData = $state(false);
  let restoreAcknowledgeRuntime = $state(false);
  let backupPolicyRetentionDays = $state("7");
  let backupPolicyIntervalHours = $state("24");
  let backupPolicyEnabled = $state(true);
  let feedback = $state<Feedback | null>(null);
  let backupCreateDialogOpen = $state(false);
  let restoreBackupDialogOpen = $state(false);
  let backupPolicyDialogOpen = $state(false);
  let deleteDependencyResourceDialogOpen = $state(false);
  let deleteDependencyResourceConfirmation = $state("");
  let deleteDialogError = $state("");

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const selectedDependencyResource = $derived(
    dependencyResourceQuery.data?.dependencyResource ?? null,
  );
  const selectedBackups = $derived(selectedResourceBackupsQuery.data?.items ?? []);
  const selectedBackupPolicies = $derived(backupPoliciesQuery.data?.items ?? []);
  const selectedBackupPolicy = $derived(
    (selectedBackupPolicies[0] ?? null) as DependencyResourceBackupPolicyRead | null,
  );
  const readyBackups = $derived(selectedBackups.filter((backup) => backup.status === "ready"));
  const latestBackup = $derived(readyBackups[0] ?? selectedBackups[0] ?? null);
  const deleteSafetyBlockers = $derived(
    selectedDependencyResource ? buildDeleteSafetyBlockers(selectedDependencyResource) : [],
  );
  const canRestore = $derived(
    selectedBackupId.length > 0 && restoreAcknowledgeData && restoreAcknowledgeRuntime,
  );
  const canConfigureBackupPolicy = $derived(
    dependencyResourceId.length > 0 &&
      Number.parseInt(backupPolicyRetentionDays, 10) > 0 &&
      Number.parseInt(backupPolicyIntervalHours, 10) > 0,
  );
  const canDeleteSelectedDependencyResource = $derived(
    Boolean(selectedDependencyResource) &&
      deleteSafetyBlockers.length === 0 &&
      deleteDependencyResourceConfirmation.trim() === selectedDependencyResource?.id,
  );
  const pageLoading = $derived(
    (authSessionQuery.isPending && !authSessionQuery.data) ||
      (dependencyResourceQueriesEnabled &&
        dependencyResourceQuery.isPending &&
        !dependencyResourceQuery.data),
  );
  const dependencyResourceError = $derived(
    dependencyResourceQuery.error ? readErrorMessage(dependencyResourceQuery.error) : "",
  );
  const dependencyResourceSearchParams = $derived(
    new URLSearchParams(dependencyResourceLocationSearch),
  );
  const activeDependencyResourceTab = $derived(
    parseDependencyResourceDetailTab(dependencyResourceSearchParams.get("tab")),
  );
  const activeDependencyResourceBackupSection = $derived(
    parseDependencyResourceBackupSection(dependencyResourceSearchParams.get("section")),
  );
  const dependencyResourceDetailTabItems = $derived(
    dependencyResourceDetailTabs.map((tab) => ({
      id: tab,
      label: dependencyResourceTabLabel(tab),
      href: dependencyResourceTabHref(tab),
      active: activeDependencyResourceTab === tab,
      onSelect: (event: MouseEvent) => selectDependencyResourceTab(tab, event),
    })),
  );
  const dependencyResourceBackupSubnavItems = $derived(
    dependencyResourceBackupSections.map((section) => ({
      id: section,
      label: dependencyResourceBackupSectionLabel(section),
      href: dependencyResourceBackupSectionHref(section),
      active: activeDependencyResourceBackupSection === section,
      onSelect: (event: MouseEvent) => selectDependencyResourceBackupSection(section, event),
    })),
  );

  const createBackupMutation = createMutation(() => ({
    mutationFn: (inputDependencyResourceId: string) =>
      orpcClient.dependencyResources.createBackup({
        dependencyResourceId: inputDependencyResourceId,
      }),
    onSuccess: (result) => {
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.dependencyResources.backupCreated),
        detail: result.id,
      };
      backupCreateDialogOpen = false;
      void invalidateDependencyResourceQueries();
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.backupFailed),
        detail: describeDependencyResourceError(error),
      };
    },
  }));
  const restoreBackupMutation = createMutation(() => ({
    mutationFn: (backupId: string) =>
      orpcClient.dependencyResources.restoreBackup({
        backupId,
        acknowledgeDataOverwrite: true,
        acknowledgeRuntimeNotRestarted: true,
      }),
    onSuccess: (result) => {
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.dependencyResources.restoreSucceeded),
        detail: result.id,
      };
      restoreAcknowledgeData = false;
      restoreAcknowledgeRuntime = false;
      restoreBackupDialogOpen = false;
      void invalidateDependencyResourceQueries();
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.restoreFailed),
        detail: describeDependencyResourceError(error),
      };
    },
  }));
  const deleteDependencyResourceMutation = createMutation(() => ({
    mutationFn: (inputDependencyResourceId: string) =>
      orpcClient.dependencyResources.delete({ dependencyResourceId: inputDependencyResourceId }),
    onSuccess: (result) => {
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.dependencyResources.deleteSucceeded),
        detail: result.id,
      };
      deleteDependencyResourceConfirmation = "";
      deleteDialogError = "";
      deleteDependencyResourceDialogOpen = false;
      void invalidateDependencyResourceQueries();
      void goto("/dependency-resources");
    },
    onError: (error) => {
      deleteDialogError = describeDependencyResourceError(error);
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.deleteFailed),
        detail: deleteDialogError,
      };
    },
  }));
  const configureBackupPolicyMutation = createMutation(() => ({
    mutationFn: (input: {
      dependencyResourceId: string;
      retentionDays: number;
      scheduleIntervalHours: number;
      enabled: boolean;
      policyId?: string;
    }) => orpcClient.dependencyResources.configureBackupPolicy(input),
    onSuccess: (result) => {
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.dependencyResources.backupPolicyConfigured),
        detail: result.id,
      };
      backupPolicyDialogOpen = false;
      void invalidateDependencyResourceQueries();
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.backupPolicyConfigureFailed),
        detail: describeDependencyResourceError(error),
      };
    },
  }));

  $effect(() => {
    if (selectedBackupId && !readyBackups.some((backup) => backup.id === selectedBackupId)) {
      selectedBackupId = "";
    }
  });

  $effect(() => {
    if (!selectedBackupId && latestBackup?.status === "ready") {
      selectedBackupId = latestBackup.id;
    }
  });

  $effect(() => {
    if (selectedBackupPolicy) {
      backupPolicyRetentionDays = String(selectedBackupPolicy.retentionDays);
      backupPolicyIntervalHours = String(selectedBackupPolicy.scheduleIntervalHours);
      backupPolicyEnabled = selectedBackupPolicy.enabled;
    }
  });

  function invalidateDependencyResourceQueries(): Promise<unknown> {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.dependencyResources.key({ type: "query" }) }),
      queryClient.invalidateQueries({
        queryKey: ["dependency-resources", dependencyResourceId, "backups"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["dependency-resources", dependencyResourceId, "backup-policies"],
      }),
    ]);
  }

  function projectName(projectId: string): string {
    return projects.find((project) => project.id === projectId)?.name ?? projectId;
  }

  function environmentName(environmentId: string): string {
    return environments.find((environment) => environment.id === environmentId)?.name ?? environmentId;
  }

  function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    if (status === "ready" || status === "active") return "default";
    if (status === "failed" || status === "degraded" || status === "blocked") {
      return "destructive";
    }
    if (status === "deleted") return "secondary";
    return "outline";
  }

  function confirmBackupResource(): void {
    if (!selectedDependencyResource || createBackupMutation.isPending) return;
    createBackupMutation.mutate(selectedDependencyResource.id);
  }

  function openRestoreBackupDialog(): void {
    restoreAcknowledgeData = false;
    restoreAcknowledgeRuntime = false;
    restoreBackupDialogOpen = true;
  }

  function openBackupPolicyDialog(): void {
    if (selectedBackupPolicy) {
      backupPolicyRetentionDays = String(selectedBackupPolicy.retentionDays);
      backupPolicyIntervalHours = String(selectedBackupPolicy.scheduleIntervalHours);
      backupPolicyEnabled = selectedBackupPolicy.enabled;
    }
    backupPolicyDialogOpen = true;
  }

  function openDeleteDependencyResourceDialog(): void {
    deleteDependencyResourceConfirmation = "";
    deleteDialogError = "";
    deleteDependencyResourceDialogOpen = true;
  }

  function confirmDeleteDependencyResource(): void {
    if (!selectedDependencyResource || !canDeleteSelectedDependencyResource) return;
    if (deleteDependencyResourceMutation.isPending) return;
    deleteDependencyResourceMutation.mutate(selectedDependencyResource.id);
  }

  function restoreBackup(): void {
    if (!canRestore || restoreBackupMutation.isPending) return;
    restoreBackupMutation.mutate(selectedBackupId);
  }

  function configureBackupPolicy(event: SubmitEvent): void {
    event.preventDefault();
    if (!canConfigureBackupPolicy || configureBackupPolicyMutation.isPending) return;
    configureBackupPolicyMutation.mutate({
      dependencyResourceId,
      retentionDays: Number.parseInt(backupPolicyRetentionDays, 10),
      scheduleIntervalHours: Number.parseInt(backupPolicyIntervalHours, 10),
      enabled: backupPolicyEnabled,
      ...(selectedBackupPolicy ? { policyId: selectedBackupPolicy.id } : {}),
    });
  }

  function backupLabel(backup: DependencyResourceBackupSummary): string {
    return `${backup.id} · ${formatTime(backup.completedAt ?? backup.requestedAt)}`;
  }

  function selectedBackupLabel(): string {
    const backup = selectedBackups.find((item) => item.id === selectedBackupId) ?? latestBackup;
    return backup
      ? backupLabel(backup)
      : $t(i18nKeys.console.dependencyResources.selectBackup);
  }

  function parseDependencyResourceDetailTab(value: string | null): DependencyResourceDetailTab {
    if (!value) return "overview";
    return dependencyResourceDetailTabs.includes(value as DependencyResourceDetailTab)
      ? (value as DependencyResourceDetailTab)
      : "overview";
  }

  function parseDependencyResourceBackupSection(
    value: string | null,
  ): DependencyResourceBackupSection {
    if (!value) return "backup-history";
    return dependencyResourceBackupSections.includes(value as DependencyResourceBackupSection)
      ? (value as DependencyResourceBackupSection)
      : "backup-history";
  }

  function dependencyResourceTabHref(tab: DependencyResourceDetailTab): string {
    const params = new URLSearchParams();
    if (tab !== "overview") {
      params.set("tab", tab);
    }
    if (tab === "backups") {
      params.set("section", "backup-history");
    }
    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectDependencyResourceTab(tab: DependencyResourceDetailTab, event: MouseEvent): void {
    event.preventDefault();
    const href = dependencyResourceTabHref(tab);
    dependencyResourceLocationSearch = new URL(href, window.location.href).search;
    void goto(href, { noScroll: true, keepFocus: true });
  }

  function dependencyResourceTabLabel(tab: DependencyResourceDetailTab): string {
    switch (tab) {
      case "overview":
        return $t(i18nKeys.console.dependencyResources.overviewTab);
      case "backups":
        return $t(i18nKeys.console.dependencyResources.backupsTab);
      case "settings":
        return $t(i18nKeys.console.dependencyResources.settingsTab);
      case "danger":
        return $t(i18nKeys.console.dependencyResources.dangerZoneTitle);
    }
  }

  function dependencyResourceBackupSectionHref(
    section: DependencyResourceBackupSection,
  ): string {
    const params = new URLSearchParams();
    params.set("tab", "backups");
    if (section !== "backup-history") {
      params.set("section", section);
    }
    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectDependencyResourceBackupSection(
    section: DependencyResourceBackupSection,
    event: MouseEvent,
  ): void {
    event.preventDefault();
    const href = dependencyResourceBackupSectionHref(section);
    dependencyResourceLocationSearch = new URL(href, window.location.href).search;
    void goto(href, { noScroll: true, keepFocus: true });
  }

  function dependencyResourceBackupSectionLabel(
    section: DependencyResourceBackupSection,
  ): string {
    switch (section) {
      case "backup-history":
        return $t(i18nKeys.console.dependencyResources.backupHistorySection);
      case "backup-policy":
        return $t(i18nKeys.console.dependencyResources.backupPolicy);
    }
  }

  function buildDeleteSafetyBlockers(resource: DependencyResourceSummary): DeleteBlocker[] {
    const blockers = [...(resource.deleteSafety?.blockers ?? [])];
    if (resource.backupRelationship?.retentionRequired) {
      pushUniqueBlocker(blockers, { kind: "backup-relationship" });
    }
    if (providerManagedDeleteNeedsSafetyBlocker(resource, blockers)) {
      pushUniqueBlocker(blockers, { kind: "provider-managed-unsafe" });
    }
    return blockers;
  }

  function providerManagedDeleteNeedsSafetyBlocker(
    resource: DependencyResourceSummary,
    blockers: DeleteBlocker[],
  ): boolean {
    if (!resource.providerManaged) return false;
    if (blockers.length > 0) return false;
    if (resource.sourceMode !== "appaloft-managed") return true;
    const realizationStatus = resource.providerRealization?.status;
    if (realizationStatus !== "ready" && realizationStatus !== "delete-pending") return true;
    return !resource.providerRealization?.providerResourceHandle;
  }

  function pushUniqueBlocker(blockers: DeleteBlocker[], blocker: DeleteBlocker): void {
    if (!blockers.some((item) => item.kind === blocker.kind)) {
      blockers.push(blocker);
    }
  }

  function blockerDescription(blocker: DeleteBlocker): string {
    const messageKeyByKind: Partial<Record<DeleteBlocker["kind"], TranslationKey>> = {
      "resource-binding": i18nKeys.console.dependencyResources.deleteBlockedResourceBinding,
      "backup-relationship": i18nKeys.console.dependencyResources.deleteBlockedBackupRelationship,
      "dependency-resource-backup": i18nKeys.console.dependencyResources.deleteBlockedBackup,
      "provider-managed-unsafe":
        i18nKeys.console.dependencyResources.deleteBlockedProviderManagedUnsafe,
      "deployment-snapshot-reference":
        i18nKeys.console.dependencyResources.deleteBlockedDeploymentSnapshot,
    };
    const message = $t(
      messageKeyByKind[blocker.kind] ?? i18nKeys.console.dependencyResources.deleteBlockedUnknown,
    );
    return blocker.count ? `${message} (${blocker.count})` : message;
  }

  function describeDependencyResourceError(error: unknown): string {
    const blockerDetails = readDeleteBlockersFromError(error);
    if (blockerDetails.length > 0) {
      return blockerDetails.map((blocker) => blockerDescription(blocker)).join(" ");
    }
    return readErrorMessage(error);
  }

  function readDeleteBlockersFromError(error: unknown): DeleteBlocker[] {
    const details = readErrorDetails(error);
    const deletionBlockers = details?.deletionBlockers;
    if (typeof deletionBlockers !== "string") return [];
    return deletionBlockers
      .split(",")
      .map((kind) => kind.trim())
      .filter((kind): kind is DeleteBlocker["kind"] =>
        [
          "resource-binding",
          "backup-relationship",
          "dependency-resource-backup",
          "provider-managed-unsafe",
          "deployment-snapshot-reference",
        ].includes(kind),
      )
      .map((kind) => ({ kind }));
  }

  function readErrorDetails(error: unknown): Record<string, unknown> | undefined {
    const maybeError = error as { data?: { details?: unknown }; cause?: unknown };
    const details = maybeError.data?.details;
    if (details && typeof details === "object") {
      return details as Record<string, unknown>;
    }
    if (maybeError.cause) {
      return readErrorDetails(maybeError.cause);
    }
    return undefined;
  }
</script>

<svelte:head>
  <title>{selectedDependencyResource?.name ?? $t(i18nKeys.console.dependencyResources.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={selectedDependencyResource?.name ?? $t(i18nKeys.console.dependencyResources.pageTitle)}
  description={$t(i18nKeys.console.dependencyResources.pageDescription)}
>
  {#if pageLoading}
<div class="space-y-5 p-4 md:p-6">
        <header class="space-y-2">
          <h1 class="text-2xl font-semibold">postgres-main</h1>
          <p class="text-sm text-muted-foreground">Dependency resource detail</p>
        </header>
        <section class="console-panel space-y-3 p-5">
          <h2 class="text-lg font-semibold">Overview</h2>
          <p class="text-sm text-muted-foreground">postgres · ready</p>
        </section>
      </div>
    {:else if dependencyResourceError}
    <div class="p-4 md:p-6">
      <ConsoleStatePanel
        tone="error"
        title={$t(i18nKeys.errors.web.backendUnavailable)}
        description={$t(i18nKeys.console.dependencyResources.pageDescription)}
        detail={dependencyResourceError}
        actionLabel={$t(i18nKeys.console.runtimeUsage.refreshNow)}
        actionOnclick={() => dependencyResourceQuery.refetch()}
      />
    </div>
  {:else if selectedDependencyResource}
    <section class={detailPageClass} data-dependency-resource-detail-display-surface>
      <section class={detailHeaderClass}>
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="min-w-0 space-y-2">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline">{selectedDependencyResource.kind}</Badge>
            <h1 class="truncate text-2xl font-semibold">{selectedDependencyResource.name}</h1>
            <Badge variant={statusVariant(selectedDependencyResource.lifecycleStatus)}>
              {selectedDependencyResource.lifecycleStatus}
            </Badge>
            <Badge variant={statusVariant(selectedDependencyResource.bindingReadiness.status)}>
              {$t(i18nKeys.console.dependencyResources.bindingReadiness)} · {selectedDependencyResource.bindingReadiness.status}
            </Badge>
          </div>
          <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.dependencyResources.lifecycleDescription)}
          </p>
        </div>
        <DocsHelpLink
          href={webDocsHrefs.dependencyResourceLifecycle}
          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
        />
      </div>

      {#if feedback}
        <section
          class={[
            "console-panel p-4 text-sm",
            feedback.kind === "error"
              ? "border-destructive/35 bg-destructive/5"
              : "border-primary/25 bg-primary/5",
          ]}
        >
          <p class="font-medium">{feedback.title}</p>
          <p class="mt-1 break-words text-muted-foreground">{feedback.detail}</p>
        </section>
      {/if}
      </section>

      <Tabs.Root value={activeDependencyResourceTab} class={detailBodyClass}>
        <ConsoleDetailTabs
          ariaLabel={$t(i18nKeys.console.dependencyResources.pageTitle)}
          idPrefix="dependency-resource-tab"
          items={dependencyResourceDetailTabItems}
        />

        <Tabs.Content value="overview" class={[detailTabPanelScrollClass, "space-y-5"]}>
          <section class="console-panel space-y-4 p-5" data-dependency-resource-identity-summary>
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                <BadgeCheck class="size-3.5" />
                {$t(i18nKeys.console.dependencyResources.selectedResource)}
              </Badge>
              <Badge variant="secondary">{selectedDependencyResource.sourceMode}</Badge>
            </div>
            <dl class="grid gap-3 text-sm md:grid-cols-2">
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">ID</dt>
                <dd class="mt-1 break-all font-mono text-xs">{selectedDependencyResource.id}</dd>
              </div>
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.dependencyResources.endpoint)}
                </dt>
                <dd class="mt-1 truncate font-medium">
                  {selectedDependencyResource.connection?.host ??
                    selectedDependencyResource.connection?.maskedConnection ??
                    "-"}
                </dd>
              </div>
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.common.domain.project)}
                </dt>
                <dd class="mt-1 truncate font-medium">
                  {projectName(selectedDependencyResource.projectId)}
                </dd>
              </div>
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.common.domain.environment)}
                </dt>
                <dd class="mt-1 truncate font-medium">
                  {environmentName(selectedDependencyResource.environmentId)}
                </dd>
              </div>
              <div class="rounded-md border bg-background px-3 py-2 md:col-span-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.dependencyResources.providerHandle)}
                </dt>
                <dd class="mt-1 break-all font-mono text-xs">
                  {selectedDependencyResource.providerRealization?.providerResourceHandle ?? "-"}
                </dd>
              </div>
            </dl>
          </section>
        </Tabs.Content>

        <Tabs.Content value="backups" class={detailTabPanelSubnavClass}>
          <div class={[detailSubnavLayoutClass, "md:grid-cols-[13rem_minmax(0,1fr)]"]}>
            <ConsoleDetailSubnav
              ariaLabel={$t(i18nKeys.console.dependencyResources.backupsTab)}
              idPrefix="dependency-resource-backup-section"
              items={dependencyResourceBackupSubnavItems}
            />

            <div class={detailSubnavContentClass}>
          {#if activeDependencyResourceBackupSection === "backup-history"}
          <section class="console-panel space-y-4 p-5" data-dependency-resource-backup-summary>
            <div class="space-y-1">
              <h2 class="flex items-center gap-2 font-semibold">
                <HardDriveDownload class="size-4" />
                {$t(i18nKeys.console.dependencyResources.backupListTitle)}
              </h2>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.dependencyResources.backupDescription)}
              </p>
            </div>
            <Skeleton
              name="dependency-resource-backup-summary"
              loading={selectedResourceBackupsQuery.isPending}
              animate="pulse"
              transition
            >
              {#snippet fallback()}
                <div class="min-h-20 w-full animate-pulse rounded-md bg-muted/50" aria-hidden="true"></div>
              {/snippet}
              {#snippet fixture()}
                <dl class="grid gap-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">Latest backup</dt>
                    <dd class="min-w-0 truncate font-medium">backup-sample</dd>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">Backup status</dt>
                    <dd class="font-medium">1 / 1</dd>
                  </div>
                </dl>
              {/snippet}
              {#if selectedResourceBackupsQuery.isPending}
                <div class="min-h-20" aria-hidden="true"></div>
              {:else}
                <dl class="grid gap-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">
                      {$t(i18nKeys.console.dependencyResources.latestBackup)}
                    </dt>
                    <dd class="min-w-0 truncate font-medium">
                      {latestBackup ? backupLabel(latestBackup) : "-"}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">
                      {$t(i18nKeys.console.dependencyResources.backupStatus)}
                    </dt>
                    <dd class="font-medium">
                      {selectedBackups.length === 0 ? "0" : `${readyBackups.length} / ${selectedBackups.length}`}
                    </dd>
                  </div>
                </dl>
              {/if}
            </Skeleton>
            <div class="grid gap-2 sm:grid-cols-2">
              <Button
                class="w-full"
                variant="outline"
                disabled={createBackupMutation.isPending}
                onclick={() => (backupCreateDialogOpen = true)}
              >
                <HardDriveDownload class="size-4" />
                {$t(i18nKeys.console.dependencyResources.backupManageAction)}
              </Button>
              <Button
                class="w-full"
                variant="outline"
                disabled={readyBackups.length === 0 || restoreBackupMutation.isPending}
                onclick={openRestoreBackupDialog}
              >
                <ArchiveRestore class="size-4" />
                {$t(i18nKeys.console.dependencyResources.restoreManageAction)}
              </Button>
            </div>
          </section>
          {/if}

          {#if activeDependencyResourceBackupSection === "backup-policy"}
          <section class="console-panel space-y-4 p-5" data-dependency-resource-policy-summary>
            <div class="space-y-1">
              <h2 class="font-semibold">
                {$t(i18nKeys.console.dependencyResources.backupPolicy)}
              </h2>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.dependencyResources.backupPolicyDescription)}
              </p>
            </div>
            <dl class="grid gap-2 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted-foreground">
                  {$t(i18nKeys.console.dependencyResources.backupPolicyEnabled)}
                </dt>
                <dd class="font-medium">
                  {selectedBackupPolicy?.enabled
                    ? $t(i18nKeys.common.status.active)
                    : $t(i18nKeys.common.status.notConfigured)}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted-foreground">
                  {$t(i18nKeys.console.dependencyResources.backupPolicyNextRun)}
                </dt>
                <dd class="font-medium">
                  {selectedBackupPolicy ? formatTime(selectedBackupPolicy.nextRunAt) : "-"}
                </dd>
              </div>
            </dl>
            <Button class="w-full" type="button" variant="outline" onclick={openBackupPolicyDialog}>
              <HardDriveDownload class="size-4" />
              {$t(i18nKeys.console.dependencyResources.backupPolicyManageAction)}
            </Button>
          </section>
          {/if}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="settings" class={[detailTabPanelScrollClass, "space-y-5"]}>
        <section class="console-side-panel space-y-5" data-dependency-resource-lifecycle-handoff>
          <div class="space-y-1">
            <h2 class="flex items-center gap-2 font-semibold">
              <Settings2 class="size-4" />
              {$t(i18nKeys.common.domain.status)}
            </h2>
            <p class="text-sm text-muted-foreground">
              {$t(i18nKeys.console.dependencyResources.lifecycleDescription)}
            </p>
          </div>
          <dl class="grid gap-2 text-sm">
            <div class="flex items-center justify-between gap-3">
              <dt class="text-muted-foreground">
                {$t(i18nKeys.console.dependencyResources.realizationStatus)}
              </dt>
              <dd class="font-medium">
                {selectedDependencyResource.providerRealization?.status ??
                  selectedDependencyResource.lifecycleStatus}
              </dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-muted-foreground">
                {$t(i18nKeys.console.dependencyResources.bindingReadiness)}
              </dt>
              <dd class="font-medium">{selectedDependencyResource.bindingReadiness.status}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-muted-foreground">
                {$t(i18nKeys.console.dependencyResources.sourceMode)}
              </dt>
              <dd class="font-medium">{selectedDependencyResource.sourceMode}</dd>
            </div>
          </dl>
        </section>
        </Tabs.Content>

        <Tabs.Content value="danger" class={[detailTabPanelScrollClass, "space-y-5"]}>
        <section
          class="console-side-panel space-y-5 border-destructive/25 bg-destructive/5"
          data-dependency-resource-danger-zone
        >
          <div class="space-y-1">
            <h2 class="font-semibold">{$t(i18nKeys.console.dependencyResources.dangerZoneTitle)}</h2>
            <p class="text-sm text-muted-foreground">
              {$t(i18nKeys.console.dependencyResources.dangerZoneDescription)}
            </p>
          </div>
          {#if deleteSafetyBlockers.length > 0}
            <div class="rounded-md border border-destructive/25 bg-background p-3 text-sm">
              <p class="font-medium text-foreground">
                {$t(i18nKeys.console.dependencyResources.deleteBlockedTitle)}
              </p>
              <ul class="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {#each deleteSafetyBlockers as blocker}
                  <li>{blockerDescription(blocker)}</li>
                {/each}
              </ul>
            </div>
          {/if}
          <Button
            class="w-full border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
            type="button"
            variant="outline"
            disabled={deleteDependencyResourceMutation.isPending}
            onclick={openDeleteDependencyResourceDialog}
          >
            <Trash2 class="size-4" />
            {$t(i18nKeys.console.dependencyResources.deleteAction)}
          </Button>
        </section>
        </Tabs.Content>
      </Tabs.Root>
    </section>
    {/if}

  {#if selectedDependencyResource}
  <Dialog.Root bind:open={backupCreateDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-xl">
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.dependencyResources.backup)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.dependencyResources.backupDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <section class="space-y-5 px-5 pb-5" data-dependency-resource-backup-create-dialog>
        <div class="rounded-md border bg-muted/20 px-3 py-2">
          <p class="text-xs text-muted-foreground">
            {$t(i18nKeys.console.dependencyResources.selectedResource)}
          </p>
          <p class="mt-1 truncate text-sm font-medium">{selectedDependencyResource.name}</p>
          <div class="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p class="truncate">{selectedDependencyResource.kind}</p>
            <p class="truncate">
              {$t(i18nKeys.console.dependencyResources.sourceMode)}:
              {selectedDependencyResource.sourceMode}
            </p>
            <p class="truncate">
              {$t(i18nKeys.console.dependencyResources.realizationStatus)}:
              {selectedDependencyResource.providerRealization?.status ??
                selectedDependencyResource.lifecycleStatus}
            </p>
            <p class="truncate">
              {$t(i18nKeys.console.dependencyResources.latestBackup)}:
              {latestBackup ? backupLabel(latestBackup) : "-"}
            </p>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" onclick={() => (backupCreateDialogOpen = false)}>
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button
            type="button"
            disabled={!selectedDependencyResource || createBackupMutation.isPending}
            onclick={confirmBackupResource}
          >
            <HardDriveDownload class="size-4" />
            {createBackupMutation.isPending
              ? $t(i18nKeys.common.status.loading)
              : $t(i18nKeys.console.dependencyResources.backup)}
          </Button>
        </div>
      </section>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={restoreBackupDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-xl">
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.dependencyResources.restoreDialogTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.dependencyResources.restoreDialogDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <section class="space-y-5 px-5 pb-5">
        <div class="rounded-md border bg-muted/20 px-3 py-2">
          <p class="text-xs text-muted-foreground">
            {$t(i18nKeys.console.dependencyResources.selectedResource)}
          </p>
          <p class="mt-1 truncate text-sm font-medium">{selectedDependencyResource.name}</p>
        </div>

        <label class="space-y-1.5 text-sm font-medium">
          <span class="console-field-label">
            {$t(i18nKeys.console.dependencyResources.selectBackup)}
          </span>
          <Select.Root bind:value={selectedBackupId} type="single">
            <Select.Trigger class="w-full">
              {selectedBackupId
                ? selectedBackupLabel()
                : $t(i18nKeys.console.dependencyResources.selectBackup)}
            </Select.Trigger>
            <Select.Content>
              {#each readyBackups as backup (backup.id)}
                <Select.Item value={backup.id}>{backupLabel(backup)}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </label>

        <div class="space-y-3 rounded-md border border-destructive/25 bg-destructive/5 p-3">
          <label class="flex gap-2 text-sm text-muted-foreground">
            <input
              id="dependency-resource-restore-data-ack-input"
              class="mt-0.5 size-4 accent-primary"
              type="checkbox"
              bind:checked={restoreAcknowledgeData}
            />
            <span>{$t(i18nKeys.console.dependencyResources.restoreAcknowledgeData)}</span>
          </label>
          <label class="flex gap-2 text-sm text-muted-foreground">
            <input
              id="dependency-resource-restore-runtime-ack-input"
              class="mt-0.5 size-4 accent-primary"
              type="checkbox"
              bind:checked={restoreAcknowledgeRuntime}
            />
            <span>{$t(i18nKeys.console.dependencyResources.restoreAcknowledgeRuntime)}</span>
          </label>
        </div>

        <div class="flex justify-end">
          <Button
            type="button"
            disabled={!canRestore || restoreBackupMutation.isPending}
            onclick={restoreBackup}
          >
            <ArchiveRestore class="size-4" />
            {$t(i18nKeys.console.dependencyResources.restoreAction)}
          </Button>
        </div>
      </section>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={backupPolicyDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-xl">
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.dependencyResources.backupPolicyDialogTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.dependencyResources.backupPolicyDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <form class="space-y-5 px-5 pb-5" onsubmit={configureBackupPolicy}>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1.5 text-sm font-medium">
            <span class="console-field-label">
              {$t(i18nKeys.console.dependencyResources.backupPolicyRetentionDays)}
            </span>
            <Input
              id="dependency-resource-backup-policy-retention-input"
              type="number"
              min="1"
              bind:value={backupPolicyRetentionDays}
            />
          </label>
          <label class="space-y-1.5 text-sm font-medium">
            <span class="console-field-label">
              {$t(i18nKeys.console.dependencyResources.backupPolicyIntervalHours)}
            </span>
            <Input
              id="dependency-resource-backup-policy-interval-input"
              type="number"
              min="1"
              bind:value={backupPolicyIntervalHours}
            />
          </label>
        </div>
        <label class="flex gap-2 text-sm text-muted-foreground">
          <input
            id="dependency-resource-backup-policy-enabled-input"
            class="mt-0.5 size-4 accent-primary"
            type="checkbox"
            bind:checked={backupPolicyEnabled}
          />
          <span>{$t(i18nKeys.console.dependencyResources.backupPolicyEnabled)}</span>
        </label>
        <p class="text-xs text-muted-foreground">
          {$t(i18nKeys.console.dependencyResources.backupPolicyNextRun)}:
          {selectedBackupPolicy ? formatTime(selectedBackupPolicy.nextRunAt) : "-"}
        </p>
        <div class="flex justify-end">
          <Button
            id="dependency-resource-backup-policy-configure-action"
            type="submit"
            disabled={!canConfigureBackupPolicy || configureBackupPolicyMutation.isPending}
          >
            <HardDriveDownload class="size-4" />
            {$t(i18nKeys.common.actions.save)}
          </Button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={deleteDependencyResourceDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-xl">
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.dependencyResources.deleteDialogTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.dependencyResources.deleteDialogDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <section class="space-y-5 px-5 pb-5">
        <div class="rounded-md border bg-muted/20 px-3 py-2">
          <p class="text-xs text-muted-foreground">
            {$t(i18nKeys.console.dependencyResources.selectedResource)}
          </p>
          <p class="mt-1 truncate text-sm font-medium">{selectedDependencyResource.name}</p>
          <p class="mt-1 break-all font-mono text-xs text-muted-foreground">
            {selectedDependencyResource.id}
          </p>
        </div>
        <div class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground">
          {$t(i18nKeys.console.dependencyResources.deleteDialogWarning)}
        </div>
        {#if deleteSafetyBlockers.length > 0}
          <div class="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm">
            <p class="font-medium text-foreground">
              {$t(i18nKeys.console.dependencyResources.deleteBlockedTitle)}
            </p>
            <ul class="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {#each deleteSafetyBlockers as blocker}
                <li>{blockerDescription(blocker)}</li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if deleteDialogError}
          <div class="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-muted-foreground">
            {deleteDialogError}
          </div>
        {/if}
        <label class="space-y-1.5 text-sm font-medium">
          <span class="console-field-label">
            {$t(i18nKeys.console.dependencyResources.deleteConfirmLabel)}
          </span>
          <Input
            id="dependency-resource-delete-confirmation"
            bind:value={deleteDependencyResourceConfirmation}
            autocomplete="off"
            placeholder={selectedDependencyResource.id}
            aria-invalid={deleteDependencyResourceConfirmation.length > 0 &&
              deleteDependencyResourceConfirmation.trim() !== selectedDependencyResource.id}
          />
        </label>
        <div class="flex justify-end">
          <Button
            type="button"
            variant="destructive"
            disabled={!canDeleteSelectedDependencyResource || deleteDependencyResourceMutation.isPending}
            onclick={confirmDeleteDependencyResource}
          >
            <Trash2 class="size-4" />
            {$t(i18nKeys.console.dependencyResources.deleteAction)}
          </Button>
        </div>
      </section>
    </Dialog.Content>
  </Dialog.Root>
  {/if}
</ConsoleShell>

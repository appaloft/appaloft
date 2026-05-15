<script lang="ts">
  import { browser } from "$app/environment";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import {
    ArchiveRestore,
    BadgeCheck,
    Database,
    HardDriveDownload,
    Plus,
    Server,
    Trash2,
  } from "@lucide/svelte";
  import type {
    DependencyResourceBackupPolicyRead,
    DependencyResourceBackupSummary,
    DependencyResourceSummary,
    EnvironmentSummary,
    ProjectSummary,
    ServerSummary,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type DependencyKind = "postgres" | "redis";
  type CreateDependencyResourceInput = {
    kind: DependencyKind;
    projectId: string;
    environmentId: string;
    serverId: string;
    name: string;
    backupRelationship?: {
      retentionRequired: boolean;
      reason?: string;
    };
  };
  type Feedback = {
    kind: "success" | "error";
    title: string;
    detail: string;
  };

  const dependencyKindOptions = {
    postgres: {
      labelKey: i18nKeys.console.dependencyResources.kindPostgres,
      provision: (input: CreateDependencyResourceInput) =>
        orpcClient.dependencyResources.provisionPostgres(input),
    },
    redis: {
      labelKey: i18nKeys.console.dependencyResources.kindRedis,
      provision: (input: CreateDependencyResourceInput) =>
        orpcClient.dependencyResources.provisionRedis(input),
    },
  } satisfies Record<
    DependencyKind,
    {
      labelKey: string;
      provision(input: CreateDependencyResourceInput): Promise<{ id: string }>;
    }
  >;

  const { projectsQuery, environmentsQuery, serversQuery } = createConsoleQueries(browser, {
    resources: false,
    deployments: false,
    previewEnvironments: false,
    domainBindings: false,
    certificates: false,
    providers: false,
  });
  const dependencyResourcesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["dependency-resources"],
      queryFn: () => orpcClient.dependencyResources.list({}),
      enabled: browser,
      staleTime: 5_000,
    }),
  );

  let selectedProjectId = $state("");
  let selectedEnvironmentId = $state("");
  let selectedServerId = $state("");
  let createKind = $state<DependencyKind>("postgres");
  let createName = $state("");
  let backupRetentionRequired = $state(false);
  let backupRetentionReason = $state("");
  let selectedDependencyResourceId = $state("");
  let selectedBackupId = $state("");
  let restoreAcknowledgeData = $state(false);
  let restoreAcknowledgeRuntime = $state(false);
  let backupPolicyRetentionDays = $state("7");
  let backupPolicyIntervalHours = $state("24");
  let backupPolicyEnabled = $state(true);
  let feedback = $state<Feedback | null>(null);

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const dependencyResources = $derived(dependencyResourcesQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      serversQuery.isPending ||
      dependencyResourcesQuery.isPending,
  );
  const activeSingleServerTargets = $derived(
    servers.filter(
      (server) =>
        server.lifecycleStatus === "active" &&
        server.targetKind === "single-server" &&
        (server.providerKey === "local-shell" || server.providerKey === "generic-ssh"),
    ),
  );
  const projectEnvironments = $derived(
    selectedProjectId
      ? environments.filter((environment) => environment.projectId === selectedProjectId)
      : environments,
  );
  const filteredDependencyResources = $derived(
    dependencyResources.filter(
      (resource) =>
        (!selectedProjectId || resource.projectId === selectedProjectId) &&
        (!selectedEnvironmentId || resource.environmentId === selectedEnvironmentId),
    ),
  );
  const selectedDependencyResource = $derived(
    dependencyResources.find((resource) => resource.id === selectedDependencyResourceId) ?? null,
  );
  const selectedResourceBackupsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["dependency-resources", selectedDependencyResourceId, "backups"],
      queryFn: () =>
        orpcClient.dependencyResources.listBackups({
          dependencyResourceId: selectedDependencyResourceId,
        }),
      enabled: browser && selectedDependencyResourceId.length > 0,
      staleTime: 5_000,
    }),
  );
  const backupPoliciesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["dependency-resources", selectedDependencyResourceId, "backup-policies"],
      queryFn: () =>
        orpcClient.dependencyResources.listBackupPolicies({
          dependencyResourceId: selectedDependencyResourceId,
        }),
      enabled: browser && selectedDependencyResourceId.length > 0,
      staleTime: 5_000,
    }),
  );
  const selectedBackups = $derived(selectedResourceBackupsQuery.data?.items ?? []);
  const selectedBackupPolicies = $derived(backupPoliciesQuery.data?.items ?? []);
  const selectedBackupPolicy = $derived(
    (selectedBackupPolicies[0] ?? null) as DependencyResourceBackupPolicyRead | null,
  );
  const readyBackups = $derived(selectedBackups.filter((backup) => backup.status === "ready"));
  const latestBackup = $derived(readyBackups[0] ?? selectedBackups[0] ?? null);
  const canCreate = $derived(
    selectedProjectId.length > 0 &&
      selectedEnvironmentId.length > 0 &&
      selectedServerId.length > 0 &&
      createName.trim().length > 0,
  );
  const canRestore = $derived(
    selectedBackupId.length > 0 && restoreAcknowledgeData && restoreAcknowledgeRuntime,
  );
  const canConfigureBackupPolicy = $derived(
    selectedDependencyResourceId.length > 0 &&
      Number.parseInt(backupPolicyRetentionDays, 10) > 0 &&
      Number.parseInt(backupPolicyIntervalHours, 10) > 0,
  );

  const createDependencyResourceMutation = createMutation(() => ({
    mutationFn: (input: CreateDependencyResourceInput) =>
      dependencyKindOptions[input.kind].provision(input),
    onSuccess: (result) => {
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.dependencyResources.createSucceeded),
        detail: result.id,
      };
      createName = "";
      backupRetentionRequired = false;
      backupRetentionReason = "";
      selectedDependencyResourceId = result.id;
      void invalidateDependencyResourceQueries();
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.createFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const createBackupMutation = createMutation(() => ({
    mutationFn: (dependencyResourceId: string) =>
      orpcClient.dependencyResources.createBackup({ dependencyResourceId }),
    onSuccess: (result) => {
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.dependencyResources.backupCreated),
        detail: result.id,
      };
      void invalidateDependencyResourceQueries();
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.backupFailed),
        detail: readErrorMessage(error),
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
      void invalidateDependencyResourceQueries();
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.restoreFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const deleteDependencyResourceMutation = createMutation(() => ({
    mutationFn: (dependencyResourceId: string) =>
      orpcClient.dependencyResources.delete({ dependencyResourceId }),
    onSuccess: (result) => {
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.dependencyResources.deleteSucceeded),
        detail: result.id,
      };
      if (selectedDependencyResourceId === result.id) {
        selectedDependencyResourceId = "";
      }
      void invalidateDependencyResourceQueries();
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.deleteFailed),
        detail: readErrorMessage(error),
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
      void invalidateDependencyResourceQueries();
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.backupPolicyConfigureFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  $effect(() => {
    if (!selectedProjectId && projects.length > 0) {
      selectedProjectId = projects[0]?.id ?? "";
    }
  });

  $effect(() => {
    if (!selectedEnvironmentId && projectEnvironments.length > 0) {
      selectedEnvironmentId = projectEnvironments[0]?.id ?? "";
    }
    if (
      selectedEnvironmentId &&
      !projectEnvironments.some((environment) => environment.id === selectedEnvironmentId)
    ) {
      selectedEnvironmentId = projectEnvironments[0]?.id ?? "";
    }
  });

  $effect(() => {
    if (!selectedServerId && activeSingleServerTargets.length > 0) {
      selectedServerId = activeSingleServerTargets[0]?.id ?? "";
    }
  });

  $effect(() => {
    if (!selectedDependencyResourceId && filteredDependencyResources.length > 0) {
      selectedDependencyResourceId = filteredDependencyResources[0]?.id ?? "";
    }
    if (
      selectedDependencyResourceId &&
      !filteredDependencyResources.some((resource) => resource.id === selectedDependencyResourceId)
    ) {
      selectedDependencyResourceId = filteredDependencyResources[0]?.id ?? "";
    }
  });

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

  function invalidateDependencyResourceQueries(): Promise<unknown> {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dependency-resources"] }),
      queryClient.invalidateQueries({
        queryKey: ["dependency-resources", selectedDependencyResourceId, "backups"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["dependency-resources", selectedDependencyResourceId, "backup-policies"],
      }),
    ]);
  }

  function projectName(projectId: string): string {
    return projects.find((project) => project.id === projectId)?.name ?? projectId;
  }

  function environmentName(environmentId: string): string {
    return environments.find((environment) => environment.id === environmentId)?.name ?? environmentId;
  }

  function serverName(serverId: string): string {
    return servers.find((server) => server.id === serverId)?.name ?? serverId;
  }

  function kindLabel(kind: DependencyKind): string {
    return $t(dependencyKindOptions[kind].labelKey);
  }

  function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    if (status === "ready" || status === "active") {
      return "default";
    }
    if (status === "failed" || status === "degraded" || status === "blocked") {
      return "destructive";
    }
    if (status === "deleted") {
      return "secondary";
    }
    return "outline";
  }

  function submitCreate(event: SubmitEvent): void {
    event.preventDefault();
    if (!canCreate || createDependencyResourceMutation.isPending) {
      return;
    }
    const reason = backupRetentionReason.trim();
    createDependencyResourceMutation.mutate({
      kind: createKind,
      projectId: selectedProjectId,
      environmentId: selectedEnvironmentId,
      serverId: selectedServerId,
      name: createName.trim(),
      ...(backupRetentionRequired || reason
        ? {
            backupRelationship: {
              retentionRequired: backupRetentionRequired,
              ...(reason ? { reason } : {}),
            },
          }
        : {}),
    });
  }

  function selectResource(resource: DependencyResourceSummary): void {
    selectedDependencyResourceId = resource.id;
    selectedBackupId = "";
    restoreAcknowledgeData = false;
    restoreAcknowledgeRuntime = false;
  }

  function backupResource(resource: DependencyResourceSummary): void {
    selectedDependencyResourceId = resource.id;
    createBackupMutation.mutate(resource.id);
  }

  function deleteResource(resource: DependencyResourceSummary): void {
    selectedDependencyResourceId = resource.id;
    deleteDependencyResourceMutation.mutate(resource.id);
  }

  function restoreBackup(): void {
    if (!canRestore) {
      return;
    }
    if (restoreBackupMutation.isPending) {
      return;
    }
    restoreBackupMutation.mutate(selectedBackupId);
  }

  function configureBackupPolicy(event: SubmitEvent): void {
    event.preventDefault();
    if (!canConfigureBackupPolicy || configureBackupPolicyMutation.isPending) {
      return;
    }

    configureBackupPolicyMutation.mutate({
      dependencyResourceId: selectedDependencyResourceId,
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

  $effect(() => {
    if (selectedBackupPolicy) {
      backupPolicyRetentionDays = String(selectedBackupPolicy.retentionDays);
      backupPolicyIntervalHours = String(selectedBackupPolicy.scheduleIntervalHours);
      backupPolicyEnabled = selectedBackupPolicy.enabled;
    }
  });
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.dependencyResources.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.dependencyResources.pageTitle)}
  description={$t(i18nKeys.console.dependencyResources.pageDescription)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-8 w-72" />
      <Skeleton class="h-44 w-full" />
      <Skeleton class="h-80 w-full" />
    </div>
  {:else}
    <div class="space-y-8">
      <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div class="max-w-3xl space-y-2">
          <Badge class="console-page-kicker" variant="outline">
            <Database class="size-3.5" />
            {$t(i18nKeys.console.dependencyResources.dockerBacked)}
          </Badge>
          <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.dependencyResources.focusTitle)}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.dependencyResources.focusDescription)}
          </p>
        </div>
        <div class="console-metric-strip grid-cols-3 text-center md:min-w-96">
          <div>
            <p class="text-xl font-semibold">{dependencyResources.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.console.dependencyResources.focusTitle)}
            </p>
          </div>
          <div>
            <p class="text-xl font-semibold">
              {dependencyResources.filter((resource) => resource.lifecycleStatus === "ready").length}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.common.status.ready)}
            </p>
          </div>
          <div>
            <p class="text-xl font-semibold">{activeSingleServerTargets.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {$t(i18nKeys.common.domain.servers)}
            </p>
          </div>
        </div>
      </section>

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
          <p class="mt-1 break-all text-muted-foreground">{feedback.detail}</p>
        </section>
      {/if}

      <section class="console-panel space-y-5 p-5">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.dependencyResources.createAction)}</h2>
              <DocsHelpLink
                href={webDocsHrefs.dependencyResourceLifecycle}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
              />
            </div>
            <p class="text-sm text-muted-foreground">
              {$t(i18nKeys.console.dependencyResources.createDescription)}
            </p>
          </div>
          <Badge variant="outline">{$t(i18nKeys.console.dependencyResources.managedOnlyNotice)}</Badge>
        </div>

        <form
          id="dependency-resource-create-form"
          class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_auto]"
          onsubmit={submitCreate}
        >
          <label class="space-y-1.5 text-sm font-medium">
            <span class="console-field-label">{$t(i18nKeys.common.domain.project)}</span>
            <Select.Root bind:value={selectedProjectId} type="single">
              <Select.Trigger class="w-full">{projectName(selectedProjectId)}</Select.Trigger>
              <Select.Content>
                {#each projects as project (project.id)}
                  <Select.Item value={project.id}>{project.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>

          <label class="space-y-1.5 text-sm font-medium">
            <span class="console-field-label">{$t(i18nKeys.common.domain.environment)}</span>
            <Select.Root bind:value={selectedEnvironmentId} type="single">
              <Select.Trigger class="w-full">{environmentName(selectedEnvironmentId)}</Select.Trigger>
              <Select.Content>
                {#each projectEnvironments as environment (environment.id)}
                  <Select.Item value={environment.id}>{environment.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>

          <label class="space-y-1.5 text-sm font-medium">
            <span class="console-field-label">{$t(i18nKeys.common.domain.server)}</span>
            <Select.Root bind:value={selectedServerId} type="single">
              <Select.Trigger class="w-full">
                {selectedServerId ? serverName(selectedServerId) : $t(i18nKeys.console.dependencyResources.selectServer)}
              </Select.Trigger>
              <Select.Content>
                {#each activeSingleServerTargets as server (server.id)}
                  <Select.Item value={server.id}>{server.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>

          <label class="space-y-1.5 text-sm font-medium">
            <span class="console-field-label">{$t(i18nKeys.common.domain.kind)}</span>
            <Select.Root bind:value={createKind} type="single">
              <Select.Trigger class="w-full">{kindLabel(createKind)}</Select.Trigger>
              <Select.Content>
                <Select.Item value="postgres">{$t(i18nKeys.console.dependencyResources.kindPostgres)}</Select.Item>
                <Select.Item value="redis">{$t(i18nKeys.console.dependencyResources.kindRedis)}</Select.Item>
              </Select.Content>
            </Select.Root>
          </label>

          <label class="space-y-1.5 text-sm font-medium">
            <span class="console-field-label">{$t(i18nKeys.common.domain.name)}</span>
            <Input
              id="dependency-resource-name-input"
              bind:value={createName}
              placeholder={$t(i18nKeys.console.dependencyResources.namePlaceholder)}
            />
          </label>

          <Button
            class="self-end"
            type="submit"
            disabled={!canCreate || createDependencyResourceMutation.isPending}
          >
            {#if createDependencyResourceMutation.isPending}
              {$t(i18nKeys.common.actions.creating)}
            {:else}
              <Plus class="size-4" />
              {$t(i18nKeys.console.dependencyResources.createAction)}
            {/if}
          </Button>
        </form>

        <div class="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
          <label class="flex items-center gap-2 text-sm">
            <input
              id="dependency-resource-backup-retention-input"
              class="size-4 accent-primary"
              type="checkbox"
              bind:checked={backupRetentionRequired}
            />
            {$t(i18nKeys.console.dependencyResources.backupRetention)}
          </label>
          <Input
            id="dependency-resource-backup-retention-reason-input"
            bind:value={backupRetentionReason}
            placeholder={$t(i18nKeys.console.dependencyResources.backupRetentionReasonPlaceholder)}
          />
        </div>
      </section>

      <section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="space-y-4">
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.dependencyResources.focusTitle)}</h2>
            <div class="flex flex-wrap gap-2">
              <Select.Root bind:value={selectedProjectId} type="single">
                <Select.Trigger class="min-w-48">
                  {selectedProjectId ? projectName(selectedProjectId) : $t(i18nKeys.console.dependencyResources.filterAll)}
                </Select.Trigger>
                <Select.Content>
                  {#each projects as project (project.id)}
                    <Select.Item value={project.id}>{project.name}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <Select.Root bind:value={selectedEnvironmentId} type="single">
                <Select.Trigger class="min-w-48">
                  {selectedEnvironmentId ? environmentName(selectedEnvironmentId) : $t(i18nKeys.console.dependencyResources.filterAll)}
                </Select.Trigger>
                <Select.Content>
                  {#each projectEnvironments as environment (environment.id)}
                    <Select.Item value={environment.id}>{environment.name}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          </div>

          {#if filteredDependencyResources.length === 0}
            <section class="console-panel space-y-2 p-5">
              <h3 class="font-semibold">{$t(i18nKeys.console.dependencyResources.emptyTitle)}</h3>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.dependencyResources.emptyBody)}
              </p>
            </section>
          {:else}
            <div class="console-record-list">
              {#each filteredDependencyResources as resource (resource.id)}
                <article
                  class={[
                    "console-record-row lg:grid-cols-[minmax(0,1fr)_auto]",
                    selectedDependencyResourceId === resource.id ? "bg-muted/50" : "",
                  ]}
                >
                  <div class="min-w-0 space-y-3">
                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant="outline">{kindLabel(resource.kind)}</Badge>
                      <h3 class="truncate font-semibold">{resource.name}</h3>
                      <Badge variant={statusVariant(resource.lifecycleStatus)}>
                        {resource.lifecycleStatus}
                      </Badge>
                      <Badge variant={statusVariant(resource.bindingReadiness.status)}>
                        {$t(i18nKeys.console.dependencyResources.bindingReadiness)} · {resource.bindingReadiness.status}
                      </Badge>
                    </div>
                    <div class="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
                      <p class="truncate">
                        {$t(i18nKeys.common.domain.project)}: {projectName(resource.projectId)}
                      </p>
                      <p class="truncate">
                        {$t(i18nKeys.common.domain.environment)}: {environmentName(resource.environmentId)}
                      </p>
                      <p class="truncate">
                        {$t(i18nKeys.console.dependencyResources.sourceMode)}: {resource.sourceMode}
                      </p>
                    </div>
                    {#if resource.connection}
                      <p class="truncate font-mono text-xs text-muted-foreground">
                        {resource.connection.maskedConnection}
                      </p>
                    {/if}
                  </div>
                  <div class="flex flex-wrap gap-2 lg:justify-end">
                    <Button size="sm" variant="outline" onclick={() => selectResource(resource)}>
                      {$t(i18nKeys.common.actions.viewDetails)}
                    </Button>
                    <Button
                      id={`dependency-resource-backup-action-${resource.id}`}
                      size="sm"
                      variant="outline"
                      disabled={createBackupMutation.isPending}
                      onclick={() => backupResource(resource)}
                    >
                      <HardDriveDownload class="size-4" />
                      {$t(i18nKeys.console.dependencyResources.backup)}
                    </Button>
                    <Button
                      id={`dependency-resource-delete-action-${resource.id}`}
                      size="sm"
                      variant="outline"
                      disabled={deleteDependencyResourceMutation.isPending}
                      onclick={() => deleteResource(resource)}
                    >
                      <Trash2 class="size-4" />
                      {$t(i18nKeys.console.dependencyResources.deleteAction)}
                    </Button>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </div>

        <aside class="console-side-panel space-y-5">
          {#if selectedDependencyResource}
            <div class="space-y-2">
              <Badge variant="outline">
                <BadgeCheck class="size-3.5" />
                {$t(i18nKeys.console.dependencyResources.selectedResource)}
              </Badge>
              <h2 class="truncate text-lg font-semibold">{selectedDependencyResource.name}</h2>
              <div class="grid gap-2 text-xs text-muted-foreground">
                <p class="break-all">ID: {selectedDependencyResource.id}</p>
                <p>
                  {$t(i18nKeys.console.dependencyResources.realizationStatus)}:
                  {selectedDependencyResource.providerRealization?.status ?? selectedDependencyResource.lifecycleStatus}
                </p>
                <p>
                  {$t(i18nKeys.console.dependencyResources.endpoint)}:
                  {selectedDependencyResource.connection?.host ?? selectedDependencyResource.connection?.maskedConnection ?? "-"}
                </p>
                <p class="break-all">
                  {$t(i18nKeys.console.dependencyResources.providerHandle)}:
                  {selectedDependencyResource.providerRealization?.providerResourceHandle ?? "-"}
                </p>
              </div>
            </div>

            <div class="console-section space-y-3">
              <div class="space-y-1">
                <h3 class="flex items-center gap-2 font-semibold">
                  <HardDriveDownload class="size-4" />
                  {$t(i18nKeys.console.dependencyResources.backupListTitle)}
                </h3>
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.dependencyResources.backupDescription)}
                </p>
              </div>
              <Button
                class="w-full"
                variant="outline"
                disabled={createBackupMutation.isPending}
                onclick={() => backupResource(selectedDependencyResource)}
              >
                <HardDriveDownload class="size-4" />
                {$t(i18nKeys.console.dependencyResources.backup)}
              </Button>

              {#if selectedResourceBackupsQuery.isPending}
                <Skeleton class="h-20 w-full" />
              {:else if selectedBackups.length === 0}
                <p class="text-sm text-muted-foreground">{$t(i18nKeys.console.dependencyResources.latestBackup)}: -</p>
              {:else}
                <div class="space-y-2">
                  <p class="text-sm text-muted-foreground">
                    {$t(i18nKeys.console.dependencyResources.latestBackup)}:
                    {latestBackup ? backupLabel(latestBackup) : "-"}
                  </p>
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
                  <Button
                    class="w-full"
                    disabled={!canRestore || restoreBackupMutation.isPending}
                    onclick={restoreBackup}
                  >
                    <ArchiveRestore class="size-4" />
                    {$t(i18nKeys.console.dependencyResources.restoreAction)}
                  </Button>
                </div>
              {/if}
            </div>

            <form class="console-section space-y-3" onsubmit={configureBackupPolicy}>
              <div class="space-y-1">
                <h3 class="font-semibold">
                  {$t(i18nKeys.console.dependencyResources.backupPolicy)}
                </h3>
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.dependencyResources.backupPolicyDescription)}
                </p>
              </div>
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
              <Button
                id="dependency-resource-backup-policy-configure-action"
                class="w-full"
                type="submit"
                disabled={!canConfigureBackupPolicy || configureBackupPolicyMutation.isPending}
              >
                <HardDriveDownload class="size-4" />
                {$t(i18nKeys.common.actions.save)}
              </Button>
            </form>
          {:else}
            <div class="space-y-3 text-sm text-muted-foreground">
              <Server class="size-5" />
              <p>{$t(i18nKeys.console.dependencyResources.emptyBody)}</p>
            </div>
          {/if}
        </aside>
      </section>
    </div>
  {/if}
</ConsoleShell>

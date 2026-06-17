<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { createMutation, createQuery } from "@tanstack/svelte-query";
  import { BadgeCheck, Plus } from "@lucide/svelte";
  import type { IconModule as BrandIconModule } from "@thesvg/icons";
  import clickhouseIcon from "@thesvg/icons/clickhouse";
  import minioIcon from "@thesvg/icons/minio";
  import mysqlIcon from "@thesvg/icons/mysql";
  import opensearchIcon from "@thesvg/icons/opensearch";
  import postgresqlIcon from "@thesvg/icons/postgresql";
  import redisIcon from "@thesvg/icons/redis";
  import type {
    CreateEnvironmentResponse,
    CreateProjectResponse,
    DependencyResourceProvisioningPlan,
    DependencyResourceSummary,
    RegisterServerResponse,
  } from "@appaloft/contracts";
  import type { TranslationKey } from "@appaloft/i18n";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import ConsoleStatePanel from "$lib/components/console/ConsoleStatePanel.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import EnvironmentCreateForm from "$lib/components/console/EnvironmentCreateForm.svelte";
  import ProjectCreateForm from "$lib/components/console/ProjectCreateForm.svelte";
  import ServerCreateForm from "$lib/components/console/ServerCreateForm.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import { canRunProductQueries } from "$lib/console/auth-query-gate";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";
  import { dependencyResourceDetailHref } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type DependencyKind = DependencyResourceSummary["kind"];
  type DependencyKindIcon = {
    title: string;
    svg: string;
  };
  type ProvisioningMode = "create" | "reuse";
  type ProvisioningPlanInput = Parameters<typeof orpcClient.dependencyResources.provisioning.plan>[0];
  type DependencyKindOption = {
    labelKey: TranslationKey;
    descriptionKey: TranslationKey;
    connectionPlaceholderKey: TranslationKey;
    icon: DependencyKindIcon;
  };
  type Feedback = {
    kind: "success" | "error";
    title: string;
    detail: string;
  };

  function brandIcon(icon: BrandIconModule, variant = "default"): DependencyKindIcon {
    return { title: icon.title, svg: icon.variants[variant] ?? icon.svg };
  }

  const dependencyKindOptions: Record<DependencyKind, DependencyKindOption> = {
    postgres: {
      labelKey: i18nKeys.console.dependencyResources.kindPostgres,
      descriptionKey: i18nKeys.console.dependencyResources.kindPostgresDescription,
      connectionPlaceholderKey: i18nKeys.console.dependencyResources.connectionUrlPlaceholderPostgres,
      icon: brandIcon(postgresqlIcon),
    },
    redis: {
      labelKey: i18nKeys.console.dependencyResources.kindRedis,
      descriptionKey: i18nKeys.console.dependencyResources.kindRedisDescription,
      connectionPlaceholderKey: i18nKeys.console.dependencyResources.connectionUrlPlaceholderRedis,
      icon: brandIcon(redisIcon),
    },
    mysql: {
      labelKey: i18nKeys.console.dependencyResources.kindMysql,
      descriptionKey: i18nKeys.console.dependencyResources.kindMysqlDescription,
      connectionPlaceholderKey: i18nKeys.console.dependencyResources.connectionUrlPlaceholderMysql,
      icon: brandIcon(mysqlIcon, "light"),
    },
    clickhouse: {
      labelKey: i18nKeys.console.dependencyResources.kindClickHouse,
      descriptionKey: i18nKeys.console.dependencyResources.kindClickHouseDescription,
      connectionPlaceholderKey: i18nKeys.console.dependencyResources.connectionUrlPlaceholderClickHouse,
      icon: brandIcon(clickhouseIcon),
    },
    "object-storage": {
      labelKey: i18nKeys.console.dependencyResources.kindObjectStorage,
      descriptionKey: i18nKeys.console.dependencyResources.kindObjectStorageDescription,
      connectionPlaceholderKey: i18nKeys.console.dependencyResources.connectionUrlPlaceholderObjectStorage,
      icon: brandIcon(minioIcon),
    },
    opensearch: {
      labelKey: i18nKeys.console.dependencyResources.kindOpenSearch,
      descriptionKey: i18nKeys.console.dependencyResources.kindOpenSearchDescription,
      connectionPlaceholderKey: i18nKeys.console.dependencyResources.connectionUrlPlaceholderOpenSearch,
      icon: brandIcon(opensearchIcon),
    },
  };
  const dependencyKindOrder = [
    "postgres",
    "redis",
    "mysql",
    "clickhouse",
    "object-storage",
    "opensearch",
  ] as const satisfies readonly DependencyKind[];
  const provisioningModes = ["create", "reuse"] as const satisfies readonly ProvisioningMode[];
  const dependencyKindConnectionProtocols: Record<DependencyKind, readonly string[]> = {
    postgres: ["postgres:", "postgresql:"],
    redis: ["redis:", "rediss:"],
    mysql: ["mysql:"],
    clickhouse: ["clickhouse:", "clickhouses:", "http:", "https:"],
    "object-storage": ["s3:", "minio:", "http:", "https:"],
    opensearch: ["http:", "https:"],
  };
  const dependencyResourceSelectContentClass = "z-[60]";
  const dependencyResourceNestedDialogClass = "z-[70]";
  const allDependencyResourceFilterValue = "__all_dependency_resources__";

  const { authSessionQuery, projectsQuery, environmentsQuery, serversQuery } = createConsoleQueries(browser, {
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
  const dependencyResourcesQuery = createQuery(() =>
    orpc.dependencyResources.list.queryOptions({
      input: { limit: 100 },
      enabled: dependencyResourceQueriesEnabled,
      staleTime: 5_000,
    }),
  );

  let filterProjectId = $state("");
  let filterEnvironmentId = $state("");
  let createProjectId = $state("");
  let createEnvironmentId = $state("");
  let selectedServerId = $state("");
  let provisioningMode = $state<ProvisioningMode>("create");
  let createKind = $state<DependencyKind>("postgres");
  let createName = $state("");
  let reuseConnectionUrl = $state("");
  let reuseSecretRef = $state("");
  let provisioningPlan = $state<DependencyResourceProvisioningPlan | null>(null);
  let acceptProvisioningPlanAcknowledged = $state(false);
  let feedback = $state<Feedback | null>(null);
  let projectCreateDialogOpen = $state(false);
  let environmentCreateDialogOpen = $state(false);
  let serverCreateDialogOpen = $state(false);
  let openEnvironmentAfterProjectCreate = $state(false);

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const dependencyResources = $derived(dependencyResourcesQuery.data?.items ?? []);
  const dependencyResourcesLoading = $derived(
    (authSessionQuery.isPending && !authSessionQuery.data) ||
      (dependencyResourceQueriesEnabled &&
        dependencyResourcesQuery.isPending &&
        !dependencyResourcesQuery.data),
  );
  const dependencyResourcesError = $derived(
    dependencyResourcesQuery.error ? readErrorMessage(dependencyResourcesQuery.error) : "",
  );
  const dependencyResourceEnrichmentLoading = $derived(
    dependencyResourceQueriesEnabled &&
      (projectsQuery.isPending || environmentsQuery.isPending || serversQuery.isPending),
  );
  const activeSingleServerTargets = $derived(
    servers.filter(
      (server) =>
        server.lifecycleStatus === "active" &&
        server.targetKind === "single-server" &&
        (server.providerKey === "local-shell" || server.providerKey === "generic-ssh"),
    ),
  );
  const filterProjectEnvironments = $derived(
    filterProjectId
      ? environments.filter((environment) => environment.projectId === filterProjectId)
      : environments,
  );
  const filterProjectSelectValue = $derived(
    filterProjectId || allDependencyResourceFilterValue,
  );
  const filterEnvironmentSelectValue = $derived(
    filterEnvironmentId || allDependencyResourceFilterValue,
  );
  const createProjectEnvironments = $derived(
    createProjectId
      ? environments.filter((environment) => environment.projectId === createProjectId)
      : environments,
  );
  const filteredDependencyResources = $derived(
    dependencyResources.filter(
      (resource) =>
        (!filterProjectId || resource.projectId === filterProjectId) &&
        (!filterEnvironmentId || resource.environmentId === filterEnvironmentId),
    ),
  );
  const canCreate = $derived(
    createProjectId.length > 0 &&
      createEnvironmentId.length > 0 &&
      createName.trim().length > 0 &&
      (provisioningMode === "create"
        ? selectedServerId.length > 0
        : reuseConnectionUrl.trim().length > 0),
  );
  const canAcceptProvisioningPlan = $derived(
    Boolean(provisioningPlan?.id) &&
      provisioningPlan?.status === "planned" &&
      acceptProvisioningPlanAcknowledged,
  );
  const reuseConnectionUrlValidation = $derived(
    provisioningMode === "reuse" && reuseConnectionUrl.trim().length > 0
      ? validateReuseConnectionUrl(createKind, reuseConnectionUrl)
      : "",
  );
  let dependencyResourceCreateDialogOpen = $state(false);

  $effect(() => {
    dependencyResourceCreateDialogOpen = modalIsOpen(page, "create-dependency-resource");
  });

  const createDependencyResourceMutation = createMutation(() => ({
    mutationFn: (input: ProvisioningPlanInput) =>
      orpcClient.dependencyResources.provisioning.plan(input),
    onSuccess: (result) => {
      provisioningPlan = result.plan;
      acceptProvisioningPlanAcknowledged = false;
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.dependencyResources.planCreated),
        detail: result.plan.id,
      };
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.planFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const acceptProvisioningPlanMutation = createMutation(() => ({
    mutationFn: (planId: string) =>
      orpcClient.dependencyResources.provisioning.accept({
        planId,
        acknowledgeMutation: true,
      }),
    onSuccess: (result) => {
      provisioningPlan = result.plan;
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.dependencyResources.createSucceeded),
        detail: result.plan.dependencyResourceId ?? result.plan.id,
      };
      createName = "";
      reuseConnectionUrl = "";
      reuseSecretRef = "";
      acceptProvisioningPlanAcknowledged = false;
      void setModalOpen(page, "create-dependency-resource", false);
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
  $effect(() => {
    if (!createProjectId && projects.length > 0) {
      createProjectId = projects[0]?.id ?? "";
    }
  });

  $effect(() => {
    if (!createEnvironmentId && createProjectEnvironments.length > 0) {
      createEnvironmentId = createProjectEnvironments[0]?.id ?? "";
    }
    if (
      createEnvironmentId &&
      !createProjectEnvironments.some((environment) => environment.id === createEnvironmentId)
    ) {
      createEnvironmentId = createProjectEnvironments[0]?.id ?? "";
    }
  });

  $effect(() => {
    if (
      filterEnvironmentId &&
      !filterProjectEnvironments.some((environment) => environment.id === filterEnvironmentId)
    ) {
      filterEnvironmentId = "";
    }
  });

  $effect(() => {
    if (!selectedServerId && activeSingleServerTargets.length > 0) {
      selectedServerId = activeSingleServerTargets[0]?.id ?? "";
    }
  });

  function invalidateDependencyResourceQueries(): Promise<unknown> {
    return queryClient.invalidateQueries({ queryKey: orpc.dependencyResources.key({ type: "query" }) });
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

  function openProjectCreateDialog(): void {
    openEnvironmentAfterProjectCreate = false;
    projectCreateDialogOpen = true;
  }

  function openEnvironmentCreateDialog(): void {
    if (!createProjectId) {
      openEnvironmentAfterProjectCreate = true;
      projectCreateDialogOpen = true;
      return;
    }
    environmentCreateDialogOpen = true;
  }

  function openServerCreateDialog(): void {
    serverCreateDialogOpen = true;
  }

  function openDependencyResourceCreateDialog(): void {
    void setModalOpen(page, "create-dependency-resource", true);
  }

  function setDependencyResourceCreateDialogOpen(open: boolean): void {
    dependencyResourceCreateDialogOpen = open;
    void setModalOpen(page, "create-dependency-resource", open);
  }

  function selectDependencyResourceProjectFilter(value: string): void {
    filterProjectId = value === allDependencyResourceFilterValue ? "" : value;
  }

  function selectDependencyResourceEnvironmentFilter(value: string): void {
    filterEnvironmentId = value === allDependencyResourceFilterValue ? "" : value;
  }

  function handleProjectCreated(project: CreateProjectResponse): void {
    createProjectId = project.id;
    createEnvironmentId = "";
    projectCreateDialogOpen = false;
    if (openEnvironmentAfterProjectCreate) {
      openEnvironmentAfterProjectCreate = false;
      environmentCreateDialogOpen = true;
    }
  }

  function handleEnvironmentCreated(environment: CreateEnvironmentResponse): void {
    createEnvironmentId = environment.id;
    environmentCreateDialogOpen = false;
  }

  function handleServerCreated(server: RegisterServerResponse): void {
    selectedServerId = server.id;
    serverCreateDialogOpen = false;
  }

  function kindLabel(kind: DependencyKind): string {
    return $t(dependencyKindOptions[kind].labelKey);
  }

  function kindIcon(kind: DependencyKind): DependencyKindIcon {
    return dependencyKindOptions[kind].icon;
  }

  function connectionUrlPlaceholder(kind: DependencyKind): string {
    return $t(dependencyKindOptions[kind].connectionPlaceholderKey);
  }

  function validateReuseConnectionUrl(kind: DependencyKind, value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return $t(i18nKeys.console.dependencyResources.connectionUrlInvalid);
    }

    if (!dependencyKindConnectionProtocols[kind].includes(parsed.protocol)) {
      return $t(i18nKeys.console.dependencyResources.connectionUrlUnsupportedForKind);
    }

    if (!parsed.hostname) {
      return $t(i18nKeys.console.dependencyResources.connectionUrlHostRequired);
    }

    return "";
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
    if (provisioningMode === "reuse" && reuseConnectionUrlValidation) {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.dependencyResources.planFailed),
        detail: reuseConnectionUrlValidation,
      };
      return;
    }
    provisioningPlan = null;
    acceptProvisioningPlanAcknowledged = false;

    createDependencyResourceMutation.mutate(
      provisioningMode === "create"
        ? {
            mode: "create",
            create: {
              kind: createKind,
              projectId: createProjectId,
              environmentId: createEnvironmentId,
              serverId: selectedServerId,
              name: createName.trim(),
            },
          }
        : {
            mode: "reuse",
            reuse: {
              kind: createKind,
              projectId: createProjectId,
              environmentId: createEnvironmentId,
              name: createName.trim(),
              connectionUrl: reuseConnectionUrl.trim(),
              ...(reuseSecretRef.trim() ? { secretRef: reuseSecretRef.trim() } : {}),
            },
          },
    );
  }

  function acceptProvisioningPlan(): void {
    if (
      !provisioningPlan ||
      !canAcceptProvisioningPlan ||
      acceptProvisioningPlanMutation.isPending
    ) {
      return;
    }
    acceptProvisioningPlanMutation.mutate(provisioningPlan.id);
  }

  function resetProvisioningPlan(): void {
    provisioningPlan = null;
    acceptProvisioningPlanAcknowledged = false;
  }

  function selectProvisioningMode(mode: ProvisioningMode): void {
    provisioningMode = mode;
    resetProvisioningPlan();
  }

  function selectDependencyKind(kind: DependencyKind): void {
    createKind = kind;
    resetProvisioningPlan();
  }

  function provisioningActionLabel(): string {
    return provisioningMode === "create"
      ? $t(i18nKeys.console.dependencyResources.createAction)
      : $t(i18nKeys.console.dependencyResources.reuseAction);
  }

  function planSummary(plan: DependencyResourceProvisioningPlan): string {
    return `${kindLabel(plan.kind)} · ${plan.name} · ${plan.status}`;
  }

  function plannedEndpoint(plan: DependencyResourceProvisioningPlan): string {
    return plan.endpoint ?? plan.providerKey ?? "-";
  }

</script>

<svelte:head>
  <title>{$t(i18nKeys.console.dependencyResources.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.dependencyResources.pageTitle)}
  description={$t(i18nKeys.console.dependencyResources.pageDescription)}
>
  {#if dependencyResourcesLoading}
    <div class="space-y-5">
      <Skeleton class="h-8 w-72" />
      <Skeleton class="h-44 w-full" />
      <Skeleton class="h-80 w-full" />
    </div>
  {:else if dependencyResourcesError}
    <ConsoleStatePanel
      tone="error"
      title={$t(i18nKeys.errors.web.backendUnavailable)}
      description={$t(i18nKeys.console.dependencyResources.pageDescription)}
      detail={dependencyResourcesError}
      actionLabel={$t(i18nKeys.console.runtimeUsage.refreshNow)}
      actionOnclick={() => dependencyResourcesQuery.refetch()}
    />
  {:else}
    <ConsoleResourceCanvas data-dependency-resources-display-surface>
      <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div class="max-w-3xl space-y-2">
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.dependencyResources.focusTitle)}</h1>
            <DocsHelpLink
              href={webDocsHrefs.dependencyResourceLifecycle}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.dependencyResources.focusDescription)}
          </p>
        </div>
      </section>

      {#if dependencyResources.length > 0}
        <div
          class="flex flex-wrap items-center justify-between gap-3"
          data-dependency-resource-filter-toolbar
        >
          <div class="flex flex-wrap gap-2">
            <Select.Root
              value={filterProjectSelectValue}
              onValueChange={selectDependencyResourceProjectFilter}
              type="single"
            >
              <Select.Trigger class="min-w-48">
                {filterProjectId ? projectName(filterProjectId) : $t(i18nKeys.console.dependencyResources.filterAll)}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={allDependencyResourceFilterValue}>
                  {$t(i18nKeys.console.dependencyResources.filterAll)}
                </Select.Item>
                {#each projects as project (project.id)}
                  <Select.Item value={project.id}>{project.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <Select.Root
              value={filterEnvironmentSelectValue}
              onValueChange={selectDependencyResourceEnvironmentFilter}
              type="single"
            >
              <Select.Trigger class="min-w-48">
                {filterEnvironmentId ? environmentName(filterEnvironmentId) : $t(i18nKeys.console.dependencyResources.filterAll)}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={allDependencyResourceFilterValue}>
                  {$t(i18nKeys.console.dependencyResources.filterAll)}
                </Select.Item>
                {#each filterProjectEnvironments as environment (environment.id)}
                  <Select.Item value={environment.id}>{environment.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <Button type="button" onclick={openDependencyResourceCreateDialog}>
            <Plus class="size-4" />
            {provisioningActionLabel()}
          </Button>
          {#if dependencyResourceEnrichmentLoading}
            <p class="w-full text-xs text-muted-foreground">
              {$t(i18nKeys.common.status.loading)}
            </p>
          {/if}
        </div>
      {/if}

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

      {#if dependencyResources.length === 0}
        <ConsoleEmptyState
          tone="dependency"
          title={$t(i18nKeys.console.dependencyResources.emptyTitle)}
          description={$t(i18nKeys.console.dependencyResources.emptyBody)}
          actionLabel={provisioningActionLabel()}
          learnMoreHref={webDocsHrefs.dependencyResourceLifecycle}
          onAction={openDependencyResourceCreateDialog}
        />
      {/if}

      {#if dependencyResources.length > 0}
        <section class="space-y-4">
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.dependencyResources.focusTitle)}</h2>
          </div>

          {#if filteredDependencyResources.length === 0}
            <section class="console-panel space-y-2 p-5">
              <h3 class="font-semibold">{$t(i18nKeys.console.dependencyResources.emptyTitle)}</h3>
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.dependencyResources.emptyBody)}
              </p>
            </section>
          {:else}
            <div class="console-record-list" data-dependency-resource-list-display-surface>
              {#each filteredDependencyResources as resource (resource.id)}
                <article class="console-record-row lg:grid-cols-[minmax(0,1fr)_auto]">
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
                    <div class="grid gap-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                      <div class="rounded-md bg-muted/20 px-3 py-2">
                        <p class="uppercase tracking-wide">
                          {$t(i18nKeys.common.domain.project)}
                        </p>
                        <p class="mt-1 truncate font-medium text-foreground">
                          {projectName(resource.projectId)}
                        </p>
                      </div>
                      <div class="rounded-md bg-muted/20 px-3 py-2">
                        <p class="uppercase tracking-wide">
                          {$t(i18nKeys.common.domain.environment)}
                        </p>
                        <p class="mt-1 truncate font-medium text-foreground">
                          {environmentName(resource.environmentId)}
                        </p>
                      </div>
                      <div class="rounded-md bg-muted/20 px-3 py-2">
                        <p class="uppercase tracking-wide">
                          {$t(i18nKeys.console.dependencyResources.sourceMode)}
                        </p>
                        <p class="mt-1 truncate font-medium text-foreground">
                          {resource.sourceMode}
                        </p>
                      </div>
                      <div class="rounded-md bg-muted/20 px-3 py-2">
                        <p class="uppercase tracking-wide">
                          {$t(i18nKeys.console.dependencyResources.backupRetention)}
                        </p>
                        <p class="mt-1 truncate font-medium text-foreground">
                          {resource.backupRelationship?.retentionRequired
                            ? $t(i18nKeys.common.status.active)
                            : $t(i18nKeys.common.status.notConfigured)}
                        </p>
                      </div>
                    </div>
                    {#if resource.connection}
                      <p class="truncate font-mono text-xs text-muted-foreground">
                        {resource.connection.maskedConnection}
                      </p>
                    {/if}
                  </div>
                  <div class="flex flex-wrap gap-2 lg:justify-end">
                    <Button size="sm" variant="outline" href={dependencyResourceDetailHref(resource.id)}>
                      {$t(i18nKeys.common.actions.viewDetails)}
                    </Button>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    </ConsoleResourceCanvas>
  {/if}

  <Dialog.Root
    bind:open={dependencyResourceCreateDialogOpen}
    onOpenChange={setDependencyResourceCreateDialogOpen}
  >
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-5xl">
      <Dialog.Header>
        <Dialog.Title>{provisioningActionLabel()}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.dependencyResources.createDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <section class="space-y-5 px-5 pb-5">
        <form
          id="dependency-resource-create-form"
          class="space-y-4"
          onsubmit={submitCreate}
        >
          <fieldset class="space-y-2">
            <legend class="console-field-label">{$t(i18nKeys.console.dependencyResources.provisioningMode)}</legend>
            <div class="grid gap-3 sm:grid-cols-2">
              {#each provisioningModes as mode (mode)}
                <button
                  type="button"
                  class={[
                    "rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    provisioningMode === mode
                      ? "border-primary bg-primary/5 text-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:border-primary/25 hover:bg-primary/5",
                  ]}
                  aria-pressed={provisioningMode === mode}
                  onclick={() => selectProvisioningMode(mode)}
                >
                  <span class="block text-sm font-semibold">
                    {mode === "create"
                      ? $t(i18nKeys.console.dependencyResources.modeCreate)
                      : $t(i18nKeys.console.dependencyResources.modeReuse)}
                  </span>
                  <span class="mt-1 block text-xs text-muted-foreground">
                    {mode === "create"
                      ? $t(i18nKeys.console.dependencyResources.modeCreateDescription)
                      : $t(i18nKeys.console.dependencyResources.modeReuseDescription)}
                  </span>
                </button>
              {/each}
            </div>
          </fieldset>

          <label class="block space-y-1.5 text-sm font-medium">
            <span class="console-field-label">{$t(i18nKeys.common.domain.name)}</span>
            <Input
              id="dependency-resource-name-input"
              bind:value={createName}
              placeholder={$t(i18nKeys.console.dependencyResources.namePlaceholder)}
            />
          </label>

          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label class="space-y-1.5 text-sm font-medium">
              <span class="console-field-label">{$t(i18nKeys.common.domain.project)}</span>
              {#if projects.length === 0}
                <Button
                  class="h-8 w-full justify-between px-2.5 text-muted-foreground"
                  variant="outline"
                  aria-label={$t(i18nKeys.console.dependencyResources.selectProject)}
                  onclick={openProjectCreateDialog}
                >
                  <span class="truncate">{$t(i18nKeys.console.dependencyResources.selectProject)}</span>
                  <Plus class="size-3.5" />
                </Button>
              {:else}
                <Select.Root bind:value={createProjectId} type="single">
                  <Select.Trigger class="w-full">
                    {createProjectId
                      ? projectName(createProjectId)
                      : $t(i18nKeys.console.dependencyResources.selectProject)}
                  </Select.Trigger>
                  <Select.Content class={dependencyResourceSelectContentClass}>
                    {#each projects as project (project.id)}
                      <Select.Item value={project.id}>{project.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              {/if}
            </label>

            <label class="space-y-1.5 text-sm font-medium">
              <span class="console-field-label">{$t(i18nKeys.common.domain.environment)}</span>
              {#if createProjectEnvironments.length === 0}
                <Button
                  class="h-8 w-full justify-between px-2.5 text-muted-foreground"
                  variant="outline"
                  aria-label={$t(i18nKeys.console.dependencyResources.selectEnvironment)}
                  onclick={openEnvironmentCreateDialog}
                >
                  <span class="truncate">{$t(i18nKeys.console.dependencyResources.selectEnvironment)}</span>
                  <Plus class="size-3.5" />
                </Button>
              {:else}
                <Select.Root bind:value={createEnvironmentId} type="single">
                  <Select.Trigger class="w-full">
                    {createEnvironmentId
                      ? environmentName(createEnvironmentId)
                      : $t(i18nKeys.console.dependencyResources.selectEnvironment)}
                  </Select.Trigger>
                  <Select.Content class={dependencyResourceSelectContentClass}>
                    {#each createProjectEnvironments as environment (environment.id)}
                      <Select.Item value={environment.id}>{environment.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              {/if}
            </label>

            {#if provisioningMode === "create"}
              <label class="space-y-1.5 text-sm font-medium">
                <span class="console-field-label">{$t(i18nKeys.common.domain.server)}</span>
                {#if activeSingleServerTargets.length === 0}
                  <Button
                    class="h-8 w-full justify-between px-2.5 text-muted-foreground"
                    variant="outline"
                    aria-label={$t(i18nKeys.console.dependencyResources.selectServer)}
                    onclick={openServerCreateDialog}
                  >
                    <span class="truncate">{$t(i18nKeys.console.dependencyResources.selectServer)}</span>
                    <Plus class="size-3.5" />
                  </Button>
                {:else}
                  <Select.Root bind:value={selectedServerId} type="single">
                    <Select.Trigger class="w-full">
                      {selectedServerId
                        ? serverName(selectedServerId)
                        : $t(i18nKeys.console.dependencyResources.selectServer)}
                    </Select.Trigger>
                    <Select.Content class={dependencyResourceSelectContentClass}>
                      {#each activeSingleServerTargets as server (server.id)}
                        <Select.Item value={server.id}>{server.name}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                {/if}
              </label>
            {/if}
          </div>

          {#if provisioningMode === "reuse"}
            <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)]">
              <label class="space-y-1.5 text-sm font-medium">
                <span class="console-field-label">{$t(i18nKeys.console.dependencyResources.connectionUrl)}</span>
                <Input
                  id="dependency-resource-reuse-connection-url-input"
                  bind:value={reuseConnectionUrl}
                  aria-invalid={Boolean(reuseConnectionUrlValidation)}
                  placeholder={connectionUrlPlaceholder(createKind)}
                />
                {#if reuseConnectionUrlValidation}
                  <p class="text-xs font-medium text-destructive">{reuseConnectionUrlValidation}</p>
                {/if}
              </label>
              <label class="space-y-1.5 text-sm font-medium">
                <span class="console-field-label">{$t(i18nKeys.console.dependencyResources.secretRef)}</span>
                <Input
                  id="dependency-resource-reuse-secret-ref-input"
                  bind:value={reuseSecretRef}
                  placeholder="secret://dependency/external"
                />
              </label>
            </div>
          {/if}

          <fieldset class="space-y-2">
            <legend class="console-field-label">{$t(i18nKeys.common.domain.kind)}</legend>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              {#each dependencyKindOrder as dependencyKind (dependencyKind)}
                {@const icon = kindIcon(dependencyKind)}
                <button
                  type="button"
                  class={[
                    "flex min-h-20 items-start gap-3 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    createKind === dependencyKind
                      ? "border-primary bg-primary/5 text-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:border-primary/25 hover:bg-primary/5",
                  ]}
                  aria-pressed={createKind === dependencyKind}
                  onclick={() => selectDependencyKind(dependencyKind)}
                >
                  <span
                    class="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background"
                  >
                    <span class="dependency-kind-logo" role="img" aria-label={icon.title}>
                      {@html icon.svg}
                    </span>
                  </span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">{kindLabel(dependencyKind)}</span>
                    <span class="mt-1 block text-xs leading-5 text-muted-foreground">
                      {$t(dependencyKindOptions[dependencyKind].descriptionKey)}
                    </span>
                  </span>
                </button>
              {/each}
            </div>
          </fieldset>

          <div class="flex sm:justify-end">
            <Button
              type="submit"
              class="w-full sm:w-auto"
              disabled={!canCreate || createDependencyResourceMutation.isPending}
            >
              {#if createDependencyResourceMutation.isPending}
                {$t(i18nKeys.console.dependencyResources.creatingPlan)}
              {:else}
                <Plus class="size-4" />
                {$t(i18nKeys.console.dependencyResources.createPlanAction)}
              {/if}
            </Button>
          </div>
        </form>

        {#if provisioningPlan}
          <section class="console-section space-y-3">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div class="space-y-1">
                <h3 class="font-semibold">{$t(i18nKeys.console.dependencyResources.planReady)}</h3>
                <p class="text-sm text-muted-foreground">{planSummary(provisioningPlan)}</p>
              </div>
              <Badge variant={statusVariant(provisioningPlan.status)}>{provisioningPlan.status}</Badge>
            </div>
            <div class="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <p class="break-all">ID: {provisioningPlan.id}</p>
              <p class="break-all">
                {$t(i18nKeys.console.dependencyResources.endpoint)}: {plannedEndpoint(provisioningPlan)}
              </p>
            </div>
            <ul class="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
              {#each provisioningPlan.summary as item}
                <li class="rounded-md border bg-background p-3">{item}</li>
              {/each}
            </ul>
            <label class="flex gap-2 text-sm text-muted-foreground">
              <input
                id="dependency-resource-provisioning-accept-input"
                class="mt-0.5 size-4 accent-primary"
                type="checkbox"
                bind:checked={acceptProvisioningPlanAcknowledged}
              />
              <span>{$t(i18nKeys.console.dependencyResources.acceptPlanAcknowledge)}</span>
            </label>
            <div class="flex justify-end">
              <Button
                type="button"
                disabled={!canAcceptProvisioningPlan || acceptProvisioningPlanMutation.isPending}
                onclick={acceptProvisioningPlan}
              >
                <BadgeCheck class="size-4" />
                {$t(i18nKeys.console.dependencyResources.acceptPlanAction)}
              </Button>
            </div>
          </section>
        {/if}
      </section>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={projectCreateDialogOpen}>
    <Dialog.Content
      closeLabel={$t(i18nKeys.common.actions.close)}
      class={dependencyResourceNestedDialogClass}
    >
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.projects.createProjectTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.projects.createProjectDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <div class="px-5 pb-5">
        <ProjectCreateForm
          panel={false}
          showIntro={false}
          idPrefix="dependency-resource-project-create"
          onCreated={handleProjectCreated}
        />
      </div>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={environmentCreateDialogOpen}>
    <Dialog.Content
      closeLabel={$t(i18nKeys.common.actions.close)}
      class={dependencyResourceNestedDialogClass}
    >
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.projects.environmentCreateTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.projects.environmentCreateDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <div class="px-5 pb-5">
        <EnvironmentCreateForm
          panel={false}
          showIntro={false}
          idPrefix="dependency-resource-environment-create"
          projectId={createProjectId}
          onCreated={handleEnvironmentCreated}
        />
      </div>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={serverCreateDialogOpen}>
    <Dialog.Content
      closeLabel={$t(i18nKeys.common.actions.close)}
      class={`max-w-5xl ${dependencyResourceNestedDialogClass}`}
    >
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.servers.createFormTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.servers.createFormDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <div class="px-5 pb-5">
        <ServerCreateForm
          idPrefix="dependency-resource-server-create"
          onCreated={handleServerCreated}
        />
      </div>
    </Dialog.Content>
  </Dialog.Root>

</ConsoleShell>

<style>
  .dependency-kind-logo {
    display: flex;
    width: 1.5rem;
    height: 1.5rem;
    align-items: center;
    justify-content: center;
  }

  .dependency-kind-logo :global(svg) {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
  }
</style>

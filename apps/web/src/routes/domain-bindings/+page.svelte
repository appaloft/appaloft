<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { createMutation } from "@tanstack/svelte-query";
  import {
    Check,
    Globe2,
    RefreshCw,
    Route,
    Save,
    Search,
    ShieldCheck,
    Trash2,
  } from "@lucide/svelte";
  import type {
    ConfirmDomainBindingOwnershipInput,
    ConfigureDomainBindingRouteInput,
    DeleteDomainBindingInput,
    DomainBindingSummary,
    RetryDomainBindingVerificationInput,
    ShowDomainBindingResponse,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    findEnvironment,
    findProject,
    findResource,
    findServer,
    formatTime,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type DomainRouteMode = "serve" | "redirect";
  type RedirectStatusText = "301" | "302" | "307" | "308";

  const {
    projectsQuery,
    environmentsQuery,
    resourcesQuery,
    serversQuery,
    domainBindingsQuery,
  } = createConsoleQueries(browser, {
    health: false,
    readiness: false,
    version: false,
    deployments: false,
    previewEnvironments: false,
    certificates: false,
    providers: false,
  });

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const domainBindings = $derived(domainBindingsQuery.data?.items ?? []);
  const allProjectsFilterValue = "__all_projects__";
  const domainBindingsLoading = $derived(domainBindingsQuery.isPending);
  const domainBindingEnrichmentLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      serversQuery.isPending,
  );

  let projectFilter = $state("");
  let lifecycleFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let bindingDetails = $state<Record<string, ShowDomainBindingResponse>>({});
  let routeRedirectDraft = $state("");
  let routeRedirectStatusDraft = $state<RedirectStatusText>("308");
  let deleteConfirmationDraft = $state("");
  let domainBindingVerificationDialogOpen = $state(false);
  let domainBindingRouteDialogOpen = $state(false);
  let domainBindingDeleteDialogOpen = $state(false);
  let selectedDomainBindingId = $state("");
  let selectedVerificationBindingId = $state("");
  let selectedRouteBindingId = $state("");
  let selectedDeleteBindingId = $state("");

  const selectedProjectFilter = $derived(
    projectFilter ? findProject(projects, projectFilter) : null,
  );
  const projectFilterSelectValue = $derived(projectFilter || allProjectsFilterValue);
  const visibleDomainBindings = $derived.by(() =>
    projectFilter
      ? domainBindings.filter((binding) => binding.projectId === projectFilter)
      : domainBindings,
  );
  const selectedDomainBinding = $derived.by(
    () =>
      visibleDomainBindings.find((binding) => binding.id === selectedDomainBindingId) ??
      visibleDomainBindings[0] ??
      null,
  );
  const selectedDomainBindingDetail = $derived(
    selectedDomainBinding ? (bindingDetails[selectedDomainBinding.id] ?? null) : null,
  );
  const selectedRouteBinding = $derived(
    domainBindings.find((binding) => binding.id === selectedRouteBindingId) ?? null,
  );
  const selectedVerificationBinding = $derived(
    domainBindings.find((binding) => binding.id === selectedVerificationBindingId) ?? null,
  );
  const selectedDeleteBinding = $derived(
    domainBindings.find((binding) => binding.id === selectedDeleteBindingId) ?? null,
  );
  const selectedRouteRedirectTargets = $derived(
    selectedRouteBinding ? domainBindingRedirectTargets(selectedRouteBinding) : [],
  );

  const confirmDomainBindingOwnershipMutation = createMutation(() => ({
    mutationFn: (input: ConfirmDomainBindingOwnershipInput) =>
      orpcClient.domainBindings.confirmOwnership(input),
    onSuccess: () => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.domainBindings.confirmOwnershipSuccessTitle),
        detail: $t(i18nKeys.common.status.bound),
      };
      domainBindingVerificationDialogOpen = false;
      selectedVerificationBindingId = "";
      void queryClient.invalidateQueries({ queryKey: orpc.domainBindings.key({ type: "query" }) });
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.confirmOwnershipErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const showDomainBindingMutation = createMutation(() => ({
    mutationFn: (input: { domainBindingId: string }) => orpcClient.domainBindings.show(input),
    onSuccess: (detail, variables) => {
      bindingDetails = {
        ...bindingDetails,
        [variables.domainBindingId]: detail,
      };
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.domainBindings.showSuccessTitle),
        detail: detail.routeReadiness.status,
      };
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.showErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const configureDomainBindingRouteMutation = createMutation(() => ({
    mutationFn: (input: ConfigureDomainBindingRouteInput) =>
      orpcClient.domainBindings.configureRoute(input),
    onSuccess: (_result, variables) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.domainBindings.configureRouteSuccessTitle),
        detail: variables.domainBindingId,
      };
      domainBindingRouteDialogOpen = false;
      selectedRouteBindingId = "";
      void queryClient.invalidateQueries({ queryKey: orpc.domainBindings.key({ type: "query" }) });
      showDomainBindingMutation.mutate({ domainBindingId: variables.domainBindingId });
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.configureRouteErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const checkDomainBindingDeleteSafetyMutation = createMutation(() => ({
    mutationFn: (input: { domainBindingId: string }) => orpcClient.domainBindings.deleteCheck(input),
    onSuccess: (deleteSafety, variables) => {
      const existingDetail = bindingDetails[variables.domainBindingId];
      if (existingDetail) {
        bindingDetails = {
          ...bindingDetails,
          [variables.domainBindingId]: {
            ...existingDetail,
            deleteSafety,
          },
        };
      }
      lifecycleFeedback = {
        kind: deleteSafety.safeToDelete ? "success" : "error",
        title: deleteSafety.safeToDelete
          ? $t(i18nKeys.console.domainBindings.deleteCheckSafeTitle)
          : $t(i18nKeys.console.domainBindings.deleteCheckBlockedTitle),
        detail: deleteSafety.safeToDelete
          ? $t(i18nKeys.console.domainBindings.deleteSafetyPreserves)
          : deleteSafety.blockers.map((blocker) => blocker.message).join(" "),
      };
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.deleteCheckErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const deleteDomainBindingMutation = createMutation(() => ({
    mutationFn: (input: DeleteDomainBindingInput) => orpcClient.domainBindings.delete(input),
    onSuccess: (_result, variables) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.domainBindings.deleteSuccessTitle),
        detail: variables.domainBindingId,
      };
      domainBindingDeleteDialogOpen = false;
      selectedDeleteBindingId = "";
      deleteConfirmationDraft = "";
      void queryClient.invalidateQueries({ queryKey: orpc.domainBindings.key({ type: "query" }) });
      showDomainBindingMutation.mutate({ domainBindingId: variables.domainBindingId });
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.deleteErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const retryDomainBindingVerificationMutation = createMutation(() => ({
    mutationFn: (input: RetryDomainBindingVerificationInput) =>
      orpcClient.domainBindings.retryVerification(input),
    onSuccess: (result, variables) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.domainBindings.retryVerificationSuccessTitle),
        detail: result.verificationAttemptId,
      };
      domainBindingVerificationDialogOpen = false;
      selectedVerificationBindingId = "";
      void queryClient.invalidateQueries({ queryKey: orpc.domainBindings.key({ type: "query" }) });
      showDomainBindingMutation.mutate({ domainBindingId: variables.domainBindingId });
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.retryVerificationErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));

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

  function domainBindingLifecycleStatusLabel(detail: ShowDomainBindingResponse): string {
    return detail.deleteSafety.safeToDelete
      ? $t(i18nKeys.console.domainBindings.lifecycleReady)
      : $t(i18nKeys.console.domainBindings.lifecycleBlocked);
  }

  function confirmDomainBindingOwnership(binding: DomainBindingSummary): void {
    if (binding.status !== "pending_verification" || confirmDomainBindingOwnershipMutation.isPending) {
      return;
    }

    lifecycleFeedback = null;
    confirmDomainBindingOwnershipMutation.mutate({
      domainBindingId: binding.id,
    });
  }

  function selectProjectFilter(value: string): void {
    projectFilter = value === allProjectsFilterValue ? "" : value;
    selectedDomainBindingId = "";
  }

  function selectDomainBinding(binding: DomainBindingSummary): void {
    selectedDomainBindingId = binding.id;
  }

  function showSelectedDomainBindingDetail(binding: DomainBindingSummary): void {
    selectedDomainBindingId = binding.id;
    showDomainBindingMutation.mutate({ domainBindingId: binding.id });
  }

  function setRouteRedirectDraft(value: string): void {
    routeRedirectDraft = value;
  }

  function setRouteRedirectStatusDraft(value: string): void {
    routeRedirectStatusDraft = value as RedirectStatusText;
  }

  function setDeleteConfirmationDraft(value: string): void {
    deleteConfirmationDraft = value;
  }

  function domainBindingRedirectTargets(binding: DomainBindingSummary): DomainBindingSummary[] {
    return domainBindings.filter(
      (candidate) =>
        candidate.id !== binding.id &&
        !candidate.redirectTo &&
        candidate.projectId === binding.projectId &&
        candidate.environmentId === binding.environmentId &&
        candidate.resourceId === binding.resourceId &&
        candidate.pathPrefix === binding.pathPrefix &&
        candidate.status !== "deleted",
    );
  }

  function configureDomainBindingRoute(binding: DomainBindingSummary, mode: DomainRouteMode): void {
    const redirectDraft = routeRedirectDraft || binding.redirectTo || "";
    lifecycleFeedback = null;
    configureDomainBindingRouteMutation.mutate({
      domainBindingId: binding.id,
      ...(mode === "redirect"
        ? {
            redirectTo: redirectDraft.trim(),
            redirectStatus: parseRedirectStatus(routeRedirectStatusDraft),
          }
        : {}),
    });
  }

  function deleteDomainBinding(binding: DomainBindingSummary): void {
    lifecycleFeedback = null;
    deleteDomainBindingMutation.mutate({
      domainBindingId: binding.id,
      confirmation: {
        domainBindingId: deleteConfirmationDraft,
      },
    });
  }

  function openDomainBindingVerificationDialog(binding: DomainBindingSummary): void {
    selectedDomainBindingId = binding.id;
    selectedVerificationBindingId = binding.id;
    domainBindingVerificationDialogOpen = true;
  }

  function setDomainBindingVerificationDialogOpen(open: boolean): void {
    domainBindingVerificationDialogOpen = open;
    if (!open) {
      selectedVerificationBindingId = "";
    }
  }

  function openDomainBindingRouteDialog(binding: DomainBindingSummary): void {
    selectedDomainBindingId = binding.id;
    selectedRouteBindingId = binding.id;
    routeRedirectDraft = binding.redirectTo ?? "";
    routeRedirectStatusDraft = `${binding.redirectStatus ?? 308}` as RedirectStatusText;
    domainBindingRouteDialogOpen = true;
  }

  function setDomainBindingRouteDialogOpen(open: boolean): void {
    domainBindingRouteDialogOpen = open;
    if (!open) {
      selectedRouteBindingId = "";
    }
  }

  function openDomainBindingDeleteDialog(binding: DomainBindingSummary): void {
    selectedDomainBindingId = binding.id;
    selectedDeleteBindingId = binding.id;
    deleteConfirmationDraft = "";
    domainBindingDeleteDialogOpen = true;
  }

  function setDomainBindingDeleteDialogOpen(open: boolean): void {
    domainBindingDeleteDialogOpen = open;
    if (!open) {
      selectedDeleteBindingId = "";
    }
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.domainBindings.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.domainBindings.pageTitle)}
  description={$t(i18nKeys.console.domainBindings.pageDescription)}
>
  {#if domainBindingsLoading}
    <div class="space-y-5">
      <Skeleton class="h-52 w-full" />
      <Skeleton class="h-80 w-full" />
    </div>
  {:else}
    <ConsoleResourceCanvas data-domain-bindings-display-surface>
      <section class="space-y-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <h1 class="text-2xl font-semibold md:text-3xl">
                  {$t(i18nKeys.console.domainBindings.pageTitle)}
                </h1>
                <DocsHelpLink
                  href={webDocsHrefs.domainCustomDomainBinding}
                  ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                />
              </div>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.domainBindings.pageDescription)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {#if domainBindings.length > 0}
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Select.Root
            type="single"
            value={projectFilterSelectValue}
            onValueChange={selectProjectFilter}
          >
            <Select.Trigger class="min-w-44">
              {selectedProjectFilter?.name ??
                $t(i18nKeys.console.domainBindings.filterAllProjects)}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={allProjectsFilterValue}>
                {$t(i18nKeys.console.domainBindings.filterAllProjects)}
              </Select.Item>
              {#each projects as project (project.id)}
                <Select.Item value={project.id}>{project.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.domainBindings.createOwnerHint)}
          </p>
          {#if domainBindingEnrichmentLoading}
            <p class="w-full text-xs text-muted-foreground">
              {$t(i18nKeys.common.status.loading)}
            </p>
          {/if}
        </div>
      {/if}

      {#if domainBindings.length === 0}
        <ConsoleEmptyState
          tone="domain"
          title={$t(i18nKeys.console.domainBindings.emptyTitle)}
          description={$t(i18nKeys.console.domainBindings.emptyGlobalBody)}
          secondaryActionLabel={$t(i18nKeys.console.domainBindings.openResourceNetworking)}
          onSecondaryAction={() => {
            void goto("/resources");
          }}
          learnMoreHref={webDocsHrefs.domainCustomDomainBinding}
        />
      {/if}

      {#if domainBindings.length > 0}
        <section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div class="console-panel space-y-4 p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.domainBindings.listTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.listDescription)}
                </p>
                {#if domainBindingEnrichmentLoading}
                  <p class="mt-1 text-xs text-muted-foreground">
                    {$t(i18nKeys.common.status.loading)}
                  </p>
                {/if}
              </div>
            </div>

            {#if lifecycleFeedback}
              <div
                class={[
                  "rounded-md border px-3 py-2 text-sm",
                  lifecycleFeedback.kind === "success"
                    ? "border-primary/25 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5 text-destructive",
                ]}
              >
                <p class="font-medium">{lifecycleFeedback.title}</p>
                <p class="mt-1 break-all text-xs">{lifecycleFeedback.detail}</p>
              </div>
            {/if}

            {#if visibleDomainBindings.length > 0}
              <div class="console-record-list" data-domain-binding-list-display-surface>
                {#each visibleDomainBindings as binding (binding.id)}
                  {@const project = findProject(projects, binding.projectId)}
                  {@const environment = findEnvironment(environments, binding.environmentId)}
                  {@const resource = findResource(resources, binding.resourceId)}
                  <article
                    class={[
                      "console-record-row lg:grid-cols-[minmax(0,1fr)_auto]",
                      selectedDomainBinding?.id === binding.id ? "bg-muted/50" : "",
                    ]}
                    data-domain-binding-row
                  >
                    <div class="min-w-0 space-y-3">
                      <div class="flex min-w-0 flex-wrap items-center gap-2">
                        <Globe2 class="size-4 shrink-0 text-muted-foreground" />
                        <h3 class="truncate font-medium">{binding.domainName}</h3>
                        <Badge variant={domainBindingStatusVariant(binding.status)}>
                          {domainBindingStatusLabel(binding.status)}
                        </Badge>
                      </div>
                      <div class="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                        <div class="rounded-md bg-muted/20 px-3 py-2">
                          <p class="uppercase tracking-wide">
                            {$t(i18nKeys.common.domain.project)}
                          </p>
                          <p class="mt-1 truncate font-medium text-foreground">
                            {project?.name ?? binding.projectId}
                          </p>
                        </div>
                        <div class="rounded-md bg-muted/20 px-3 py-2">
                          <p class="uppercase tracking-wide">
                            {$t(i18nKeys.common.domain.environment)}
                          </p>
                          <p class="mt-1 truncate font-medium text-foreground">
                            {environment?.name ?? binding.environmentId}
                          </p>
                        </div>
                        <div class="rounded-md bg-muted/20 px-3 py-2">
                          <p class="uppercase tracking-wide">
                            {$t(i18nKeys.common.domain.resource)}
                          </p>
                          <p class="mt-1 truncate font-medium text-foreground">
                            {resource?.name ?? binding.resourceId}
                          </p>
                        </div>
                      </div>
                      <p class="truncate text-xs text-muted-foreground">
                        {binding.pathPrefix} · {binding.proxyKind} · {$t(i18nKeys.common.domain.tls)}
                        {binding.tlsMode} · {formatTime(binding.createdAt)}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2 lg:justify-end">
                      <Button size="sm" variant="outline" onclick={() => selectDomainBinding(binding)}>
                        {$t(i18nKeys.common.actions.viewDetails)}
                      </Button>
                    </div>
                  </article>
                {/each}
              </div>
            {:else}
              <div class="console-subtle-panel px-4 py-6">
                <div class="flex items-start gap-3">
                  <Globe2 class="mt-0.5 size-4 text-muted-foreground" />
                  <div class="space-y-1">
                    <p class="text-sm font-medium">
                      {$t(i18nKeys.console.domainBindings.emptyTitle)}
                    </p>
                    <p class="text-sm text-muted-foreground">
                      {$t(i18nKeys.console.domainBindings.emptyBody)}
                    </p>
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <aside class="console-side-panel space-y-5" data-domain-binding-detail-display-surface>
            {#if selectedDomainBinding}
              {@const project = findProject(projects, selectedDomainBinding.projectId)}
              {@const environment = findEnvironment(environments, selectedDomainBinding.environmentId)}
              {@const resource = findResource(resources, selectedDomainBinding.resourceId)}
              {@const server = selectedDomainBinding.serverId
                ? findServer(servers, selectedDomainBinding.serverId)
                : null}
              <div class="space-y-3" data-domain-binding-identity-summary>
                <Badge variant="outline">
                  <Globe2 class="size-3.5" />
                  {$t(i18nKeys.console.domainBindings.selectedBinding)}
                </Badge>
                <h2 class="truncate text-lg font-semibold">{selectedDomainBinding.domainName}</h2>
                <dl class="grid gap-2 text-sm">
                  <div class="rounded-md border bg-background px-3 py-2">
                    <dt class="text-xs text-muted-foreground">ID</dt>
                    <dd class="mt-1 break-all font-mono text-xs">{selectedDomainBinding.id}</dd>
                  </div>
                  <div class="rounded-md border bg-background px-3 py-2">
                    <dt class="text-xs text-muted-foreground">
                      {$t(i18nKeys.common.domain.status)}
                    </dt>
                    <dd class="mt-1 font-medium">
                      {domainBindingStatusLabel(selectedDomainBinding.status)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div class="console-section space-y-3" data-domain-binding-owner-summary>
                <div class="space-y-1">
                  <h3 class="font-semibold">{$t(i18nKeys.common.domain.resource)}</h3>
                  <p class="text-sm text-muted-foreground">
                    {$t(i18nKeys.console.domainBindings.createOwnerHint)}
                  </p>
                </div>
                <dl class="grid gap-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.project)}</dt>
                    <dd class="min-w-0 truncate font-medium">
                      {project?.name ?? selectedDomainBinding.projectId}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</dt>
                    <dd class="min-w-0 truncate font-medium">
                      {environment?.name ?? selectedDomainBinding.environmentId}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</dt>
                    <dd class="min-w-0 truncate font-medium">
                      {resource?.name ?? selectedDomainBinding.resourceId}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.server)}</dt>
                    <dd class="min-w-0 truncate font-medium">
                      {server?.name ?? selectedDomainBinding.serverId ?? "-"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div class="console-section space-y-3" data-domain-binding-route-summary>
                <div class="space-y-1">
                  <h3 class="flex items-center gap-2 font-semibold">
                    <Route class="size-4" />
                    {$t(i18nKeys.common.domain.routeBehavior)}
                  </h3>
                  <p class="text-sm text-muted-foreground">
                    {$t(i18nKeys.console.domainBindings.routeManagedInDialog)}
                  </p>
                </div>
                <dl class="grid gap-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.console.domainBindings.routeReadiness)}</dt>
                    <dd class="min-w-0 truncate font-medium">
                      {selectedDomainBindingDetail
                        ? `${selectedDomainBindingDetail.routeReadiness.status} · ${selectedDomainBindingDetail.routeReadiness.routeBehavior}`
                        : $t(i18nKeys.common.status.unknown)}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.console.domainBindings.proxyReadiness)}</dt>
                    <dd class="min-w-0 truncate font-medium">
                      {selectedDomainBindingDetail?.proxyReadiness ??
                        $t(i18nKeys.common.status.unknown)}
                    </dd>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.common.domain.redirectTo)}</dt>
                    <dd class="min-w-0 truncate font-medium">
                      {selectedDomainBinding.redirectTo ?? $t(i18nKeys.console.domainBindings.routeModeServe)}
                    </dd>
                  </div>
                </dl>
                <div class="grid gap-2 sm:grid-cols-2">
                  <Button
                    class="w-full"
                    type="button"
                    variant="outline"
                    disabled={showDomainBindingMutation.isPending}
                    onclick={() => showSelectedDomainBindingDetail(selectedDomainBinding)}
                  >
                    <Search class="size-4" />
                    {$t(i18nKeys.console.domainBindings.showDetails)}
                  </Button>
                  <Button
                    class="w-full"
                    type="button"
                    variant="outline"
                    disabled={selectedDomainBinding.status === "deleted"}
                    onclick={() => openDomainBindingRouteDialog(selectedDomainBinding)}
                  >
                    <Route class="size-4" />
                    {$t(i18nKeys.console.domainBindings.manageRoute)}
                  </Button>
                </div>
              </div>

              <div class="console-section space-y-3" data-domain-binding-verification-summary>
                <div class="space-y-1">
                  <h3 class="flex items-center gap-2 font-semibold">
                    <ShieldCheck class="size-4" />
                    {$t(i18nKeys.console.domainBindings.dnsStepTitle)}
                  </h3>
                  <p class="text-sm text-muted-foreground">
                    {$t(i18nKeys.console.domainBindings.verificationAttempts, {
                      count: selectedDomainBinding.verificationAttemptCount,
                    })}
                  </p>
                </div>
                <Button
                  class="w-full"
                  type="button"
                  variant="outline"
                  disabled={selectedDomainBinding.status === "deleted"}
                  onclick={() => openDomainBindingVerificationDialog(selectedDomainBinding)}
                >
                  <Check class="size-4" />
                  {$t(i18nKeys.console.domainBindings.confirmOwnership)}
                </Button>
              </div>

              <div class="console-section space-y-3" data-domain-binding-lifecycle-handoff>
                <div class="space-y-1">
                  <h3 class="font-semibold">
                    {$t(i18nKeys.console.domainBindings.lifecycleStatus)}
                  </h3>
                  <p class="text-sm text-muted-foreground">
                    {$t(i18nKeys.console.domainBindings.lifecycleDescription)}
                  </p>
                </div>
                <dl class="grid gap-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">{$t(i18nKeys.console.domainBindings.lifecycleStatus)}</dt>
                    <dd class="font-medium">
                      {selectedDomainBindingDetail
                        ? domainBindingLifecycleStatusLabel(selectedDomainBindingDetail)
                        : $t(i18nKeys.common.status.unknown)}
                    </dd>
                  </div>
                </dl>
                <Button
                  class="w-full"
                  type="button"
                  variant="outline"
                  disabled={selectedDomainBinding.status === "deleted"}
                  onclick={() => openDomainBindingDeleteDialog(selectedDomainBinding)}
                >
                  <ShieldCheck class="size-4" />
                  {$t(i18nKeys.console.domainBindings.lifecycleManageAction)}
                </Button>
              </div>
            {:else}
              <div class="space-y-3 text-sm text-muted-foreground">
                <Globe2 class="size-5" />
                <p>{$t(i18nKeys.console.domainBindings.emptyBody)}</p>
              </div>
            {/if}
          </aside>
        </section>
      {/if}
    </ConsoleResourceCanvas>
  {/if}

  <Dialog.Root
    bind:open={domainBindingVerificationDialogOpen}
    onOpenChange={setDomainBindingVerificationDialogOpen}
  >
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-xl">
      {#if selectedVerificationBinding}
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.domainBindings.dnsStepTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.domainBindings.listDescription)}
          </Dialog.Description>
        </Dialog.Header>
        <section class="space-y-5 px-5 pb-5" data-domain-binding-verification-dialog>
          <div class="rounded-md border bg-muted/20 px-3 py-2">
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.domainName)}</p>
            <p class="mt-1 truncate text-sm font-medium">
              {selectedVerificationBinding.domainName}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {domainBindingStatusLabel(selectedVerificationBinding.status)} ·
              {$t(i18nKeys.console.domainBindings.verificationAttempts, {
                count: selectedVerificationBinding.verificationAttemptCount,
              })}
            </p>
          </div>

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={retryDomainBindingVerificationMutation.isPending}
              onclick={() =>
                retryDomainBindingVerificationMutation.mutate({
                  domainBindingId: selectedVerificationBinding.id,
                })}
            >
              <RefreshCw class="size-4" />
              {$t(i18nKeys.console.domainBindings.retryVerification)}
            </Button>
            <Button
              type="button"
              disabled={selectedVerificationBinding.status !== "pending_verification" ||
                confirmDomainBindingOwnershipMutation.isPending}
              onclick={() => confirmDomainBindingOwnership(selectedVerificationBinding)}
            >
              <Check class="size-4" />
              {confirmDomainBindingOwnershipMutation.isPending
                ? $t(i18nKeys.console.domainBindings.confirmingOwnership)
                : $t(i18nKeys.console.domainBindings.confirmOwnership)}
            </Button>
          </div>
        </section>
      {/if}
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root
    bind:open={domainBindingRouteDialogOpen}
    onOpenChange={setDomainBindingRouteDialogOpen}
  >
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-2xl">
      {#if selectedRouteBinding}
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.domainBindings.routeDialogTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.domainBindings.routeDialogDescription)}
          </Dialog.Description>
        </Dialog.Header>
        <section class="space-y-5 px-5 pb-5" data-domain-binding-route-dialog>
          <div class="rounded-md border bg-muted/20 px-3 py-2">
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.domainName)}</p>
            <p class="mt-1 truncate text-sm font-medium">{selectedRouteBinding.domainName}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {selectedRouteBinding.pathPrefix} · {selectedRouteBinding.proxyKind} · {$t(i18nKeys.common.domain.tls)}
              {selectedRouteBinding.tlsMode}
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <label class="space-y-1.5 text-sm font-medium">
              <span class="console-field-label">{$t(i18nKeys.common.domain.redirectTo)}</span>
              <Select.Root
                type="single"
                value={routeRedirectDraft}
                onValueChange={setRouteRedirectDraft}
                disabled={selectedRouteRedirectTargets.length === 0 ||
                  selectedRouteBinding.status === "deleted"}
              >
                <Select.Trigger class="w-full">
                  {routeRedirectDraft || $t(i18nKeys.console.domainBindings.noCanonicalDomainOptions)}
                </Select.Trigger>
                <Select.Content>
                  {#each selectedRouteRedirectTargets as target (target.id)}
                    <Select.Item value={target.domainName}>{target.domainName}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </label>

            <label class="space-y-1.5 text-sm font-medium">
              <span class="console-field-label">{$t(i18nKeys.common.domain.redirectStatus)}</span>
              <Select.Root
                type="single"
                value={routeRedirectStatusDraft}
                onValueChange={setRouteRedirectStatusDraft}
                disabled={selectedRouteBinding.status === "deleted"}
              >
                <Select.Trigger class="w-full">
                  {routeRedirectStatusDraft}
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="308">308</Select.Item>
                  <Select.Item value="301">301</Select.Item>
                  <Select.Item value="307">307</Select.Item>
                  <Select.Item value="302">302</Select.Item>
                </Select.Content>
              </Select.Root>
            </label>
          </div>

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={selectedRouteBinding.status === "deleted" ||
                configureDomainBindingRouteMutation.isPending}
              onclick={() => configureDomainBindingRoute(selectedRouteBinding, "serve")}
            >
              <Route class="size-4" />
              {$t(i18nKeys.console.domainBindings.configureServe)}
            </Button>
            <Button
              type="button"
              disabled={selectedRouteBinding.status === "deleted" ||
                configureDomainBindingRouteMutation.isPending ||
                !routeRedirectDraft}
              onclick={() => configureDomainBindingRoute(selectedRouteBinding, "redirect")}
            >
              <Save class="size-4" />
              {$t(i18nKeys.console.domainBindings.configureRedirect)}
            </Button>
          </div>
        </section>
      {/if}
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root
    bind:open={domainBindingDeleteDialogOpen}
    onOpenChange={setDomainBindingDeleteDialogOpen}
  >
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-xl">
      {#if selectedDeleteBinding}
        {@const selectedDeleteDetail = bindingDetails[selectedDeleteBinding.id]}
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.domainBindings.deleteDialogTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.domainBindings.deleteDialogDescription)}
          </Dialog.Description>
        </Dialog.Header>
        <section class="space-y-5 px-5 pb-5" data-domain-binding-delete-dialog>
          <div class="rounded-md border bg-muted/20 px-3 py-2">
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.domainName)}</p>
            <p class="mt-1 truncate text-sm font-medium">{selectedDeleteBinding.domainName}</p>
            <p class="mt-1 break-all font-mono text-xs text-muted-foreground">
              {selectedDeleteBinding.id}
            </p>
          </div>

          <div class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm">
            <p class="font-medium text-destructive">
              {$t(i18nKeys.console.domainBindings.deleteSafety)}
            </p>
            <p class="mt-1 text-muted-foreground">
              {#if selectedDeleteDetail}
                {selectedDeleteDetail.deleteSafety.safeToDelete
                  ? $t(i18nKeys.console.domainBindings.deleteCheckSafeTitle)
                  : $t(i18nKeys.console.domainBindings.deleteCheckBlockedTitle)}
              {:else}
                {$t(i18nKeys.console.domainBindings.deleteCheckFirst)}
              {/if}
            </p>
          </div>

          <label class="space-y-1.5 text-sm font-medium">
            <span class="console-field-label">
              {$t(i18nKeys.console.domainBindings.deleteConfirmLabel)}
            </span>
            <Input
              value={deleteConfirmationDraft}
              disabled={selectedDeleteBinding.status === "deleted"}
              placeholder={selectedDeleteBinding.id}
              oninput={(event) =>
                setDeleteConfirmationDraft(
                  (event.currentTarget as HTMLInputElement).value,
                )}
            />
          </label>

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={checkDomainBindingDeleteSafetyMutation.isPending}
              onclick={() =>
                checkDomainBindingDeleteSafetyMutation.mutate({
                  domainBindingId: selectedDeleteBinding.id,
                })}
            >
              <Search class="size-4" />
              {$t(i18nKeys.console.domainBindings.deleteCheck)}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={selectedDeleteBinding.status === "deleted" ||
                deleteDomainBindingMutation.isPending ||
                deleteConfirmationDraft !== selectedDeleteBinding.id}
              onclick={() => deleteDomainBinding(selectedDeleteBinding)}
            >
              <Trash2 class="size-4" />
              {$t(i18nKeys.console.domainBindings.deleteBinding)}
            </Button>
          </div>
        </section>
      {/if}
    </Dialog.Content>
  </Dialog.Root>
</ConsoleShell>

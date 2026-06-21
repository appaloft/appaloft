<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { createMutation, createQuery } from "@tanstack/svelte-query";
  import {
    ArrowLeft,
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
    DomainBindingDeleteSafety,
    DomainBindingSummary,
    RetryDomainBindingVerificationInput,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs";
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
    detailTabsScrollAreaClass,
    subnavItemClass,
    subnavListClass,
  } from "$lib/console/layout-classes";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    findEnvironment,
    findProject,
    findResource,
    findServer,
    formatTime,
    projectDetailHref,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type DomainBindingDetailTab = "overview" | "routing" | "dns" | "lifecycle";
  type DomainBindingOverviewSection = "identity" | "resource";
  type DomainRouteMode = "serve" | "redirect";
  type RedirectStatusText = "301" | "302" | "307" | "308";

  const domainBindingDetailTabs = ["overview", "routing", "dns", "lifecycle"] as const;
  const domainBindingOverviewSections = ["identity", "resource"] as const;
  const domainBindingId = $derived(page.params.domainBindingId ?? "");
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

  const domainBindingDetailQuery = createQuery(() =>
    orpc.domainBindings.show.queryOptions({
      input: { domainBindingId },
      enabled: browser && domainBindingId.length > 0,
      staleTime: 5_000,
    }),
  );

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const domainBindings = $derived(domainBindingsQuery.data?.items ?? []);
  const bindingDetail = $derived(domainBindingDetailQuery.data ?? null);
  const selectedDomainBinding = $derived(
    bindingDetail?.binding ??
      domainBindings.find((binding) => binding.id === domainBindingId) ??
      null,
  );
  const selectedProject = $derived(
    selectedDomainBinding ? findProject(projects, selectedDomainBinding.projectId) : null,
  );
  const selectedEnvironment = $derived(
    selectedDomainBinding ? findEnvironment(environments, selectedDomainBinding.environmentId) : null,
  );
  const selectedResource = $derived(
    selectedDomainBinding ? findResource(resources, selectedDomainBinding.resourceId) : null,
  );
  const selectedServer = $derived(
    selectedDomainBinding?.serverId ? findServer(servers, selectedDomainBinding.serverId) : null,
  );
  let lifecycleFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let deleteSafetyOverride = $state<DomainBindingDeleteSafety | null>(null);
  let routeRedirectDraft = $state("");
  let routeRedirectStatusDraft = $state<RedirectStatusText>("308");
  let deleteConfirmationDraft = $state("");
  let domainBindingVerificationDialogOpen = $state(false);
  let domainBindingRouteDialogOpen = $state(false);
  let domainBindingDeleteDialogOpen = $state(false);

  const selectedRouteRedirectTargets = $derived(
    selectedDomainBinding ? domainBindingRedirectTargets(selectedDomainBinding) : [],
  );
  const pageLoading = $derived(
    domainBindingDetailQuery.isPending ||
      projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      serversQuery.isPending ||
      domainBindingsQuery.isPending,
  );
  const activeTab = $derived(parseDomainBindingDetailTab(page.url.searchParams.get("tab")));
  const activeOverviewSection = $derived(
    parseDomainBindingOverviewSection(page.url.searchParams.get("section")),
  );
  const currentDeleteSafety = $derived(deleteSafetyOverride ?? bindingDetail?.deleteSafety ?? null);

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
      void refreshDomainBindingDetail();
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.confirmOwnershipErrorTitle),
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
      void refreshDomainBindingDetail();
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
    onSuccess: (deleteSafety) => {
      deleteSafetyOverride = deleteSafety;
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
      deleteConfirmationDraft = "";
      deleteSafetyOverride = null;
      void refreshDomainBindingDetail();
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
    onSuccess: (result) => {
      lifecycleFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.domainBindings.retryVerificationSuccessTitle),
        detail: result.verificationAttemptId,
      };
      domainBindingVerificationDialogOpen = false;
      void refreshDomainBindingDetail();
    },
    onError: (error) => {
      lifecycleFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.retryVerificationErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));

  function refreshDomainBindingDetail(): void {
    void queryClient.invalidateQueries({ queryKey: orpc.domainBindings.key({ type: "query" }) });
    void domainBindingDetailQuery.refetch();
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

  function domainBindingLifecycleStatusLabel(safety: DomainBindingDeleteSafety | null): string {
    if (!safety) {
      return $t(i18nKeys.common.status.unknown);
    }

    return safety.safeToDelete
      ? $t(i18nKeys.console.domainBindings.lifecycleReady)
      : $t(i18nKeys.console.domainBindings.lifecycleBlocked);
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

  function parseDomainBindingDetailTab(value: string | null): DomainBindingDetailTab {
    return domainBindingDetailTabs.includes(value as DomainBindingDetailTab)
      ? (value as DomainBindingDetailTab)
      : "overview";
  }

  function parseDomainBindingOverviewSection(value: string | null): DomainBindingOverviewSection {
    return domainBindingOverviewSections.includes(value as DomainBindingOverviewSection)
      ? (value as DomainBindingOverviewSection)
      : "identity";
  }

  function domainBindingTabHref(tab: DomainBindingDetailTab): string {
    const params = new URLSearchParams();
    if (tab !== "overview") {
      params.set("tab", tab);
    }
    const query = params.toString();
    return `${page.url.pathname}${query ? `?${query}` : ""}`;
  }

  function selectDomainBindingTab(tab: DomainBindingDetailTab, event: MouseEvent): void {
    event.preventDefault();
    void goto(domainBindingTabHref(tab), { noScroll: true, keepFocus: true });
  }

  function domainBindingOverviewSectionHref(section: DomainBindingOverviewSection): string {
    const params = new URLSearchParams();
    if (section !== "identity") {
      params.set("section", section);
    }
    const query = params.toString();
    return `${page.url.pathname}${query ? `?${query}` : ""}`;
  }

  function selectDomainBindingOverviewSection(
    section: DomainBindingOverviewSection,
    event: MouseEvent,
  ): void {
    event.preventDefault();
    void goto(domainBindingOverviewSectionHref(section), { noScroll: true, keepFocus: true });
  }

  function domainBindingTabLabel(tab: DomainBindingDetailTab): string {
    switch (tab) {
      case "overview":
        return $t(i18nKeys.console.domainBindings.tabOverview);
      case "routing":
        return $t(i18nKeys.console.domainBindings.tabRouting);
      case "dns":
        return $t(i18nKeys.console.domainBindings.tabDns);
      case "lifecycle":
        return $t(i18nKeys.console.domainBindings.tabLifecycle);
    }
  }

  function domainBindingOverviewSectionLabel(section: DomainBindingOverviewSection): string {
    switch (section) {
      case "identity":
        return $t(i18nKeys.console.domainBindings.sectionIdentity);
      case "resource":
        return $t(i18nKeys.console.domainBindings.sectionResource);
    }
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

  function openDomainBindingVerificationDialog(): void {
    if (!selectedDomainBinding) {
      return;
    }
    domainBindingVerificationDialogOpen = true;
  }

  function openDomainBindingRouteDialog(): void {
    if (!selectedDomainBinding) {
      return;
    }
    routeRedirectDraft = selectedDomainBinding.redirectTo ?? "";
    routeRedirectStatusDraft = `${selectedDomainBinding.redirectStatus ?? 308}` as RedirectStatusText;
    domainBindingRouteDialogOpen = true;
  }

  function openDomainBindingDeleteDialog(): void {
    if (!selectedDomainBinding || selectedDomainBinding.status === "deleted") {
      return;
    }
    deleteConfirmationDraft = "";
    domainBindingDeleteDialogOpen = true;
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

  function confirmDomainBindingOwnership(binding: DomainBindingSummary): void {
    if (binding.status !== "pending_verification" || confirmDomainBindingOwnershipMutation.isPending) {
      return;
    }

    lifecycleFeedback = null;
    confirmDomainBindingOwnershipMutation.mutate({ domainBindingId: binding.id });
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
</script>

<svelte:head>
  <title>{selectedDomainBinding?.domainName ?? $t(i18nKeys.console.domainBindings.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={selectedDomainBinding?.domainName ?? $t(i18nKeys.console.domainBindings.pageTitle)}
  description={$t(i18nKeys.console.domainBindings.pageDescription)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-44 w-full" />
      <Skeleton class="h-96 w-full" />
    </div>
  {:else if !selectedDomainBinding}
    <ConsoleResourceCanvas>
      <div class="console-panel space-y-4 p-6">
        <Globe2 class="size-5 text-muted-foreground" />
        <div class="space-y-1">
          <h1 class="text-xl font-semibold">{$t(i18nKeys.console.domainBindings.emptyTitle)}</h1>
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.domainBindings.emptyBody)}
          </p>
        </div>
        <Button href="/domain-bindings" variant="outline">
          <ArrowLeft class="size-4" />
          {$t(i18nKeys.console.domainBindings.pageTitle)}
        </Button>
      </div>
    </ConsoleResourceCanvas>
  {:else}
    <div class={detailPageClass} data-domain-binding-detail-display-surface>
      <header class={detailHeaderClass}>
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 space-y-3">
            <Button type="button" href="/domain-bindings" variant="ghost" size="sm" class="w-fit">
              <ArrowLeft class="size-4" />
              {$t(i18nKeys.console.domainBindings.pageTitle)}
            </Button>
            <div class="min-w-0 space-y-2">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <h1 class="truncate text-2xl font-semibold md:text-3xl">
                  {selectedDomainBinding.domainName}
                </h1>
                <Badge variant={domainBindingStatusVariant(selectedDomainBinding.status)}>
                  {domainBindingStatusLabel(selectedDomainBinding.status)}
                </Badge>
                <DocsHelpLink
                  href={webDocsHrefs.domainCustomDomainBinding}
                  ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                />
              </div>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.domainBindings.detailDescription)}
              </p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={domainBindingDetailQuery.isFetching}
              onclick={() => refreshDomainBindingDetail()}
            >
              <RefreshCw class="size-4" />
              {$t(i18nKeys.console.runtimeUsage.refreshNow)}
            </Button>
          </div>
        </div>

        <div class="console-metric-strip mt-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">ID</p>
            <p class="mt-2 break-all font-mono text-xs font-semibold">{selectedDomainBinding.id}</p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.project)}
            </p>
            <p class="mt-2 truncate font-semibold">
              {selectedProject?.name ?? selectedDomainBinding.projectId}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.resource)}
            </p>
            <p class="mt-2 truncate font-semibold">
              {selectedResource?.name ?? selectedDomainBinding.resourceId}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.common.domain.createdAt)}
            </p>
            <p class="mt-2 truncate font-semibold">{formatTime(selectedDomainBinding.createdAt)}</p>
          </div>
        </div>

        {#if lifecycleFeedback}
          <div
            class={[
              "mt-4 rounded-md border px-3 py-2 text-sm",
              lifecycleFeedback.kind === "success"
                ? "border-primary/25 bg-primary/5"
                : "border-destructive/30 bg-destructive/5 text-destructive",
            ]}
          >
            <p class="font-medium">{lifecycleFeedback.title}</p>
            <p class="mt-1 break-all text-xs">{lifecycleFeedback.detail}</p>
          </div>
        {/if}
      </header>

      <Tabs.Root value={activeTab} class={detailBodyClass}>
        <ScrollArea class={detailTabsScrollAreaClass}>
          <nav aria-label={$t(i18nKeys.console.domainBindings.pageTitle)} class={detailTabsClass}>
            {#each domainBindingDetailTabs as tab (tab)}
              <a
                href={domainBindingTabHref(tab)}
                class={detailTabClass}
                aria-current={activeTab === tab ? "page" : undefined}
                onclick={(event) => selectDomainBindingTab(tab, event)}
              >
                {domainBindingTabLabel(tab)}
              </a>
            {/each}
          </nav>
        </ScrollArea>

        <Tabs.Content value="overview" class={detailTabPanelSubnavClass}>
          <div class={[detailSubnavLayoutClass, "md:grid-cols-[13rem_minmax(0,1fr)]"]}>
            <aside class={detailSubnavClass}>
              <nav class="min-w-0" aria-label={$t(i18nKeys.console.domainBindings.tabOverview)}>
                <div class={subnavListClass}>
                  {#each domainBindingOverviewSections as section (section)}
                    <a
                      class={[subnavItemClass, "min-h-10 text-sm"]}
                      href={domainBindingOverviewSectionHref(section)}
                      aria-current={activeOverviewSection === section ? "page" : undefined}
                      onclick={(event) => selectDomainBindingOverviewSection(section, event)}
                    >
                      <span class="min-w-0 truncate">
                        {domainBindingOverviewSectionLabel(section)}
                      </span>
                    </a>
                  {/each}
                </div>
              </nav>
            </aside>
            <div class={detailSubnavContentClass}>
              {#if activeOverviewSection === "identity"}
                <section class="console-panel space-y-4 p-4" data-domain-binding-identity-summary>
                  <div class="space-y-1">
                    <h2 class="text-lg font-semibold">
                      {$t(i18nKeys.console.domainBindings.sectionIdentity)}
                    </h2>
                    <p class="text-sm text-muted-foreground">
                      {$t(i18nKeys.console.domainBindings.detailIdentityDescription)}
                    </p>
                  </div>
                  <dl class="grid gap-3 text-sm md:grid-cols-2">
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
                    <div class="rounded-md border bg-background px-3 py-2">
                      <dt class="text-xs text-muted-foreground">
                        {$t(i18nKeys.common.domain.domainName)}
                      </dt>
                      <dd class="mt-1 break-all font-medium">{selectedDomainBinding.domainName}</dd>
                    </div>
                    <div class="rounded-md border bg-background px-3 py-2">
                      <dt class="text-xs text-muted-foreground">
                        {$t(i18nKeys.common.domain.createdAt)}
                      </dt>
                      <dd class="mt-1 font-medium">{formatTime(selectedDomainBinding.createdAt)}</dd>
                    </div>
                  </dl>
                </section>
              {:else}
                <section class="console-panel space-y-4 p-4" data-domain-binding-owner-summary>
                  <div class="space-y-1">
                    <h2 class="text-lg font-semibold">
                      {$t(i18nKeys.console.domainBindings.sectionResource)}
                    </h2>
                    <p class="text-sm text-muted-foreground">
                      {$t(i18nKeys.console.domainBindings.createOwnerHint)}
                    </p>
                  </div>
                  <dl class="grid gap-3 text-sm md:grid-cols-2">
                    <div class="rounded-md border bg-background px-3 py-2">
                      <dt class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.project)}</dt>
                      <dd class="mt-1 min-w-0 truncate font-medium">
                        {selectedProject?.name ?? selectedDomainBinding.projectId}
                      </dd>
                      {#if selectedProject}
                        <Button class="mt-3" href={projectDetailHref(selectedProject.id)} size="sm" variant="outline">
                          {$t(i18nKeys.common.actions.viewDetails)}
                        </Button>
                      {/if}
                    </div>
                    <div class="rounded-md border bg-background px-3 py-2">
                      <dt class="text-xs text-muted-foreground">
                        {$t(i18nKeys.common.domain.environment)}
                      </dt>
                      <dd class="mt-1 min-w-0 truncate font-medium">
                        {selectedEnvironment?.name ?? selectedDomainBinding.environmentId}
                      </dd>
                    </div>
                    <div class="rounded-md border bg-background px-3 py-2">
                      <dt class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</dt>
                      <dd class="mt-1 min-w-0 truncate font-medium">
                        {selectedResource?.name ?? selectedDomainBinding.resourceId}
                      </dd>
                      {#if selectedResource}
                        <Button class="mt-3" href={resourceDetailHref(selectedResource)} size="sm" variant="outline">
                          {$t(i18nKeys.common.actions.viewDetails)}
                        </Button>
                      {/if}
                    </div>
                    <div class="rounded-md border bg-background px-3 py-2">
                      <dt class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.server)}</dt>
                      <dd class="mt-1 min-w-0 truncate font-medium">
                        {selectedServer?.name ?? selectedDomainBinding.serverId ?? "-"}
                      </dd>
                    </div>
                  </dl>
                </section>
              {/if}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content
          value="routing"
          class={[detailTabPanelScrollClass, "space-y-5"]}
          data-domain-binding-route-summary
        >
          <section class="console-panel space-y-4 p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="space-y-1">
                <h2 class="flex items-center gap-2 text-lg font-semibold">
                  <Route class="size-4" />
                  {$t(i18nKeys.common.domain.routeBehavior)}
                </h2>
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.routeManagedInDialog)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={selectedDomainBinding.status === "deleted"}
                onclick={() => openDomainBindingRouteDialog()}
              >
                <Route class="size-4" />
                {$t(i18nKeys.console.domainBindings.manageRoute)}
              </Button>
            </div>
            <dl class="grid gap-3 text-sm md:grid-cols-3">
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.routeReadiness)}
                </dt>
                <dd class="mt-1 truncate font-medium">
                  {bindingDetail
                    ? `${bindingDetail.routeReadiness.status} · ${bindingDetail.routeReadiness.routeBehavior}`
                    : $t(i18nKeys.common.status.unknown)}
                </dd>
              </div>
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.proxyReadiness)}
                </dt>
                <dd class="mt-1 truncate font-medium">
                  {bindingDetail?.proxyReadiness ?? $t(i18nKeys.common.status.unknown)}
                </dd>
              </div>
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.redirectTo)}</dt>
                <dd class="mt-1 truncate font-medium">
                  {selectedDomainBinding.redirectTo ?? $t(i18nKeys.console.domainBindings.routeModeServe)}
                </dd>
              </div>
            </dl>
          </section>
        </Tabs.Content>

        <Tabs.Content
          value="dns"
          class={[detailTabPanelScrollClass, "space-y-5"]}
          data-domain-binding-verification-summary
        >
          <section class="console-panel space-y-4 p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="space-y-1">
                <h2 class="flex items-center gap-2 text-lg font-semibold">
                  <ShieldCheck class="size-4" />
                  {$t(i18nKeys.console.domainBindings.dnsStepTitle)}
                </h2>
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.verificationAttempts, {
                    count: selectedDomainBinding.verificationAttemptCount,
                  })}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={selectedDomainBinding.status === "deleted"}
                onclick={() => openDomainBindingVerificationDialog()}
              >
                <Check class="size-4" />
                {$t(i18nKeys.console.domainBindings.confirmOwnership)}
              </Button>
            </div>
            <dl class="grid gap-3 text-sm md:grid-cols-2">
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.dnsCheckedAt)}
                </dt>
                <dd class="mt-1 font-medium">
                  {selectedDomainBinding.dnsObservation?.checkedAt
                    ? formatTime(selectedDomainBinding.dnsObservation.checkedAt)
                    : $t(i18nKeys.common.status.unknown)}
                </dd>
              </div>
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.common.domain.status)}
                </dt>
                <dd class="mt-1 font-medium">
                  {selectedDomainBinding.dnsObservation?.status ?? $t(i18nKeys.common.status.unknown)}
                </dd>
              </div>
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.dnsExpectedTargets)}
                </dt>
                <dd class="mt-1 break-all font-mono text-xs">
                  {selectedDomainBinding.dnsObservation?.expectedTargets.join(", ") ||
                    $t(i18nKeys.common.status.unknown)}
                </dd>
              </div>
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.dnsObservedTargets)}
                </dt>
                <dd class="mt-1 break-all font-mono text-xs">
                  {selectedDomainBinding.dnsObservation?.observedTargets.join(", ") ||
                    $t(i18nKeys.common.status.unknown)}
                </dd>
              </div>
            </dl>
          </section>
        </Tabs.Content>

        <Tabs.Content
          value="lifecycle"
          class={[detailTabPanelScrollClass, "space-y-5"]}
          data-domain-binding-lifecycle-handoff
        >
          <section class="console-panel space-y-4 p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="space-y-1">
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.domainBindings.lifecycleStatus)}
                </h2>
                <p class="text-sm text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.lifecycleDescription)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={selectedDomainBinding.status === "deleted"}
                onclick={() => openDomainBindingDeleteDialog()}
              >
                <ShieldCheck class="size-4" />
                {$t(i18nKeys.console.domainBindings.lifecycleManageAction)}
              </Button>
            </div>
            <dl class="grid gap-3 text-sm md:grid-cols-2">
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.lifecycleStatus)}
                </dt>
                <dd class="mt-1 font-medium">
                  {domainBindingLifecycleStatusLabel(currentDeleteSafety)}
                </dd>
              </div>
              <div class="rounded-md border bg-background px-3 py-2">
                <dt class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.domainBindings.deleteSafety)}
                </dt>
                <dd class="mt-1 font-medium">
                  {currentDeleteSafety
                    ? currentDeleteSafety.safeToDelete
                      ? $t(i18nKeys.console.domainBindings.deleteCheckSafeTitle)
                      : $t(i18nKeys.console.domainBindings.deleteCheckBlockedTitle)
                    : $t(i18nKeys.console.domainBindings.deleteCheckFirst)}
                </dd>
              </div>
            </dl>
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  {/if}

  <Dialog.Root bind:open={domainBindingVerificationDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-xl">
      {#if selectedDomainBinding}
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.domainBindings.dnsStepTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.domainBindings.listDescription)}
          </Dialog.Description>
        </Dialog.Header>
        <section class="space-y-5 px-5 pb-5" data-domain-binding-verification-dialog>
          <div class="rounded-md border bg-muted/20 px-3 py-2">
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.domainName)}</p>
            <p class="mt-1 truncate text-sm font-medium">{selectedDomainBinding.domainName}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {domainBindingStatusLabel(selectedDomainBinding.status)} ·
              {$t(i18nKeys.console.domainBindings.verificationAttempts, {
                count: selectedDomainBinding.verificationAttemptCount,
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
                  domainBindingId: selectedDomainBinding.id,
                })}
            >
              <RefreshCw class="size-4" />
              {$t(i18nKeys.console.domainBindings.retryVerification)}
            </Button>
            <Button
              type="button"
              disabled={selectedDomainBinding.status !== "pending_verification" ||
                confirmDomainBindingOwnershipMutation.isPending}
              onclick={() => confirmDomainBindingOwnership(selectedDomainBinding)}
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

  <Dialog.Root bind:open={domainBindingRouteDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-2xl">
      {#if selectedDomainBinding}
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.domainBindings.routeDialogTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.domainBindings.routeDialogDescription)}
          </Dialog.Description>
        </Dialog.Header>
        <section class="space-y-5 px-5 pb-5" data-domain-binding-route-dialog>
          <div class="rounded-md border bg-muted/20 px-3 py-2">
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.domainName)}</p>
            <p class="mt-1 truncate text-sm font-medium">{selectedDomainBinding.domainName}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {selectedDomainBinding.pathPrefix} · {selectedDomainBinding.proxyKind} · {$t(i18nKeys.common.domain.tls)}
              {selectedDomainBinding.tlsMode}
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
                  selectedDomainBinding.status === "deleted"}
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
                disabled={selectedDomainBinding.status === "deleted"}
              >
                <Select.Trigger class="w-full">{routeRedirectStatusDraft}</Select.Trigger>
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
              disabled={selectedDomainBinding.status === "deleted" ||
                configureDomainBindingRouteMutation.isPending}
              onclick={() => configureDomainBindingRoute(selectedDomainBinding, "serve")}
            >
              <Route class="size-4" />
              {$t(i18nKeys.console.domainBindings.configureServe)}
            </Button>
            <Button
              type="button"
              disabled={selectedDomainBinding.status === "deleted" ||
                configureDomainBindingRouteMutation.isPending ||
                !routeRedirectDraft}
              onclick={() => configureDomainBindingRoute(selectedDomainBinding, "redirect")}
            >
              <Save class="size-4" />
              {$t(i18nKeys.console.domainBindings.configureRedirect)}
            </Button>
          </div>
        </section>
      {/if}
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={domainBindingDeleteDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-xl">
      {#if selectedDomainBinding}
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.domainBindings.deleteDialogTitle)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.domainBindings.deleteDialogDescription)}
          </Dialog.Description>
        </Dialog.Header>
        <section class="space-y-5 px-5 pb-5" data-domain-binding-delete-dialog>
          <div class="rounded-md border bg-muted/20 px-3 py-2">
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.domainName)}</p>
            <p class="mt-1 truncate text-sm font-medium">{selectedDomainBinding.domainName}</p>
            <p class="mt-1 break-all font-mono text-xs text-muted-foreground">
              {selectedDomainBinding.id}
            </p>
          </div>

          <div class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm">
            <p class="font-medium text-destructive">
              {$t(i18nKeys.console.domainBindings.deleteSafety)}
            </p>
            <p class="mt-1 text-muted-foreground">
              {#if currentDeleteSafety}
                {currentDeleteSafety.safeToDelete
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
              disabled={selectedDomainBinding.status === "deleted"}
              placeholder={selectedDomainBinding.id}
              oninput={(event) =>
                setDeleteConfirmationDraft((event.currentTarget as HTMLInputElement).value)}
            />
          </label>

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={checkDomainBindingDeleteSafetyMutation.isPending}
              onclick={() =>
                checkDomainBindingDeleteSafetyMutation.mutate({
                  domainBindingId: selectedDomainBinding.id,
                })}
            >
              <Search class="size-4" />
              {$t(i18nKeys.console.domainBindings.deleteCheck)}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={selectedDomainBinding.status === "deleted" ||
                deleteDomainBindingMutation.isPending ||
                deleteConfirmationDraft !== selectedDomainBinding.id}
              onclick={() => deleteDomainBinding(selectedDomainBinding)}
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

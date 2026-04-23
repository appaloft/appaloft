<script lang="ts">
  import { browser } from "$app/environment";
  import { createMutation } from "@tanstack/svelte-query";
  import { ArrowRight, Check, Globe2, Plus, Route, ShieldCheck } from "@lucide/svelte";
  import type {
    ConfirmDomainBindingOwnershipInput,
    CreateDomainBindingInput,
    DomainBindingSummary,
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
  import {
    findEnvironment,
    findProject,
    findResource,
    findServer,
    formatTime,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type DomainRouteMode = "serve" | "redirect";
  type RedirectStatusText = "301" | "302" | "307" | "308";

  const {
    projectsQuery,
    environmentsQuery,
    resourcesQuery,
    serversQuery,
    domainBindingsQuery,
  } = createConsoleQueries(browser);

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const domainBindings = $derived(domainBindingsQuery.data?.items ?? []);
  const allProjectsFilterValue = "__all_projects__";
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      serversQuery.isPending ||
      domainBindingsQuery.isPending,
  );

  let projectId = $state("");
  let environmentId = $state("");
  let resourceId = $state("");
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
  let projectFilter = $state("");
  let createFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);

  const filteredEnvironments = $derived.by(() =>
    projectId
      ? environments.filter((environment) => environment.projectId === projectId)
      : environments,
  );
  const filteredResources = $derived.by(() =>
    resources.filter((resource) => {
      if (projectId && resource.projectId !== projectId) {
        return false;
      }

      if (environmentId && resource.environmentId !== environmentId) {
        return false;
      }

      return true;
    }),
  );
  const selectedProject = $derived(findProject(projects, projectId));
  const selectedEnvironment = $derived(findEnvironment(environments, environmentId));
  const selectedResource = $derived(findResource(resources, resourceId));
  const selectedServer = $derived(findServer(servers, serverId));
  const selectedProjectFilter = $derived(
    projectFilter ? findProject(projects, projectFilter) : null,
  );
  const canonicalRedirectTargets = $derived.by(() =>
    domainBindings.filter(
      (binding) =>
        !binding.redirectTo &&
        binding.projectId === projectId &&
        binding.environmentId === environmentId &&
        binding.resourceId === resourceId &&
        binding.domainName !== domainName.trim().toLowerCase() &&
        binding.pathPrefix === (pathPrefix.trim() || "/"),
    ),
  );
  const selectedCanonicalRedirectTarget = $derived(
    canonicalRedirectTargets.find((binding) => binding.domainName === redirectTo) ?? null,
  );
  const projectFilterSelectValue = $derived(projectFilter || allProjectsFilterValue);
  const visibleDomainBindings = $derived.by(() =>
    projectFilter
      ? domainBindings.filter((binding) => binding.projectId === projectFilter)
      : domainBindings,
  );
  const canSubmit = $derived(
    Boolean(
      projectId &&
        environmentId &&
        resourceId &&
        serverId &&
        destinationId &&
        domainName.trim() &&
        pathPrefix.trim() &&
        proxyKind !== "none" &&
        (routeMode === "serve" || redirectTo),
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
    },
    onError: (error) => {
      createFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.domainBindings.confirmOwnershipErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));

  $effect(() => {
    if (!browser || projectId || projects.length === 0) {
      return;
    }

    projectId = projects[0]?.id ?? "";
  });

  $effect(() => {
    if (!browser) {
      return;
    }

    if (!filteredEnvironments.some((environment) => environment.id === environmentId)) {
      environmentId = filteredEnvironments[0]?.id ?? "";
    }
  });

  $effect(() => {
    if (!browser) {
      return;
    }

    if (!filteredResources.some((resource) => resource.id === resourceId)) {
      resourceId = filteredResources[0]?.id ?? "";
    }
  });

  $effect(() => {
    if (!browser || serverId || servers.length === 0) {
      return;
    }

    serverId = servers[0]?.id ?? "";
  });

  $effect(() => {
    if (!browser || !selectedResource?.destinationId) {
      return;
    }

    destinationId = selectedResource.destinationId;
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

  function createDomainBinding(event: SubmitEvent): void {
    event.preventDefault();

    if (!canSubmit || createDomainBindingMutation.isPending) {
      return;
    }

    createFeedback = null;
    createDomainBindingMutation.mutate({
      projectId,
      environmentId,
      resourceId,
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

  function confirmDomainBindingOwnership(binding: DomainBindingSummary): void {
    if (binding.status !== "pending_verification" || confirmDomainBindingOwnershipMutation.isPending) {
      return;
    }

    createFeedback = null;
    confirmDomainBindingOwnershipMutation.mutate({
      domainBindingId: binding.id,
    });
  }

  function selectProjectFilter(value: string): void {
    projectFilter = value === allProjectsFilterValue ? "" : value;
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.domainBindings.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.domainBindings.pageTitle)}
  description={$t(i18nKeys.console.domainBindings.pageDescription)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-52 w-full" />
      <Skeleton class="h-80 w-full" />
    </div>
  {:else}
    <div class="space-y-8">
      <section class="space-y-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <Badge class="w-fit" variant="outline">
              {$t(i18nKeys.common.domain.domainBindings)}
            </Badge>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold md:text-3xl">
                {$t(i18nKeys.console.domainBindings.pageTitle)}
              </h1>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.domainBindings.pageDescription)}
              </p>
            </div>
          </div>
          <div class="grid grid-cols-2 divide-x border-y text-center md:min-w-72">
            <div class="px-3 py-3">
              <p class="text-xl font-semibold">{domainBindings.length}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {$t(i18nKeys.common.domain.domainBindings)}
              </p>
            </div>
            <div class="px-3 py-3">
              <p class="text-xl font-semibold">
                {domainBindings.filter((binding) => binding.status === "ready").length}
              </p>
              <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.common.status.ready)}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section class="space-y-4">
          <div class="flex items-start gap-3">
            <div class="bg-muted p-2">
              <Plus class="size-4" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.domainBindings.createTitle)}
                </h2>
                <DocsHelpLink
                  href={webDocsHrefs.domainCustomDomainBinding}
                  ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                />
              </div>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.domainBindings.createDescription)}
              </p>
            </div>
          </div>

          <form class="mt-5 space-y-4" onsubmit={createDomainBinding}>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.project)}</span>
                <Select.Root bind:value={projectId} type="single" disabled={projects.length === 0}>
                  <Select.Trigger class="w-full">
                    {selectedProject?.name ?? $t(i18nKeys.console.domainBindings.noProjectOptions)}
                  </Select.Trigger>
                  <Select.Content>
                    {#each projects as project (project.id)}
                      <Select.Item value={project.id}>{project.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.environment)}</span>
                <Select.Root
                  bind:value={environmentId}
                  type="single"
                  disabled={filteredEnvironments.length === 0}
                >
                  <Select.Trigger class="w-full">
                    {selectedEnvironment?.name ??
                      $t(i18nKeys.console.domainBindings.noEnvironmentOptions)}
                  </Select.Trigger>
                  <Select.Content>
                    {#each filteredEnvironments as environment (environment.id)}
                      <Select.Item value={environment.id}>{environment.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.resource)}</span>
                <Select.Root
                  bind:value={resourceId}
                  type="single"
                  disabled={filteredResources.length === 0}
                >
                  <Select.Trigger class="w-full">
                    {selectedResource?.name ?? $t(i18nKeys.console.domainBindings.noResourceOptions)}
                  </Select.Trigger>
                  <Select.Content>
                    {#each filteredResources as resource (resource.id)}
                      <Select.Item value={resource.id}>{resource.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.common.domain.server)}
                  <DocsHelpLink
                    href={webDocsHrefs.serverDeploymentTarget}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Select.Root bind:value={serverId} type="single" disabled={servers.length === 0}>
                  <Select.Trigger class="w-full">
                    {selectedServer?.name ?? $t(i18nKeys.console.domainBindings.noServerOptions)}
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
                  {$t(i18nKeys.common.domain.domainName)}
                  <DocsHelpLink
                    href={webDocsHrefs.domainCustomDomainBinding}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input
                  bind:value={domainName}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.domainBindings.formDomainPlaceholder)}
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.common.domain.pathPrefix)}
                  <DocsHelpLink
                    href={webDocsHrefs.domainGeneratedAccessRoute}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input bind:value={pathPrefix} autocomplete="off" placeholder="/" />
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.common.domain.proxy)}
                  <DocsHelpLink
                    href={webDocsHrefs.serverProxyReadiness}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Select.Root bind:value={proxyKind} type="single">
                  <Select.Trigger class="w-full">{proxyKind}</Select.Trigger>
                  <Select.Content>
                    <Select.Item value="traefik">traefik</Select.Item>
                    <Select.Item value="caddy">caddy</Select.Item>
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.common.domain.tls)}
                  <DocsHelpLink
                    href={webDocsHrefs.certificateReadiness}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Select.Root bind:value={tlsMode} type="single">
                  <Select.Trigger class="w-full">{tlsMode}</Select.Trigger>
                  <Select.Content>
                    <Select.Item value="auto">auto</Select.Item>
                    <Select.Item value="disabled">disabled</Select.Item>
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.common.domain.routeBehavior)}
                  <DocsHelpLink
                    href={webDocsHrefs.domainGeneratedAccessRoute}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
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

              {#if routeMode === "redirect"}
                <label class="space-y-1.5 text-sm font-medium">
                  <span class="inline-flex items-center gap-1.5">
                    {$t(i18nKeys.common.domain.redirectTo)}
                    <DocsHelpLink
                      href={webDocsHrefs.domainCustomDomainBinding}
                      ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                      className="size-5"
                    />
                  </span>
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
                  <span class="inline-flex items-center gap-1.5">
                    {$t(i18nKeys.common.domain.redirectStatus)}
                    <DocsHelpLink
                      href={webDocsHrefs.domainCustomDomainBinding}
                      ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                      className="size-5"
                    />
                  </span>
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

              <label class="space-y-1.5 text-sm font-medium sm:col-span-2">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.common.domain.destination)}
                  <DocsHelpLink
                    href={webDocsHrefs.domainGeneratedAccessRoute}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input bind:value={destinationId} autocomplete="off" placeholder="dst_..." />
                <span class="block text-xs font-normal leading-5 text-muted-foreground">
                  {#if selectedResource?.destinationId}
                    {$t(i18nKeys.console.domainBindings.selectedResourceDestination, {
                      destinationId: selectedResource.destinationId,
                    })}
                  {:else}
                    {$t(i18nKeys.console.domainBindings.destinationHelp)}
                  {/if}
                </span>
              </label>
            </div>

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

            <Button type="submit" disabled={!canSubmit || createDomainBindingMutation.isPending}>
              <Globe2 class="size-4" />
              {createDomainBindingMutation.isPending
                ? $t(i18nKeys.console.domainBindings.formSubmitting)
                : $t(i18nKeys.console.domainBindings.formSubmit)}
            </Button>
          </form>
        </section>

        <section class="space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold">
                {$t(i18nKeys.console.domainBindings.listTitle)}
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.domainBindings.listDescription)}
              </p>
            </div>
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
          </div>

          <div>
            {#if visibleDomainBindings.length > 0}
              <div class="divide-y border-y">
              {#each visibleDomainBindings as binding (binding.id)}
                {@const project = findProject(projects, binding.projectId)}
                {@const environment = findEnvironment(environments, binding.environmentId)}
                {@const resource = findResource(resources, binding.resourceId)}
                {@const server = findServer(servers, binding.serverId)}
                <article class="py-4 sm:px-3">
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0 space-y-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <Globe2 class="size-4 text-muted-foreground" />
                        <h3 class="truncate font-medium">{binding.domainName}</h3>
                        <Badge variant={domainBindingStatusVariant(binding.status)}>
                          {domainBindingStatusLabel(binding.status)}
                        </Badge>
                      </div>
                      <p class="text-sm text-muted-foreground">
                        {project?.name ?? binding.projectId} · {environment?.name ?? binding.environmentId}
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
                    <div class="bg-muted/25 px-3 py-2">
                      <p class="flex items-center gap-2 text-xs text-muted-foreground">
                        <Route class="size-3.5" />
                        {$t(i18nKeys.common.domain.resource)}
                      </p>
                      <p class="mt-1 truncate text-sm font-medium">
                        {resource?.name ?? binding.resourceId}
                      </p>
                    </div>
                    <div class="bg-muted/25 px-3 py-2">
                      <p class="flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldCheck class="size-3.5" />
                        {$t(i18nKeys.common.domain.server)}
                      </p>
                      <p class="mt-1 truncate text-sm font-medium">
                        {server?.name ?? binding.serverId}
                      </p>
                    </div>
                    <div class="bg-muted/25 px-3 py-2">
                      <p class="text-xs text-muted-foreground">
                        {$t(i18nKeys.console.domainBindings.verificationAttempts, {
                          count: binding.verificationAttemptCount,
                        })}
                      </p>
                      <p class="mt-1 truncate text-sm font-medium">
                        {binding.pathPrefix} · {binding.proxyKind} · {$t(i18nKeys.common.domain.tls)}
                        {binding.tlsMode}
                        {#if binding.redirectTo}
                          · {$t(i18nKeys.common.domain.redirectTo)} {binding.redirectTo}
                          ({binding.redirectStatus ?? 308})
                        {/if}
                      </p>
                    </div>
                  </div>
                </article>
              {/each}
              </div>
            {:else}
              <div class="border-y bg-muted/25 px-4 py-6">
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

          <div class="mt-4">
            <Button href="/deploy" variant="outline">
              {$t(i18nKeys.common.actions.newDeployment)}
              <ArrowRight class="size-4" />
            </Button>
          </div>
        </section>
      </section>
    </div>
  {/if}
</ConsoleShell>

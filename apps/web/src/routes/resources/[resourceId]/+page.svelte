<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { createMutation } from "@tanstack/svelte-query";
  import {
    ArrowLeft,
    ArrowRight,
    Boxes,
    Globe2,
    Plus,
    Route,
    Server,
    ShieldCheck,
  } from "@lucide/svelte";
  import type { CreateDomainBindingInput, DomainBindingSummary } from "@yundu/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    deploymentBadgeVariant,
    findEnvironment,
    findProject,
    findResource,
    findServer,
    formatTime,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const {
    projectsQuery,
    environmentsQuery,
    resourcesQuery,
    serversQuery,
    deploymentsQuery,
    domainBindingsQuery,
  } = createConsoleQueries(browser);

  const resourceId = $derived(page.params.resourceId ?? "");
  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const domainBindings = $derived(domainBindingsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      serversQuery.isPending ||
      deploymentsQuery.isPending ||
      domainBindingsQuery.isPending,
  );
  const resource = $derived(findResource(resources, resourceId));
  const project = $derived(resource ? findProject(projects, resource.projectId) : null);
  const environment = $derived(
    resource ? findEnvironment(environments, resource.environmentId) : null,
  );
  const latestDeployment = $derived(
    resource ? deployments.find((deployment) => deployment.resourceId === resource.id) : null,
  );
  const resourceDeployments = $derived(
    resource ? deployments.filter((deployment) => deployment.resourceId === resource.id) : [],
  );
  const resourceDomainBindings = $derived(
    resource ? domainBindings.filter((binding) => binding.resourceId === resource.id) : [],
  );
  const defaultDestinationId = $derived(
    resource?.destinationId ?? latestDeployment?.destinationId ?? "",
  );

  let serverId = $state("");
  let destinationId = $state("");
  let domainName = $state("");
  let pathPrefix = $state("/");
  let proxyKind = $state<CreateDomainBindingInput["proxyKind"]>("traefik");
  let tlsMode = $state<NonNullable<CreateDomainBindingInput["tlsMode"]>>("auto");
  let certificatePolicy = $state<NonNullable<CreateDomainBindingInput["certificatePolicy"]>>(
    "auto",
  );
  let createFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);

  const selectedServer = $derived(findServer(servers, serverId));
  const canCreateBinding = $derived(
    Boolean(
      resource &&
        serverId &&
        destinationId &&
        domainName.trim() &&
        pathPrefix.trim() &&
        proxyKind !== "none",
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

  let defaultedResourceId = $state("");

  $effect(() => {
    if (!browser || !resource) {
      return;
    }

    if (defaultedResourceId === resource.id) {
      return;
    }

    defaultedResourceId = resource.id;
    destinationId = defaultDestinationId;
  });

  $effect(() => {
    if (!browser || serverId) {
      return;
    }

    serverId = latestDeployment?.serverId ?? servers[0]?.id ?? "";
  });

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
      certificatePolicy,
    });
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
</script>

<svelte:head>
  <title>{resource?.name ?? $t(i18nKeys.console.resources.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={resource?.name ?? $t(i18nKeys.console.resources.pageTitle)}
  description={$t(i18nKeys.console.resources.detailDescription)}
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
    <section class="rounded-lg border bg-background p-6 md:p-8">
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
    <div class="space-y-5">
      <section class="rounded-lg border bg-background p-5">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{$t(i18nKeys.common.domain.resource)}</Badge>
              <Badge variant="secondary">{resource.kind}</Badge>
              {#if resource.lastDeploymentStatus}
                <Badge variant={deploymentBadgeVariant(resource.lastDeploymentStatus)}>
                  {resource.lastDeploymentStatus}
                </Badge>
              {/if}
            </div>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold md:text-3xl">{resource.name}</h1>
              <p class="text-sm leading-6 text-muted-foreground">
                {resource.description ?? $t(i18nKeys.console.projects.noDescription)}
              </p>
            </div>
            <p class="text-xs text-muted-foreground">
              {project?.name ?? resource.projectId} · {environment?.name ?? resource.environmentId}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            {#if project}
              <Button href={`/projects/${project.id}`} variant="outline">
                <ArrowLeft class="size-4" />
                {$t(i18nKeys.common.actions.openProject)}
              </Button>
            {/if}
            <Button href={`/deployments?projectId=${resource.projectId}`} variant="outline">
              {$t(i18nKeys.common.actions.viewDeployments)}
              <ArrowRight class="size-4" />
            </Button>
          </div>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Boxes class="size-4" />
              {$t(i18nKeys.common.domain.deployments)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{resourceDeployments.length}</p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe2 class="size-4" />
              {$t(i18nKeys.common.domain.domainBindings)}
            </p>
            <p class="mt-2 text-2xl font-semibold">{resourceDomainBindings.length}</p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Server class="size-4" />
              {$t(i18nKeys.common.domain.server)}
            </p>
            <p class="mt-2 truncate font-semibold">
              {(selectedServer?.name ?? latestDeployment?.serverId ?? serverId) || "-"}
            </p>
          </div>
          <div class="rounded-md border px-4 py-3">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <Route class="size-4" />
              {$t(i18nKeys.common.domain.destination)}
            </p>
            <p class="mt-2 truncate font-semibold">
              {(resource.destinationId ?? latestDeployment?.destinationId ?? destinationId) || "-"}
            </p>
          </div>
        </div>
      </section>

      <section class="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section class="rounded-lg border bg-background p-5">
          <div class="flex items-start gap-3">
            <div class="rounded-md border bg-muted p-2">
              <Plus class="size-4" />
            </div>
            <div>
              <h2 class="text-lg font-semibold">
                {$t(i18nKeys.console.domainBindings.resourceScopedTitle)}
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.domainBindings.resourceScopedDescription)}
              </p>
            </div>
          </div>

          <form class="mt-5 space-y-4" onsubmit={createResourceDomainBinding}>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-md border px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.project)}</p>
                <p class="mt-1 truncate text-sm font-medium">{project?.name ?? resource.projectId}</p>
              </div>
              <div class="rounded-md border px-3 py-2">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.common.domain.environment)}
                </p>
                <p class="mt-1 truncate text-sm font-medium">
                  {environment?.name ?? resource.environmentId}
                </p>
              </div>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.server)}</span>
                <select
                  bind:value={serverId}
                  class="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {#if servers.length === 0}
                    <option value="">{$t(i18nKeys.console.domainBindings.noServerOptions)}</option>
                  {/if}
                  {#each servers as server (server.id)}
                    <option value={server.id}>{server.name}</option>
                  {/each}
                </select>
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.destination)}</span>
                <Input
                  bind:value={destinationId}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.domainBindings.formDestinationPlaceholder)}
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.domainName)}</span>
                <Input
                  bind:value={domainName}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.domainBindings.formDomainPlaceholder)}
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.pathPrefix)}</span>
                <Input bind:value={pathPrefix} autocomplete="off" placeholder="/" />
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.proxy)}</span>
                <select
                  bind:value={proxyKind}
                  class="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="traefik">traefik</option>
                  <option value="caddy">caddy</option>
                </select>
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.tls)}</span>
                <select
                  bind:value={tlsMode}
                  class="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="auto">auto</option>
                  <option value="disabled">disabled</option>
                </select>
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

            <Button type="submit" disabled={!canCreateBinding || createDomainBindingMutation.isPending}>
              <Globe2 class="size-4" />
              {createDomainBindingMutation.isPending
                ? $t(i18nKeys.console.domainBindings.formSubmitting)
                : $t(i18nKeys.console.domainBindings.formSubmit)}
            </Button>
          </form>
        </section>

        <section class="rounded-lg border bg-background p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold">
                {$t(i18nKeys.console.resources.domainBindingsTitle)}
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.resources.domainBindingsDescription)}
              </p>
            </div>
            <Button href="/domain-bindings" variant="outline">
              {$t(i18nKeys.common.domain.domainBindings)}
              <ArrowRight class="size-4" />
            </Button>
          </div>

          <div class="mt-4 space-y-3">
            {#if resourceDomainBindings.length > 0}
              {#each resourceDomainBindings as binding (binding.id)}
                {@const server = findServer(servers, binding.serverId)}
                <article class="rounded-md border px-4 py-3">
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
                        {binding.pathPrefix} · {binding.proxyKind} · {$t(i18nKeys.common.domain.tls)}
                        {" "}
                        {binding.tlsMode}
                      </p>
                    </div>
                    <p class="text-xs text-muted-foreground">{formatTime(binding.createdAt)}</p>
                  </div>
                  <div class="mt-3 grid gap-3 sm:grid-cols-3">
                    <div class="rounded-md border bg-background px-3 py-2">
                      <p class="text-xs text-muted-foreground">
                        {$t(i18nKeys.common.domain.server)}
                      </p>
                      <p class="mt-1 truncate text-sm font-medium">
                        {server?.name ?? binding.serverId}
                      </p>
                    </div>
                    <div class="rounded-md border bg-background px-3 py-2">
                      <p class="text-xs text-muted-foreground">
                        {$t(i18nKeys.common.domain.destination)}
                      </p>
                      <p class="mt-1 truncate text-sm font-medium">{binding.destinationId}</p>
                    </div>
                    <div class="rounded-md border bg-background px-3 py-2">
                      <p class="text-xs text-muted-foreground">
                        {$t(i18nKeys.console.domainBindings.verificationAttempts, {
                          count: binding.verificationAttemptCount,
                        })}
                      </p>
                      <p class="mt-1 truncate text-sm font-medium">{binding.certificatePolicy}</p>
                    </div>
                  </div>
                </article>
              {/each}
            {:else}
              <div class="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                {$t(i18nKeys.console.resources.noDomainBindings)}
              </div>
            {/if}
          </div>
        </section>
      </section>
    </div>
  {/if}
</ConsoleShell>

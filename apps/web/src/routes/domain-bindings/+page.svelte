<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { Globe2 } from "@lucide/svelte";
  import type { DomainBindingSummary } from "@appaloft/contracts";

  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DomainBindingVerifyDnsButton from "$lib/components/console/DomainBindingVerifyDnsButton.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    findEnvironment,
    findProject,
    findResource,
    formatTime,
    hrefWithSearchParams,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const {
    projectsQuery,
    environmentsQuery,
    resourcesQuery,
    domainBindingsQuery,
  } = createConsoleQueries(browser, {
    health: false,
    readiness: false,
    version: false,
    deployments: false,
    servers: false,
    previewEnvironments: false,
    certificates: false,
    providers: false,
  });

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const domainBindings = $derived(domainBindingsQuery.data?.items ?? []);
  const allProjectsFilterValue = "__all_projects__";
  const domainBindingsLoading = $derived(domainBindingsQuery.isPending);
  const domainBindingEnrichmentLoading = $derived(
    projectsQuery.isPending || environmentsQuery.isPending || resourcesQuery.isPending,
  );

  let projectFilter = $state("");
  let lifecycleFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);

  const selectedProjectFilter = $derived(
    projectFilter ? findProject(projects, projectFilter) : null,
  );
  const projectFilterSelectValue = $derived(projectFilter || allProjectsFilterValue);
  const visibleDomainBindings = $derived.by(() =>
    projectFilter
      ? domainBindings.filter((binding) => binding.projectId === projectFilter)
      : domainBindings,
  );

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

  function selectProjectFilter(value: string): void {
    projectFilter = value === allProjectsFilterValue ? "" : value;
  }

  function domainBindingDetailHref(binding: DomainBindingSummary): string {
    return `/domain-bindings/${encodeURIComponent(binding.id)}`;
  }

  function domainBindingConfigureDnsHref(
    binding: DomainBindingSummary,
    resource: ReturnType<typeof findResource>,
  ): string {
    const params = new URLSearchParams({
      tab: "networking",
      section: "domains",
      dnsBindingId: binding.id,
    });
    const resourceHref = resource
      ? resourceDetailHref(resource)
      : `/resources/${encodeURIComponent(binding.resourceId)}`;
    return hrefWithSearchParams(resourceHref, params);
  }

  function domainBindingNeedsDnsConfiguration(binding: DomainBindingSummary): boolean {
    if (binding.status !== "pending_verification") {
      return false;
    }

    const dnsStatus = binding.dnsObservation?.status;
    return dnsStatus !== "matched" && dnsStatus !== "skipped";
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.domainBindings.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.domainBindings.pageTitle)}
  description={$t(i18nKeys.console.domainBindings.pageDescription)}
>
  <ConsoleResourceCanvas data-domain-bindings-display-surface>
    {#if domainBindingsLoading}
      <section class="space-y-6" data-domain-binding-list-skeleton>
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <Skeleton class="h-8 w-40" />
                <Skeleton class="size-5 rounded-full" />
              </div>
              <Skeleton class="h-4 w-72 max-w-full" />
            </div>
          </div>
        </div>
      </section>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <Skeleton class="h-9 w-44 rounded-md" />
        <Skeleton class="h-4 w-72 max-w-full" />
      </div>

      <section class="space-y-4">
        <div class="console-record-list">
          {#each Array.from({ length: 2 }) as _, index (index)}
            <article class="console-record-row p-0">
              <div class="block min-w-0 space-y-3 p-4">
                <div
                  class={[
                    "flex min-w-0 flex-wrap items-center gap-2",
                    index === 1 ? "lg:pr-64" : "",
                  ]}
                >
                  <Skeleton class="size-4 shrink-0 rounded-sm" />
                  <Skeleton class="h-5 w-48 max-w-full" />
                  <Skeleton class="h-5 w-16 rounded-sm" />
                </div>
                <div class="grid gap-2 md:grid-cols-3">
                  {#each Array.from({ length: 3 }) as _, cardIndex (`${index}-${cardIndex}`)}
                    <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      <Skeleton class="h-3 w-16" />
                      <Skeleton class="mt-2 h-4 w-32 max-w-full" />
                    </div>
                  {/each}
                </div>
                <Skeleton class="h-4 w-80 max-w-full" />
                {#if index === 1}
                  <div class="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                    <Skeleton class="h-4 w-32" />
                    <Skeleton class="mt-2 h-3 w-96 max-w-full" />
                  </div>
                {/if}
              </div>
              {#if index === 1}
                <div class="z-10 flex p-4 pt-0 lg:absolute lg:right-4 lg:top-4 lg:p-0">
                  <Skeleton class="h-9 w-40 rounded-md" />
                </div>
              {/if}
            </article>
          {/each}
        </div>
      </section>
    {:else}
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
        <section class="space-y-4">
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
                <article class="console-record-row p-0" data-domain-binding-row>
                  <a
                    class="block min-w-0 space-y-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={domainBindingDetailHref(binding)}
                  >
                    <div
                      class={[
                        "flex min-w-0 flex-wrap items-center gap-2",
                        binding.status === "pending_verification" ? "lg:pr-96" : "",
                      ]}
                    >
                      <Globe2 class="size-4 shrink-0 text-muted-foreground" />
                      <h3 class="truncate font-medium">{binding.domainName}</h3>
                      <Badge variant={domainBindingStatusVariant(binding.status)}>
                        {domainBindingStatusLabel(binding.status)}
                      </Badge>
                    </div>
                    <div class="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                      <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                        <p class="uppercase tracking-wide">
                          {$t(i18nKeys.common.domain.project)}
                        </p>
                        <p class="mt-1 truncate font-medium text-foreground">
                          {project?.name ?? binding.projectId}
                        </p>
                      </div>
                      <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                        <p class="uppercase tracking-wide">
                          {$t(i18nKeys.common.domain.environment)}
                        </p>
                        <p class="mt-1 truncate font-medium text-foreground">
                          {environment?.name ?? binding.environmentId}
                        </p>
                      </div>
                      <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
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
                    {#if binding.status === "pending_verification"}
                      <div
                        class="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
                        data-domain-binding-pending-dns-notice
                      >
                        <p class="font-medium text-foreground">
                          {$t(i18nKeys.console.domainBindings.pendingDnsNoticeTitle)}
                        </p>
                        <p class="mt-1 text-muted-foreground">
                          {$t(i18nKeys.console.domainBindings.pendingDnsNoticeBody)}
                        </p>
                      </div>
                    {/if}
                  </a>
                  {#if binding.status === "pending_verification"}
                    <div class="z-10 flex flex-wrap gap-2 p-4 pt-0 lg:absolute lg:right-4 lg:top-4 lg:max-w-80 lg:justify-end lg:p-0">
                      <DomainBindingVerifyDnsButton
                        {binding}
                        variant="default"
                        onFeedback={(feedback) => {
                          lifecycleFeedback = feedback;
                        }}
                      />
                      {#if domainBindingNeedsDnsConfiguration(binding)}
                        <Button
                          href={domainBindingConfigureDnsHref(binding, resource)}
                          size="sm"
                          variant="outline"
                        >
                          <Globe2 class="size-4" />
                          {$t(i18nKeys.console.domainBindings.dnsConnectorConfigure)}
                        </Button>
                      {/if}
                    </div>
                  {/if}
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
        </section>
      {/if}
    {/if}
  </ConsoleResourceCanvas>
</ConsoleShell>

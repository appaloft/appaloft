<script lang="ts">
  import { browser } from "$app/environment";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import { Settings2, ShieldCheck } from "@lucide/svelte";
  import type { PreviewPolicyScope, PreviewPolicySettings } from "@appaloft/contracts";

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
  import { findProject, findResource, formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type ScopeKind = PreviewPolicyScope["kind"];
  type ForkMode = PreviewPolicySettings["forkPreviews"];
  type Feedback = {
    kind: "success" | "error";
    title: string;
    detail: string;
  };

  const forkModes: ForkMode[] = ["disabled", "without-secrets", "with-secrets"];
  const { projectsQuery, resourcesQuery } = createConsoleQueries(browser, {
    health: false,
    readiness: false,
    version: false,
    consoleOverview: false,
    authSession: false,
    servers: false,
    environments: false,
    deployments: false,
    previewEnvironments: false,
    domainBindings: false,
    certificates: false,
    providers: false,
  });

  let selectedScopeKind = $state<ScopeKind>("project");
  let selectedProjectId = $state("");
  let selectedResourceId = $state("");
  let sameRepositoryPreviews = $state(true);
  let forkPreviews = $state<ForkMode>("disabled");
  let secretBackedPreviews = $state(true);
  let maxActivePreviews = $state("");
  let previewTtlHours = $state("");
  let policyReadbackSource = $state("");
  let feedback = $state<Feedback | null>(null);

  const projects = $derived(projectsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const projectResources = $derived(
    resources.filter((resource) => resource.projectId === selectedProjectId),
  );
  const selectedProject = $derived(findProject(projects, selectedProjectId));
  const selectedResource = $derived(findResource(resources, selectedResourceId));
  const canReadPolicy = $derived(
    Boolean(browser && selectedProjectId) &&
      (selectedScopeKind === "project" || Boolean(selectedResourceId)),
  );
  const pageLoading = $derived(projectsQuery.isPending || resourcesQuery.isPending);

  function scopeForRequest(): PreviewPolicyScope {
    if (selectedScopeKind === "resource") {
      return {
        kind: "resource",
        projectId: selectedProjectId,
        resourceId: selectedResourceId,
      };
    }

    return {
      kind: "project",
      projectId: selectedProjectId,
    };
  }

  function parsePositiveInteger(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  function forkModeLabelKey(mode: ForkMode) {
    if (mode === "with-secrets") {
      return i18nKeys.console.previewPolicies.forkModeWithSecrets;
    }

    if (mode === "without-secrets") {
      return i18nKeys.console.previewPolicies.forkModeWithoutSecrets;
    }

    return i18nKeys.console.previewPolicies.forkModeDisabled;
  }

  const previewPolicyQuery = createQuery(() =>
    queryOptions({
      queryKey: ["preview-policies", "show", selectedScopeKind, selectedProjectId, selectedResourceId],
      queryFn: () => orpcClient.previewPolicies.show({ scope: scopeForRequest() }),
      enabled: canReadPolicy,
      staleTime: 5_000,
      retry: 0,
    }),
  );
  const configurePreviewPolicyMutation = createMutation(() => ({
    mutationFn: (input: { scope: PreviewPolicyScope; policy: PreviewPolicySettings }) =>
      orpcClient.previewPolicies.configure(input),
    onSuccess: (result) => {
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.previewPolicies.policySaved),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["preview-policies"] });
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.previewPolicies.policySaveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  $effect(() => {
    if (selectedProjectId || projects.length === 0) {
      return;
    }

    selectedProjectId = projects[0]?.id ?? "";
  });

  $effect(() => {
    if (selectedScopeKind !== "resource") {
      selectedResourceId = "";
      return;
    }

    if (selectedResourceId && projectResources.some((resource) => resource.id === selectedResourceId)) {
      return;
    }

    selectedResourceId = projectResources[0]?.id ?? "";
  });

  $effect(() => {
    const readback = previewPolicyQuery.data;
    if (!readback) {
      return;
    }

    const policy = readback.policy;
    const source = `${policy.scope.kind}:${policy.scope.projectId}:${"resourceId" in policy.scope ? policy.scope.resourceId : ""}:${policy.source}:${policy.updatedAt ?? "default"}`;
    if (policyReadbackSource === source) {
      return;
    }

    sameRepositoryPreviews = policy.settings.sameRepositoryPreviews;
    forkPreviews = policy.settings.forkPreviews;
    secretBackedPreviews = policy.settings.secretBackedPreviews;
    maxActivePreviews = policy.settings.maxActivePreviews?.toString() ?? "";
    previewTtlHours = policy.settings.previewTtlHours?.toString() ?? "";
    policyReadbackSource = source;
  });

  function submitPolicy(event: SubmitEvent): void {
    event.preventDefault();

    if (!canReadPolicy) {
      return;
    }

    configurePreviewPolicyMutation.mutate({
      scope: scopeForRequest(),
      policy: {
        sameRepositoryPreviews,
        forkPreviews,
        secretBackedPreviews,
        ...(parsePositiveInteger(maxActivePreviews)
          ? { maxActivePreviews: parsePositiveInteger(maxActivePreviews) }
          : {}),
        ...(parsePositiveInteger(previewTtlHours)
          ? { previewTtlHours: parsePositiveInteger(previewTtlHours) }
          : {}),
      },
    });
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.previewPolicies.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.previewPolicies.pageTitle)}
  description={$t(i18nKeys.console.previewPolicies.pageDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.previewPolicies.pageTitle) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-5 w-48" />
      <Skeleton class="h-40 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>
  {:else if projects.length === 0}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">
        {$t(i18nKeys.console.previewPolicies.projectScope)}
      </Badge>
      <div class="max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.previewPolicies.emptyProjectsTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.previewPolicies.emptyProjectsBody)}
        </p>
      </div>
      <Button href="/projects" size="lg" variant="outline">
        {$t(i18nKeys.common.actions.viewProjects)}
      </Button>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="console-panel space-y-4 p-5">
        <div class="max-w-3xl space-y-1">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">
              {$t(i18nKeys.console.previewPolicies.scopeTitle)}
            </h2>
            <DocsHelpLink
              href={webDocsHrefs.productGradePreviews}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.previewPolicies.scopeDescription)}
          </p>
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <label class="space-y-1.5 text-sm font-medium">
            {$t(i18nKeys.console.previewPolicies.selectProjectLabel)}
            <Select.Root bind:value={selectedProjectId} type="single">
              <Select.Trigger class="w-full">
                {selectedProject?.name ?? selectedProjectId}
              </Select.Trigger>
              <Select.Content>
                {#each projects as project (project.id)}
                  <Select.Item value={project.id}>{project.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>

          <label class="space-y-1.5 text-sm font-medium">
            {$t(i18nKeys.console.previewPolicies.selectScopeLabel)}
            <Select.Root bind:value={selectedScopeKind} type="single">
              <Select.Trigger class="w-full">
                {selectedScopeKind === "resource"
                  ? $t(i18nKeys.console.previewPolicies.resourceScope)
                  : $t(i18nKeys.console.previewPolicies.projectScope)}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="project">
                  {$t(i18nKeys.console.previewPolicies.projectScope)}
                </Select.Item>
                <Select.Item value="resource">
                  {$t(i18nKeys.console.previewPolicies.resourceScope)}
                </Select.Item>
              </Select.Content>
            </Select.Root>
          </label>

          {#if selectedScopeKind === "resource"}
            <label class="space-y-1.5 text-sm font-medium">
              {$t(i18nKeys.console.previewPolicies.selectResourceLabel)}
              <Select.Root bind:value={selectedResourceId} type="single">
                <Select.Trigger class="w-full">
                  {selectedResource?.name ?? selectedResourceId}
                </Select.Trigger>
                <Select.Content>
                  {#each projectResources as resource (resource.id)}
                    <Select.Item value={resource.id}>{resource.name}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </label>
          {/if}
        </div>
      </section>

      <section class="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div class="console-panel space-y-4 p-5">
          <div class="max-w-3xl space-y-1">
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-semibold">
                {$t(i18nKeys.console.previewPolicies.readbackTitle)}
              </h2>
              <ShieldCheck class="size-4 text-muted-foreground" />
            </div>
            <p class="text-sm text-muted-foreground">
              {$t(i18nKeys.console.previewPolicies.readbackDescription)}
            </p>
          </div>

          {#if previewPolicyQuery.isPending}
            <div class="space-y-2">
              <Skeleton class="h-5 w-28" />
              <Skeleton class="h-5 w-40" />
            </div>
          {:else if previewPolicyQuery.error}
            <p class="text-sm text-destructive">
              {$t(i18nKeys.console.previewPolicies.policyReadFailed)}
            </p>
          {:else if previewPolicyQuery.data}
            <div class="space-y-3 text-sm">
              <div>
                <p class="text-muted-foreground">
                  {$t(i18nKeys.console.previewPolicies.sourceLabel)}
                </p>
                <p class="mt-1 font-medium">
                  {previewPolicyQuery.data.policy.source === "configured"
                    ? $t(i18nKeys.console.previewPolicies.configuredSource)
                    : $t(i18nKeys.console.previewPolicies.defaultSource)}
                </p>
              </div>
              <div>
                <p class="text-muted-foreground">
                  {$t(i18nKeys.console.previewPolicies.forkModeLabel)}
                </p>
                <p class="mt-1 font-medium">
                  {$t(forkModeLabelKey(previewPolicyQuery.data.policy.settings.forkPreviews))}
                </p>
              </div>
              <div>
                <p class="text-muted-foreground">
                  {$t(i18nKeys.console.previewPolicies.updatedAt)}
                </p>
                <p class="mt-1 font-medium">
                  {previewPolicyQuery.data.policy.updatedAt
                    ? formatTime(previewPolicyQuery.data.policy.updatedAt)
                    : "-"}
                </p>
              </div>
            </div>
          {/if}
        </div>

        <section class="console-panel space-y-4 p-5">
          <div class="max-w-3xl space-y-1">
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-semibold">
                {$t(i18nKeys.console.previewPolicies.formTitle)}
              </h2>
              <Settings2 class="size-4 text-muted-foreground" />
            </div>
            <p class="text-sm text-muted-foreground">
              {$t(i18nKeys.console.previewPolicies.formDescription)}
            </p>
          </div>

          <form class="space-y-4" onsubmit={submitPolicy}>
            <div class="grid gap-3 md:grid-cols-2">
              <label class="flex items-center gap-2 text-sm font-medium">
                <input
                  class="size-4 rounded border-border"
                  type="checkbox"
                  bind:checked={sameRepositoryPreviews}
                />
                {$t(i18nKeys.console.previewPolicies.sameRepositoryPreviewsLabel)}
              </label>
              <label class="flex items-center gap-2 text-sm font-medium">
                <input
                  class="size-4 rounded border-border"
                  type="checkbox"
                  bind:checked={secretBackedPreviews}
                />
                {$t(i18nKeys.console.previewPolicies.secretBackedPreviewsLabel)}
              </label>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <label class="space-y-1.5 text-sm font-medium">
                {$t(i18nKeys.console.previewPolicies.forkModeLabel)}
                <Select.Root bind:value={forkPreviews} type="single">
                  <Select.Trigger class="w-full">
                    {$t(forkModeLabelKey(forkPreviews))}
                  </Select.Trigger>
                  <Select.Content>
                    {#each forkModes as mode (mode)}
                      <Select.Item value={mode}>{$t(forkModeLabelKey(mode))}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                {$t(i18nKeys.console.previewPolicies.maxActivePreviewsLabel)}
                <Input
                  bind:value={maxActivePreviews}
                  inputmode="numeric"
                  placeholder={$t(i18nKeys.console.previewPolicies.noLimitPlaceholder)}
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                {$t(i18nKeys.console.previewPolicies.previewTtlHoursLabel)}
                <Input
                  bind:value={previewTtlHours}
                  inputmode="numeric"
                  placeholder={$t(i18nKeys.console.previewPolicies.noLimitPlaceholder)}
                />
              </label>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <Button disabled={!canReadPolicy || configurePreviewPolicyMutation.isPending} type="submit">
                {configurePreviewPolicyMutation.isPending
                  ? $t(i18nKeys.common.actions.saving)
                  : $t(i18nKeys.common.actions.save)}
              </Button>
              <Button href="/preview-environments" variant="outline">
                {$t(i18nKeys.console.nav.previewEnvironments)}
              </Button>
            </div>
          </form>

          {#if feedback}
            <div
              class={`rounded-md border p-3 text-sm ${feedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
            >
              <p class="font-medium">{feedback.title}</p>
              <p class="mt-1 text-muted-foreground">{feedback.detail}</p>
            </div>
          {/if}
        </section>
      </section>
    </div>
  {/if}
</ConsoleShell>

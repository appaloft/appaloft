<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import { ArrowLeft, GitPullRequestArrow, Trash2 } from "@lucide/svelte";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { formatTime, resourceDetailHref } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type Feedback = {
    kind: "success" | "error";
    title: string;
    detail: string;
  };

  let feedback = $state<Feedback | null>(null);

  const previewEnvironmentId = $derived(page.params.previewEnvironmentId ?? "");
  const previewEnvironmentQuery = createQuery(() =>
    queryOptions({
      queryKey: ["preview-environments", "show", previewEnvironmentId],
      queryFn: () => orpcClient.previewEnvironments.show({ previewEnvironmentId }),
      enabled: browser && previewEnvironmentId.length > 0,
      staleTime: 5_000,
      retry: 0,
    }),
  );
  const previewEnvironment = $derived(previewEnvironmentQuery.data?.previewEnvironment ?? null);
  const cleanupPreviewEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: { previewEnvironmentId: string; resourceId: string }) =>
      orpcClient.previewEnvironments.delete(input),
    onSuccess: (result) => {
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.previewEnvironments.cleanupSucceeded),
        detail: result.attemptId,
      };
      void queryClient.invalidateQueries({ queryKey: ["preview-environments"] });
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.previewEnvironments.cleanupFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  const statusLabelKey = $derived(
    previewEnvironment?.status === "cleanup-requested"
      ? i18nKeys.console.previewEnvironments.statusCleanupRequested
      : i18nKeys.console.previewEnvironments.statusActive,
  );
  const canRequestCleanup = $derived(
    Boolean(previewEnvironment) &&
      previewEnvironment?.status === "active" &&
      !cleanupPreviewEnvironmentMutation.isPending,
  );

  function requestCleanup(): void {
    if (!browser || !previewEnvironment || !canRequestCleanup) {
      return;
    }

    const confirmed = window.confirm(
      $t(i18nKeys.console.previewEnvironments.cleanupConfirm, {
        previewEnvironmentId: previewEnvironment.previewEnvironmentId,
      }),
    );
    if (!confirmed) {
      return;
    }

    cleanupPreviewEnvironmentMutation.mutate({
      previewEnvironmentId: previewEnvironment.previewEnvironmentId,
      resourceId: previewEnvironment.resourceId,
    });
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.previewEnvironments.detailTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.previewEnvironments.detailTitle)}
  description={$t(i18nKeys.console.previewEnvironments.detailDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.previewEnvironments.pageTitle), href: "/preview-environments" },
    { label: previewEnvironmentId },
  ]}
>
  {#if previewEnvironmentQuery.isPending}
    <div class="space-y-5">
      <Skeleton class="h-5 w-56" />
      <Skeleton class="h-32 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>
  {:else if previewEnvironmentQuery.error || !previewEnvironment}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">
        {$t(i18nKeys.common.status.unknown)}
      </Badge>
      <div class="max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.deployments.notFoundTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {previewEnvironmentQuery.error
            ? readErrorMessage(previewEnvironmentQuery.error)
            : $t(i18nKeys.console.deployments.notFoundBody)}
        </p>
      </div>
      <Button href="/preview-environments" size="lg" variant="outline">
        <ArrowLeft class="size-4" />
        {$t(i18nKeys.console.previewEnvironments.pageTitle)}
      </Button>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="max-w-2xl space-y-2">
          <Badge class="console-page-kicker" variant="outline">
            {$t(statusLabelKey)}
          </Badge>
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-semibold">
              {previewEnvironment.previewEnvironmentId}
            </h1>
            <DocsHelpLink
              href={webDocsHrefs.productGradePreviews}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm leading-6 text-muted-foreground">
            {previewEnvironment.source.repositoryFullName}
            #{previewEnvironment.source.pullRequestNumber}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            href={resourceDetailHref({
              id: previewEnvironment.resourceId,
              projectId: previewEnvironment.projectId,
              environmentId: previewEnvironment.environmentId,
            })}
            variant="outline"
          >
            {$t(i18nKeys.common.actions.openResource)}
          </Button>
          <Button
            disabled={!canRequestCleanup}
            onclick={requestCleanup}
            variant={previewEnvironment.status === "cleanup-requested" ? "outline" : "default"}
          >
            <Trash2 class="size-4" />
            {$t(i18nKeys.console.previewEnvironments.cleanupAction)}
          </Button>
        </div>
      </section>

      {#if feedback}
        <div
          class={`rounded-md border p-3 text-sm ${feedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
        >
          <p class="font-medium">{feedback.title}</p>
          <p class="mt-1 text-muted-foreground">{feedback.detail}</p>
        </div>
      {/if}

      <section class="grid gap-4 lg:grid-cols-3">
        <div class="console-panel space-y-3 p-5">
          <div class="flex items-center gap-2">
            <GitPullRequestArrow class="size-4 text-muted-foreground" />
            <h2 class="text-lg font-semibold">
              {$t(i18nKeys.console.previewEnvironments.sourceTitle)}
            </h2>
          </div>
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.console.previewEnvironments.repository)}
              </dt>
              <dd class="mt-1 font-medium">{previewEnvironment.source.repositoryFullName}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.console.previewEnvironments.pullRequest)}
              </dt>
              <dd class="mt-1 font-medium">#{previewEnvironment.source.pullRequestNumber}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.console.previewEnvironments.baseRef)}
              </dt>
              <dd class="mt-1 font-mono text-xs">{previewEnvironment.source.baseRef}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.console.previewEnvironments.headSha)}
              </dt>
              <dd class="mt-1 break-all font-mono text-xs">{previewEnvironment.source.headSha}</dd>
            </div>
          </dl>
        </div>

        <div class="console-panel space-y-3 p-5">
          <h2 class="text-lg font-semibold">
            {$t(i18nKeys.console.previewEnvironments.ownerTitle)}
          </h2>
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.common.domain.project)}
              </dt>
              <dd class="mt-1 break-all font-mono text-xs">{previewEnvironment.projectId}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.common.domain.environment)}
              </dt>
              <dd class="mt-1 break-all font-mono text-xs">{previewEnvironment.environmentId}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.common.domain.resource)}
              </dt>
              <dd class="mt-1 break-all font-mono text-xs">{previewEnvironment.resourceId}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.common.domain.server)}
              </dt>
              <dd class="mt-1 break-all font-mono text-xs">{previewEnvironment.serverId}</dd>
            </div>
          </dl>
        </div>

        <div class="console-panel space-y-3 p-5">
          <h2 class="text-lg font-semibold">
            {$t(i18nKeys.console.previewEnvironments.lifecycleTitle)}
          </h2>
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.common.domain.status)}
              </dt>
              <dd class="mt-1">
                <Badge variant={previewEnvironment.status === "active" ? "default" : "secondary"}>
                  {$t(statusLabelKey)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.common.domain.createdAt)}
              </dt>
              <dd class="mt-1 font-medium">{formatTime(previewEnvironment.createdAt)}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.console.previewEnvironments.updatedAt)}
              </dt>
              <dd class="mt-1 font-medium">{formatTime(previewEnvironment.updatedAt)}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {$t(i18nKeys.console.previewEnvironments.expiresAt)}
              </dt>
              <dd class="mt-1 font-medium">
                {previewEnvironment.expiresAt
                  ? formatTime(previewEnvironment.expiresAt)
                  : $t(i18nKeys.console.previewEnvironments.noExpiry)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <Button onclick={() => goto("/preview-environments")} variant="outline">
        <ArrowLeft class="size-4" />
        {$t(i18nKeys.console.previewEnvironments.pageTitle)}
      </Button>
    </div>
  {/if}
</ConsoleShell>

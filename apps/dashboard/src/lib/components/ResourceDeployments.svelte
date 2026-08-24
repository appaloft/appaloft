<script lang="ts">
  import { Badge } from "@appaloft/ui/badge";
  import { Button } from "@appaloft/ui/button";
  import {
    CheckCircle2,
    GitCommitHorizontal,
    LoaderCircle,
    RefreshCw,
    RotateCcw,
    Server,
    TriangleAlert,
  } from "@lucide/svelte";

  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";
  import type { DashboardRoute } from "$lib/navigation";

  let { route }: { route: Extract<DashboardRoute, { kind: "resource" }> } = $props();

  type DeploymentList = Awaited<ReturnType<typeof dashboardClient.deployments.list>>;
  type Deployment = DeploymentList["items"][number];

  let deployments = $state<Deployment[]>([]);
  let loading = $state(true);
  let error = $state(false);
  let latestRequest = 0;

  const t = (english: string, chinese: string): string =>
    i18n.locale === "zh-CN" ? chinese : english;

  function activityLabel(value?: string): string {
    if (!value) return "—";
    return new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function statusSurface(status: Deployment["status"]): string {
    if (status === "succeeded") {
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    }
    if (status === "failed" || status === "canceled" || status === "interrupted") {
      return "border-destructive/20 bg-destructive/10 text-destructive";
    }
    return "border-primary/20 bg-primary/10 text-primary";
  }

  function applyDeployments(value: DeploymentList): void {
    if (
      value.items.some(
        (deployment) =>
          deployment.projectId !== route.projectId ||
          deployment.environmentId !== route.environmentId ||
          deployment.resourceId !== route.resourceId,
      )
    ) {
      throw new Error("Deployment owner mismatch");
    }
    deployments = value.items;
  }

  async function load(): Promise<void> {
    const request = ++latestRequest;
    loading = true;
    error = false;
    try {
      const value = await dashboardClient.deployments.list({
        projectId: route.projectId,
        resourceId: route.resourceId,
        includeArchived: false,
        limit: 100,
      });
      if (request === latestRequest) applyDeployments(value);
    } catch {
      if (request === latestRequest) {
        deployments = [];
        error = true;
      }
    } finally {
      if (request === latestRequest) loading = false;
    }
  }

  $effect(() => {
    route.projectId;
    route.environmentId;
    route.resourceId;
    void load();
  });
</script>

{#if loading}
  <div
    class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface"
    aria-label={t("Loading deployments", "正在加载部署记录")}
  >
    <LoaderCircle class="size-6 animate-spin text-primary" />
  </div>
{:else if error}
  <section class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center">
    <TriangleAlert class="mx-auto size-6 text-destructive" />
    <h3 class="mt-4 font-semibold">{t("Deployments could not be loaded", "无法加载部署记录")}</h3>
    <p class="mt-2 text-sm text-muted-foreground">
      {t("No deployment state was changed.", "未更改任何部署状态。")}
    </p>
    <Button variant="outline" class="mt-5 h-9 rounded-[9px] shadow-none" onclick={() => void load()}>
      <RefreshCw class="size-4" />{t("Retry", "重试")}
    </Button>
  </section>
{:else}
  <section class="overflow-hidden rounded-[14px] border border-divider bg-surface" data-resource-deployments>
    <div class="flex items-start justify-between gap-4 border-b border-divider p-5">
      <div>
        <h3 class="font-semibold">{t("Deployment history", "部署历史")}</h3>
        <p class="mt-1 text-sm text-muted-foreground">
          {t(
            "Up to 100 active records for this Resource and Environment.",
            "当前资源与环境最多显示 100 条活跃部署记录。",
          )}
        </p>
      </div>
      <Badge variant="secondary" class="shrink-0 rounded-full">{deployments.length}</Badge>
    </div>

    {#if deployments.length === 0}
      <div class="grid min-h-48 place-items-center px-5 text-center">
        <div>
          <GitCommitHorizontal class="mx-auto size-6 text-muted-foreground" />
          <p class="mt-3 text-sm font-medium">{t("No deployments yet", "暂无部署记录")}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {t("The first deployment will appear here.", "首次部署后会在这里显示。")}
          </p>
        </div>
      </div>
    {:else}
      <div class="divide-y divide-divider">
        {#each deployments as deployment (deployment.id)}
          <article class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
            <span
              class={`grid size-9 shrink-0 place-items-center rounded-[10px] ${
                deployment.status === "succeeded"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : deployment.status === "failed"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary"
              }`}
            >
              {#if deployment.status === "succeeded"}
                <CheckCircle2 class="size-[18px]" />
              {:else if deployment.status === "failed"}
                <TriangleAlert class="size-[18px]" />
              {:else}
                <RotateCcw class="size-[18px]" />
              {/if}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <code class="truncate text-sm font-medium">{deployment.id}</code>
                <Badge variant="secondary" class={`rounded-full text-[10px] ${statusSurface(deployment.status)}`}>
                  {deployment.status.replaceAll("-", " ")}
                </Badge>
              </div>
              <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{activityLabel(deployment.finishedAt ?? deployment.startedAt ?? deployment.createdAt)}</span>
                {#if deployment.sourceCommitSha}
                  <span class="inline-flex items-center gap-1"><GitCommitHorizontal class="size-3" />{deployment.sourceCommitSha.slice(0, 8)}</span>
                {/if}
                <span class="inline-flex items-center gap-1"><Server class="size-3" />{deployment.target.kind.replaceAll("-", " ")}</span>
              </div>
            </div>
            <span class="shrink-0 text-xs capitalize text-muted-foreground">
              {deployment.triggerKind?.replaceAll("-", " ") ?? t("deploy", "部署")}
            </span>
          </article>
        {/each}
      </div>
    {/if}
  </section>
{/if}

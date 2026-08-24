<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { CheckCircle2, LoaderCircle, RefreshCw, Save, TriangleAlert } from "@lucide/svelte";

  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";
  import type { DashboardRoute } from "$lib/navigation";

  let { route }: { route: Extract<DashboardRoute, { kind: "resource" }> } = $props();

  type ResourceDetail = Awaited<ReturnType<typeof dashboardClient.resources.show>>;
  type RuntimeStrategy =
    | "auto"
    | "dockerfile"
    | "docker-compose"
    | "prebuilt-image"
    | "workspace-commands"
    | "static"
    | "helm";

  let detail = $state<ResourceDetail | undefined>();
  let loading = $state(true);
  let error = $state(false);
  let saving = $state(false);
  let saved = $state(false);
  let strategy = $state<RuntimeStrategy>("auto");
  let installCommand = $state("");
  let buildCommand = $state("");
  let startCommand = $state("");
  let publishDirectory = $state("");
  let latestRequest = 0;

  const t = (english: string, chinese: string): string =>
    i18n.locale === "zh-CN" ? chinese : english;

  function applyDetail(value: ResourceDetail): void {
    if (
      value.resource.projectId !== route.projectId ||
      value.resource.environmentId !== route.environmentId
    ) {
      throw new Error("Resource owner mismatch");
    }
    detail = value;
    strategy = value.runtimeProfile?.strategy ?? "auto";
    installCommand = value.runtimeProfile?.installCommand ?? "";
    buildCommand = value.runtimeProfile?.buildCommand ?? "";
    startCommand = value.runtimeProfile?.startCommand ?? "";
    publishDirectory = value.runtimeProfile?.publishDirectory ?? "";
  }

  async function load(): Promise<void> {
    const request = ++latestRequest;
    loading = true;
    error = false;
    try {
      const value = await dashboardClient.resources.show({ resourceId: route.resourceId });
      if (request === latestRequest) applyDetail(value);
    } catch {
      if (request === latestRequest) error = true;
    } finally {
      if (request === latestRequest) loading = false;
    }
  }

  async function saveRuntime(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!detail || saving) return;
    saving = true;
    saved = false;
    error = false;
    try {
      await dashboardClient.resources.configureRuntime({
        resourceId: route.resourceId,
        runtimeProfile: {
          strategy,
          installCommand: installCommand.trim() || undefined,
          buildCommand: buildCommand.trim() || undefined,
          startCommand: startCommand.trim() || undefined,
          publishDirectory: publishDirectory.trim() || undefined,
          runtimeName: detail.runtimeProfile?.runtimeName,
          dockerfilePath: detail.runtimeProfile?.dockerfilePath,
          dockerComposeFilePath: detail.runtimeProfile?.dockerComposeFilePath,
          buildTarget: detail.runtimeProfile?.buildTarget,
          replicas: detail.runtimeProfile?.replicas,
          healthCheckPath: detail.runtimeProfile?.healthCheckPath,
          healthCheck:
            detail.runtimeProfile?.healthCheck?.type === "http"
              ? {
                  enabled: detail.runtimeProfile.healthCheck.enabled,
                  type: "http",
                  intervalSeconds: detail.runtimeProfile.healthCheck.intervalSeconds,
                  timeoutSeconds: detail.runtimeProfile.healthCheck.timeoutSeconds,
                  retries: detail.runtimeProfile.healthCheck.retries,
                  startPeriodSeconds: detail.runtimeProfile.healthCheck.startPeriodSeconds,
                  http: detail.runtimeProfile.healthCheck.http,
                }
              : undefined,
        },
      });
      saved = true;
      await load();
    } catch {
      error = true;
    } finally {
      saving = false;
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
  <div class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface" aria-label={t("Loading configuration", "正在加载配置")}>
    <LoaderCircle class="size-6 animate-spin text-primary" />
  </div>
{:else if error && !detail}
  <section class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center">
    <TriangleAlert class="mx-auto size-6 text-destructive" />
    <h3 class="mt-4 font-semibold">{t("Configuration could not be loaded", "无法加载配置")}</h3>
    <Button variant="outline" class="mt-5 h-9 rounded-[9px] shadow-none" onclick={() => void load()}>
      <RefreshCw class="size-4" />
      {t("Retry", "重试")}
    </Button>
  </section>
{:else if detail}
  <form class="space-y-4" data-resource-configuration onsubmit={saveRuntime}>
    <section class="rounded-[14px] border border-divider bg-surface p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="font-semibold">{t("Runtime profile", "运行时配置")}</h3>
          <p class="mt-1 text-sm text-muted-foreground">{t("Commands and build strategy used by the next deployment.", "下次部署使用的命令与构建策略。")}</p>
        </div>
        {#if saved}
          <span class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 class="size-4" />{t("Saved", "已保存")}
          </span>
        {/if}
      </div>

      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <label class="space-y-2 text-sm font-medium">
          <span>{t("Build strategy", "构建策略")}</span>
          <select bind:value={strategy} class="h-10 w-full rounded-[9px] border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="auto">Auto</option>
            <option value="dockerfile">Dockerfile</option>
            <option value="docker-compose">Docker Compose</option>
            <option value="prebuilt-image">Prebuilt image</option>
            <option value="workspace-commands">Workspace commands</option>
            <option value="static">Static</option>
            <option value="helm">Helm</option>
          </select>
        </label>
        <label class="space-y-2 text-sm font-medium">
          <span>{t("Publish directory", "发布目录")}</span>
          <input bind:value={publishDirectory} placeholder="dist" class="h-10 w-full rounded-[9px] border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label class="space-y-2 text-sm font-medium sm:col-span-2">
          <span>{t("Install command", "安装命令")}</span>
          <input bind:value={installCommand} placeholder="bun install --frozen-lockfile" class="h-10 w-full rounded-[9px] border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label class="space-y-2 text-sm font-medium sm:col-span-2">
          <span>{t("Build command", "构建命令")}</span>
          <input bind:value={buildCommand} placeholder="bun run build" class="h-10 w-full rounded-[9px] border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label class="space-y-2 text-sm font-medium sm:col-span-2">
          <span>{t("Start command", "启动命令")}</span>
          <input bind:value={startCommand} placeholder="bun run start" class="h-10 w-full rounded-[9px] border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
      </div>

      {#if error}
        <p class="mt-4 rounded-[9px] border border-destructive/20 bg-destructive/[0.04] px-3 py-2 text-xs text-destructive">
          {t("The runtime profile was not saved. Review the values and try again.", "运行时配置未保存，请检查后重试。")}
        </p>
      {/if}
      <div class="mt-5 flex justify-end">
        <Button type="submit" class="h-9 rounded-[9px] px-3 text-xs" disabled={saving}>
          {#if saving}<LoaderCircle class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}
          {saving ? t("Saving", "正在保存") : t("Save runtime profile", "保存运行时配置")}
        </Button>
      </div>
    </section>

    <section class="rounded-[14px] border border-divider bg-surface p-5">
      <h3 class="font-semibold">{t("Source", "来源")}</h3>
      {#if detail.source}
        <div class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><p class="text-xs text-muted-foreground">{t("Kind", "类型")}</p><p class="mt-1 font-medium capitalize">{detail.source.kind.replaceAll("-", " ")}</p></div>
          <div><p class="text-xs text-muted-foreground">{t("Reference", "引用")}</p><p class="mt-1 break-all font-mono text-xs">{detail.source.locator}</p></div>
        </div>
      {:else}
        <p class="mt-3 text-sm text-muted-foreground">{t("No source profile is configured.", "尚未配置来源。")}</p>
      {/if}
    </section>
  </form>
{/if}

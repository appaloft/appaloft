<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { CheckCircle2, Globe2, LoaderCircle, Network, RefreshCw, Save, TriangleAlert } from "@lucide/svelte";

  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";
  import type { DashboardRoute } from "$lib/navigation";

  let { route }: { route: Extract<DashboardRoute, { kind: "resource" }> } = $props();

  type ResourceDetail = Awaited<ReturnType<typeof dashboardClient.resources.show>>;
  type Protocol = "http" | "tcp";
  type Exposure = "none" | "reverse-proxy" | "direct-port";

  let detail = $state<ResourceDetail | undefined>();
  let loading = $state(true);
  let error = $state(false);
  let saving = $state(false);
  let saved = $state(false);
  let internalPort = $state(3000);
  let upstreamProtocol = $state<Protocol>("http");
  let exposureMode = $state<Exposure>("reverse-proxy");
  let hostPort = $state<number | undefined>();
  let generatedAccessMode = $state<"inherit" | "disabled">("inherit");
  let pathPrefix = $state("/");
  let latestRequest = 0;

  const t = (english: string, chinese: string): string =>
    i18n.locale === "zh-CN" ? chinese : english;

  function accessUrl(value: ResourceDetail): string | undefined {
    return (
      value.accessSummary?.latestDurableDomainRoute?.url ??
      value.accessSummary?.latestGeneratedAccessRoute?.url ??
      value.accessSummary?.plannedGeneratedAccessRoute?.url
    );
  }

  function applyDetail(value: ResourceDetail): void {
    if (
      value.resource.projectId !== route.projectId ||
      value.resource.environmentId !== route.environmentId
    ) {
      throw new Error("Resource owner mismatch");
    }
    detail = value;
    internalPort = value.networkProfile?.internalPort ?? 3000;
    upstreamProtocol = value.networkProfile?.upstreamProtocol ?? "http";
    exposureMode = value.networkProfile?.exposureMode ?? "reverse-proxy";
    hostPort = value.networkProfile?.hostPort;
    generatedAccessMode = value.accessProfile?.generatedAccessMode ?? "inherit";
    pathPrefix = value.accessProfile?.pathPrefix ?? "/";
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

  async function saveNetwork(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;
    saving = true;
    saved = false;
    error = false;
    try {
      await dashboardClient.resources.configureNetwork({
        resourceId: route.resourceId,
        networkProfile: {
          internalPort,
          upstreamProtocol,
          exposureMode,
          hostPort: exposureMode === "direct-port" ? hostPort : undefined,
          targetServiceName: detail?.networkProfile?.targetServiceName,
        },
      });
      await dashboardClient.resources.configureAccess({
        resourceId: route.resourceId,
        accessProfile: { generatedAccessMode, pathPrefix: pathPrefix.trim() || "/" },
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
  <div class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface" aria-label={t("Loading networking", "正在加载网络配置")}>
    <LoaderCircle class="size-6 animate-spin text-primary" />
  </div>
{:else if error && !detail}
  <section class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center">
    <TriangleAlert class="mx-auto size-6 text-destructive" />
    <h3 class="mt-4 font-semibold">{t("Networking could not be loaded", "无法加载网络配置")}</h3>
    <Button variant="outline" class="mt-5 h-9 rounded-[9px] shadow-none" onclick={() => void load()}>
      <RefreshCw class="size-4" />{t("Retry", "重试")}
    </Button>
  </section>
{:else if detail}
  <form class="space-y-4" data-resource-networking onsubmit={saveNetwork}>
    <section class="rounded-[14px] border border-divider bg-surface p-5">
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary"><Network class="size-[18px]" /></span>
          <div><h3 class="font-semibold">{t("Service network", "服务网络")}</h3><p class="mt-1 text-sm text-muted-foreground">{t("Connect the runtime port to an explicit exposure mode.", "将运行时端口连接到明确的暴露方式。")}</p></div>
        </div>
        {#if saved}<span class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 class="size-4" />{t("Saved", "已保存")}</span>{/if}
      </div>
      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <label class="space-y-2 text-sm font-medium"><span>{t("Internal port", "内部端口")}</span><input bind:value={internalPort} type="number" min="1" max="65535" required class="h-10 w-full rounded-[9px] border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        <label class="space-y-2 text-sm font-medium"><span>{t("Protocol", "协议")}</span><select bind:value={upstreamProtocol} class="h-10 w-full rounded-[9px] border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="http">HTTP</option><option value="tcp">TCP</option></select></label>
        <label class="space-y-2 text-sm font-medium"><span>{t("Exposure", "暴露方式")}</span><select bind:value={exposureMode} class="h-10 w-full rounded-[9px] border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="none">{t("Internal only", "仅内部")}</option><option value="reverse-proxy">{t("Reverse proxy", "反向代理")}</option><option value="direct-port">{t("Direct port", "直接端口")}</option></select></label>
        {#if exposureMode === "direct-port"}
          <label class="space-y-2 text-sm font-medium"><span>{t("Host port", "主机端口")}</span><input bind:value={hostPort} type="number" min="1" max="65535" required class="h-10 w-full rounded-[9px] border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        {/if}
      </div>
    </section>

    <section class="rounded-[14px] border border-divider bg-surface p-5">
      <div class="flex items-start gap-3"><span class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-icon-cyan text-icon-cyan-foreground"><Globe2 class="size-[18px]" /></span><div><h3 class="font-semibold">{t("Generated access", "生成访问地址")}</h3><p class="mt-1 text-sm text-muted-foreground">{t("Control the default route without changing custom domains.", "控制默认访问路由，不影响自定义域名。")}</p></div></div>
      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <label class="space-y-2 text-sm font-medium"><span>{t("Access mode", "访问模式")}</span><select bind:value={generatedAccessMode} class="h-10 w-full rounded-[9px] border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="inherit">{t("Inherit policy", "继承策略")}</option><option value="disabled">{t("Disabled", "禁用")}</option></select></label>
        <label class="space-y-2 text-sm font-medium"><span>{t("Path prefix", "路径前缀")}</span><input bind:value={pathPrefix} required class="h-10 w-full rounded-[9px] border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      </div>
      {#if accessUrl(detail)}
        <a class="mt-4 inline-flex break-all text-sm font-medium text-primary hover:underline" href={accessUrl(detail)} target="_blank" rel="noreferrer">{accessUrl(detail)}</a>
      {/if}
      {#if error}<p class="mt-4 rounded-[9px] border border-destructive/20 bg-destructive/[0.04] px-3 py-2 text-xs text-destructive">{t("Network changes were not saved.", "网络配置未保存。")}</p>{/if}
      <div class="mt-5 flex justify-end"><Button type="submit" class="h-9 rounded-[9px] px-3 text-xs" disabled={saving}>{#if saving}<LoaderCircle class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}{saving ? t("Saving", "正在保存") : t("Save networking", "保存网络配置")}</Button></div>
    </section>
  </form>
{/if}

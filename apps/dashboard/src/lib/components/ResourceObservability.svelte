<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { Activity, Cpu, Database, LoaderCircle, RefreshCw, ScrollText, TriangleAlert } from "@lucide/svelte";

  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";
  import type { DashboardRoute } from "$lib/navigation";

  let { route }: { route: Extract<DashboardRoute, { kind: "resource" }> } = $props();

  type Logs = Awaited<ReturnType<typeof dashboardClient.resources.logs>>;
  type Rollup = Awaited<ReturnType<typeof dashboardClient.runtimeMonitoring.rollup>>;

  let logs = $state<Logs | undefined>();
  let rollup = $state<Rollup | undefined>();
  let loading = $state(true);
  let error = $state(false);
  let latestRequest = 0;

  const t = (english: string, chinese: string): string =>
    i18n.locale === "zh-CN" ? chinese : english;

  function bytes(value?: number): string {
    if (value === undefined) return "—";
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let amount = value;
    let unit = 0;
    while (Math.abs(amount) >= 1024 && unit < units.length - 1) {
      amount /= 1024;
      unit += 1;
    }
    return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  async function load(): Promise<void> {
    const request = ++latestRequest;
    loading = true;
    error = false;
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 60 * 60 * 1000);
    try {
      const [nextLogs, nextRollup] = await Promise.all([
        dashboardClient.resources.logs({
          resourceId: route.resourceId,
          tailLines: 100,
          follow: false,
        }),
        dashboardClient.runtimeMonitoring.rollup({
          scope: { kind: "resource", resourceId: route.resourceId },
          window: { from: from.toISOString(), to: to.toISOString() },
          bucket: "five-minute",
          includeDeploymentMarkers: true,
          includeTopContributors: false,
        }),
      ]);
      if (request === latestRequest) {
        logs = nextLogs;
        rollup = nextRollup;
      }
    } catch {
      if (request === latestRequest) error = true;
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
  <div class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface" aria-label={t("Loading logs and metrics", "正在加载日志与指标")}>
    <LoaderCircle class="size-6 animate-spin text-primary" />
  </div>
{:else if error}
  <section class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center">
    <TriangleAlert class="mx-auto size-6 text-destructive" />
    <h3 class="mt-4 font-semibold">{t("Observability data could not be loaded", "无法加载可观测数据")}</h3>
    <p class="mt-2 text-sm text-muted-foreground">{t("The runtime provider may not expose logs or retained metrics yet.", "运行时提供方可能尚未提供日志或留存指标。")}</p>
    <Button variant="outline" class="mt-5 h-9 rounded-[9px] shadow-none" onclick={() => void load()}><RefreshCw class="size-4" />{t("Retry", "重试")}</Button>
  </section>
{:else}
  <div class="space-y-4" data-resource-observability>
    <section class="grid gap-3 sm:grid-cols-3">
      <article class="rounded-[14px] border border-divider bg-surface p-4"><div class="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Cpu class="size-4 text-primary" />CPU</div><p class="mt-3 text-xl font-semibold tracking-tight">{rollup?.totals.cpu?.containerCpuPercent === undefined ? "—" : `${rollup.totals.cpu.containerCpuPercent.toFixed(1)}%`}</p><p class="mt-1 text-xs text-muted-foreground">{t("Container utilization", "容器利用率")}</p></article>
      <article class="rounded-[14px] border border-divider bg-surface p-4"><div class="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Database class="size-4 text-icon-purple-foreground" />{t("Memory", "内存")}</div><p class="mt-3 text-xl font-semibold tracking-tight">{bytes(rollup?.totals.memory?.containerUsedBytes ?? rollup?.totals.memory?.usedBytes)}</p><p class="mt-1 text-xs text-muted-foreground">{t("Observed in the last 6 hours", "最近 6 小时观测")}</p></article>
      <article class="rounded-[14px] border border-divider bg-surface p-4"><div class="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Activity class="size-4 text-emerald-600" />{t("Samples", "采样")}</div><p class="mt-3 text-xl font-semibold tracking-tight">{rollup?.series.reduce((count, series) => count + series.points.reduce((total, point) => total + point.sampleCount, 0), 0) ?? 0}</p><p class="mt-1 text-xs text-muted-foreground">{rollup?.freshness ?? t("Unknown freshness", "未知新鲜度")}</p></article>
    </section>

    {#if rollup?.warnings.length || rollup?.sourceErrors.length}
      <section class="rounded-[14px] border border-amber-500/20 bg-amber-500/[0.055] p-4 text-sm">
        <p class="font-medium text-amber-800 dark:text-amber-200">{t("Partial observability", "可观测数据不完整")}</p>
        {#each [...(rollup?.warnings ?? []), ...(rollup?.sourceErrors ?? [])] as warning}
          <p class="mt-1 text-xs text-muted-foreground">{warning.message}</p>
        {/each}
      </section>
    {/if}

    <section class="overflow-hidden rounded-[14px] border border-divider bg-surface">
      <div class="flex items-start justify-between gap-4 border-b border-divider p-5"><div><h3 class="font-semibold">{t("Runtime logs", "运行时日志")}</h3><p class="mt-1 text-sm text-muted-foreground">{t("Latest 100 masked lines. Live streaming starts only when explicitly enabled.", "最近 100 行脱敏日志；仅在明确启用时才开始实时流。")}</p></div><ScrollText class="size-5 text-muted-foreground" /></div>
      {#if !logs || logs.logs.length === 0}
        <div class="grid min-h-40 place-items-center px-5 text-center"><div><ScrollText class="mx-auto size-6 text-muted-foreground" /><p class="mt-3 text-sm font-medium">{t("No runtime logs available", "暂无运行时日志")}</p></div></div>
      {:else}
        <div class="max-h-96 overflow-auto bg-slate-950 p-4 font-mono text-[12px] leading-5 text-slate-200" aria-label={t("Runtime log output", "运行时日志输出")}>
          {#each logs.logs as line, index (`${line.cursor ?? line.sequence ?? index}`)}
            <div class={line.stream === "stderr" ? "text-rose-300" : ""}><span class="select-none text-slate-500">{line.timestamp ? new Date(line.timestamp).toLocaleTimeString(i18n.locale) : "--:--:--"}</span> {line.message}</div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
{/if}

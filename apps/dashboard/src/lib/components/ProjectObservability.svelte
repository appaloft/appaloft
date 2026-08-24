<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { Activity, Cpu, Database, LoaderCircle, MemoryStick, RefreshCw, TriangleAlert } from "@lucide/svelte";
  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";

  let { projectId }: { projectId: string } = $props();
  type Rollup = Awaited<ReturnType<typeof dashboardClient.runtimeMonitoring.rollup>>;
  let data = $state<Rollup>(); let loading = $state(true); let error = $state(false);
  const t = (en: string, zh: string) => i18n.locale === "zh-CN" ? zh : en;
  const number = (value?: number, suffix = "") => value === undefined ? "—" : `${new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 }).format(value)}${suffix}`;
  const bytes = (value?: number) => value === undefined ? "—" : `${new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 }).format(value / 1024 / 1024)} MB`;

  async function load(): Promise<void> {
    loading = true; error = false;
    const to = new Date(); const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    try { data = await dashboardClient.runtimeMonitoring.rollup({ scope: { kind: "project", projectId }, window: { from: from.toISOString(), to: to.toISOString() }, bucket: "hour", signals: ["cpu", "memory", "network"], includeDeploymentMarkers: true, includeTopContributors: true }); }
    catch { data = undefined; error = true; }
    finally { loading = false; }
  }
  $effect(() => { projectId; void load(); });
</script>

<section data-project-observability class="mt-8">
  <div class="flex items-end justify-between gap-4"><div><h2 class="font-semibold">{t("24-hour signal", "24 小时信号")}</h2><p class="mt-1 text-sm text-muted-foreground">{t("Project-scoped runtime totals with bounded hourly buckets.", "Project 范围的运行总量，按小时有界聚合。")}</p></div><Button variant="outline" class="rounded-[9px] shadow-none" onclick={() => void load()}><RefreshCw class="size-4" />{t("Refresh", "刷新")}</Button></div>
  {#if loading}<div class="mt-5 grid min-h-64 place-items-center rounded-[16px] border border-divider bg-surface"><LoaderCircle class="size-6 animate-spin text-primary" /></div>
  {:else if error}<div class="mt-5 rounded-[16px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center"><TriangleAlert class="mx-auto size-6 text-destructive" /><h3 class="mt-4 font-semibold">{t("Observability data could not be loaded", "无法加载可观测数据")}</h3><Button variant="outline" class="mt-5 rounded-[9px] shadow-none" onclick={() => void load()}>{t("Retry", "重试")}</Button></div>
  {:else if data}<div class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><article class="rounded-[16px] border border-divider bg-surface p-5"><Cpu class="size-5 text-primary" /><p class="mt-6 text-2xl font-semibold">{number(data.totals.cpu?.containerCpuPercent, "%")}</p><p class="mt-1 text-xs text-muted-foreground">{t("Container CPU", "容器 CPU")}</p></article><article class="rounded-[16px] border border-divider bg-surface p-5"><MemoryStick class="size-5 text-icon-violet-foreground" /><p class="mt-6 text-2xl font-semibold">{bytes(data.totals.memory?.containerUsedBytes)}</p><p class="mt-1 text-xs text-muted-foreground">{t("Container memory", "容器内存")}</p></article><article class="rounded-[16px] border border-divider bg-surface p-5"><Database class="size-5 text-icon-cyan-foreground" /><p class="mt-6 text-2xl font-semibold">{number(data.topContributors.length)}</p><p class="mt-1 text-xs text-muted-foreground">{t("Measured contributors", "已测贡献者")}</p></article><article class="rounded-[16px] border border-divider bg-surface p-5"><Activity class="size-5 text-emerald-500" /><p class="mt-6 text-2xl font-semibold">{number(data.deploymentMarkers.length)}</p><p class="mt-1 text-xs text-muted-foreground">{t("Deployment markers", "部署标记")}</p></article></div><section class="mt-4 rounded-[16px] border border-divider bg-surface p-5"><div class="flex flex-wrap items-center justify-between gap-3"><div><h3 class="text-sm font-semibold">{t("Collection state", "采集状态")}</h3><p class="mt-1 text-xs text-muted-foreground">{data.from} – {data.to}</p></div><span class={`rounded-full px-2.5 py-1 text-xs font-medium ${data.partial ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{data.partial ? t("Partial", "部分数据") : t("Complete", "完整")}</span></div>{#if !data.series.length}<p class="mt-5 rounded-[12px] bg-muted/60 p-5 text-sm text-muted-foreground">{t("No runtime samples were recorded in this window. The scope is valid and will populate after workloads report metrics.", "该时间窗内没有运行样本；范围有效，工作负载上报指标后会自动显示。")}</p>{/if}</section>{/if}
</section>

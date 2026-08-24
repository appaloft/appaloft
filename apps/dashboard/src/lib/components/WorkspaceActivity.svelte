<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { Activity, CheckCircle2, Clock3, LoaderCircle, RefreshCw, TriangleAlert, XCircle } from "@lucide/svelte";
  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";
  import type { DashboardRoute } from "$lib/navigation";

  let { route }: { route: Extract<DashboardRoute, { kind: "workspace" }> } = $props();
  type ActivityFeed = Awaited<ReturnType<typeof dashboardClient.operatorWork.list>>;
  let data = $state<ActivityFeed>();
  let loading = $state(true);
  let error = $state(false);
  const t = (en: string, zh: string) => i18n.locale === "zh-CN" ? zh : en;
  const time = (value: string) => new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const status = $derived(route.filters.find((value) => ["running", "succeeded", "failed", "canceled", "dead-lettered"].includes(value)) as "running" | "succeeded" | "failed" | "canceled" | "dead-lettered" | undefined);
  const items = $derived((data?.items ?? []).filter((item) => !route.search || `${item.operationKey} ${item.id} ${item.projectId ?? ""} ${item.resourceId ?? ""}`.toLowerCase().includes(route.search.toLowerCase())));

  async function load(): Promise<void> {
    loading = true; error = false;
    try { data = await dashboardClient.operatorWork.list({ limit: 100, ...(status ? { status } : {}) }); }
    catch { data = undefined; error = true; }
    finally { loading = false; }
  }
  $effect(() => { status; void load(); });
</script>

<section data-workspace-activity class="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 lg:py-12">
  <div class="flex items-end justify-between gap-4"><div><p class="text-xs font-medium text-primary">{t("Workspace", "工作区")}</p><h1 class="mt-3 text-3xl font-semibold tracking-[-0.025em]">{t("Activity", "活动")}</h1><p class="mt-2 text-sm text-muted-foreground">{t("Recent operator work across deployments, infrastructure, and maintenance.", "汇总部署、基础设施和维护任务的近期执行记录。")}</p></div><Button variant="outline" class="rounded-[9px] shadow-none" onclick={() => void load()}><RefreshCw class="size-4" />{t("Refresh", "刷新")}</Button></div>
  <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div class="flex flex-wrap gap-2">{#each [{ value: "", label: t("All", "全部") }, { value: "running", label: t("Running", "运行中") }, { value: "failed", label: t("Failed", "失败") }, { value: "succeeded", label: t("Succeeded", "成功") }] as filter}<a class={`rounded-full border px-3 py-1.5 text-xs font-medium ${status === (filter.value || undefined) ? "border-primary/30 bg-primary/10 text-primary" : "border-divider bg-surface text-muted-foreground"}`} href={filter.value ? `/activity?filter=${filter.value}` : "/activity"}>{filter.label}</a>{/each}</div><form action="/activity" method="GET"><input name="search" value={route.search || ""} class="h-9 w-full rounded-[9px] border border-control bg-surface px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15 sm:w-64" placeholder={t("Search activity…", "搜索活动…")} />{#if status}<input type="hidden" name="filter" value={status} />{/if}</form></div>
  {#if loading}<div class="mt-8 grid min-h-64 place-items-center rounded-[16px] border border-divider bg-surface"><LoaderCircle class="size-6 animate-spin text-primary" /></div>
  {:else if error}<div class="mt-8 rounded-[16px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center"><TriangleAlert class="mx-auto size-6 text-destructive" /><h2 class="mt-4 font-semibold">{t("Activity could not be loaded", "无法加载活动")}</h2><Button variant="outline" class="mt-5 rounded-[9px] shadow-none" onclick={() => void load()}>{t("Retry", "重试")}</Button></div>
  {:else if !items.length}<div class="mt-8 rounded-[16px] border border-dashed border-divider bg-surface p-12 text-center"><Activity class="mx-auto size-7 text-primary" /><h2 class="mt-4 font-semibold">{t("Everything is quiet", "当前没有活动")}</h2><p class="mt-2 text-sm text-muted-foreground">{t("No work matches the current URL filters.", "没有活动匹配当前 URL 筛选条件。")}</p></div>
  {:else}<div class="mt-8 overflow-hidden rounded-[16px] border border-divider bg-surface"><div class="divide-y divide-divider">{#each items as item}<article class="grid gap-3 p-5 sm:grid-cols-[40px_minmax(0,1fr)_140px] sm:items-center"><span class={`grid size-10 place-items-center rounded-[11px] ${item.status === "succeeded" ? "bg-emerald-500/10 text-emerald-600" : item.status === "failed" || item.status === "dead-lettered" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{#if item.status === "succeeded"}<CheckCircle2 class="size-[18px]" />{:else if item.status === "failed" || item.status === "dead-lettered"}<XCircle class="size-[18px]" />{:else}<Clock3 class="size-[18px]" />{/if}</span><div class="min-w-0"><p class="truncate text-sm font-medium">{item.operationKey}</p><p class="mt-1 truncate font-mono text-xs text-muted-foreground">{item.id}{item.projectId ? ` · ${item.projectId}` : ""}{item.resourceId ? ` / ${item.resourceId}` : ""}</p></div><div class="sm:text-right"><p class="text-xs font-medium capitalize">{item.status.replaceAll("-", " ")}</p><p class="mt-1 text-xs text-muted-foreground">{time(item.updatedAt)}</p></div></article>{/each}</div></div>{/if}
</section>

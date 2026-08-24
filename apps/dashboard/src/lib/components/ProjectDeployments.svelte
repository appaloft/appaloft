<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { CheckCircle2, Clock3, LoaderCircle, RefreshCw, Rocket, TriangleAlert, XCircle } from "@lucide/svelte";
  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";
  import { resourceDestinationHref } from "$lib/navigation";

  let { projectId, environmentId }: { projectId: string; environmentId: string } = $props();
  type Deployments = Awaited<ReturnType<typeof dashboardClient.deployments.list>>;
  let data = $state<Deployments>(); let loading = $state(true); let error = $state(false);
  const t = (en: string, zh: string) => i18n.locale === "zh-CN" ? zh : en;
  const time = (value: string) => new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const deployments = $derived((data?.items ?? []).filter((item) => item.projectId === projectId && item.environmentId === environmentId));

  async function load(): Promise<void> { loading = true; error = false; try { data = await dashboardClient.deployments.list({ projectId, limit: 100 }); } catch { data = undefined; error = true; } finally { loading = false; } }
  $effect(() => { projectId; environmentId; void load(); });
</script>

<section data-project-deployments class="mt-8 overflow-hidden rounded-[16px] border border-divider bg-surface">
  <div class="flex items-center justify-between gap-4 border-b border-divider p-5 sm:p-6"><div><h2 class="font-semibold">{t("Deployments", "部署")}</h2><p class="mt-1 text-sm text-muted-foreground">{t("The latest 100 deployments for this Project and Environment.", "当前 Project 与 Environment 最近 100 次部署。")}</p></div><Button variant="outline" class="rounded-[9px] shadow-none" onclick={() => void load()}><RefreshCw class="size-4" />{t("Refresh", "刷新")}</Button></div>
  {#if loading}<div class="grid min-h-56 place-items-center"><LoaderCircle class="size-6 animate-spin text-primary" /></div>
  {:else if error}<div class="p-10 text-center"><TriangleAlert class="mx-auto size-6 text-destructive" /><h3 class="mt-4 font-semibold">{t("Deployments could not be loaded", "无法加载部署")}</h3><Button variant="outline" class="mt-5 rounded-[9px] shadow-none" onclick={() => void load()}>{t("Retry", "重试")}</Button></div>
  {:else if !deployments.length}<div class="p-12 text-center"><Rocket class="mx-auto size-7 text-primary" /><h3 class="mt-4 font-semibold">{t("No deployments in this Environment", "当前 Environment 尚无部署")}</h3><p class="mt-2 text-sm text-muted-foreground">{t("Create or open a Resource to start its first deployment.", "创建或打开 Resource 以开始首次部署。")}</p></div>
  {:else}<div class="divide-y divide-divider">{#each deployments as deployment}<a class="grid gap-3 p-5 transition-colors hover:bg-surface-subtle sm:grid-cols-[40px_minmax(0,1fr)_160px_130px] sm:items-center" href={resourceDestinationHref(projectId, deployment.resourceId, "deployments", environmentId)}><span class={`grid size-10 place-items-center rounded-[11px] ${deployment.status === "succeeded" ? "bg-emerald-500/10 text-emerald-600" : deployment.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{#if deployment.status === "succeeded"}<CheckCircle2 class="size-[18px]" />{:else if deployment.status === "failed"}<XCircle class="size-[18px]" />{:else}<Clock3 class="size-[18px]" />{/if}</span><div class="min-w-0"><p class="truncate text-sm font-medium">{deployment.resourceId}</p><p class="mt-1 truncate font-mono text-xs text-muted-foreground">{deployment.id}</p></div><p class="font-mono text-xs text-muted-foreground">{deployment.sourceCommitSha?.slice(0, 8) || "—"}</p><div class="sm:text-right"><p class="text-xs font-medium capitalize">{deployment.status}</p><p class="mt-1 text-[11px] text-muted-foreground">{time(deployment.createdAt)}</p></div></a>{/each}</div>{/if}
</section>

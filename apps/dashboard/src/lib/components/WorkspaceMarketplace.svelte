<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { ArrowUpRight, LoaderCircle, PackageOpen, RefreshCw, Search, Store, TriangleAlert, X } from "@lucide/svelte";
  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";

  type Catalog = Awaited<ReturnType<typeof dashboardClient.blueprints.list>>;
  let data = $state<Catalog>();
  let search = $state("");
  let loading = $state(true);
  let error = $state(false);
  let selected = $state<Catalog["items"][number]>();
  let detail = $state<Awaited<ReturnType<typeof dashboardClient.blueprints.show>>>();
  let detailLoading = $state(false);
  let detailError = $state(false);
  const t = (en: string, zh: string) => i18n.locale === "zh-CN" ? zh : en;
  const filtered = $derived((data?.items ?? []).filter((item) => `${item.name} ${item.summary} ${item.tags.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase())));

  async function load(): Promise<void> {
    loading = true; error = false;
    try { data = await dashboardClient.blueprints.list({}); }
    catch { data = undefined; error = true; }
    finally { loading = false; }
  }
  async function open(item: Catalog["items"][number]): Promise<void> { selected = item; detail = undefined; detailLoading = true; detailError = false; try { detail = await dashboardClient.blueprints.show({ slug: item.id }); } catch { detailError = true; } finally { detailLoading = false; } }
  function retryDetail(): void { if (selected) void open(selected); }
  $effect(() => { void load(); });
</script>

<section data-workspace-marketplace class="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 lg:py-12">
  <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p class="text-xs font-medium text-primary">{t("Workspace", "工作区")}</p><h1 class="mt-3 text-3xl font-semibold tracking-[-0.025em]">{t("Marketplace", "应用市场")}</h1><p class="mt-2 max-w-2xl text-sm text-muted-foreground">{t("Start from a reviewed Blueprint while keeping ownership in the Project flow.", "从经过审核的 Blueprint 开始，并让资源归属保持在 Project 流程内。")}</p></div><label class="relative w-full sm:w-72"><span class="sr-only">{t("Search Blueprints", "搜索 Blueprint")}</span><Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input bind:value={search} class="h-10 w-full rounded-[10px] border border-control bg-surface pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15" placeholder={t("Search Blueprints…", "搜索 Blueprint…")} /></label></div>
  {#if loading}<div class="mt-8 grid min-h-64 place-items-center rounded-[16px] border border-divider bg-surface"><LoaderCircle class="size-6 animate-spin text-primary" /></div>
  {:else if error}<div class="mt-8 rounded-[16px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center"><TriangleAlert class="mx-auto size-6 text-destructive" /><h2 class="mt-4 font-semibold">{t("Marketplace could not be loaded", "无法加载应用市场")}</h2><Button variant="outline" class="mt-5 rounded-[9px] shadow-none" onclick={() => void load()}><RefreshCw class="size-4" />{t("Retry", "重试")}</Button></div>
  {:else if !filtered.length}<div class="mt-8 rounded-[16px] border border-dashed border-divider bg-surface p-12 text-center"><PackageOpen class="mx-auto size-7 text-primary" /><h2 class="mt-4 font-semibold">{search ? t("No matching Blueprints", "没有匹配的 Blueprint") : t("No Blueprints published", "尚未发布 Blueprint")}</h2><p class="mt-2 text-sm text-muted-foreground">{search ? t("Try a broader search.", "尝试更宽泛的搜索词。") : t("Registry entries will appear here when available.", "注册表有内容后会显示在这里。")}</p></div>
  {:else}<div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{#each filtered as item}<article class="flex min-h-64 flex-col rounded-[16px] border border-divider bg-surface p-5"><div class="flex items-start justify-between"><span data-icon-surface="violet" class="grid size-11 place-items-center rounded-[12px] bg-icon-violet text-icon-violet-foreground"><Store class="size-5" /></span><span class="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] text-muted-foreground">v{item.version}</span></div><h2 class="mt-5 font-semibold">{item.name}</h2><p class="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{item.summary}</p><div class="mt-4 flex flex-wrap gap-1.5">{#each item.tags.slice(0, 4) as tag}<span class="rounded-full bg-primary/[0.07] px-2 py-1 text-[11px] text-primary">{tag}</span>{/each}</div><button class="mt-auto inline-flex items-center gap-2 pt-6 text-left text-sm font-medium text-primary hover:underline" onclick={() => void open(item)}>{t("Open Blueprint", "打开 Blueprint")}<ArrowUpRight class="size-4" /></button></article>{/each}</div>{/if}
</section>

{#if selected}<div class="fixed inset-0 z-50 flex justify-end bg-background/40 p-3 backdrop-blur-sm" role="presentation" onclick={(event) => { if (event.currentTarget === event.target) selected = undefined; }}><aside data-blueprint-detail class="h-full w-full max-w-xl overflow-y-auto rounded-[18px] border border-divider bg-surface-overlay p-6 shadow-[var(--shadow-overlay)]"><div class="flex items-start justify-between"><div><p class="text-xs font-medium text-primary">Blueprint</p><h2 class="mt-2 text-xl font-semibold">{selected.name}</h2><p class="mt-2 text-sm text-muted-foreground">{selected.summary}</p></div><button class="grid size-9 place-items-center rounded-[9px] hover:bg-muted" aria-label={t("Close", "关闭")} onclick={() => (selected = undefined)}><X class="size-4" /></button></div>{#if detailLoading}<div class="grid min-h-48 place-items-center"><LoaderCircle class="size-6 animate-spin text-primary" /></div>{:else if detailError}<div class="mt-8 rounded-[14px] border border-destructive/20 p-6 text-center"><TriangleAlert class="mx-auto size-5 text-destructive" /><p class="mt-3 text-sm">{t("Blueprint details could not be loaded.", "无法加载 Blueprint 详情。")}</p><Button variant="outline" class="mt-4 rounded-[9px] shadow-none" onclick={retryDetail}>{t("Retry", "重试")}</Button></div>{:else if detail}<div class="mt-8 space-y-4"><section class="rounded-[14px] border border-divider bg-surface p-5"><h3 class="text-sm font-semibold">{t("Components", "组件")}</h3><div class="mt-4 space-y-3">{#each detail.manifest.components as component}<div class="flex items-center justify-between gap-3"><div><p class="text-sm font-medium">{component.name}</p><p class="mt-1 text-xs text-muted-foreground">{component.kind} · {component.runtime.strategy}</p></div><span class="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{component.ports.length} ports</span></div>{/each}</div></section><section class="rounded-[14px] border border-divider bg-surface p-5"><h3 class="text-sm font-semibold">{t("Requirements", "要求")}</h3><p class="mt-3 text-sm text-muted-foreground">{detail.manifest.parameters.length} parameters · {detail.manifest.secrets.length} secrets · {detail.manifest.resources.length} dependencies</p></section><Button href={`/projects?blueprint=${encodeURIComponent(selected.id)}`} class="w-full rounded-[10px]">{t("Choose a Project", "选择 Project")}<ArrowUpRight class="size-4" /></Button></div>{/if}</aside></div>{/if}

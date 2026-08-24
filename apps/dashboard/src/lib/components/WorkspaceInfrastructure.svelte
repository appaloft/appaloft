<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { CheckCircle2, Database, LoaderCircle, Plus, RefreshCw, Server, TriangleAlert, X } from "@lucide/svelte";

  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";

  type Servers = Awaited<ReturnType<typeof dashboardClient.servers.list>>;
  type Dependencies = Awaited<ReturnType<typeof dashboardClient.dependencyResources.list>>;

  let data = $state<Servers>();
  let dependencies = $state<Dependencies>();
  let loading = $state(true);
  let error = $state(false);
  let createOpen = $state(false);
  let saving = $state(false);
  let createError = $state("");
  let name = $state("");
  let host = $state("");

  const t = (en: string, zh: string) => i18n.locale === "zh-CN" ? zh : en;

  async function load(): Promise<void> {
    loading = true;
    error = false;
    try {
      [data, dependencies] = await Promise.all([
        dashboardClient.servers.list({ limit: 50, offset: 0, runtimeAvailability: "all" }),
        dashboardClient.dependencyResources.list({ limit: 50 }),
      ]);
    } catch {
      data = undefined;
      error = true;
    } finally {
      loading = false;
    }
  }

  async function createServer(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    saving = true;
    createError = "";
    try {
      await dashboardClient.servers.create({
        name: name.trim(),
        host: host.trim(),
        providerKey: "ssh",
        targetKind: "single-server",
        workloadRoles: ["deployment-runtime", "artifact-builder"],
        proxyKind: "caddy",
      });
      createOpen = false;
      name = "";
      host = "";
      await load();
    } catch {
      createError = t("Server registration failed. Check the address and try again.", "服务器注册失败，请检查地址后重试。");
    } finally {
      saving = false;
    }
  }

  $effect(() => { void load(); });
</script>

<section data-workspace-infrastructure class="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 lg:py-12">
  <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div><p class="text-xs font-medium text-primary">{t("Workspace", "工作区")}</p><h1 class="mt-3 text-3xl font-semibold tracking-[-0.025em]">{t("Infrastructure", "基础设施")}</h1><p class="mt-2 max-w-2xl text-sm text-muted-foreground">{t("Deployment targets and their runtime readiness, in one bounded view.", "在一个有界视图中查看部署目标与运行就绪状态。")}</p></div>
    <Button class="h-10 rounded-[10px] shadow-[var(--shadow-primary)]" onclick={() => (createOpen = true)}><Plus class="size-4" />{t("Register server", "注册服务器")}</Button>
  </div>

  {#if loading}<div class="mt-8 grid min-h-64 place-items-center rounded-[16px] border border-divider bg-surface"><LoaderCircle class="size-6 animate-spin text-primary" /></div>
  {:else if error}<div class="mt-8 rounded-[16px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center"><TriangleAlert class="mx-auto size-6 text-destructive" /><h2 class="mt-4 font-semibold">{t("Infrastructure could not be loaded", "无法加载基础设施")}</h2><Button variant="outline" class="mt-5 rounded-[9px] shadow-none" onclick={() => void load()}><RefreshCw class="size-4" />{t("Retry", "重试")}</Button></div>
  {:else if !data?.items.length && !dependencies?.items.length}<div class="mt-8 rounded-[16px] border border-dashed border-divider bg-surface p-12 text-center"><Server class="mx-auto size-7 text-primary" /><h2 class="mt-4 font-semibold">{t("No infrastructure yet", "尚无基础设施")}</h2><p class="mt-2 text-sm text-muted-foreground">{t("Register a server to make deployments available.", "注册服务器后即可开始部署。")}</p></div>
  {:else}<div class="mt-8 grid gap-4 lg:grid-cols-2">{#each data?.items ?? [] as server}<article class="rounded-[16px] border border-divider bg-surface p-5"><div class="flex items-start justify-between gap-4"><span data-icon-surface="cyan" class="grid size-11 place-items-center rounded-[12px] bg-icon-cyan text-icon-cyan-foreground"><Server class="size-5" /></span><span class={`rounded-full px-2.5 py-1 text-xs font-medium ${server.runtimeAvailability?.status === "available" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{server.runtimeAvailability?.status || server.lifecycleStatus}</span></div><h2 class="mt-5 font-semibold">{server.name}</h2><p class="mt-1 font-mono text-xs text-muted-foreground">{server.host}:{server.port}</p><div class="mt-5 flex flex-wrap gap-2">{#each server.workloadRoles as role}<span class="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{role}</span>{/each}</div><div class="mt-5 flex items-center gap-2 border-t border-divider pt-4 text-xs text-muted-foreground"><CheckCircle2 class="size-4 text-emerald-500" />{server.edgeProxy ? `${server.edgeProxy.kind} · ${server.edgeProxy.status}` : t("Proxy not configured", "代理未配置")}</div></article>{/each}</div>
  <section class="mt-10"><div><h2 class="font-semibold">{t("Dependency infrastructure", "依赖基础设施")}</h2><p class="mt-1 text-sm text-muted-foreground">{t("Databases, caches, and externally managed dependencies across Projects.", "跨 Project 的数据库、缓存与外部托管依赖。")}</p></div>{#if !dependencies?.items.length}<div class="mt-4 rounded-[16px] border border-dashed border-divider bg-surface p-8 text-center text-sm text-muted-foreground">{t("No dependency infrastructure is registered.", "尚未注册依赖基础设施。")}</div>{:else}<div class="mt-4 grid gap-4 lg:grid-cols-2">{#each dependencies.items as dependency}<article class="rounded-[16px] border border-divider bg-surface p-5"><div class="flex items-start justify-between"><span data-icon-surface="violet" class="grid size-10 place-items-center rounded-[11px] bg-icon-violet text-icon-violet-foreground"><Database class="size-[18px]" /></span><span class="rounded-full bg-muted px-2.5 py-1 text-xs capitalize text-muted-foreground">{dependency.lifecycleStatus}</span></div><h3 class="mt-4 text-sm font-semibold">{dependency.name}</h3><p class="mt-1 text-xs text-muted-foreground">{dependency.kind} · {dependency.providerKey}</p><p class="mt-4 font-mono text-[11px] text-muted-foreground">{dependency.projectId} / {dependency.environmentId}</p></article>{/each}</div>{/if}</section>{/if}
</section>

{#if createOpen}
  <div class="fixed inset-0 z-50 grid place-items-center bg-background/55 p-4 backdrop-blur-sm" role="presentation" onclick={(event) => { if (event.currentTarget === event.target) createOpen = false; }}>
    <form data-create-server-form class="w-full max-w-md rounded-[18px] border border-divider bg-surface-overlay p-6 shadow-[var(--shadow-overlay)]" onsubmit={createServer}>
      <div class="flex items-start justify-between"><div><h2 class="text-lg font-semibold">{t("Register server", "注册服务器")}</h2><p class="mt-1 text-sm text-muted-foreground">{t("Add an SSH deployment target. Credentials can be attached after registration.", "添加 SSH 部署目标；注册后可继续配置凭据。")}</p></div><button type="button" class="grid size-9 place-items-center rounded-[9px] hover:bg-muted" aria-label={t("Close", "关闭")} onclick={() => (createOpen = false)}><X class="size-4" /></button></div>
      <label class="mt-6 block text-sm font-medium">{t("Name", "名称")}<input bind:value={name} required class="mt-2 h-10 w-full rounded-[9px] border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      <label class="mt-4 block text-sm font-medium">{t("Host", "主机地址")}<input bind:value={host} required placeholder="edge.example.com" class="mt-2 h-10 w-full rounded-[9px] border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      {#if createError}<p class="mt-4 text-sm text-destructive">{createError}</p>{/if}
      <div class="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" class="rounded-[9px] shadow-none" onclick={() => (createOpen = false)}>{t("Cancel", "取消")}</Button><Button type="submit" disabled={saving || !name.trim() || !host.trim()} class="rounded-[9px]">{saving ? t("Registering…", "注册中…") : t("Register", "注册")}</Button></div>
    </form>
  </div>
{/if}

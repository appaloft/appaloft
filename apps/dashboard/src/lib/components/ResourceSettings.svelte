<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "@appaloft/ui/button";
  import { Archive, CheckCircle2, LoaderCircle, RefreshCw, RotateCcw, Trash2, TriangleAlert } from "@lucide/svelte";

  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";
  import { projectDestinationHref, type DashboardRoute } from "$lib/navigation";

  let { route }: { route: Extract<DashboardRoute, { kind: "resource" }> } = $props();

  type ResourceDetail = Awaited<ReturnType<typeof dashboardClient.resources.show>>;
  type DeleteCheck = Awaited<ReturnType<typeof dashboardClient.resources.deleteCheck>>;

  let detail = $state<ResourceDetail | undefined>();
  let deleteCheck = $state<DeleteCheck | undefined>();
  let loading = $state(true);
  let error = $state(false);
  let actionPending = $state(false);
  let actionSuccess = $state("");
  let confirmation = $state("");
  let latestRequest = 0;

  const t = (english: string, chinese: string): string =>
    i18n.locale === "zh-CN" ? chinese : english;

  async function load(): Promise<void> {
    const request = ++latestRequest;
    loading = true;
    error = false;
    try {
      const [nextDetail, nextDeleteCheck] = await Promise.all([
        dashboardClient.resources.show({ resourceId: route.resourceId }),
        dashboardClient.resources.deleteCheck({ resourceId: route.resourceId }),
      ]);
      if (
        nextDetail.resource.projectId !== route.projectId ||
        nextDetail.resource.environmentId !== route.environmentId
      ) {
        throw new Error("Resource owner mismatch");
      }
      if (request === latestRequest) {
        detail = nextDetail;
        deleteCheck = nextDeleteCheck;
      }
    } catch {
      if (request === latestRequest) error = true;
    } finally {
      if (request === latestRequest) loading = false;
    }
  }

  async function toggleArchive(): Promise<void> {
    if (!detail || actionPending) return;
    actionPending = true;
    error = false;
    actionSuccess = "";
    try {
      if (detail.lifecycle.status === "archived") {
        await dashboardClient.resources.restore({ resourceId: route.resourceId });
        actionSuccess = t("Resource restored", "资源已恢复");
      } else {
        await dashboardClient.resources.archive({
          resourceId: route.resourceId,
          reason: "Archived from contextual Dashboard",
        });
        actionSuccess = t("Resource archived", "资源已归档");
      }
      await load();
    } catch {
      error = true;
    } finally {
      actionPending = false;
    }
  }

  async function deleteResource(): Promise<void> {
    if (!detail || !deleteCheck?.eligible || confirmation !== detail.resource.slug || actionPending) return;
    actionPending = true;
    error = false;
    try {
      await dashboardClient.resources.delete({
        resourceId: route.resourceId,
        confirmation: { resourceSlug: detail.resource.slug },
      });
      await goto(
        projectDestinationHref(route.projectId, "overview", route.environmentId, {
          view: route.view,
          search: route.search,
          sort: route.sort,
          cursor: route.cursor,
          filters: route.filters,
        }),
      );
    } catch {
      error = true;
      actionPending = false;
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
  <div class="grid min-h-64 place-items-center rounded-[14px] border border-divider bg-surface" aria-label={t("Loading settings", "正在加载设置")}><LoaderCircle class="size-6 animate-spin text-primary" /></div>
{:else if error && !detail}
  <section class="rounded-[14px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center"><TriangleAlert class="mx-auto size-6 text-destructive" /><h3 class="mt-4 font-semibold">{t("Settings could not be loaded", "无法加载设置")}</h3><Button variant="outline" class="mt-5 h-9 rounded-[9px] shadow-none" onclick={() => void load()}><RefreshCw class="size-4" />{t("Retry", "重试")}</Button></section>
{:else if detail}
  <div class="space-y-4" data-resource-settings>
    {#if actionSuccess}<p class="flex items-center gap-2 rounded-[10px] border border-emerald-500/20 bg-emerald-500/[0.055] px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 class="size-4" />{actionSuccess}</p>{/if}
    <section class="rounded-[14px] border border-divider bg-surface p-5">
      <h3 class="font-semibold">{t("Identity", "身份信息")}</h3>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div><p class="text-xs text-muted-foreground">ID</p><code class="mt-1 block break-all text-xs">{detail.resource.id}</code></div>
        <div><p class="text-xs text-muted-foreground">Slug</p><code class="mt-1 block break-all text-xs">{detail.resource.slug}</code></div>
        <div><p class="text-xs text-muted-foreground">{t("Kind", "类型")}</p><p class="mt-1 text-sm font-medium capitalize">{detail.resource.kind.replaceAll("-", " ")}</p></div>
        <div><p class="text-xs text-muted-foreground">{t("Lifecycle", "生命周期")}</p><p class="mt-1 text-sm font-medium capitalize">{detail.lifecycle.status}</p></div>
      </div>
    </section>

    <section class="rounded-[14px] border border-divider bg-surface p-5">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 class="font-semibold">{detail.lifecycle.status === "archived" ? t("Restore resource", "恢复资源") : t("Archive resource", "归档资源")}</h3><p class="mt-1 text-sm text-muted-foreground">{detail.lifecycle.status === "archived" ? t("Return this resource to active project work.", "将此资源恢复到项目工作流。") : t("Remove this resource from active work without deleting its history.", "从活跃工作中移除资源，但保留历史记录。")}</p></div><Button data-resource-lifecycle-action variant="outline" class="h-9 shrink-0 rounded-[9px] shadow-none" disabled={actionPending} onclick={() => void toggleArchive()}>{#if detail.lifecycle.status === "archived"}<RotateCcw class="size-4" />{t("Restore", "恢复")}{:else}<Archive class="size-4" />{t("Archive", "归档")}{/if}</Button></div>
    </section>

    <section class="rounded-[14px] border border-destructive/25 bg-destructive/[0.035] p-5">
      <div class="flex items-start gap-3"><span class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-destructive/10 text-destructive"><Trash2 class="size-[18px]" /></span><div><h3 class="font-semibold">{t("Delete resource", "删除资源")}</h3><p class="mt-1 text-sm text-muted-foreground">{deleteCheck?.eligible ? t("This resource passed the server-side delete safety check.", "此资源已通过服务端删除安全检查。") : t("Resolve the server-side blockers before deletion.", "删除前需先解决服务端阻塞项。")}</p></div></div>
      {#if deleteCheck && !deleteCheck.eligible}
        <div class="mt-4 space-y-2">{#each deleteCheck.blockers as blocker}<p class="rounded-[9px] border border-divider bg-background/70 px-3 py-2 text-xs text-muted-foreground">{blocker.kind}{blocker.relatedEntityId ? ` · ${blocker.relatedEntityId}` : ""}</p>{/each}</div>
      {:else}
        <label class="mt-4 block space-y-2 text-sm font-medium"><span>{t(`Type ${detail.resource.slug} to confirm`, `输入 ${detail.resource.slug} 以确认`)}</span><input bind:value={confirmation} autocomplete="off" class="h-10 w-full rounded-[9px] border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      {/if}
      {#if error}<p class="mt-4 rounded-[9px] border border-destructive/20 bg-background px-3 py-2 text-xs text-destructive">{t("The lifecycle action failed. Nothing was changed.", "生命周期操作失败，未发生变更。")}</p>{/if}
      <div class="mt-5 flex justify-end"><Button variant="destructive" class="h-9 rounded-[9px] px-3 text-xs" disabled={!deleteCheck?.eligible || confirmation !== detail.resource.slug || actionPending} onclick={() => void deleteResource()}>{#if actionPending}<LoaderCircle class="size-4 animate-spin" />{:else}<Trash2 class="size-4" />{/if}{t("Delete permanently", "永久删除")}</Button></div>
    </section>
  </div>
{/if}

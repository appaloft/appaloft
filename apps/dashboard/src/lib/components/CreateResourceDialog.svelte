<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { X } from "@lucide/svelte";
  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";
  import { resourceDestinationHref } from "$lib/navigation";

  let { projectId, environmentId, onclose }: { projectId: string; environmentId: string; onclose: () => void } = $props();
  let name = $state(""); let description = $state(""); let kind = $state<"application" | "service" | "database" | "cache" | "worker" | "static-site" | "external">("application"); let saving = $state(false); let error = $state("");
  const t = (en: string, zh: string) => i18n.locale === "zh-CN" ? zh : en;

  async function submit(event: SubmitEvent): Promise<void> { event.preventDefault(); saving = true; error = ""; try { const result = await dashboardClient.resources.create({ projectId, environmentId, name: name.trim(), kind, ...(description.trim() ? { description: description.trim() } : {}) }); location.href = resourceDestinationHref(projectId, result.id, "configuration", environmentId); } catch { error = t("Resource could not be created. Check the values and try again.", "无法创建 Resource，请检查输入后重试。"); } finally { saving = false; } }
</script>

<div class="fixed inset-0 z-50 grid place-items-center bg-background/55 p-4 backdrop-blur-sm" role="presentation" onclick={(event) => { if (event.currentTarget === event.target) onclose(); }}>
  <form data-create-resource-form class="w-full max-w-lg rounded-[18px] border border-divider bg-surface-overlay p-6 shadow-[var(--shadow-overlay)]" onsubmit={submit}>
    <div class="flex items-start justify-between"><div><h2 class="text-lg font-semibold">{t("Add Resource", "添加 Resource")}</h2><p class="mt-1 text-sm text-muted-foreground">{t("Create the identity first, then complete source and runtime configuration.", "先创建身份，再完成源码和运行配置。")}</p></div><button type="button" class="grid size-9 place-items-center rounded-[9px] hover:bg-muted" aria-label={t("Close", "关闭")} onclick={onclose}><X class="size-4" /></button></div>
    <div class="mt-6 grid gap-4 sm:grid-cols-2"><label class="block text-sm font-medium sm:col-span-2">{t("Name", "名称")}<input name="name" bind:value={name} required class="mt-2 h-10 w-full rounded-[9px] border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><label class="block text-sm font-medium">{t("Kind", "类型")}<select bind:value={kind} class="mt-2 h-10 w-full rounded-[9px] border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="application">Application</option><option value="service">Service</option><option value="worker">Worker</option><option value="static-site">Static site</option><option value="database">Database</option><option value="cache">Cache</option><option value="external">External</option></select></label><label class="block text-sm font-medium sm:col-span-2">{t("Description", "描述")}<textarea name="description" bind:value={description} rows="3" class="mt-2 w-full resize-y rounded-[9px] border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"></textarea></label></div>
    {#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}<div class="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" class="rounded-[9px] shadow-none" onclick={onclose}>{t("Cancel", "取消")}</Button><Button type="submit" disabled={saving || !name.trim()} class="rounded-[9px]">{saving ? t("Creating…", "创建中…") : t("Create Resource", "创建 Resource")}</Button></div>
  </form>
</div>

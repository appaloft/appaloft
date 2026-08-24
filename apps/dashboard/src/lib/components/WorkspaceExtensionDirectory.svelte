<script lang="ts">
  import type { SystemPluginWebExtension } from "@appaloft/contracts";
  import { ArrowUpRight, Blocks, LoaderCircle } from "@lucide/svelte";
  import { readScopedNavigation } from "$lib/extensions";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";

  let extensions = $state<SystemPluginWebExtension[]>([]); let loading = $state(true);
  const t = (en: string, zh: string) => i18n.locale === "zh-CN" ? zh : en;
  const unscoped = $derived(
    extensions.filter(
      (item) =>
        !readScopedNavigation(item) &&
        (item.target === "console-route" || item.target === "external-page") &&
        ["navigation", "settings", "account-menu", "route"].includes(item.placement),
    ),
  );
  $effect(() => { fetch("/api/system-plugins/web-extensions", { credentials: "same-origin" }).then(async (response) => response.ok ? response.json() : { items: [] }).then((payload) => { extensions = Array.isArray(payload.items) ? payload.items : []; }).catch(() => { extensions = []; }).finally(() => { loading = false; }); });
</script>

<section data-extension-directory class="rounded-[16px] border border-divider bg-surface p-5"><div class="flex items-center justify-between"><div><h2 class="text-sm font-semibold">{t("Extensions", "扩展")}</h2><p class="mt-1 text-xs text-muted-foreground">{t("Unscoped v1 surfaces stay reachable here without becoming global navigation.", "未分配范围的 v1 界面保留在这里，不会升级成全局导航。")}</p></div><Blocks class="size-4 text-muted-foreground" /></div>{#if loading}<div class="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle class="size-4 animate-spin" />{t("Loading extensions…", "正在加载扩展…")}</div>{:else if !unscoped.length}<p class="mt-5 rounded-[10px] bg-muted/60 p-4 text-xs text-muted-foreground">{t("No unscoped extension surfaces are registered.", "没有未分配范围的扩展界面。")}</p>{:else}<div class="mt-4 divide-y divide-divider">{#each unscoped as extension}<a class="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary" href={extension.path} target={extension.target === "external-page" ? "_blank" : undefined} rel={extension.target === "external-page" ? "noreferrer" : undefined}><span>{extension.title}</span><ArrowUpRight class="size-4" /></a>{/each}</div>{/if}</section>

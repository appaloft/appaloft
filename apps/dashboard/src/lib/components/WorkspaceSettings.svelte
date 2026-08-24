<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { CheckCircle2, LoaderCircle, RefreshCw, Save, ShieldCheck, TriangleAlert, Users } from "@lucide/svelte";
  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";
  import { loadDashboardOrganizationContext } from "$lib/organization-context";
  import WorkspaceExtensionDirectory from "./WorkspaceExtensionDirectory.svelte";

  type Context = Awaited<ReturnType<typeof dashboardClient.organizations.currentContext>>;
  type Profile = Awaited<ReturnType<typeof dashboardClient.organizations.showProfile>>;
  type Members = Awaited<ReturnType<typeof dashboardClient.organizations.listMembers>>;
  let context = $state<Context>(); let profile = $state<Profile>(); let members = $state<Members>();
  let name = $state(""); let slug = $state(""); let loading = $state(true); let error = $state(false); let saving = $state(false); let saved = $state(false); let saveError = $state("");
  const t = (en: string, zh: string) => i18n.locale === "zh-CN" ? zh : en;

  async function load(): Promise<void> {
    loading = true; error = false;
    try {
      context = await loadDashboardOrganizationContext();
      const organizationId = context.currentOrganization.organizationId;
      [profile, members] = await Promise.all([
        dashboardClient.organizations.showProfile({ organizationId }),
        context.permissions?.canListMembers ? dashboardClient.organizations.listMembers({ organizationId, limit: 50 }) : Promise.resolve({ items: [] }),
      ]);
      name = profile.name; slug = profile.slug;
    } catch { context = undefined; profile = undefined; members = undefined; error = true; }
    finally { loading = false; }
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault(); if (!profile) return;
    saving = true; saved = false; saveError = "";
    try {
      profile = await dashboardClient.organizations.changeProfile({ organizationId: profile.organizationId, name: name.trim(), slug: slug.trim() });
      saved = true;
    } catch { saveError = t("Workspace changes could not be saved.", "无法保存工作区变更。") }
    finally { saving = false; }
  }
  $effect(() => { void load(); });
</script>

<section data-workspace-settings class="mx-auto w-full max-w-[960px] px-5 py-8 sm:px-8 lg:py-12">
  <p class="text-xs font-medium text-primary">{t("Workspace", "工作区")}</p><h1 class="mt-3 text-3xl font-semibold tracking-[-0.025em]">{t("Settings", "设置")}</h1><p class="mt-2 text-sm text-muted-foreground">{t("Identity, access, and membership for the current Workspace.", "管理当前工作区的身份、权限和成员。")}</p>
  {#if loading}<div class="mt-8 grid min-h-64 place-items-center rounded-[16px] border border-divider bg-surface"><LoaderCircle class="size-6 animate-spin text-primary" /></div>
  {:else if error || !profile || !context}<div class="mt-8 rounded-[16px] border border-destructive/25 bg-destructive/[0.04] p-8 text-center"><TriangleAlert class="mx-auto size-6 text-destructive" /><h2 class="mt-4 font-semibold">{t("Workspace settings could not be loaded", "无法加载工作区设置")}</h2><Button variant="outline" class="mt-5 rounded-[9px] shadow-none" onclick={() => void load()}><RefreshCw class="size-4" />{t("Retry", "重试")}</Button></div>
  {:else}<div class="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><form class="rounded-[16px] border border-divider bg-surface p-5 sm:p-6" onsubmit={save}><h2 class="font-semibold">{t("Workspace profile", "工作区资料")}</h2><p class="mt-1 text-sm text-muted-foreground">{t("Shown throughout the Dashboard and shared surfaces.", "显示在 Dashboard 及共享界面中。")}</p><label class="mt-6 block text-sm font-medium">{t("Name", "名称")}<input bind:value={name} required class="mt-2 h-10 w-full rounded-[9px] border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><label class="mt-4 block text-sm font-medium">{t("Slug", "标识") }<input bind:value={slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" class="mt-2 h-10 w-full rounded-[9px] border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>{#if saveError}<p class="mt-4 text-sm text-destructive">{saveError}</p>{/if}<div class="mt-6 flex items-center justify-between gap-3"><span class="text-xs text-muted-foreground">{profile.role}</span><Button type="submit" disabled={saving || !name.trim() || !slug.trim()} class="rounded-[9px]"><Save class="size-4" />{saving ? t("Saving…", "保存中…") : saved ? t("Saved", "已保存") : t("Save changes", "保存变更")}</Button></div></form>
  <aside class="space-y-5"><section class="rounded-[16px] border border-divider bg-surface p-5"><div class="flex items-center gap-3"><span class="grid size-10 place-items-center rounded-[11px] bg-primary/10 text-primary"><ShieldCheck class="size-[18px]" /></span><div><h2 class="text-sm font-semibold">{t("Your access", "你的权限")}</h2><p class="mt-0.5 text-xs capitalize text-muted-foreground">{context.currentOrganization.role}</p></div></div><div class="mt-5 space-y-2 text-xs text-muted-foreground">{#each [context.permissions?.canInviteMembers ? t("Invite members", "邀请成员") : "", context.permissions?.canManageDeployTokens ? t("Manage deploy tokens", "管理部署令牌") : "", context.permissions?.canUpdateMemberRoles ? t("Manage roles", "管理角色") : ""].filter(Boolean) as capability}<p class="flex items-center gap-2"><CheckCircle2 class="size-4 text-emerald-500" />{capability}</p>{/each}</div></section><section class="rounded-[16px] border border-divider bg-surface p-5"><div class="flex items-center justify-between"><h2 class="text-sm font-semibold">{t("Members", "成员")}</h2><Users class="size-4 text-muted-foreground" /></div><div class="mt-4 space-y-4">{#each members?.items ?? [] as member}<div class="flex items-center gap-3"><span class="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{(member.displayName || member.email || member.userId).slice(0,1).toUpperCase()}</span><div class="min-w-0"><p class="truncate text-xs font-medium">{member.displayName || member.email || member.userId}</p><p class="mt-0.5 text-[11px] capitalize text-muted-foreground">{member.role}</p></div></div>{/each}</div></section><WorkspaceExtensionDirectory /></aside></div>{/if}
</section>

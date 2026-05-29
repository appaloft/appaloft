<script lang="ts">
  import { browser } from "$app/environment";
  import { ShieldAlert, Trash2 } from "@lucide/svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { readErrorMessage } from "$lib/api/client";
  import { accountSettingsItems } from "$lib/console/settings-nav";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";

  let confirmationUserId = $state("");
  let operationNotice = $state("");
  let operationError = $state("");

  const profileQuery = createQuery(() =>
    queryOptions({
      queryKey: ["account", "profile"],
      queryFn: () => orpcClient.account.showProfile({}),
      enabled: browser,
      retry: 0,
    }),
  );

  const profile = $derived(profileQuery.data ?? null);
  const deleteAccountMutation = createMutation(() => ({
    mutationFn: () =>
      orpcClient.account.delete({
        confirmation: { userId: confirmationUserId },
      }),
    onSuccess: () => {
      operationError = "";
      operationNotice = $t(i18nKeys.console.accountSettings.accountDeleted);
      if (browser) {
        window.location.href = "/login";
      }
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));
  const canDeleteAccount = $derived(
    Boolean(profile?.userId) &&
      confirmationUserId.trim() === profile?.userId &&
      !deleteAccountMutation.isPending,
  );

  function submitDeleteAccount(event: SubmitEvent): void {
    event.preventDefault();
    if (canDeleteAccount) {
      deleteAccountMutation.mutate();
    }
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.accountSettings.dangerZoneTitle)} · Appaloft</title>
</svelte:head>

<SettingsShell
  title={$t(i18nKeys.console.accountSettings.dangerZoneTitle)}
  description={$t(i18nKeys.console.accountSettings.dangerDescription)}
  groupLabel={$t(i18nKeys.console.accountSettings.introTitle)}
  activePath="/account/danger-zone"
  items={accountSettingsItems()}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.workspace), href: "/" },
    { label: $t(i18nKeys.console.accountSettings.introTitle), href: "/account/profile" },
    { label: $t(i18nKeys.console.accountSettings.dangerZoneTitle) },
  ]}
>
  <div class="mx-auto max-w-4xl space-y-6">
    <section class="console-panel space-y-5 border-destructive/25 bg-destructive/5 p-5">
      <div class="flex items-start gap-3">
        <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-background p-2">
          <ShieldAlert class="size-5 text-destructive" />
        </div>
        <div class="min-w-0 space-y-1">
          <h1 class="text-lg font-semibold text-destructive">
            {$t(i18nKeys.console.accountSettings.dangerZoneTitle)}
          </h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.accountSettings.dangerDescription)}
          </p>
        </div>
      </div>

      {#if profileQuery.isLoading}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-background/70 p-4 text-sm text-muted-foreground">
          {$t(i18nKeys.common.status.loading)}
        </div>
      {:else if profileQuery.error}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-background/70 p-4 text-sm">
          <p class="font-medium text-destructive">{$t(i18nKeys.console.accountSettings.operationFailed)}</p>
          <p class="mt-1.5 break-words text-muted-foreground">{readErrorMessage(profileQuery.error)}</p>
        </div>
      {:else if profile}
        <form class="space-y-4" onsubmit={submitDeleteAccount}>
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-background/70 p-4 text-sm">
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.accountSettings.accountId)}</p>
            <p class="mt-1 break-all font-mono">{profile.userId}</p>
          </div>
          <label class="appaloft-field-stack">
            <span class="appaloft-field-label">{$t(i18nKeys.console.accountSettings.dangerConfirmLabel)}</span>
            <Input
              bind:value={confirmationUserId}
              class="bg-background"
              placeholder={$t(i18nKeys.console.accountSettings.dangerConfirmPlaceholder)}
              autocomplete="off"
            />
          </label>
          <Button type="submit" variant="destructive" disabled={!canDeleteAccount}>
            <Trash2 class="size-4" />
            {deleteAccountMutation.isPending
              ? $t(i18nKeys.console.accountSettings.deletingAccount)
              : $t(i18nKeys.console.accountSettings.deleteAccount)}
          </Button>
        </form>
      {/if}

      {#if operationNotice}
        <p class="text-sm font-medium">{operationNotice}</p>
      {/if}
      {#if operationError}
        <p class="break-words text-sm text-destructive">{operationError}</p>
      {/if}
    </section>
  </div>
</SettingsShell>

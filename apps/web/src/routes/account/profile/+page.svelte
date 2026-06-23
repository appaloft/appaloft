<script lang="ts">
  import { browser } from "$app/environment";
  import {
    CheckCircle2,
    KeyRound,
    Link2,
    Pencil,
    ShieldAlert,
    ShieldCheck,
    UserRound,
  } from "@lucide/svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { readErrorMessage } from "$lib/api/client";
  import { accountSettingsItems } from "$lib/console/settings-nav";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  let displayName = $state("");
  let avatarUrl = $state("");
  let profileEditDialogOpen = $state(false);
  let operationNotice = $state("");
  let operationError = $state("");

  const profileQuery = createQuery(() =>
    orpc.account.showProfile.queryOptions({
      input: {},
      enabled: browser,
      retry: 0,
    }),
  );

  const profile = $derived(profileQuery.data ?? null);

  $effect(() => {
    if (!profile) {
      return;
    }

    displayName = profile.displayName ?? "";
    avatarUrl = profile.avatarUrl ?? "";
  });

  const changeProfileMutation = createMutation(() => ({
    mutationFn: () =>
      orpcClient.account.changeProfile({
        displayName,
        avatarUrl: avatarUrl.trim() ? avatarUrl : null,
      }),
    onSuccess: () => {
      operationError = "";
      operationNotice = $t(i18nKeys.console.accountSettings.profileSaved);
      void queryClient.invalidateQueries({ queryKey: orpc.account.showProfile.key({ input: {} }) });
      profileEditDialogOpen = false;
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));
  const canSubmitProfile = $derived(
    !profileQuery.isPending &&
      !changeProfileMutation.isPending &&
      (displayName.trim() !== (profile?.displayName ?? "") ||
        avatarUrl.trim() !== (profile?.avatarUrl ?? "")),
  );

  function submitProfile(event: SubmitEvent): void {
    event.preventDefault();
    if (canSubmitProfile) {
      changeProfileMutation.mutate();
    }
  }

  function openProfileEditDialog(): void {
    displayName = profile?.displayName ?? "";
    avatarUrl = profile?.avatarUrl ?? "";
    operationError = "";
    profileEditDialogOpen = true;
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.accountSettings.profileTitle)} · Appaloft</title>
</svelte:head>

<SettingsShell
  title={$t(i18nKeys.console.accountSettings.profileTitle)}
  description={$t(i18nKeys.console.accountSettings.introBody)}
  groupLabel={$t(i18nKeys.console.accountSettings.introTitle)}
  activePath="/account/profile"
  items={accountSettingsItems()}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.workspace), href: "/" },
    { label: $t(i18nKeys.console.accountSettings.introTitle) },
  ]}
>
  <div class="mx-auto grid max-w-5xl gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <section class="console-panel space-y-5 p-5" data-account-profile-summary>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex items-start gap-3">
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-2">
            <UserRound class="size-5 text-primary" />
          </div>
          <div class="min-w-0 space-y-1">
            <h1 class="text-lg font-semibold">{$t(i18nKeys.console.accountSettings.profileTitle)}</h1>
            <p class="text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.accountSettings.introBody)}
            </p>
          </div>
        </div>
        <Button
          type="button"
          class="w-fit shrink-0"
          disabled={!profile || profileQuery.isPending}
          onclick={openProfileEditDialog}
        >
          <Pencil class="size-4" />
          {$t(i18nKeys.common.actions.edit)}
        </Button>
      </div>

      {#if profileQuery.isLoading}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
          {$t(i18nKeys.common.status.loading)}
        </div>
      {:else if profileQuery.error}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p class="font-medium text-destructive">{$t(i18nKeys.console.accountSettings.operationFailed)}</p>
          <p class="mt-1.5 break-words text-muted-foreground">{readErrorMessage(profileQuery.error)}</p>
        </div>
      {:else if profile}
        <dl class="grid gap-4 sm:grid-cols-2">
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
            <dt class="text-xs font-medium text-muted-foreground">
              {$t(i18nKeys.console.accountSettings.displayNameLabel)}
            </dt>
            <dd class="mt-1 break-words text-sm font-medium">
              {profile.displayName?.trim() || $t(i18nKeys.common.status.notConfigured)}
            </dd>
          </div>
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
            <dt class="text-xs font-medium text-muted-foreground">
              {$t(i18nKeys.console.accountSettings.avatarUrlLabel)}
            </dt>
            <dd class="mt-1 break-all text-sm font-medium">
              {profile.avatarUrl?.trim() || $t(i18nKeys.common.status.notConfigured)}
            </dd>
          </div>
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
            <dt class="text-xs font-medium text-muted-foreground">
              {$t(i18nKeys.console.organization.email)}
            </dt>
            <dd class="mt-1 break-all text-sm font-medium">{profile.email}</dd>
          </div>
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
            <dt class="text-xs font-medium text-muted-foreground">
              {$t(i18nKeys.console.accountSettings.emailVerified)}
            </dt>
            <dd class="mt-2 flex items-center gap-2">
              <Badge variant={profile.emailVerified ? "outline" : "secondary"}>
                {profile.emailVerified
                  ? $t(i18nKeys.common.status.passed)
                  : $t(i18nKeys.common.status.pendingVerification)}
              </Badge>
            </dd>
          </div>
        </dl>
      {/if}

      {#if operationNotice}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border border-primary/30 bg-primary/5 p-4 text-sm">
          {operationNotice}
        </div>
      {/if}
    </section>

    <section class="console-panel h-fit space-y-5 p-5" data-account-settings-handoff>
      <div class="space-y-1">
        <h2 class="text-base font-semibold">{$t(i18nKeys.console.accountSettings.introTitle)}</h2>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.accountSettings.introBody)}
        </p>
      </div>
      {#if profile}
        <div class="space-y-3 text-sm">
          <div>
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.accountSettings.accountId)}</p>
            <p class="mt-1 break-all font-mono">{profile.userId}</p>
          </div>
          {#if profile.createdAt}
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.createdAt)}</p>
              <p class="mt-1">{formatTime(profile.createdAt)}</p>
            </div>
          {/if}
          <div>
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.source)}</p>
            <p class="mt-1">{$t(i18nKeys.console.accountSettings.introTitle)}</p>
          </div>
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">{$t(i18nKeys.common.status.loading)}</p>
      {/if}

      <div class="space-y-2 border-t pt-4" data-account-settings-next-actions>
        <Button href="/account/security" variant="outline" class="w-full justify-start">
          <KeyRound class="size-4" />
          {$t(i18nKeys.console.authAccountSecurity.introTitle)}
        </Button>
        <Button href="/account/connections" variant="outline" class="w-full justify-start">
          <Link2 class="size-4" />
          {$t(i18nKeys.console.accountSettings.connectionsTitle)}
        </Button>
        <Button href="/account/sessions" variant="outline" class="w-full justify-start">
          <ShieldCheck class="size-4" />
          {$t(i18nKeys.console.accountSettings.sessionsTitle)}
        </Button>
        <Button href="/account/danger-zone" variant="outline" class="w-full justify-start">
          <ShieldAlert class="size-4" />
          {$t(i18nKeys.console.accountSettings.dangerZoneTitle)}
        </Button>
      </div>
    </section>
  </div>

  <Dialog.Root bind:open={profileEditDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.accountSettings.profileTitle)}</Dialog.Title>
        <Dialog.Description>{$t(i18nKeys.console.accountSettings.introBody)}</Dialog.Description>
      </Dialog.Header>
      <form class="space-y-5 px-5 pb-5" onsubmit={submitProfile} data-account-profile-edit-dialog>
        <label class="appaloft-field-stack">
          <span class="appaloft-field-label">{$t(i18nKeys.console.accountSettings.displayNameLabel)}</span>
          <Input
            bind:value={displayName}
            placeholder={$t(i18nKeys.console.accountSettings.displayNamePlaceholder)}
          />
        </label>

        <label class="appaloft-field-stack">
          <span class="appaloft-field-label">{$t(i18nKeys.console.accountSettings.avatarUrlLabel)}</span>
          <Input
            bind:value={avatarUrl}
            type="url"
            placeholder={$t(i18nKeys.console.accountSettings.avatarUrlPlaceholder)}
          />
        </label>

        {#if operationError}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p class="font-medium text-destructive">{$t(i18nKeys.console.accountSettings.operationFailed)}</p>
            <p class="mt-1.5 break-words text-muted-foreground">{operationError}</p>
          </div>
        {/if}

        <Dialog.Footer class="border-t pt-5">
          <Button type="button" variant="outline" onclick={() => (profileEditDialogOpen = false)}>
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button type="submit" disabled={!canSubmitProfile}>
            <CheckCircle2 class="size-4" />
            {changeProfileMutation.isPending
              ? $t(i18nKeys.console.accountSettings.savingProfile)
              : $t(i18nKeys.console.accountSettings.saveProfile)}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
</SettingsShell>

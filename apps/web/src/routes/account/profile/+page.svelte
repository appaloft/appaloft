<script lang="ts">
  import { browser } from "$app/environment";
  import { CheckCircle2, UserRound } from "@lucide/svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { readErrorMessage } from "$lib/api/client";
  import { accountSettingsItems } from "$lib/console/settings-nav";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  let displayName = $state("");
  let avatarUrl = $state("");
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
      void queryClient.invalidateQueries({ queryKey: ["account", "profile"] });
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
  <div class="mx-auto grid max-w-5xl gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <form class="console-panel space-y-5 p-5" onsubmit={submitProfile}>
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

      {#if profileQuery.isLoading}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
          {$t(i18nKeys.common.status.loading)}
        </div>
      {:else if profileQuery.error}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p class="font-medium text-destructive">{$t(i18nKeys.console.accountSettings.operationFailed)}</p>
          <p class="mt-1.5 break-words text-muted-foreground">{readErrorMessage(profileQuery.error)}</p>
        </div>
      {:else}
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

        <Button type="submit" disabled={!canSubmitProfile}>
          <CheckCircle2 class="size-4" />
          {changeProfileMutation.isPending
            ? $t(i18nKeys.console.accountSettings.savingProfile)
            : $t(i18nKeys.console.accountSettings.saveProfile)}
        </Button>
      {/if}

      {#if operationNotice}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border border-primary/30 bg-primary/5 p-4 text-sm">
          {operationNotice}
        </div>
      {/if}

      {#if operationError}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p class="font-medium text-destructive">{$t(i18nKeys.console.accountSettings.operationFailed)}</p>
          <p class="mt-1.5 break-words text-muted-foreground">{operationError}</p>
        </div>
      {/if}
    </form>

    <section class="console-panel h-fit space-y-4 p-5">
      <h2 class="text-base font-semibold">{$t(i18nKeys.console.accountSettings.introTitle)}</h2>
      {#if profile}
        <div class="space-y-3 text-sm">
          <div>
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.accountSettings.accountId)}</p>
            <p class="mt-1 break-all font-mono">{profile.userId}</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.organization.email)}</p>
            <p class="mt-1 break-all">{profile.email}</p>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant={profile.emailVerified ? "outline" : "secondary"}>
              {$t(i18nKeys.console.accountSettings.emailVerified)}
            </Badge>
            <span class="text-xs text-muted-foreground">
              {profile.emailVerified ? $t(i18nKeys.common.status.passed) : $t(i18nKeys.common.status.pendingVerification)}
            </span>
          </div>
          {#if profile.createdAt}
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.createdAt)}</p>
              <p class="mt-1">{formatTime(profile.createdAt)}</p>
            </div>
          {/if}
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">{$t(i18nKeys.common.status.loading)}</p>
      {/if}
    </section>
  </div>
</SettingsShell>

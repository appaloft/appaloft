<script lang="ts">
  import { browser } from "$app/environment";
  import { Monitor, ShieldCheck, SquareTerminal, Trash2 } from "@lucide/svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { readErrorMessage } from "$lib/api/client";
  import { accountSettingsItems } from "$lib/console/settings-nav";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  let operationNotice = $state("");
  let operationError = $state("");

  const sessionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["account", "sessions"],
      queryFn: () => orpcClient.account.listSessions({}),
      enabled: browser,
      retry: 0,
    }),
  );

  const revokeSessionMutation = createMutation(() => ({
    mutationFn: (sessionId: string) => orpcClient.account.revokeSession({ sessionId }),
    onSuccess: () => {
      operationError = "";
      operationNotice = $t(i18nKeys.console.accountSettings.sessionRevoked);
      void queryClient.invalidateQueries({ queryKey: ["account", "sessions"] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const sessions = $derived(sessionsQuery.data?.items ?? []);

  function revokeSession(sessionId: string): void {
    if (!revokeSessionMutation.isPending) {
      revokeSessionMutation.mutate(sessionId);
    }
  }

  function clientLabel(clientKind: "web" | "cli" | "unknown" | undefined): string {
    if (clientKind === "cli") {
      return $t(i18nKeys.console.accountSettings.clientCli);
    }
    if (clientKind === "web") {
      return $t(i18nKeys.console.accountSettings.clientWeb);
    }
    return $t(i18nKeys.console.accountSettings.clientUnknown);
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.accountSettings.sessionsTitle)} · Appaloft</title>
</svelte:head>

<SettingsShell
  title={$t(i18nKeys.console.accountSettings.sessionsTitle)}
  description={$t(i18nKeys.console.accountSettings.sessionsBody)}
  groupLabel={$t(i18nKeys.console.accountSettings.introTitle)}
  activePath="/account/sessions"
  items={accountSettingsItems()}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.workspace), href: "/" },
    { label: $t(i18nKeys.console.accountSettings.introTitle), href: "/account/profile" },
    { label: $t(i18nKeys.console.accountSettings.sessionsTitle) },
  ]}
>
  <div class="mx-auto max-w-5xl space-y-6">
    <section class="space-y-2">
      <h1 class="text-lg font-semibold">{$t(i18nKeys.console.accountSettings.sessionsTitle)}</h1>
      <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
        {$t(i18nKeys.console.accountSettings.sessionsBody)}
      </p>
    </section>

    {#if operationNotice || operationError}
      <section class="console-panel space-y-2 p-4">
        {#if operationNotice}
          <p class="text-sm font-medium">{operationNotice}</p>
        {/if}
        {#if operationError}
          <p class="text-sm text-destructive">{operationError}</p>
        {/if}
      </section>
    {/if}

    {#if sessionsQuery.isLoading}
      <section class="console-panel p-5 text-sm text-muted-foreground">
        {$t(i18nKeys.common.status.loading)}
      </section>
    {:else if sessionsQuery.error}
      <section class="console-panel space-y-2 border-destructive/30 bg-destructive/5 p-5">
        <h2 class="text-base font-semibold text-destructive">
          {$t(i18nKeys.console.accountSettings.operationFailed)}
        </h2>
        <p class="break-words text-sm text-muted-foreground">{readErrorMessage(sessionsQuery.error)}</p>
      </section>
    {:else}
      <div class="console-record-list">
        {#if sessions.length === 0}
          <div class="console-record-row text-sm text-muted-foreground">
            {$t(i18nKeys.console.accountSettings.emptySessions)}
          </div>
        {:else}
          {#each sessions as session (session.sessionId)}
            <div class="console-record-row gap-4 lg:grid-cols-[minmax(0,1fr)_18rem_auto] lg:items-center">
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="truncate text-base font-semibold">
                    {session.displayName ?? session.userAgent ?? session.sessionId}
                  </h2>
                  <Badge variant="secondary">
                    {#if session.clientKind === "cli"}
                      <SquareTerminal class="size-3.5" />
                    {:else}
                      <Monitor class="size-3.5" />
                    {/if}
                    {clientLabel(session.clientKind)}
                  </Badge>
                  {#if session.current}
                    <Badge variant="outline">
                      <ShieldCheck class="size-3.5" />
                      {$t(i18nKeys.console.accountSettings.currentSession)}
                    </Badge>
                  {/if}
                </div>
                <p class="break-all font-mono text-sm text-muted-foreground">{session.sessionId}</p>
                {#if session.ipAddress}
                  <p class="text-xs text-muted-foreground">{session.ipAddress}</p>
                {/if}
              </div>
              <div class="space-y-1 text-sm text-muted-foreground">
                <p>{$t(i18nKeys.common.domain.createdAt)} · {formatTime(session.createdAt)}</p>
                <p>
                  {$t(i18nKeys.console.organization.expiresAt)} · {formatTime(session.expiresAt)}
                </p>
                <p>
                  {$t(i18nKeys.console.accountSettings.lastActiveAt)} · {session.lastActiveAt
                    ? formatTime(session.lastActiveAt)
                    : $t(i18nKeys.common.status.unknown)}
                </p>
              </div>
              <Button
                disabled={revokeSessionMutation.isPending}
                onclick={() => revokeSession(session.sessionId)}
                size="sm"
                variant="destructive"
              >
                <Trash2 class="size-3.5" />
                {revokeSessionMutation.isPending
                  ? $t(i18nKeys.console.accountSettings.revokingSession)
                  : $t(i18nKeys.console.accountSettings.revokeSession)}
              </Button>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</SettingsShell>

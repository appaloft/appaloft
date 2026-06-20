<script lang="ts">
  import { browser } from "$app/environment";
  import { Monitor, ShieldCheck, SquareTerminal, Trash2 } from "@lucide/svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { AccountSessionSummary } from "@appaloft/contracts";

  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { readErrorMessage } from "$lib/api/client";
  import { accountSettingsItems } from "$lib/console/settings-nav";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  let operationNotice = $state("");
  let operationError = $state("");
  let revokeSessionDialogOpen = $state(false);
  let selectedSessionForRevoke = $state<AccountSessionSummary | null>(null);

  const sessionsQuery = createQuery(() =>
    orpc.account.listSessions.queryOptions({
      input: {},
      enabled: browser,
      retry: 0,
    }),
  );

  const revokeSessionMutation = createMutation(() => ({
    mutationFn: (sessionId: string) => orpcClient.account.revokeSession({ sessionId }),
    onSuccess: () => {
      operationError = "";
      operationNotice = $t(i18nKeys.console.accountSettings.sessionRevoked);
      revokeSessionDialogOpen = false;
      selectedSessionForRevoke = null;
      void queryClient.invalidateQueries({ queryKey: orpc.account.listSessions.key({ input: {} }) });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const sessions = $derived(sessionsQuery.data?.items ?? []);

  function openRevokeSessionDialog(session: AccountSessionSummary): void {
    if (revokeSessionMutation.isPending) {
      return;
    }

    selectedSessionForRevoke = session;
    operationError = "";
    revokeSessionDialogOpen = true;
  }

  function setRevokeSessionDialogOpen(open: boolean): void {
    if (!open && revokeSessionMutation.isPending) {
      return;
    }

    revokeSessionDialogOpen = open;
    if (!open) {
      selectedSessionForRevoke = null;
    }
  }

  function confirmRevokeSession(): void {
    if (!selectedSessionForRevoke || revokeSessionMutation.isPending) {
      return;
    }

    revokeSessionMutation.mutate(selectedSessionForRevoke.sessionId);
  }

  type AccountSessionClientKind = "web" | "cli" | "unknown";

  function sessionClientKind(session: {
    clientKind?: AccountSessionClientKind;
    current?: boolean;
    displayName?: string;
    userAgent?: string;
  }): AccountSessionClientKind {
    if (session.clientKind && session.clientKind !== "unknown") {
      return session.clientKind;
    }
    const clientText = `${session.displayName ?? ""} ${session.userAgent ?? ""}`;
    if (/\b(appaloft-cli|appaloft cli)\b/i.test(clientText)) {
      return "cli";
    }
    if (session.userAgent) {
      return "web";
    }
    if (session.current) {
      return "web";
    }
    return "unknown";
  }

  function sessionDisplayName(session: {
    clientKind?: AccountSessionClientKind;
    current?: boolean;
    displayName?: string;
    userAgent?: string;
    sessionId: string;
  }): string {
    if (session.displayName) {
      return session.displayName;
    }
    if (session.userAgent) {
      return browserDisplayName(session.userAgent);
    }
    if (session.current) {
      return $t(i18nKeys.console.accountSettings.clientWeb);
    }
    return session.sessionId;
  }

  function browserDisplayName(userAgent: string): string {
    if (/\bCodex\//i.test(userAgent)) {
      return "Codex Browser";
    }
    if (/\bElectron\//i.test(userAgent)) {
      return "Electron app";
    }
    if (/\bEdg\//i.test(userAgent)) {
      return "Microsoft Edge";
    }
    if (/\bChrome\//i.test(userAgent) || /\bChromium\//i.test(userAgent)) {
      return "Chrome";
    }
    if (/\bFirefox\//i.test(userAgent)) {
      return "Firefox";
    }
    if (/\bSafari\//i.test(userAgent)) {
      return "Safari";
    }
    return userAgent;
  }

  function clientLabel(clientKind: AccountSessionClientKind): string {
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
  <div class="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
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
      <div class="console-record-list" data-account-sessions-display-surface>
        {#if sessions.length === 0}
          <div class="console-record-row text-sm text-muted-foreground">
            {$t(i18nKeys.console.accountSettings.emptySessions)}
          </div>
        {:else}
          {#each sessions as session (session.sessionId)}
            {@const clientKind = sessionClientKind(session)}
            <div class="console-record-row gap-4 lg:grid-cols-[minmax(0,1fr)_18rem_auto] lg:items-center">
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="truncate text-base font-semibold">
                    {sessionDisplayName(session)}
                  </h2>
                  <Badge variant="secondary">
                    {#if clientKind === "cli"}
                      <SquareTerminal class="size-3.5" />
                    {:else}
                      <Monitor class="size-3.5" />
                    {/if}
                    {clientLabel(clientKind)}
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
                onclick={() => openRevokeSessionDialog(session)}
                size="sm"
                variant="outline"
              >
                <ShieldCheck class="size-3.5" />
                {$t(i18nKeys.console.accountSettings.lifecycleManageAction)}
              </Button>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <Dialog.Root bind:open={revokeSessionDialogOpen} onOpenChange={setRevokeSessionDialogOpen}>
    {#if selectedSessionForRevoke}
      {@const selectedClientKind = sessionClientKind(selectedSessionForRevoke)}
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.console.accountSettings.revokeSession)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.accountSettings.sessionsBody)}
          </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4 px-5 py-4" data-account-session-revoke-dialog>
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{sessionDisplayName(selectedSessionForRevoke)}</p>
              <Badge variant="secondary">
                {#if selectedClientKind === "cli"}
                  <SquareTerminal class="size-3.5" />
                {:else}
                  <Monitor class="size-3.5" />
                {/if}
                {clientLabel(selectedClientKind)}
              </Badge>
              {#if selectedSessionForRevoke.current}
                <Badge variant="outline">
                  <ShieldCheck class="size-3.5" />
                  {$t(i18nKeys.console.accountSettings.currentSession)}
                </Badge>
              {/if}
            </div>
            <p class="mt-2 break-all font-mono text-xs text-muted-foreground">
              {selectedSessionForRevoke.sessionId}
            </p>
            <p class="mt-2 text-xs text-muted-foreground">
              {$t(i18nKeys.console.accountSettings.lastActiveAt)} · {selectedSessionForRevoke.lastActiveAt
                ? formatTime(selectedSessionForRevoke.lastActiveAt)
                : $t(i18nKeys.common.status.unknown)}
            </p>
          </div>

          {#if operationError}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p class="break-words text-destructive">{operationError}</p>
            </div>
          {/if}
        </div>

        <Dialog.Footer class="border-t p-5">
          <Button
            type="button"
            variant="outline"
            onclick={() => setRevokeSessionDialogOpen(false)}
          >
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={revokeSessionMutation.isPending}
            onclick={confirmRevokeSession}
          >
            <Trash2 class="size-4" />
            {revokeSessionMutation.isPending
              ? $t(i18nKeys.console.accountSettings.revokingSession)
              : $t(i18nKeys.console.accountSettings.revokeSession)}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    {/if}
  </Dialog.Root>
</SettingsShell>

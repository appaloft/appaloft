<script lang="ts">
  import { browser } from "$app/environment";
  import { GitBranch, Link2 } from "@lucide/svelte";

  import { API_BASE, readErrorMessage, request } from "$lib/api/client";
  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { accountSettingsItems } from "$lib/console/settings-nav";
  import { createConsoleQueries, defaultAuthSession } from "$lib/console/queries";
  import { i18nKeys, t } from "$lib/i18n";

  const { authSessionQuery } = createConsoleQueries(browser, {
    readiness: false,
    version: false,
    servers: false,
    environments: false,
    resources: false,
    deployments: false,
    domainBindings: false,
    previewEnvironments: false,
    certificates: false,
    providers: false,
    projects: false,
  });

  let operationError = $state("");
  let linkingGitHub = $state(false);

  const authSession = $derived(authSessionQuery.data ?? defaultAuthSession);
  const githubProvider = $derived(
    authSession.providers.find((provider) => provider.key === "github") ?? null,
  );
  const githubConnected = $derived(Boolean(githubProvider?.connected));
  const githubConfigured = $derived(Boolean(githubProvider?.configured));
  const githubAccountLabel = $derived(githubProvider?.accountLabel?.trim() ?? "");
  const githubConnectionSummary = $derived.by(() => {
    if (githubConnected && githubAccountLabel) {
      return $t(i18nKeys.console.accountSettings.githubConnectedAs, {
        account: githubAccountLabel,
      });
    }

    return githubConnected
      ? `GitHub ${$t(i18nKeys.common.status.connected)}`
      : githubConfigured
        ? $t(i18nKeys.console.accountSettings.githubConnectionDescription)
        : $t(i18nKeys.console.accountSettings.providerNotConfigured);
  });
  const canLinkGitHub = $derived(
    Boolean(githubProvider?.configured && authSession.session && !githubConnected && !linkingGitHub),
  );

  async function connectGitHub(): Promise<void> {
    if (!canLinkGitHub) {
      return;
    }

    operationError = "";
    linkingGitHub = true;

    try {
      const response = await request<{ redirect: boolean; url?: string }>("/api/auth/link-social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: "github",
          callbackURL: browser ? window.location.href : API_BASE,
          scopes: ["repo", "read:user"],
          disableRedirect: true,
        }),
      });

      if (response.url && browser) {
        window.location.href = response.url;
      }
    } catch (error) {
      operationError = readErrorMessage(error);
      linkingGitHub = false;
    }
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.accountSettings.connectionsTitle)} · Appaloft</title>
</svelte:head>

<SettingsShell
  title={$t(i18nKeys.console.accountSettings.connectionsTitle)}
  description={$t(i18nKeys.console.accountSettings.connectionsDescription)}
  groupLabel={$t(i18nKeys.console.accountSettings.introTitle)}
  activePath="/account/connections"
  items={accountSettingsItems()}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.workspace), href: "/" },
    { label: $t(i18nKeys.console.accountSettings.introTitle), href: "/account/profile" },
    { label: $t(i18nKeys.console.accountSettings.connectionsTitle) },
  ]}
>
  <div class="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
    <section class="console-panel space-y-5 p-5" data-account-connections-summary>
      <div class="flex items-start gap-3">
        <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-2">
          <Link2 class="size-5 text-primary" />
        </div>
        <div class="min-w-0 space-y-1">
          <h1 class="text-lg font-semibold">{$t(i18nKeys.console.accountSettings.connectionsTitle)}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.accountSettings.connectionsDescription)}
          </p>
        </div>
      </div>

      {#if authSessionQuery.isLoading}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
          {$t(i18nKeys.common.status.loading)}
        </div>
      {:else}
        <div
          class="flex flex-col gap-4 rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
          data-account-github-connection
        >
          <div class="flex min-w-0 items-start gap-3">
            <div class="rounded-md border bg-card p-2">
              <GitBranch class="size-4 text-muted-foreground" />
            </div>
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-sm font-semibold">
                  {$t(i18nKeys.console.accountSettings.githubAccountTitle)}
                </h2>
                <Badge variant={githubConnected ? "outline" : "secondary"}>
                  {githubConnected
                    ? $t(i18nKeys.common.status.connected)
                    : githubConfigured
                      ? $t(i18nKeys.common.status.pendingAuthorization)
                      : $t(i18nKeys.common.status.notConfigured)}
                </Badge>
              </div>
              <p class="break-words text-sm text-muted-foreground">{githubConnectionSummary}</p>
            </div>
          </div>
          <Button type="button" class="w-fit shrink-0" disabled={!canLinkGitHub} onclick={connectGitHub}>
            <GitBranch class="size-4" />
            {linkingGitHub
              ? $t(i18nKeys.console.accountSettings.linkingGitHubAccount)
              : githubConnected
                ? $t(i18nKeys.common.status.connected)
                : $t(i18nKeys.console.accountSettings.linkGitHubAccount)}
          </Button>
        </div>
      {/if}

      {#if operationError}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p class="font-medium text-destructive">{$t(i18nKeys.console.accountSettings.operationFailed)}</p>
          <p class="mt-1.5 break-words text-muted-foreground">{operationError}</p>
        </div>
      {/if}
    </section>
  </div>
</SettingsShell>

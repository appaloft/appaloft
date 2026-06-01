<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    BookOpen,
    ChevronUp,
    GitBranch,
    LogOut,
    Rocket,
    Settings2,
    UserRound,
  } from "@lucide/svelte";

  import { API_BASE, request } from "$lib/api/client";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries, defaultAuthSession } from "$lib/console/queries";
  import { initials, readSessionIdentity } from "$lib/console/utils";
  import { i18nKeys, locale, setLocale, t } from "$lib/i18n";

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

  const pathname = $derived(page.url.pathname);
  const authSession = $derived(authSessionQuery.data ?? defaultAuthSession);
  const githubProvider = $derived(
    authSession.providers.find((provider) => provider.key === "github") ?? null,
  );
  const githubConnected = $derived(Boolean(githubProvider?.connected));
  const authIdentity = $derived(readSessionIdentity(authSession.session));

  async function connectGitHub(): Promise<void> {
    const response = await request<{ redirect: boolean; url?: string }>(
      authSession.session && !githubConnected ? "/api/auth/link-social" : "/api/auth/sign-in/social",
      {
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
      },
    );

    if (response.url && browser) {
      window.location.href = response.url;
    }
  }

  async function signOut(): Promise<void> {
    await request<{ success?: boolean }>("/api/auth/sign-out", {
      method: "POST",
    });

    if (browser) {
      window.location.href = "/login";
    }
  }

  function openDocumentation(): void {
    if (browser) {
      window.open(webDocsHrefs.docsHome, "_blank", "noreferrer");
    }
  }

  function navigateTo(path: string): void {
    if (browser) {
      void goto(path);
    }
  }
</script>

<DropdownMenu>
  <DropdownMenuTrigger
    data-console-user-menu-trigger
    class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
  >
    <Avatar size="sm">
      <AvatarFallback>{initials(authIdentity ?? "Appaloft")}</AvatarFallback>
    </Avatar>
    <span class="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
      <span class="block truncate text-sm font-medium">{authIdentity ?? $t(i18nKeys.common.status.unauthenticated)}</span>
      <span class="block truncate text-xs text-muted-foreground">
        GitHub {githubConnected ? $t(i18nKeys.common.status.connected) : authIdentity ? $t(i18nKeys.common.status.pendingAuthorization) : $t(i18nKeys.common.status.onDemandAuthorization)}
      </span>
    </span>
    <ChevronUp class="size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
  </DropdownMenuTrigger>
  <DropdownMenuContent
    align="start"
    side="top"
    sideOffset={6}
    class="max-h-[min(28rem,calc(100vh-5rem))] w-(--bits-dropdown-menu-anchor-width) min-w-64"
  >
    <DropdownMenuLabel>
      <div class="flex items-center gap-2">
        <UserRound class="size-4" />
        <span class="min-w-0 truncate">{authIdentity ?? $t(i18nKeys.console.shell.userSettings)}</span>
      </div>
    </DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem disabled={!githubProvider?.configured || githubConnected} onclick={connectGitHub}>
      <GitBranch class="size-4" />
      {githubConnected ? `GitHub ${$t(i18nKeys.common.status.connected)}` : $t(i18nKeys.common.actions.connectGitHub)}
    </DropdownMenuItem>
    <DropdownMenuItem onclick={() => navigateTo("/organization")}>
      <UserRound class="size-4" />
      {$t(i18nKeys.console.nav.organization)}
    </DropdownMenuItem>
    <DropdownMenuItem onclick={() => navigateTo("/account/profile")}>
      <UserRound class="size-4" />
      {$t(i18nKeys.console.accountSettings.introTitle)}
    </DropdownMenuItem>
    <DropdownMenuItem onclick={() => navigateTo("/instance")}>
      <Settings2 class="size-4" />
      {$t(i18nKeys.console.nav.instance)}
    </DropdownMenuItem>
    <DropdownMenuItem onclick={() => navigateTo("/deployments")}>
      <Rocket class="size-4" />
      {$t(i18nKeys.console.deployments.records)}
    </DropdownMenuItem>
    <DropdownMenuItem onclick={openDocumentation}>
      <BookOpen class="size-4" />
      {$t(i18nKeys.common.actions.openDocumentation)}
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuLabel>{$t(i18nKeys.common.language.label)}</DropdownMenuLabel>
    <DropdownMenuRadioGroup value={$locale}>
      <DropdownMenuRadioItem value="zh-CN" onclick={() => setLocale("zh-CN")}>
        {$t(i18nKeys.common.language.simplifiedChinese)}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="en-US" onclick={() => setLocale("en-US")}>
        {$t(i18nKeys.common.language.english)}
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
    {#if authSession.session}
      <DropdownMenuSeparator />
      <DropdownMenuItem data-console-sign-out-action onclick={signOut}>
        <LogOut class="size-4" />
        {$t(i18nKeys.common.actions.signOut)}
      </DropdownMenuItem>
    {:else}
      <DropdownMenuSeparator />
      <DropdownMenuItem onclick={() => navigateTo(`/login?next=${encodeURIComponent(pathname)}`)}>
        <UserRound class="size-4" />
        {$t(i18nKeys.console.authBootstrap.signIn)}
      </DropdownMenuItem>
    {/if}
  </DropdownMenuContent>
</DropdownMenu>

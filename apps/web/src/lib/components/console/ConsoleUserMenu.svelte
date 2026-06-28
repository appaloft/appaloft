<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    BookOpen,
    ChevronUp,
    Globe2,
    House,
    Languages,
    LogOut,
    Moon,
    Rocket,
    Settings2,
    Sun,
    UserRound,
  } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";

  import { request } from "$lib/api/client";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import {
    instanceAccessCapabilityKey,
    preloadInstanceAccessCapability,
  } from "$lib/console/instance-access";
  import { createConsoleQueries, defaultAuthSession } from "$lib/console/queries";
  import { initials, readSessionIdentity } from "$lib/console/utils";
  import { i18nKeys, locale, setLocale, t } from "$lib/i18n";
  import { capabilities } from "$lib/capabilities";
  import {
    systemPluginExtensionAccountMenuBadgePresentation,
    systemPluginExtensionIconPresentation,
    systemPluginExtensionTitle,
  } from "$lib/console/web-extension-presentation";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  type OrganizationBadgeContext = {
    organizationId?: string;
    slug?: string;
    name?: string;
    role?: string;
  };

  type Props = {
    colorMode?: "light" | "dark";
    extensions?: readonly SystemPluginWebExtension[];
    loading?: boolean;
    organization?: OrganizationBadgeContext | null;
    onColorModeChange?: (mode: "light" | "dark") => void;
  };

  let {
    colorMode = "light",
    extensions = [],
    loading = false,
    organization = null,
    onColorModeChange,
  }: Props = $props();

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
  const authSessionLoading = $derived(
    loading || (authSessionQuery.isLoading && !authSessionQuery.data),
  );
  const authIdentity = $derived(readSessionIdentity(authSession.session));
  const showInstanceManagementLink = $derived(
    $capabilities.capabilities[instanceAccessCapabilityKey]?.allowed === true,
  );
  const extensionBadgeRequests = $derived.by(() =>
    extensions
      .map((extension) => {
        const badge = systemPluginExtensionAccountMenuBadgePresentation(extension);
        if (!badge) {
          return null;
        }

        return {
          key: extension.key,
          endpoint: resolveOrganizationEndpoint(badge.endpoint),
          valuePath: badge.valuePath,
        };
      })
      .filter(
        (entry): entry is { key: string; endpoint: string; valuePath: string } =>
          entry !== null,
      ),
  );
  const extensionBadgesQuery = createQuery(() =>
    queryOptions({
      queryKey: [
        "system-plugins",
        "account-menu-badges",
        organization?.organizationId ?? "",
        $locale,
        extensionBadgeRequests
          .map((entry) => `${entry.key}:${entry.endpoint}:${entry.valuePath}`)
          .join("|"),
      ],
      queryFn: async () => {
        const entries = await Promise.all(
          extensionBadgeRequests.map(async (entry) => {
            const result = await request<unknown>(entry.endpoint);
            return [entry.key, readStringPath(result, entry.valuePath)] as const;
          }),
        );
        return Object.fromEntries(
          entries.filter((entry): entry is readonly [string, string] => entry[1] !== null),
        );
      },
      enabled: browser && extensionBadgeRequests.length > 0,
      staleTime: 30_000,
    }),
  );
  const extensionBadges = $derived(extensionBadgesQuery.data ?? {});

  $effect(() => {
    if (browser && authSession.session) {
      void preloadInstanceAccessCapability();
    }
  });

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

  function openWebsite(): void {
    if (browser) {
      window.open("https://appaloft.com", "_blank", "noreferrer");
    }
  }

  function navigateTo(path: string): void {
    if (browser) {
      void goto(path);
    }
  }

  function activateExtension(extension: SystemPluginWebExtension): void {
    if (!browser) {
      return;
    }

    if (extension.target === "external-page") {
      window.open(extension.path, "_blank", "noreferrer");
      return;
    }

    void goto(extension.path);
  }

  function resolveOrganizationEndpoint(endpoint: string): string {
    return endpoint
      .replaceAll("{organizationId}", encodeURIComponent(organization?.organizationId ?? ""))
      .replaceAll("{organizationSlug}", encodeURIComponent(organization?.slug ?? ""))
      .replaceAll("{organizationName}", encodeURIComponent(organization?.name ?? ""))
      .replaceAll("{organizationRole}", encodeURIComponent(organization?.role ?? ""));
  }

  function readStringPath(value: unknown, path: string): string | null {
    let current = value;
    for (const segment of path.split(".").filter(Boolean)) {
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return typeof current === "string" && current.trim().length > 0 ? current : null;
  }
</script>

<DropdownMenu>
  <DropdownMenuTrigger
    data-console-user-menu-trigger
    aria-busy={authSessionLoading}
    class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
  >
    {#if authSessionLoading}
      <Skeleton class="size-8 shrink-0 rounded-full" data-console-user-menu-loading-avatar />
    {:else}
      <Avatar size="sm">
        <AvatarFallback>{initials(authIdentity ?? "Appaloft")}</AvatarFallback>
      </Avatar>
    {/if}
    <span class="min-w-0 flex-1 self-center group-data-[collapsible=icon]:hidden">
      {#if authSessionLoading}
        <Skeleton class="h-4 w-24" data-console-user-menu-loading-label />
      {:else}
        <span class="block truncate text-sm font-medium">{authIdentity ?? $t(i18nKeys.common.status.unauthenticated)}</span>
      {/if}
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
        {#if authSessionLoading}
          <Skeleton class="size-4 shrink-0 rounded-full" />
          <Skeleton class="h-4 w-32" data-console-user-menu-loading-menu-label />
        {:else}
          <UserRound class="size-4" />
          <span class="min-w-0 truncate">{authIdentity ?? $t(i18nKeys.console.shell.userSettings)}</span>
        {/if}
      </div>
    </DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem onclick={() => navigateTo("/")}>
      <House class="size-4" />
      {$t(i18nKeys.console.nav.home)}
    </DropdownMenuItem>
    <DropdownMenuItem onclick={() => navigateTo("/organization")}>
      <UserRound class="size-4" />
      {$t(i18nKeys.console.nav.organization)}
    </DropdownMenuItem>
    <DropdownMenuItem onclick={() => navigateTo("/account/profile")}>
      <UserRound class="size-4" />
      {$t(i18nKeys.console.accountSettings.introTitle)}
    </DropdownMenuItem>
    {#if showInstanceManagementLink}
      <DropdownMenuItem onclick={() => navigateTo("/instance")}>
        <Settings2 class="size-4" />
        {$t(i18nKeys.console.nav.instance)}
      </DropdownMenuItem>
    {/if}
    <DropdownMenuItem onclick={() => navigateTo("/deployments")}>
      <Rocket class="size-4" />
      {$t(i18nKeys.console.deployments.records)}
    </DropdownMenuItem>
    <DropdownMenuItem onclick={openWebsite}>
      <Globe2 class="size-4" />
      {$t(i18nKeys.common.actions.openWebsite)}
    </DropdownMenuItem>
    <DropdownMenuItem onclick={openDocumentation}>
      <BookOpen class="size-4" />
      {$t(i18nKeys.common.actions.openDocumentation)}
    </DropdownMenuItem>
    {#if extensions.length > 0}
      <DropdownMenuSeparator />
      {#each extensions as extension (extension.key)}
        {@const extensionLabel = systemPluginExtensionTitle(extension, $locale)}
        {@const extensionIcon = systemPluginExtensionIconPresentation(extension)}
        <DropdownMenuItem onclick={() => activateExtension(extension)}>
          {#if extensionIcon.kind === "image"}
            <img
              class="size-4 shrink-0 rounded-sm object-contain"
              src={extensionIcon.src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              data-system-plugin-extension-icon-image
            />
          {:else}
            {@const ExtensionIcon = extensionIcon.component}
            <ExtensionIcon class="size-4" />
          {/if}
          <span class="min-w-0 truncate">{extensionLabel}</span>
          {#if extensionBadges[extension.key]}
            <Badge variant="outline" class="ml-auto max-w-28 shrink-0 truncate px-1.5 py-0 text-[0.6875rem]">
              {extensionBadges[extension.key]}
            </Badge>
          {/if}
        </DropdownMenuItem>
      {/each}
    {/if}
    <DropdownMenuSeparator />
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {#if colorMode === "dark"}
          <Moon class="size-4" />
        {:else}
          <Sun class="size-4" />
        {/if}
        {$t(i18nKeys.common.theme.label)}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent class="min-w-44">
        <DropdownMenuRadioGroup value={colorMode}>
          <DropdownMenuRadioItem value="light" onclick={() => onColorModeChange?.("light")}>
            <Sun class="size-4" />
            {$t(i18nKeys.common.theme.light)}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" onclick={() => onColorModeChange?.("dark")}>
            <Moon class="size-4" />
            {$t(i18nKeys.common.theme.dark)}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Languages class="size-4" />
        {$t(i18nKeys.common.language.label)}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={$locale}>
          <DropdownMenuRadioItem value="zh-CN" onclick={() => setLocale("zh-CN")}>
            {$t(i18nKeys.common.language.simplifiedChinese)}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en-US" onclick={() => setLocale("en-US")}>
            {$t(i18nKeys.common.language.english)}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    {#if authSessionLoading}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled>
        <Skeleton class="size-4 shrink-0 rounded-sm" />
        <Skeleton class="h-4 w-20" data-console-user-menu-loading-action />
      </DropdownMenuItem>
    {:else if authSession.session}
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

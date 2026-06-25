<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    BookOpen,
    ChevronUp,
    Globe2,
    House,
    LogOut,
    Rocket,
    Settings2,
    UserRound,
  } from "@lucide/svelte";

  import { request } from "$lib/api/client";
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
  import {
    instanceAccessCapabilityKey,
    preloadInstanceAccessCapability,
  } from "$lib/console/instance-access";
  import { createConsoleQueries, defaultAuthSession } from "$lib/console/queries";
  import { initials, readSessionIdentity } from "$lib/console/utils";
  import { i18nKeys, locale, setLocale, t } from "$lib/i18n";
  import { capabilities } from "$lib/capabilities";
  import {
    systemPluginExtensionIconPresentation,
    systemPluginExtensionTitle,
  } from "$lib/console/web-extension-presentation";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  type Props = {
    extensions?: readonly SystemPluginWebExtension[];
  };

  let { extensions = [] }: Props = $props();

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
  const authIdentity = $derived(readSessionIdentity(authSession.session));
  const showInstanceManagementLink = $derived(
    $capabilities.capabilities[instanceAccessCapabilityKey]?.allowed === true,
  );

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
</script>

<DropdownMenu>
  <DropdownMenuTrigger
    data-console-user-menu-trigger
    class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
  >
    <Avatar size="sm">
      <AvatarFallback>{initials(authIdentity ?? "Appaloft")}</AvatarFallback>
    </Avatar>
    <span class="min-w-0 flex-1 self-center group-data-[collapsible=icon]:hidden">
      <span class="block truncate text-sm font-medium">{authIdentity ?? $t(i18nKeys.common.status.unauthenticated)}</span>
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
          {extensionLabel}
        </DropdownMenuItem>
      {/each}
    {/if}
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

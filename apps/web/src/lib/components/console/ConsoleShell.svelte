<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    BookOpen,
    Check,
    ChevronDown,
    Database,
    ChevronUp,
    FolderOpen,
    Gauge,
    GitBranch,
    Globe2,
    LogIn,
    LogOut,
    Moon,
    Package,
    Play,
    Rocket,
    Server,
    ServerCrash,
    ShieldCheck,
    Settings2,
    Sun,
    UserRound,
  } from "@lucide/svelte";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";
  import type { Snippet } from "svelte";

  import { API_BASE, readErrorMessage, request } from "$lib/api/client";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";
  import { Badge } from "$lib/components/ui/badge";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb";
  import { Button } from "$lib/components/ui/button";
  import { webDocsHrefs } from "$lib/console/docs-help";
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
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInput,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
  } from "$lib/components/ui/sidebar";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import { createConsoleQueries, defaultAuthSession } from "$lib/console/queries";
  import {
    consoleSidebarOpenStorageKey,
    defaultConsoleSidebarOpen,
    readBrowserConsoleSidebarOpen,
  } from "$lib/console/sidebar-state";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";
  import {
    initials,
    projectDetailHref,
    readSessionIdentity,
  } from "$lib/console/utils";
  import { i18nKeys, locale, setLocale, t } from "$lib/i18n";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  type BreadcrumbItem = {
    label: string;
    href?: string;
  };

  type Props = {
    title: string;
    description: string;
    breadcrumbs?: BreadcrumbItem[];
    children: Snippet;
  };

  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
  };

  const navigationItems = [
    { href: "/", labelKey: i18nKeys.console.nav.home, icon: Gauge },
    { href: "/projects", labelKey: i18nKeys.console.nav.projects, icon: FolderOpen },
    { href: "/servers", labelKey: i18nKeys.console.nav.servers, icon: Server },
    {
      href: "/dependency-resources",
      labelKey: i18nKeys.console.nav.dependencyResources,
      icon: Database,
    },
    { href: "/domain-bindings", labelKey: i18nKeys.console.nav.domainBindings, icon: Globe2 },
    { href: "/deployments", labelKey: i18nKeys.console.nav.deployments, icon: Rocket },
    {
      href: "/preview-policies",
      labelKey: i18nKeys.console.nav.previewPolicies,
      icon: ShieldCheck,
    },
  ] as const;

  let { title, description, breadcrumbs = [], children }: Props = $props();
  let projectSearch = $state("");
  let colorMode = $state<"light" | "dark">("light");
  let colorModeReady = $state(false);
  let sidebarOpen = $state(
    browser ? readBrowserConsoleSidebarOpen(window) : defaultConsoleSidebarOpen,
  );
  let sidebarReady = $state(false);

  const {
    healthQuery,
    authSessionQuery,
    projectsQuery,
  } = createConsoleQueries(browser, {
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
  });
  const webExtensionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system-plugins", "web-extensions"],
      queryFn: () => request<SystemPluginWebExtensionsResponse>("/api/system-plugins/web-extensions"),
      enabled: browser,
      staleTime: 30_000,
    }),
  );
  const organizationContextQuery = createQuery(() =>
    queryOptions({
      queryKey: ["organizations", "current-context"],
      queryFn: () => orpcClient.organizations.currentContext({}),
      enabled: browser,
      retry: 0,
      staleTime: 30_000,
    }),
  );
  const switchCurrentOrganizationMutation = createMutation(() => ({
    mutationFn: (organizationId: string) =>
      orpcClient.organizations.switchCurrent({ organizationId }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  }));

  const pathname = $derived(page.url.pathname);
  const authSession = $derived(authSessionQuery.data ?? defaultAuthSession);
  const organizationContext = $derived(organizationContextQuery.data ?? null);
  const currentOrganization = $derived(organizationContext?.currentOrganization ?? null);
  const organizations = $derived(organizationContext?.organizations ?? []);
  const currentOrganizationName = $derived(
    currentOrganization?.name ?? $t(i18nKeys.common.app.productName),
  );
  const currentOrganizationDetail = $derived(
    currentOrganization
      ? `${currentOrganization.slug} · ${roleLabel(currentOrganization.role)}`
      : $t(i18nKeys.common.app.consoleSubtitle),
  );
  const projects = $derived(projectsQuery.data?.items ?? []);
  const navigationExtensions = $derived.by(() =>
    (webExtensionsQuery.data?.items ?? [])
      .filter((extension) => extension.placement === "navigation")
      .toSorted((a, b) => a.title.localeCompare(b.title)),
  );
  const filteredProjects = $derived.by(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) {
      return projects;
    }

    return projects.filter((project) => {
      const projectMatches = [project.name, project.slug, project.description ?? ""].some(
        (value) => value.toLowerCase().includes(query),
      );

      return projectMatches;
    });
  });
  const githubProvider = $derived(
    authSession.providers.find((provider) => provider.key === "github") ?? null,
  );
  const githubConnected = $derived(Boolean(githubProvider?.connected));
  const authIdentity = $derived(readSessionIdentity(authSession.session));
  const loginRequired = $derived(authSession.loginRequired && !authSession.session);
  const loginHref = $derived(`/login?next=${encodeURIComponent(pathname)}`);
  const connectionError = $derived(healthQuery.error ? readErrorMessage(healthQuery.error) : "");
  const colorModeLabel = $derived(
    colorMode === "dark"
      ? $t(i18nKeys.common.actions.switchToLightMode)
      : $t(i18nKeys.common.actions.switchToDarkMode),
  );
  const activeProjectId = $derived.by(() => {
    const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
    return projectMatch?.[1] ? decodeURIComponent(projectMatch[1]) : "";
  });
  const visibleBreadcrumbs = $derived.by<BreadcrumbItem[]>(() => {
    if (breadcrumbs.length > 0) {
      return breadcrumbs;
    }

    if (pathname === "/") {
      return [{ label: title }];
    }

    return [
      { label: $t(i18nKeys.console.nav.home), href: "/" },
      { label: title },
    ];
  });

  $effect(() => {
    if (!browser) {
      return;
    }

    sidebarOpen = readBrowserConsoleSidebarOpen(window);

    requestAnimationFrame(() => {
      sidebarReady = true;
    });

    const storedMode = window.localStorage.getItem("appaloft:color-mode");
    if (storedMode === "light" || storedMode === "dark") {
      colorMode = storedMode;
    }
    colorModeReady = true;
  });

  $effect(() => {
    if (!browser || !colorModeReady) {
      return;
    }

    document.documentElement.classList.toggle("dark", colorMode === "dark");
    document.documentElement.style.colorScheme = colorMode;
    window.localStorage.setItem("appaloft:color-mode", colorMode);
  });

  $effect(() => {
    if (!browser || !sidebarReady) {
      return;
    }

    window.localStorage.setItem(consoleSidebarOpenStorageKey, String(sidebarOpen));
  });

  $effect(() => {
    if (!browser) {
      return;
    }

    const openQuickDeploy = () => {
      void goto("/deploy");
    };

    window.addEventListener("appaloft:open-quick-deploy", openQuickDeploy);
    return () => {
      window.removeEventListener("appaloft:open-quick-deploy", openQuickDeploy);
    };
  });

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

  function openHealthCheck(): void {
    if (browser) {
      window.open(`${API_BASE}/api/health`, "_blank");
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

  function roleLabel(role: string): string {
    if (role === "owner") {
      return $t(i18nKeys.console.organization.roleOwner);
    }
    if (role === "admin") {
      return $t(i18nKeys.console.organization.roleAdmin);
    }
    if (role === "developer") {
      return $t(i18nKeys.console.organization.roleDeveloper);
    }
    if (role === "billing") {
      return $t(i18nKeys.console.organization.roleBilling);
    }
    return $t(i18nKeys.console.organization.roleViewer);
  }

  function switchOrganization(organizationId: string): void {
    if (!organizationId || organizationId === currentOrganization?.organizationId) {
      return;
    }

    switchCurrentOrganizationMutation.mutate(organizationId);
  }

  function isNavigationActive(href: string): boolean {
    return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  function toggleColorMode(): void {
    colorMode = colorMode === "dark" ? "light" : "dark";
  }
</script>

<SidebarProvider
  bind:open={sidebarOpen}
  class={!sidebarReady
    ? "[&_[data-slot=sidebar-container]]:!transition-none [&_[data-slot=sidebar-gap]]:!transition-none"
    : ""}
>
  <Sidebar variant="sidebar" collapsible="icon">
    <SidebarHeader class="gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          data-console-organization-switcher-trigger
          class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Avatar size="sm" class="shrink-0">
            <AvatarFallback>{initials(currentOrganizationName)}</AvatarFallback>
          </Avatar>
          <span class="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span class="block truncate text-sm font-medium">{currentOrganizationName}</span>
            <span class="block truncate text-xs text-muted-foreground">
              {currentOrganizationDetail}
            </span>
          </span>
          <ChevronDown class="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={6}
          class="max-h-[min(26rem,calc(100vh-7rem))] w-(--bits-dropdown-menu-anchor-width) min-w-64"
        >
          <DropdownMenuLabel>
            <div class="flex items-center gap-2">
              <img
                src={appaloftIcon}
                alt={$t(i18nKeys.common.app.productName)}
                class="size-5 shrink-0 object-contain"
              />
              <span class="min-w-0 truncate">{$t(i18nKeys.console.organization.switchTitle)}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {#if organizations.length > 0}
            {#each organizations as organization (organization.organizationId)}
              {@const organizationIsCurrent = organization.organizationId === currentOrganization?.organizationId}
              <DropdownMenuItem
                disabled={organizationIsCurrent || switchCurrentOrganizationMutation.isPending}
                onclick={() => switchOrganization(organization.organizationId)}
                class="gap-2"
              >
                <Avatar size="sm">
                  <AvatarFallback>{initials(organization.name)}</AvatarFallback>
                </Avatar>
                <span class="min-w-0 flex-1">
                  <span class="block truncate">{organization.name}</span>
                  <span class="block truncate text-xs text-muted-foreground">
                    {organization.slug} · {roleLabel(organization.role)}
                  </span>
                </span>
                {#if organizationIsCurrent}
                  <Check class="size-4 text-primary" />
                {/if}
              </DropdownMenuItem>
            {/each}
          {:else}
            <DropdownMenuItem disabled>
              <Avatar size="sm">
                <AvatarFallback>{initials(currentOrganizationName)}</AvatarFallback>
              </Avatar>
              <span class="min-w-0 flex-1">
                <span class="block truncate">{currentOrganizationName}</span>
                <span class="block truncate text-xs text-muted-foreground">
                  {currentOrganizationDetail}
                </span>
              </span>
            </DropdownMenuItem>
          {/if}
          <DropdownMenuSeparator />
          <DropdownMenuItem onclick={() => navigateTo("/organization")}>
            <UserRound class="size-4" />
            {$t(i18nKeys.console.nav.organization)}
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => navigateTo("/instance")}>
            <Settings2 class="size-4" />
            {$t(i18nKeys.console.nav.instance)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SidebarInput
        bind:value={projectSearch}
        class="group-data-[collapsible=icon]:hidden"
        placeholder={$t(i18nKeys.console.shell.projectSearch)}
      />
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>{$t(i18nKeys.console.nav.workspace)}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {#each navigationItems as item (item.href)}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isNavigationActive(item.href)}
                  tooltipContent={$t(item.labelKey)}
                >
                  {#snippet child({ props })}
                    <a href={item.href} {...props}>
                      <item.icon class="size-4" />
                      <span>{$t(item.labelKey)}</span>
                    </a>
                  {/snippet}
                </SidebarMenuButton>
              </SidebarMenuItem>
            {/each}
            {#each navigationExtensions as extension (extension.key)}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isNavigationActive(extension.path)}
                  tooltipContent={extension.title}
                >
                  {#snippet child({ props })}
                    <a
                      href={extension.path}
                      target={extension.target === "external-page" ? "_blank" : undefined}
                      rel={extension.target === "external-page" ? "noreferrer" : undefined}
                      {...props}
                    >
                      <Package class="size-4" />
                      <span>{extension.title}</span>
                    </a>
                  {/snippet}
                </SidebarMenuButton>
              </SidebarMenuItem>
            {/each}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>{$t(i18nKeys.common.domain.projects)}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {#if filteredProjects.length > 0}
              {#each filteredProjects.slice(0, 8) as project (project.id)}
                {@const projectIsActive = activeProjectId === project.id}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    class={[
                      "relative !bg-transparent !shadow-none data-[active=true]:!bg-transparent data-[active=true]:!text-sidebar-foreground data-[active=true]:!shadow-none data-[active=true]:hover:!bg-transparent [&[data-active=true]_svg]:!text-sidebar-foreground",
                      projectIsActive
                        ? "before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                        : "",
                    ]}
                    isActive={projectIsActive}
                    tooltipContent={project.name}
                  >
                    {#snippet child({ props })}
                      <a href={projectDetailHref(project.id)} {...props}>
                        <FolderOpen class="size-4" />
                        <span>{project.name}</span>
                      </a>
                    {/snippet}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              {/each}
            {:else}
              <SidebarMenuItem>
                <SidebarMenuButton tooltipContent={$t(i18nKeys.console.shell.noProjects)}>
                  {#snippet child({ props })}
                    <a href="/projects" {...props}>
                      <Package class="size-4" />
                      <span>{$t(i18nKeys.console.shell.noProjects)}</span>
                    </a>
                  {/snippet}
                </SidebarMenuButton>
              </SidebarMenuItem>
            {/if}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
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
          {#if authSession.session}
            <DropdownMenuItem data-console-sign-out-action onclick={signOut}>
              <LogOut class="size-4" />
              {$t(i18nKeys.common.actions.signOut)}
            </DropdownMenuItem>
          {/if}
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
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  </Sidebar>

  <SidebarInset>
    <header
      data-console-header
      class="sticky top-0 z-10 flex h-14 items-center justify-between border-b px-4 backdrop-blur-md md:px-6"
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <SidebarTrigger />
        <div class="min-w-0">
          {#if visibleBreadcrumbs.length > 0}
            <Breadcrumb.Root class="min-w-0">
              <Breadcrumb.List class="flex-nowrap gap-1 overflow-hidden sm:gap-1.5">
                {#each visibleBreadcrumbs as item, index (`${item.label}-${index}`)}
                  <Breadcrumb.Item class="min-w-0">
                    {#if item.href && index < visibleBreadcrumbs.length - 1}
                      <Breadcrumb.Link class="truncate" href={item.href}>
                        {item.label}
                      </Breadcrumb.Link>
                    {:else}
                      <Breadcrumb.Page class="truncate">{item.label}</Breadcrumb.Page>
                    {/if}
                  </Breadcrumb.Item>
                  {#if index < visibleBreadcrumbs.length - 1}
                    <Breadcrumb.Separator class="shrink-0" />
                  {/if}
                {/each}
              </Breadcrumb.List>
            </Breadcrumb.Root>
          {/if}
          <p class="truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button
          aria-label={colorModeLabel}
          title={colorModeLabel}
          size="icon-sm"
          variant="outline"
          onclick={toggleColorMode}
        >
          {#if colorMode === "dark"}
            <Sun class="size-4" />
          {:else}
            <Moon class="size-4" />
          {/if}
        </Button>
        <Button
          href="/deploy"
          size="sm"
          variant="outline"
        >
          <Play class="size-4" />
          {$t(i18nKeys.common.actions.quickDeploy)}
        </Button>
      </div>
    </header>

    <main data-console-main class="min-w-0 flex-1 p-4 md:p-6">
      {#if connectionError}
        <section class="console-panel space-y-4 p-5">
          <div class="space-y-2">
            <h2 class="flex items-center gap-2 text-lg font-semibold">
              <ServerCrash class="size-5" />
              {$t(i18nKeys.errors.web.backendUnavailable)}
            </h2>
            <p class="text-sm text-muted-foreground">
              {$t(i18nKeys.errors.web.backendUnavailableDescription)}
            </p>
          </div>
          <div class="space-y-4">
            <pre class="overflow-x-auto bg-muted px-3 py-3 text-xs text-muted-foreground">{connectionError}</pre>
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" onclick={openHealthCheck}>{$t(i18nKeys.common.actions.checkHealth)}</Button>
              <Badge variant="outline">appaloft db migrate && appaloft serve</Badge>
            </div>
          </div>
        </section>
      {:else}
        {#if loginRequired}
          <section class="console-panel flex max-w-xl flex-col gap-4 p-6">
            <div class="flex items-start gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30">
                <ShieldCheck class="size-5 text-primary" />
              </div>
              <div class="space-y-1.5">
                <h2 class="text-lg font-semibold">{$t(i18nKeys.console.authBootstrap.loginTitle)}</h2>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.authBootstrap.loginBody)}
                </p>
              </div>
            </div>
            <Button href={loginHref} class="w-fit">
              <LogIn class="size-4" />
              {$t(i18nKeys.console.authBootstrap.signIn)}
            </Button>
          </section>
        {:else}
          {@render children()}
        {/if}
      {/if}
    </main>
  </SidebarInset>
</SidebarProvider>

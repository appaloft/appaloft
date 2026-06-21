<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    Check,
    ChevronDown,
    Database,
    FolderOpen,
    Gauge,
    Globe2,
    LogIn,
    Moon,
    Package,
    ArrowRight,
    Rocket,
    Server,
    ServerCrash,
    ShieldCheck,
    Sun,
  } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { API_BASE, readErrorMessage, request } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ConsoleOrganizationSwitcher from "$lib/components/console/ConsoleOrganizationSwitcher.svelte";
  import QuickDeploySheet from "$lib/components/console/QuickDeploySheet.svelte";
  import ConsoleUserMenu from "$lib/components/console/ConsoleUserMenu.svelte";
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
  import {
    systemPluginExtensionIcon,
    systemPluginExtensionTitle,
  } from "$lib/console/web-extension-presentation";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";
  import { projectDetailHref } from "$lib/console/utils";
  import { i18nKeys, locale, t } from "$lib/i18n";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  type BreadcrumbItem = {
    label: string;
    href?: string;
    kind?: "home" | "project" | "environment" | "resource" | "deployment";
    loading?: boolean;
    switcherLabel?: string;
    switcherItems?: BreadcrumbSwitcherItem[];
  };

  type BreadcrumbSwitcherItem = {
    label: string;
    href: string;
    selected?: boolean;
  };

  type Props = {
    title: string;
    description: string;
    breadcrumbs?: BreadcrumbItem[];
    quickDeployModalEnabled?: boolean;
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
  ] as const;

  let { title, breadcrumbs = [], quickDeployModalEnabled = true, children }: Props = $props();
  let projectSearch = $state("");
  let colorMode = $state<"light" | "dark">("light");
  let colorModeReady = $state(false);
  let quickDeployDialogOpen = $state(false);
  let quickDeployProgressDialogOpen = $state(false);
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
    orpc.organizations.currentContext.queryOptions({
      input: {},
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
  const projects = $derived(projectsQuery.data?.items ?? []);
  const projectsLoading = $derived(projectsQuery.isPending && projects.length === 0);
  const navigationExtensions = $derived.by(() =>
    (webExtensionsQuery.data?.items ?? [])
      .filter((extension) => extension.placement === "navigation")
      .filter(isWorkspaceNavigationExtension)
      .toSorted((a, b) =>
        systemPluginExtensionTitle(a, $locale).localeCompare(
          systemPluginExtensionTitle(b, $locale),
        ),
      ),
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
    quickDeployDialogOpen =
      quickDeployModalEnabled && modalIsOpen(page, "quick-deploy");
  });

  function openHealthCheck(): void {
    if (browser) {
      window.open(`${API_BASE}/api/health`, "_blank");
    }
  }

  function navigateTo(path: string): void {
    if (browser) {
      void goto(path);
    }
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

  function isWorkspaceNavigationExtension(extension: SystemPluginWebExtension): boolean {
    const path = extension.path.split("?")[0] ?? extension.path;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return (
      normalizedPath !== "/instance" &&
      !normalizedPath.startsWith("/instance/") &&
      normalizedPath !== "/organization" &&
      !normalizedPath.startsWith("/organization/")
    );
  }

  function toggleColorMode(): void {
    colorMode = colorMode === "dark" ? "light" : "dark";
  }

  function switcherItems(item: BreadcrumbItem): BreadcrumbSwitcherItem[] {
    return item.switcherItems ?? [];
  }

  function setQuickDeployDialogOpen(open: boolean): void {
    if (!open && quickDeployProgressDialogOpen) {
      return;
    }

    quickDeployDialogOpen = open;
    if (!open) {
      quickDeployProgressDialogOpen = false;
    }
    void setModalOpen(page, "quick-deploy", open);
  }

  function closeQuickDeployDialog(): void {
    quickDeployProgressDialogOpen = false;
    setQuickDeployDialogOpen(false);
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
      <ConsoleOrganizationSwitcher
        {currentOrganization}
        {organizations}
        pending={switchCurrentOrganizationMutation.isPending}
        onSwitch={switchOrganization}
        onNavigate={navigateTo}
      />
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
              {@const extensionLabel = systemPluginExtensionTitle(extension, $locale)}
              {@const ExtensionIcon = systemPluginExtensionIcon(extension)}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isNavigationActive(extension.path)}
                  tooltipContent={extensionLabel}
                >
                  {#snippet child({ props })}
                    <a
                      href={extension.path}
                      target={extension.target === "external-page" ? "_blank" : undefined}
                      rel={extension.target === "external-page" ? "noreferrer" : undefined}
                      {...props}
                    >
                      <ExtensionIcon class="size-4" />
                      <span>{extensionLabel}</span>
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
            {#if projectsLoading}
              {#each Array.from({ length: 3 }) as _, index (index)}
                <SidebarMenuItem>
                  <div
                    class="flex h-8 items-center gap-2 rounded-md px-2 group-data-[collapsible=icon]:justify-center"
                    aria-hidden="true"
                  >
                    <Skeleton class="size-4 shrink-0 rounded-sm" />
                    <Skeleton class="h-4 min-w-0 flex-1 group-data-[collapsible=icon]:hidden" />
                  </div>
                </SidebarMenuItem>
              {/each}
            {:else if filteredProjects.length > 0}
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
              {#if filteredProjects.length > 8}
                <SidebarMenuItem>
                  <SidebarMenuButton tooltipContent={$t(i18nKeys.common.actions.viewAll)}>
                    {#snippet child({ props })}
                      <a href="/projects" {...props}>
                        <ArrowRight class="size-4" />
                        <span>{$t(i18nKeys.common.actions.viewAll)}</span>
                      </a>
                    {/snippet}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              {/if}
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
      <ConsoleUserMenu />
    </SidebarFooter>
  </Sidebar>

  <SidebarInset>
    <header
      data-console-header
      class="sticky top-0 z-10 flex h-14 items-center justify-between border-b pl-2 pr-3 backdrop-blur-md md:pl-3 md:pr-4"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger />
        <div class="flex min-w-0 flex-1 items-center">
          {#if visibleBreadcrumbs.length > 0}
            <Breadcrumb.Root class="min-w-0">
              <Breadcrumb.List class="flex-nowrap gap-1 overflow-hidden sm:gap-1.5">
                {#each visibleBreadcrumbs as item, index (`${item.label}-${index}`)}
                  <Breadcrumb.Item class="min-w-0">
                    {#if item.loading}
                      <div
                        class="flex h-8 min-w-24 items-center gap-2 rounded-md px-2"
                        aria-hidden="true"
                        data-console-header-breadcrumb-skeleton
                      >
                        <Skeleton class="size-4 shrink-0 rounded-sm" />
                        <Skeleton class="h-4 w-24 min-w-0 sm:w-32" />
                      </div>
                    {:else if switcherItems(item).length > 0}
                      <DropdownMenu>
                        <div
                          data-console-header-switcher
                          class="inline-flex h-8 min-w-0 max-w-[12rem] items-center gap-1 text-sm font-medium text-foreground sm:max-w-[16rem]"
                        >
                          {#if item.href}
                            <a
                              data-console-header-switcher-link
                              href={item.href}
                              class="group/link inline-flex h-8 min-w-0 flex-1 items-center gap-2 px-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {#if item.kind === "project"}
                                <FolderOpen class="size-4 shrink-0 text-muted-foreground transition-colors group-hover/link:text-foreground" />
                              {:else if item.kind === "resource"}
                                <Package class="size-4 shrink-0 text-muted-foreground transition-colors group-hover/link:text-foreground" />
                              {:else if item.kind === "deployment"}
                                <Rocket class="size-4 shrink-0 text-muted-foreground transition-colors group-hover/link:text-foreground" />
                              {:else if item.kind === "environment"}
                                <ServerCrash class="size-4 shrink-0 text-muted-foreground transition-colors group-hover/link:text-foreground" />
                              {/if}
                              <span class="min-w-0 truncate">{item.label}</span>
                            </a>
                          {:else}
                            <span
                              data-console-header-switcher-label
                              class="inline-flex h-8 min-w-0 flex-1 items-center gap-2 px-1.5"
                            >
                              {#if item.kind === "project"}
                                <FolderOpen class="size-4 shrink-0 text-muted-foreground" />
                              {:else if item.kind === "resource"}
                                <Package class="size-4 shrink-0 text-muted-foreground" />
                              {:else if item.kind === "deployment"}
                                <Rocket class="size-4 shrink-0 text-muted-foreground" />
                              {:else if item.kind === "environment"}
                                <ServerCrash class="size-4 shrink-0 text-muted-foreground" />
                              {/if}
                              <span class="min-w-0 truncate">{item.label}</span>
                            </span>
                          {/if}
                          <DropdownMenuTrigger
                            data-console-header-switcher-trigger
                            aria-label={item.switcherLabel ?? item.label}
                            title={item.switcherLabel ?? item.label}
                            class="group/dropdown-trigger inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronDown class="size-3.5 transition-transform group-data-[state=open]/dropdown-trigger:rotate-180" />
                          </DropdownMenuTrigger>
                        </div>
                        <DropdownMenuContent
                          align="start"
                          sideOffset={6}
                          class="max-h-[min(24rem,calc(100vh-5rem))] min-w-56 max-w-72"
                        >
                          {#if item.switcherLabel}
                            <DropdownMenuLabel class="truncate">{item.switcherLabel}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                          {/if}
                          {#each switcherItems(item).slice(0, 20) as option (option.href)}
                            <DropdownMenuItem
                              class="min-w-0"
                              onclick={() => navigateTo(option.href)}
                              data-console-header-switcher-item
                            >
                              {#if option.selected}
                                <Check class="size-4 shrink-0" />
                              {:else}
                                <span class="size-4 shrink-0" aria-hidden="true"></span>
                              {/if}
                              <span class="min-w-0 flex-1 truncate">{option.label}</span>
                            </DropdownMenuItem>
                          {/each}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    {:else if item.href && index < visibleBreadcrumbs.length - 1}
                      <Breadcrumb.Link class="truncate" href={item.href}>
                        {item.label}
                      </Breadcrumb.Link>
                    {:else}
                      <Breadcrumb.Page class="inline-flex h-8 min-w-0 items-center truncate">
                        {item.label}
                      </Breadcrumb.Page>
                    {/if}
                  </Breadcrumb.Item>
                  {#if index < visibleBreadcrumbs.length - 1}
                    <Breadcrumb.Separator class="shrink-0" />
                  {/if}
                {/each}
              </Breadcrumb.List>
            </Breadcrumb.Root>
          {/if}
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
      </div>
    </header>

    <main data-console-main class="min-h-0 min-w-0 flex-1 overflow-y-auto">
      {#if connectionError}
        <section class="console-panel m-4 space-y-4 p-5 md:m-6">
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
          <section class="console-panel m-4 flex max-w-xl flex-col gap-4 p-6 md:m-6">
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

{#if quickDeployModalEnabled && quickDeployDialogOpen}
  <Dialog.Root open={true} onOpenChange={setQuickDeployDialogOpen}>
    <Dialog.Content
      closeLabel={$t(i18nKeys.common.actions.close)}
      showCloseButton={!quickDeployProgressDialogOpen}
      class={quickDeployProgressDialogOpen ? "max-w-6xl border-0 bg-transparent shadow-none" : "max-w-7xl"}
    >
      {#if !quickDeployProgressDialogOpen}
        <Dialog.Header>
          <Dialog.Title>{$t(i18nKeys.common.actions.quickDeploy)}</Dialog.Title>
          <Dialog.Description>
            {$t(i18nKeys.console.deployments.description)}
          </Dialog.Description>
        </Dialog.Header>
      {/if}
      <div
        class={quickDeployProgressDialogOpen
          ? "px-4 pb-4 pt-4"
          : "max-h-[calc(100vh-12rem)] overflow-y-auto px-5 pb-5"}
      >
        <QuickDeploySheet
          statePath={page.url.pathname}
          stateModal="quick-deploy"
          onClose={closeQuickDeployDialog}
          onProgressDialogOpenChange={(open) => {
            quickDeployProgressDialogOpen = open;
          }}
        />
      </div>
    </Dialog.Content>
  </Dialog.Root>
{/if}

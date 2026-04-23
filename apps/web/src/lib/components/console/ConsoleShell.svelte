<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    BookOpen,
    ChevronUp,
    FolderOpen,
    Gauge,
    GitBranch,
    Globe2,
    Moon,
    Package,
    Play,
    Rocket,
    Server,
    ServerCrash,
    Sun,
    UserRound,
  } from "@lucide/svelte";
  import type { ResourceSummary } from "@appaloft/contracts";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";
  import type { Snippet } from "svelte";

  import { API_BASE, readErrorMessage, request } from "$lib/api/client";
  import ResourceHealthDot from "$lib/components/console/ResourceHealthDot.svelte";
  import ResourceHealthLabel from "$lib/components/console/ResourceHealthLabel.svelte";
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
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarProvider,
    SidebarRail,
    SidebarTrigger,
  } from "$lib/components/ui/sidebar";
  import { createConsoleQueries, defaultAuthSession } from "$lib/console/queries";
  import {
    initials,
    projectDetailHref,
    readSessionIdentity,
    resourceDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, locale, setLocale, t } from "$lib/i18n";

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

  const navigationItems = [
    { href: "/", labelKey: i18nKeys.console.nav.home, icon: Gauge },
    { href: "/projects", labelKey: i18nKeys.console.nav.projects, icon: FolderOpen },
    { href: "/servers", labelKey: i18nKeys.console.nav.servers, icon: Server },
    { href: "/domain-bindings", labelKey: i18nKeys.console.nav.domainBindings, icon: Globe2 },
    { href: "/deployments", labelKey: i18nKeys.console.nav.deployments, icon: Rocket },
  ] as const;

  let { title, description, breadcrumbs = [], children }: Props = $props();
  let projectSearch = $state("");
  let colorMode = $state<"light" | "dark">("light");
  let colorModeReady = $state(false);

	const {
		healthQuery,
		versionQuery,
		authSessionQuery,
		projectsQuery,
    resourcesQuery,
    deploymentsQuery,
	} = createConsoleQueries(browser);

  const pathname = $derived(page.url.pathname);
  const version = $derived(versionQuery.data ?? null);
	const authSession = $derived(authSessionQuery.data ?? defaultAuthSession);
	const projects = $derived(projectsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
	const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const filteredProjects = $derived.by(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) {
      return projects;
    }

    return projects.filter((project) => {
      const projectMatches = [project.name, project.slug, project.description ?? ""].some(
        (value) => value.toLowerCase().includes(query),
      );

      if (projectMatches) {
        return true;
      }

      return resources.some(
        (resource) =>
          resource.projectId === project.id &&
          [resource.name, resource.slug, resource.description ?? "", resource.kind].some((value) =>
            value.toLowerCase().includes(query),
          ),
      );
    });
  });
  const githubProvider = $derived(
    authSession.providers.find((provider) => provider.key === "github") ?? null,
  );
  const githubConnected = $derived(Boolean(githubProvider?.connected));
  const authIdentity = $derived(readSessionIdentity(authSession.session));
  const connectionError = $derived(healthQuery.error ? readErrorMessage(healthQuery.error) : "");
  const deploymentModeLabel = $derived(version?.mode ?? "self-hosted");
  const colorModeLabel = $derived(
    colorMode === "dark"
      ? $t(i18nKeys.common.actions.switchToLightMode)
      : $t(i18nKeys.common.actions.switchToDarkMode),
  );
  const activeDeploymentId = $derived.by(() => {
    const match = pathname.match(/\/deployments\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  });
  const activeResourceId = $derived.by(() => {
    const match = pathname.match(/\/resources\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  });
  const activeProjectId = $derived.by(() => {
    const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
    if (projectMatch?.[1]) {
      return decodeURIComponent(projectMatch[1]);
    }

    const activeResource = resources.find((resource) => resource.id === activeResourceId);
    if (activeResource) {
      return activeResource.projectId;
    }

    const activeDeployment = deployments.find((deployment) => deployment.id === activeDeploymentId);
    return activeDeployment?.projectId ?? "";
  });

  $effect(() => {
    if (!browser) {
      return;
    }

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

  function isNavigationActive(href: string): boolean {
    return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  function projectResources(projectId: string): ResourceSummary[] {
    return resources.filter((resource) => resource.projectId === projectId);
  }

  function toggleColorMode(): void {
    colorMode = colorMode === "dark" ? "light" : "dark";
  }
</script>

<SidebarProvider>
  <Sidebar variant="inset" collapsible="icon">
    <SidebarHeader class="gap-3">
      <a class="flex items-center gap-3 px-2 py-2" href="/">
        <img
          src={appaloftIcon}
          alt={$t(i18nKeys.common.app.productName)}
          class="size-7 shrink-0 object-contain"
        />
        <span class="min-w-0 group-data-[collapsible=icon]:hidden">
          <span class="block truncate text-sm font-medium">{$t(i18nKeys.common.app.productName)}</span>
          <span class="block truncate text-xs text-muted-foreground">{$t(i18nKeys.common.app.consoleSubtitle)}</span>
        </span>
      </a>
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
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>{$t(i18nKeys.common.domain.projects)}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {#if filteredProjects.length > 0}
              {#each filteredProjects.slice(0, 8) as project (project.id)}
                {@const childResources = projectResources(project.id)}
                {@const projectIsActive = activeDeploymentId === "" && activeProjectId === project.id}
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
                  {#if childResources.length > 0}
                    <SidebarMenuSub class="!mx-0 !ml-2 !translate-x-0 !border-l-0 !px-0 !py-1">
                      {#each childResources.slice(0, 8) as resource (resource.id)}
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            class="h-7 !translate-x-0 px-1.5 text-sidebar-foreground/80 data-[active=true]:!bg-sidebar-primary/5 data-[active=true]:!text-sidebar-foreground data-[active=true]:!shadow-none data-[active=true]:hover:!bg-sidebar-primary/10"
                            isActive={activeResourceId === resource.id}
                          >
                            {#snippet child({ props })}
                              <a href={resourceDetailHref(resource)} {...props}>
                                <ResourceHealthDot resourceId={resource.id} class="shrink-0" />
                                <span class="min-w-0 flex-1 truncate">
                                  {resource.name}
                                </span>
                                <ResourceHealthLabel resourceId={resource.id} />
                              </a>
                            {/snippet}
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      {/each}
                    </SidebarMenuSub>
                  {/if}
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
          class="flex w-full items-center gap-2 px-2 py-2 text-left text-sm transition-colors hover:bg-muted/50 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
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
        <DropdownMenuContent align="end" side="top" class="w-56">
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
          <DropdownMenuItem onclick={() => navigateTo("/projects")}>
            <FolderOpen class="size-4" />
            {$t(i18nKeys.console.nav.settings)}
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
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>

  <SidebarInset>
    <header
      class="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm md:px-6"
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <SidebarTrigger />
        <div class="min-w-0">
          {#if breadcrumbs.length > 0}
            <Breadcrumb.Root class="min-w-0">
              <Breadcrumb.List class="flex-nowrap gap-1 overflow-hidden sm:gap-1.5">
                {#each breadcrumbs as item, index (`${item.label}-${index}`)}
                  <Breadcrumb.Item class="min-w-0">
                    {#if item.href && index < breadcrumbs.length - 1}
                      <Breadcrumb.Link class="truncate" href={item.href}>
                        {item.label}
                      </Breadcrumb.Link>
                    {:else}
                      <Breadcrumb.Page class="truncate">{item.label}</Breadcrumb.Page>
                    {/if}
                  </Breadcrumb.Item>
                  {#if index < breadcrumbs.length - 1}
                    <Breadcrumb.Separator class="shrink-0" />
                  {/if}
                {/each}
              </Breadcrumb.List>
            </Breadcrumb.Root>
          {:else}
            <p class="truncate text-sm font-medium">{title}</p>
          {/if}
          <p class="truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Badge variant="outline" class="hidden md:inline-flex">{deploymentModeLabel}</Badge>
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
          {$t(i18nKeys.common.actions.newDeployment)}
        </Button>
      </div>
    </header>

    <main class="min-w-0 flex-1 p-4 md:p-6">
      {#if connectionError}
        <section class="space-y-4 border-y py-5">
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
        {@render children()}
      {/if}
    </main>
  </SidebarInset>
</SidebarProvider>

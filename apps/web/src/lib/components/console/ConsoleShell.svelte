<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ChevronUp, FolderOpen, Gauge, GitBranch, Package, Play, Rocket, Server, ServerCrash, UserRound } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { API_BASE, readErrorMessage, request } from "$lib/api/client";
  import yunduLogoMark from "$lib/assets/yundu-logo-mark.svg";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
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
    SidebarRail,
    SidebarTrigger,
  } from "$lib/components/ui/sidebar";
  import { createConsoleQueries, defaultAuthSession } from "$lib/console/queries";
  import { initials, readSessionIdentity } from "$lib/console/utils";
  import { i18nKeys, locale, setLocale, t } from "$lib/i18n";

  type Props = {
    title: string;
    description: string;
    children: Snippet;
  };

  const navigationItems = [
    { href: "/", labelKey: i18nKeys.console.nav.home, icon: Gauge },
    { href: "/projects", labelKey: i18nKeys.console.nav.projects, icon: FolderOpen },
    { href: "/servers", labelKey: i18nKeys.console.nav.servers, icon: Server },
    { href: "/deployments", labelKey: i18nKeys.console.nav.deployments, icon: Rocket },
  ] as const;

  let { title, description, children }: Props = $props();
  let projectSearch = $state("");

	const {
		healthQuery,
		versionQuery,
		authSessionQuery,
		projectsQuery,
	} = createConsoleQueries(browser);

  const pathname = $derived(page.url.pathname);
  const version = $derived(versionQuery.data ?? null);
	const authSession = $derived(authSessionQuery.data ?? defaultAuthSession);
	const projects = $derived(projectsQuery.data?.items ?? []);
  const filteredProjects = $derived.by(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) {
      return projects;
    }

    return projects.filter((project) =>
      [project.name, project.slug, project.description ?? ""].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  });
  const githubProvider = $derived(
    authSession.providers.find((provider) => provider.key === "github") ?? null,
  );
  const githubConnected = $derived(Boolean(githubProvider?.connected));
  const authIdentity = $derived(readSessionIdentity(authSession.session));
  const connectionError = $derived(healthQuery.error ? readErrorMessage(healthQuery.error) : "");
  const deploymentModeLabel = $derived(version?.mode ?? "self-hosted");

  $effect(() => {
    if (!browser) {
      return;
    }

    const openQuickDeploy = () => {
      void goto("/deploy");
    };

    window.addEventListener("yundu:open-quick-deploy", openQuickDeploy);
    return () => {
      window.removeEventListener("yundu:open-quick-deploy", openQuickDeploy);
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

  function navigateTo(path: string): void {
    if (browser) {
      void goto(path);
    }
  }

  function isNavigationActive(href: string): boolean {
    return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }
</script>

<SidebarProvider>
  <Sidebar variant="inset" collapsible="icon">
    <SidebarHeader class="gap-3">
      <a class="flex items-center gap-3 rounded-md border bg-background px-3 py-2" href="/">
        <Avatar size="sm">
          <img src={yunduLogoMark} alt="yundu" class="size-full object-cover" />
          <AvatarFallback>{initials("Yundu")}</AvatarFallback>
        </Avatar>
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
                <SidebarMenuItem>
                  <SidebarMenuButton tooltipContent={project.name}>
                    {#snippet child({ props })}
                      <a href={`/projects/${project.id}`} {...props}>
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
          class="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-2 text-left text-sm transition-colors hover:bg-muted/50 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Avatar size="sm">
            <AvatarFallback>{initials(authIdentity ?? "Yundu")}</AvatarFallback>
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
      <div class="flex min-w-0 items-center gap-3">
        <SidebarTrigger />
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">{title}</p>
          <p class="truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Badge variant="outline" class="hidden md:inline-flex">{deploymentModeLabel}</Badge>
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

    <main class="flex-1 p-4 md:p-6">
      {#if connectionError}
        <Card class="border-destructive/30">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <ServerCrash class="size-5" />
              {$t(i18nKeys.errors.web.backendUnavailable)}
            </CardTitle>
            <CardDescription>
              {$t(i18nKeys.errors.web.backendUnavailableDescription)}
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <pre class="overflow-x-auto rounded-md border bg-muted px-3 py-3 text-xs text-muted-foreground">{connectionError}</pre>
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" onclick={openHealthCheck}>{$t(i18nKeys.common.actions.checkHealth)}</Button>
              <Badge variant="outline">yundu db migrate && yundu serve</Badge>
            </div>
          </CardContent>
        </Card>
      {:else}
        {@render children()}
      {/if}
    </main>
  </SidebarInset>
</SidebarProvider>

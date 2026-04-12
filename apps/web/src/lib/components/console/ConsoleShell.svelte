<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ChevronUp, FolderOpen, Gauge, GitBranch, Package, Play, Rocket, ServerCrash, UserRound } from "@lucide/svelte";
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

  type Props = {
    title: string;
    description: string;
    children: Snippet;
  };

  const navigationItems = [
    { href: "/", label: "首页", icon: Gauge },
    { href: "/projects", label: "项目", icon: FolderOpen },
    { href: "/deployments", label: "部署", icon: Rocket },
    { href: "/deploy", label: "新部署", icon: Play },
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
          <span class="block truncate text-sm font-medium">Yundu</span>
          <span class="block truncate text-xs text-muted-foreground">部署控制台</span>
        </span>
      </a>
      <SidebarInput
        bind:value={projectSearch}
        class="group-data-[collapsible=icon]:hidden"
        placeholder="搜索项目"
      />
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>工作台</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {#each navigationItems as item (item.href)}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === item.href}
                  tooltipContent={item.label}
                >
                  {#snippet child({ props })}
                    <a href={item.href} {...props}>
                      <item.icon class="size-4" />
                      <span>{item.label}</span>
                    </a>
                  {/snippet}
                </SidebarMenuButton>
              </SidebarMenuItem>
            {/each}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>项目</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {#if filteredProjects.length > 0}
              {#each filteredProjects.slice(0, 8) as project (project.id)}
                <SidebarMenuItem>
                  <SidebarMenuButton tooltipContent={project.name}>
                    {#snippet child({ props })}
                      <a href={`/projects?projectId=${project.id}`} {...props}>
                        <FolderOpen class="size-4" />
                        <span>{project.name}</span>
                      </a>
                    {/snippet}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              {/each}
            {:else}
              <SidebarMenuItem>
                <SidebarMenuButton tooltipContent="暂无项目">
                  {#snippet child({ props })}
                    <a href="/projects" {...props}>
                      <Package class="size-4" />
                      <span>暂无项目</span>
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
            <span class="block truncate text-sm font-medium">{authIdentity ?? "未登录"}</span>
            <span class="block truncate text-xs text-muted-foreground">
              GitHub {githubConnected ? "已授权" : authIdentity ? "待授权" : "按需连接"}
            </span>
          </span>
          <ChevronUp class="size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" class="w-56">
          <DropdownMenuLabel>
            <div class="flex items-center gap-2">
              <UserRound class="size-4" />
              <span class="min-w-0 truncate">{authIdentity ?? "用户设置"}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!githubProvider?.configured || githubConnected} onclick={connectGitHub}>
            <GitBranch class="size-4" />
            {githubConnected ? "GitHub 已授权" : "连接 GitHub"}
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => navigateTo("/projects")}>
            <FolderOpen class="size-4" />
            项目设置
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => navigateTo("/deployments")}>
            <Rocket class="size-4" />
            部署记录
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => navigateTo("/deploy")}>
            <Play class="size-4" />
            新建部署
          </DropdownMenuItem>
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
          新部署
        </Button>
      </div>
    </header>

    <main class="flex-1 p-4 md:p-6">
      {#if connectionError}
        <Card class="border-destructive/30">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <ServerCrash class="size-5" />
              后端不可用
            </CardTitle>
            <CardDescription>
              先启动 `yundu serve`，再确认数据库已就绪。若使用 PostgreSQL，请检查用户名和密码。
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <pre class="overflow-x-auto rounded-md border bg-muted px-3 py-3 text-xs text-muted-foreground">{connectionError}</pre>
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" onclick={openHealthCheck}>检查 /api/health</Button>
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

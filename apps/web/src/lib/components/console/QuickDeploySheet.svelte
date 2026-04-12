<script lang="ts">
  import { browser } from "$app/environment";
  import {
    CheckCircle2,
    FolderOpen,
    GitBranch,
    LoaderCircle,
    Package,
    Play,
    Server,
    Settings2,
    ShieldCheck,
    TerminalSquare,
    Waypoints,
  } from "@lucide/svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import type {
    AuthSessionResponse,
    EnvironmentSummary,
    GitHubRepositorySummary,
    ProjectSummary,
    ServerSummary,
  } from "@yundu/contracts";

  import { API_BASE, readErrorMessage, request } from "$lib/api/client";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "$lib/components/ui/sheet";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Badge } from "$lib/components/ui/badge";
  import { defaultAuthSession, type ProviderSummary } from "$lib/console/queries";
  import { readSessionIdentity } from "$lib/console/utils";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type SourceKind = "local-folder" | "github" | "remote-git" | "docker-image" | "compose";
  type DraftMode = "existing" | "new";
  type EnvironmentKind = EnvironmentSummary["kind"];
  type YunduDesktopBridge = {
    selectDirectory?: () => Promise<string | null | undefined>;
  };
  type WindowWithYunduDesktopBridge = Window &
    typeof globalThis & {
      yunduDesktop?: YunduDesktopBridge;
    };

  const environmentKinds = [
    "local",
    "development",
    "test",
    "staging",
    "production",
    "preview",
    "custom",
  ] as const satisfies readonly EnvironmentKind[];

  const sourceOptions: Array<{
    key: SourceKind;
    label: string;
    hint: string;
    icon: typeof FolderOpen;
  }> = [
    {
      key: "local-folder",
      label: "本地目录",
      hint: "适合当前工作区或本地源码目录。",
      icon: FolderOpen,
    },
    {
      key: "github",
      label: "GitHub 仓库",
      hint: "授权后从仓库直接回填项目与来源。",
      icon: GitBranch,
    },
    {
      key: "remote-git",
      label: "Remote Git",
      hint: "适合 GitHub 之外的 git 源。",
      icon: GitBranch,
    },
    {
      key: "docker-image",
      label: "Docker 镜像",
      hint: "直接发布已有镜像，无需再构建。",
      icon: Package,
    },
    {
      key: "compose",
      label: "Compose",
      hint: "导入 compose 清单或仓库中的 compose 路径。",
      icon: Waypoints,
    },
  ];

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const authSessionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "auth-session"],
      queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
      enabled: browser && open,
    }),
  );
  const projectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects"],
      queryFn: () => orpcClient.projects.list(),
      enabled: browser && open,
    }),
  );
  const serversQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers"],
      queryFn: () => orpcClient.servers.list(),
      enabled: browser && open,
    }),
  );
  const environmentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["environments"],
      queryFn: () => orpcClient.environments.list({}),
      enabled: browser && open,
    }),
  );
  const providersQuery = createQuery(() =>
    queryOptions({
      queryKey: ["providers"],
      queryFn: () => orpcClient.providers.list(),
      enabled: browser && open,
    }),
  );

  let githubRepositorySearch = $state("");
  let sourceKind = $state<SourceKind>("local-folder");
  let projectMode = $state<DraftMode>("new");
  let serverMode = $state<DraftMode>("new");
  let environmentMode = $state<DraftMode>("new");

  let selectedProjectId = $state("");
  let selectedServerId = $state("");
  let selectedEnvironmentId = $state("");

  let projectName = $state("");
  let projectDescription = $state("");
  let serverName = $state("edge-1");
  let serverHost = $state("");
  let serverPort = $state("22");
  let serverProviderKey = $state("generic-ssh");
  let environmentName = $state("production");
  let environmentKind = $state<EnvironmentKind>("production");
  let variableKey = $state("");
  let variableValue = $state("");
  let variableIsSecret = $state(true);
  let selectedGitHubRepositoryId = $state("");
  let selectedGitHubRepository = $state<GitHubRepositorySummary | null>(null);

  let localFolderLocator = $state(".");
  let localFolderSelectionNotice = $state<string | null>(null);
  let githubLocator = $state("https://github.com/");
  let remoteGitLocator = $state("");
  let dockerImageLocator = $state("");
  let composeLocator = $state("");

  let deployFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);

  const createProjectMutation = createMutation(() => ({
    mutationFn: (input: { name: string; description?: string }) => orpcClient.projects.create(input),
  }));
  const registerServerMutation = createMutation(() => ({
    mutationFn: (input: { name: string; host: string; port?: number; providerKey: string }) =>
      orpcClient.servers.create(input),
  }));
  const createEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: {
      projectId: string;
      name: string;
      kind: EnvironmentKind;
      parentEnvironmentId?: string;
    }) => orpcClient.environments.create(input),
  }));
  const setEnvironmentVariableMutation = createMutation(() => ({
    mutationFn: (input: {
      environmentId: string;
      key: string;
      value: string;
      kind: "plain-config" | "secret" | "provider-specific" | "deployment-strategy";
      exposure: "build-time" | "runtime";
      isSecret?: boolean;
      scope?: "defaults" | "system" | "organization" | "project" | "environment" | "deployment";
    }) => orpcClient.environments.setVariable(input),
  }));
  const createDeploymentMutation = createMutation(() => ({
    mutationFn: (input: {
      projectId: string;
      serverId: string;
      environmentId: string;
      sourceLocator: string;
    }) => orpcClient.deployments.create(input),
  }));

  const authSession = $derived(authSessionQuery.data ?? defaultAuthSession);
  const projects = $derived((projectsQuery.data?.items ?? []) as ProjectSummary[]);
  const servers = $derived((serversQuery.data?.items ?? []) as ServerSummary[]);
  const environments = $derived((environmentsQuery.data?.items ?? []) as EnvironmentSummary[]);
  const providers = $derived((providersQuery.data?.items ?? []) as ProviderSummary[]);
  const githubProvider = $derived(
    authSession.providers.find((provider) => provider.key === "github") ?? null,
  );
  const githubConnected = $derived(Boolean(githubProvider?.connected));
  const authIdentity = $derived(readSessionIdentity(authSession.session));
  const canChooseNativeLocalFolder = $derived(
    browser &&
      typeof (window as WindowWithYunduDesktopBridge).yunduDesktop?.selectDirectory === "function",
  );
  const selectedProject = $derived(projects.find((project) => project.id === selectedProjectId) ?? null);
  const selectedServer = $derived(servers.find((server) => server.id === selectedServerId) ?? null);
  const selectedEnvironment = $derived(
    environments.find((environment) => environment.id === selectedEnvironmentId) ?? null,
  );
  const filteredEnvironments = $derived.by(() => {
    if (projectMode === "existing" && selectedProjectId) {
      return environments.filter((environment) => environment.projectId === selectedProjectId);
    }

    return environments;
  });
  const providerOptions = $derived(
    providers.length > 0
      ? providers
      : [
          {
            key: "generic-ssh",
            title: "Generic SSH",
            category: "deploy-target" as const,
            capabilities: ["ssh", "single-server"],
          },
        ],
  );
  const deployPending = $derived(
    createProjectMutation.isPending ||
      registerServerMutation.isPending ||
      createEnvironmentMutation.isPending ||
      setEnvironmentVariableMutation.isPending ||
      createDeploymentMutation.isPending,
  );
  const sourceLocator = $derived.by(() => {
    switch (sourceKind) {
      case "github":
        return githubLocator.trim();
      case "remote-git":
        return remoteGitLocator.trim();
      case "docker-image":
        return dockerImageLocator.trim();
      case "compose":
        return composeLocator.trim();
      default:
        return localFolderLocator.trim();
    }
  });
  const sourcePlaceholder = $derived.by(() => {
    switch (sourceKind) {
      case "github":
        return "https://github.com/acme/platform.git";
      case "remote-git":
        return "https://git.example.com/team/project.git";
      case "docker-image":
        return "ghcr.io/acme/platform:latest";
      case "compose":
        return "./deploy/docker-compose.yml";
      default:
        return ".";
    }
  });
  const deploymentCommandPreview = $derived.by(() => {
    const segments = [`yundu deploy ${sourceLocator || "."}`];

    if (selectedProjectId) {
      segments.push(`--project ${selectedProjectId}`);
    }

    if (selectedServerId) {
      segments.push(`--server ${selectedServerId}`);
    }

    if (selectedEnvironmentId) {
      segments.push(`--environment ${selectedEnvironmentId}`);
    }

    return segments.join(" ");
  });

  const githubRepositoriesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["integrations", "github", "repositories", githubRepositorySearch.trim()],
      queryFn: () =>
        orpcClient.integrations.github.repositories.list({
          ...(githubRepositorySearch.trim() ? { search: githubRepositorySearch.trim() } : {}),
        }),
      enabled:
        browser &&
        open &&
        sourceKind === "github" &&
        Boolean(githubProvider?.configured) &&
        Boolean(githubProvider?.connected),
    }),
  );
  const githubRepositories = $derived(
    (githubRepositoriesQuery.data?.items ?? []) as GitHubRepositorySummary[],
  );

  $effect(() => {
    if (projects.length === 0) {
      projectMode = "new";
      selectedProjectId = "";
      environmentMode = "new";
      selectedEnvironmentId = "";
      return;
    }

    if (!selectedProjectId) {
      selectedProjectId = projects[0].id;
    }
  });

  $effect(() => {
    if (servers.length === 0) {
      serverMode = "new";
      selectedServerId = "";
      return;
    }

    if (!selectedServerId) {
      selectedServerId = servers[0].id;
    }
  });

  $effect(() => {
    if (projectMode === "new") {
      environmentMode = "new";
      selectedEnvironmentId = "";
    }
  });

  $effect(() => {
    if (environmentMode === "existing" && filteredEnvironments.length === 0) {
      environmentMode = "new";
      selectedEnvironmentId = "";
      return;
    }

    if (environmentMode === "existing" && !selectedEnvironmentId && filteredEnvironments.length > 0) {
      selectedEnvironmentId = filteredEnvironments[0].id;
    }
  });

  $effect(() => {
    if (
      providerOptions.length > 0 &&
      !providerOptions.some((provider) => provider.key === serverProviderKey)
    ) {
      serverProviderKey = providerOptions[0].key;
    }
  });

  function setSourceLocator(value: string): void {
    switch (sourceKind) {
      case "github":
        githubLocator = value;
        return;
      case "remote-git":
        remoteGitLocator = value;
        return;
      case "docker-image":
        dockerImageLocator = value;
        return;
      case "compose":
        composeLocator = value;
        return;
      default:
        localFolderLocator = value;
    }
  }

  async function chooseLocalFolder(): Promise<void> {
    localFolderSelectionNotice = null;

    if (!browser) {
      return;
    }

    const selectDirectory = (window as WindowWithYunduDesktopBridge).yunduDesktop?.selectDirectory;

    if (!selectDirectory) {
      localFolderSelectionNotice = "当前浏览器不能只读取本地路径，请直接输入或粘贴目录路径。";
      return;
    }

    try {
      const locator = await selectDirectory();
      if (locator?.trim()) {
        localFolderLocator = locator.trim();
      }
    } catch (error) {
      localFolderSelectionNotice = readErrorMessage(error);
    }
  }

  async function connectGitHub(): Promise<void> {
    try {
      const endpoint =
        authSession.session && !githubConnected ? "/api/auth/link-social" : "/api/auth/sign-in/social";
      const response = await request<{
        redirect: boolean;
        url?: string;
      }>(endpoint, {
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
      deployFeedback = {
        kind: "error",
        title: "无法连接 GitHub",
        detail: readErrorMessage(error),
      };
    }
  }

  function applyGitHubRepository(repository: GitHubRepositorySummary): void {
    sourceKind = "github";
    selectedGitHubRepositoryId = repository.id;
    selectedGitHubRepository = repository;
    githubLocator = repository.cloneUrl;

    if (projectMode === "new") {
      projectName = repository.name;
      projectDescription = repository.description ?? "";
    }
  }

  async function refreshWorkspaceData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["servers"] }),
      queryClient.invalidateQueries({ queryKey: ["environments"] }),
      queryClient.invalidateQueries({ queryKey: ["deployments"] }),
    ]);
  }

  async function handleQuickDeploy(): Promise<void> {
    deployFeedback = null;

    try {
      if (!sourceLocator) {
        throw new Error("请先填写来源地址。");
      }

      if (sourceKind === "github") {
        if (!githubProvider?.configured) {
          throw new Error("后端尚未配置 GitHub OAuth。");
        }

        if (!githubConnected) {
          throw new Error("请先连接 GitHub，再继续导入仓库。");
        }
      }

      let projectId = selectedProjectId;

      if (projectMode === "new") {
        if (!projectName.trim()) {
          throw new Error("请填写项目名。");
        }

        const createdProject = await createProjectMutation.mutateAsync({
          name: projectName.trim(),
          ...(projectDescription.trim() ? { description: projectDescription.trim() } : {}),
        });
        projectId = createdProject.id;
        selectedProjectId = projectId;
        await projectsQuery.refetch();
      }

      if (!projectId) {
        throw new Error("请选择或创建一个项目。");
      }

      let serverId = selectedServerId;

      if (serverMode === "new") {
        if (!serverName.trim() || !serverHost.trim()) {
          throw new Error("请填写服务器名称和主机地址。");
        }

        const createdServer = await registerServerMutation.mutateAsync({
          name: serverName.trim(),
          host: serverHost.trim(),
          providerKey: serverProviderKey,
          ...(serverPort.trim() ? { port: Number(serverPort) } : {}),
        });
        serverId = createdServer.id;
        selectedServerId = serverId;
        await serversQuery.refetch();
      }

      if (!serverId) {
        throw new Error("请选择或创建一个服务器。");
      }

      let environmentId = selectedEnvironmentId;

      if (environmentMode === "new") {
        if (!environmentName.trim()) {
          throw new Error("请填写环境名。");
        }

        const createdEnvironment = await createEnvironmentMutation.mutateAsync({
          projectId,
          name: environmentName.trim(),
          kind: environmentKind,
        });
        environmentId = createdEnvironment.id;
        selectedEnvironmentId = environmentId;
        await environmentsQuery.refetch();
      }

      if (!environmentId) {
        throw new Error("请选择或创建一个环境。");
      }

      if (variableKey.trim()) {
        await setEnvironmentVariableMutation.mutateAsync({
          environmentId,
          key: variableKey.trim(),
          value: variableValue,
          exposure: "runtime",
          kind: variableIsSecret ? "secret" : "plain-config",
          isSecret: variableIsSecret,
          scope: "environment",
        });
        await environmentsQuery.refetch();
      }

      const deployment = await createDeploymentMutation.mutateAsync({
        projectId,
        serverId,
        environmentId,
        sourceLocator,
      });

      await refreshWorkspaceData();

      deployFeedback = {
        kind: "success",
        title: "部署记录已创建",
        detail: `deploymentId: ${deployment.id}`,
      };
    } catch (error) {
      deployFeedback = {
        kind: "error",
        title: "无法创建部署",
        detail: readErrorMessage(error),
      };
    }
  }
</script>

<Sheet bind:open>
  <SheetContent side="right" class="w-full overflow-y-auto sm:max-w-xl">
    <SheetHeader>
      <SheetTitle>快速部署</SheetTitle>
      <SheetDescription>按 source、项目、服务器、环境提交一次部署。</SheetDescription>
    </SheetHeader>

    <div class="mt-6 space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>部署入口</CardTitle>
          <CardDescription>可以新建资源，也可以复用已有项目、服务器和环境。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Waypoints class="size-4 text-muted-foreground" />
              <span>来源</span>
            </div>
            <div class="grid gap-2">
              {#each sourceOptions as option (option.key)}
                <button
                  type="button"
                  class={`flex items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
                    sourceKind === option.key ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                  onclick={() => {
                    sourceKind = option.key;
                  }}
                >
                  <option.icon class="mt-0.5 size-4 text-muted-foreground" />
                  <span class="space-y-1">
                    <span class="block text-sm font-medium">{option.label}</span>
                    <span class="block text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                </button>
              {/each}
            </div>
            <div class="space-y-2">
              <label class="text-xs font-medium text-muted-foreground" for="source-locator">
                来源地址
              </label>
              {#if sourceKind === "local-folder"}
                <div class="flex gap-2">
                  <Input
                    id="source-locator"
                    class="font-mono text-xs"
                    bind:value={localFolderLocator}
                    placeholder={sourcePlaceholder}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    class="shrink-0"
                    disabled={!canChooseNativeLocalFolder}
                    title={
                      canChooseNativeLocalFolder ? "选择本地目录" : "普通浏览器不能只读取本地路径，请手动输入。"
                    }
                    onclick={chooseLocalFolder}
                  >
                    <FolderOpen class="size-4" />
                    选择目录
                  </Button>
                </div>
                <p class="text-xs text-muted-foreground">
                  普通浏览器不会读取本机绝对路径，请直接输入或粘贴；桌面版可只选择并保存路径。
                </p>
                {#if localFolderSelectionNotice}
                  <p class="text-xs text-destructive">{localFolderSelectionNotice}</p>
                {/if}
              {:else}
                <Input
                  id="source-locator"
                  value={sourceLocator}
                  oninput={(event) => setSourceLocator(event.currentTarget.value)}
                  placeholder={sourcePlaceholder}
                />
              {/if}
            </div>
          </div>

          {#if sourceKind === "github"}
            <div class="space-y-3">
              <Separator />
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-medium">GitHub 仓库</p>
                  <p class="text-xs text-muted-foreground">只有需要导入 GitHub 时才会触发登录。</p>
                </div>
                {#if githubConnected}
                  <Badge>已连接</Badge>
                {:else}
                  <Badge variant="outline">按需授权</Badge>
                {/if}
              </div>

              {#if !githubProvider?.configured}
                <div class="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                  后端尚未配置 GitHub OAuth。
                </div>
              {:else if !githubConnected}
                <Button variant="outline" class="w-full" onclick={connectGitHub}>
                  <GitBranch class="size-4" />
                  连接 GitHub
                </Button>
              {:else}
                <div class="space-y-3">
                  <Input bind:value={githubRepositorySearch} placeholder="搜索 GitHub 仓库" />
                  <div class="max-h-64 space-y-2 overflow-auto rounded-md border p-2">
                    {#if githubRepositoriesQuery.isPending}
                      {#each Array.from({ length: 4 }) as _, index (index)}
                        <Skeleton class="h-14 w-full" />
                      {/each}
                    {:else if githubRepositories.length > 0}
                      {#each githubRepositories as repository (repository.id)}
                        <button
                          type="button"
                          class={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                            selectedGitHubRepositoryId === repository.id
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/50"
                          }`}
                          onclick={() => applyGitHubRepository(repository)}
                        >
                          <span class="flex items-start justify-between gap-3">
                            <span>
                              <span class="block text-sm font-medium">{repository.fullName}</span>
                              <span class="mt-1 block text-xs text-muted-foreground">
                                {repository.description ?? "暂无描述"}
                              </span>
                            </span>
                            <Badge variant="outline">
                              {repository.private ? "private" : "public"}
                            </Badge>
                          </span>
                        </button>
                      {/each}
                    {:else}
                      <p class="px-2 py-3 text-sm text-muted-foreground">当前没有仓库结果。</p>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <div class="space-y-3">
            <Separator />
            <div class="flex items-center gap-2 text-sm font-medium">
              <Package class="size-4 text-muted-foreground" />
              <span>项目</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <Button
                variant={projectMode === "existing" ? "default" : "outline"}
                onclick={() => {
                  projectMode = "existing";
                }}
              >
                使用已有
              </Button>
              <Button
                variant={projectMode === "new" ? "default" : "outline"}
                onclick={() => {
                  projectMode = "new";
                }}
              >
                新建项目
              </Button>
            </div>
            {#if projectMode === "existing"}
              <div class="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                {#if projects.length > 0}
                  {#each projects as project (project.id)}
                    <Button
                      class="w-full justify-start"
                      size="sm"
                      variant={selectedProjectId === project.id ? "default" : "ghost"}
                      onclick={() => {
                        selectedProjectId = project.id;
                      }}
                    >
                      {project.name}
                    </Button>
                  {/each}
                {:else}
                  <p class="px-2 py-2 text-sm text-muted-foreground">暂无项目可选。</p>
                {/if}
              </div>
            {:else}
              <div class="space-y-3">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="project-name">
                    项目名
                  </label>
                  <Input id="project-name" bind:value={projectName} placeholder="platform-control-plane" />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="project-description">
                    描述
                  </label>
                  <Textarea
                    id="project-description"
                    bind:value={projectDescription}
                    placeholder="描述这个项目要部署什么，运行在谁的服务器上。"
                    rows={3}
                  />
                </div>
              </div>
            {/if}
          </div>

          <div class="space-y-3">
            <Separator />
            <div class="flex items-center gap-2 text-sm font-medium">
              <Server class="size-4 text-muted-foreground" />
              <span>服务器</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <Button
                variant={serverMode === "existing" ? "default" : "outline"}
                onclick={() => {
                  serverMode = "existing";
                }}
              >
                使用已有
              </Button>
              <Button
                variant={serverMode === "new" ? "default" : "outline"}
                onclick={() => {
                  serverMode = "new";
                }}
              >
                新建服务器
              </Button>
            </div>
            {#if serverMode === "existing"}
              <div class="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                {#if servers.length > 0}
                  {#each servers as server (server.id)}
                    <Button
                      class="w-full justify-start"
                      size="sm"
                      variant={selectedServerId === server.id ? "default" : "ghost"}
                      onclick={() => {
                        selectedServerId = server.id;
                      }}
                    >
                      {server.name} · {server.host}
                    </Button>
                  {/each}
                {:else}
                  <p class="px-2 py-2 text-sm text-muted-foreground">暂无服务器可选。</p>
                {/if}
              </div>
            {:else}
              <div class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-muted-foreground" for="server-name">
                      名称
                    </label>
                    <Input id="server-name" bind:value={serverName} placeholder="edge-1" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-muted-foreground" for="server-port">
                      SSH 端口
                    </label>
                    <Input id="server-port" bind:value={serverPort} placeholder="22" />
                  </div>
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="server-host">
                    主机地址
                  </label>
                  <Input id="server-host" bind:value={serverHost} placeholder="203.0.113.10" />
                </div>
                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted-foreground">Provider</p>
                  <div class="grid gap-2">
                    {#each providerOptions as provider (provider.key)}
                      <Button
                        class="justify-start"
                        size="sm"
                        variant={serverProviderKey === provider.key ? "default" : "outline"}
                        onclick={() => {
                          serverProviderKey = provider.key;
                        }}
                      >
                        {provider.title}
                      </Button>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <div class="space-y-3">
            <Separator />
            <div class="flex items-center gap-2 text-sm font-medium">
              <Settings2 class="size-4 text-muted-foreground" />
              <span>环境</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <Button
                variant={environmentMode === "existing" ? "default" : "outline"}
                onclick={() => {
                  environmentMode = "existing";
                }}
              >
                使用已有
              </Button>
              <Button
                variant={environmentMode === "new" ? "default" : "outline"}
                onclick={() => {
                  environmentMode = "new";
                }}
              >
                新建环境
              </Button>
            </div>
            {#if environmentMode === "existing"}
              <div class="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                {#if filteredEnvironments.length > 0}
                  {#each filteredEnvironments as environment (environment.id)}
                    <Button
                      class="w-full justify-start"
                      size="sm"
                      variant={selectedEnvironmentId === environment.id ? "default" : "ghost"}
                      onclick={() => {
                        selectedEnvironmentId = environment.id;
                      }}
                    >
                      {environment.name} · {environment.kind}
                    </Button>
                  {/each}
                {:else}
                  <p class="px-2 py-2 text-sm text-muted-foreground">暂无环境可选。</p>
                {/if}
              </div>
            {:else}
              <div class="space-y-3">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="environment-name">
                    环境名
                  </label>
                  <Input id="environment-name" bind:value={environmentName} placeholder="production" />
                </div>
                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted-foreground">环境类型</p>
                  <div class="grid grid-cols-2 gap-2">
                    {#each environmentKinds as kind (kind)}
                      <Button
                        size="sm"
                        variant={environmentKind === kind ? "default" : "outline"}
                        onclick={() => {
                          environmentKind = kind;
                        }}
                      >
                        {kind}
                      </Button>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <div class="space-y-3">
            <Separator />
            <div class="flex items-center gap-2 text-sm font-medium">
              <TerminalSquare class="size-4 text-muted-foreground" />
              <span>首个变量</span>
            </div>
            <div class="space-y-3">
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="variable-key">
                    Key
                  </label>
                  <Input id="variable-key" bind:value={variableKey} placeholder="DATABASE_URL" />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="variable-value">
                    Value
                  </label>
                  <Input id="variable-value" bind:value={variableValue} placeholder="postgres://..." />
                </div>
              </div>
              <Button
                variant={variableIsSecret ? "default" : "outline"}
                size="sm"
                onclick={() => {
                  variableIsSecret = !variableIsSecret;
                }}
              >
                {variableIsSecret ? "作为 Secret 存储" : "作为普通配置存储"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {#if selectedGitHubRepository}
        <Card>
          <CardHeader>
            <CardTitle>已选择仓库</CardTitle>
            <CardDescription>仓库信息会自动回填到部署表单。</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">仓库</span>
              <span class="font-medium">{selectedGitHubRepository.fullName}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">默认分支</span>
              <span class="font-medium">{selectedGitHubRepository.defaultBranch}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">克隆地址</span>
              <span class="truncate font-mono text-xs">{selectedGitHubRepository.cloneUrl}</span>
            </div>
          </CardContent>
        </Card>
      {/if}

      <Card>
        <CardHeader>
          <CardTitle>提交摘要</CardTitle>
          <CardDescription>这次提交会创建或复用哪些资源。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">来源类型</span>
            <span class="font-medium">{sourceOptions.find((option) => option.key === sourceKind)?.label}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">来源地址</span>
            <span class="truncate font-mono text-xs">{sourceLocator || "未填写"}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">项目</span>
            <span class="font-medium">
              {projectMode === "existing" ? selectedProject?.name ?? "未选择" : projectName || "待创建"}
            </span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">服务器</span>
            <span class="font-medium">
              {serverMode === "existing" ? selectedServer?.name ?? "未选择" : serverName || "待创建"}
            </span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">环境</span>
            <span class="font-medium">
              {environmentMode === "existing"
                ? selectedEnvironment?.name ?? "未选择"
                : environmentName || "待创建"}
            </span>
          </div>
        </CardContent>
        <CardFooter class="flex-col items-stretch gap-3">
          <Button class="w-full" disabled={deployPending} onclick={handleQuickDeploy}>
            {#if deployPending}
              <LoaderCircle class="size-4 animate-spin" />
              正在提交
            {:else}
              <Play class="size-4" />
              创建并部署
            {/if}
          </Button>
          <pre class="overflow-x-auto rounded-md border bg-muted px-3 py-3 text-xs text-muted-foreground">{deploymentCommandPreview}</pre>
        </CardFooter>
      </Card>

      {#if deployFeedback}
        <Card class={deployFeedback.kind === "success" ? "border-primary/30" : "border-destructive/30"}>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              {#if deployFeedback.kind === "success"}
                <CheckCircle2 class="size-4" />
              {:else}
                <ShieldCheck class="size-4" />
              {/if}
              {deployFeedback.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground">{deployFeedback.detail}</p>
          </CardContent>
        </Card>
      {/if}
    </div>
  </SheetContent>
</Sheet>

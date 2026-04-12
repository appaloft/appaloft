<script lang="ts">
  import { browser } from "$app/environment";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
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
  type DeploymentStepKey = "source" | "project" | "server" | "environment" | "variables" | "review";
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

  const deploymentSteps: Array<{
    key: DeploymentStepKey;
    title: string;
    description: string;
    icon: typeof FolderOpen;
  }> = [
    {
      key: "source",
      title: "来源",
      description: "选择源码、仓库或镜像",
      icon: Waypoints,
    },
    {
      key: "project",
      title: "项目",
      description: "复用或创建项目",
      icon: Package,
    },
    {
      key: "server",
      title: "服务器",
      description: "选择部署目标",
      icon: Server,
    },
    {
      key: "environment",
      title: "环境",
      description: "绑定环境快照",
      icon: Settings2,
    },
    {
      key: "variables",
      title: "变量",
      description: "按需加入首个变量",
      icon: TerminalSquare,
    },
    {
      key: "review",
      title: "提交",
      description: "确认并创建部署",
      icon: Play,
    },
  ];

  const sourceKindKeys = sourceOptions.map((option) => option.key);
  const deploymentStepKeys = deploymentSteps.map((step) => step.key);
  const draftModeKeys = ["existing", "new"] as const;

  let { enabled = true }: { enabled?: boolean } = $props();

  const authSessionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "auth-session"],
      queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
      enabled: browser && enabled,
    }),
  );
  const projectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects"],
      queryFn: () => orpcClient.projects.list(),
      enabled: browser && enabled,
    }),
  );
  const serversQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers"],
      queryFn: () => orpcClient.servers.list(),
      enabled: browser && enabled,
    }),
  );
  const environmentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["environments"],
      queryFn: () => orpcClient.environments.list({}),
      enabled: browser && enabled,
    }),
  );
  const providersQuery = createQuery(() =>
    queryOptions({
      queryKey: ["providers"],
      queryFn: () => orpcClient.providers.list(),
      enabled: browser && enabled,
    }),
  );

  const initialSourceKind = parseSourceKind(browser ? page.url.searchParams.get("source") : null);
  const initialStep = parseDeploymentStep(browser ? page.url.searchParams.get("step") : null);

  let githubRepositorySearch = $state(browser ? (page.url.searchParams.get("repository") ?? "") : "");
  let sourceKind = $state<SourceKind>(initialSourceKind);
  let activeStep = $state<DeploymentStepKey>(initialStep);
  let projectMode = $state<DraftMode>(parseDraftMode(browser ? page.url.searchParams.get("projectMode") : null));
  let serverMode = $state<DraftMode>(parseDraftMode(browser ? page.url.searchParams.get("serverMode") : null));
  let environmentMode = $state<DraftMode>(
    parseDraftMode(browser ? page.url.searchParams.get("environmentMode") : null),
  );

  let selectedProjectId = $state(browser ? (page.url.searchParams.get("projectId") ?? "") : "");
  let selectedServerId = $state(browser ? (page.url.searchParams.get("serverId") ?? "") : "");
  let selectedEnvironmentId = $state(browser ? (page.url.searchParams.get("environmentId") ?? "") : "");

  let projectName = $state(browser ? (page.url.searchParams.get("projectName") ?? "") : "");
  let projectDescription = $state(browser ? (page.url.searchParams.get("projectDescription") ?? "") : "");
  let serverName = $state(browser ? (page.url.searchParams.get("serverName") ?? "local-machine") : "local-machine");
  let serverHost = $state(browser ? (page.url.searchParams.get("serverHost") ?? "127.0.0.1") : "127.0.0.1");
  let serverPort = $state(browser ? (page.url.searchParams.get("serverPort") ?? "22") : "22");
  let serverProviderKey = $state(browser ? (page.url.searchParams.get("serverProvider") ?? "local-shell") : "local-shell");
  let environmentName = $state(browser ? (page.url.searchParams.get("environmentName") ?? "local") : "local");
  let environmentKind = $state<EnvironmentKind>(
    parseEnvironmentKind(browser ? page.url.searchParams.get("environmentKind") : null),
  );
  let variableKey = $state(browser ? (page.url.searchParams.get("variableKey") ?? "") : "");
  let variableValue = $state("");
  let variableIsSecret = $state(browser ? page.url.searchParams.get("variableSecret") !== "false" : true);
  let selectedGitHubRepositoryId = $state(browser ? (page.url.searchParams.get("githubRepositoryId") ?? "") : "");
  let selectedGitHubRepository = $state<GitHubRepositorySummary | null>(null);

  let localFolderLocator = $state(browser ? (page.url.searchParams.get("sourceLocator") ?? ".") : ".");
  let localFolderSelectionNotice = $state<string | null>(null);
  let githubLocator = $state(browser ? (page.url.searchParams.get("sourceLocator") ?? "") : "");
  let remoteGitLocator = $state(browser ? (page.url.searchParams.get("sourceLocator") ?? "") : "");
  let dockerImageLocator = $state(browser ? (page.url.searchParams.get("sourceLocator") ?? "") : "");
  let composeLocator = $state(browser ? (page.url.searchParams.get("sourceLocator") ?? "") : "");
  let lastAppliedUrlSearch = browser ? page.url.search : "";

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
      deploymentMethod?: "auto" | "dockerfile" | "docker-compose" | "prebuilt-image" | "workspace-commands";
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
            key: "local-shell",
            title: "Local Shell",
            category: "deploy-target" as const,
            capabilities: ["local-command", "docker-host", "docker-compose", "single-server"],
          },
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
        return "选择 GitHub 仓库后自动设置";
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
  const currentStepIndex = $derived(
    Math.max(
      deploymentSteps.findIndex((step) => step.key === activeStep),
      0,
    ),
  );
  const activeStepDetails = $derived(deploymentSteps[currentStepIndex] ?? deploymentSteps[0]);
  const selectedSourceOption = $derived(
    sourceOptions.find((option) => option.key === sourceKind) ?? sourceOptions[0],
  );
  const serverProviderTitle = $derived(
    providerOptions.find((provider) => provider.key === serverProviderKey)?.title ?? serverProviderKey,
  );
  const sourceSummary = $derived.by(() => {
    if (sourceKind === "github" && selectedGitHubRepository) {
      return selectedGitHubRepository.fullName;
    }

    return sourceLocator || "未填写来源地址";
  });
  const projectSummary = $derived.by(() => {
    if (projectMode === "existing") {
      return selectedProject?.name ?? "未选择项目";
    }

    return projectName.trim() || "待创建项目";
  });
  const serverSummary = $derived.by(() => {
    if (serverMode === "existing") {
      return selectedServer ? `${selectedServer.name} · ${selectedServer.host}` : "未选择服务器";
    }

    return serverName.trim() && serverHost.trim()
      ? `${serverName.trim()} · ${serverProviderTitle} · ${serverHost.trim()}`
      : "待创建服务器";
  });
  const environmentSummary = $derived.by(() => {
    if (environmentMode === "existing") {
      return selectedEnvironment
        ? `${selectedEnvironment.name} · ${selectedEnvironment.kind}`
        : "未选择环境";
    }

    return environmentName.trim() ? `${environmentName.trim()} · ${environmentKind}` : "待创建环境";
  });
  const variableSummary = $derived.by(() => {
    if (!variableKey.trim()) {
      return "不创建变量";
    }

    return `${variableKey.trim()} · ${variableIsSecret ? "secret" : "plain-config"}`;
  });
  const canAdvance = $derived(stepIsComplete(activeStep));

  const githubRepositoriesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["integrations", "github", "repositories", githubRepositorySearch.trim()],
      queryFn: () =>
        orpcClient.integrations.github.repositories.list({
          ...(githubRepositorySearch.trim() ? { search: githubRepositorySearch.trim() } : {}),
        }),
      enabled:
        browser &&
        enabled &&
        sourceKind === "github" &&
        Boolean(githubProvider?.configured) &&
        Boolean(githubProvider?.connected),
    }),
  );
  const githubRepositories = $derived(
    (githubRepositoriesQuery.data?.items ?? []) as GitHubRepositorySummary[],
  );

  $effect(() => {
    if (!browser) {
      return;
    }

    const search = page.url.search;
    if (search === lastAppliedUrlSearch) {
      return;
    }

    applyDeployUrlState(page.url.searchParams);
    lastAppliedUrlSearch = search;
  });

  $effect(() => {
    if (!browser) {
      return;
    }

    const deployStateUrl = buildDeployStateUrl();
    const currentPathWithSearch = `${window.location.pathname}${window.location.search}`;
    const nextPathWithSearch = `${deployStateUrl.pathname}${deployStateUrl.search}`;

    if (nextPathWithSearch === currentPathWithSearch) {
      return;
    }

    lastAppliedUrlSearch = deployStateUrl.search;
    replaceState(deployStateUrl, page.state);
  });

  $effect(() => {
    if (projects.length === 0) {
      projectMode = "new";
      selectedProjectId = "";
      environmentMode = "new";
      selectedEnvironmentId = "";
      return;
    }

    if (projectMode === "new") {
      selectedProjectId = "";
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

    if (serverMode === "new") {
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

  $effect(() => {
    const requestedRepository = browser ? (page.url.searchParams.get("repository")?.trim() ?? "") : "";
    const requestedRepositoryId = browser
      ? (page.url.searchParams.get("githubRepositoryId")?.trim() ?? "")
      : "";

    if (
      sourceKind !== "github" ||
      selectedGitHubRepository ||
      githubRepositories.length === 0 ||
      (!requestedRepository && !requestedRepositoryId)
    ) {
      return;
    }

    const normalizedRepository = requestedRepository.toLowerCase();
    const matchedRepository =
      githubRepositories.find(
        (repository) =>
          repository.id === requestedRepositoryId ||
          repository.fullName.toLowerCase() === normalizedRepository ||
          repository.name.toLowerCase() === normalizedRepository ||
          repository.cloneUrl.toLowerCase() === normalizedRepository,
      ) ?? (githubRepositories.length === 1 ? githubRepositories[0] : null);

    if (matchedRepository) {
      applyGitHubRepository(matchedRepository);
    }
  });

  function parseSourceKind(value: string | null): SourceKind {
    return sourceKindKeys.includes(value as SourceKind) ? (value as SourceKind) : "local-folder";
  }

  function parseDeploymentStep(value: string | null): DeploymentStepKey {
    return deploymentStepKeys.includes(value as DeploymentStepKey)
      ? (value as DeploymentStepKey)
      : "source";
  }

  function parseDraftMode(value: string | null): DraftMode {
    return draftModeKeys.includes(value as DraftMode) ? (value as DraftMode) : "new";
  }

  function parseEnvironmentKind(value: string | null): EnvironmentKind {
    return environmentKinds.includes(value as EnvironmentKind) ? (value as EnvironmentKind) : "local";
  }

  function setSearchParam(
    params: URLSearchParams,
    key: string,
    value: string | null | undefined,
    defaultValue = "",
  ): void {
    const normalizedValue = value?.trim() ?? "";

    if (normalizedValue && normalizedValue !== defaultValue) {
      params.set(key, normalizedValue);
      return;
    }

    params.delete(key);
  }

  function buildDeployStateUrl(): URL {
    const url = new URL(browser ? window.location.href : page.url.href);
    url.pathname = "/deploy";
    url.search = "";

    const params = url.searchParams;
    setSearchParam(params, "step", activeStep, "source");
    setSearchParam(params, "source", sourceKind, "local-folder");
    setSearchParam(
      params,
      "sourceLocator",
      sourceLocator,
      sourceKind === "local-folder"
        ? "."
        : "",
    );

    if (sourceKind === "github") {
      setSearchParam(params, "repository", selectedGitHubRepository?.fullName ?? githubRepositorySearch);
      setSearchParam(params, "githubRepositoryId", selectedGitHubRepositoryId);
    }

    setSearchParam(params, "projectMode", projectMode, "new");
    setSearchParam(params, "projectId", selectedProjectId);
    setSearchParam(params, "projectName", projectName);
    setSearchParam(params, "projectDescription", projectDescription);

    setSearchParam(params, "serverMode", serverMode, "new");
    setSearchParam(params, "serverId", selectedServerId);
    setSearchParam(params, "serverName", serverName, "local-machine");
    setSearchParam(params, "serverHost", serverHost, "127.0.0.1");
    setSearchParam(params, "serverPort", serverPort, "22");
    setSearchParam(params, "serverProvider", serverProviderKey, "local-shell");

    setSearchParam(params, "environmentMode", environmentMode, "new");
    setSearchParam(params, "environmentId", selectedEnvironmentId);
    setSearchParam(params, "environmentName", environmentName, "local");
    setSearchParam(params, "environmentKind", environmentKind, "local");

    setSearchParam(params, "variableKey", variableKey);
    if (variableKey.trim()) {
      setSearchParam(params, "variableSecret", variableIsSecret ? "true" : "false", "true");
    }

    return url;
  }

  function applyDeployUrlState(params: URLSearchParams): void {
    const nextSourceKind = parseSourceKind(params.get("source"));
    const nextSourceLocator = params.get("sourceLocator") ?? "";

    sourceKind = nextSourceKind;
    activeStep = parseDeploymentStep(params.get("step"));
    projectMode = parseDraftMode(params.get("projectMode"));
    serverMode = parseDraftMode(params.get("serverMode"));
    environmentMode = parseDraftMode(params.get("environmentMode"));

    selectedProjectId = params.get("projectId") ?? "";
    selectedServerId = params.get("serverId") ?? "";
    selectedEnvironmentId = params.get("environmentId") ?? "";

    projectName = params.get("projectName") ?? "";
    projectDescription = params.get("projectDescription") ?? "";
    serverName = params.get("serverName") ?? "local-machine";
    serverHost = params.get("serverHost") ?? "127.0.0.1";
    serverPort = params.get("serverPort") ?? "22";
    serverProviderKey = params.get("serverProvider") ?? "local-shell";
    environmentName = params.get("environmentName") ?? "local";
    environmentKind = parseEnvironmentKind(params.get("environmentKind"));
    variableKey = params.get("variableKey") ?? "";
    variableIsSecret = params.get("variableSecret") !== "false";

    githubRepositorySearch = params.get("repository") ?? "";
    selectedGitHubRepositoryId = params.get("githubRepositoryId") ?? "";
    selectedGitHubRepository = null;

    localFolderLocator = nextSourceKind === "local-folder" ? nextSourceLocator || "." : localFolderLocator;
    githubLocator = nextSourceKind === "github" ? nextSourceLocator : githubLocator;
    remoteGitLocator = nextSourceKind === "remote-git" ? nextSourceLocator : remoteGitLocator;
    dockerImageLocator = nextSourceKind === "docker-image" ? nextSourceLocator : dockerImageLocator;
    composeLocator = nextSourceKind === "compose" ? nextSourceLocator : composeLocator;
  }

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

  function selectSourceKind(kind: SourceKind): void {
    sourceKind = kind;
  }

  function deploymentMethodForSource():
    | "dockerfile"
    | "docker-compose"
    | "prebuilt-image"
    | undefined {
    switch (sourceKind) {
      case "github":
      case "remote-git":
        return "dockerfile";
      case "docker-image":
        return "prebuilt-image";
      case "compose":
        return "docker-compose";
      default:
        return undefined;
    }
  }

  function stepIsComplete(stepKey: DeploymentStepKey): boolean {
    switch (stepKey) {
      case "source":
        if (!sourceLocator) {
          return false;
        }

        if (sourceKind !== "github") {
          return true;
        }

        return Boolean(
          githubProvider?.configured &&
            githubConnected &&
            Boolean(selectedGitHubRepository || githubLocator.trim()),
        );
      case "project":
        return projectMode === "existing" ? Boolean(selectedProjectId) : Boolean(projectName.trim());
      case "server":
        return serverMode === "existing"
          ? Boolean(selectedServerId)
          : Boolean(serverName.trim() && serverHost.trim());
      case "environment":
        return environmentMode === "existing"
          ? Boolean(selectedEnvironmentId)
          : Boolean(environmentName.trim());
      case "variables":
      case "review":
        return true;
    }
  }

  function canVisitStep(index: number): boolean {
    if (index <= currentStepIndex) {
      return true;
    }

    return deploymentSteps.slice(0, index).every((step) => stepIsComplete(step.key));
  }

  function goToStep(stepKey: DeploymentStepKey, index: number): void {
    if (canVisitStep(index)) {
      activeStep = stepKey;
    }
  }

  function goToPreviousStep(): void {
    if (currentStepIndex > 0) {
      activeStep = deploymentSteps[currentStepIndex - 1].key;
    }
  }

  function goToNextStep(): void {
    if (!canAdvance || currentStepIndex >= deploymentSteps.length - 1) {
      return;
    }

    activeStep = deploymentSteps[currentStepIndex + 1].key;
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
      const callbackURL = browser ? buildDeployStateUrl() : new URL("/deploy", API_BASE);
      callbackURL.searchParams.set("source", "github");
      callbackURL.searchParams.set("step", "source");

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
          callbackURL: callbackURL.toString(),
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
        ...(deploymentMethodForSource()
          ? { deploymentMethod: deploymentMethodForSource() }
          : {}),
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

<div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
  <div class="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>部署入口 · {activeStepDetails.title}</CardTitle>
          <CardDescription>{activeStepDetails.description}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <div class="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/20 px-2 py-2">
            {#each deploymentSteps as step, index (step.key)}
              <button
                type="button"
                class={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors ${
                  activeStep === step.key
                    ? "border border-primary/70 bg-background text-foreground shadow-sm"
                    : stepIsComplete(step.key)
                      ? "text-foreground hover:bg-background"
                      : "text-muted-foreground hover:bg-background/70"
                } ${canVisitStep(index) ? "" : "cursor-not-allowed opacity-40"}`}
                disabled={!canVisitStep(index)}
                aria-current={activeStep === step.key ? "step" : undefined}
                title={step.description}
                onclick={() => goToStep(step.key, index)}
              >
                <span class={`flex size-4 items-center justify-center rounded-sm text-[10px] font-medium ${
                  stepIsComplete(step.key) ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                }`}>
                  {#if stepIsComplete(step.key)}
                    <CheckCircle2 class="size-3" />
                  {:else}
                    {index + 1}
                  {/if}
                </span>
                <step.icon class="size-3.5 text-muted-foreground" />
                <span>{step.title}</span>
              </button>
            {/each}
          </div>

          {#if activeStep === "source"}
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
                    selectSourceKind(option.key);
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
            {#if sourceKind === "github"}
              <div class="rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                选择 GitHub 仓库后会自动使用仓库 clone 地址。
              </div>
            {:else}
              <div class="space-y-2">
                <label class="text-xs font-medium text-muted-foreground" for="source-locator">
                  来源地址
                </label>
                {#if sourceKind === "local-folder"}
                <div class="flex gap-2">
                  <Input
                    id="source-locator"
                    class="font-mono text-xs"
                    value={localFolderLocator}
                    oninput={(event) => setSourceLocator(event.currentTarget.value)}
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
            {/if}
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
              {#if authIdentity}
                <div class="rounded-md border bg-muted/40 px-3 py-3 text-sm">
                  <span class="text-muted-foreground">当前身份</span>
                  <span class="ml-2 font-medium">{authIdentity}</span>
                </div>
              {/if}

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

          {:else if activeStep === "project"}
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

          {:else if activeStep === "server"}
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

          {:else if activeStep === "environment"}
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

          {:else if activeStep === "variables"}
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
          {:else}
            <div class="space-y-4">
              <Separator />
              <div class="space-y-2">
                <div class="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck class="size-4 text-muted-foreground" />
                  <span>确认部署</span>
                </div>
                <p class="text-sm leading-6 text-muted-foreground">
                  提交后会按当前选择创建或复用项目、服务器和环境，再生成部署记录。
                </p>
              </div>
              <div class="grid gap-3 text-sm md:grid-cols-2">
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">来源</p>
                  <p class="mt-1 truncate font-medium">{selectedSourceOption.label} · {sourceSummary}</p>
                </div>
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">项目</p>
                  <p class="mt-1 truncate font-medium">{projectSummary}</p>
                </div>
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">服务器</p>
                  <p class="mt-1 truncate font-medium">{serverSummary}</p>
                </div>
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">环境</p>
                  <p class="mt-1 truncate font-medium">{environmentSummary}</p>
                </div>
              </div>
            </div>
          {/if}
        </CardContent>
        <CardFooter class="flex flex-col gap-3 border-t sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs text-muted-foreground">
            步骤 {currentStepIndex + 1} / {deploymentSteps.length} · {activeStepDetails.title}
          </p>
          <div class="flex w-full gap-2 sm:w-auto">
            <Button
              class="flex-1 sm:flex-none"
              variant="outline"
              disabled={currentStepIndex === 0}
              onclick={goToPreviousStep}
            >
              上一步
            </Button>
            {#if activeStep !== "review"}
              <Button class="flex-1 sm:flex-none" disabled={!canAdvance} onclick={goToNextStep}>
                下一步
              </Button>
            {/if}
          </div>
        </CardFooter>
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
  </div>

  <aside class="space-y-5 xl:sticky xl:top-5 xl:self-start">
      <Card>
        <CardHeader>
          <CardTitle>当前摘要</CardTitle>
          <CardDescription>已经选择的内容会持续保留在这里。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">来源类型</span>
            <span class="font-medium">{selectedSourceOption.label}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">来源地址</span>
            <span class="truncate font-mono text-xs">{sourceSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">项目</span>
            <span class="font-medium">{projectSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">服务器</span>
            <span class="font-medium">{serverSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">环境</span>
            <span class="font-medium">{environmentSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">变量</span>
            <span class="font-medium">{variableSummary}</span>
          </div>
        </CardContent>
        {#if activeStep === "review"}
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
        {/if}
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
  </aside>
</div>

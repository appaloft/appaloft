<script lang="ts">
  import { browser } from "$app/environment";
  import { afterNavigate, goto, replaceState } from "$app/navigation";
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
  import {
    createQuickDeployGeneratedResourceName,
    normalizeQuickDeployGeneratedNameBase,
    runQuickDeployWorkflow,
    type QuickDeployServerCredential,
    type QuickDeployWorkflowInput,
    type QuickDeployWorkflowStep,
    type QuickDeployWorkflowStepOutput,
  } from "@yundu/contracts";
  import type { TranslationKey } from "@yundu/i18n";
  import type {
    AuthSessionResponse,
    ConfigureServerCredentialInput,
    CreateDeploymentInput,
    DeploymentProgressEvent,
    CreateResourceInput,
    EnvironmentSummary,
    GitHubRepositorySummary,
    ProjectSummary,
    RegisterServerInput,
    ResourceSummary,
    ServerSummary,
    SshCredentialSummary,
    TestServerConnectivityResponse,
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
  import {
    createDeploymentWithProgress,
    groupDeploymentProgressEvents,
    progressSourceLabel,
  } from "$lib/console/deployment-progress";
  import { defaultAuthSession, type ProviderSummary } from "$lib/console/queries";
  import { readSessionIdentity } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type SourceKind = "local-folder" | "github" | "remote-git" | "docker-image" | "compose";
  type GithubSourceMode = "url" | "browser";
  type DraftMode = "existing" | "new";
  type ServerCredentialKind = "local-ssh-agent" | "ssh-private-key";
  type ServerPrivateKeyInputMode = "saved" | "file" | "paste";
  type EnvironmentKind = EnvironmentSummary["kind"];
  type ResourceKind = ResourceSummary["kind"];
  type DeploymentStepKey = "source" | "project" | "server" | "environment" | "variables" | "review";
  type SummaryRow = {
    label: string;
    value: string;
    mono?: boolean;
  };
  type QuickDeployWorkflowStepStatus = "pending" | "running" | "succeeded" | "failed";
  type QuickDeployWorkflowProgressItem = {
    kind: QuickDeployWorkflowStep["kind"];
    status: QuickDeployWorkflowStepStatus;
  };
  type ResourceDraftInput = Pick<CreateResourceInput, "name"> &
    Partial<Pick<CreateResourceInput, "kind" | "description" | "services">>;
  type ResourceSourceInput = NonNullable<CreateResourceInput["source"]>;
  type ResourceRuntimeProfileInput = NonNullable<CreateResourceInput["runtimeProfile"]>;
  type ResourceNetworkProfileInput = NonNullable<CreateResourceInput["networkProfile"]>;
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
  const resourceKinds = [
    "application",
    "service",
    "database",
    "cache",
    "compose-stack",
    "worker",
    "static-site",
    "external",
  ] as const satisfies readonly ResourceKind[];
  const sourceOptions: Array<{
    key: SourceKind;
    labelKey: TranslationKey;
    hintKey: TranslationKey;
    icon: typeof FolderOpen;
  }> = [
    {
      key: "local-folder",
      labelKey: i18nKeys.console.quickDeploy.sourceLocalFolder,
      hintKey: i18nKeys.console.quickDeploy.sourceLocalFolderHint,
      icon: FolderOpen,
    },
    {
      key: "github",
      labelKey: i18nKeys.console.quickDeploy.sourceGithub,
      hintKey: i18nKeys.console.quickDeploy.sourceGithubHint,
      icon: GitBranch,
    },
    {
      key: "remote-git",
      labelKey: i18nKeys.console.quickDeploy.sourceRemoteGit,
      hintKey: i18nKeys.console.quickDeploy.sourceRemoteGitHint,
      icon: GitBranch,
    },
    {
      key: "docker-image",
      labelKey: i18nKeys.console.quickDeploy.sourceDockerImage,
      hintKey: i18nKeys.console.quickDeploy.sourceDockerImageHint,
      icon: Package,
    },
    {
      key: "compose",
      labelKey: i18nKeys.console.quickDeploy.sourceCompose,
      hintKey: i18nKeys.console.quickDeploy.sourceComposeHint,
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
      description: "选择已有项目或创建新项目",
      icon: Package,
    },
    {
      key: "server",
      title: "服务器",
      description: "选择部署目标",
      icon: Server,
    },
    {
      key: "review",
      title: "提交",
      description: "确认部署，可按需编辑项目、环境、资源和变量",
      icon: Play,
    },
  ];

  const sourceKindKeys = sourceOptions.map((option) => option.key);
  const deploymentStepKeys = deploymentSteps.map((step) => step.key);
  const githubSourceModes = ["url", "browser"] as const satisfies readonly GithubSourceMode[];
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
  let githubSourceMode = $state<GithubSourceMode>(
    browser && page.url.searchParams.get("githubRepositoryId")
      ? "browser"
      : parseGithubSourceMode(browser ? page.url.searchParams.get("githubMode") : null),
  );
  let githubSourceModeTouched = $state(
    browser
      ? page.url.searchParams.has("githubMode") || Boolean(page.url.searchParams.get("sourceLocator"))
      : false,
  );
  let sourceKind = $state<SourceKind>(initialSourceKind);
  let activeStep = $state<DeploymentStepKey>(initialStep);
  let projectMode = $state<DraftMode>(parseDraftMode(browser ? page.url.searchParams.get("projectMode") : null));
  let serverMode = $state<DraftMode>(parseDraftMode(browser ? page.url.searchParams.get("serverMode") : null));
  let environmentMode = $state<DraftMode>(
    parseDraftMode(browser ? page.url.searchParams.get("environmentMode") : null),
  );
  let resourceMode = $state<DraftMode>(parseDraftMode(browser ? page.url.searchParams.get("resourceMode") : null));
  let projectContextEnabled = $state(browser ? page.url.searchParams.get("editProject") === "true" : false);
  let environmentContextEnabled = $state(
    browser ? page.url.searchParams.get("editEnvironment") === "true" : false,
  );
  let resourceContextEnabled = $state(browser ? page.url.searchParams.get("editResource") === "true" : false);
  let variableContextEnabled = $state(browser ? page.url.searchParams.get("editVariables") === "true" : false);

  let selectedProjectId = $state(browser ? (page.url.searchParams.get("projectId") ?? "") : "");
  let selectedServerId = $state(browser ? (page.url.searchParams.get("serverId") ?? "") : "");
  let selectedEnvironmentId = $state(browser ? (page.url.searchParams.get("environmentId") ?? "") : "");
  let selectedResourceId = $state(browser ? (page.url.searchParams.get("resourceId") ?? "") : "");

  let projectName = $state(browser ? (page.url.searchParams.get("projectName") ?? "") : "");
  let projectDescription = $state(browser ? (page.url.searchParams.get("projectDescription") ?? "") : "");
  let serverName = $state(browser ? (page.url.searchParams.get("serverName") ?? "local-machine") : "local-machine");
  let serverHost = $state(browser ? (page.url.searchParams.get("serverHost") ?? "127.0.0.1") : "127.0.0.1");
  let serverPort = $state(browser ? (page.url.searchParams.get("serverPort") ?? "22") : "22");
  let serverProviderKey = $state(browser ? (page.url.searchParams.get("serverProvider") ?? "local-shell") : "local-shell");
  let serverCredentialKind = $state<ServerCredentialKind>("local-ssh-agent");
  let serverCredentialUsername = $state("");
  let serverCredentialPublicKey = $state("");
  let serverCredentialPrivateKey = $state("");
  let selectedSshCredentialId = $state("");
  let serverPrivateKeyInputMode = $state<ServerPrivateKeyInputMode>("file");
  let sshCredentialName = $state("");
  let serverCredentialPrivateKeyFileName = $state("");
  let serverCredentialPrivateKeyImportError = $state<string | null>(null);
  let serverConnectivityResult = $state<TestServerConnectivityResponse | null>(null);
  let serverConnectivityError = $state("");
  let workflowProgressItems = $state<QuickDeployWorkflowProgressItem[]>([]);
  let workflowProgressError = $state("");
  let deploymentCreateInFlight = $state(false);
  let workflowDeploymentProgressEvents = $state<DeploymentProgressEvent[]>([]);
  let environmentName = $state(browser ? (page.url.searchParams.get("environmentName") ?? "local") : "local");
  let environmentKind = $state<EnvironmentKind>(
    parseEnvironmentKind(browser ? page.url.searchParams.get("environmentKind") : null),
  );
  let resourceName = $state(browser ? (page.url.searchParams.get("resourceName") ?? "") : "");
  let generatedResourceName = $state(browser ? (page.url.searchParams.get("generatedResourceName") ?? "") : "");
  let generatedResourceNameBase = $state("");
  let resourceKind = $state<ResourceKind>(parseResourceKind(browser ? page.url.searchParams.get("resourceKind") : null));
  let resourceDescription = $state(browser ? (page.url.searchParams.get("resourceDescription") ?? "") : "");
  let resourceInternalPort = $state(browser ? (page.url.searchParams.get("resourceInternalPort") ?? "3000") : "3000");
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
  let routerStateReady = $state(false);
  let deployFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let lastCreatedDeploymentId = $state("");

  const createProjectMutation = createMutation(() => ({
    mutationFn: (input: { name: string; description?: string }) => orpcClient.projects.create(input),
  }));
  const registerServerMutation = createMutation(() => ({
    mutationFn: (input: RegisterServerInput) => orpcClient.servers.create(input),
  }));
  const configureServerCredentialMutation = createMutation(() => ({
    mutationFn: (input: ConfigureServerCredentialInput) =>
      orpcClient.servers.configureCredential(input),
  }));
  const createSshCredentialMutation = createMutation(() => ({
    mutationFn: (input: {
      name: string;
      kind: "ssh-private-key";
      username?: string;
      publicKey?: string;
      privateKey: string;
    }) => orpcClient.credentials.ssh.create(input),
  }));
  const testServerConnectivityMutation = createMutation(() => ({
    mutationFn: (input: {
      server: {
        name?: string;
        host: string;
        providerKey: string;
        port?: number;
        credential?: ConfigureServerCredentialInput["credential"];
      };
    }) => orpcClient.servers.testDraftConnectivity(input),
    onSuccess: (result) => {
      serverConnectivityResult = result;
      serverConnectivityError = "";
    },
    onError: (error) => {
      serverConnectivityError = readErrorMessage(error);
    },
  }));
  const createEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: {
      projectId: string;
      name: string;
      kind: EnvironmentKind;
      parentEnvironmentId?: string;
    }) => orpcClient.environments.create(input),
  }));
  const createResourceMutation = createMutation(() => ({
    mutationFn: (input: CreateResourceInput) => orpcClient.resources.create(input),
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
  const resourcesQuery = createQuery(() =>
    queryOptions({
      queryKey: [
        "resources",
        selectedProjectId,
        environmentContextEnabled ? selectedEnvironmentId : "",
      ],
      queryFn: () =>
        orpcClient.resources.list({
          ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
          ...(environmentContextEnabled && selectedEnvironmentId
            ? { environmentId: selectedEnvironmentId }
            : {}),
        }),
      enabled: browser && enabled,
    }),
  );
  const sshCredentialsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["credentials", "ssh"],
      queryFn: () => orpcClient.credentials.ssh.list({}),
      enabled: browser && enabled,
    }),
  );

  const authSession = $derived(authSessionQuery.data ?? defaultAuthSession);
  const projects = $derived((projectsQuery.data?.items ?? []) as ProjectSummary[]);
  const servers = $derived((serversQuery.data?.items ?? []) as ServerSummary[]);
  const environments = $derived((environmentsQuery.data?.items ?? []) as EnvironmentSummary[]);
  const resources = $derived((resourcesQuery.data?.items ?? []) as ResourceSummary[]);
  const providers = $derived((providersQuery.data?.items ?? []) as ProviderSummary[]);
  const sshCredentials = $derived(
    (sshCredentialsQuery.data?.items ?? []) as SshCredentialSummary[],
  );
  const selectedSshCredential = $derived(
    sshCredentials.find((credential) => credential.id === selectedSshCredentialId) ?? null,
  );
  const activeServerPrivateKeyInputMode = $derived(
    serverPrivateKeyInputMode === "saved" && sshCredentials.length === 0
      ? "file"
      : serverPrivateKeyInputMode,
  );
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
  const selectedResource = $derived(
    resources.find((resource) => resource.id === selectedResourceId) ?? null,
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
      configureServerCredentialMutation.isPending ||
      createSshCredentialMutation.isPending ||
      testServerConnectivityMutation.isPending ||
      createEnvironmentMutation.isPending ||
      createResourceMutation.isPending ||
      setEnvironmentVariableMutation.isPending ||
      deploymentCreateInFlight,
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
        return "https://github.com/acme/project.git";
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

    if (projectMode === "existing" && selectedProjectId) {
      segments.push(`--project ${selectedProjectId}`);
    } else if (projectMode === "new" && projectName.trim()) {
      segments.push(`--project-name ${projectName.trim()}`);
    }

    if (selectedServerId) {
      segments.push(`--server ${selectedServerId}`);
    }

    if (environmentContextEnabled && selectedEnvironmentId) {
      segments.push(`--environment ${selectedEnvironmentId}`);
    }

    if (resourceContextEnabled && resourceMode === "existing" && selectedResourceId) {
      segments.push(`--resource ${selectedResourceId}`);
    }

    if (!resourceContextEnabled) {
      segments.push(`--resource-name ${inferredResourceInput.name}`);
      segments.push(`--port ${resourceInternalPort.trim() || "3000"}`);
    } else if (resourceMode === "new") {
      segments.push(`--resource-name ${editedResourceInput.name}`);
      if (editedResourceInput.kind) {
        segments.push(`--resource-kind ${editedResourceInput.kind}`);
      }
      segments.push(`--port ${resourceInternalPort.trim() || "3000"}`);
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
  const workflowDeploymentProgressSections = $derived(
    groupDeploymentProgressEvents(workflowDeploymentProgressEvents),
  );
  const selectedSourceOption = $derived(
    sourceOptions.find((option) => option.key === sourceKind) ?? sourceOptions[0],
  );
  const serverProviderTitle = $derived(
    providerOptions.find((provider) => provider.key === serverProviderKey)?.title ?? serverProviderKey,
  );
  const sourceSummary = $derived.by(() => {
    if (sourceKind === "github" && githubSourceMode === "browser" && selectedGitHubRepository) {
      return selectedGitHubRepository.fullName;
    }

    return sourceLocator || $t(i18nKeys.console.quickDeploy.sourceNotSet);
  });
  const sourceDetailRows = $derived.by((): SummaryRow[] => {
    if (sourceKind === "github" && githubSourceMode === "browser" && selectedGitHubRepository) {
      return [
        {
          label: $t(i18nKeys.console.quickDeploy.githubRepository),
          value: selectedGitHubRepository.fullName,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.defaultBranch),
          value: selectedGitHubRepository.defaultBranch,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.sourceAccess),
          value: $t(i18nKeys.console.quickDeploy.sourceAccessGithubApp),
        },
        {
          label: $t(i18nKeys.console.quickDeploy.cloneUrl),
          value: selectedGitHubRepository.cloneUrl,
          mono: true,
        },
      ];
    }

    if (sourceKind === "github") {
      return [
        {
          label: $t(i18nKeys.console.quickDeploy.githubRepository),
          value: sourceSummary,
          mono: true,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.sourceAccess),
          value: $t(
            gitSourceKindForLocator(githubLocator.trim()) === "git-github-app"
              ? i18nKeys.console.quickDeploy.sourceAccessGithubApp
              : i18nKeys.console.quickDeploy.sourceAccessPublicGit,
          ),
        },
      ];
    }

    if (sourceKind === "remote-git") {
      return [
        {
          label: $t(i18nKeys.console.quickDeploy.remoteGitUrl),
          value: sourceSummary,
          mono: true,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.sourceAccess),
          value: $t(
            gitSourceKindForLocator(sourceSummary) === "git-github-app"
              ? i18nKeys.console.quickDeploy.sourceAccessGithubApp
              : i18nKeys.console.quickDeploy.sourceAccessPublicGit,
          ),
        },
      ];
    }

    if (sourceKind === "docker-image") {
      return [
        {
          label: $t(i18nKeys.console.quickDeploy.dockerImage),
          value: sourceSummary,
          mono: true,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.sourceAccess),
          value: $t(i18nKeys.console.quickDeploy.sourceAccessDockerImage),
        },
      ];
    }

    if (sourceKind === "compose") {
      return [
        {
          label: $t(i18nKeys.console.quickDeploy.composeManifest),
          value: sourceSummary,
          mono: true,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.sourceAccess),
          value: $t(i18nKeys.console.quickDeploy.sourceAccessCompose),
        },
      ];
    }

    return [
      {
        label: $t(i18nKeys.console.quickDeploy.localFolderPath),
        value: sourceSummary,
        mono: true,
      },
      {
        label: $t(i18nKeys.console.quickDeploy.sourceAccess),
        value: $t(i18nKeys.console.quickDeploy.sourceAccessLocalFolder),
      },
    ];
  });
  const inferredSourceName = $derived.by(() => {
    if (sourceKind === "github" && selectedGitHubRepository) {
      return selectedGitHubRepository.name;
    }

    const locator = sourceLocator.trim();
    if (!locator) {
      return "local-resource";
    }

    const withoutQuery = locator.split(/[?#]/)[0] ?? locator;
    const withoutTag = sourceKind === "docker-image"
      ? (withoutQuery.split(":")[0] ?? withoutQuery)
      : withoutQuery;
    const segments = withoutTag.split(/[\\/]/).filter(Boolean);
    const lastSegment = segments.at(-1) ?? withoutTag;
    const name = lastSegment.replace(/\.git$/, "").trim();

    return /[a-z0-9]/i.test(name) ? name : "local-resource";
  });
  const inferredResourceKind = $derived.by(
    (): ResourceKind => (sourceKind === "compose" ? "compose-stack" : "application"),
  );
  const inferredResourceInput = $derived.by((): ResourceDraftInput => ({
    name: generatedResourceName || normalizeQuickDeployGeneratedNameBase(inferredSourceName),
    kind: inferredResourceKind,
  }));
  const editedResourceInput = $derived.by((): ResourceDraftInput => ({
    name: resourceName.trim() || generatedResourceName || normalizeQuickDeployGeneratedNameBase(inferredSourceName),
    kind: resourceKind,
    ...(resourceDescription.trim() ? { description: resourceDescription.trim() } : {}),
  }));
  const defaultProjectSummary = $derived.by(() => {
    if (selectedProject) {
      return selectedProject.name;
    }

    return "Local Workspace";
  });
  const defaultEnvironmentSummary = $derived.by(() => {
    if (selectedEnvironment) {
      return `${selectedEnvironment.name} · ${selectedEnvironment.kind}`;
    }

    return `${environmentName.trim() || "local"} · ${environmentKind}`;
  });
  const defaultResourceSummary = $derived.by(() => {
    if (selectedResource) {
      return `${selectedResource.name} · ${selectedResource.kind}${
        selectedResource.networkProfile?.internalPort
          ? ` · :${selectedResource.networkProfile.internalPort}`
          : ""
      }`;
    }

    return `${inferredResourceInput.name} · ${inferredResourceInput.kind ?? "application"} · :${resourceInternalPort.trim() || "3000"}`;
  });
  const projectSummary = $derived.by(() => {
    if (projectMode === "existing") {
      return selectedProject?.name ?? (projects.length === 0 ? defaultProjectSummary : "未选择项目");
    }

    return projectName.trim() || (projects.length === 0 ? "Local Workspace" : "待创建项目");
  });
  const serverSummary = $derived.by(() => {
    if (serverMode === "existing") {
      return selectedServer ? `${selectedServer.name} · ${selectedServer.host}` : "未选择服务器";
    }

    return serverName.trim() && serverHost.trim()
      ? `${serverName.trim()} · ${serverProviderTitle} · ${serverHost.trim()}`
      : "待创建服务器";
  });
  const serverCredentialSummary = $derived.by(() => {
    if (serverMode === "existing") {
      if (!selectedServer?.credential) {
        return "未配置 SSH 凭据";
      }

      return selectedServer.credential.kind === "ssh-private-key"
        ? `SSH 私钥${selectedServer.credential.username ? ` · ${selectedServer.credential.username}` : ""}`
        : `本机 SSH agent${selectedServer.credential.username ? ` · ${selectedServer.credential.username}` : ""}`;
    }

    if (serverProviderKey !== "generic-ssh") {
      return "本机或提供商默认凭据";
    }

    return serverCredentialKind === "ssh-private-key"
      ? [
          "SSH 私钥",
          selectedSshCredential?.name || serverCredentialPrivateKeyFileName || sshCredentialName.trim(),
          serverCredentialUsername.trim(),
        ]
          .filter(Boolean)
          .join(" · ")
      : `本机 SSH agent${serverCredentialUsername.trim() ? ` · ${serverCredentialUsername.trim()}` : ""}`;
  });
  const canTestServerConnectivity = $derived(
    serverMode === "new" &&
      serverProviderKey === "generic-ssh" &&
      Boolean(serverHost.trim()) &&
      (serverCredentialKind === "local-ssh-agent" ||
        (activeServerPrivateKeyInputMode === "saved" && Boolean(selectedSshCredentialId)) ||
        Boolean(serverCredentialPrivateKey.trim())),
  );
  const environmentSummary = $derived.by(() => {
    if (!environmentContextEnabled) {
      return defaultEnvironmentSummary;
    }

    if (environmentMode === "existing") {
      return selectedEnvironment
        ? `${selectedEnvironment.name} · ${selectedEnvironment.kind}`
        : "未选择环境";
    }

    return environmentName.trim() ? `${environmentName.trim()} · ${environmentKind}` : "待创建环境";
  });
  const resourceSummary = $derived.by(() => {
    if (!resourceContextEnabled) {
      return defaultResourceSummary;
    }

    if (resourceMode === "existing") {
      return selectedResource
        ? `${selectedResource.name} · ${selectedResource.kind}`
        : "未选择资源";
    }

    return `${editedResourceInput.name} · ${editedResourceInput.kind ?? "application"} · :${resourceInternalPort.trim() || "3000"}`;
  });
  const variableSummary = $derived.by(() => {
    if (!variableContextEnabled) {
      return "跳过";
    }

    if (!variableKey.trim()) {
      return "不创建变量";
    }

    return `${variableKey.trim()} · ${variableIsSecret ? "secret" : "plain-config"}`;
  });
  const domainBindingSummary = $derived($t(i18nKeys.console.quickDeploy.domainBindingsAfterDeploy));
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
        githubSourceMode === "browser" &&
        Boolean(githubProvider?.configured) &&
        Boolean(githubProvider?.connected),
    }),
  );
  const githubRepositories = $derived(
    (githubRepositoriesQuery.data?.items ?? []) as GitHubRepositorySummary[],
  );

  afterNavigate(() => {
    routerStateReady = true;
  });

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
    if (!browser || !routerStateReady) {
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
    if (!projectsQuery.isSuccess) {
      return;
    }

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
    if (!serversQuery.isSuccess) {
      return;
    }

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
    if (projectContextEnabled && projectMode === "new") {
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
    if (resourceContextEnabled && resourcesQuery.isSuccess && selectedResourceId && !selectedResource) {
      selectedResourceId = "";
    }
  });

  $effect(() => {
    if (!resourceContextEnabled || !resourcesQuery.isSuccess) {
      return;
    }

    if (resources.length === 0) {
      resourceMode = "new";
      selectedResourceId = "";
      return;
    }

    if (resourceMode === "existing" && !selectedResourceId) {
      selectedResourceId = resources[0].id;
    }
  });

  $effect(() => {
    const baseName = normalizeQuickDeployGeneratedNameBase(inferredSourceName);
    if (
      generatedResourceNameBase !== baseName ||
      !generatedResourceName ||
      !generatedResourceName.startsWith(`${baseName}-`)
    ) {
      generatedResourceNameBase = baseName;
      generatedResourceName = createQuickDeployGeneratedResourceName(baseName);
    }
  });

  $effect(() => {
    if (
      sourceKind === "github" &&
      githubConnected &&
      githubSourceMode === "url" &&
      !githubSourceModeTouched &&
      !githubLocator.trim()
    ) {
      githubSourceMode = "browser";
    }
  });

  $effect(() => {
    const requestedRepository = browser ? (page.url.searchParams.get("repository")?.trim() ?? "") : "";
    const requestedRepositoryId = browser
      ? (page.url.searchParams.get("githubRepositoryId")?.trim() ?? "")
      : "";

    if (
      sourceKind !== "github" ||
      githubSourceMode !== "browser" ||
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

  function parseGithubSourceMode(value: string | null): GithubSourceMode {
    return githubSourceModes.includes(value as GithubSourceMode) ? (value as GithubSourceMode) : "url";
  }

  function parseDraftMode(value: string | null): DraftMode {
    return draftModeKeys.includes(value as DraftMode) ? (value as DraftMode) : "existing";
  }

  function parseEnvironmentKind(value: string | null): EnvironmentKind {
    return environmentKinds.includes(value as EnvironmentKind) ? (value as EnvironmentKind) : "local";
  }

  function parseResourceKind(value: string | null): ResourceKind {
    return resourceKinds.includes(value as ResourceKind) ? (value as ResourceKind) : "application";
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
      setSearchParam(params, "githubMode", githubSourceMode, "url");
      if (githubSourceMode === "browser") {
        setSearchParam(params, "repository", selectedGitHubRepository?.fullName ?? githubRepositorySearch);
        setSearchParam(params, "githubRepositoryId", selectedGitHubRepositoryId);
      }
    }

    setSearchParam(params, "editProject", projectContextEnabled ? "true" : "false", "false");
    setSearchParam(params, "projectMode", projectMode, "existing");
    if (projectMode === "existing") {
      setSearchParam(params, "projectId", selectedProjectId);
    } else {
      setSearchParam(params, "projectName", projectName);
      setSearchParam(params, "projectDescription", projectDescription);
    }

    setSearchParam(params, "serverMode", serverMode, "existing");
    setSearchParam(params, "serverId", selectedServerId);
    setSearchParam(params, "serverName", serverName, "local-machine");
    setSearchParam(params, "serverHost", serverHost, "127.0.0.1");
    setSearchParam(params, "serverPort", serverPort, "22");
    setSearchParam(params, "serverProvider", serverProviderKey, "local-shell");

    setSearchParam(params, "editEnvironment", environmentContextEnabled ? "true" : "false", "false");
    if (environmentContextEnabled) {
      setSearchParam(params, "environmentMode", environmentMode, "new");
      setSearchParam(params, "environmentId", selectedEnvironmentId);
      setSearchParam(params, "environmentName", environmentName, "local");
      setSearchParam(params, "environmentKind", environmentKind, "local");
    }

    setSearchParam(params, "editResource", resourceContextEnabled ? "true" : "false", "false");
    if (resourceContextEnabled) {
      setSearchParam(params, "resourceMode", resourceMode, "new");
      if (resourceMode === "existing") {
        setSearchParam(params, "resourceId", selectedResourceId);
      } else {
        setSearchParam(params, "resourceName", resourceName);
        setSearchParam(params, "generatedResourceName", generatedResourceName);
        setSearchParam(params, "resourceKind", resourceKind, "application");
        setSearchParam(params, "resourceDescription", resourceDescription);
      }
    } else {
      setSearchParam(params, "generatedResourceName", generatedResourceName);
    }
    setSearchParam(params, "resourceInternalPort", resourceInternalPort, "3000");

    setSearchParam(params, "editVariables", variableContextEnabled ? "true" : "false", "false");
    if (variableContextEnabled) {
      setSearchParam(params, "variableKey", variableKey);
      if (variableKey.trim()) {
        setSearchParam(params, "variableSecret", variableIsSecret ? "true" : "false", "true");
      }
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
    resourceMode = parseDraftMode(params.get("resourceMode"));
    projectContextEnabled = params.get("editProject") === "true";
    environmentContextEnabled = params.get("editEnvironment") === "true";
    resourceContextEnabled = params.get("editResource") === "true";
    variableContextEnabled = params.get("editVariables") === "true";

    selectedProjectId = params.get("projectId") ?? "";
    selectedServerId = params.get("serverId") ?? "";
    selectedEnvironmentId = params.get("environmentId") ?? "";
    selectedResourceId = params.get("resourceId") ?? "";

    projectName = params.get("projectName") ?? "";
    projectDescription = params.get("projectDescription") ?? "";
    serverName = params.get("serverName") ?? "local-machine";
    serverHost = params.get("serverHost") ?? "127.0.0.1";
    serverPort = params.get("serverPort") ?? "22";
    serverProviderKey = params.get("serverProvider") ?? "local-shell";
    environmentName = params.get("environmentName") ?? "local";
    environmentKind = parseEnvironmentKind(params.get("environmentKind"));
    resourceName = params.get("resourceName") ?? "";
    generatedResourceName = params.get("generatedResourceName") ?? "";
    generatedResourceNameBase = "";
    resourceKind = parseResourceKind(params.get("resourceKind"));
    resourceDescription = params.get("resourceDescription") ?? "";
    resourceInternalPort = params.get("resourceInternalPort") ?? "3000";
    variableKey = params.get("variableKey") ?? "";
    variableIsSecret = params.get("variableSecret") !== "false";
    githubSourceMode = parseGithubSourceMode(params.get("githubMode"));
    githubSourceModeTouched = params.has("githubMode") || Boolean(nextSourceLocator);
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
        if (selectedGitHubRepository && value.trim() !== selectedGitHubRepository.cloneUrl) {
          selectedGitHubRepository = null;
          selectedGitHubRepositoryId = "";
        }
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
    if (kind === "github" && githubConnected && !githubLocator.trim()) {
      githubSourceMode = "browser";
      githubSourceModeTouched = false;
    }
  }

  function selectGithubSourceMode(mode: GithubSourceMode): void {
    githubSourceMode = mode;
    githubSourceModeTouched = true;
    if (mode === "url") {
      selectedGitHubRepository = null;
      selectedGitHubRepositoryId = "";
    }
  }

  function gitSourceKindForLocator(locator: string): Extract<ResourceSourceInput["kind"], "git-github-app" | "git-public"> {
    if (!githubConnected) {
      return "git-public";
    }

    try {
      const url = new URL(locator);
      const host = url.hostname.toLowerCase();
      if ((url.protocol === "https:" || url.protocol === "http:") && (host === "github.com" || host === "www.github.com")) {
        return "git-github-app";
      }
    } catch {
      return "git-public";
    }

    return "git-public";
  }

  function resourceSourceForSource(): ResourceSourceInput {
    const locator = sourceLocator.trim();

    switch (sourceKind) {
      case "github":
      {
        const selectedRepository =
          githubSourceMode === "browser" ? selectedGitHubRepository : null;
        return {
          kind: selectedRepository ? "git-github-app" : gitSourceKindForLocator(locator),
          locator,
          ...(selectedRepository ? { displayName: selectedRepository.fullName } : {}),
          ...(selectedRepository
            ? {
                metadata: {
                  repositoryId: selectedRepository.id,
                  defaultBranch: selectedRepository.defaultBranch,
                },
              }
            : {}),
        };
      }
      case "remote-git":
        return {
          kind: gitSourceKindForLocator(locator),
          locator,
        };
      case "docker-image":
        return {
          kind: "docker-image",
          locator,
        };
      case "compose":
        return {
          kind: "compose",
          locator,
        };
      default:
        return {
          kind: "local-folder",
          locator,
        };
    }
  }

  function runtimeProfileForSource(): ResourceRuntimeProfileInput {
    switch (sourceKind) {
      case "docker-image":
        return { strategy: "prebuilt-image" };
      case "compose":
        return { strategy: "docker-compose" };
      default:
        return { strategy: "auto" };
    }
  }

  function networkProfileForSource(): ResourceNetworkProfileInput {
    const internalPort = Number(resourceInternalPort.trim() || "3000");
    if (!Number.isInteger(internalPort) || internalPort < 1 || internalPort > 65535) {
      throw new Error($t(i18nKeys.console.quickDeploy.applicationPortInvalid));
    }

    return {
      internalPort,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    };
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

        return githubSourceMode === "browser"
          ? Boolean(selectedGitHubRepository)
          : Boolean(githubLocator.trim());
      case "server":
        if (serverMode === "existing") {
          return Boolean(selectedServerId);
        }

        if (!serverName.trim() || !serverHost.trim()) {
          return false;
        }

        if (serverProviderKey !== "generic-ssh") {
          return true;
        }

        return (
          serverCredentialKind === "local-ssh-agent" ||
          (activeServerPrivateKeyInputMode === "saved" && Boolean(selectedSshCredentialId)) ||
          Boolean(serverCredentialPrivateKey.trim())
        );
      case "project":
        return projectMode === "existing"
          ? Boolean(selectedProjectId)
          : projects.length === 0 || Boolean(projectName.trim());
      case "environment":
        return !environmentContextEnabled || (environmentMode === "existing"
          ? Boolean(selectedEnvironmentId)
          : Boolean(environmentName.trim()));
      case "variables":
        return true;
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
      localFolderSelectionNotice = $t(i18nKeys.console.quickDeploy.chooseSourceDirectoryBrowserHint);
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
      githubSourceMode = "browser";
      const endpoint =
        authSession.session && !githubConnected ? "/api/auth/link-social" : "/api/auth/sign-in/social";
      const callbackURL = browser ? buildDeployStateUrl() : new URL("/deploy", API_BASE);
      callbackURL.searchParams.set("source", "github");
      callbackURL.searchParams.set("githubMode", "browser");
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
        title: $t(i18nKeys.common.actions.connectGitHub),
        detail: readErrorMessage(error),
      };
    }
  }

  function applyGitHubRepository(repository: GitHubRepositorySummary): void {
    sourceKind = "github";
    githubSourceMode = "browser";
    selectedGitHubRepositoryId = repository.id;
    selectedGitHubRepository = repository;
    githubLocator = repository.cloneUrl;
    generatedResourceNameBase = normalizeQuickDeployGeneratedNameBase(repository.name);
    generatedResourceName = createQuickDeployGeneratedResourceName(generatedResourceNameBase);
    resourceDescription = repository.description ?? "";
  }

  function defaultSshCredentialName(): string {
    return (
      sshCredentialName.trim() ||
      serverCredentialPrivateKeyFileName ||
      `${serverName.trim() || serverHost.trim() || "server"} SSH key`
    );
  }

  function draftServerCredential(): ConfigureServerCredentialInput["credential"] | undefined {
    if (serverProviderKey !== "generic-ssh") {
      return undefined;
    }

    const username = serverCredentialUsername.trim();

    if (serverCredentialKind === "local-ssh-agent") {
      return {
        kind: "local-ssh-agent",
        ...(username ? { username } : {}),
      };
    }

    if (activeServerPrivateKeyInputMode === "saved" && selectedSshCredentialId) {
      return {
        kind: "stored-ssh-private-key",
        credentialId: selectedSshCredentialId,
        ...(username ? { username } : {}),
      };
    }

    if (!serverCredentialPrivateKey.trim()) {
      return undefined;
    }

    return {
      kind: "ssh-private-key",
      ...(username ? { username } : {}),
      ...(serverCredentialPublicKey.trim() ? { publicKey: serverCredentialPublicKey.trim() } : {}),
      privateKey: serverCredentialPrivateKey.trim(),
    };
  }

  function connectivityLabel(status: TestServerConnectivityResponse["status"]): string {
    switch (status) {
      case "healthy":
        return $t(i18nKeys.common.status.healthy);
      case "degraded":
        return $t(i18nKeys.common.status.degraded);
      case "unreachable":
        return $t(i18nKeys.common.status.unreachable);
    }
  }

  function connectivityVariant(
    status: TestServerConnectivityResponse["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "healthy":
        return "default";
      case "degraded":
        return "secondary";
      case "unreachable":
        return "destructive";
    }
  }

  function checkLabel(status: TestServerConnectivityResponse["checks"][number]["status"]): string {
    switch (status) {
      case "passed":
        return $t(i18nKeys.common.status.passed);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      case "skipped":
        return $t(i18nKeys.common.status.skipped);
    }
  }

  function checkVariant(
    status: TestServerConnectivityResponse["checks"][number]["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "passed":
        return "default";
      case "failed":
        return "destructive";
      case "skipped":
        return "outline";
    }
  }

  function resetWorkflowProgress(): void {
    workflowProgressItems = [];
    workflowProgressError = "";
    workflowDeploymentProgressEvents = [];
  }

  function setWorkflowStepStatus(
    kind: QuickDeployWorkflowStep["kind"],
    status: QuickDeployWorkflowStepStatus,
  ): void {
    const existingItem = workflowProgressItems.find((item) => item.kind === kind);
    workflowProgressItems = existingItem
      ? workflowProgressItems.map((item) => (item.kind === kind ? { ...item, status } : item))
      : [...workflowProgressItems, { kind, status }];
  }

  function workflowStepLabel(kind: QuickDeployWorkflowStep["kind"]): string {
    switch (kind) {
      case "projects.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepProjectsCreate);
      case "servers.register":
        return $t(i18nKeys.console.quickDeploy.workflowStepServersRegister);
      case "credentials.ssh.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepSshCredentialCreate);
      case "servers.configureCredential":
        return $t(i18nKeys.console.quickDeploy.workflowStepServerCredentialConfigure);
      case "environments.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepEnvironmentsCreate);
      case "resources.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepResourcesCreate);
      case "environments.setVariable":
        return $t(i18nKeys.console.quickDeploy.workflowStepEnvironmentVariableSet);
      case "deployments.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepDeploymentsCreate);
    }
  }

  function workflowStepStatusLabel(status: QuickDeployWorkflowStepStatus): string {
    switch (status) {
      case "pending":
        return $t(i18nKeys.console.quickDeploy.workflowStepPending);
      case "running":
        return $t(i18nKeys.console.quickDeploy.workflowStepRunning);
      case "succeeded":
        return $t(i18nKeys.console.quickDeploy.workflowStepSucceeded);
      case "failed":
        return $t(i18nKeys.console.quickDeploy.workflowStepFailed);
    }
  }

  function appendWorkflowDeploymentProgressEvent(event: DeploymentProgressEvent): void {
    workflowDeploymentProgressEvents = [...workflowDeploymentProgressEvents, event];
    lastCreatedDeploymentId = event.deploymentId ?? lastCreatedDeploymentId;
  }

  function deploymentProgressPhaseLabel(phase: DeploymentProgressEvent["phase"]): string {
    switch (phase) {
      case "detect":
        return $t(i18nKeys.console.deployments.progressPhaseDetect);
      case "plan":
        return $t(i18nKeys.console.deployments.progressPhasePlan);
      case "package":
        return $t(i18nKeys.console.deployments.progressPhasePackage);
      case "deploy":
        return $t(i18nKeys.console.deployments.progressPhaseDeploy);
      case "verify":
        return $t(i18nKeys.console.deployments.progressPhaseVerify);
      case "rollback":
        return $t(i18nKeys.console.deployments.progressPhaseRollback);
    }
  }

  function deploymentProgressStatusLabel(status?: DeploymentProgressEvent["status"]): string {
    switch (status) {
      case "running":
        return $t(i18nKeys.console.deployments.progressStatusRunning);
      case "succeeded":
        return $t(i18nKeys.console.deployments.progressStatusSucceeded);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      default:
        return $t(i18nKeys.console.deployments.progressStatusLog);
    }
  }

  function deploymentProgressLevelClass(level: DeploymentProgressEvent["level"]): string {
    switch (level) {
      case "error":
        return "text-destructive";
      case "warn":
        return "text-amber-600";
      case "debug":
        return "text-muted-foreground";
      case "info":
        return "text-foreground";
    }
  }

  function deploymentProgressTimeLabel(timestamp: string): string {
    return timestamp.slice(11, 19) || "--:--:--";
  }

  async function testDraftServerConnectivity(): Promise<void> {
    serverConnectivityResult = null;
    serverConnectivityError = "";

    const host = serverHost.trim();
    if (!host) {
      serverConnectivityError = "请先填写服务器地址。";
      return;
    }

    const port = Number(serverPort.trim() || "22");
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      serverConnectivityError = "SSH 端口必须是 1 到 65535 之间的整数。";
      return;
    }

    const credential = draftServerCredential();
    if (serverProviderKey === "generic-ssh" && !credential) {
      serverConnectivityError = "请先选择 SSH agent、已保存凭据，或提供私钥。";
      return;
    }

    try {
      await testServerConnectivityMutation.mutateAsync({
        server: {
          name: serverName.trim() || host,
          host,
          providerKey: serverProviderKey,
          port,
          ...(credential ? { credential } : {}),
        },
      });
    } catch (error) {
      serverConnectivityError = serverConnectivityError || readErrorMessage(error);
    }
  }

  async function resolveNewServerCredential(): Promise<QuickDeployServerCredential | undefined> {
    if (serverProviderKey !== "generic-ssh") {
      return undefined;
    }

    const username = serverCredentialUsername.trim();

    if (serverCredentialKind === "local-ssh-agent") {
      return {
        mode: "configure",
        credential: {
          kind: "local-ssh-agent",
          ...(username ? { username } : {}),
        },
      };
    }

    if (activeServerPrivateKeyInputMode === "saved" && selectedSshCredentialId) {
      return {
        mode: "configure",
        credential: {
          kind: "stored-ssh-private-key",
          credentialId: selectedSshCredentialId,
          ...(username ? { username } : {}),
        },
      };
    }

    if (!serverCredentialPrivateKey.trim()) {
      return {
        mode: "configure",
        credential: {
          kind: "ssh-private-key",
          privateKey: "",
        },
      };
    }

    return {
      mode: "create-ssh-and-configure",
      input: {
        name: defaultSshCredentialName(),
        kind: "ssh-private-key",
        ...(username ? { username } : {}),
        ...(serverCredentialPublicKey.trim() ? { publicKey: serverCredentialPublicKey.trim() } : {}),
        privateKey: serverCredentialPrivateKey.trim(),
      },
    };
  }

  async function importServerPrivateKeyFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    serverCredentialPrivateKeyImportError = null;

    try {
      const privateKey = (await file.text()).trim();

      if (!privateKey) {
        throw new Error("选择的私钥文件是空的。");
      }

      serverCredentialPrivateKey = privateKey;
      serverCredentialPrivateKeyFileName = file.name;
      selectedSshCredentialId = "";
      serverPrivateKeyInputMode = "file";
      sshCredentialName = sshCredentialName.trim() || file.name;
    } catch (error) {
      serverCredentialPrivateKeyFileName = "";
      serverCredentialPrivateKeyImportError =
        error instanceof Error ? error.message : "无法读取这个私钥文件。";
    } finally {
      input.value = "";
    }
  }

  async function refreshWorkspaceData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["servers"] }),
      queryClient.invalidateQueries({ queryKey: ["environments"] }),
      queryClient.invalidateQueries({ queryKey: ["resources"] }),
      queryClient.invalidateQueries({ queryKey: ["deployments"] }),
    ]);
  }

  async function executeQuickDeployWorkflowStepOperation(
    step: QuickDeployWorkflowStep,
  ): Promise<QuickDeployWorkflowStepOutput> {
    switch (step.kind) {
      case "projects.create": {
        const createdProject = await createProjectMutation.mutateAsync(step.input);
        selectedProjectId = createdProject.id;
        await projectsQuery.refetch();
        return createdProject;
      }
      case "servers.register": {
        const createdServer = await registerServerMutation.mutateAsync(step.input);
        selectedServerId = createdServer.id;
        await serversQuery.refetch();
        return createdServer;
      }
      case "credentials.ssh.create": {
        const createdCredential = await createSshCredentialMutation.mutateAsync(step.input);
        selectedSshCredentialId = createdCredential.id;
        await sshCredentialsQuery.refetch();
        return createdCredential;
      }
      case "servers.configureCredential": {
        await configureServerCredentialMutation.mutateAsync(step.input);
        await serversQuery.refetch();
        return;
      }
      case "environments.create": {
        const createdEnvironment = await createEnvironmentMutation.mutateAsync(step.input);
        selectedEnvironmentId = createdEnvironment.id;
        await environmentsQuery.refetch();
        return createdEnvironment;
      }
      case "resources.create": {
        const createdResource = await createResourceMutation.mutateAsync(step.input);
        selectedResourceId = createdResource.id;
        await resourcesQuery.refetch();
        return createdResource;
      }
      case "environments.setVariable": {
        await setEnvironmentVariableMutation.mutateAsync(step.input);
        await environmentsQuery.refetch();
        return;
      }
      case "deployments.create": {
        deploymentCreateInFlight = true;
        try {
          return await createDeploymentWithProgress(step.input, appendWorkflowDeploymentProgressEvent);
        } finally {
          deploymentCreateInFlight = false;
        }
      }
    }
  }

  async function executeQuickDeployWorkflowStep(
    step: QuickDeployWorkflowStep,
  ): Promise<QuickDeployWorkflowStepOutput> {
    setWorkflowStepStatus(step.kind, "running");

    try {
      const output = await executeQuickDeployWorkflowStepOperation(step);
      setWorkflowStepStatus(step.kind, "succeeded");
      return output;
    } catch (error) {
      setWorkflowStepStatus(step.kind, "failed");
      workflowProgressError = readErrorMessage(error);
      throw error;
    }
  }

  async function handleQuickDeploy(): Promise<void> {
    deployFeedback = null;
    lastCreatedDeploymentId = "";
    resetWorkflowProgress();

    try {
      if (!sourceLocator) {
        throw new Error("请先填写来源地址。");
      }

      let workflowProject: QuickDeployWorkflowInput["project"];

      if (projectMode === "new") {
        const nextProjectName = projectName.trim() || (projects.length === 0 ? "Local Workspace" : "");

        if (!nextProjectName) {
          throw new Error("请填写项目名。");
        }

        workflowProject = {
          mode: "create",
          input: {
            name: nextProjectName,
            ...(projectDescription.trim() ? { description: projectDescription.trim() } : {}),
          },
        };
      } else {
        if (!selectedProjectId) {
          throw new Error("请选择或创建一个项目。");
        }

        workflowProject = {
          mode: "existing",
          id: selectedProjectId,
        };
      }

      let workflowServer: QuickDeployWorkflowInput["server"];

      if (serverMode === "new") {
        if (!serverName.trim() || !serverHost.trim()) {
          throw new Error("请填写服务器名称和主机地址。");
        }

        const credential = await resolveNewServerCredential();
        if (
          serverProviderKey === "generic-ssh" &&
          serverCredentialKind === "ssh-private-key" &&
          credential?.mode === "configure" &&
          credential.credential.kind === "ssh-private-key" &&
          !credential.credential.privateKey
        ) {
          throw new Error("请导入或粘贴 SSH 私钥，或切换为本机 SSH agent。");
        }

        workflowServer = {
          mode: "create",
          input: {
            name: serverName.trim(),
            host: serverHost.trim(),
            providerKey: serverProviderKey,
            proxyKind: "traefik",
            ...(serverPort.trim() ? { port: Number(serverPort) } : {}),
          },
          ...(credential ? { credential } : {}),
        };
      } else {
        if (!selectedServerId) {
          throw new Error("请选择或创建一个服务器。");
        }

        workflowServer = {
          mode: "existing",
          id: selectedServerId,
        };
      }

      let workflowEnvironment: QuickDeployWorkflowInput["environment"];

      if (environmentContextEnabled && environmentMode === "new") {
        if (!environmentName.trim()) {
          throw new Error("请填写环境名。");
        }

        workflowEnvironment = {
          mode: "create",
          input: {
            name: environmentName.trim(),
            kind: environmentKind,
          },
        };
      } else if (environmentContextEnabled) {
        if (!selectedEnvironmentId) {
          throw new Error("请选择或创建一个环境。");
        }

        workflowEnvironment = {
          mode: "existing",
          id: selectedEnvironmentId,
        };
      } else {
        const projectIdForLookup = workflowProject.mode === "existing" ? workflowProject.id : undefined;
        const existingEnvironment = projectIdForLookup
          ? (environments.find(
              (environment) =>
                environment.projectId === projectIdForLookup &&
                environment.name === "local" &&
                environment.kind === "local",
            ) ?? environments.find((environment) => environment.projectId === projectIdForLookup))
          : undefined;

        if (existingEnvironment) {
          workflowEnvironment = {
            mode: "existing",
            id: existingEnvironment.id,
          };
        } else {
          workflowEnvironment = {
            mode: "create",
            input: {
              name: environmentName.trim() || "local",
              kind: environmentKind,
            },
          };
        }
      }

      let workflowResource: QuickDeployWorkflowInput["resource"];
      if (resourceContextEnabled) {
        if (resourceMode === "existing") {
          if (!selectedResourceId) {
            throw new Error("请选择资源，或切换为新建资源。");
          }

          workflowResource = {
            mode: "existing",
            id: selectedResourceId,
          };
        } else {
          if (!editedResourceInput.name.trim()) {
            throw new Error("请填写资源名。");
          }

          workflowResource = {
            mode: "create",
            input: {
              name: editedResourceInput.name.trim(),
              kind: editedResourceInput.kind ?? "application",
              ...(editedResourceInput.description?.trim()
                ? { description: editedResourceInput.description.trim() }
                : {}),
              ...(editedResourceInput.services && editedResourceInput.services.length > 0
                ? { services: editedResourceInput.services }
                : {}),
              source: resourceSourceForSource(),
              runtimeProfile: runtimeProfileForSource(),
              networkProfile: networkProfileForSource(),
            },
          };
        }
      } else {
        workflowResource = {
          mode: "create",
          input: {
            name: inferredResourceInput.name.trim(),
            kind: inferredResourceInput.kind ?? "application",
            ...(inferredResourceInput.description?.trim()
              ? { description: inferredResourceInput.description.trim() }
              : {}),
            ...(inferredResourceInput.services && inferredResourceInput.services.length > 0
              ? { services: inferredResourceInput.services }
              : {}),
            source: resourceSourceForSource(),
            runtimeProfile: runtimeProfileForSource(),
            networkProfile: networkProfileForSource(),
          },
        };
      }

      const workflowInput: QuickDeployWorkflowInput = {
        project: workflowProject,
        server: workflowServer,
        environment: workflowEnvironment,
        resource: workflowResource,
        ...(variableContextEnabled && variableKey.trim()
          ? {
              environmentVariable: {
                key: variableKey.trim(),
                value: variableValue,
                exposure: "runtime",
                kind: variableIsSecret ? "secret" : "plain-config",
                isSecret: variableIsSecret,
                scope: "environment",
              },
            }
          : {}),
      };
      const workflowResult = await runQuickDeployWorkflow(
        workflowInput,
        executeQuickDeployWorkflowStep,
      );
      selectedProjectId = workflowResult.projectId;
      selectedServerId = workflowResult.serverId;
      selectedEnvironmentId = workflowResult.environmentId;
      selectedResourceId = workflowResult.resourceId;

      await refreshWorkspaceData();

      deployFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.quickDeploy.deployFeedbackSuccessTitle),
        detail: `deploymentId: ${workflowResult.deploymentId}`,
      };
      lastCreatedDeploymentId = workflowResult.deploymentId;
    } catch (error) {
      workflowProgressError = readErrorMessage(error);
      deployFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.quickDeploy.deployFeedbackErrorTitle),
        detail: readErrorMessage(error),
      };
    }
  }

</script>

<div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
  <div class="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{$t(i18nKeys.console.quickDeploy.deploymentEntryTitle, { stepTitle: activeStepDetails.title })}</CardTitle>
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
              <span>{$t(i18nKeys.common.domain.source)}</span>
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
                    <span class="block text-sm font-medium">{$t(option.labelKey)}</span>
                    <span class="block text-xs text-muted-foreground">{$t(option.hintKey)}</span>
                  </span>
                </button>
              {/each}
            </div>
            {#if sourceKind === "github"}
              <div class="space-y-3">
                <div class="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={githubSourceMode === "url" ? "selected" : "outline"}
                    onclick={() => selectGithubSourceMode("url")}
                  >
                    {$t(i18nKeys.console.quickDeploy.githubSourceUrlMode)}
                  </Button>
                  <Button
                    type="button"
                    variant={githubSourceMode === "browser" ? "selected" : "outline"}
                    onclick={() => selectGithubSourceMode("browser")}
                  >
                    {$t(i18nKeys.console.quickDeploy.githubSourceBrowserMode)}
                  </Button>
                </div>
                {#if githubSourceMode === "url"}
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-muted-foreground" for="github-source-locator">
                      {$t(i18nKeys.console.quickDeploy.githubRepositoryUrl)}
                    </label>
                    <Input
                      id="github-source-locator"
                      value={githubLocator}
                      oninput={(event) => setSourceLocator(event.currentTarget.value)}
                      placeholder={sourcePlaceholder}
                    />
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.quickDeploy.githubRepositoryUrlHint)}
                    </p>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="space-y-2">
                <label class="text-xs font-medium text-muted-foreground" for="source-locator">
                  {$t(i18nKeys.console.quickDeploy.sourceAddress)}
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
                    title={canChooseNativeLocalFolder ? $t(i18nKeys.common.actions.selectDirectory) : $t(i18nKeys.console.quickDeploy.chooseSourceDirectoryBrowserHint)}
                    onclick={chooseLocalFolder}
                  >
                    <FolderOpen class="size-4" />
                    {$t(i18nKeys.common.actions.selectDirectory)}
                  </Button>
                </div>
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.quickDeploy.chooseSourceDirectoryBrowserHint)}
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

          {#if sourceKind === "github" && githubSourceMode === "browser"}
            <div class="space-y-3">
              <Separator />
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-medium">{$t(i18nKeys.console.quickDeploy.githubRepository)}</p>
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.quickDeploy.githubOnlyLoginWhenNeeded)}</p>
                </div>
                {#if githubConnected}
                  <Badge>{$t(i18nKeys.common.status.connected)}</Badge>
                {:else}
                  <Badge variant="outline">{$t(i18nKeys.common.status.onDemandAuthorization)}</Badge>
                {/if}
              </div>
              {#if authIdentity}
                <div class="rounded-md border bg-muted/40 px-3 py-3 text-sm">
                  <span class="text-muted-foreground">{$t(i18nKeys.console.quickDeploy.currentIdentity)}</span>
                  <span class="ml-2 font-medium">{authIdentity}</span>
                </div>
              {/if}

              {#if !githubProvider?.configured}
                <div class="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.quickDeploy.githubOAuthNotConfigured)}
                </div>
              {:else if !githubConnected}
                <Button variant="outline" class="w-full" onclick={connectGitHub}>
                  <GitBranch class="size-4" />
                  {$t(i18nKeys.common.actions.connectGitHub)}
                </Button>
              {:else}
                <div class="space-y-3">
                  <Input bind:value={githubRepositorySearch} placeholder={$t(i18nKeys.console.quickDeploy.githubRepositorySearch)} />
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
                                {repository.description ?? $t(i18nKeys.common.domain.description)}
                              </span>
                            </span>
                          </span>
                        </button>
                      {/each}
                    {:else}
                      <p class="px-2 py-3 text-sm text-muted-foreground">{$t(i18nKeys.console.quickDeploy.noRepositoryResults)}</p>
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
              <span>{$t(i18nKeys.common.domain.project)}</span>
            </div>
            {#if projects.length > 0}
              <div class="grid grid-cols-2 gap-2">
                <Button
                  variant={projectMode === "existing" ? "selected" : "outline"}
                  onclick={() => {
                    projectMode = "existing";
                  }}
                >
                  {$t(i18nKeys.common.modes.useExisting)}
                </Button>
                <Button
                  variant={projectMode === "new" ? "selected" : "outline"}
                  onclick={() => {
                    projectMode = "new";
                  }}
                >
                  {$t(i18nKeys.common.modes.newProject)}
                </Button>
              </div>
            {:else}
              <div class="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                {$t(i18nKeys.console.quickDeploy.noProjectOptions)}
              </div>
            {/if}
            {#if projectMode === "existing" && projects.length > 0}
              <div class="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                {#each projects as project (project.id)}
                  <Button
                    class="w-full justify-start"
                    size="sm"
                    variant={selectedProjectId === project.id ? "selected" : "ghost"}
                    onclick={() => {
                      selectedProjectId = project.id;
                    }}
                  >
                    {project.name}
                  </Button>
                {/each}
              </div>
            {:else}
              <div class="space-y-3">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="project-name">
                    {$t(i18nKeys.common.domain.name)}
                  </label>
                  <Input id="project-name" bind:value={projectName} placeholder="platform-control-plane" />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="project-description">
                    {$t(i18nKeys.common.domain.description)}
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
              <span>{$t(i18nKeys.common.domain.server)}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <Button
                variant={serverMode === "existing" ? "selected" : "outline"}
                onclick={() => {
                  serverMode = "existing";
                }}
              >
                {$t(i18nKeys.common.modes.useExisting)}
              </Button>
              <Button
                variant={serverMode === "new" ? "selected" : "outline"}
                onclick={() => {
                  serverMode = "new";
                }}
              >
                {$t(i18nKeys.common.modes.newServer)}
              </Button>
            </div>
            {#if serverMode === "existing"}
              <div class="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                {#if servers.length > 0}
                  {#each servers as server (server.id)}
                    <Button
                      class="w-full justify-start"
                      size="sm"
                      variant={selectedServerId === server.id ? "selected" : "ghost"}
                      onclick={() => {
                        selectedServerId = server.id;
                      }}
                    >
                      {server.name} · {server.host}
                      {#if server.credential}
                        · {server.credential.kind === "ssh-private-key" ? "SSH key" : "SSH agent"}
                      {/if}
                    </Button>
                  {/each}
                {:else}
                  <p class="px-2 py-2 text-sm text-muted-foreground">{$t(i18nKeys.console.quickDeploy.noServerOptions)}</p>
                {/if}
              </div>
            {:else}
              <div class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-muted-foreground" for="server-name">
                      {$t(i18nKeys.common.domain.name)}
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
                      {$t(i18nKeys.common.domain.server)}
                  </label>
                  <Input id="server-host" bind:value={serverHost} placeholder="203.0.113.10" />
                </div>
                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted-foreground">{$t(i18nKeys.common.domain.provider)}</p>
                  <div class="grid gap-2">
                    {#each providerOptions as provider (provider.key)}
                      <Button
                        class="justify-start"
                        size="sm"
                        variant={serverProviderKey === provider.key ? "selected" : "outline"}
                        onclick={() => {
                          serverProviderKey = provider.key;
                        }}
                      >
                        {provider.title}
                      </Button>
                    {/each}
                  </div>
                </div>
                {#if serverProviderKey === "generic-ssh"}
                  <div class="space-y-3 rounded-md border px-3 py-3">
                    <div class="space-y-1">
                      <p class="text-sm font-medium">SSH 登录凭据</p>
                      <p class="text-xs text-muted-foreground">
                        只需要选择一种认证来源：本机 SSH agent、已保存凭据、导入 `.pem`/OpenSSH 私钥文件，或粘贴私钥内容。
                        公钥只用于记录或核对，可以不填。
                      </p>
                    </div>
                    <div class="grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={serverCredentialKind === "local-ssh-agent" ? "selected" : "outline"}
                        onclick={() => {
                          serverCredentialKind = "local-ssh-agent";
                        }}
                      >
                        本机 SSH agent
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={serverCredentialKind === "ssh-private-key" ? "selected" : "outline"}
                        onclick={() => {
                          serverCredentialKind = "ssh-private-key";
                          if (serverPrivateKeyInputMode === "saved" && sshCredentials.length === 0) {
                            serverPrivateKeyInputMode = "file";
                          }
                        }}
                      >
                        SSH 私钥
                      </Button>
                    </div>
                    <div class="space-y-2">
                      <label class="text-xs font-medium text-muted-foreground" for="server-ssh-username">
                        登录用户（可选）
                      </label>
                      <Input
                        id="server-ssh-username"
                        bind:value={serverCredentialUsername}
                        placeholder="root 或 ubuntu"
                      />
                      <p class="text-xs text-muted-foreground">
                        如果服务器地址已写成 `ubuntu@203.0.113.10`，这里可以留空。
                      </p>
                    </div>
                    {#if serverCredentialKind === "local-ssh-agent"}
                      <div class="space-y-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                        <p>
                          本机 SSH agent 会使用运行 Yundu 后端这台机器上的 `SSH_AUTH_SOCK` 和已加载的 key。
                        </p>
                        <p>
                          适合本地开发或桌面模式；如果 Yundu 跑在远程服务器上，就不是使用你笔记本里的 agent。
                        </p>
                      </div>
                    {:else}
                      <div class="space-y-2">
                        <p class="text-xs font-medium text-muted-foreground">私钥来源</p>
                        <div class="grid gap-2 sm:grid-cols-3">
                          <Button
                            type="button"
                            size="sm"
                            disabled={sshCredentials.length === 0}
                            variant={activeServerPrivateKeyInputMode === "saved" ? "selected" : "outline"}
                            class="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
                            onclick={() => {
                              serverPrivateKeyInputMode = "saved";
                              serverCredentialPrivateKey = "";
                              serverCredentialPrivateKeyFileName = "";
                              serverCredentialPrivateKeyImportError = null;
                            }}
                          >
                            <span>已保存凭据</span>
                            <span class="text-[0.7rem] font-normal opacity-75">
                              {sshCredentials.length > 0 ? `${sshCredentials.length} 个可用` : "暂无"}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={activeServerPrivateKeyInputMode === "file" ? "selected" : "outline"}
                            class="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
                            onclick={() => {
                              serverPrivateKeyInputMode = "file";
                              selectedSshCredentialId = "";
                              serverCredentialPrivateKey = "";
                              serverCredentialPrivateKeyFileName = "";
                              serverCredentialPrivateKeyImportError = null;
                            }}
                          >
                            <span>选择私钥文件</span>
                            <span class="text-[0.7rem] font-normal opacity-75">PEM 或 OpenSSH</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={activeServerPrivateKeyInputMode === "paste" ? "selected" : "outline"}
                            class="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
                            onclick={() => {
                              serverPrivateKeyInputMode = "paste";
                              selectedSshCredentialId = "";
                              serverCredentialPrivateKeyFileName = "";
                              serverCredentialPrivateKeyImportError = null;
                            }}
                          >
                            <span>粘贴私钥内容</span>
                            <span class="text-[0.7rem] font-normal opacity-75">手动输入</span>
                          </Button>
                        </div>
                      </div>

                      {#if activeServerPrivateKeyInputMode === "saved"}
                        <div class="space-y-2">
                          <p class="text-xs font-medium text-muted-foreground">选择凭据</p>
                          <div class="grid gap-2">
                            {#each sshCredentials as credential}
                              <Button
                                type="button"
                                size="sm"
                                variant={selectedSshCredentialId === credential.id ? "selected" : "outline"}
                                class="justify-start"
                                onclick={() => {
                                  selectedSshCredentialId = credential.id;
                                  serverCredentialPrivateKey = "";
                                  serverCredentialPrivateKeyFileName = "";
                                  serverCredentialPrivateKeyImportError = null;
                                }}
                              >
                                {credential.name}{credential.username ? ` · ${credential.username}` : ""}
                              </Button>
                            {/each}
                          </div>
                        </div>
                      {:else if activeServerPrivateKeyInputMode === "file"}
                        <div class="space-y-2">
                          <label class="text-xs font-medium text-muted-foreground" for="server-ssh-private-key-file">
                            私钥文件
                          </label>
                          <Input
                            id="server-ssh-private-key-file"
                            type="file"
                            onchange={importServerPrivateKeyFile}
                          />
                          {#if serverCredentialPrivateKeyFileName}
                            <p class="text-xs text-muted-foreground">
                              已选择 {serverCredentialPrivateKeyFileName}
                            </p>
                          {:else if serverCredentialPrivateKeyImportError}
                            <p class="text-xs text-destructive">{serverCredentialPrivateKeyImportError}</p>
                          {:else}
                            <p class="text-xs text-muted-foreground">
                              选择云厂商下载的 `.pem` 或标准 OpenSSH 私钥文件。
                            </p>
                          {/if}
                        </div>
                      {:else}
                        <div class="space-y-2">
                          <label class="text-xs font-medium text-muted-foreground" for="server-ssh-private-key">
                            私钥内容
                          </label>
                          <Textarea
                            id="server-ssh-private-key"
                            class="font-mono text-xs"
                            bind:value={serverCredentialPrivateKey}
                            oninput={() => {
                              selectedSshCredentialId = "";
                              serverCredentialPrivateKeyFileName = "";
                              serverPrivateKeyInputMode = "paste";
                            }}
                            placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                            rows={6}
                          />
                        </div>
                      {/if}

                      {#if activeServerPrivateKeyInputMode === "file" || activeServerPrivateKeyInputMode === "paste"}
                        <div class="space-y-2">
                          <label class="text-xs font-medium text-muted-foreground" for="server-ssh-credential-name">
                            凭据名称
                          </label>
                          <Input
                            id="server-ssh-credential-name"
                            bind:value={sshCredentialName}
                            placeholder={serverCredentialPrivateKeyFileName || `${serverName || "server"} SSH key`}
                          />
                          <p class="text-xs text-muted-foreground">
                            创建服务器时会把这把私钥保存到凭据库，后续服务器可以复用。
                          </p>
                        </div>
                        <div class="space-y-2">
                          <label class="text-xs font-medium text-muted-foreground" for="server-ssh-public-key">
                            公钥（可选）
                          </label>
                          <Textarea
                            id="server-ssh-public-key"
                            class="font-mono text-xs"
                            bind:value={serverCredentialPublicKey}
                            placeholder="ssh-ed25519 AAAA..."
                            rows={3}
                          />
                          <p class="text-xs text-muted-foreground">
                            SSH 连接只需要私钥；这里用于凭据库展示或人工核对。
                          </p>
                        </div>
                      {/if}
                    {/if}
                    <div class="space-y-2 border-t pt-3">
                      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div class="space-y-1">
                          <p class="text-xs font-medium text-muted-foreground">连接测试</p>
                          <p class="text-xs text-muted-foreground">
                            使用当前表单内容临时测试 SSH 和远程 Docker。当前 SSH 部署需要远程 Docker，不会创建服务器或保存新凭据。
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canTestServerConnectivity || testServerConnectivityMutation.isPending}
                          onclick={testDraftServerConnectivity}
                        >
                          {#if testServerConnectivityMutation.isPending}
                            <LoaderCircle class="size-3 animate-spin" />
                            测试中
                          {:else}
                            测试连接
                          {/if}
                        </Button>
                      </div>
                      {#if serverConnectivityError}
                        <div class="rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive">
                          {serverConnectivityError}
                        </div>
                      {:else if serverConnectivityResult}
                        <div class="space-y-2 rounded-md border px-3 py-2">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <p class="text-xs font-medium">连接结果</p>
                            <Badge variant={connectivityVariant(serverConnectivityResult.status)}>
                              {connectivityLabel(serverConnectivityResult.status)}
                            </Badge>
                          </div>
                          <div class="space-y-2">
                            {#each serverConnectivityResult.checks as check (check.name)}
                              <div class="flex flex-col gap-1 border-t pt-2 first:border-t-0 first:pt-0">
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                  <span class="text-xs font-medium">{check.name}</span>
                                  <Badge variant={checkVariant(check.status)}>
                                    {checkLabel(check.status)}
                                  </Badge>
                                </div>
                                <p class="text-xs leading-5 text-muted-foreground">{check.message}</p>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          {:else if activeStep === "environment"}
          <div class="space-y-3">
            <Separator />
            <div class="flex items-center gap-2 text-sm font-medium">
              <Settings2 class="size-4 text-muted-foreground" />
              <span>{$t(i18nKeys.common.domain.environment)}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <Button
                variant={environmentMode === "existing" ? "selected" : "outline"}
                onclick={() => {
                  environmentMode = "existing";
                }}
              >
                {$t(i18nKeys.common.modes.useExisting)}
              </Button>
              <Button
                variant={environmentMode === "new" ? "selected" : "outline"}
                onclick={() => {
                  environmentMode = "new";
                }}
              >
                {$t(i18nKeys.common.modes.newEnvironment)}
              </Button>
            </div>
            {#if environmentMode === "existing"}
              <div class="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                {#if filteredEnvironments.length > 0}
                  {#each filteredEnvironments as environment (environment.id)}
                    <Button
                      class="w-full justify-start"
                      size="sm"
                      variant={selectedEnvironmentId === environment.id ? "selected" : "ghost"}
                      onclick={() => {
                        selectedEnvironmentId = environment.id;
                      }}
                    >
                      {environment.name} · {environment.kind}
                    </Button>
                  {/each}
                {:else}
                  <p class="px-2 py-2 text-sm text-muted-foreground">{$t(i18nKeys.console.quickDeploy.noEnvironmentOptions)}</p>
                {/if}
              </div>
            {:else}
              <div class="space-y-3">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="environment-name">
                    {$t(i18nKeys.common.domain.name)}
                  </label>
                  <Input id="environment-name" bind:value={environmentName} placeholder="production" />
                </div>
                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted-foreground">{$t(i18nKeys.console.quickDeploy.environmentKind)}</p>
                  <div class="grid grid-cols-2 gap-2">
                    {#each environmentKinds as kind (kind)}
                      <Button
                        size="sm"
                        variant={environmentKind === kind ? "selected" : "outline"}
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
              <span>{$t(i18nKeys.console.quickDeploy.firstVariable)}</span>
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
                variant={variableIsSecret ? "selected" : "outline"}
                size="sm"
                onclick={() => {
                  variableIsSecret = !variableIsSecret;
                }}
              >
                {variableIsSecret ? $t(i18nKeys.console.quickDeploy.secretStorage) : $t(i18nKeys.console.quickDeploy.variablePlainStorage)}
              </Button>
            </div>
          </div>
          {:else}
            <div class="space-y-4">
              <Separator />
              <div class="space-y-2">
                <div class="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck class="size-4 text-muted-foreground" />
                  <span>{$t(i18nKeys.console.quickDeploy.reviewDeployment)}</span>
                </div>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.quickDeploy.reviewBody)}
                </p>
              </div>
              <div class="grid gap-3 text-sm md:grid-cols-2">
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.source)}</p>
                  <p class="mt-1 truncate font-medium">{$t(selectedSourceOption.labelKey)} · {sourceSummary}</p>
                </div>
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.project)}</p>
                  <p class="mt-1 truncate font-medium">{projectSummary}</p>
                </div>
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.server)}</p>
                  <p class="mt-1 truncate font-medium">{serverSummary}</p>
                  <p class="mt-1 truncate text-xs text-muted-foreground">{serverCredentialSummary}</p>
                </div>
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</p>
                  <p class="mt-1 truncate font-medium">{environmentSummary}</p>
                </div>
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</p>
                  <p class="mt-1 truncate font-medium">{resourceSummary}</p>
                </div>
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.domainBindings)}</p>
                  <p class="mt-1 truncate font-medium">{domainBindingSummary}</p>
                </div>
                <div class="rounded-md border px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.variables)}</p>
                  <p class="mt-1 truncate font-medium">{variableSummary}</p>
                </div>
              </div>

              <div class="space-y-3">
                <div class="rounded-md border px-3 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium">{$t(i18nKeys.common.domain.project)}</p>
                      <p class="text-xs text-muted-foreground">{projectSummary}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={projectContextEnabled ? "selected" : "outline"}
                      onclick={() => {
                        projectContextEnabled = !projectContextEnabled;
                      }}
                    >
                      {projectContextEnabled ? "使用默认值" : "编辑"}
                    </Button>
                  </div>
                  {#if projectContextEnabled}
                    <div class="mt-3 space-y-3">
                      <div class="grid grid-cols-2 gap-2">
                        <Button
                          variant={projectMode === "existing" ? "selected" : "outline"}
                          onclick={() => {
                            projectMode = "existing";
                          }}
                        >
                          {$t(i18nKeys.common.modes.useExisting)}
                        </Button>
                        <Button
                          variant={projectMode === "new" ? "selected" : "outline"}
                          onclick={() => {
                            projectMode = "new";
                          }}
                        >
                          {$t(i18nKeys.common.modes.newProject)}
                        </Button>
                      </div>
                      {#if projectMode === "existing"}
                        <div class="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                          {#if projects.length > 0}
                            {#each projects as project (project.id)}
                              <Button
                                class="w-full justify-start"
                                size="sm"
                                variant={selectedProjectId === project.id ? "selected" : "ghost"}
                                onclick={() => {
                                  selectedProjectId = project.id;
                                }}
                              >
                                {project.name}
                              </Button>
                            {/each}
                          {:else}
                            <p class="px-2 py-2 text-sm text-muted-foreground">{$t(i18nKeys.console.quickDeploy.noProjectOptions)}</p>
                          {/if}
                        </div>
                      {:else}
                        <div class="grid gap-3 sm:grid-cols-2">
                          <Input bind:value={projectName} placeholder="platform-control-plane" />
                          <Input bind:value={projectDescription} placeholder={$t(i18nKeys.common.domain.description)} />
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>

                <div class="rounded-md border px-3 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium">{$t(i18nKeys.common.domain.environment)}</p>
                      <p class="text-xs text-muted-foreground">{environmentSummary}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={environmentContextEnabled ? "selected" : "outline"}
                      onclick={() => {
                        environmentContextEnabled = !environmentContextEnabled;
                      }}
                    >
                      {environmentContextEnabled ? "使用默认值" : "编辑"}
                    </Button>
                  </div>
                  {#if environmentContextEnabled}
                    <div class="mt-3 space-y-3">
                      <div class="grid grid-cols-2 gap-2">
                        <Button
                          variant={environmentMode === "existing" ? "selected" : "outline"}
                          onclick={() => {
                            environmentMode = "existing";
                          }}
                        >
                          {$t(i18nKeys.common.modes.useExisting)}
                        </Button>
                        <Button
                          variant={environmentMode === "new" ? "selected" : "outline"}
                          onclick={() => {
                            environmentMode = "new";
                          }}
                        >
                          {$t(i18nKeys.common.modes.newEnvironment)}
                        </Button>
                      </div>
                      {#if environmentMode === "existing"}
                        <div class="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                          {#if filteredEnvironments.length > 0}
                            {#each filteredEnvironments as environment (environment.id)}
                              <Button
                                class="w-full justify-start"
                                size="sm"
                                variant={selectedEnvironmentId === environment.id ? "selected" : "ghost"}
                                onclick={() => {
                                  selectedEnvironmentId = environment.id;
                                }}
                              >
                                {environment.name} · {environment.kind}
                              </Button>
                            {/each}
                          {:else}
                            <p class="px-2 py-2 text-sm text-muted-foreground">{$t(i18nKeys.console.quickDeploy.noEnvironmentOptions)}</p>
                          {/if}
                        </div>
                      {:else}
                        <div class="space-y-3">
                          <Input bind:value={environmentName} placeholder="production" />
                          <div class="grid grid-cols-2 gap-2">
                            {#each environmentKinds as kind (kind)}
                              <Button
                                size="sm"
                                variant={environmentKind === kind ? "selected" : "outline"}
                                onclick={() => {
                                  environmentKind = kind;
                                }}
                              >
                                {kind}
                              </Button>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>

                <div class="rounded-md border px-3 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium">{$t(i18nKeys.common.domain.resource)}</p>
                      <p class="text-xs text-muted-foreground">{resourceSummary}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={resourceContextEnabled ? "selected" : "outline"}
                      onclick={() => {
                        resourceContextEnabled = !resourceContextEnabled;
                      }}
                    >
                      {resourceContextEnabled ? "使用默认值" : "编辑"}
                    </Button>
                  </div>
                  {#if resourceContextEnabled}
                    <div class="mt-3 space-y-3">
                      <div class="grid grid-cols-2 gap-2">
                        <Button
                          variant={resourceMode === "existing" ? "selected" : "outline"}
                          onclick={() => {
                            resourceMode = "existing";
                          }}
                        >
                          {$t(i18nKeys.common.modes.useExisting)}
                        </Button>
                        <Button
                          variant={resourceMode === "new" ? "selected" : "outline"}
                          onclick={() => {
                            resourceMode = "new";
                          }}
                        >
                          新建资源
                        </Button>
                      </div>
                      {#if resourceMode === "existing"}
                        <div class="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                          {#if resourcesQuery.isPending}
                            {#each Array.from({ length: 3 }) as _, index (index)}
                              <Skeleton class="h-10 w-full" />
                            {/each}
                          {:else if resources.length > 0}
                            {#each resources as resource (resource.id)}
                              <Button
                                class="w-full justify-start"
                                size="sm"
                                variant={selectedResourceId === resource.id ? "selected" : "ghost"}
                                onclick={() => {
                                  selectedResourceId = resource.id;
                                }}
                              >
                                {resource.name} · {resource.kind}
                                {#if resource.networkProfile?.internalPort}
                                  · :{resource.networkProfile.internalPort}
                                {/if}
                              </Button>
                            {/each}
                          {:else}
                            <p class="px-2 py-2 text-sm text-muted-foreground">暂无资源可选；可以切换为新建资源。</p>
                          {/if}
                        </div>
                      {:else}
                        <div class="space-y-3">
                          <div class="grid gap-3 sm:grid-cols-2">
                            <Input bind:value={resourceName} placeholder={generatedResourceName || inferredSourceName} />
                            <Input bind:value={resourceDescription} placeholder={$t(i18nKeys.common.domain.description)} />
                          </div>
                          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {#each resourceKinds as kind (kind)}
                              <Button
                                type="button"
                                size="sm"
                                variant={resourceKind === kind ? "selected" : "outline"}
                                onclick={() => {
                                  resourceKind = kind;
                                }}
                              >
                                {kind}
                              </Button>
                            {/each}
                          </div>
                          <p class="text-xs leading-5 text-muted-foreground">
                            GitHub 仓库默认作为一个 resource；部署时会按项目和环境复用同名资源，找不到则创建。
                          </p>
                        </div>
                      {/if}
                      {#if resourceMode === "new"}
                        <div class="space-y-2">
                          <label class="text-xs font-medium text-muted-foreground" for="resource-internal-port">
                            {$t(i18nKeys.console.quickDeploy.applicationPort)}
                          </label>
                          <Input id="resource-internal-port" bind:value={resourceInternalPort} placeholder="3000" />
                          <p class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.quickDeploy.applicationPortHint)}
                          </p>
                        </div>
                      {/if}
                    </div>
                  {/if}
                  {#if !resourceContextEnabled}
                    <div class="mt-3 space-y-2">
                      <label class="text-xs font-medium text-muted-foreground" for="resource-default-internal-port">
                        {$t(i18nKeys.console.quickDeploy.applicationPort)}
                      </label>
                      <Input id="resource-default-internal-port" bind:value={resourceInternalPort} placeholder="3000" />
                      <p class="text-xs text-muted-foreground">
                        {$t(i18nKeys.console.quickDeploy.applicationPortHint)}
                      </p>
                    </div>
                  {/if}
                </div>

                <div class="rounded-md border px-3 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium">{$t(i18nKeys.common.domain.variables)}</p>
                      <p class="text-xs text-muted-foreground">{variableSummary}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={variableContextEnabled ? "selected" : "outline"}
                      onclick={() => {
                        variableContextEnabled = !variableContextEnabled;
                      }}
                    >
                      {variableContextEnabled ? "跳过" : "编辑"}
                    </Button>
                  </div>
                  {#if variableContextEnabled}
                    <div class="mt-3 space-y-3">
                      <div class="grid gap-3 sm:grid-cols-2">
                        <Input bind:value={variableKey} placeholder="DATABASE_URL" />
                        <Input bind:value={variableValue} placeholder="postgres://..." />
                      </div>
                      <Button
                        variant={variableIsSecret ? "selected" : "outline"}
                        size="sm"
                        onclick={() => {
                          variableIsSecret = !variableIsSecret;
                        }}
                      >
                        {variableIsSecret ? $t(i18nKeys.console.quickDeploy.secretStorage) : $t(i18nKeys.console.quickDeploy.variablePlainStorage)}
                      </Button>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </CardContent>
        <CardFooter class="flex flex-col gap-3 border-t sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs text-muted-foreground">
            {$t(i18nKeys.console.quickDeploy.step, { current: currentStepIndex + 1, total: deploymentSteps.length, title: activeStepDetails.title })}
          </p>
          <div class="flex w-full gap-2 sm:w-auto">
            <Button
              class="flex-1 sm:flex-none"
              variant="outline"
              disabled={currentStepIndex === 0}
              onclick={goToPreviousStep}
            >
              {$t(i18nKeys.common.actions.previous)}
            </Button>
            {#if activeStep !== "review"}
              <Button class="flex-1 sm:flex-none" disabled={!canAdvance} onclick={goToNextStep}>
                {$t(i18nKeys.common.actions.next)}
              </Button>
            {/if}
          </div>
        </CardFooter>
      </Card>

  </div>

  <aside class="space-y-5 xl:sticky xl:top-5 xl:self-start">
      <Card>
        <CardHeader>
          <CardTitle>{$t(i18nKeys.console.quickDeploy.currentSummary)}</CardTitle>
          <CardDescription>{$t(i18nKeys.console.quickDeploy.currentSummaryDescription)}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">{$t(i18nKeys.console.quickDeploy.sourceType)}</span>
            <span class="font-medium">{$t(selectedSourceOption.labelKey)}</span>
          </div>
          <div class="rounded-md border bg-muted/20 px-3 py-3">
            <div class="mb-2 flex items-center justify-between gap-3">
              <span class="text-xs font-medium uppercase text-muted-foreground">
                {$t(i18nKeys.console.quickDeploy.sourceDetails)}
              </span>
            </div>
            <div class="space-y-2">
              {#each sourceDetailRows as row, index (`${row.label}-${index}`)}
                <div class="flex min-w-0 items-start justify-between gap-3">
                  <span class="shrink-0 text-muted-foreground">{row.label}</span>
                  <span class={`min-w-0 flex-1 truncate text-right font-medium ${row.mono ? "font-mono text-xs" : ""}`}>
                    {row.value}
                  </span>
                </div>
              {/each}
            </div>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.project)}</span>
            <span class="font-medium">{projectSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.server)}</span>
            <span class="font-medium">{serverSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</span>
            <span class="font-medium">{environmentSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</span>
            <span class="font-medium">{resourceSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.domainBindings)}</span>
            <span class="min-w-0 truncate text-right font-medium">{domainBindingSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.variables)}</span>
            <span class="font-medium">{variableSummary}</span>
          </div>
        </CardContent>
        {#if activeStep === "review"}
          <CardFooter class="flex-col items-stretch gap-3">
            <Button class="w-full" disabled={deployPending} onclick={handleQuickDeploy}>
              {#if deployPending}
                <LoaderCircle class="size-4 animate-spin" />
                {$t(i18nKeys.console.quickDeploy.submitPending)}
              {:else}
                <Play class="size-4" />
                {$t(i18nKeys.common.actions.createAndDeploy)}
              {/if}
            </Button>
            {#if workflowProgressItems.length > 0}
              <div class="rounded-md border bg-muted/20 px-3 py-3">
                <div class="mb-2 space-y-1">
                  <p class="text-xs font-medium text-foreground">
                    {$t(i18nKeys.console.quickDeploy.workflowProgressTitle)}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {$t(i18nKeys.console.quickDeploy.workflowProgressDescription)}
                  </p>
                </div>
                <div class="space-y-2">
                  {#each workflowProgressItems as item (item.kind)}
                    <div class="flex items-center justify-between gap-3 text-xs">
                      <span class="flex min-w-0 items-center gap-2">
                        {#if item.status === "running"}
                          <LoaderCircle class="size-3.5 shrink-0 animate-spin text-primary" />
                        {:else if item.status === "succeeded"}
                          <CheckCircle2 class="size-3.5 shrink-0 text-primary" />
                        {:else if item.status === "failed"}
                          <ShieldCheck class="size-3.5 shrink-0 text-destructive" />
                        {:else}
                          <span class="size-3.5 shrink-0 rounded-full border border-muted-foreground/50"></span>
                        {/if}
                        <span class="truncate">{workflowStepLabel(item.kind)}</span>
                      </span>
                      <span
                        class={`shrink-0 ${
                          item.status === "failed"
                            ? "text-destructive"
                            : item.status === "succeeded"
                              ? "text-primary"
                              : "text-muted-foreground"
                        }`}
                      >
                        {workflowStepStatusLabel(item.status)}
                      </span>
                    </div>
                  {/each}
                </div>
                {#if workflowDeploymentProgressSections.length > 0}
                  <div class="mt-3 max-h-56 overflow-auto rounded-md border bg-background px-3 py-2">
                    <div class="space-y-3">
                      {#each workflowDeploymentProgressSections as section (section.phase)}
                        <div class="space-y-1.5">
                          <div class="flex flex-wrap items-center gap-2 text-xs font-medium">
                            <span class="text-primary">
                              [{section.step?.current ?? "-"} / {section.step?.total ?? "-"}]
                            </span>
                            <span>{deploymentProgressPhaseLabel(section.phase)}</span>
                            {#if section.status}
                              <span class="text-muted-foreground">·</span>
                              <span>{deploymentProgressStatusLabel(section.status)}</span>
                            {/if}
                          </div>
                          <div class="space-y-1 font-mono text-[11px] leading-5">
                            {#each section.events as event, index (`${event.timestamp}-${section.phase}-${index}`)}
                              <div class="grid grid-cols-[3.75rem_4.75rem_minmax(0,1fr)] gap-2">
                                <span class="text-muted-foreground">{deploymentProgressTimeLabel(event.timestamp)}</span>
                                <span class="text-muted-foreground">{progressSourceLabel(event)}</span>
                                <span class={`min-w-0 break-words ${deploymentProgressLevelClass(event.level)}`}>
                                  {event.message}
                                </span>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
                {#if workflowProgressError}
                  <p class="mt-2 text-xs text-destructive">{workflowProgressError}</p>
                {/if}
              </div>
            {/if}
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
            {#if deployFeedback.kind === "success" && lastCreatedDeploymentId}
              <Button
                class="mt-4"
                size="sm"
                onclick={() => {
                  void goto(`/deployments/${lastCreatedDeploymentId}`);
                }}
              >
                {$t(i18nKeys.common.actions.viewDeployment)}
              </Button>
            {/if}
          </CardContent>
        </Card>
      {/if}
  </aside>
</div>

<script lang="ts">
  import { browser } from "$app/environment";
  import { afterNavigate, goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import {
    CheckCircle2,
    FolderOpen,
    GitFork,
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
    type QuickDeployWorkflowInput,
    type QuickDeployWorkflowStep,
    type QuickDeployWorkflowStepOutput,
  } from "@yundu/contracts";
  import type { TranslationKey } from "@yundu/i18n";
  import type { Component } from "svelte";
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
  import DockerIcon from "$lib/components/console/DockerIcon.svelte";
  import GitHubIcon from "$lib/components/console/GitHubIcon.svelte";
  import ResourceSourceOption from "$lib/components/console/ResourceSourceOption.svelte";
  import ServerRegistrationForm from "$lib/components/console/ServerRegistrationForm.svelte";
  import { Button } from "$lib/components/ui/button";
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
  import {
    createQuickDeployServerCredential,
    createRegisterServerInput,
    createServerRegistrationDraft,
    fallbackServerProviderOptions,
    isServerRegistrationDraftComplete,
    type DraftServerConnectivityInput,
  } from "$lib/console/server-registration";
  import { deploymentDetailHref, readSessionIdentity } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type SourceKind = "local-folder" | "github" | "remote-git" | "docker-image" | "compose";
  type SourceOptionIcon = Component<{ class?: string }>;
  type GithubSourceMode = "url" | "browser";
  type DraftMode = "existing" | "new";
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
  type ResourceHealthCheckInput = NonNullable<ResourceRuntimeProfileInput["healthCheck"]>;
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
    icon: SourceOptionIcon;
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
      icon: GitHubIcon,
    },
    {
      key: "remote-git",
      labelKey: i18nKeys.console.quickDeploy.sourceRemoteGit,
      hintKey: i18nKeys.console.quickDeploy.sourceRemoteGitHint,
      icon: GitFork,
    },
    {
      key: "docker-image",
      labelKey: i18nKeys.console.quickDeploy.sourceDockerImage,
      hintKey: i18nKeys.console.quickDeploy.sourceDockerImageHint,
      icon: DockerIcon,
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
  let serverDraft = $state(
    createServerRegistrationDraft({
      name: browser ? (page.url.searchParams.get("serverName") ?? "local-machine") : "local-machine",
      host: browser ? (page.url.searchParams.get("serverHost") ?? "127.0.0.1") : "127.0.0.1",
      port: browser ? (page.url.searchParams.get("serverPort") ?? "22") : "22",
      providerKey: browser
        ? (page.url.searchParams.get("serverProvider") ?? "generic-ssh")
        : "generic-ssh",
    }),
  );
  let serverConnectivityResult = $state<TestServerConnectivityResponse | null>(null);
  let serverConnectivityError = $state("");
  let serverConnectivityTestPending = $state(false);
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
  let resourceHealthCheckEnabled = $state(
    browser ? page.url.searchParams.get("resourceHealthCheckEnabled") === "true" : false,
  );
  let resourceHealthCheckMethod = $state<"GET" | "HEAD" | "POST" | "OPTIONS">(
    parseHealthCheckMethod(browser ? page.url.searchParams.get("resourceHealthCheckMethod") : null),
  );
  let resourceHealthCheckScheme = $state<"http" | "https">(
    parseHealthCheckScheme(browser ? page.url.searchParams.get("resourceHealthCheckScheme") : null),
  );
  let resourceHealthCheckHost = $state(
    browser ? (page.url.searchParams.get("resourceHealthCheckHost") ?? "localhost") : "localhost",
  );
  let resourceHealthCheckPort = $state(browser ? (page.url.searchParams.get("resourceHealthCheckPort") ?? "") : "");
  let resourceHealthCheckPath = $state(
    browser ? (page.url.searchParams.get("resourceHealthCheckPath") ?? "/") : "/",
  );
  let resourceHealthCheckExpectedStatusCode = $state(
    browser ? (page.url.searchParams.get("resourceHealthCheckExpectedStatusCode") ?? "200") : "200",
  );
  let resourceHealthCheckResponseText = $state(
    browser ? (page.url.searchParams.get("resourceHealthCheckResponseText") ?? "") : "",
  );
  let resourceHealthCheckIntervalSeconds = $state(
    browser ? (page.url.searchParams.get("resourceHealthCheckIntervalSeconds") ?? "5") : "5",
  );
  let resourceHealthCheckTimeoutSeconds = $state(
    browser ? (page.url.searchParams.get("resourceHealthCheckTimeoutSeconds") ?? "5") : "5",
  );
  let resourceHealthCheckRetries = $state(
    browser ? (page.url.searchParams.get("resourceHealthCheckRetries") ?? "10") : "10",
  );
  let resourceHealthCheckStartPeriodSeconds = $state(
    browser ? (page.url.searchParams.get("resourceHealthCheckStartPeriodSeconds") ?? "5") : "5",
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
  let routerStateReady = $state(false);
  let deployFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let lastCreatedDeploymentId = $state("");
  let lastGeneratedAccessUrl = $state("");

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
    sshCredentials.find((credential) => credential.id === serverDraft.selectedSshCredentialId) ??
      null,
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
  const selectedProject = $derived(
    projects.find((project) => project.id === selectedProjectId) ?? null,
  );
  const selectedServer = $derived(servers.find((server) => server.id === selectedServerId) ?? null);
  const selectedEnvironment = $derived(
    environments.find((environment) => environment.id === selectedEnvironmentId) ?? null,
  );
  const selectedResource = $derived(
    resources.find((resource) => resource.id === selectedResourceId) ?? null,
  );
  const selectedResourceAccessRoute = $derived(
    selectedResource?.accessSummary?.latestGeneratedAccessRoute ??
      selectedResource?.accessSummary?.plannedGeneratedAccessRoute ??
      null,
  );
  const filteredEnvironments = $derived.by(() => {
    if (projectMode === "existing" && selectedProjectId) {
      return environments.filter((environment) => environment.projectId === selectedProjectId);
    }

    return environments;
  });
  const providerOptions = $derived(
    providers.length > 0 ? providers : fallbackServerProviderOptions,
  );
  const deployPending = $derived(
    createProjectMutation.isPending ||
      registerServerMutation.isPending ||
      configureServerCredentialMutation.isPending ||
      createSshCredentialMutation.isPending ||
      serverConnectivityTestPending ||
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

    const healthCheckPath = resourceHealthCheckPath.trim();
    const createsResource = !resourceContextEnabled || resourceMode === "new";

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

    if (createsResource && resourceHealthCheckEnabled && healthCheckPath) {
      segments.push(`--health-path ${healthCheckPath}`);
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
    providerOptions.find((provider) => provider.key === serverDraft.providerKey)?.title ??
      serverDraft.providerKey,
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

    return serverDraft.name.trim() && serverDraft.host.trim()
      ? `${serverDraft.name.trim()} · ${serverProviderTitle} · ${serverDraft.host.trim()}`
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

    if (serverDraft.providerKey !== "generic-ssh") {
      return "本机或提供商默认凭据";
    }

    return serverDraft.credentialKind === "ssh-private-key"
      ? [
          "SSH 私钥",
          selectedSshCredential?.name ||
            serverDraft.credentialPrivateKeyFileName ||
            serverDraft.sshCredentialName.trim(),
          serverDraft.credentialUsername.trim(),
        ]
          .filter(Boolean)
          .join(" · ")
      : `本机 SSH agent${serverDraft.credentialUsername.trim() ? ` · ${serverDraft.credentialUsername.trim()}` : ""}`;
  });
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
  const resourceHealthCheckSummary = $derived.by(() => {
    if (resourceContextEnabled && resourceMode === "existing") {
      return $t(i18nKeys.console.quickDeploy.healthCheckExistingResource);
    }

    return resourceHealthCheckEnabled
      ? `${resourceHealthCheckMethod} ${resourceHealthCheckPath.trim() || "/"} · ${resourceHealthCheckIntervalSeconds.trim() || "5"}s/${resourceHealthCheckTimeoutSeconds.trim() || "5"}s · ${resourceHealthCheckRetries.trim() || "10"}x`
      : $t(i18nKeys.common.status.notConfigured);
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
  const domainBindingSummary = $derived(
    selectedResourceAccessRoute?.url ?? $t(i18nKeys.console.quickDeploy.domainBindingsAfterDeploy),
  );
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
      !providerOptions.some((provider) => provider.key === serverDraft.providerKey)
    ) {
      serverDraft.providerKey = providerOptions[0].key;
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

  function parseHealthCheckMethod(value: string | null): "GET" | "HEAD" | "POST" | "OPTIONS" {
    return ["GET", "HEAD", "POST", "OPTIONS"].includes(value ?? "")
      ? (value as "GET" | "HEAD" | "POST" | "OPTIONS")
      : "GET";
  }

  function parseHealthCheckScheme(value: string | null): "http" | "https" {
    return value === "https" ? "https" : "http";
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
    setSearchParam(params, "serverName", serverDraft.name, "local-machine");
    setSearchParam(params, "serverHost", serverDraft.host, "127.0.0.1");
    setSearchParam(params, "serverPort", serverDraft.port, "22");
    setSearchParam(params, "serverProvider", serverDraft.providerKey, "generic-ssh");

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
    setSearchParam(params, "resourceHealthCheckEnabled", resourceHealthCheckEnabled ? "true" : "false", "false");
    setSearchParam(params, "resourceHealthCheckMethod", resourceHealthCheckMethod, "GET");
    setSearchParam(params, "resourceHealthCheckScheme", resourceHealthCheckScheme, "http");
    setSearchParam(params, "resourceHealthCheckHost", resourceHealthCheckHost, "localhost");
    setSearchParam(params, "resourceHealthCheckPort", resourceHealthCheckPort);
    setSearchParam(params, "resourceHealthCheckPath", resourceHealthCheckPath, "/");
    setSearchParam(params, "resourceHealthCheckExpectedStatusCode", resourceHealthCheckExpectedStatusCode, "200");
    setSearchParam(params, "resourceHealthCheckResponseText", resourceHealthCheckResponseText);
    setSearchParam(params, "resourceHealthCheckIntervalSeconds", resourceHealthCheckIntervalSeconds, "5");
    setSearchParam(params, "resourceHealthCheckTimeoutSeconds", resourceHealthCheckTimeoutSeconds, "5");
    setSearchParam(params, "resourceHealthCheckRetries", resourceHealthCheckRetries, "10");
    setSearchParam(params, "resourceHealthCheckStartPeriodSeconds", resourceHealthCheckStartPeriodSeconds, "5");

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
    serverDraft.name = params.get("serverName") ?? "local-machine";
    serverDraft.host = params.get("serverHost") ?? "127.0.0.1";
    serverDraft.port = params.get("serverPort") ?? "22";
    serverDraft.providerKey = params.get("serverProvider") ?? "generic-ssh";
    environmentName = params.get("environmentName") ?? "local";
    environmentKind = parseEnvironmentKind(params.get("environmentKind"));
    resourceName = params.get("resourceName") ?? "";
    generatedResourceName = params.get("generatedResourceName") ?? "";
    generatedResourceNameBase = "";
    resourceKind = parseResourceKind(params.get("resourceKind"));
    resourceDescription = params.get("resourceDescription") ?? "";
    resourceInternalPort = params.get("resourceInternalPort") ?? "3000";
    resourceHealthCheckEnabled = params.get("resourceHealthCheckEnabled") === "true";
    resourceHealthCheckMethod = parseHealthCheckMethod(params.get("resourceHealthCheckMethod"));
    resourceHealthCheckScheme = parseHealthCheckScheme(params.get("resourceHealthCheckScheme"));
    resourceHealthCheckHost = params.get("resourceHealthCheckHost") ?? "localhost";
    resourceHealthCheckPort = params.get("resourceHealthCheckPort") ?? "";
    resourceHealthCheckPath = params.get("resourceHealthCheckPath") ?? "/";
    resourceHealthCheckExpectedStatusCode = params.get("resourceHealthCheckExpectedStatusCode") ?? "200";
    resourceHealthCheckResponseText = params.get("resourceHealthCheckResponseText") ?? "";
    resourceHealthCheckIntervalSeconds = params.get("resourceHealthCheckIntervalSeconds") ?? "5";
    resourceHealthCheckTimeoutSeconds = params.get("resourceHealthCheckTimeoutSeconds") ?? "5";
    resourceHealthCheckRetries = params.get("resourceHealthCheckRetries") ?? "10";
    resourceHealthCheckStartPeriodSeconds = params.get("resourceHealthCheckStartPeriodSeconds") ?? "5";
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

  function positiveIntegerField(value: string, fallback: number): number {
    const parsed = Number(value.trim() || String(fallback));
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error($t(i18nKeys.console.quickDeploy.healthCheckInvalid));
    }
    return parsed;
  }

  function nonNegativeIntegerField(value: string, fallback: number): number {
    const parsed = Number(value.trim() || String(fallback));
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error($t(i18nKeys.console.quickDeploy.healthCheckInvalid));
    }
    return parsed;
  }

  function optionalPortField(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error($t(i18nKeys.console.quickDeploy.healthCheckInvalid));
    }
    return parsed;
  }

  function statusCodeField(value: string): number {
    const parsed = Number(value.trim() || "200");
    if (!Number.isInteger(parsed) || parsed < 100 || parsed > 599) {
      throw new Error($t(i18nKeys.console.quickDeploy.healthCheckInvalid));
    }
    return parsed;
  }

  function healthCheckPolicyForResource(): ResourceHealthCheckInput | undefined {
    if (!resourceHealthCheckEnabled) {
      return undefined;
    }

    const port = optionalPortField(resourceHealthCheckPort);
    const path = resourceHealthCheckPath.trim() || "/";
    return {
      enabled: true,
      type: "http",
      intervalSeconds: positiveIntegerField(resourceHealthCheckIntervalSeconds, 5),
      timeoutSeconds: positiveIntegerField(resourceHealthCheckTimeoutSeconds, 5),
      retries: positiveIntegerField(resourceHealthCheckRetries, 10),
      startPeriodSeconds: nonNegativeIntegerField(resourceHealthCheckStartPeriodSeconds, 5),
      http: {
        method: resourceHealthCheckMethod,
        scheme: resourceHealthCheckScheme,
        host: resourceHealthCheckHost.trim() || "localhost",
        ...(port ? { port } : {}),
        path,
        expectedStatusCode: statusCodeField(resourceHealthCheckExpectedStatusCode),
        ...(resourceHealthCheckResponseText.trim()
          ? { expectedResponseText: resourceHealthCheckResponseText.trim() }
          : {}),
      },
    };
  }

  function runtimeProfileForSource(): ResourceRuntimeProfileInput {
    const healthCheck = healthCheckPolicyForResource();
    const withHealthCheckPath = (
      input: ResourceRuntimeProfileInput,
    ): ResourceRuntimeProfileInput =>
      healthCheck
        ? {
            ...input,
            healthCheckPath: healthCheck.http?.path,
            healthCheck,
          }
        : input;

    switch (sourceKind) {
      case "docker-image":
        return withHealthCheckPath({ strategy: "prebuilt-image" });
      case "compose":
        return withHealthCheckPath({ strategy: "docker-compose" });
      default:
        return withHealthCheckPath({ strategy: "auto" });
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

        return isServerRegistrationDraftComplete(serverDraft, sshCredentials);
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

  function lastCreatedDeploymentHref(): string {
    if (!selectedProjectId || !selectedEnvironmentId || !selectedResourceId) {
      return `/deployments/${encodeURIComponent(lastCreatedDeploymentId)}`;
    }

    return deploymentDetailHref({
      id: lastCreatedDeploymentId,
      projectId: selectedProjectId,
      environmentId: selectedEnvironmentId,
      resourceId: selectedResourceId,
    });
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

  function testDraftServerConnectivity(input: DraftServerConnectivityInput) {
    return orpcClient.servers.testDraftConnectivity(input);
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
        serverDraft.selectedSshCredentialId = createdCredential.id;
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
        const registerInput = createRegisterServerInput(serverDraft);
        if (!registerInput) {
          throw new Error($t(i18nKeys.console.servers.createValidationError));
        }

        if (!isServerRegistrationDraftComplete(serverDraft, sshCredentials)) {
          throw new Error($t(i18nKeys.console.servers.createCredentialValidationError));
        }

        const credential = createQuickDeployServerCredential(serverDraft, sshCredentials);

        workflowServer = {
          mode: "create",
          input: registerInput,
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
      const refreshedResources = await orpcClient.resources.list({
        projectId: workflowResult.projectId,
        environmentId: workflowResult.environmentId,
      });
      const refreshedResource = refreshedResources.items.find(
        (candidate) => candidate.id === workflowResult.resourceId,
      );
      lastGeneratedAccessUrl =
        refreshedResource?.accessSummary?.latestGeneratedAccessRoute?.url ??
        refreshedResource?.accessSummary?.plannedGeneratedAccessRoute?.url ??
        "";

      deployFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.quickDeploy.deployFeedbackSuccessTitle),
        detail:
          lastGeneratedAccessUrl ||
          $t(i18nKeys.console.quickDeploy.deploymentIdDetail, {
            deploymentId: workflowResult.deploymentId,
          }),
      };
      lastCreatedDeploymentId = workflowResult.deploymentId;
    } catch (error) {
      workflowProgressError = readErrorMessage(error);
      lastGeneratedAccessUrl = "";
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
      <section class="space-y-6">
        <div class="space-y-2">
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.quickDeploy.deploymentEntryTitle, { stepTitle: activeStepDetails.title })}</h2>
          <p class="text-sm text-muted-foreground">{activeStepDetails.description}</p>
        </div>
        <div class="space-y-6">
          <div class="flex flex-wrap items-center gap-1.5 bg-muted/20 px-2 py-2">
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
            <div
              class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
              role="radiogroup"
              aria-label={$t(i18nKeys.common.domain.source)}
            >
              {#each sourceOptions as option (option.key)}
                <ResourceSourceOption
                  selected={sourceKind === option.key}
                  label={$t(option.labelKey)}
                  description={$t(option.hintKey)}
                  icon={option.icon}
                  onselect={() => {
                    selectSourceKind(option.key);
                  }}
                />
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
                <div class="bg-muted/30 px-3 py-3 text-sm">
                  <span class="text-muted-foreground">{$t(i18nKeys.console.quickDeploy.currentIdentity)}</span>
                  <span class="ml-2 font-medium">{authIdentity}</span>
                </div>
              {/if}

              {#if !githubProvider?.configured}
                <div class="bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.quickDeploy.githubOAuthNotConfigured)}
                </div>
              {:else if !githubConnected}
                <Button variant="outline" class="w-full" onclick={connectGitHub}>
                  <GitHubIcon class="size-4" />
                  {$t(i18nKeys.common.actions.connectGitHub)}
                </Button>
              {:else}
                <div class="space-y-3">
                  <Input bind:value={githubRepositorySearch} placeholder={$t(i18nKeys.console.quickDeploy.githubRepositorySearch)} />
                  <div class="max-h-64 space-y-2 overflow-auto bg-muted/20 p-2">
                    {#if githubRepositoriesQuery.isPending}
                      {#each Array.from({ length: 4 }) as _, index (index)}
                        <Skeleton class="h-14 w-full" />
                      {/each}
                    {:else if githubRepositories.length > 0}
                      {#each githubRepositories as repository (repository.id)}
                        <button
                          type="button"
                          class={`w-full px-3 py-3 text-left transition-colors ${
                            selectedGitHubRepositoryId === repository.id
                              ? "bg-primary/5 ring-1 ring-primary/40"
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
              <div class="bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
                {$t(i18nKeys.console.quickDeploy.noProjectOptions)}
              </div>
            {/if}
            {#if projectMode === "existing" && projects.length > 0}
              <div class="max-h-44 space-y-2 overflow-auto bg-muted/20 p-2">
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
              <div class="max-h-44 space-y-2 overflow-auto bg-muted/20 p-2">
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
              <ServerRegistrationForm
                bind:draft={serverDraft}
                bind:connectivityResult={serverConnectivityResult}
                bind:connectivityError={serverConnectivityError}
                bind:testPending={serverConnectivityTestPending}
                providers={providerOptions}
                {sshCredentials}
                testConnectivity={testDraftServerConnectivity}
              />
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
              <div class="max-h-44 space-y-2 overflow-auto bg-muted/20 p-2">
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
                <div class="rounded-md border bg-background px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.source)}</p>
                  <p class="mt-1 truncate font-medium">{$t(selectedSourceOption.labelKey)} · {sourceSummary}</p>
                </div>
                <div class="rounded-md border bg-background px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.project)}</p>
                  <p class="mt-1 truncate font-medium">{projectSummary}</p>
                </div>
                <div class="rounded-md border bg-background px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.server)}</p>
                  <p class="mt-1 truncate font-medium">{serverSummary}</p>
                  <p class="mt-1 truncate text-xs text-muted-foreground">{serverCredentialSummary}</p>
                </div>
                <div class="rounded-md border bg-background px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</p>
                  <p class="mt-1 truncate font-medium">{environmentSummary}</p>
                </div>
                <div class="rounded-md border bg-background px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</p>
                  <p class="mt-1 truncate font-medium">{resourceSummary}</p>
                </div>
                <div class="rounded-md border bg-background px-3 py-3">
                  <p class="text-xs text-muted-foreground">
                    {$t(i18nKeys.console.quickDeploy.healthCheckPath)}
                  </p>
                  <p class="mt-1 truncate font-medium">{resourceHealthCheckSummary}</p>
                </div>
                <div class="rounded-md border bg-background px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.domainBindings)}</p>
                  <p class="mt-1 truncate font-medium">{domainBindingSummary}</p>
                </div>
                <div class="rounded-md border bg-background px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.variables)}</p>
                  <p class="mt-1 truncate font-medium">{variableSummary}</p>
                </div>
              </div>

              <div class="space-y-3">
                <div class="rounded-md border bg-background px-3 py-3">
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
                        <div class="max-h-44 space-y-2 overflow-auto bg-muted/20 p-2">
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

                <div class="rounded-md border bg-background px-3 py-3">
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
                        <div class="max-h-44 space-y-2 overflow-auto bg-muted/20 p-2">
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

                <div class="rounded-md border bg-background px-3 py-3">
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
                        <div class="max-h-44 space-y-2 overflow-auto bg-muted/20 p-2">
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
                        <div class="grid gap-3 sm:grid-cols-2">
                          <div class="space-y-2">
                            <label class="text-xs font-medium text-muted-foreground" for="resource-internal-port">
                              {$t(i18nKeys.console.quickDeploy.applicationPort)}
                            </label>
                            <Input id="resource-internal-port" bind:value={resourceInternalPort} placeholder="3000" />
                            <p class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.quickDeploy.applicationPortHint)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant={resourceHealthCheckEnabled ? "selected" : "outline"}
                            onclick={() => {
                              resourceHealthCheckEnabled = !resourceHealthCheckEnabled;
                            }}
                          >
                            {$t(i18nKeys.console.quickDeploy.healthCheckToggle)}
                          </Button>
                        </div>
                        {#if resourceHealthCheckEnabled}
                          <div class="grid gap-3 rounded-md border bg-muted/10 p-3 sm:grid-cols-3">
                            <div class="space-y-1">
                              <label class="text-xs font-medium text-muted-foreground" for="resource-health-path">
                                {$t(i18nKeys.console.quickDeploy.healthCheckPath)}
                              </label>
                              <Input id="resource-health-path" bind:value={resourceHealthCheckPath} placeholder="/health" />
                            </div>
                            <div class="space-y-1">
                              <label class="text-xs font-medium text-muted-foreground" for="resource-health-status">
                                {$t(i18nKeys.console.quickDeploy.healthCheckExpectedStatusCode)}
                              </label>
                              <Input
                                id="resource-health-status"
                                bind:value={resourceHealthCheckExpectedStatusCode}
                                inputmode="numeric"
                                placeholder="200"
                              />
                            </div>
                            <div class="space-y-1">
                              <label class="text-xs font-medium text-muted-foreground" for="resource-health-interval">
                                {$t(i18nKeys.console.quickDeploy.healthCheckIntervalSeconds)}
                              </label>
                              <Input
                                id="resource-health-interval"
                                bind:value={resourceHealthCheckIntervalSeconds}
                                inputmode="numeric"
                                placeholder="5"
                              />
                            </div>
                            <div class="space-y-1">
                              <label class="text-xs font-medium text-muted-foreground" for="resource-health-timeout">
                                {$t(i18nKeys.console.quickDeploy.healthCheckTimeoutSeconds)}
                              </label>
                              <Input
                                id="resource-health-timeout"
                                bind:value={resourceHealthCheckTimeoutSeconds}
                                inputmode="numeric"
                                placeholder="5"
                              />
                            </div>
                            <div class="space-y-1">
                              <label class="text-xs font-medium text-muted-foreground" for="resource-health-retries">
                                {$t(i18nKeys.console.quickDeploy.healthCheckRetries)}
                              </label>
                              <Input
                                id="resource-health-retries"
                                bind:value={resourceHealthCheckRetries}
                                inputmode="numeric"
                                placeholder="10"
                              />
                            </div>
                            <div class="space-y-1">
                              <label class="text-xs font-medium text-muted-foreground" for="resource-health-start-period">
                                {$t(i18nKeys.console.quickDeploy.healthCheckStartPeriodSeconds)}
                              </label>
                              <Input
                                id="resource-health-start-period"
                                bind:value={resourceHealthCheckStartPeriodSeconds}
                                inputmode="numeric"
                                placeholder="5"
                              />
                            </div>
                          </div>
                          <p class="text-xs text-muted-foreground">
                            {$t(i18nKeys.console.quickDeploy.healthCheckPathHint)}
                          </p>
                        {/if}
                      {/if}
                    </div>
                  {/if}
                  {#if !resourceContextEnabled}
                    <div class="mt-3 grid gap-3 sm:grid-cols-2">
                      <div class="space-y-2">
                        <label class="text-xs font-medium text-muted-foreground" for="resource-default-internal-port">
                          {$t(i18nKeys.console.quickDeploy.applicationPort)}
                        </label>
                        <Input id="resource-default-internal-port" bind:value={resourceInternalPort} placeholder="3000" />
                        <p class="text-xs text-muted-foreground">
                          {$t(i18nKeys.console.quickDeploy.applicationPortHint)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant={resourceHealthCheckEnabled ? "selected" : "outline"}
                        onclick={() => {
                          resourceHealthCheckEnabled = !resourceHealthCheckEnabled;
                        }}
                      >
                        {$t(i18nKeys.console.quickDeploy.healthCheckToggle)}
                      </Button>
                    </div>
                    {#if resourceHealthCheckEnabled}
                      <div class="mt-3 grid gap-3 rounded-md border bg-muted/10 p-3 sm:grid-cols-3">
                        <div class="space-y-1">
                          <label class="text-xs font-medium text-muted-foreground" for="resource-default-health-path">
                            {$t(i18nKeys.console.quickDeploy.healthCheckPath)}
                          </label>
                          <Input
                            id="resource-default-health-path"
                            bind:value={resourceHealthCheckPath}
                            placeholder="/health"
                          />
                        </div>
                        <div class="space-y-1">
                          <label class="text-xs font-medium text-muted-foreground" for="resource-default-health-status">
                            {$t(i18nKeys.console.quickDeploy.healthCheckExpectedStatusCode)}
                          </label>
                          <Input
                            id="resource-default-health-status"
                            bind:value={resourceHealthCheckExpectedStatusCode}
                            inputmode="numeric"
                            placeholder="200"
                          />
                        </div>
                        <div class="space-y-1">
                          <label class="text-xs font-medium text-muted-foreground" for="resource-default-health-interval">
                            {$t(i18nKeys.console.quickDeploy.healthCheckIntervalSeconds)}
                          </label>
                          <Input
                            id="resource-default-health-interval"
                            bind:value={resourceHealthCheckIntervalSeconds}
                            inputmode="numeric"
                            placeholder="5"
                          />
                        </div>
                        <div class="space-y-1">
                          <label class="text-xs font-medium text-muted-foreground" for="resource-default-health-timeout">
                            {$t(i18nKeys.console.quickDeploy.healthCheckTimeoutSeconds)}
                          </label>
                          <Input
                            id="resource-default-health-timeout"
                            bind:value={resourceHealthCheckTimeoutSeconds}
                            inputmode="numeric"
                            placeholder="5"
                          />
                        </div>
                        <div class="space-y-1">
                          <label class="text-xs font-medium text-muted-foreground" for="resource-default-health-retries">
                            {$t(i18nKeys.console.quickDeploy.healthCheckRetries)}
                          </label>
                          <Input
                            id="resource-default-health-retries"
                            bind:value={resourceHealthCheckRetries}
                            inputmode="numeric"
                            placeholder="10"
                          />
                        </div>
                        <div class="space-y-1">
                          <label
                            class="text-xs font-medium text-muted-foreground"
                            for="resource-default-health-start-period"
                          >
                            {$t(i18nKeys.console.quickDeploy.healthCheckStartPeriodSeconds)}
                          </label>
                          <Input
                            id="resource-default-health-start-period"
                            bind:value={resourceHealthCheckStartPeriodSeconds}
                            inputmode="numeric"
                            placeholder="5"
                          />
                        </div>
                      </div>
                      <p class="mt-2 text-xs text-muted-foreground">
                        {$t(i18nKeys.console.quickDeploy.healthCheckPathHint)}
                      </p>
                    {/if}
                  {/if}
                </div>

                <div class="rounded-md border bg-background px-3 py-3">
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
        </div>
        <div class="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
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
        </div>
      </section>

  </div>

  <aside class="space-y-5 xl:sticky xl:top-5 xl:self-start">
      <section class="space-y-4 rounded-md border bg-background p-4">
        <div class="space-y-2">
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.quickDeploy.currentSummary)}</h2>
          <p class="text-sm text-muted-foreground">{$t(i18nKeys.console.quickDeploy.currentSummaryDescription)}</p>
        </div>
        <div class="space-y-3 text-sm">
          <div class="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
            <span class="text-muted-foreground">{$t(i18nKeys.console.quickDeploy.sourceType)}</span>
            <span class="font-medium">{$t(selectedSourceOption.labelKey)}</span>
          </div>
          <div class="rounded-md border bg-muted/10 px-3 py-3">
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
          <div class="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.project)}</span>
            <span class="font-medium">{projectSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.server)}</span>
            <span class="font-medium">{serverSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</span>
            <span class="font-medium">{environmentSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</span>
            <span class="font-medium">{resourceSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
            <span class="text-muted-foreground">
              {$t(i18nKeys.console.quickDeploy.healthCheckPath)}
            </span>
            <span class="min-w-0 truncate text-right font-medium">{resourceHealthCheckSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.domainBindings)}</span>
            <span class="min-w-0 truncate text-right font-medium">{domainBindingSummary}</span>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
            <span class="text-muted-foreground">{$t(i18nKeys.common.domain.variables)}</span>
            <span class="font-medium">{variableSummary}</span>
          </div>
        </div>
        {#if activeStep === "review"}
          <div class="flex flex-col items-stretch gap-3">
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
              <div class="bg-muted/20 px-3 py-3">
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
                  <div class="mt-3 max-h-56 overflow-auto bg-background/60 px-3 py-2">
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
            <pre class="overflow-x-auto bg-muted px-3 py-3 text-xs text-muted-foreground">{deploymentCommandPreview}</pre>
          </div>
        {/if}
      </section>

      {#if deployFeedback}
        <section class={deployFeedback.kind === "success" ? "space-y-3 border-y py-4" : "space-y-3 border-y border-destructive/30 py-4"}>
          <div>
            <h2 class="flex items-center gap-2 text-base font-semibold">
              {#if deployFeedback.kind === "success"}
                <CheckCircle2 class="size-4" />
              {:else}
                <ShieldCheck class="size-4" />
              {/if}
              {deployFeedback.title}
            </h2>
          </div>
          <div>
            <p class="text-sm text-muted-foreground">{deployFeedback.detail}</p>
            {#if deployFeedback.kind === "success" && lastCreatedDeploymentId}
              <div class="mt-4 flex flex-wrap gap-2">
                {#if lastGeneratedAccessUrl}
                  <Button
                    href={lastGeneratedAccessUrl}
                    target="_blank"
                    rel="noreferrer"
                    size="sm"
                    variant="outline"
                  >
                    {$t(i18nKeys.console.resources.openGeneratedAccess)}
                  </Button>
                {/if}
                <Button
                  size="sm"
                  onclick={() => {
                    void goto(lastCreatedDeploymentHref());
                  }}
                >
                  {$t(i18nKeys.common.actions.viewDeployment)}
                </Button>
              </div>
            {/if}
          </div>
        </section>
      {/if}
  </aside>
</div>

<script lang="ts">
  import { browser } from "$app/environment";
  import { afterNavigate, goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import {
    CheckCircle2,
    ExternalLink,
    Eye,
    FolderOpen,
    GitFork,
    HardDriveDownload,
    LoaderCircle,
    Package,
    Play,
    Server,
    Settings2,
    ShieldCheck,
    TerminalSquare,
    Waypoints,
  } from "@lucide/svelte";
  import {
    siClickhouse,
    siMinio,
    siMysql,
    siOpensearch,
    siPostgresql,
    siRedis,
  } from "simple-icons";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import {
    createQuickDeployOutcomePacket,
    createQuickDeployGeneratedResourceName,
    normalizeQuickDeployGeneratedNameBase,
    runQuickDeployWorkflow,
    type QuickDeployDependencyProvisioningInput,
    type QuickDeployProvisionDependencyResourcesInput,
    type QuickDeployWorkflowInput,
    type QuickDeployWorkflowStep,
    type QuickDeployWorkflowStepOutput,
  } from "@appaloft/contracts";
  import type { TranslationKey } from "@appaloft/i18n";
  import { onDestroy, type Component } from "svelte";
  import type {
    AuthSessionResponse,
    ConfigureResourceNetworkInput,
    ConfigureResourceRuntimeInput,
    ConfigureResourceSourceInput,
    ConfigureServerCredentialInput,
    CreateDeploymentInput,
    DeploymentProgressEvent,
    DependencyResourceSummary,
    CreateResourceInput,
    EnvironmentSummary,
    GitHubRepositorySummary,
    ProjectSummary,
    RegisterServerInput,
    ResourceSummary,
    ServerSummary,
    SshCredentialSummary,
    SystemPluginWebExtension,
    TestServerConnectivityResponse,
  } from "@appaloft/contracts";

  import { API_BASE, readErrorMessage, request } from "$lib/api/client";
  import BlueprintCatalogSelector from "$lib/components/console/BlueprintCatalogSelector.svelte";
  import BlueprintProductIcon from "$lib/components/console/BlueprintProductIcon.svelte";
  import DockerIcon from "$lib/components/console/DockerIcon.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import GitHubIcon from "$lib/components/console/GitHubIcon.svelte";
  import QuickDeployProgressDialog from "$lib/components/console/QuickDeployProgressDialog.svelte";
  import ResourceSourceOption from "$lib/components/console/ResourceSourceOption.svelte";
  import ServerRegistrationForm from "$lib/components/console/ServerRegistrationForm.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Badge } from "$lib/components/ui/badge";
  import * as Dialog from "$lib/components/ui/dialog";
  import {
    endpointFromTemplate,
    readBlueprintCatalogExtensionMetadata,
  } from "$lib/console/blueprint-marketplace-extension";
  import { createDeploymentWithProgress } from "$lib/console/deployment-progress";
  import { quickDeploySourceHelpHref, webDocsHrefs } from "$lib/console/docs-help";
  import {
    defaultAuthSession,
    defaultConsoleListLimit,
    type ProviderSummary,
  } from "$lib/console/queries";
  import { selectCurrentResourceAccessRoute } from "$lib/console/resource-access-route";
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

  type SourceKind =
    | "local-folder"
    | "github"
    | "blueprint"
    | "remote-git"
    | "docker-image"
    | "compose"
    | "static-site";
  type SourceOptionIcon = Component<{ class?: string }>;
  type GithubSourceMode = "url" | "browser";
  type DraftMode = "existing" | "new";
  type EnvironmentKind = EnvironmentSummary["kind"];
  type ResourceKind = ResourceSummary["kind"];
  type DependencyKind = DependencyResourceSummary["kind"];
  type DependencyKindIcon = {
    title: string;
    path: string;
    hex: string;
  };
  type BlueprintDependencyProvisioningMode = "create" | "reuse";
  type BlueprintDependencyProvisioningDraft = {
    requirementId: string;
    kind: DependencyKind;
    mode: BlueprintDependencyProvisioningMode;
    reuseConnectionUrl: string;
    reuseSecretRef: string;
  };
  type BlueprintDependencyRequirement = {
    id: string;
    kind: DependencyKind;
    label: string;
    optional?: boolean;
  };
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
  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
  };
  type BlueprintCatalogListing = {
    slug: string;
    title: string;
    subtitle: string;
    category: string;
    featured: boolean;
    websiteUrl?: string;
    documentationUrl?: string;
    icon?: {
      label?: string;
      tone?: string;
      url?: string;
      alt?: string;
    };
    publisher: {
      name: string;
      verified: boolean;
    };
    blueprint: {
      id: string;
      version: string;
      summary: string;
      tags: readonly string[];
    };
    overview?: {
      highlights?: readonly string[];
      useCases?: readonly string[];
    };
    requirementsSummary?: {
      components: number;
      dependencies: readonly string[];
      ports: readonly string[];
    };
  };
  type BlueprintDetailResponse = {
    listing: BlueprintCatalogListing;
    manifest: {
      summary: string;
      description?: string;
      parameters: readonly { key: string; label: string; type: string; required?: boolean; default?: unknown }[];
      secrets: readonly { key: string; label: string; required?: boolean; description?: string }[];
      resources: readonly { id: string; kind: string; label: string; optional?: boolean }[];
      components: readonly {
        id: string;
        name: string;
        kind: string;
        runtime: {
          strategy: string;
          image?: string;
          buildCommand?: string;
          startCommand?: string;
          outputDirectory?: string;
        };
        ports: readonly { name: string; containerPort: number; protocol: string; public?: boolean }[];
        routes: readonly { port: string; pathPrefix: string }[];
        variables: readonly { key: string; value: string; description?: string }[];
        usesSecrets: readonly string[];
        usesResources: readonly string[];
      }[];
    };
    install: {
      profiles: readonly string[];
      defaultProfile: string;
      parameters: readonly { key: string; label: string; type: string; required?: boolean; default?: unknown }[];
      secrets: readonly { key: string; label: string; required?: boolean }[];
    };
  };
  type BlueprintComponent = BlueprintDetailResponse["manifest"]["components"][number];
  type ResourceDraftInput = Pick<CreateResourceInput, "name"> &
    Partial<Pick<CreateResourceInput, "kind" | "description" | "services">>;
  type ResourceSourceInput = NonNullable<CreateResourceInput["source"]>;
  type ResourceRuntimeProfileInput = NonNullable<CreateResourceInput["runtimeProfile"]>;
  type ResourceHealthCheckInput = NonNullable<ResourceRuntimeProfileInput["healthCheck"]>;
  type ResourceNetworkProfileInput = NonNullable<CreateResourceInput["networkProfile"]>;
  type AppaloftDesktopBridge = {
    copyText?: (text: string) => Promise<void>;
    selectDirectory?: () => Promise<string | null | undefined>;
  };
  type WindowWithAppaloftDesktopBridge = Window &
    typeof globalThis & {
      appaloftDesktop?: AppaloftDesktopBridge;
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
  const dependencyKindOptions: Record<
    DependencyKind,
    { label: string; icon: DependencyKindIcon }
  > = {
    postgres: {
      label: "Postgres",
      icon: siPostgresql,
    },
    redis: {
      label: "Redis",
      icon: siRedis,
    },
    mysql: {
      label: "MySQL",
      icon: siMysql,
    },
    clickhouse: {
      label: "ClickHouse",
      icon: siClickhouse,
    },
    "object-storage": {
      label: "Object Storage",
      icon: siMinio,
    },
    opensearch: {
      label: "OpenSearch",
      icon: siOpensearch,
    },
  };
  const dependencyKindOrder = [
    "postgres",
    "redis",
    "mysql",
    "clickhouse",
    "object-storage",
    "opensearch",
  ] as const satisfies readonly DependencyKind[];
  const blueprintDependencyProvisioningModes = [
    "create",
    "reuse",
  ] as const satisfies readonly BlueprintDependencyProvisioningMode[];
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
      key: "blueprint",
      labelKey: i18nKeys.console.quickDeploy.sourceBlueprint,
      hintKey: i18nKeys.console.quickDeploy.sourceBlueprintHint,
      icon: Package,
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
    {
      key: "static-site",
      labelKey: i18nKeys.console.quickDeploy.sourceStaticSite,
      hintKey: i18nKeys.console.quickDeploy.sourceStaticSiteHint,
      icon: Package,
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
      queryKey: ["projects", { limit: defaultConsoleListLimit }],
      queryFn: () => orpcClient.projects.list({ limit: defaultConsoleListLimit }),
      enabled: browser && enabled,
    }),
  );
  const serversQuery = createQuery(() =>
    queryOptions({
      queryKey: ["servers", { limit: defaultConsoleListLimit }],
      queryFn: () => orpcClient.servers.list({ limit: defaultConsoleListLimit }),
      enabled: browser && enabled,
    }),
  );
  const environmentsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["environments", { limit: defaultConsoleListLimit }],
      queryFn: () => orpcClient.environments.list({ limit: defaultConsoleListLimit }),
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
  const webExtensionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system-plugins", "web-extensions"],
      queryFn: () => request<SystemPluginWebExtensionsResponse>("/api/system-plugins/web-extensions"),
      enabled: browser && enabled,
      staleTime: 30_000,
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
  let dependencyProvisioningInFlight = $state(false);
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
  let resourceRuntimeName = $state(browser ? (page.url.searchParams.get("resourceRuntimeName") ?? "") : "");
  let sourceBaseDirectory = $state(browser ? (page.url.searchParams.get("sourceBaseDirectory") ?? "") : "");
  let resourceInstallCommand = $state(browser ? (page.url.searchParams.get("resourceInstallCommand") ?? "") : "");
  let resourceBuildCommand = $state(browser ? (page.url.searchParams.get("resourceBuildCommand") ?? "") : "");
  let resourceStartCommand = $state(browser ? (page.url.searchParams.get("resourceStartCommand") ?? "") : "");
  let resourceDockerfilePath = $state(browser ? (page.url.searchParams.get("resourceDockerfilePath") ?? "") : "");
  let resourceDockerComposeFilePath = $state(
    browser ? (page.url.searchParams.get("resourceDockerComposeFilePath") ?? "") : "",
  );
  let resourceBuildTarget = $state(browser ? (page.url.searchParams.get("resourceBuildTarget") ?? "") : "");
  let resourceInternalPort = $state(
    browser
      ? (page.url.searchParams.get("resourceInternalPort") ??
        (initialSourceKind === "static-site" ? "80" : "3000"))
      : "3000",
  );
  let staticPublishDirectory = $state(browser ? (page.url.searchParams.get("staticPublishDirectory") ?? "/dist") : "/dist");
  let staticInstallCommand = $state(browser ? (page.url.searchParams.get("staticInstallCommand") ?? "") : "");
  let staticBuildCommand = $state(browser ? (page.url.searchParams.get("staticBuildCommand") ?? "") : "");
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
  let staticSiteLocator = $state(browser ? (page.url.searchParams.get("sourceLocator") ?? ".") : ".");
  let selectedBlueprintSourceExtensionKey = $state(
    browser ? (page.url.searchParams.get("sourceExtension") ?? "") : "",
  );
  let selectedBlueprintSlug = $state(browser ? (page.url.searchParams.get("blueprintSlug") ?? "") : "");
  let selectedBlueprintTitle = $state(browser ? (page.url.searchParams.get("blueprintTitle") ?? "") : "");
  let blueprintDependencyProvisioningDrafts = $state<
    Record<string, BlueprintDependencyProvisioningDraft>
  >({});
  let blueprintSelectorDialogOpen = $state(false);
  let blueprintDetailDialogOpen = $state(false);
  let blueprintDetailSlug = $state("");
  let blueprintDetailTitle = $state("");
  let lastAppliedUrlSearch = browser ? page.url.search : "";
  let routerStateReady = $state(false);
  let deployFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let workflowProgressDialogOpen = $state(false);
  let lastCreatedDeploymentId = $state("");
  let workflowDeploymentTraceLink = $state("");
  let lastAccessUrl = $state("");
  let diagnosticSummaryLoading = $state(false);
  let diagnosticSummaryCopyState = $state<"idle" | "copied" | "failed">("idle");
  let diagnosticSummaryError = $state<string | null>(null);
  let diagnosticSummaryCopyFallback = $state<string | null>(null);
  let diagnosticSummaryCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;

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
  const configureResourceSourceMutation = createMutation(() => ({
    mutationFn: (input: ConfigureResourceSourceInput) =>
      orpcClient.resources.configureSource(input),
  }));
  const configureResourceRuntimeMutation = createMutation(() => ({
    mutationFn: (input: ConfigureResourceRuntimeInput) =>
      orpcClient.resources.configureRuntime(input),
  }));
  const configureResourceNetworkMutation = createMutation(() => ({
    mutationFn: (input: ConfigureResourceNetworkInput) =>
      orpcClient.resources.configureNetwork(input),
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
  const quickDeploySourceExtensions = $derived.by(() =>
    (webExtensionsQuery.data?.items ?? [])
      .filter((extension) => extension.placement === "quick-deploy-source")
      .toSorted((a, b) => a.title.localeCompare(b.title)),
  );
  const selectedBlueprintSourceExtension = $derived(
    quickDeploySourceExtensions.find(
      (extension) => extension.key === selectedBlueprintSourceExtensionKey,
    ) ??
      quickDeploySourceExtensions[0] ??
      null,
  );
  const selectedBlueprintDetailEndpointValue = $derived.by(() => {
    const slug = blueprintDetailSlug.trim() || selectedBlueprintSlug.trim();
    const metadata = readBlueprintCatalogExtensionMetadata(selectedBlueprintSourceExtension);
    if (!slug || !metadata) {
      return "";
    }

    if (metadata.detailEndpointTemplate) {
      return endpointFromTemplate(metadata.detailEndpointTemplate, slug);
    }

    return `${metadata.listEndpoint.replace(/\/$/, "")}/${encodeURIComponent(slug)}`;
  });
  const selectedBlueprintDetailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["blueprint-catalog-detail", selectedBlueprintDetailEndpointValue],
      queryFn: () => request<BlueprintDetailResponse>(selectedBlueprintDetailEndpointValue),
      enabled:
        browser &&
        enabled &&
        (blueprintDetailDialogOpen ||
          (sourceKind === "blueprint" && Boolean(selectedBlueprintSlug.trim()))) &&
        Boolean(selectedBlueprintDetailEndpointValue),
      staleTime: 30_000,
    }),
  );
  const selectedBlueprintDetail = $derived(selectedBlueprintDetailQuery.data ?? null);
  const selectedBlueprintListing = $derived(selectedBlueprintDetail?.listing ?? null);
  const selectedBlueprintManifest = $derived(selectedBlueprintDetail?.manifest ?? null);
  const selectedBlueprintVariables = $derived(
    selectedBlueprintManifest?.components.flatMap((component) => component.variables) ?? [],
  );
  const selectedBlueprintPrimaryComponent = $derived(
    selectedBlueprintManifest?.components[0] ?? null,
  );
  const selectedBlueprintDefaultPort = $derived.by(() => {
    const component = selectedBlueprintPrimaryComponent;
    const port =
      component?.ports.find((candidate) => candidate.public && candidate.protocol === "http") ??
      component?.ports.find((candidate) => candidate.protocol === "http") ??
      component?.ports[0];

    return port ? String(port.containerPort) : "3000";
  });
  const selectedBlueprintProvisionableDependencies = $derived(
    selectedBlueprintManifest?.resources.flatMap((resource): BlueprintDependencyRequirement[] =>
      isProvisionableDependencyKind(resource.kind)
        ? [
            {
              id: resource.id,
              kind: resource.kind,
              label: resource.label,
              ...(resource.optional ? { optional: resource.optional } : {}),
            },
          ]
        : [],
    ) ?? [],
  );
  const selectedBlueprintUnsupportedDependencies = $derived(
    selectedBlueprintManifest?.resources.filter(
      (resource) => !isProvisionableDependencyKind(resource.kind),
    ) ?? [],
  );
  const blueprintDependencyProvisioningSummary = $derived.by(() => {
    if (selectedBlueprintProvisionableDependencies.length === 0) {
      return "无";
    }

    const createCount = selectedBlueprintProvisionableDependencies.filter(
      (requirement) => blueprintDependencyDraft(requirement).mode === "create",
    ).length;
    const reuseCount = selectedBlueprintProvisionableDependencies.length - createCount;

    return [
      createCount > 0 ? `${createCount} create` : "",
      reuseCount > 0 ? `${reuseCount} reuse` : "",
    ]
      .filter(Boolean)
      .join(" / ");
  });
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
      typeof (window as WindowWithAppaloftDesktopBridge).appaloftDesktop?.selectDirectory === "function",
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
    selectCurrentResourceAccessRoute(selectedResource?.accessSummary)?.route ?? null,
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
      configureResourceSourceMutation.isPending ||
      configureResourceRuntimeMutation.isPending ||
      configureResourceNetworkMutation.isPending ||
      setEnvironmentVariableMutation.isPending ||
      dependencyProvisioningInFlight ||
      deploymentCreateInFlight,
  );
  const sourceLocator = $derived.by(() => {
    switch (sourceKind) {
      case "github":
        return githubLocator.trim();
      case "blueprint":
        return selectedBlueprintSourceExtension?.key ?? "";
      case "remote-git":
        return remoteGitLocator.trim();
      case "docker-image":
        return dockerImageLocator.trim();
      case "compose":
        return composeLocator.trim();
      case "static-site":
        return staticSiteLocator.trim();
      default:
        return localFolderLocator.trim();
    }
  });
  const sourcePlaceholder = $derived.by(() => {
    switch (sourceKind) {
      case "github":
        return "https://github.com/acme/project.git";
      case "blueprint":
        return selectedBlueprintSourceExtension?.path ?? "/marketplace";
      case "remote-git":
        return "https://git.example.com/team/project.git";
      case "docker-image":
        return "ghcr.io/acme/platform:latest";
      case "compose":
        return "./deploy/docker-compose.yml";
      case "static-site":
        return ".";
      default:
        return ".";
    }
  });
  const deploymentCommandPreview = $derived.by(() => {
    const segments = [`appaloft deploy ${sourceLocator || "."}`];

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

    if (sourceBaseDirectory.trim()) {
      segments.push(`--source-base-directory ${sourceBaseDirectory.trim()}`);
    }

    if (createsStaticSiteResource) {
      if ((staticPublishDirectory.trim() || "/dist") === ".") {
        segments.push("--as static-site");
      } else {
        segments.push("--method static");
        segments.push(`--publish-dir ${staticPublishDirectory.trim() || "/dist"}`);
      }
      if (staticInstallCommand.trim()) {
        segments.push(`--install ${staticInstallCommand.trim()}`);
      }
      if (staticBuildCommand.trim()) {
        segments.push(`--build ${staticBuildCommand.trim()}`);
      }
    }
    if (!createsStaticSiteResource) {
      if (resourceInstallCommand.trim()) {
        segments.push(`--install ${resourceInstallCommand.trim()}`);
      }
      if (resourceBuildCommand.trim()) {
        segments.push(`--build ${resourceBuildCommand.trim()}`);
      }
      if (resourceStartCommand.trim()) {
        segments.push(`--start ${resourceStartCommand.trim()}`);
      }
    }
    if (resourceDockerfilePath.trim()) {
      segments.push(`--dockerfile-path ${resourceDockerfilePath.trim()}`);
    }
    if (resourceDockerComposeFilePath.trim()) {
      segments.push(`--docker-compose-file-path ${resourceDockerComposeFilePath.trim()}`);
    }
    if (resourceBuildTarget.trim()) {
      segments.push(`--build-target ${resourceBuildTarget.trim()}`);
    }

    if (!resourceContextEnabled) {
      segments.push(`--resource-name ${inferredResourceInput.name}`);
      segments.push(`--port ${effectiveResourceInternalPortText()}`);
    } else if (resourceMode === "new") {
      segments.push(`--resource-name ${editedResourceInput.name}`);
      if (editedResourceInput.kind) {
        segments.push(`--resource-kind ${editedResourceInput.kind}`);
      }
      segments.push(`--port ${effectiveResourceInternalPortText()}`);
    }

    if (createsResource && resourceRuntimeName.trim()) {
      segments.push(`--runtime-name ${resourceRuntimeName.trim()}`);
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

    if (sourceKind === "blueprint") {
      return selectedBlueprintTitle.trim() ||
        selectedBlueprintSlug.trim() ||
        (selectedBlueprintSourceExtension?.title ??
          $t(i18nKeys.console.quickDeploy.sourceBlueprintSelector));
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

    if (sourceKind === "blueprint") {
      const selectedBlueprintValue = selectedBlueprintTitle.trim() || selectedBlueprintSlug.trim();
      return [
        {
          label: $t(i18nKeys.console.quickDeploy.sourceAccess),
          value: $t(i18nKeys.console.quickDeploy.sourceAccessBlueprintCatalog),
        },
        {
          label: $t(i18nKeys.console.quickDeploy.sourceBlueprintSelector),
          value: selectedBlueprintValue ||
            (selectedBlueprintSourceExtension?.title ??
              $t(i18nKeys.console.quickDeploy.sourceBlueprintCatalogUnavailable)),
        },
        ...(selectedBlueprintSlug.trim()
          ? [
              {
                label: $t(i18nKeys.console.quickDeploy.sourceBlueprint),
                value: selectedBlueprintSlug.trim(),
                mono: true,
              },
            ]
          : []),
        {
          label: $t(i18nKeys.console.quickDeploy.sourceAddress),
          value: selectedBlueprintSourceExtension?.path ?? "/marketplace",
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

    if (sourceKind === "static-site") {
      return [
        {
          label: $t(i18nKeys.console.quickDeploy.staticSource),
          value: sourceSummary,
          mono: true,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.staticPublishDirectory),
          value: staticPublishDirectory.trim() || "/dist",
          mono: true,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.sourceAccess),
          value: $t(i18nKeys.console.quickDeploy.sourceAccessLocalFolder),
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

    if (sourceKind === "blueprint" && selectedBlueprintSlug.trim()) {
      return selectedBlueprintSlug.trim();
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
    (): ResourceKind =>
      sourceKind === "compose"
        ? "compose-stack"
        : sourceKind === "static-site"
          ? "static-site"
          : "application",
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
  const createsStaticSiteResource = $derived.by(() => {
    if (resourceContextEnabled && resourceMode === "existing") {
      return false;
    }

    const draftKind =
      resourceContextEnabled && resourceMode === "new"
        ? editedResourceInput.kind
        : inferredResourceInput.kind;

    return sourceKind === "static-site" || draftKind === "static-site";
  });
  const resourceInternalPortDefault = $derived(
    createsStaticSiteResource
      ? "80"
      : sourceKind === "blueprint"
        ? selectedBlueprintDefaultPort
        : "3000",
  );
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

    return `${inferredResourceInput.name} · ${inferredResourceInput.kind ?? "application"} · :${effectiveResourceInternalPortText()}`;
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

    return `${editedResourceInput.name} · ${editedResourceInput.kind ?? "application"} · :${effectiveResourceInternalPortText()}`;
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
  const quickDeployDiagnosticSummaryButtonLabel = $derived.by(() => {
    if (diagnosticSummaryLoading) {
      return $t(i18nKeys.console.resources.diagnosticSummaryLoading);
    }

    if (diagnosticSummaryCopyState === "copied") {
      return $t(i18nKeys.console.resources.diagnosticSummaryCopied);
    }

    return $t(i18nKeys.console.resources.diagnosticSummaryCopy);
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

  onDestroy(() => {
    if (diagnosticSummaryCopyResetTimeout) {
      clearTimeout(diagnosticSummaryCopyResetTimeout);
    }
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
    const nextDrafts: Record<string, BlueprintDependencyProvisioningDraft> = {};
    let changed = false;

    for (const requirement of selectedBlueprintProvisionableDependencies) {
      const existing = blueprintDependencyProvisioningDrafts[requirement.id];
      if (existing?.kind === requirement.kind) {
        nextDrafts[requirement.id] = existing;
        continue;
      }

      nextDrafts[requirement.id] = createDefaultBlueprintDependencyDraft(
        requirement.id,
        requirement.kind,
      );
      changed = true;
    }

    if (
      Object.keys(blueprintDependencyProvisioningDrafts).some(
        (requirementId) => !nextDrafts[requirementId],
      )
    ) {
      changed = true;
    }

    if (changed) {
      blueprintDependencyProvisioningDrafts = nextDrafts;
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

  function isProvisionableDependencyKind(value: string): value is DependencyKind {
    return dependencyKindOrder.includes(value as DependencyKind);
  }

  function dependencyKindLabel(kind: DependencyKind): string {
    return dependencyKindOptions[kind].label;
  }

  function dependencyKindIcon(kind: DependencyKind): DependencyKindIcon {
    return dependencyKindOptions[kind].icon;
  }

  function dependencyKindIconColor(kind: DependencyKind): string {
    return `#${dependencyKindIcon(kind).hex}`;
  }

  function effectiveResourceInternalPortText(): string {
    const requestedPort = resourceInternalPort.trim();
    if (sourceKind === "blueprint" && (!requestedPort || requestedPort === "3000")) {
      return selectedBlueprintDefaultPort;
    }

    return requestedPort || resourceInternalPortDefault;
  }

  function createDefaultBlueprintDependencyDraft(
    requirementId: string,
    kind: DependencyKind,
  ): BlueprintDependencyProvisioningDraft {
    return {
      requirementId,
      kind,
      mode: "create",
      reuseConnectionUrl: "",
      reuseSecretRef: "",
    };
  }

  function blueprintDependencyDraft(input: {
    id: string;
    kind: string;
  }): BlueprintDependencyProvisioningDraft {
    if (!isProvisionableDependencyKind(input.kind)) {
      throw new Error(`Blueprint dependency kind ${input.kind} is not provisionable`);
    }

    return (
      blueprintDependencyProvisioningDrafts[input.id] ??
      createDefaultBlueprintDependencyDraft(input.id, input.kind)
    );
  }

  function updateBlueprintDependencyDraft(
    requirementId: string,
    update: Partial<BlueprintDependencyProvisioningDraft>,
  ): void {
    const existing = blueprintDependencyProvisioningDrafts[requirementId];
    if (!existing) {
      return;
    }

    blueprintDependencyProvisioningDrafts = {
      ...blueprintDependencyProvisioningDrafts,
      [requirementId]: {
        ...existing,
        ...update,
      },
    };
  }

  function blueprintDependencySelectionsComplete(): boolean {
    return selectedBlueprintProvisionableDependencies.every((requirement) => {
      const draft = blueprintDependencyDraft(requirement);
      return draft.mode === "create"
        ? true
        : Boolean(draft.reuseConnectionUrl.trim() && draft.reuseSecretRef.trim());
    });
  }

  function blueprintDependencyProvisioningPayload() {
    return selectedBlueprintProvisionableDependencies.map((requirement) => {
      const draft = blueprintDependencyDraft(requirement);
      const providerKey = draft.mode === "create" ? "cloud-local-docker" : "external";

      return {
        requirementId: requirement.id,
        kind: requirement.kind,
        label: requirement.label,
        mode: draft.mode,
        providerKey,
        ...(draft.mode === "create"
          ? {
              target: {
                ...(selectedServerId ? { serverId: selectedServerId } : {}),
              },
            }
          : {
              reuse: {
                maskedConnection: draft.reuseConnectionUrl.trim(),
                secretRef: draft.reuseSecretRef.trim(),
              },
          }),
      };
    });
  }

  function blueprintDependencyResourceName(requirement: BlueprintDependencyRequirement): string {
    const blueprintName =
      selectedBlueprintSlug.trim() ||
      selectedBlueprintTitle.trim() ||
      inferredResourceInput.name ||
      "blueprint";

    return normalizeQuickDeployGeneratedNameBase(
      `${blueprintName}-${requirement.id}`,
      requirement.kind,
    );
  }

  function blueprintQuickDeployDependencyProvisioningInput(): QuickDeployDependencyProvisioningInput[] {
    return selectedBlueprintProvisionableDependencies.map((requirement) => {
      const draft = blueprintDependencyDraft(requirement);
      const binding = {
        targetName: requirement.id,
        scope: "runtime-only",
        injectionMode: "env",
      } as const;

      if (draft.mode === "create") {
        return {
          mode: "create",
          requirementId: requirement.id,
          kind: requirement.kind,
          name: blueprintDependencyResourceName(requirement),
          binding,
        };
      }

      return {
        mode: "reuse",
        requirementId: requirement.id,
        kind: requirement.kind,
        name: blueprintDependencyResourceName(requirement),
        connectionUrl: draft.reuseConnectionUrl.trim(),
        secretRef: draft.reuseSecretRef.trim(),
        binding,
      };
    });
  }

  function blueprintWorkflowEnvironmentVariables(): NonNullable<
    QuickDeployWorkflowInput["environmentVariables"]
  > {
    if (sourceKind !== "blueprint") {
      return [];
    }

    return selectedBlueprintVariables.map((variable) => ({
      key: variable.key,
      value: variable.value,
      exposure: "runtime" as const,
      kind: "plain-config" as const,
      scope: "environment" as const,
    }));
  }

  function blueprintComponentForQuickDeploy(): BlueprintComponent {
    const component = selectedBlueprintPrimaryComponent;
    if (!component) {
      throw new Error("请先选择一个可部署的 Blueprint。");
    }

    return component;
  }

  function resourceSourceForBlueprintComponent(component: BlueprintComponent): ResourceSourceInput {
    if (component.runtime.strategy !== "container-image" || !component.runtime.image) {
      throw new Error("当前快速部署只支持 container image Blueprint。");
    }

    return {
      kind: "docker-image",
      locator: component.runtime.image,
      displayName: component.name,
      metadata: {
        blueprintSlug: selectedBlueprintSlug.trim(),
        blueprintComponentId: component.id,
      },
    };
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

  function sourceExtensionHref(extension: SystemPluginWebExtension | null): string {
    if (!extension) {
      return "#";
    }

    if (!browser) {
      return extension.path;
    }

    try {
      const url = new URL(extension.path, window.location.origin);
      if (url.origin !== window.location.origin) {
        return url.toString();
      }

      const returnTo = buildDeployStateUrl();
      url.searchParams.set("returnTo", `${returnTo.pathname}${returnTo.search}`);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return extension.path;
    }
  }

  function selectedBlueprintDetailHref(): string {
    const slug = selectedBlueprintSlug.trim();
    if (!slug) {
      return sourceExtensionHref(selectedBlueprintSourceExtension);
    }

    const params = new URLSearchParams();
    if (browser) {
      const returnTo = buildDeployStateUrl();
      params.set("returnTo", `${returnTo.pathname}${returnTo.search}`);
    }
    const search = params.toString();
    return `/marketplace/${encodeURIComponent(slug)}${search ? `?${search}` : ""}`;
  }

  function selectedBlueprintInstallPlanEndpoint(): string {
    const slug = selectedBlueprintSlug.trim();
    const metadata = readBlueprintCatalogExtensionMetadata(selectedBlueprintSourceExtension);
    if (!slug || !metadata) {
      return "";
    }

    if (metadata.installPlanEndpointTemplate) {
      return endpointFromTemplate(metadata.installPlanEndpointTemplate, slug);
    }

    return `${metadata.listEndpoint.replace(/\/$/, "")}/${encodeURIComponent(slug)}/install-plan`;
  }

  function openBlueprintSelectorDialog(): void {
    if (selectedBlueprintSourceExtension && !selectedBlueprintSourceExtensionKey) {
      selectedBlueprintSourceExtensionKey = selectedBlueprintSourceExtension.key;
    }
    blueprintSelectorDialogOpen = true;
  }

  function openSelectedBlueprintDetailDialog(): void {
    if (!selectedBlueprintSlug.trim()) {
      openBlueprintSelectorDialog();
      return;
    }
    blueprintDetailSlug = selectedBlueprintSlug.trim();
    blueprintDetailTitle = selectedBlueprintTitle.trim();
    blueprintDetailDialogOpen = true;
  }

  function openBlueprintListingDetail(item: BlueprintCatalogListing): void {
    blueprintDetailSlug = item.slug;
    blueprintDetailTitle = item.title;
    blueprintDetailDialogOpen = true;
  }

  function selectBlueprintSourceExtension(extension: SystemPluginWebExtension): void {
    const previousKey = selectedBlueprintSourceExtension?.key ?? selectedBlueprintSourceExtensionKey;
    selectedBlueprintSourceExtensionKey = extension.key;
    if (selectedBlueprintSlug.trim() && previousKey && previousKey !== extension.key) {
      selectedBlueprintSlug = "";
      selectedBlueprintTitle = "";
      blueprintDependencyProvisioningDrafts = {};
    }
  }

  function applyBlueprintListing(item: BlueprintCatalogListing): void {
    if (selectedBlueprintSlug !== item.slug) {
      blueprintDependencyProvisioningDrafts = {};
    }
    selectedBlueprintSlug = item.slug;
    selectedBlueprintTitle = item.title;
    if (selectedBlueprintSourceExtension && !selectedBlueprintSourceExtensionKey) {
      selectedBlueprintSourceExtensionKey = selectedBlueprintSourceExtension.key;
    }
    if (projectMode === "new" && !projectName.trim()) {
      projectName = item.title;
    }
    blueprintSelectorDialogOpen = false;
  }

  function applyVisibleBlueprintDetail(): void {
    if (!selectedBlueprintListing) {
      return;
    }
    applyBlueprintListing(selectedBlueprintListing);
    blueprintDetailDialogOpen = false;
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
      sourceKind === "blueprint" ? "" : sourceLocator,
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

    if (sourceKind === "blueprint") {
      setSearchParam(
        params,
        "sourceExtension",
        selectedBlueprintSourceExtension?.key ?? selectedBlueprintSourceExtensionKey,
      );
      setSearchParam(params, "blueprintSlug", selectedBlueprintSlug);
      setSearchParam(params, "blueprintTitle", selectedBlueprintTitle);
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
        setSearchParam(params, "resourceRuntimeName", resourceRuntimeName);
      }
    } else {
      setSearchParam(params, "generatedResourceName", generatedResourceName);
      setSearchParam(params, "resourceRuntimeName", resourceRuntimeName);
    }
    setSearchParam(params, "resourceInternalPort", resourceInternalPort, "3000");
    setSearchParam(params, "sourceBaseDirectory", sourceBaseDirectory);
    setSearchParam(params, "resourceInstallCommand", resourceInstallCommand);
    setSearchParam(params, "resourceBuildCommand", resourceBuildCommand);
    setSearchParam(params, "resourceStartCommand", resourceStartCommand);
    setSearchParam(params, "resourceDockerfilePath", resourceDockerfilePath);
    setSearchParam(params, "resourceDockerComposeFilePath", resourceDockerComposeFilePath);
    setSearchParam(params, "resourceBuildTarget", resourceBuildTarget);
    setSearchParam(params, "staticPublishDirectory", staticPublishDirectory, "/dist");
    setSearchParam(params, "staticInstallCommand", staticInstallCommand);
    setSearchParam(params, "staticBuildCommand", staticBuildCommand);
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
    resourceRuntimeName = params.get("resourceRuntimeName") ?? "";
    sourceBaseDirectory = params.get("sourceBaseDirectory") ?? "";
    resourceInstallCommand = params.get("resourceInstallCommand") ?? "";
    resourceBuildCommand = params.get("resourceBuildCommand") ?? "";
    resourceStartCommand = params.get("resourceStartCommand") ?? "";
    resourceDockerfilePath = params.get("resourceDockerfilePath") ?? "";
    resourceDockerComposeFilePath = params.get("resourceDockerComposeFilePath") ?? "";
    resourceBuildTarget = params.get("resourceBuildTarget") ?? "";
    resourceInternalPort = params.get("resourceInternalPort") ?? (nextSourceKind === "static-site" ? "80" : "3000");
    staticPublishDirectory = params.get("staticPublishDirectory") ?? "/dist";
    staticInstallCommand = params.get("staticInstallCommand") ?? "";
    staticBuildCommand = params.get("staticBuildCommand") ?? "";
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
    if (selectedBlueprintSlug !== (params.get("blueprintSlug") ?? "")) {
      blueprintDependencyProvisioningDrafts = {};
    }
    selectedBlueprintSourceExtensionKey = params.get("sourceExtension") ?? "";
    selectedBlueprintSlug = params.get("blueprintSlug") ?? "";
    selectedBlueprintTitle = params.get("blueprintTitle") ?? "";

    localFolderLocator = nextSourceKind === "local-folder" ? nextSourceLocator || "." : localFolderLocator;
    githubLocator = nextSourceKind === "github" ? nextSourceLocator : githubLocator;
    remoteGitLocator = nextSourceKind === "remote-git" ? nextSourceLocator : remoteGitLocator;
    dockerImageLocator = nextSourceKind === "docker-image" ? nextSourceLocator : dockerImageLocator;
    composeLocator = nextSourceKind === "compose" ? nextSourceLocator : composeLocator;
    staticSiteLocator = nextSourceKind === "static-site" ? nextSourceLocator || "." : staticSiteLocator;
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
      case "static-site":
        staticSiteLocator = value;
        return;
      default:
        localFolderLocator = value;
    }
  }

  function selectSourceKind(kind: SourceKind): void {
    sourceKind = kind;
    if (kind === "static-site") {
      resourceKind = "static-site";
      if (!resourceInternalPort.trim() || resourceInternalPort === "3000") {
        resourceInternalPort = "80";
      }
    }
    if (kind === "github" && githubConnected && !githubLocator.trim()) {
      githubSourceMode = "browser";
      githubSourceModeTouched = false;
    }
    if (kind === "blueprint" && !selectedBlueprintSourceExtensionKey) {
      selectedBlueprintSourceExtensionKey = selectedBlueprintSourceExtension?.key ?? "";
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

  function staticSourceKindForLocator(locator: string): ResourceSourceInput["kind"] {
    if (/^(https?|ssh):\/\//.test(locator) || locator.endsWith(".git")) {
      return gitSourceKindForLocator(locator);
    }

    if (locator.endsWith(".zip")) {
      return "zip-artifact";
    }

    return "local-folder";
  }

  function resourceSourceForSource(): ResourceSourceInput {
    const locator = sourceLocator.trim();
    const baseDirectory = sourceBaseDirectory.trim();
    const withBaseDirectory = (input: ResourceSourceInput): ResourceSourceInput =>
      baseDirectory && input.kind !== "docker-image" ? { ...input, baseDirectory } : input;

    switch (sourceKind) {
      case "github":
      {
        const selectedRepository =
          githubSourceMode === "browser" ? selectedGitHubRepository : null;
        return withBaseDirectory({
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
        });
      }
      case "remote-git":
        return withBaseDirectory({
          kind: gitSourceKindForLocator(locator),
          locator,
        });
      case "blueprint":
        return resourceSourceForBlueprintComponent(blueprintComponentForQuickDeploy());
      case "docker-image":
        return {
          kind: "docker-image",
          locator,
        };
      case "compose":
        return withBaseDirectory({
          kind: "compose",
          locator,
        });
      case "static-site":
        return withBaseDirectory({
          kind: staticSourceKindForLocator(locator),
          locator,
        });
      default:
        return withBaseDirectory({
          kind: "local-folder",
          locator,
        });
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
    const requestedRuntimeName = resourceRuntimeName.trim();
    const withHealthCheckPath = (
      input: ResourceRuntimeProfileInput,
    ): ResourceRuntimeProfileInput =>
      healthCheck || requestedRuntimeName
        ? {
            ...input,
            ...(requestedRuntimeName ? { runtimeName: requestedRuntimeName } : {}),
            ...(healthCheck
              ? {
                  healthCheckPath: healthCheck.http?.path,
                  healthCheck,
                }
              : {}),
          }
        : input;

    switch (sourceKind) {
      case "blueprint":
        if (blueprintComponentForQuickDeploy().runtime.strategy !== "container-image") {
          throw new Error("当前快速部署只支持 container image Blueprint。");
        }
        return withHealthCheckPath({ strategy: "prebuilt-image" });
      case "docker-image":
        return withHealthCheckPath({ strategy: "prebuilt-image" });
      case "compose":
        return withHealthCheckPath({
          strategy: "docker-compose",
          ...(resourceDockerComposeFilePath.trim()
            ? { dockerComposeFilePath: resourceDockerComposeFilePath.trim() }
            : {}),
        });
      case "static-site":
        return withHealthCheckPath({
          strategy: "static",
          publishDirectory: staticPublishDirectory.trim() || "/dist",
          ...(staticInstallCommand.trim() ? { installCommand: staticInstallCommand.trim() } : {}),
          ...(staticBuildCommand.trim() ? { buildCommand: staticBuildCommand.trim() } : {}),
        });
      default:
        if (createsStaticSiteResource) {
          return withHealthCheckPath({
            strategy: "static",
            publishDirectory: staticPublishDirectory.trim() || "/dist",
            ...(staticInstallCommand.trim()
              ? { installCommand: staticInstallCommand.trim() }
              : {}),
            ...(staticBuildCommand.trim() ? { buildCommand: staticBuildCommand.trim() } : {}),
          });
        }
        return withHealthCheckPath({
          strategy: resourceDockerfilePath.trim()
            ? "dockerfile"
            : resourceDockerComposeFilePath.trim()
              ? "docker-compose"
              : "auto",
          ...(resourceInstallCommand.trim() ? { installCommand: resourceInstallCommand.trim() } : {}),
          ...(resourceBuildCommand.trim() ? { buildCommand: resourceBuildCommand.trim() } : {}),
          ...(resourceStartCommand.trim() ? { startCommand: resourceStartCommand.trim() } : {}),
          ...(resourceDockerfilePath.trim() ? { dockerfilePath: resourceDockerfilePath.trim() } : {}),
          ...(resourceDockerComposeFilePath.trim()
            ? { dockerComposeFilePath: resourceDockerComposeFilePath.trim() }
            : {}),
          ...(resourceBuildTarget.trim() ? { buildTarget: resourceBuildTarget.trim() } : {}),
        });
    }
  }

  function networkProfileForSource(): ResourceNetworkProfileInput {
    const internalPort = Number(effectiveResourceInternalPortText());
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
        if (sourceKind === "blueprint") {
          return (
            Boolean(selectedBlueprintSlug.trim()) &&
            Boolean(selectedBlueprintManifest) &&
            blueprintDependencySelectionsComplete()
          );
        }

        if (!sourceLocator) {
          return false;
        }

        if (sourceKind === "static-site" && !staticPublishDirectory.trim()) {
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

    const selectDirectory = (window as WindowWithAppaloftDesktopBridge).appaloftDesktop?.selectDirectory;

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
    workflowDeploymentTraceLink = "";
  }

  function resetDiagnosticSummaryCopy(): void {
    diagnosticSummaryLoading = false;
    diagnosticSummaryCopyState = "idle";
    diagnosticSummaryError = null;
    diagnosticSummaryCopyFallback = null;

    if (diagnosticSummaryCopyResetTimeout) {
      clearTimeout(diagnosticSummaryCopyResetTimeout);
      diagnosticSummaryCopyResetTimeout = undefined;
    }
  }

  function scheduleDiagnosticSummaryCopyReset(): void {
    if (diagnosticSummaryCopyResetTimeout) {
      clearTimeout(diagnosticSummaryCopyResetTimeout);
    }

    diagnosticSummaryCopyResetTimeout = setTimeout(() => {
      diagnosticSummaryCopyState = "idle";
      diagnosticSummaryCopyResetTimeout = undefined;
    }, 2200);
  }

  async function copyTextToClipboard(text: string): Promise<void> {
    const desktopCopyText = (window as WindowWithAppaloftDesktopBridge).appaloftDesktop?.copyText;
    if (desktopCopyText) {
      try {
        await desktopCopyText(text);
        return;
      } catch {
        // Fall back to browser clipboard APIs when an older desktop shell lacks permission.
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall back for desktop previews or browsers with restrictive clipboard permissions.
      }
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.append(textArea);
    textArea.focus({ preventScroll: true });
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    try {
      if (!document.execCommand("copy")) {
        throw new Error($t(i18nKeys.console.resources.diagnosticSummaryCopyFailed));
      }
    } finally {
      textArea.remove();
    }
  }

  function selectDiagnosticSummaryFallback(event: Event): void {
    const target = event.currentTarget;
    if (target instanceof HTMLTextAreaElement) {
      target.select();
    }
  }

  async function copyQuickDeployDiagnosticSummary(): Promise<void> {
    if (!selectedResourceId || !lastCreatedDeploymentId || diagnosticSummaryLoading) {
      return;
    }

    diagnosticSummaryLoading = true;
    diagnosticSummaryError = null;
    diagnosticSummaryCopyFallback = null;

    try {
      const summary = await orpcClient.resources.diagnosticSummary({
        resourceId: selectedResourceId,
        deploymentId: lastCreatedDeploymentId,
        includeDeploymentLogTail: true,
        includeRuntimeLogTail: true,
        includeProxyConfiguration: true,
        tailLines: 20,
      });
      const copyJson = summary.copy.json;
      try {
        await copyTextToClipboard(copyJson);
      } catch (copyError) {
        diagnosticSummaryCopyFallback = copyJson;
        throw copyError;
      }
      diagnosticSummaryCopyState = "copied";
    } catch (error) {
      diagnosticSummaryCopyState = "failed";
      diagnosticSummaryError = readErrorMessage(error);
    } finally {
      diagnosticSummaryLoading = false;
      if (diagnosticSummaryCopyState === "copied") {
        scheduleDiagnosticSummaryCopyReset();
      }
    }
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

  function testDraftServerConnectivity(input: DraftServerConnectivityInput) {
    return orpcClient.servers.testDraftConnectivity(input);
  }

  async function refreshWorkspaceData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["servers"] }),
      queryClient.invalidateQueries({ queryKey: ["environments"] }),
      queryClient.invalidateQueries({ queryKey: ["resources"] }),
      queryClient.invalidateQueries({ queryKey: ["dependency-resources"] }),
      queryClient.invalidateQueries({ queryKey: ["deployments"] }),
    ]);
  }

  async function executeQuickDeployDependencyProvisioning(
    input: QuickDeployProvisionDependencyResourcesInput,
  ): Promise<QuickDeployWorkflowStepOutput> {
    dependencyProvisioningInFlight = true;
    try {
      const dependencyResourceIds: string[] = [];
      const bindingIds: string[] = [];

      for (const item of input.items) {
        const planResponse =
          item.mode === "create"
            ? await orpcClient.dependencyResources.provisioning.plan({
                mode: "create",
                create: {
                  kind: item.kind,
                  projectId: input.projectId,
                  environmentId: input.environmentId,
                  name: item.name,
                  ...(item.serverId ? { serverId: item.serverId } : {}),
                  ...(item.providerKey ? { providerKey: item.providerKey } : {}),
                  ...(item.description ? { description: item.description } : {}),
                },
              })
            : await orpcClient.dependencyResources.provisioning.plan({
                mode: "reuse",
                reuse: {
                  kind: item.kind,
                  projectId: input.projectId,
                  environmentId: input.environmentId,
                  name: item.name,
                  connectionUrl: item.connectionUrl,
                  ...(item.secretRef ? { secretRef: item.secretRef } : {}),
                  ...(item.connectionSecret ? { connectionSecret: item.connectionSecret } : {}),
                  ...(item.description ? { description: item.description } : {}),
                },
              });
        const acceptedResponse = await orpcClient.dependencyResources.provisioning.accept({
          planId: planResponse.plan.id,
          acknowledgeMutation: true,
        });
        const dependencyResourceId = acceptedResponse.plan.dependencyResourceId;
        if (!dependencyResourceId) {
          throw new Error(`Dependency provisioning plan ${acceptedResponse.plan.id} did not realize a resource.`);
        }

        dependencyResourceIds.push(dependencyResourceId);
        const binding = await orpcClient.resources.dependencyBindings.bind({
          resourceId: input.resourceId,
          dependencyResourceId,
          targetName: item.binding?.targetName ?? item.requirementId,
          ...(item.binding?.scope ? { scope: item.binding.scope } : {}),
          ...(item.binding?.injectionMode ? { injectionMode: item.binding.injectionMode } : {}),
        });
        bindingIds.push(binding.id);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dependency-resources"] }),
        queryClient.invalidateQueries({ queryKey: ["resources"] }),
      ]);

      return {
        dependencyResourceIds,
        bindingIds,
      };
    } finally {
      dependencyProvisioningInFlight = false;
    }
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
      case "resources.configureSource": {
        const configuredResource = await configureResourceSourceMutation.mutateAsync(step.input);
        await resourcesQuery.refetch();
        return configuredResource;
      }
      case "resources.configureRuntime": {
        const configuredResource = await configureResourceRuntimeMutation.mutateAsync(step.input);
        await resourcesQuery.refetch();
        return configuredResource;
      }
      case "resources.configureNetwork": {
        const configuredResource = await configureResourceNetworkMutation.mutateAsync(step.input);
        await resourcesQuery.refetch();
        return configuredResource;
      }
      case "environments.setVariable": {
        await setEnvironmentVariableMutation.mutateAsync(step.input);
        await environmentsQuery.refetch();
        return;
      }
      case "dependencyResources.provision":
        return executeQuickDeployDependencyProvisioning(step.input);
      case "deployments.create": {
        deploymentCreateInFlight = true;
        try {
          return await createDeploymentWithProgress(
            step.input,
            appendWorkflowDeploymentProgressEvent,
            {
              onTraceLink: (traceLink) => {
                workflowDeploymentTraceLink = traceLink;
              },
            },
          );
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
    lastAccessUrl = "";
    workflowProgressDialogOpen = false;
    resetWorkflowProgress();
    resetDiagnosticSummaryCopy();

    try {
      if (sourceKind === "blueprint") {
        if (selectedBlueprintSlug.trim()) {
          if (!selectedBlueprintManifest) {
            throw new Error("请等待 Blueprint 详情加载完成。");
          }

          if (!blueprintDependencySelectionsComplete()) {
            throw new Error("请完成 Blueprint 依赖资源的 create/reuse 选择。");
          }

          const endpoint = selectedBlueprintInstallPlanEndpoint();
          if (endpoint) {
            await request<unknown>(endpoint, {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                profile: "production",
                parameters: {
                  APP_NAME: selectedBlueprintTitle.trim() || selectedBlueprintSlug.trim(),
                },
                dependencyProvisioning: blueprintDependencyProvisioningPayload(),
                target: {
                  projectName:
                    projectName.trim() || selectedBlueprintTitle.trim() || selectedBlueprintSlug.trim(),
                  environmentName: environmentName.trim() || "production",
                  resourceSlugPrefix: selectedBlueprintSlug.trim(),
                },
              }),
            });
          }
        } else {
          const href = sourceExtensionHref(selectedBlueprintSourceExtension);
          if (href !== "#") {
            await goto(href);
            return;
          }
          throw new Error($t(i18nKeys.console.quickDeploy.sourceBlueprintCatalogUnavailable));
        }
      }

      if (sourceKind !== "blueprint" && !sourceLocator) {
        throw new Error("请先填写来源地址。");
      }

      if (createsStaticSiteResource && !staticPublishDirectory.trim()) {
        throw new Error($t(i18nKeys.console.quickDeploy.staticPublishDirectoryHint));
      }

      let workflowProject: QuickDeployWorkflowInput["project"];

      if (projectMode === "new") {
        const nextProjectName =
          projectName.trim() ||
          (sourceKind === "blueprint"
            ? selectedBlueprintTitle.trim() || selectedBlueprintSlug.trim()
            : projects.length === 0
              ? "Local Workspace"
              : "");

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

      const workflowEnvironmentVariables = [
        ...blueprintWorkflowEnvironmentVariables(),
        ...(variableContextEnabled && variableKey.trim()
          ? [
              {
                key: variableKey.trim(),
                value: variableValue,
                exposure: "runtime" as const,
                kind: variableIsSecret ? ("secret" as const) : ("plain-config" as const),
                isSecret: variableIsSecret,
                scope: "environment" as const,
              },
            ]
          : []),
      ];
      const workflowDependencyProvisioning =
        sourceKind === "blueprint" ? blueprintQuickDeployDependencyProvisioningInput() : [];
      const workflowInput: QuickDeployWorkflowInput = {
        project: workflowProject,
        server: workflowServer,
        environment: workflowEnvironment,
        resource: workflowResource,
        ...(workflowEnvironmentVariables.length > 0
          ? { environmentVariables: workflowEnvironmentVariables }
          : {}),
        ...(workflowDependencyProvisioning.length > 0
          ? { dependencyProvisioning: workflowDependencyProvisioning }
          : {}),
      };
      workflowProgressDialogOpen = true;
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
      lastAccessUrl =
        selectCurrentResourceAccessRoute(refreshedResource?.accessSummary)?.route.url ?? "";
      const quickDeployOutcome = createQuickDeployOutcomePacket(workflowResult, {
        access: lastAccessUrl
          ? { status: "available", url: lastAccessUrl }
          : { status: "unknown", reason: "access-route-unavailable" },
      });

      deployFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.quickDeploy.deployFeedbackSuccessTitle),
        detail:
          (quickDeployOutcome.access.status === "available"
            ? quickDeployOutcome.access.url
            : undefined) ||
          $t(i18nKeys.console.quickDeploy.deploymentIdDetail, {
            deploymentId: quickDeployOutcome.deploymentId,
          }),
      };
      lastCreatedDeploymentId = quickDeployOutcome.deploymentId;
    } catch (error) {
      workflowProgressError = readErrorMessage(error);
      lastAccessUrl = "";
      deployFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.quickDeploy.deployFeedbackErrorTitle),
        detail: readErrorMessage(error),
      };
    }
  }

</script>

<div class="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
  <div class="min-w-0 space-y-5">
      <section class="min-w-0 space-y-6">
        <div class="space-y-2">
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.quickDeploy.deploymentEntryTitle, { stepTitle: activeStepDetails.title })}</h2>
          <p class="text-sm text-muted-foreground">{activeStepDetails.description}</p>
        </div>
        <div class="space-y-6">
          <div class="console-stepper grid grid-cols-2 gap-1.5 rounded-md border border-border/70 px-2 py-2 sm:flex sm:flex-wrap sm:items-center">
            {#each deploymentSteps as step, index (step.key)}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class={`console-stepper-button h-8 min-w-0 justify-start gap-1.5 rounded-md px-2.5 text-xs sm:w-auto ${
                  activeStep === step.key
                    ? "is-active"
                    : stepIsComplete(step.key)
                      ? "is-complete"
                      : "is-idle"
                } ${canVisitStep(index) ? "" : "cursor-not-allowed opacity-40"}`}
                disabled={!canVisitStep(index)}
                aria-current={activeStep === step.key ? "step" : undefined}
                title={step.description}
                onclick={() => goToStep(step.key, index)}
              >
                <span class={`console-stepper-marker flex size-4 items-center justify-center rounded-sm border text-[10px] font-medium ${
                  activeStep === step.key
                    ? "is-active"
                    : stepIsComplete(step.key)
                      ? "is-complete"
                      : "is-idle"
                }`}>
                  {#if stepIsComplete(step.key)}
                    <CheckCircle2 class="size-3" />
                  {:else}
                    {index + 1}
                  {/if}
                </span>
                <step.icon class="size-3.5 text-muted-foreground" />
                <span class="min-w-0 truncate">{step.title}</span>
              </Button>
            {/each}
          </div>

          {#if activeStep === "source"}
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Waypoints class="size-4 text-muted-foreground" />
              <span>{$t(i18nKeys.common.domain.source)}</span>
              <DocsHelpLink
                href={quickDeploySourceHelpHref}
                ariaLabel={$t(i18nKeys.console.quickDeploy.sourceHelpLink)}
              />
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
            {:else if sourceKind === "blueprint"}
              <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">
                      {$t(i18nKeys.console.quickDeploy.sourceBlueprintCatalogs)}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.quickDeploy.sourceBlueprintCatalogsHint)}
                    </p>
                  </div>
                  {#if selectedBlueprintSourceExtension}
                    <Badge variant="outline">{selectedBlueprintSourceExtension.pluginDisplayName}</Badge>
                  {/if}
                </div>
                {#if webExtensionsQuery.isPending}
                  <div class="grid gap-2 sm:grid-cols-2">
                    <Skeleton class="h-20 w-full" />
                    <Skeleton class="h-20 w-full" />
                  </div>
                {:else if quickDeploySourceExtensions.length > 0}
                  {#if selectedBlueprintSlug.trim()}
                    <div class="console-subtle-panel flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div class="flex min-w-0 items-center gap-3">
                        <Package class="size-4 shrink-0 text-muted-foreground" />
                        <div class="min-w-0">
                          <p class="truncate text-sm font-medium">
                            {selectedBlueprintTitle.trim() || selectedBlueprintSlug.trim()}
                          </p>
                          <p class="truncate font-mono text-xs text-muted-foreground">
                            {selectedBlueprintSlug.trim()}
                          </p>
                        </div>
                      </div>
                      <div class="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onclick={openSelectedBlueprintDetailDialog}
                        >
                          <Eye class="size-4" />
                          查看详情
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onclick={openBlueprintSelectorDialog}
                        >
                          更换
                        </Button>
                      </div>
                    </div>
                  {:else}
                    <div class="console-subtle-panel flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div class="min-w-0">
                        <p class="text-sm font-medium">尚未选择蓝图</p>
                        <p class="text-xs leading-5 text-muted-foreground">
                          打开蓝图市场，在弹窗里查看应用、依赖资源和入口后再选择。
                        </p>
                      </div>
                      <Button type="button" size="sm" onclick={openBlueprintSelectorDialog}>
                        <Package class="size-4" />
                        {$t(i18nKeys.console.quickDeploy.sourceBlueprintOpenSelector)}
                      </Button>
                    </div>
                  {/if}
                  {#if selectedBlueprintSlug.trim()}
                    <div class="space-y-3" data-blueprint-dependency-provisioning>
                      <div class="flex items-center justify-between gap-3">
                        <div class="min-w-0">
                          <p class="text-sm font-medium">依赖资源</p>
                          <p class="text-xs text-muted-foreground">
                            {blueprintDependencyProvisioningSummary}
                          </p>
                        </div>
                        {#if selectedBlueprintDetailQuery.isPending}
                          <LoaderCircle class="size-4 animate-spin text-muted-foreground" />
                        {/if}
                      </div>
                      {#if selectedBlueprintDetailQuery.isError}
                        <div class="console-subtle-panel px-3 py-3 text-sm text-destructive">
                          依赖资源读取失败
                        </div>
                      {:else if selectedBlueprintDetailQuery.isPending && !selectedBlueprintManifest}
                        <div class="grid gap-2 sm:grid-cols-2">
                          <Skeleton class="h-24 w-full" />
                          <Skeleton class="h-24 w-full" />
                        </div>
                      {:else if selectedBlueprintProvisionableDependencies.length > 0}
                        <div class="grid gap-3">
                          {#each selectedBlueprintProvisionableDependencies as requirement (requirement.id)}
                            {@const draft = blueprintDependencyDraft(requirement)}
                            {@const icon = dependencyKindIcon(requirement.kind)}
                            <div class="rounded-md border bg-background p-3">
                              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div class="flex min-w-0 items-start gap-3">
                                  <span
                                    class="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background"
                                    style={`border-color: ${dependencyKindIconColor(requirement.kind)}33; background-color: ${dependencyKindIconColor(requirement.kind)}12;`}
                                  >
                                    <svg
                                      class="size-5"
                                      role="img"
                                      aria-label={icon.title}
                                      viewBox="0 0 24 24"
                                      fill={dependencyKindIconColor(requirement.kind)}
                                    >
                                      <path d={icon.path} />
                                    </svg>
                                  </span>
                                  <span class="min-w-0">
                                    <span class="block truncate text-sm font-semibold">
                                      {requirement.label || dependencyKindLabel(requirement.kind)}
                                    </span>
                                    <span class="mt-1 block text-xs text-muted-foreground">
                                      {dependencyKindLabel(requirement.kind)} · {requirement.id}
                                    </span>
                                  </span>
                                </div>
                                <div class="grid shrink-0 grid-cols-2 gap-2 md:w-64">
                                  {#each blueprintDependencyProvisioningModes as mode (mode)}
                                    <button
                                      type="button"
                                      class={[
                                        "min-h-10 rounded-md border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        draft.mode === mode
                                          ? "border-primary bg-primary/5 text-foreground"
                                          : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                                      ]}
                                      aria-pressed={draft.mode === mode}
                                      onclick={() =>
                                        updateBlueprintDependencyDraft(requirement.id, { mode })}
                                    >
                                      {mode === "create"
                                        ? $t(i18nKeys.console.dependencyResources.modeCreate)
                                        : $t(i18nKeys.console.dependencyResources.modeReuse)}
                                    </button>
                                  {/each}
                                </div>
                              </div>
                              {#if draft.mode === "reuse"}
                                <div class="mt-3 grid gap-3 md:grid-cols-2">
                                  <div class="space-y-2">
                                    <label
                                      class="text-xs font-medium text-muted-foreground"
                                      for={`blueprint-dependency-${requirement.id}-connection`}
                                    >
                                      {$t(i18nKeys.console.dependencyResources.connectionUrl)}
                                    </label>
                                    <Input
                                      id={`blueprint-dependency-${requirement.id}-connection`}
                                      class="font-mono text-xs"
                                      value={draft.reuseConnectionUrl}
                                      oninput={(event) =>
                                        updateBlueprintDependencyDraft(requirement.id, {
                                          reuseConnectionUrl: event.currentTarget.value,
                                        })}
                                      placeholder="postgres://********@db.example.com/app"
                                    />
                                  </div>
                                  <div class="space-y-2">
                                    <label
                                      class="text-xs font-medium text-muted-foreground"
                                      for={`blueprint-dependency-${requirement.id}-secret`}
                                    >
                                      {$t(i18nKeys.console.dependencyResources.secretRef)}
                                    </label>
                                    <Input
                                      id={`blueprint-dependency-${requirement.id}-secret`}
                                      class="font-mono text-xs"
                                      value={draft.reuseSecretRef}
                                      oninput={(event) =>
                                        updateBlueprintDependencyDraft(requirement.id, {
                                          reuseSecretRef: event.currentTarget.value,
                                        })}
                                      placeholder={`secret://dependency/${requirement.kind}/${requirement.id}`}
                                    />
                                  </div>
                                </div>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <div class="console-subtle-panel px-3 py-3 text-sm text-muted-foreground">
                          无需依赖资源
                        </div>
                      {/if}
                      {#if selectedBlueprintUnsupportedDependencies.length > 0}
                        <div class="console-subtle-panel flex items-start gap-2 px-3 py-3 text-xs text-muted-foreground">
                          <HardDriveDownload class="mt-0.5 size-4 shrink-0" />
                          <span>
                            {selectedBlueprintUnsupportedDependencies.map((resource) => `${resource.label} · ${resource.kind}`).join(" / ")}
                          </span>
                        </div>
                      {/if}
                    </div>
                  {/if}
                  {#if quickDeploySourceExtensions.length > 1}
                    <div class="space-y-2">
                      <p class="text-xs font-medium text-muted-foreground">蓝图目录来源</p>
                      <div class="grid gap-2 sm:grid-cols-2">
                        {#each quickDeploySourceExtensions as extension (extension.key)}
                          <Button
                            type="button"
                            variant="outline"
                            class="h-auto justify-start whitespace-normal px-3 py-3 text-left"
                            onclick={() => selectBlueprintSourceExtension(extension)}
                          >
                            <Package class="size-4 shrink-0" />
                            <span class="min-w-0">
                              <span class="flex items-center gap-2 text-sm font-medium">
                                <span class="truncate">{extension.title}</span>
                                {#if selectedBlueprintSourceExtension?.key === extension.key}
                                  <Badge variant="outline">当前</Badge>
                                {/if}
                              </span>
                              <span class="block text-xs font-normal text-muted-foreground">
                                {extension.description ?? extension.pluginDisplayName}
                              </span>
                            </span>
                          </Button>
                        {/each}
                      </div>
                    </div>
                  {:else if selectedBlueprintSourceExtension}
                    <p class="text-xs text-muted-foreground">
                      蓝图目录来源：{selectedBlueprintSourceExtension.title}
                    </p>
                  {/if}
                {:else}
                  <div class="console-subtle-panel px-3 py-3 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.quickDeploy.sourceBlueprintCatalogUnavailable)}
                  </div>
                {/if}
              </div>
            {:else}
              <div class="space-y-2">
                <label class="text-xs font-medium text-muted-foreground" for="source-locator">
                  {$t(i18nKeys.console.quickDeploy.sourceAddress)}
                </label>
                {#if sourceKind === "local-folder"}
                <div class="flex flex-col gap-2 sm:flex-row">
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
                    class="justify-start sm:shrink-0"
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
            {#if sourceKind !== "docker-image" && sourceKind !== "blueprint"}
              <div class="space-y-2">
                <label class="text-xs font-medium text-muted-foreground" for="source-base-directory">
                  {$t(i18nKeys.console.quickDeploy.sourceBaseDirectory)}
                </label>
                <Input
                  id="source-base-directory"
                  class="font-mono text-xs"
                  bind:value={sourceBaseDirectory}
                  placeholder="apps/web"
                />
              </div>
            {/if}
            {#if sourceKind === "static-site"}
              <div class="grid gap-3 sm:grid-cols-3">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="static-publish-directory">
                    {$t(i18nKeys.console.quickDeploy.staticPublishDirectory)}
                  </label>
                  <Input
                    id="static-publish-directory"
                    class="font-mono text-xs"
                    bind:value={staticPublishDirectory}
                    placeholder="/dist"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="static-install-command">
                    {$t(i18nKeys.console.quickDeploy.staticInstallCommand)}
                  </label>
                  <Input
                    id="static-install-command"
                    class="font-mono text-xs"
                    bind:value={staticInstallCommand}
                    placeholder="pnpm install"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="static-build-command">
                    {$t(i18nKeys.console.quickDeploy.staticBuildCommand)}
                  </label>
                  <Input
                    id="static-build-command"
                    class="font-mono text-xs"
                    bind:value={staticBuildCommand}
                    placeholder="pnpm build"
                  />
                </div>
                <p class="text-xs text-muted-foreground sm:col-span-3">
                  {$t(i18nKeys.console.quickDeploy.staticPublishDirectoryHint)}
                </p>
              </div>
            {:else if sourceKind !== "docker-image" && sourceKind !== "blueprint"}
              <div class="grid gap-3 sm:grid-cols-3">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="runtime-install-command">
                    {$t(i18nKeys.console.quickDeploy.runtimeInstallCommand)}
                  </label>
                  <Input
                    id="runtime-install-command"
                    class="font-mono text-xs"
                    bind:value={resourceInstallCommand}
                    placeholder="pnpm install"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="runtime-build-command">
                    {$t(i18nKeys.console.quickDeploy.runtimeBuildCommand)}
                  </label>
                  <Input
                    id="runtime-build-command"
                    class="font-mono text-xs"
                    bind:value={resourceBuildCommand}
                    placeholder="pnpm build"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="runtime-start-command">
                    {$t(i18nKeys.console.quickDeploy.runtimeStartCommand)}
                  </label>
                  <Input
                    id="runtime-start-command"
                    class="font-mono text-xs"
                    bind:value={resourceStartCommand}
                    placeholder="pnpm start"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="runtime-dockerfile-path">
                    {$t(i18nKeys.console.quickDeploy.dockerfilePath)}
                  </label>
                  <Input
                    id="runtime-dockerfile-path"
                    class="font-mono text-xs"
                    bind:value={resourceDockerfilePath}
                    placeholder="Dockerfile"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="runtime-compose-file-path">
                    {$t(i18nKeys.console.quickDeploy.dockerComposeFilePath)}
                  </label>
                  <Input
                    id="runtime-compose-file-path"
                    class="font-mono text-xs"
                    bind:value={resourceDockerComposeFilePath}
                    placeholder="compose.yaml"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground" for="runtime-build-target">
                    {$t(i18nKeys.console.quickDeploy.buildTarget)}
                  </label>
                  <Input
                    id="runtime-build-target"
                    class="font-mono text-xs"
                    bind:value={resourceBuildTarget}
                    placeholder="runner"
                  />
                </div>
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
                <div class="console-subtle-panel px-3 py-3 text-sm">
                  <span class="text-muted-foreground">{$t(i18nKeys.console.quickDeploy.currentIdentity)}</span>
                  <span class="ml-2 font-medium">{authIdentity}</span>
                </div>
              {/if}

              {#if !githubProvider?.configured}
                <div class="console-subtle-panel px-3 py-3 text-sm text-muted-foreground">
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
                  <div class="console-subtle-panel max-h-64 space-y-2 overflow-auto p-2">
                    {#if githubRepositoriesQuery.isPending}
                      {#each Array.from({ length: 4 }) as _, index (index)}
                        <Skeleton class="h-14 w-full" />
                      {/each}
                    {:else if githubRepositories.length > 0}
                      {#each githubRepositories as repository (repository.id)}
                        <Button
                          type="button"
                          variant="ghost"
                          class={`h-auto w-full justify-start whitespace-normal rounded-md px-3 py-3 text-left ${
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
                        </Button>
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
              <div class="grid gap-2 sm:grid-cols-2">
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
              <div class="console-subtle-panel px-3 py-3 text-sm text-muted-foreground">
                {$t(i18nKeys.console.quickDeploy.noProjectOptions)}
              </div>
            {/if}
            {#if projectMode === "existing" && projects.length > 0}
              <div class="console-subtle-panel max-h-44 space-y-2 overflow-auto p-2">
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
              <DocsHelpLink
                href={webDocsHrefs.serverDeploymentTarget}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
              />
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
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
              <div class="console-subtle-panel max-h-44 space-y-2 overflow-auto p-2">
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
              <DocsHelpLink
                href={webDocsHrefs.environmentConcept}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
              />
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
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
              <div class="console-subtle-panel max-h-44 space-y-2 overflow-auto p-2">
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
                  <div class="grid gap-2 sm:grid-cols-2">
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
              <DocsHelpLink
                href={webDocsHrefs.environmentVariablePrecedence}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
              />
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
              <div class="grid min-w-0 gap-3 text-sm md:grid-cols-2">
                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.source)}</p>
                  <p class="mt-1 break-all font-medium">{$t(selectedSourceOption.labelKey)} · {sourceSummary}</p>
                </div>
                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.project)}</p>
                  <p class="mt-1 break-words font-medium">{projectSummary}</p>
                </div>
                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.server)}</p>
                  <p class="mt-1 break-words font-medium">{serverSummary}</p>
                  <p class="mt-1 break-words text-xs text-muted-foreground">{serverCredentialSummary}</p>
                </div>
                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</p>
                  <p class="mt-1 break-words font-medium">{environmentSummary}</p>
                </div>
                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</p>
                  <p class="mt-1 break-words font-medium">{resourceSummary}</p>
                </div>
                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <p class="text-xs text-muted-foreground">
                    {$t(i18nKeys.console.quickDeploy.healthCheckPath)}
                  </p>
                  <p class="mt-1 break-words font-medium">{resourceHealthCheckSummary}</p>
                </div>
                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.domainBindings)}</p>
                  <p class="mt-1 break-all font-medium">{domainBindingSummary}</p>
                </div>
                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.variables)}</p>
                  <p class="mt-1 break-words font-medium">{variableSummary}</p>
                </div>
              </div>

              <div class="space-y-3">
                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-medium">{$t(i18nKeys.common.domain.project)}</p>
                      <p class="break-words text-xs text-muted-foreground">{projectSummary}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      class="shrink-0"
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
                      <div class="grid gap-2 sm:grid-cols-2">
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
                        <div class="console-subtle-panel max-h-44 space-y-2 overflow-auto p-2">
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

                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium">{$t(i18nKeys.common.domain.environment)}</p>
                        <DocsHelpLink
                          href={webDocsHrefs.environmentConcept}
                          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                        />
                      </div>
                      <p class="break-words text-xs text-muted-foreground">{environmentSummary}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      class="shrink-0"
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
                      <div class="grid gap-2 sm:grid-cols-2">
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
                        <div class="console-subtle-panel max-h-44 space-y-2 overflow-auto p-2">
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
                          <div class="grid gap-2 sm:grid-cols-2">
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

                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium">{$t(i18nKeys.common.domain.resource)}</p>
                        <DocsHelpLink
                          href={webDocsHrefs.resourceConcept}
                          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                        />
                      </div>
                      <p class="break-words text-xs text-muted-foreground">{resourceSummary}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      class="shrink-0"
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
                      <div class="grid gap-2 sm:grid-cols-2">
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
                        <div class="console-subtle-panel max-h-44 space-y-2 overflow-auto p-2">
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
                            <Input
                              bind:value={resourceRuntimeName}
                              placeholder={$t(i18nKeys.console.resources.runtimeNamePlaceholder)}
                            />
                          </div>
                          <div class="grid gap-3 sm:grid-cols-2">
                            <Input bind:value={resourceDescription} placeholder={$t(i18nKeys.common.domain.description)} />
                          </div>
                          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {#each resourceKinds as kind (kind)}
                              <Button
                                type="button"
                                size="sm"
                                variant={resourceKind === kind ? "selected" : "outline"}
                                onclick={() => {
                                  resourceKind = kind;
                                  if (kind === "static-site" && (!resourceInternalPort.trim() || resourceInternalPort === "3000")) {
                                    resourceInternalPort = "80";
                                  }
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
                        {#if createsStaticSiteResource}
                          <div class="grid gap-3 sm:grid-cols-3">
                            <div class="space-y-2">
                              <label class="text-xs font-medium text-muted-foreground" for="resource-static-publish-directory">
                                {$t(i18nKeys.console.quickDeploy.staticPublishDirectory)}
                              </label>
                              <Input
                                id="resource-static-publish-directory"
                                class="font-mono text-xs"
                                bind:value={staticPublishDirectory}
                                placeholder="/dist"
                              />
                            </div>
                            <div class="space-y-2">
                              <label class="text-xs font-medium text-muted-foreground" for="resource-static-install-command">
                                {$t(i18nKeys.console.quickDeploy.staticInstallCommand)}
                              </label>
                              <Input
                                id="resource-static-install-command"
                                class="font-mono text-xs"
                                bind:value={staticInstallCommand}
                                placeholder="pnpm install"
                              />
                            </div>
                            <div class="space-y-2">
                              <label class="text-xs font-medium text-muted-foreground" for="resource-static-build-command">
                                {$t(i18nKeys.console.quickDeploy.staticBuildCommand)}
                              </label>
                              <Input
                                id="resource-static-build-command"
                                class="font-mono text-xs"
                                bind:value={staticBuildCommand}
                                placeholder="pnpm build"
                              />
                            </div>
                            <p class="text-xs text-muted-foreground sm:col-span-3">
                              {$t(i18nKeys.console.quickDeploy.staticPublishDirectoryHint)}
                            </p>
                          </div>
                        {/if}
                        <div class="grid gap-3 sm:grid-cols-2">
                          <div class="space-y-2">
                            <div class="flex items-center gap-1.5">
                              <label class="text-xs font-medium text-muted-foreground" for="resource-internal-port">
                                {$t(i18nKeys.console.quickDeploy.applicationPort)}
                              </label>
                              <DocsHelpLink
                                href={webDocsHrefs.resourceNetworkProfile}
                                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                                className="size-5"
                              />
                            </div>
                            <Input
                              id="resource-internal-port"
                              bind:value={resourceInternalPort}
                              placeholder={resourceInternalPortDefault}
                            />
                            <p class="text-xs text-muted-foreground">
                              {$t(i18nKeys.console.quickDeploy.applicationPortHint)}
                            </p>
                          </div>
                          <div class="flex items-center gap-2">
                            <Button
                              type="button"
                              class="flex-1"
                              variant={resourceHealthCheckEnabled ? "selected" : "outline"}
                              onclick={() => {
                                resourceHealthCheckEnabled = !resourceHealthCheckEnabled;
                              }}
                            >
                              {$t(i18nKeys.console.quickDeploy.healthCheckToggle)}
                            </Button>
                            <DocsHelpLink
                              href={webDocsHrefs.resourceHealthProfile}
                              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                            />
                          </div>
                        </div>
                        {#if resourceHealthCheckEnabled}
                          <div class="console-subtle-panel grid gap-3 p-3 sm:grid-cols-3">
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
                    {#if createsStaticSiteResource}
                      <div class="mt-3 grid gap-3 sm:grid-cols-3">
                        <div class="space-y-2">
                          <label class="text-xs font-medium text-muted-foreground" for="resource-default-static-publish-directory">
                            {$t(i18nKeys.console.quickDeploy.staticPublishDirectory)}
                          </label>
                          <Input
                            id="resource-default-static-publish-directory"
                            class="font-mono text-xs"
                            bind:value={staticPublishDirectory}
                            placeholder="/dist"
                          />
                        </div>
                        <div class="space-y-2">
                          <label class="text-xs font-medium text-muted-foreground" for="resource-default-static-install-command">
                            {$t(i18nKeys.console.quickDeploy.staticInstallCommand)}
                          </label>
                          <Input
                            id="resource-default-static-install-command"
                            class="font-mono text-xs"
                            bind:value={staticInstallCommand}
                            placeholder="pnpm install"
                          />
                        </div>
                        <div class="space-y-2">
                          <label class="text-xs font-medium text-muted-foreground" for="resource-default-static-build-command">
                            {$t(i18nKeys.console.quickDeploy.staticBuildCommand)}
                          </label>
                          <Input
                            id="resource-default-static-build-command"
                            class="font-mono text-xs"
                            bind:value={staticBuildCommand}
                            placeholder="pnpm build"
                          />
                        </div>
                        <p class="text-xs text-muted-foreground sm:col-span-3">
                          {$t(i18nKeys.console.quickDeploy.staticPublishDirectoryHint)}
                        </p>
                      </div>
                    {/if}
                    <div class="mt-3 grid gap-3 sm:grid-cols-2">
                      <div class="space-y-2">
                        <div class="flex items-center gap-1.5">
                          <label class="text-xs font-medium text-muted-foreground" for="resource-default-internal-port">
                            {$t(i18nKeys.console.quickDeploy.applicationPort)}
                          </label>
                          <DocsHelpLink
                            href={webDocsHrefs.resourceNetworkProfile}
                            ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                            className="size-5"
                          />
                        </div>
                        <Input
                          id="resource-default-internal-port"
                          bind:value={resourceInternalPort}
                          placeholder={resourceInternalPortDefault}
                        />
                        <p class="text-xs text-muted-foreground">
                          {$t(i18nKeys.console.quickDeploy.applicationPortHint)}
                        </p>
                      </div>
                      <div class="flex items-center gap-2">
                        <Button
                          type="button"
                          class="flex-1"
                          variant={resourceHealthCheckEnabled ? "selected" : "outline"}
                          onclick={() => {
                            resourceHealthCheckEnabled = !resourceHealthCheckEnabled;
                          }}
                        >
                          {$t(i18nKeys.console.quickDeploy.healthCheckToggle)}
                        </Button>
                        <DocsHelpLink
                          href={webDocsHrefs.resourceHealthProfile}
                          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                        />
                      </div>
                    </div>
                    {#if resourceHealthCheckEnabled}
                      <div class="console-subtle-panel mt-3 grid gap-3 p-3 sm:grid-cols-3">
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

                <div class="min-w-0 rounded-md border bg-card px-3 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium">{$t(i18nKeys.common.domain.variables)}</p>
                        <DocsHelpLink
                          href={webDocsHrefs.environmentVariablePrecedence}
                          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                        />
                      </div>
                      <p class="break-words text-xs text-muted-foreground">{variableSummary}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      class="shrink-0"
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
            {#if activeStep === "source" && sourceKind === "blueprint" && !selectedBlueprintSlug.trim()}
              <Button
                type="button"
                class="flex-1 sm:flex-none"
                disabled={!selectedBlueprintSourceExtension}
                onclick={openBlueprintSelectorDialog}
              >
                {$t(i18nKeys.console.quickDeploy.sourceBlueprintOpenSelector)}
              </Button>
            {:else if activeStep !== "review"}
              <Button class="flex-1 sm:flex-none" disabled={!canAdvance} onclick={goToNextStep}>
                {$t(i18nKeys.common.actions.next)}
              </Button>
            {/if}
          </div>
        </div>
      </section>

  </div>

  <aside class="min-w-0 space-y-5 xl:sticky xl:top-5 xl:self-start">
      <section class="console-side-panel min-w-0 space-y-4">
        <div class="space-y-2">
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.quickDeploy.currentSummary)}</h2>
          <p class="text-sm text-muted-foreground">{$t(i18nKeys.console.quickDeploy.currentSummaryDescription)}</p>
        </div>
        <div class="space-y-3 text-sm">
          <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
            <span class="shrink-0 text-muted-foreground">{$t(i18nKeys.console.quickDeploy.sourceType)}</span>
            <span class="min-w-0 break-words text-right font-medium">{$t(selectedSourceOption.labelKey)}</span>
          </div>
          <div class="console-subtle-panel min-w-0 px-3 py-3">
            <div class="mb-2 flex items-center justify-between gap-3">
              <span class="text-xs font-medium uppercase text-muted-foreground">
                {$t(i18nKeys.console.quickDeploy.sourceDetails)}
              </span>
              {#if sourceKind === "blueprint" && selectedBlueprintSlug.trim()}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onclick={openSelectedBlueprintDetailDialog}
                >
                  <Eye class="size-4" />
                  详情
                </Button>
              {/if}
            </div>
            <div class="space-y-2">
              {#each sourceDetailRows as row, index (`${row.label}-${index}`)}
                <div class="flex min-w-0 items-start justify-between gap-3">
                  <span class="shrink-0 text-muted-foreground">{row.label}</span>
                  <span class={`min-w-0 flex-1 break-all text-right font-medium ${row.mono ? "font-mono text-xs" : ""}`}>
                    {row.value}
                  </span>
                </div>
              {/each}
            </div>
          </div>
          <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
            <span class="shrink-0 text-muted-foreground">{$t(i18nKeys.common.domain.project)}</span>
            <span class="min-w-0 break-words text-right font-medium">{projectSummary}</span>
          </div>
          {#if sourceKind === "blueprint" && selectedBlueprintSlug.trim()}
            <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
              <span class="shrink-0 text-muted-foreground">依赖资源</span>
              <span class="min-w-0 break-words text-right font-medium">
                {blueprintDependencyProvisioningSummary}
              </span>
            </div>
          {/if}
          <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
            <span class="shrink-0 text-muted-foreground">{$t(i18nKeys.common.domain.server)}</span>
            <span class="min-w-0 break-words text-right font-medium">{serverSummary}</span>
          </div>
          <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
            <span class="shrink-0 text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</span>
            <span class="min-w-0 break-words text-right font-medium">{environmentSummary}</span>
          </div>
          <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
            <span class="shrink-0 text-muted-foreground">{$t(i18nKeys.common.domain.resource)}</span>
            <span class="min-w-0 break-words text-right font-medium">{resourceSummary}</span>
          </div>
          <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
            <span class="shrink-0 text-muted-foreground">
              {$t(i18nKeys.console.quickDeploy.healthCheckPath)}
            </span>
            <span class="min-w-0 break-words text-right font-medium">{resourceHealthCheckSummary}</span>
          </div>
          <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
            <span class="shrink-0 text-muted-foreground">{$t(i18nKeys.common.domain.domainBindings)}</span>
            <span class="min-w-0 break-all text-right font-medium">{domainBindingSummary}</span>
          </div>
          <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
            <span class="shrink-0 text-muted-foreground">{$t(i18nKeys.common.domain.variables)}</span>
            <span class="min-w-0 break-words text-right font-medium">{variableSummary}</span>
          </div>
        </div>
        {#if activeStep === "review"}
          <div class="flex flex-col items-stretch gap-3">
            <Button class="w-full" disabled={deployPending} onclick={handleQuickDeploy}>
              {#if deployPending}
                <LoaderCircle class="size-4 animate-spin" />
                {$t(i18nKeys.console.quickDeploy.submitPending)}
              {:else if sourceKind === "blueprint"}
                <Play class="size-4" />
                查看 Blueprint 安装计划
              {:else}
                <Play class="size-4" />
                {$t(i18nKeys.common.actions.createAndDeploy)}
              {/if}
            </Button>
            {#if workflowProgressItems.length > 0}
              <Button
                type="button"
                class="w-full"
                variant="outline"
                onclick={() => {
                  workflowProgressDialogOpen = true;
                }}
              >
                {$t(i18nKeys.common.actions.viewProgress)}
              </Button>
            {/if}
            <pre class="max-w-full overflow-x-auto bg-muted px-3 py-3 text-xs text-muted-foreground">{deploymentCommandPreview}</pre>
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
                {#if lastAccessUrl}
                  <Button
                    href={lastAccessUrl}
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
                <Button
                  id="quick-deploy-diagnostic-summary-copy"
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={diagnosticSummaryLoading}
                  onclick={() => {
                    void copyQuickDeployDiagnosticSummary();
                  }}
                >
                  {#if diagnosticSummaryLoading}
                    <LoaderCircle class="size-4 animate-spin" />
                  {/if}
                  {quickDeployDiagnosticSummaryButtonLabel}
                </Button>
              </div>
              {#if diagnosticSummaryError}
                <p class="mt-2 text-sm text-destructive">{diagnosticSummaryError}</p>
              {/if}
              {#if diagnosticSummaryCopyFallback}
                <div class="console-subtle-panel mt-3 space-y-2 border-dashed p-3">
                  <div class="space-y-1">
                    <p class="text-sm font-medium">
                      {$t(i18nKeys.console.resources.diagnosticSummaryCopyFallbackTitle)}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.resources.diagnosticSummaryCopyFallbackDescription)}
                    </p>
                  </div>
                  <Textarea
                    class="min-h-28 font-mono text-xs"
                    readonly
                    value={diagnosticSummaryCopyFallback}
                    onfocus={selectDiagnosticSummaryFallback}
                  />
                </div>
              {/if}
            {/if}
          </div>
        </section>
      {/if}
  </aside>
</div>

<QuickDeployProgressDialog
  open={workflowProgressDialogOpen}
  pending={deployPending}
  progressItems={workflowProgressItems}
  deploymentEvents={workflowDeploymentProgressEvents}
  progressError={workflowProgressError}
  feedback={deployFeedback}
  deploymentId={lastCreatedDeploymentId}
  traceLink={workflowDeploymentTraceLink}
  onClose={() => {
    workflowProgressDialogOpen = false;
  }}
  onOpenDeployment={() => {
    void goto(lastCreatedDeploymentHref());
  }}
/>

<Dialog.Root bind:open={blueprintSelectorDialogOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-6xl">
    <Dialog.Header>
      <Dialog.Title>选择蓝图</Dialog.Title>
      <Dialog.Description>
        从蓝图市场选择应用，选择后会回到当前快速部署流程。
      </Dialog.Description>
    </Dialog.Header>

    <div class="px-5 pb-5">
      <BlueprintCatalogSelector
        surface="dialog"
        selectedSlug={selectedBlueprintSlug}
        actionLabel="选择蓝图"
        onselect={applyBlueprintListing}
        onview={openBlueprintListingDetail}
      />
    </div>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={blueprintDetailDialogOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-4xl">
    <Dialog.Header>
      <Dialog.Title>{(selectedBlueprintListing?.title ?? blueprintDetailTitle) || "蓝图详情"}</Dialog.Title>
      <Dialog.Description>
        查看应用介绍、官网、依赖资源、入口和配置项。
      </Dialog.Description>
    </Dialog.Header>

    <div class="px-5 pb-5">
      {#if selectedBlueprintDetailQuery.isPending}
        <div class="grid gap-3 md:grid-cols-2">
          <Skeleton class="h-40 w-full" />
          <Skeleton class="h-40 w-full" />
        </div>
      {:else if selectedBlueprintDetailQuery.isError || !selectedBlueprintDetail || !selectedBlueprintListing || !selectedBlueprintManifest}
        <div class="console-subtle-panel px-3 py-3 text-sm text-muted-foreground">
          无法加载这个蓝图详情。
        </div>
      {:else}
        <div class="space-y-5">
          <section class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex min-w-0 items-start gap-4">
              <BlueprintProductIcon
                title={selectedBlueprintListing.title}
                icon={selectedBlueprintListing.icon}
                class="size-14"
                imageClass="size-8"
              />
              <div class="min-w-0 space-y-2">
                <div class="flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedBlueprintListing.category}</Badge>
                  <Badge variant="outline">
                    {selectedBlueprintListing.featured ? "Featured" : "Official"}
                  </Badge>
                  <Badge variant="outline">{selectedBlueprintListing.publisher.name}</Badge>
                </div>
                <div>
                  <h3 class="text-xl font-semibold">{selectedBlueprintListing.title}</h3>
                  <p class="mt-1 text-sm leading-6 text-muted-foreground">
                    {selectedBlueprintListing.subtitle}
                  </p>
                </div>
              </div>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              {#if selectedBlueprintListing.websiteUrl}
                <Button
                  href={selectedBlueprintListing.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  size="sm"
                  variant="outline"
                >
                  官网
                  <ExternalLink class="size-4" />
                </Button>
              {/if}
              {#if selectedBlueprintListing.documentationUrl}
                <Button
                  href={selectedBlueprintListing.documentationUrl}
                  target="_blank"
                  rel="noreferrer"
                  size="sm"
                  variant="outline"
                >
                  文档
                  <ExternalLink class="size-4" />
                </Button>
              {/if}
            </div>
          </section>

          <section class="grid gap-3 text-sm md:grid-cols-3">
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">运行单元</p>
              <p class="mt-1 font-medium">{selectedBlueprintManifest.components.length} component</p>
            </div>
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">依赖资源</p>
              <p class="mt-1 truncate font-medium">
                {selectedBlueprintManifest.resources.map((resource) => resource.kind).join(" / ") || "无"}
              </p>
            </div>
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">公开入口</p>
              <p class="mt-1 truncate font-medium">
                {selectedBlueprintManifest.components
                  .flatMap((component) =>
                    component.ports.map((port) => `${port.containerPort}/${port.protocol}`),
                  )
                  .join(" / ") || "无"}
              </p>
            </div>
          </section>

          <section class="space-y-3">
            <div>
              <h3 class="text-base font-semibold">介绍</h3>
              <p class="mt-1 text-sm leading-6 text-muted-foreground">
                {selectedBlueprintManifest.description ??
                  selectedBlueprintListing.blueprint.summary ??
                  selectedBlueprintListing.subtitle}
              </p>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <p class="text-xs font-medium uppercase text-muted-foreground">适合场景</p>
                <ul class="space-y-2 text-sm leading-6 text-muted-foreground">
                  {#each selectedBlueprintListing.overview?.useCases ?? ["快速部署官方应用", "先审阅拓扑和依赖资源"] as useCase (useCase)}
                    <li class="flex gap-2">
                      <span class="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/55"></span>
                      <span>{useCase}</span>
                    </li>
                  {/each}
                </ul>
              </div>
              <div class="space-y-2">
                <p class="text-xs font-medium uppercase text-muted-foreground">Appaloft 概念</p>
                <ul class="space-y-2 text-sm leading-6 text-muted-foreground">
                  {#each selectedBlueprintListing.overview?.highlights ?? [
                    `${selectedBlueprintManifest.components.length} 个应用运行单元`,
                    selectedBlueprintManifest.resources.length > 0
                      ? `${selectedBlueprintManifest.resources.map((resource) => resource.kind).join(" / ")} 依赖绑定`
                      : "无托管依赖资源",
                    "生成项目、环境、资源、网络和部署 dry-run 计划",
                  ] as highlight (highlight)}
                    <li class="flex gap-2">
                      <span class="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/55"></span>
                      <span>{highlight}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            </div>
          </section>

          <section class="grid gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <p class="text-xs font-medium uppercase text-muted-foreground">组件</p>
              {#each selectedBlueprintManifest.components as component (component.id)}
                <div class="console-subtle-panel px-3 py-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium">{component.name}</span>
                    <Badge variant="outline">{component.runtime.strategy}</Badge>
                  </div>
                  <p class="mt-1 truncate text-xs text-muted-foreground">
                    {component.runtime.image ??
                      component.runtime.startCommand ??
                      component.runtime.outputDirectory ??
                      component.kind}
                  </p>
                </div>
              {/each}
            </div>
            <div class="space-y-2">
              <p class="text-xs font-medium uppercase text-muted-foreground">配置</p>
              <div class="console-subtle-panel px-3 py-2 text-sm">
                <p class="text-muted-foreground">参数</p>
                <p class="mt-1 font-medium">
                  {selectedBlueprintDetail.install.parameters.map((parameter) => parameter.key).join(", ") || "无"}
                </p>
              </div>
              <div class="console-subtle-panel px-3 py-2 text-sm">
                <p class="text-muted-foreground">密钥占位</p>
                <p class="mt-1 font-medium">
                  {selectedBlueprintDetail.install.secrets.map((secret) => secret.key).join(", ") || "无"}
                </p>
              </div>
              <div class="console-subtle-panel px-3 py-2 text-sm">
                <p class="text-muted-foreground">环境变量</p>
                <p class="mt-1 font-medium">
                  {selectedBlueprintVariables.map((variable) => variable.key).join(", ") || "无默认环境变量"}
                </p>
              </div>
            </div>
          </section>

          <Dialog.Footer>
            <Button
              type="button"
              variant="outline"
              onclick={() => {
                blueprintDetailDialogOpen = false;
                blueprintSelectorDialogOpen = true;
              }}
            >
              更换蓝图
            </Button>
            <Button type="button" onclick={applyVisibleBlueprintDetail}>
              {selectedBlueprintSlug === selectedBlueprintListing.slug ? "继续使用" : "选择这个蓝图"}
            </Button>
          </Dialog.Footer>
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

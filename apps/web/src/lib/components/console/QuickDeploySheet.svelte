<script lang="ts">
  import { browser } from "$app/environment";
  import { afterNavigate, goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import {
    CheckCircle2,
    ChevronDown,
    Code2,
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
    Upload,
    Wrench,
    Waypoints,
  } from "@lucide/svelte";
  import type { IconModule as BrandIconModule } from "@thesvg/icons";
  import clickhouseIcon from "@thesvg/icons/clickhouse";
  import minioIcon from "@thesvg/icons/minio";
  import mysqlIcon from "@thesvg/icons/mysql";
  import opensearchIcon from "@thesvg/icons/opensearch";
  import postgresqlIcon from "@thesvg/icons/postgresql";
  import redisIcon from "@thesvg/icons/redis";
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
    CreateEnvironmentInput,
    ConfigureServerCredentialInput,
    CreateDeploymentInput,
    DeploymentProgressEvent,
    DependencyResourceCapabilityRequirement,
    DependencyResourceSummary,
    CreateResourceInput,
    EnvironmentSummary,
    GitHubRepositorySummary,
    IntegrationDescriptor,
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
  import { defaultAuthSession, defaultConsoleListLimit } from "$lib/console/queries";
  import {
    environmentKinds,
    parseEnvironmentKind,
    type EnvironmentKind,
  } from "$lib/console/environment-form";
  import { selectCurrentResourceAccessRoute } from "$lib/console/resource-access-route";
  import {
    createQuickDeployServerCredential,
    createRegisterServerInput,
    createServerRegistrationDraft,
    isServerRegistrationDraftComplete,
    sshServerProviderKey,
    type DraftServerConnectivityInput,
  } from "$lib/console/server-registration";
  import { deploymentDetailHref, readSessionIdentity } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type SourceKind =
    | "local-folder"
    | "dockerfile"
    | "github"
    | "blueprint"
    | "remote-git"
    | "docker-image"
    | "compose"
    | "static-site";
  type SourceGroupKey = "git" | "docker" | "static-site" | "blueprint";
  type SourceOptionIcon = Component<{ class?: string }>;
  type GithubSourceMode = "url" | "browser";
  type StaticPublishTarget = "managed" | "server";
  type DraftMode = "existing" | "new";
  type ResourceKind = ResourceSummary["kind"];
  type DependencyKind = DependencyResourceSummary["kind"];
  type GitHubAppConfigurationDiagnostic = NonNullable<
    IntegrationDescriptor["configuration"]
  >["diagnostics"][number];
  type DependencyKindIcon = {
    title: string;
    svg: string;
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
    capabilities: readonly DependencyResourceCapabilityRequirement[];
    optional?: boolean;
  };
  type DeploymentStepKey = "source" | "project" | "server" | "environment" | "variables" | "review";
  type SummaryRow = {
    label: string;
    value: string;
    mono?: boolean;
    icon?: "blueprint";
  };
  type QuickDeployWorkflowStepStatus = "pending" | "running" | "succeeded" | "failed";
  type QuickDeployWorkflowProgressItem = {
    kind: QuickDeployWorkflowStep["kind"];
    status: QuickDeployWorkflowStepStatus;
  };
  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
  };
  type StaticArtifactPayloadFileInput = {
    path: string;
    mimeType: string;
    contentBase64: string;
  };
  type PublishStaticArtifactPayloadInput = {
    projectId: string;
    resourceId: string;
    promoteAlias?: boolean;
    files: StaticArtifactPayloadFileInput[];
    metadata?: Record<string, string>;
  };
  type PublishStaticArtifactArchiveInput = {
    projectId: string;
    resourceId: string;
    promoteAlias?: boolean;
    archiveBase64: string;
    metadata?: Record<string, string>;
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
    defaultVariant?: string;
    variants?: readonly {
      id: string;
      label?: string;
      summary?: string;
    }[];
  };
  type BlueprintUpgradePolicy = {
    strategy: string;
    destructive?: boolean;
    instructions?: string;
    steps?: readonly {
      classification: "non-breaking" | "potentially-breaking" | "breaking";
      requiresManualReview?: boolean;
      notes?: string;
      changes?: readonly string[];
    }[];
  };
  type BlueprintManifestComponent = {
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
  };
  type BlueprintDetailResponse = {
    listing: BlueprintCatalogListing;
    manifest: {
      summary: string;
      description?: string;
      parameters: readonly { key: string; label: string; type: string; required?: boolean; default?: unknown }[];
      secrets: readonly { key: string; label: string; required?: boolean; description?: string }[];
      resources: readonly {
        id: string;
        kind: string;
        label: string;
        capabilities?: readonly DependencyResourceCapabilityRequirement[];
        optional?: boolean;
      }[];
      components: readonly BlueprintManifestComponent[];
      defaultVariant?: string;
      variants?: Record<string, {
        label?: string;
        summary?: string;
        description?: string;
        defaultProfile?: string;
        parameters?: readonly { key: string; label: string; type: string; required?: boolean; default?: unknown }[];
        secrets?: readonly { key: string; label: string; required?: boolean; description?: string }[];
        resources?: readonly {
          id: string;
          kind: string;
          label: string;
          capabilities?: readonly DependencyResourceCapabilityRequirement[];
          optional?: boolean;
        }[];
        components?: readonly BlueprintManifestComponent[];
        upgrade?: BlueprintUpgradePolicy;
      }>;
      upgrade?: BlueprintUpgradePolicy;
    };
    install: {
      profiles: readonly string[];
      defaultProfile: string;
      parameters: readonly { key: string; label: string; type: string; required?: boolean; default?: unknown }[];
      secrets: readonly { key: string; label: string; required?: boolean }[];
      defaultVariant?: string;
      variants?: readonly { id: string; label?: string; summary?: string }[];
      upgrade?: BlueprintUpgradePolicy;
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

  function brandIcon(icon: BrandIconModule, variant = "default"): DependencyKindIcon {
    return { title: icon.title, svg: icon.variants[variant] ?? icon.svg };
  }

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
      icon: brandIcon(postgresqlIcon),
    },
    redis: {
      label: "Redis",
      icon: brandIcon(redisIcon),
    },
    mysql: {
      label: "MySQL",
      icon: brandIcon(mysqlIcon, "light"),
    },
    clickhouse: {
      label: "ClickHouse",
      icon: brandIcon(clickhouseIcon),
    },
    "object-storage": {
      label: "Object Storage",
      icon: brandIcon(minioIcon),
    },
    opensearch: {
      label: "OpenSearch",
      icon: brandIcon(opensearchIcon),
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
      key: "dockerfile",
      labelKey: i18nKeys.console.quickDeploy.sourceDockerfile,
      hintKey: i18nKeys.console.quickDeploy.sourceDockerfileHint,
      icon: Code2,
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
  const visibleSourceGroups: Array<{
    key: SourceGroupKey;
    labelKey: TranslationKey;
    hintKey: TranslationKey;
    icon: SourceOptionIcon;
    defaultSourceKind: SourceKind;
  }> = [
    {
      key: "git",
      labelKey: i18nKeys.console.quickDeploy.sourceGroupGit,
      hintKey: i18nKeys.console.quickDeploy.sourceGroupGitHint,
      icon: GitFork,
      defaultSourceKind: "github",
    },
    {
      key: "docker",
      labelKey: i18nKeys.console.quickDeploy.sourceGroupDocker,
      hintKey: i18nKeys.console.quickDeploy.sourceGroupDockerHint,
      icon: DockerIcon,
      defaultSourceKind: "dockerfile",
    },
    {
      key: "static-site",
      labelKey: i18nKeys.console.quickDeploy.sourceStaticSite,
      hintKey: i18nKeys.console.quickDeploy.sourceStaticSiteHint,
      icon: Package,
      defaultSourceKind: "static-site",
    },
    {
      key: "blueprint",
      labelKey: i18nKeys.console.quickDeploy.sourceBlueprint,
      hintKey: i18nKeys.console.quickDeploy.sourceBlueprintHint,
      icon: Package,
      defaultSourceKind: "blueprint",
    },
  ];
  const gitSourceOptions = sourceOptions.filter((option) =>
    ["github", "remote-git"].includes(option.key),
  );
  const dockerSourceOptions = sourceOptions.filter((option) =>
    ["dockerfile", "docker-image", "compose"].includes(option.key),
  );

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
      staleTime: 30_000,
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
  const integrationsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["integrations"],
      queryFn: () => orpcClient.integrations.list(),
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
      name: browser ? (page.url.searchParams.get("serverName") ?? "") : "",
      host: browser ? (page.url.searchParams.get("serverHost") ?? "") : "",
      port: browser ? (page.url.searchParams.get("serverPort") ?? "") : "",
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
  let staticPublishTarget = $state<StaticPublishTarget>(
    parseStaticPublishTarget(browser ? page.url.searchParams.get("staticPublishTarget") : null),
  );
  let staticArtifactFiles = $state<File[]>([]);
  let selectedBlueprintSourceExtensionKey = $state(
    browser ? (page.url.searchParams.get("sourceExtension") ?? "") : "",
  );
  let selectedBlueprintSlug = $state(browser ? (page.url.searchParams.get("blueprintSlug") ?? "") : "");
  let selectedBlueprintTitle = $state(browser ? (page.url.searchParams.get("blueprintTitle") ?? "") : "");
  let selectedBlueprintVariant = $state(
    browser ? (page.url.searchParams.get("blueprintVariant") ?? "") : "",
  );
  let blueprintDependencyProvisioningDrafts = $state<
    Record<string, BlueprintDependencyProvisioningDraft>
  >({});
  let blueprintSelectorDialogOpen = $state(false);
  let blueprintDetailDialogOpen = $state(false);
  let blueprintDetailSlug = $state("");
  let blueprintDetailTitle = $state("");
  let lastBlueprintVariantForProvisioning = $state("");
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
    mutationFn: (input: CreateEnvironmentInput) => orpcClient.environments.create(input),
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
  const publishStaticArtifactPayloadMutation = createMutation(() => ({
    mutationFn: (input: PublishStaticArtifactPayloadInput) =>
      orpcClient.staticArtifacts.publishPayload(input),
  }));
  const publishStaticArtifactArchiveMutation = createMutation(() => ({
    mutationFn: (input: PublishStaticArtifactArchiveInput) =>
      orpcClient.staticArtifacts.publishArchive(input),
  }));
  const resourcesQuery = createQuery(() =>
    queryOptions({
      queryKey: [
        "resources",
        selectedProjectId,
        environmentContextEnabled ? selectedEnvironmentId : "",
        { limit: defaultConsoleListLimit },
      ],
      queryFn: () =>
        orpcClient.resources.list({
          ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
          ...(environmentContextEnabled && selectedEnvironmentId
            ? { environmentId: selectedEnvironmentId }
            : {}),
          limit: defaultConsoleListLimit,
        }),
      enabled: browser && enabled,
    }),
  );
  const sshCredentialsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["credentials", "ssh", { limit: defaultConsoleListLimit }],
      queryFn: () => orpcClient.credentials.ssh.list({ limit: defaultConsoleListLimit }),
      enabled: browser && enabled,
    }),
  );

  const authSession = $derived(authSessionQuery.data ?? defaultAuthSession);
  const projects = $derived((projectsQuery.data?.items ?? []) as ProjectSummary[]);
  const servers = $derived((serversQuery.data?.items ?? []) as ServerSummary[]);
  const environments = $derived((environmentsQuery.data?.items ?? []) as EnvironmentSummary[]);
  const resources = $derived((resourcesQuery.data?.items ?? []) as ResourceSummary[]);
  const integrations = $derived((integrationsQuery.data?.items ?? []) as IntegrationDescriptor[]);
  const githubIntegration = $derived(
    integrations.find((integration) => integration.key === "github") ?? null,
  );
  const githubConnectionMode = $derived.by(() => {
    const modes = githubIntegration?.connectionModes ?? [];
    const defaultModeKey = githubIntegration?.defaultConnectionModeKey;

    return modes.find((mode) => mode.key === defaultModeKey) ?? modes[0] ?? null;
  });
  const githubUsesHostedProviderApp = $derived(githubConnectionMode?.key === "hosted-provider-app");
  const githubHostedProviderAppConfigured = $derived(
    githubIntegration?.configuration?.status === "configured",
  );
  const githubAppConfigurationDiagnostics = $derived(
    githubIntegration?.configuration?.diagnostics ?? [],
  );
  const githubAppConnectionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["integrations", "github", "app-connection"],
      queryFn: () => orpcClient.integrations.github.appConnection.show({}),
      enabled:
        browser &&
        enabled &&
        sourceKind === "github" &&
        githubUsesHostedProviderApp &&
        Boolean(authSessionQuery.data) &&
        (!authSession.loginRequired || Boolean(authSession.session)),
    }),
  );
  const githubAppConnection = $derived(githubAppConnectionQuery.data ?? null);
  const githubAppConnected = $derived(Boolean(githubAppConnection?.connected));
  const githubAppInstallUrl = $derived(
    githubAppConnection?.installUrl ?? githubIntegration?.setup?.providerApp?.installUrl ?? "",
  );
  const githubAppAccountLabel = $derived.by(() => {
    const login = githubAppConnection?.accountLogin;
    if (!login) {
      return null;
    }

    const accountType = githubAppConnection?.accountType;
    return accountType ? `${login} · ${accountType}` : login;
  });
  const githubAppRepositoryAccessLabel = $derived.by(() => {
    const selection = githubAppConnection?.repositoriesSelection;
    if (selection === "all") {
      return $t(i18nKeys.console.quickDeploy.githubAppRepositoryAccessAll);
    }
    if (selection === "selected") {
      const count = githubAppConnection?.repositoryCount;
      return count === undefined
        ? $t(i18nKeys.console.quickDeploy.githubAppRepositoryAccessSelected)
        : $t(i18nKeys.console.quickDeploy.githubAppRepositoryAccessSelectedCount, {
            count: String(count),
          });
    }

    return $t(i18nKeys.console.quickDeploy.githubAppRepositoryAccessUnknown);
  });
  function githubAppDiagnosticMessage(diagnostic: GitHubAppConfigurationDiagnostic): string {
    switch (diagnostic.code) {
      case "cloud-github-app-env-missing":
        return $t(i18nKeys.console.quickDeploy.githubAppDiagnosticEnvMissing);
      case "cloud-github-app-private-key-base64-invalid":
        return $t(i18nKeys.console.quickDeploy.githubAppDiagnosticPrivateKeyInvalid);
      case "cloud-github-app-url-invalid":
        return $t(i18nKeys.console.quickDeploy.githubAppDiagnosticUrlInvalid);
      case "cloud-github-app-permissions-review-pending":
        return $t(i18nKeys.console.quickDeploy.githubAppDiagnosticPermissionsPending);
      case "cloud-github-app-installation-smoke-pending":
        return $t(i18nKeys.console.quickDeploy.githubAppDiagnosticInstallationSmokePending);
      default:
        return diagnostic.message;
    }
  }
  const githubRepositoryBrowsingEnabled = $derived.by(() => {
    if (githubUsesHostedProviderApp) {
      return githubHostedProviderAppConfigured && githubAppConnected;
    }

    return Boolean(githubProvider?.configured) && Boolean(githubProvider?.connected);
  });
  const showSourceBuildSettings = $derived.by(() => {
    if (
      sourceKind === "docker-image" ||
      sourceKind === "compose" ||
      sourceKind === "blueprint" ||
      sourceKind === "static-site"
    ) {
      return false;
    }

    if (sourceKind === "github" && githubSourceMode === "browser") {
      return Boolean(selectedGitHubRepository);
    }

    return true;
  });
  const staticPublishesToManaged = $derived(
    sourceKind === "static-site" && staticPublishTarget === "managed",
  );
  const serverRequiredForQuickDeploy = $derived(!staticPublishesToManaged);
  const staticArtifactSummary = $derived.by(() => {
    if (staticArtifactFiles.length === 0) {
      return $t(i18nKeys.console.quickDeploy.staticUploadEmpty);
    }

    const totalBytes = staticArtifactFiles.reduce((sum, file) => sum + file.size, 0);
    return $t(i18nKeys.console.quickDeploy.staticUploadSummary, {
      count: String(staticArtifactFiles.length),
      size: formatFileSize(totalBytes),
    });
  });
  const sourceBaseDirectoryLabel = $derived.by(() =>
    sourceKind === "github" && githubSourceMode === "browser"
      ? $t(i18nKeys.console.quickDeploy.repositoryBaseDirectory)
      : $t(i18nKeys.console.quickDeploy.sourceBaseDirectory),
  );
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
  const selectedBlueprintVariantOptions = $derived(selectedBlueprintDetail?.install.variants ?? []);
  const selectedBlueprintVariantDefinition = $derived(
    selectedBlueprintManifest && selectedBlueprintVariant
      ? selectedBlueprintManifest.variants?.[selectedBlueprintVariant]
      : undefined,
  );
  const selectedBlueprintEffectiveManifest = $derived.by(() =>
    selectedBlueprintManifest
      ? resolveEffectiveBlueprintManifest(selectedBlueprintManifest, selectedBlueprintVariant)
      : null,
  );
  const selectedBlueprintUpgrade = $derived(
    selectedBlueprintVariantDefinition?.upgrade ??
      selectedBlueprintDetail?.install.upgrade ??
      selectedBlueprintManifest?.upgrade,
  );
  const selectedBlueprintVariables = $derived(
    selectedBlueprintEffectiveManifest?.components.flatMap((component) => component.variables) ??
      [],
  );
  const selectedBlueprintPrimaryComponent = $derived(
    selectedBlueprintEffectiveManifest?.components[0] ?? null,
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
    selectedBlueprintEffectiveManifest?.resources.flatMap(
      (resource): BlueprintDependencyRequirement[] =>
        isProvisionableDependencyKind(resource.kind)
          ? [
              {
                id: resource.id,
                kind: resource.kind,
                label: resource.label,
                capabilities: resource.capabilities ?? [],
                ...(resource.optional ? { optional: resource.optional } : {}),
              },
            ]
          : [],
    ) ?? [],
  );
  const selectedBlueprintUnsupportedDependencies = $derived(
    selectedBlueprintEffectiveManifest?.resources.filter(
      (resource) => !isProvisionableDependencyKind(resource.kind),
    ) ?? [],
  );

  $effect(() => {
    if (!selectedBlueprintDetail) {
      return;
    }

    const fallbackVariant =
      selectedBlueprintDetail.install.defaultVariant ??
      selectedBlueprintVariantOptions[0]?.id ??
      "";
    const variantIsValid = selectedBlueprintVariantOptions.some(
      (variant) => variant.id === selectedBlueprintVariant,
    );
    const nextVariant = selectedBlueprintVariant
      ? variantIsValid
        ? selectedBlueprintVariant
        : fallbackVariant
      : fallbackVariant;

    if (nextVariant !== selectedBlueprintVariant) {
      selectedBlueprintVariant = nextVariant;
      return;
    }

    if (lastBlueprintVariantForProvisioning && lastBlueprintVariantForProvisioning !== nextVariant) {
      blueprintDependencyProvisioningDrafts = {};
    }
    lastBlueprintVariantForProvisioning = nextVariant;
  });
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
  const loginRequired = $derived(authSession.loginRequired && !authSession.session);
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
      publishStaticArtifactPayloadMutation.isPending ||
      publishStaticArtifactArchiveMutation.isPending ||
      dependencyProvisioningInFlight ||
      deploymentCreateInFlight,
  );
  const sourceLocator = $derived.by(() => {
    switch (sourceKind) {
      case "github":
        return githubLocator.trim();
      case "blueprint":
        return selectedBlueprintSourceExtension?.key ?? "";
      case "dockerfile":
        return localFolderLocator.trim();
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
      case "dockerfile":
        return ".";
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
  const selectedSourceGroupKey = $derived(sourceGroupForSourceKind(sourceKind));
  const selectedBlueprintSourceLocked = $derived(
    sourceKind === "blueprint" && Boolean(selectedBlueprintSlug.trim()),
  );
  const selectedBlueprintDisplayTitle = $derived.by(
    () =>
      selectedBlueprintListing?.title ||
      selectedBlueprintTitle.trim() ||
      selectedBlueprintSlug.trim() ||
      $t(i18nKeys.console.quickDeploy.sourceBlueprint),
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

    if (sourceKind === "static-site") {
      return staticArtifactSummary;
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
          icon: selectedBlueprintValue ? "blueprint" : undefined,
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
        ...(selectedBlueprintVariant
          ? [
              {
                label: "部署方案",
                value: selectedBlueprintVariantLabel(),
              },
            ]
          : []),
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

    if (sourceKind === "dockerfile") {
      return [
        {
          label: $t(i18nKeys.console.quickDeploy.sourceDockerfileContext),
          value: sourceSummary,
          mono: true,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.dockerfilePath),
          value: resourceDockerfilePath.trim() || "Dockerfile",
          mono: true,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.sourceAccess),
          value: $t(i18nKeys.console.quickDeploy.sourceAccessDockerfile),
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
          label: $t(i18nKeys.console.quickDeploy.staticUploadFiles),
          value: staticArtifactSummary,
        },
        {
          label: $t(i18nKeys.console.quickDeploy.staticPublishTarget),
          value: $t(
            staticPublishTarget === "managed"
              ? i18nKeys.console.quickDeploy.staticPublishTargetManaged
              : i18nKeys.console.quickDeploy.staticPublishTargetServer,
          ),
        },
        {
          label: $t(i18nKeys.console.quickDeploy.sourceAccess),
          value: $t(i18nKeys.console.quickDeploy.sourceAccessStaticSite),
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
    if (staticPublishesToManaged) {
      return $t(i18nKeys.console.quickDeploy.staticNoServerRequired);
    }

    if (serverMode === "existing") {
      return selectedServer ? `${selectedServer.name} · ${selectedServer.host}` : "未选择服务器";
    }

    return serverDraft.name.trim() && serverDraft.host.trim()
      ? `${serverDraft.name.trim()} · ${serverDraft.host.trim()}`
      : "待创建服务器";
  });
  const serverCredentialSummary = $derived.by(() => {
    if (staticPublishesToManaged) {
      return $t(i18nKeys.console.quickDeploy.staticNoServerRequired);
    }

    if (serverMode === "existing") {
      if (!selectedServer?.credential) {
        return "未配置 SSH 凭据";
      }

      return selectedServer.credential.kind === "ssh-private-key"
        ? `SSH 私钥${selectedServer.credential.username ? ` · ${selectedServer.credential.username}` : ""}`
        : `本机 SSH agent${selectedServer.credential.username ? ` · ${selectedServer.credential.username}` : ""}`;
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
      if (staticPublishesToManaged) {
        return `${inferredResourceInput.name} · static-site · ${$t(i18nKeys.console.quickDeploy.staticPublishTargetManaged)}`;
      }

      return defaultResourceSummary;
    }

    if (resourceMode === "existing") {
      return selectedResource
        ? `${selectedResource.name} · ${selectedResource.kind}`
        : "未选择资源";
    }

    if (staticPublishesToManaged) {
      return `${editedResourceInput.name} · static-site · ${$t(i18nKeys.console.quickDeploy.staticPublishTargetManaged)}`;
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
    const configuredVariables = [
      ...(sourceKind === "blueprint"
        ? selectedBlueprintVariables.map((variable) => ({
            key: variable.key,
            kind: "plain-config",
          }))
        : []),
      ...(variableContextEnabled && variableKey.trim()
        ? [
            {
              key: variableKey.trim(),
              kind: variableIsSecret ? "secret" : "plain-config",
            },
          ]
        : []),
    ];

    if (configuredVariables.length === 0) {
      return "未配置变量";
    }

    if (configuredVariables.length === 1) {
      const [variable] = configuredVariables;
      return `已配置 1 项 · ${variable.key} · ${variable.kind}`;
    }

    return `已配置 ${configuredVariables.length} 项`;
  });
  const domainBindingSummary = $derived(
    selectedResourceAccessRoute?.url ?? $t(i18nKeys.console.quickDeploy.domainBindingsAfterDeploy),
  );
  const quickDeployGitHubReturnPath =
    "/deploy?source=github&githubMode=browser&step=source";
  const quickDeployGitHubReturnPathEncoded = encodeURIComponent(quickDeployGitHubReturnPath);
  const canAdvance = $derived(stepIsComplete(activeStep));
  const quickDeployReady = $derived(
    stepIsComplete("source") &&
      stepIsComplete("project") &&
      (!serverRequiredForQuickDeploy || stepIsComplete("server")),
  );
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
      queryKey: [
        "integrations",
        "github",
        githubConnectionMode?.key ?? "user-oauth",
        "repositories",
        githubRepositorySearch.trim(),
      ],
      queryFn: () =>
        orpcClient.integrations.github.repositories.list({
          ...(githubRepositorySearch.trim() ? { search: githubRepositorySearch.trim() } : {}),
        }),
      enabled:
        browser &&
        enabled &&
        sourceKind === "github" &&
        githubSourceMode === "browser" &&
        githubRepositoryBrowsingEnabled,
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
    if (value === "local-folder") {
      return "dockerfile";
    }

    return sourceKindKeys.includes(value as SourceKind) ? (value as SourceKind) : "github";
  }

  function parseDeploymentStep(value: string | null): DeploymentStepKey {
    return deploymentStepKeys.includes(value as DeploymentStepKey)
      ? (value as DeploymentStepKey)
      : "source";
  }

  function parseGithubSourceMode(value: string | null): GithubSourceMode {
    return githubSourceModes.includes(value as GithubSourceMode) ? (value as GithubSourceMode) : "url";
  }

  function parseStaticPublishTarget(value: string | null): StaticPublishTarget {
    return value === "server" ? "server" : "managed";
  }

  function parseDraftMode(value: string | null): DraftMode {
    return draftModeKeys.includes(value as DraftMode) ? (value as DraftMode) : "existing";
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

  function effectiveResourceInternalPortText(): string {
    const requestedPort = resourceInternalPort.trim();
    if (createsStaticSiteResource && (!requestedPort || requestedPort === "3000")) {
      return resourceInternalPortDefault;
    }

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
        capabilities: requirement.capabilities,
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
          capabilities: [...requirement.capabilities],
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
        capabilities: [...requirement.capabilities],
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
        ...(selectedBlueprintVariant ? { blueprintVariant: selectedBlueprintVariant } : {}),
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

  function resolveEffectiveBlueprintManifest(
    baseManifest: BlueprintDetailResponse["manifest"],
    variantId: string,
  ): BlueprintDetailResponse["manifest"] {
    const variant = variantId ? baseManifest.variants?.[variantId] : undefined;
    if (!variant) {
      return baseManifest;
    }

    return {
      ...baseManifest,
      summary: variant.summary ?? baseManifest.summary,
      description: variant.description ?? baseManifest.description,
      parameters: variant.parameters ?? baseManifest.parameters,
      secrets: variant.secrets ?? baseManifest.secrets,
      resources: variant.resources ?? baseManifest.resources,
      components: variant.components ?? baseManifest.components,
      defaultVariant: variantId,
      upgrade: variant.upgrade ?? baseManifest.upgrade,
    };
  }

  function selectedBlueprintVariantLabel(): string {
    if (!selectedBlueprintVariant) {
      return "默认方案";
    }
    return (
      selectedBlueprintVariantOptions.find((variant) => variant.id === selectedBlueprintVariant)
        ?.label ??
      selectedBlueprintVariantDefinition?.label ??
      selectedBlueprintVariant
    );
  }

  function blueprintUpgradeSummary(upgrade: BlueprintUpgradePolicy | undefined): string {
    if (!upgrade) {
      return "未声明升级策略";
    }

    return [
      upgrade.strategy,
      upgrade.steps?.[0]?.classification ?? "non-breaking",
      upgrade.destructive ? "可能破坏性" : "非破坏性",
      upgrade.steps?.some((step) => step.requiresManualReview) ? "需要确认" : "",
    ]
      .filter(Boolean)
      .join(" · ");
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
      selectedBlueprintVariant = "";
      blueprintDependencyProvisioningDrafts = {};
    }
  }

  function applyBlueprintListing(item: BlueprintCatalogListing): void {
    if (selectedBlueprintSlug !== item.slug) {
      blueprintDependencyProvisioningDrafts = {};
    }
    selectedBlueprintSlug = item.slug;
    selectedBlueprintTitle = item.title;
    selectedBlueprintVariant = item.defaultVariant ?? item.variants?.[0]?.id ?? "";
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
    const visibleVariant = selectedBlueprintVariant;
    applyBlueprintListing(selectedBlueprintListing);
    if (visibleVariant) {
      selectedBlueprintVariant = visibleVariant;
    }
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
      sourceKind === "blueprint" || sourceKind === "static-site" ? "" : sourceLocator,
      sourceKind === "local-folder" || sourceKind === "dockerfile"
        ? "."
        : "",
    );

    if (sourceKind === "static-site") {
      setSearchParam(params, "staticPublishTarget", staticPublishTarget, "managed");
    }

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
      setSearchParam(params, "blueprintVariant", selectedBlueprintVariant);
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
    setSearchParam(params, "serverName", serverDraft.name);
    setSearchParam(params, "serverHost", serverDraft.host);
    setSearchParam(params, "serverPort", serverDraft.port);
    setSearchParam(params, "serverProvider", null);

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
    serverDraft.name = params.get("serverName") ?? "";
    serverDraft.host = params.get("serverHost") ?? "";
    serverDraft.port = params.get("serverPort") ?? "";
    serverDraft.providerKey = sshServerProviderKey;
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
    resourceInternalPort =
      params.get("resourceInternalPort") ??
      (nextSourceKind === "static-site" || resourceKind === "static-site" ? "80" : "3000");
    staticPublishDirectory = params.get("staticPublishDirectory") ?? "/dist";
    staticInstallCommand = params.get("staticInstallCommand") ?? "";
    staticBuildCommand = params.get("staticBuildCommand") ?? "";
    staticPublishTarget = parseStaticPublishTarget(params.get("staticPublishTarget"));
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
    selectedBlueprintVariant = params.get("blueprintVariant") ?? "";

    localFolderLocator = nextSourceKind === "local-folder" || nextSourceKind === "dockerfile" ? nextSourceLocator || "." : localFolderLocator;
    githubLocator = nextSourceKind === "github" ? nextSourceLocator : githubLocator;
    remoteGitLocator = nextSourceKind === "remote-git" ? nextSourceLocator : remoteGitLocator;
    dockerImageLocator = nextSourceKind === "docker-image" ? nextSourceLocator : dockerImageLocator;
    composeLocator = nextSourceKind === "compose" ? nextSourceLocator : composeLocator;
    staticSiteLocator = nextSourceKind === "static-site" ? "." : staticSiteLocator;
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
      case "dockerfile":
        localFolderLocator = value;
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
    if (
      kind === "github" &&
      (githubUsesHostedProviderApp || githubConnected) &&
      !githubLocator.trim()
    ) {
      githubSourceMode = "browser";
      githubSourceModeTouched = false;
    }
    if (kind === "blueprint" && !selectedBlueprintSourceExtensionKey) {
      selectedBlueprintSourceExtensionKey = selectedBlueprintSourceExtension?.key ?? "";
    }
    if (kind === "dockerfile" && !resourceDockerfilePath.trim()) {
      resourceDockerfilePath = "Dockerfile";
    }
  }

  function selectSourceGroup(group: {
    key: SourceGroupKey;
    defaultSourceKind: SourceKind;
  }): void {
    const currentGroup = sourceGroupForSourceKind(sourceKind);
    selectSourceKind(currentGroup === group.key ? sourceKind : group.defaultSourceKind);
  }

  function sourceGroupForSourceKind(kind: SourceKind): SourceGroupKey {
    if (kind === "github" || kind === "remote-git") {
      return "git";
    }
    if (
      kind === "dockerfile" ||
      kind === "docker-image" ||
      kind === "compose" ||
      kind === "local-folder"
    ) {
      return "docker";
    }
    if (kind === "blueprint") {
      return "blueprint";
    }
    return "static-site";
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
      case "dockerfile":
        return withBaseDirectory({
          kind: "local-folder",
          locator,
        });
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
      case "dockerfile":
        return withHealthCheckPath({
          strategy: "dockerfile",
          ...(resourceInstallCommand.trim() ? { installCommand: resourceInstallCommand.trim() } : {}),
          ...(resourceBuildCommand.trim() ? { buildCommand: resourceBuildCommand.trim() } : {}),
          ...(resourceStartCommand.trim() ? { startCommand: resourceStartCommand.trim() } : {}),
          ...(resourceDockerfilePath.trim()
            ? { dockerfilePath: resourceDockerfilePath.trim() }
            : { dockerfilePath: "Dockerfile" }),
          ...(resourceBuildTarget.trim() ? { buildTarget: resourceBuildTarget.trim() } : {}),
        });
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

        if (sourceKind === "static-site") {
          return staticArtifactFiles.length > 0;
        }

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
        if (!serverRequiredForQuickDeploy) {
          return true;
        }

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
      if (githubUsesHostedProviderApp) {
        if (loginRequired) {
          deployFeedback = {
            kind: "error",
            title: $t(i18nKeys.console.quickDeploy.githubInstallApp),
            detail: $t(i18nKeys.console.quickDeploy.githubAppLoginRequired),
          };
          return;
        }

        if (githubHostedProviderAppConfigured && githubAppInstallUrl && browser) {
          const url = new URL(githubAppInstallUrl);
          const state = buildDeployStateUrl();
          state.searchParams.set("source", "github");
          state.searchParams.set("githubMode", "browser");
          state.searchParams.set("step", "source");
          url.searchParams.set("state", state.toString());
          window.location.href = url.toString();
          return;
        }

        deployFeedback = {
          kind: "error",
          title: $t(i18nKeys.common.actions.connectGitHub),
          detail: $t(i18nKeys.console.quickDeploy.githubHostedProviderAppSetupPending),
        };
        return;
      }

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

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const units = ["KB", "MB", "GB"] as const;
    let value = bytes / 1024;
    for (const unit of units) {
      if (value < 1024 || unit === "GB") {
        return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`;
      }
      value /= 1024;
    }

    return `${bytes} B`;
  }

  function handleStaticArtifactFileSelection(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    staticArtifactFiles = Array.from(input.files ?? []);
  }

  function staticArtifactFilePath(file: File): string {
    const path =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath?.trim() ||
      file.name.trim();
    return path.replaceAll("\\", "/").replace(/^\/+/, "") || "index.html";
  }

  function isStaticArtifactZipArchive(file: File): boolean {
    return file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("无法读取上传文件。"));
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const [, base64 = ""] = result.split(",", 2);
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });
  }

  async function ensureQuickDeployProjectId(): Promise<string> {
    if (projectMode === "existing") {
      if (!selectedProjectId) {
        throw new Error("请选择或创建一个项目。");
      }
      return selectedProjectId;
    }

    const nextProjectName =
      projectName.trim() || (projects.length === 0 ? "Local Workspace" : "");
    if (!nextProjectName) {
      throw new Error("请填写项目名。");
    }

    const createdProject = await createProjectMutation.mutateAsync({
      name: nextProjectName,
      ...(projectDescription.trim() ? { description: projectDescription.trim() } : {}),
    });
    selectedProjectId = createdProject.id;
    await projectsQuery.refetch();
    return createdProject.id;
  }

  async function ensureQuickDeployEnvironmentId(projectId: string): Promise<string> {
    if (environmentContextEnabled && environmentMode === "existing") {
      if (!selectedEnvironmentId) {
        throw new Error("请选择或创建一个环境。");
      }
      return selectedEnvironmentId;
    }

    if (environmentContextEnabled) {
      if (!environmentName.trim()) {
        throw new Error("请填写环境名。");
      }
      const createdEnvironment = await createEnvironmentMutation.mutateAsync({
        projectId,
        name: environmentName.trim(),
        kind: environmentKind,
      });
      selectedEnvironmentId = createdEnvironment.id;
      await environmentsQuery.refetch();
      return createdEnvironment.id;
    }

    const existingEnvironment =
      environments.find(
        (environment) =>
          environment.projectId === projectId &&
          environment.name === "local" &&
          environment.kind === "local",
      ) ?? environments.find((environment) => environment.projectId === projectId);
    if (existingEnvironment) {
      selectedEnvironmentId = existingEnvironment.id;
      return existingEnvironment.id;
    }

    const createdEnvironment = await createEnvironmentMutation.mutateAsync({
      projectId,
      name: environmentName.trim() || "local",
      kind: environmentKind,
    });
    selectedEnvironmentId = createdEnvironment.id;
    await environmentsQuery.refetch();
    return createdEnvironment.id;
  }

  async function ensureStaticPublishServerId(): Promise<string | undefined> {
    if (staticPublishTarget === "managed") {
      return undefined;
    }

    if (serverMode === "existing") {
      if (!selectedServerId) {
        throw new Error("请选择或创建一个服务器。");
      }
      return selectedServerId;
    }

    const registerInput = createRegisterServerInput(serverDraft);
    if (!registerInput) {
      throw new Error($t(i18nKeys.console.servers.createValidationError));
    }

    if (!isServerRegistrationDraftComplete(serverDraft, sshCredentials)) {
      throw new Error($t(i18nKeys.console.servers.createCredentialValidationError));
    }

    const createdServer = await registerServerMutation.mutateAsync(registerInput);
    selectedServerId = createdServer.id;
    const credential = createQuickDeployServerCredential(serverDraft, sshCredentials);

    if (credential?.mode === "create-ssh-and-configure") {
      const createdCredential = await createSshCredentialMutation.mutateAsync(credential.input);
      serverDraft.selectedSshCredentialId = createdCredential.id;
      await sshCredentialsQuery.refetch();
      await configureServerCredentialMutation.mutateAsync({
        serverId: createdServer.id,
        credential: {
          kind: "stored-ssh-private-key",
          credentialId: createdCredential.id,
          ...(credential.input.username ? { username: credential.input.username } : {}),
        },
      });
    } else if (credential?.mode === "configure") {
      await configureServerCredentialMutation.mutateAsync({
        serverId: createdServer.id,
        credential: credential.credential,
      });
    }

    await serversQuery.refetch();
    return createdServer.id;
  }

  async function ensureStaticSiteResourceId(
    projectId: string,
    environmentId: string,
    serverId?: string,
  ): Promise<string> {
    if (resourceContextEnabled && resourceMode === "existing") {
      if (!selectedResourceId) {
        throw new Error("请选择资源，或切换为新建资源。");
      }
      return selectedResourceId;
    }

    const input = resourceContextEnabled ? editedResourceInput : inferredResourceInput;
    const name = input.name.trim() || "static-site";
    const createdResource = await createResourceMutation.mutateAsync({
      projectId,
      environmentId,
      ...(serverId ? { destinationId: serverId } : {}),
      name,
      kind: "static-site",
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      runtimeProfile: {
        strategy: "static",
        publishDirectory: "/",
      },
    });
    selectedResourceId = createdResource.id;
    await resourcesQuery.refetch();
    return createdResource.id;
  }

  async function publishUploadedStaticSite(): Promise<void> {
    if (staticArtifactFiles.length === 0) {
      throw new Error($t(i18nKeys.console.quickDeploy.staticUploadRequired));
    }

    const projectId = await ensureQuickDeployProjectId();
    const environmentId = await ensureQuickDeployEnvironmentId(projectId);
    const serverId = await ensureStaticPublishServerId();
    const resourceId = await ensureStaticSiteResourceId(projectId, environmentId, serverId);
    const metadata = {
      source: "quick-deploy",
      publishTarget: staticPublishTarget,
    };
    const singleUploadedFile =
      staticArtifactFiles.length === 1 ? staticArtifactFiles[0] : undefined;
    const publication =
      singleUploadedFile && isStaticArtifactZipArchive(singleUploadedFile)
        ? await publishStaticArtifactArchiveMutation.mutateAsync({
            projectId,
            resourceId,
            archiveBase64: await fileToBase64(singleUploadedFile),
            promoteAlias: true,
            metadata,
          })
        : await publishStaticArtifactPayloadMutation.mutateAsync({
            projectId,
            resourceId,
            promoteAlias: true,
            metadata,
            files: await Promise.all(
              staticArtifactFiles.map(async (file) => ({
                path: staticArtifactFilePath(file),
                mimeType: file.type || "application/octet-stream",
                contentBase64: await fileToBase64(file),
              })),
            ),
          });

    selectedProjectId = publication.projectId;
    selectedEnvironmentId = environmentId;
    selectedResourceId = publication.resourceId;
    lastAccessUrl = publication.routeUrl ?? "";
    await refreshWorkspaceData();
    deployFeedback = {
      kind: "success",
      title: $t(i18nKeys.console.quickDeploy.staticDeployFeedbackSuccessTitle),
      detail:
        publication.routeUrl ??
        $t(i18nKeys.console.quickDeploy.staticPublicationIdDetail, {
          publicationId: publication.publicationId,
        }),
    };
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
                  ...(item.capabilities && item.capabilities.length > 0
                    ? { capabilities: item.capabilities }
                    : {}),
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
                  ...(item.capabilities && item.capabilities.length > 0
                    ? { capabilities: item.capabilities }
                    : {}),
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
      if (sourceKind === "static-site") {
        await publishUploadedStaticSite();
        return;
      }

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
                ...(selectedBlueprintVariant ? { variant: selectedBlueprintVariant } : {}),
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

<div class="grid min-w-0 gap-5 pb-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
  <div class="min-w-0 space-y-5">
      <div class="min-w-0 space-y-6">
        <div class="space-y-2">
          <h2 class="text-lg font-semibold">部署入口</h2>
          <p class="text-sm text-muted-foreground">
            {selectedBlueprintSourceLocked
              ? "已从蓝图市场选择应用，在同一页确认项目、服务器与运行配置。"
              : "选择来源，并在同一页确认项目、服务器与运行配置。"}
          </p>
        </div>
        <div class="space-y-6">
          <section class="space-y-3">
          <div class="space-y-3">
            {#if !selectedBlueprintSourceLocked}
              <div class="flex items-center gap-2 text-sm font-medium">
                <Waypoints class="size-4 text-muted-foreground" />
                <span>{$t(i18nKeys.common.domain.source)}</span>
                <DocsHelpLink
                  href={quickDeploySourceHelpHref}
                  ariaLabel={$t(i18nKeys.console.quickDeploy.sourceHelpLink)}
                />
              </div>
              <div
                class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
                role="radiogroup"
                aria-label={$t(i18nKeys.common.domain.source)}
              >
                {#each visibleSourceGroups as option (option.key)}
                  <ResourceSourceOption
                    selected={selectedSourceGroupKey === option.key}
                    label={$t(option.labelKey)}
                    description={$t(option.hintKey)}
                    icon={option.icon}
                    onselect={() => {
                      selectSourceGroup(option);
                    }}
                  />
                {/each}
              </div>
            {/if}
            {#if selectedSourceGroupKey === "git" && !selectedBlueprintSourceLocked}
              <div class="space-y-2">
                <p class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.console.quickDeploy.sourceGitMethod)}
                </p>
                <div class="grid gap-2 sm:grid-cols-2">
                  {#each gitSourceOptions as option (option.key)}
                    {@const SourceIcon = option.icon}
                    <Button
                      type="button"
                      variant={sourceKind === option.key ? "selected" : "outline"}
                      class="h-auto justify-start whitespace-normal px-3 py-3 text-left"
                      onclick={() => selectSourceKind(option.key)}
                    >
                      <SourceIcon class="size-4 shrink-0" />
                      <span class="min-w-0">
                        <span class="block text-sm font-medium">{$t(option.labelKey)}</span>
                        <span class="mt-1 block text-xs font-normal text-muted-foreground">
                          {$t(option.hintKey)}
                        </span>
                      </span>
                    </Button>
                  {/each}
                </div>
              </div>
            {:else if selectedSourceGroupKey === "docker" && !selectedBlueprintSourceLocked}
              <div class="space-y-2">
                <p class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.console.quickDeploy.sourceDockerMethod)}
                </p>
                <div class="grid gap-2 sm:grid-cols-3">
                  {#each dockerSourceOptions as option (option.key)}
                    {@const SourceIcon = option.icon}
                    <Button
                      type="button"
                      variant={sourceKind === option.key ? "selected" : "outline"}
                      class="h-auto justify-start whitespace-normal px-3 py-3 text-left"
                      onclick={() => selectSourceKind(option.key)}
                    >
                      <SourceIcon class="size-4 shrink-0" />
                      <span class="min-w-0">
                        <span class="block text-sm font-medium">{$t(option.labelKey)}</span>
                        <span class="mt-1 block text-xs font-normal text-muted-foreground">
                          {$t(option.hintKey)}
                        </span>
                      </span>
                    </Button>
                  {/each}
                </div>
              </div>
            {/if}
            {#if sourceKind === "github"}
              <div class="space-y-3">
                <div class="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={githubSourceMode === "url" ? "selected" : "outline"}
                    class="h-auto justify-start whitespace-normal px-3 py-3 text-left"
                    data-github-public-url-mode
                    onclick={() => selectGithubSourceMode("url")}
                  >
                    <GitFork class="size-4 shrink-0" />
                    <span class="min-w-0">
                      <span class="block text-sm font-medium">
                        {$t(i18nKeys.console.quickDeploy.githubSourceUrlMode)}
                      </span>
                      <span class="mt-1 block text-xs font-normal text-muted-foreground">
                        {$t(i18nKeys.console.quickDeploy.githubSourceUrlModeHint)}
                      </span>
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={githubSourceMode === "browser" ? "selected" : "outline"}
                    class="h-auto justify-start whitespace-normal px-3 py-3 text-left"
                    onclick={() => selectGithubSourceMode("browser")}
                  >
                    <GitHubIcon class="size-4 shrink-0" />
                    <span class="min-w-0">
                      <span class="block text-sm font-medium">
                        {$t(i18nKeys.console.quickDeploy.githubSourceBrowserMode)}
                      </span>
                      <span class="mt-1 block text-xs font-normal text-muted-foreground">
                        {githubUsesHostedProviderApp
                          ? $t(i18nKeys.console.quickDeploy.githubSourceBrowserModeHostedHint)
                          : $t(i18nKeys.console.quickDeploy.githubSourceBrowserModeOAuthHint)}
                      </span>
                    </span>
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
                        <BlueprintProductIcon
                          title={selectedBlueprintDisplayTitle}
                          icon={selectedBlueprintListing?.icon}
                          class="size-10"
                          imageClass="size-6"
                        />
                        <div class="min-w-0">
                          <p class="truncate text-sm font-medium">
                            {selectedBlueprintDisplayTitle}
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
                  {#if selectedBlueprintSlug.trim() && selectedBlueprintVariantOptions.length > 0}
                    <label class="block space-y-1.5">
                      <span class="text-xs font-medium text-muted-foreground">部署方案</span>
                      <select
                        class="min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        bind:value={selectedBlueprintVariant}
                      >
                        {#each selectedBlueprintVariantOptions as variant (variant.id)}
                          <option value={variant.id}>{variant.label ?? variant.id}</option>
                        {/each}
                      </select>
                      <span class="block text-xs leading-5 text-muted-foreground">
                        {selectedBlueprintVariantDefinition?.summary ??
                          "选择同一 Blueprint 的不同依赖资源或运行配置。"}
                      </span>
                    </label>
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
                                  >
                                    <span
                                      class="dependency-kind-logo"
                                      role="img"
                                      aria-label={icon.title}
                                    >
                                      {@html icon.svg}
                                    </span>
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
                  {#if quickDeploySourceExtensions.length > 1 && !selectedBlueprintSourceLocked}
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
                  {:else if selectedBlueprintSourceExtension && !selectedBlueprintSourceLocked}
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
            {:else if sourceKind === "static-site"}
              <div class="space-y-4" data-static-site-upload-source>
                <div class="grid gap-2 sm:grid-cols-2" data-static-publish-target>
                  <Button
                    type="button"
                    variant={staticPublishTarget === "managed" ? "selected" : "outline"}
                    class="h-auto justify-start whitespace-normal px-3 py-3 text-left"
                    onclick={() => {
                      staticPublishTarget = "managed";
                    }}
                  >
                    <Package class="size-4 shrink-0" />
                    <span class="min-w-0">
                      <span class="block text-sm font-medium">
                        {$t(i18nKeys.console.quickDeploy.staticPublishTargetManaged)}
                      </span>
                      <span class="mt-1 block text-xs font-normal text-muted-foreground">
                        {$t(i18nKeys.console.quickDeploy.staticPublishTargetManagedHint)}
                      </span>
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={staticPublishTarget === "server" ? "selected" : "outline"}
                    class="h-auto justify-start whitespace-normal px-3 py-3 text-left"
                    onclick={() => {
                      staticPublishTarget = "server";
                    }}
                  >
                    <Server class="size-4 shrink-0" />
                    <span class="min-w-0">
                      <span class="block text-sm font-medium">
                        {$t(i18nKeys.console.quickDeploy.staticPublishTargetServer)}
                      </span>
                      <span class="mt-1 block text-xs font-normal text-muted-foreground">
                        {$t(i18nKeys.console.quickDeploy.staticPublishTargetServerHint)}
                      </span>
                    </span>
                  </Button>
                </div>
                <div class="rounded-md border border-dashed bg-muted/20 px-4 py-4">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div class="min-w-0 space-y-1">
                      <label class="flex items-center gap-2 text-sm font-medium" for="static-artifact-upload">
                        <Upload class="size-4 text-muted-foreground" />
                        {$t(i18nKeys.console.quickDeploy.staticUploadFiles)}
                      </label>
                      <p class="text-xs leading-5 text-muted-foreground">
                        {$t(i18nKeys.console.quickDeploy.staticUploadFilesHint)}
                      </p>
                    </div>
                    <Input
                      id="static-artifact-upload"
                      class="sm:max-w-80"
                      type="file"
                      multiple
                      accept=".zip,.html,.css,.js,.mjs,.json,.txt,.svg,.png,.jpg,.jpeg,.webp,.gif,.ico,.woff,.woff2"
                      onchange={handleStaticArtifactFileSelection}
                    />
                  </div>
                  <p class="mt-3 text-xs text-muted-foreground">{staticArtifactSummary}</p>
                </div>
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
            {#if showSourceBuildSettings}
              <div
                class="space-y-2"
                data-source-build-settings
                data-github-repository-scoped-settings={sourceKind === "github" && githubSourceMode === "browser" ? "true" : undefined}
              >
                <label class="text-xs font-medium text-muted-foreground" for="source-base-directory">
                  {sourceBaseDirectoryLabel}
                </label>
                <Input
                  id="source-base-directory"
                  class="font-mono text-xs"
                  bind:value={sourceBaseDirectory}
                  placeholder="apps/web"
                />
              </div>
            {/if}
            {#if sourceKind === "dockerfile"}
              <div class="grid gap-3 sm:grid-cols-2">
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
            {:else if showSourceBuildSettings}
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
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <p class="text-sm font-medium">{$t(i18nKeys.console.quickDeploy.githubRepository)}</p>
                  <p class="text-xs leading-5 text-muted-foreground">
                    {githubUsesHostedProviderApp
                      ? $t(i18nKeys.console.quickDeploy.githubHostedProviderAppHint)
                      : $t(i18nKeys.console.quickDeploy.githubOnlyLoginWhenNeeded)}
                  </p>
                </div>
                {#if githubUsesHostedProviderApp && githubAppConnected}
                  <Badge>{$t(i18nKeys.common.status.connected)}</Badge>
                {:else if githubUsesHostedProviderApp && githubHostedProviderAppConfigured}
                  <Badge>{$t(i18nKeys.common.status.configured)}</Badge>
                {:else if githubUsesHostedProviderApp}
                  <Badge variant="outline">{$t(i18nKeys.common.status.notConfigured)}</Badge>
                {:else if githubConnected}
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

              {#if githubUsesHostedProviderApp && !githubHostedProviderAppConfigured}
                <div class="console-subtle-panel space-y-3 px-3 py-3 text-sm">
                  <div class="flex items-start gap-3">
                    <Settings2 class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div class="min-w-0 space-y-1">
                      <p class="font-medium text-foreground">
                        {$t(i18nKeys.console.quickDeploy.githubAppConfigurationPendingTitle)}
                      </p>
                      <p class="text-xs leading-5 text-muted-foreground">
                        {$t(i18nKeys.console.quickDeploy.githubHostedProviderAppSetupPending)}
                      </p>
                      <p class="text-xs leading-5 text-muted-foreground">
                        {$t(i18nKeys.console.quickDeploy.githubAppConfigurationPendingDescription)}
                      </p>
                    </div>
                  </div>
                  {#if githubAppConfigurationDiagnostics.length > 0}
                    <div class="space-y-2 border-t pt-2">
                      {#each githubAppConfigurationDiagnostics as diagnostic (diagnostic.code)}
                        <div class="space-y-1 border-t pt-2 first:border-t-0 first:pt-0">
                          <p class="text-xs leading-5 text-foreground">
                            {githubAppDiagnosticMessage(diagnostic)}
                          </p>
                          <p class="font-mono text-[0.7rem] leading-4 text-muted-foreground">
                            {$t(i18nKeys.console.quickDeploy.githubAppDiagnosticCode, {
                              code: diagnostic.code,
                            })}
                          </p>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="border-t pt-2 text-xs leading-5 text-muted-foreground">
                      {$t(i18nKeys.console.quickDeploy.githubAppConfigurationDiagnosticsEmpty)}
                    </p>
                  {/if}
                </div>
              {:else if githubUsesHostedProviderApp && loginRequired}
                <div class="console-subtle-panel space-y-3 px-3 py-3 text-sm">
                  <div class="flex items-start gap-3">
                    <ShieldCheck class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div class="min-w-0 space-y-1">
                      <p class="font-medium">
                        {$t(i18nKeys.console.quickDeploy.githubAppLoginRequiredTitle)}
                      </p>
                      <p class="text-xs leading-5 text-muted-foreground">
                        {$t(i18nKeys.console.quickDeploy.githubAppLoginRequired)}
                      </p>
                    </div>
                  </div>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <Button
                      href={`/login?next=${quickDeployGitHubReturnPathEncoded}`}
                      class="sm:w-fit"
                    >
                      <ShieldCheck class="size-4" />
                      {$t(i18nKeys.console.authBootstrap.signIn)}
                    </Button>
                    <Button
                      href={`/sign-up?next=${quickDeployGitHubReturnPathEncoded}`}
                      variant="outline"
                      class="sm:w-fit"
                    >
                      {$t(i18nKeys.console.authSignup.signUpLink)}
                    </Button>
                  </div>
                </div>
              {:else if githubUsesHostedProviderApp && !githubAppConnected}
                <div class="console-subtle-panel space-y-3 px-3 py-3 text-sm" data-github-app-install-panel>
                  <div class="flex items-start gap-3">
                    <GitHubIcon class="mt-0.5 size-4 shrink-0" />
                    <div class="min-w-0 space-y-1">
                      <p class="font-medium">
                        {$t(i18nKeys.console.quickDeploy.githubInstallAppTitle)}
                      </p>
                      <p class="text-xs leading-5 text-muted-foreground">
                        {$t(i18nKeys.console.quickDeploy.githubInstallAppDescription)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    class="w-full sm:w-fit"
                    disabled={!githubAppInstallUrl}
                    data-github-app-install-action
                    onclick={connectGitHub}
                  >
                    <GitHubIcon class="size-4" />
                    {$t(i18nKeys.console.quickDeploy.githubInstallApp)}
                  </Button>
                  {#if githubAppConnectionQuery.isError && !githubAppInstallUrl}
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.quickDeploy.githubHostedProviderAppSetupPending)}
                    </p>
                  {/if}
                </div>
              {:else if !githubUsesHostedProviderApp && !githubProvider?.configured}
                <div class="console-subtle-panel px-3 py-3 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.quickDeploy.githubOAuthNotConfigured)}
                </div>
              {:else if !githubUsesHostedProviderApp && !githubConnected}
                <Button variant="outline" class="w-full" onclick={connectGitHub}>
                  <GitHubIcon class="size-4" />
                  {$t(i18nKeys.common.actions.connectGitHub)}
                </Button>
              {:else}
                <div class="space-y-3">
                  {#if githubUsesHostedProviderApp}
                    <div class="console-subtle-panel space-y-3 px-3 py-3 text-sm" data-github-app-connected-panel>
                      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div class="min-w-0 space-y-1">
                          <p class="font-medium">
                            {githubAppAccountLabel ?? $t(i18nKeys.console.quickDeploy.githubAppConnectedTitle)}
                          </p>
                          <p class="text-xs leading-5 text-muted-foreground">
                            {githubAppRepositoryAccessLabel}
                          </p>
                        </div>
                        {#if githubAppInstallUrl}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            class="sm:shrink-0"
                            data-github-app-configure-action
                            onclick={connectGitHub}
                          >
                            <Wrench class="size-4" />
                            {$t(i18nKeys.console.quickDeploy.githubConfigureApp)}
                          </Button>
                        {/if}
                      </div>
                    </div>
                  {/if}
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
                      <div class="space-y-3 px-2 py-3 text-sm text-muted-foreground" data-github-app-empty-repositories>
                        <p>
                          {githubUsesHostedProviderApp
                            ? $t(i18nKeys.console.quickDeploy.githubNoAppRepositoryResults)
                            : $t(i18nKeys.console.quickDeploy.noRepositoryResults)}
                        </p>
                        {#if githubUsesHostedProviderApp && githubAppInstallUrl}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-github-app-configure-empty-action
                            onclick={connectGitHub}
                          >
                            <Wrench class="size-4" />
                            {$t(i18nKeys.console.quickDeploy.githubChangeRepositoryAccess)}
                          </Button>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          </section>

          <details class="group rounded-md border bg-card px-3 py-3" open={!stepIsComplete("project")}>
            <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
              <span class="min-w-0">
                <span class="block text-sm font-medium">{$t(i18nKeys.common.domain.project)}</span>
                <span class="mt-1 block break-words text-xs text-muted-foreground">{projectSummary}</span>
              </span>
              <ChevronDown class="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
            </summary>
          <div class="mt-3 space-y-3">
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
          </details>

          {#if serverRequiredForQuickDeploy}
          <details class="group rounded-md border bg-card px-3 py-3" open={!stepIsComplete("server")}>
            <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
              <span class="min-w-0">
                <span class="block text-sm font-medium">{$t(i18nKeys.common.domain.server)}</span>
                <span class="mt-1 block break-words text-xs text-muted-foreground">{serverSummary}</span>
                <span class="mt-1 block break-words text-xs text-muted-foreground">{serverCredentialSummary}</span>
              </span>
              <ChevronDown class="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
            </summary>
          <div class="mt-3 space-y-3">
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
                {sshCredentials}
                testConnectivity={testDraftServerConnectivity}
              />
            {/if}
          </div>
          </details>
          {/if}

          <details class="group rounded-md border bg-card px-3 py-3">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
              <span class="min-w-0">
                <span class="block text-sm font-medium">{$t(i18nKeys.common.domain.environment)}</span>
                <span class="mt-1 block break-words text-xs text-muted-foreground">{environmentSummary}</span>
              </span>
              <ChevronDown class="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
            </summary>
          <div class="mt-3 space-y-3">
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
          </details>

          <details
            class="group rounded-md border bg-card px-3 py-3"
            data-quick-deploy-variables-section
            open={variableContextEnabled}
            ontoggle={(event) => {
              variableContextEnabled = event.currentTarget.open;
            }}
          >
            <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
              <span class="min-w-0">
                <span class="block text-sm font-medium">{$t(i18nKeys.common.domain.variables)}</span>
                <span class="mt-1 block break-words text-xs text-muted-foreground">{variableSummary}</span>
              </span>
              <ChevronDown class="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
            </summary>
            <div class="mt-3 space-y-3">
              <Separator />
              <div class="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck class="size-4 text-muted-foreground" />
                <span>{$t(i18nKeys.common.domain.variables)}</span>
                <DocsHelpLink
                  href={webDocsHrefs.environmentVariablePrecedence}
                  ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                />
              </div>
              <div class="space-y-3">
                {#if sourceKind === "blueprint" && selectedBlueprintVariables.length > 0}
                  <div class="space-y-2" data-blueprint-variable-list>
                    {#each selectedBlueprintVariables as variable (`${variable.key}:${variable.value}`)}
                      <div class="grid gap-3 sm:grid-cols-2">
                        <Input
                          value={variable.key}
                          readonly
                          data-blueprint-variable-key={variable.key}
                          aria-label={`Blueprint variable ${variable.key}`}
                        />
                        <Input
                          value={variable.value}
                          readonly
                          data-blueprint-variable-value={variable.key}
                          aria-label={`Blueprint variable value ${variable.key}`}
                        />
                      </div>
                      {#if variable.description}
                        <p class="text-xs text-muted-foreground">{variable.description}</p>
                      {/if}
                    {/each}
                  </div>
                  <Separator />
                {/if}
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
            </div>
          </details>
        </div>
      </div>
    </div>

  <aside class="min-w-0 space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100svh-10rem)] lg:self-start lg:overflow-y-auto lg:pb-3">
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
                    {#if row.icon === "blueprint"}
                      <span
                        class="inline-flex max-w-full items-center justify-end gap-2 align-middle"
                        data-blueprint-summary-icon
                      >
                        <BlueprintProductIcon
                          title={selectedBlueprintDisplayTitle}
                          icon={selectedBlueprintListing?.icon}
                          class="size-7 rounded-md"
                          imageClass="size-4"
                        />
                        <span class="min-w-0 truncate">{row.value}</span>
                      </span>
                    {:else}
                      {row.value}
                    {/if}
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
            {#if selectedBlueprintVariant}
              <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
                <span class="shrink-0 text-muted-foreground">部署方案</span>
                <span class="min-w-0 break-words text-right font-medium">
                  {selectedBlueprintVariantLabel()}
                </span>
              </div>
            {/if}
            <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
              <span class="shrink-0 text-muted-foreground">依赖资源</span>
              <span class="min-w-0 break-words text-right font-medium">
                {blueprintDependencyProvisioningSummary}
              </span>
            </div>
            <div class="console-subtle-panel flex min-w-0 items-center justify-between gap-3 px-3 py-2">
              <span class="shrink-0 text-muted-foreground">升级策略</span>
              <span class="min-w-0 break-words text-right font-medium">
                {blueprintUpgradeSummary(selectedBlueprintUpgrade)}
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
        <div class="space-y-3">
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
        </div>
      </section>

      <section
        class="console-side-panel sticky bottom-3 z-20 space-y-3 bg-background/95 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur"
        data-quick-deploy-action-panel
      >
        <p class="min-w-0 text-xs text-muted-foreground">
          {#if quickDeployReady}
            {staticPublishesToManaged ? "静态文件和项目已就绪。" : "来源、项目和服务器已就绪。"}
          {:else}
            {staticPublishesToManaged ? "请先上传静态文件并确认项目。" : "请先完善来源、项目和服务器。"}
          {/if}
        </p>
        <Button
          class="w-full"
          disabled={deployPending || !quickDeployReady}
          onclick={handleQuickDeploy}
        >
          {#if deployPending}
            <LoaderCircle class="size-4 animate-spin" />
            {$t(i18nKeys.console.quickDeploy.submitPending)}
          {:else if sourceKind === "blueprint"}
            <Play class="size-4" />
            查看安装计划
          {:else if sourceKind === "static-site"}
            <Upload class="size-4" />
            {$t(i18nKeys.console.quickDeploy.staticPublishAction)}
          {:else}
            <Play class="size-4" />
            {$t(i18nKeys.common.actions.createAndDeploy)}
          {/if}
        </Button>
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
            {#if deployFeedback.kind === "success" && (lastCreatedDeploymentId || lastAccessUrl)}
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
                {#if lastCreatedDeploymentId}
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

<style>
  .dependency-kind-logo {
    display: flex;
    width: 1.5rem;
    height: 1.5rem;
    align-items: center;
    justify-content: center;
  }

  .dependency-kind-logo :global(svg) {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
  }
</style>

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
      {:else if selectedBlueprintDetailQuery.isError || !selectedBlueprintDetail || !selectedBlueprintListing || !selectedBlueprintManifest || !selectedBlueprintEffectiveManifest}
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
                  {#if selectedBlueprintVariantOptions.length > 0}
                    <Badge variant="outline">方案：{selectedBlueprintVariantLabel()}</Badge>
                  {/if}
                  <Badge variant="outline">{blueprintUpgradeSummary(selectedBlueprintUpgrade)}</Badge>
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
              <p class="mt-1 font-medium">{selectedBlueprintEffectiveManifest.components.length} component</p>
            </div>
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">依赖资源</p>
              <p class="mt-1 truncate font-medium">
                {selectedBlueprintEffectiveManifest.resources.map((resource) => resource.kind).join(" / ") || "无"}
              </p>
            </div>
            <div class="console-subtle-panel px-3 py-2">
              <p class="text-xs text-muted-foreground">公开入口</p>
              <p class="mt-1 truncate font-medium">
                {selectedBlueprintEffectiveManifest.components
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
                {selectedBlueprintEffectiveManifest.description ??
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
                    `${selectedBlueprintEffectiveManifest.components.length} 个应用运行单元`,
                    selectedBlueprintEffectiveManifest.resources.length > 0
                      ? `${selectedBlueprintEffectiveManifest.resources.map((resource) => resource.kind).join(" / ")} 依赖绑定`
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
              {#each selectedBlueprintEffectiveManifest.components as component (component.id)}
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
              {#if selectedBlueprintVariantOptions.length > 0}
                <label class="block space-y-1.5">
                  <span class="text-xs text-muted-foreground">部署方案</span>
                  <select
                    class="min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    bind:value={selectedBlueprintVariant}
                  >
                    {#each selectedBlueprintVariantOptions as variant (variant.id)}
                      <option value={variant.id}>{variant.label ?? variant.id}</option>
                    {/each}
                  </select>
                </label>
              {/if}
              <div class="console-subtle-panel px-3 py-2 text-sm">
                <p class="text-muted-foreground">参数</p>
                <p class="mt-1 font-medium">
                  {selectedBlueprintEffectiveManifest.parameters.map((parameter) => parameter.key).join(", ") || "无"}
                </p>
              </div>
              <div class="console-subtle-panel px-3 py-2 text-sm">
                <p class="text-muted-foreground">密钥占位</p>
                <p class="mt-1 font-medium">
                  {selectedBlueprintEffectiveManifest.secrets.map((secret) => secret.key).join(", ") || "无"}
                </p>
              </div>
              <div class="console-subtle-panel px-3 py-2 text-sm">
                <p class="text-muted-foreground">升级策略</p>
                <p class="mt-1 font-medium">{blueprintUpgradeSummary(selectedBlueprintUpgrade)}</p>
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

<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import {
    ArrowLeft,
    ArrowRight,
    Boxes,
    ExternalLink,
    KeyRound,
    LoaderCircle,
    Package,
    PlugZap,
    Route,
    Server,
    SlidersHorizontal,
  } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";
  import { createBlueprintMarketplaceLocalizedEndpoint } from "@appaloft/blueprint-marketplace-web";

  import { request, readErrorMessage } from "$lib/api/client";
  import BlueprintProductIcon from "$lib/components/console/BlueprintProductIcon.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import {
    endpointFromTemplate,
    findBlueprintCatalogExtensionByKey,
    findBlueprintCatalogExtension,
    readBlueprintCatalogExtensionMetadata,
  } from "$lib/console/blueprint-marketplace-extension";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";
  import { locale } from "$lib/i18n";

  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
  };
  type BlueprintRuntime = {
    strategy: string;
    image?: string;
    buildCommand?: string;
    startCommand?: string;
    outputDirectory?: string;
    command?: readonly string[];
  };
  type BlueprintComponent = {
    id: string;
    name: string;
    kind: string;
    runtime: BlueprintRuntime;
    ports: readonly { name: string; containerPort: number; protocol: string; public?: boolean }[];
    routes: readonly { port: string; pathPrefix: string }[];
    healthCheck?: {
      enabled: boolean;
      type: "http";
      intervalSeconds: number;
      timeoutSeconds: number;
      retries: number;
      startPeriodSeconds: number;
      http?: {
        method: "GET" | "HEAD" | "POST" | "OPTIONS";
        scheme: "http" | "https";
        host: string;
        port?: number;
        path: string;
        expectedStatusCode: number;
        expectedResponseText?: string;
      };
    };
    variables: readonly { key: string; value: string; description?: string }[];
    usesSecrets: readonly string[];
    usesResources: readonly string[];
  };
  type BlueprintParameter = {
    key: string;
    label: string;
    type: "string" | "number" | "boolean";
    required?: boolean;
    default?: string | number | boolean;
    description?: string;
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
  type BlueprintRegistryEntry = {
    id: string;
    name: string;
    version: string;
    summary: string;
    tags?: readonly string[];
    defaultVariant?: string;
    variants?: readonly {
      id: string;
      label?: string;
      summary?: string;
    }[];
  };
  type BlueprintVariant = {
    label?: string;
    summary?: string;
    description?: string;
    tags?: readonly string[];
    defaultProfile?: string;
    parameters?: readonly BlueprintParameter[];
    secrets?: readonly { key: string; label: string; required?: boolean; description?: string }[];
    resources?: readonly { id: string; kind: string; label: string; optional?: boolean }[];
    components?: readonly BlueprintComponent[];
    profiles?: Record<string, { label?: string; replicas?: number; variables?: readonly { key: string; value: string }[] }>;
    upgrade?: BlueprintUpgradePolicy;
  };
  type BlueprintDetailResponse = {
    entry?: BlueprintRegistryEntry;
    listing?: {
      slug: string;
      title: string;
      subtitle: string;
      category: string;
      featured?: boolean;
      websiteUrl?: string;
      documentationUrl?: string;
      icon?: {
        label?: string;
        tone?: string;
        url?: string;
        alt?: string;
      };
      publisher?: {
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
    manifest: {
      id?: string;
      name?: string;
      version?: string;
      summary: string;
      description?: string;
      tags?: readonly string[];
      parameters: readonly BlueprintParameter[];
      secrets: readonly { key: string; label: string; required?: boolean; description?: string }[];
      resources: readonly { id: string; kind: string; label: string; optional?: boolean }[];
      components: readonly BlueprintComponent[];
      profiles?: Record<string, { label?: string; replicas?: number; variables?: readonly { key: string; value: string }[] }>;
      defaultVariant?: string;
      variants?: Record<string, BlueprintVariant>;
      upgrade?: BlueprintUpgradePolicy;
    };
    install?: {
      profiles: readonly string[];
      defaultProfile: string;
      parameters: readonly BlueprintParameter[];
      secrets: readonly { key: string; label: string; required?: boolean }[];
      defaultVariant?: string;
      variants?: readonly { id: string; label?: string; summary?: string }[];
      upgrade?: BlueprintUpgradePolicy;
    };
  };
  type InstalledApplicationProgress = {
    schemaVersion: "appaloft.cloud.installed-application.progress/v1";
    applicationId: string;
    status: string;
    userStatus: "running" | "succeeded" | "failed";
    currentStep: string;
    message: string;
    deploymentIds: readonly string[];
    operatorWorkId?: string;
    componentDeployments: readonly {
      componentId: string;
      name: string;
      deployment:
        | { deploymentId: string; reason?: string }
        | { status: "planned"; reason?: string };
    }[];
    failure?: {
      reason: string;
      code?: string;
    };
  };
  type InstalledApplicationComponent = {
    componentId: string;
    name?: string;
    kind?: string;
    resource?: { status?: "planned" | "realized"; resourceId?: string; resourceSlug?: string };
    deployment?: { status?: "planned" | "realized"; deploymentId?: string; reason?: string };
    endpoints?: readonly { label?: string; url?: string; public?: boolean }[];
  };
  type InstalledApplicationDependency = {
    requirementId: string;
    kind?: string;
    bindingStatus?: "planned" | "bound" | "blocked";
    plannedMode?: string;
    dependencyResourceId?: string;
    maskedConnection?: string;
    componentIds?: readonly string[];
  };
  type InstalledApplicationInstallResult = {
    applicationId?: string;
    executionStatus?: string;
    installedApplication?: {
      applicationId?: string;
      status?: string;
      components?: readonly InstalledApplicationComponent[];
      dependencies?: readonly InstalledApplicationDependency[];
    };
    progress?: InstalledApplicationProgress;
  };
  type InstalledApplicationShowResponse = {
    applicationId?: string;
    status?: string;
    components?: readonly InstalledApplicationComponent[];
    dependencies?: readonly InstalledApplicationDependency[];
    progress?: InstalledApplicationProgress;
  };

  const requiredInstallAcknowledgements = [
    "accepts-blueprint-application-bundle",
    "reviews-dependency-resource-bindings",
    "preserves-user-owned-configuration",
  ] as const;
  const marketplaceDetailCopy = {
    "en-US": {
      catalogTitle: "Marketplace",
      detailTitle: "Blueprint details",
      detailDescription: "Review an official Blueprint's components, dependencies, environment variables, and deployment plan.",
      catalogMissingTitle: "Blueprint catalog not registered",
      catalogMissingDescription: "The current runtime did not provide renderable Blueprint catalog extension metadata.",
      unavailableTitle: "Blueprint unavailable",
      unavailableDescription: "This Blueprint could not be loaded.",
      featured: "Featured",
      planPrefix: "Plan:",
      website: "Website",
      docs: "Docs",
      officialWebsite: "Official website",
      deploymentDocs: "Deployment docs",
      quickDeploy: "Quick deploy",
      deploymentPlans: "Deployment plans",
      currentPlan: "Current plan",
      optionalTopology: "Optional topology for the same Blueprint.",
      onlyDefaultPlan: "This Blueprint only has the default deployment plan.",
      deploymentPlanHelp: "Plan selection, Profile, and parameters are completed in the deployment dialog; the source is fixed to the current Blueprint.",
      upgradePolicy: "Upgrade policy",
      upgradeRequiresMaintenance: "Upgrades require separate confirmation in the installed application's maintenance flow.",
      components: "Components",
      componentSummary: "App services, background workers, or static sites",
      dependencies: "Dependencies",
      publicEntry: "Public entry",
      publicEntrySummary: "Access endpoints are generated after install",
      overview: "Overview",
      useCases: "Use cases",
      appaloftCreates: "Appaloft will create",
      deployAppUseCase: (title: string) => `Deploy a ${title} application`,
      inspectTopologyUseCase: "Review topology and dependencies before deployment",
      runtimeUnitsHighlight: (count: number) => `${count} runtime unit${count === 1 ? "" : "s"}`,
      dependencyBindingsHighlight: (dependencies: string) => `${dependencies} dependency bindings`,
      noManagedDependencies: "No managed dependencies",
      projectEnvironmentPlanHighlight: "Project, environment, resources, networking, and deployment plan",
      topology: "Application topology",
      topologyDescription: "Runtime units that will be created after install.",
      ports: "Ports",
      routes: "Routes",
      bindings: "Bindings",
      dependencyResources: "Dependency resources",
      noExternalDependencies: "This Blueprint does not declare external dependency resources.",
      configurationAndSecrets: "Configuration and secrets",
      parameters: "Parameters",
      noParameters: "No parameters.",
      secretPlaceholders: "Secret placeholders",
      required: "Required",
      optional: "Optional",
      noSecretPlaceholders: "No secret placeholders.",
      environmentVariables: "Environment variables",
      noPlainVariables: "No plain environment variables are written by default; dependencies and secrets enter the plan through binding/ref.",
      quickDeployDescription: "Open the dialog to deploy the current Blueprint.",
      targetPlan: "Target plan",
      defaultProfile: "Default Profile",
      parametersAndSecrets: "Parameters / secrets",
      componentsAndDependencies: "Components / dependencies",
      currentStep: "Current step",
      applicationStatus: "Application status",
      applicationId: "Application ID",
      createdResources: "Created resources",
      openResource: "Open resource",
      planned: "Planned",
      createdResourcesEmpty: "Created resources have not been returned yet. Wait for install completion, or refresh install status.",
      openGovernance: "Open governance",
      dependencyGovernanceReady: "The dependency resource is recorded. Continue reviewing bindings, backups, and restore status from Dependency resources.",
      installNoDependencies: "This install result has no dependency resources; it may not need dependencies, or the install is still running.",
      publicUrl: "Public URL",
      open: "Open",
      publicUrlEmpty: "The current install result has no public access summary. Public URLs, domains, and certificates are still governed from resource networking or domain bindings.",
      componentDeployments: "Component deployments",
      viewDeployment: "View deployment",
      componentDeploymentsEmpty: "The current install progress has no component deployments. Wait for install to continue, or refresh status.",
      refreshInstallStatus: "Refresh install status",
      openFirstResource: "Open first resource",
      openPublicUrl: "Open public URL",
      openLatestDeployment: "Open latest deployment",
      viewInstalledApplication: "View installed application",
      installedApplicationPending: "The install result page will appear after the application ID is returned. You can review resources or deployment records now.",
      openProjects: "Open projects",
      backToMarketplace: "Back to Marketplace",
      close: "Close",
      quickDeployDialogTitle: (title: string) => `Quick deploy ${title}`,
      quickDeployDialogDescription: "The source is fixed to the current Blueprint. Confirm Profile, parameters, and secrets to deploy.",
      variantDescriptionFallback: "Choose different dependency resources or runtime configuration for the same app.",
      parameterHelp: "These values are only used for this deployment plan; they do not mean configuration already exists in the system.",
      deploymentSecrets: "Deployment secrets",
      deploymentSecretsHelp: "Submitted to the runtime only when deployment starts; install progress will never echo secret values.",
      targetProject: "Target project",
      targetEnvironment: "Target environment",
      startDeployment: "Start deployment",
      statusComplete: "Complete",
      statusNeedsAttention: "Needs attention",
      statusInProgress: "In progress",
      installHandoffTitle: "Install handoff",
      installHandoffNeedsAttentionTitle: "Install needs attention",
      installHandoffInProgressTitle: "Install in progress",
      installHandoffDone: "Review the confirmed results for this install; unavailable handoff information is explicitly marked.",
      installHandoffFailed: "Review the failure reason and deployment work, then decide whether to retry, roll back, or open the related object page.",
      installHandoffProgress: "Deployment work items keep updating; this area stays focused on status and next actions, not the install form.",
      deploymentAttemptCreated: "Deployment started",
      serviceKind: "App service",
      workerKind: "Background worker",
      staticKind: "Static site",
      autoRuntime: "Auto-detect",
      prebuiltImageRuntime: "Prebuilt image",
      staticRuntime: "Static build",
      workspaceCommandsRuntime: "Workspace commands",
      runtimeConfig: "Runtime config",
      none: "None",
      bound: "Bound",
      blocked: "Blocked",
      realized: "Created",
      pending: "Pending",
      pendingResource: "Waiting to create",
      pendingDependency: "Waiting for handling",
      defaultPlan: "Default plan",
      noUpgradePolicy: "No upgrade policy declared",
      destructiveRisk: "Potentially destructive",
      nonDestructiveRisk: "Non-destructive",
      manualReviewRequired: "Manual review required",
    },
    "zh-CN": {
      catalogTitle: "应用市场",
      detailTitle: "蓝图详情",
      detailDescription: "查看官方 Blueprint 的组件、依赖资源、环境变量与部署计划。",
      catalogMissingTitle: "未注册蓝图目录",
      catalogMissingDescription: "当前运行时没有提供可渲染的蓝图目录扩展元数据。",
      unavailableTitle: "蓝图暂不可用",
      unavailableDescription: "无法加载这个蓝图。",
      featured: "精选",
      planPrefix: "方案：",
      website: "官网",
      docs: "文档",
      officialWebsite: "官方网站",
      deploymentDocs: "部署文档",
      quickDeploy: "快速部署",
      deploymentPlans: "部署方案",
      currentPlan: "当前方案",
      optionalTopology: "同一 Blueprint 的可选拓扑。",
      onlyDefaultPlan: "这个 Blueprint 只有默认部署方案。",
      deploymentPlanHelp: "方案选择、Profile 和参数输入在部署弹窗内完成；来源固定为当前 Blueprint。",
      upgradePolicy: "升级策略",
      upgradeRequiresMaintenance: "升级需要在已安装应用的维护流程中单独确认。",
      components: "组件",
      componentSummary: "应用服务、后台任务或静态站点",
      dependencies: "依赖资源",
      publicEntry: "公开入口",
      publicEntrySummary: "安装后生成访问入口",
      overview: "介绍",
      useCases: "适合场景",
      appaloftCreates: "Appaloft 会创建",
      deployAppUseCase: (title: string) => `部署 ${title} 应用`,
      inspectTopologyUseCase: "先查看拓扑和依赖，再进入部署流程",
      runtimeUnitsHighlight: (count: number) => `${count} 个应用运行单元`,
      dependencyBindingsHighlight: (dependencies: string) => `${dependencies} 依赖绑定`,
      noManagedDependencies: "无托管依赖资源",
      projectEnvironmentPlanHighlight: "项目、环境、资源、网络和部署计划",
      topology: "应用拓扑",
      topologyDescription: "安装后会创建的应用运行单元。",
      ports: "端口",
      routes: "访问路径",
      bindings: "依赖绑定",
      dependencyResources: "依赖资源",
      noExternalDependencies: "这个 Blueprint 不声明外部依赖资源。",
      configurationAndSecrets: "配置与密钥",
      parameters: "参数",
      noParameters: "无参数。",
      secretPlaceholders: "密钥占位",
      required: "必填",
      optional: "可选",
      noSecretPlaceholders: "无密钥占位。",
      environmentVariables: "环境变量",
      noPlainVariables: "默认不写入普通环境变量；依赖和密钥通过 binding/ref 进入 plan。",
      quickDeployDescription: "打开弹窗后直接部署当前 Blueprint。",
      targetPlan: "目标方案",
      defaultProfile: "默认 Profile",
      parametersAndSecrets: "参数 / 密钥",
      componentsAndDependencies: "组件 / 依赖",
      currentStep: "当前步骤",
      applicationStatus: "应用状态",
      applicationId: "应用 ID",
      createdResources: "创建的资源",
      openResource: "打开资源",
      planned: "计划中",
      createdResourcesEmpty: "创建的资源还没有返回。等待安装完成，或刷新安装状态。",
      openGovernance: "打开治理",
      dependencyGovernanceReady: "依赖资源已记录，可以从依赖资源页面继续查看绑定、备份和恢复状态。",
      installNoDependencies: "这个安装结果没有依赖资源；可能不需要依赖，或仍在安装中。",
      publicUrl: "公开 URL",
      open: "打开",
      publicUrlEmpty: "当前安装结果没有公开访问摘要。公开 URL、域名和证书仍从资源网络页或域名绑定页治理。",
      componentDeployments: "组件部署",
      viewDeployment: "查看部署",
      componentDeploymentsEmpty: "当前安装进度没有组件部署。等待安装继续，或刷新状态。",
      refreshInstallStatus: "刷新安装状态",
      openFirstResource: "打开首个资源",
      openPublicUrl: "打开公开 URL",
      openLatestDeployment: "打开最新部署",
      viewInstalledApplication: "查看安装聚合",
      installedApplicationPending: "安装结果页会在应用 ID 返回后出现。现在可以先查看资源或部署记录。",
      openProjects: "打开项目列表",
      backToMarketplace: "返回应用市场",
      close: "关闭",
      quickDeployDialogTitle: (title: string) => `快速部署 ${title}`,
      quickDeployDialogDescription: "来源固定为当前 Blueprint。确认 Profile、参数和密钥后即可部署。",
      variantDescriptionFallback: "选择同一应用的不同依赖资源或运行配置。",
      parameterHelp: "这些值只用于本次部署计划，不代表系统中已经存在的配置。",
      deploymentSecrets: "部署密钥",
      deploymentSecretsHelp: "只在开始部署时提交给运行时；安装进度不会回显密钥值。",
      targetProject: "目标项目",
      targetEnvironment: "目标环境",
      startDeployment: "开始部署",
      statusComplete: "完成",
      statusNeedsAttention: "需要处理",
      statusInProgress: "进行中",
      installHandoffTitle: "安装交接",
      installHandoffNeedsAttentionTitle: "安装需要处理",
      installHandoffInProgressTitle: "安装正在进行",
      installHandoffDone: "查看这次安装已经能确认的结果；还未接入的交接信息会明确标出。",
      installHandoffFailed: "先查看失败原因和部署尝试，再决定重试、回滚或打开对应对象页面。",
      installHandoffProgress: "部署尝试和工作项会持续更新；这里保持为状态和下一步，不展示安装表单。",
      deploymentAttemptCreated: "已开始部署",
      serviceKind: "应用服务",
      workerKind: "后台任务",
      staticKind: "静态站点",
      autoRuntime: "自动识别",
      prebuiltImageRuntime: "预构建镜像",
      staticRuntime: "静态构建",
      workspaceCommandsRuntime: "工作区命令",
      runtimeConfig: "运行配置",
      none: "无",
      bound: "已绑定",
      blocked: "阻塞",
      realized: "已创建",
      pending: "等待中",
      pendingResource: "等待创建",
      pendingDependency: "等待处理",
      defaultPlan: "默认方案",
      noUpgradePolicy: "未声明升级策略",
      destructiveRisk: "可能破坏性",
      nonDestructiveRisk: "非破坏性",
      manualReviewRequired: "需要人工确认",
    },
  } as const;

  const slug = $derived(page.params.slug ?? "");
  const detailCopy = $derived(
    $locale === "zh-CN" ? marketplaceDetailCopy["zh-CN"] : marketplaceDetailCopy["en-US"],
  );
  const returnTo = $derived(browser ? page.url.searchParams.get("returnTo") : null);
  const installedApplicationIdFromUrl = $derived(
    browser
      ? (page.url.searchParams.get("applicationId") ??
          page.url.searchParams.get("installedApplicationId") ??
          "")
      : "",
  );

  let profile = $state("");
  let selectedVariant = $state(browser ? (page.url.searchParams.get("blueprintVariant") ?? "") : "");
  let parameterValues = $state<Record<string, string>>({});
  let secretValues = $state<Record<string, string>>({});
  let installPending = $state(false);
  let installRefreshPending = $state(false);
  let installError = $state("");
  let installResult = $state<InstalledApplicationInstallResult | null>(null);
  let installDialogOpen = $state(false);

  const webExtensionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system-plugins", "web-extensions", "blueprint-catalog"],
      queryFn: () => request<SystemPluginWebExtensionsResponse>("/api/system-plugins/web-extensions"),
      enabled: browser,
      staleTime: 30_000,
    }),
  );

  const returnToSourceExtensionKey = $derived.by(() => {
    if (!returnTo) {
      return "";
    }
    try {
      const url = new URL(returnTo, "https://appaloft.local");
      return url.searchParams.get("sourceExtension") ?? "";
    } catch {
      return "";
    }
  });
  const returnToBlueprintVariant = $derived.by(() => {
    if (!returnTo) {
      return "";
    }
    try {
      const url = new URL(returnTo, "https://appaloft.local");
      return url.searchParams.get("blueprintVariant") ?? "";
    } catch {
      return "";
    }
  });
  const catalogExtension = $derived(
    findBlueprintCatalogExtensionByKey(
      webExtensionsQuery.data?.items ?? [],
      returnToSourceExtensionKey,
    ) ?? findBlueprintCatalogExtension(webExtensionsQuery.data?.items ?? [], "navigation"),
  );
  const catalogMetadata = $derived(readBlueprintCatalogExtensionMetadata(catalogExtension));
  const detailEndpoint = $derived.by(() => {
    if (!catalogMetadata || !slug) {
      return "";
    }
    if (catalogMetadata.detailEndpointTemplate) {
      return endpointFromTemplate(catalogMetadata.detailEndpointTemplate, slug);
    }
    return `${catalogMetadata.listEndpoint.replace(/\/$/, "")}/${encodeURIComponent(slug)}`;
  });
  const localizedDetailEndpoint = $derived(
    detailEndpoint
      ? createBlueprintMarketplaceLocalizedEndpoint("", detailEndpoint, $locale)
      : "",
  );
  const installEndpoint = $derived.by(() => {
    if (!catalogMetadata || !slug || !catalogMetadata.installEndpointTemplate) {
      return "";
    }
    return endpointFromTemplate(catalogMetadata.installEndpointTemplate, slug);
  });
  const installedApplicationEndpoint = $derived.by(() => {
    const applicationId =
      installResult?.progress?.applicationId ??
      installResult?.applicationId ??
      installResult?.installedApplication?.applicationId ??
      installedApplicationIdFromUrl;
    if (!catalogMetadata?.installedApplicationEndpointTemplate || !applicationId) {
      return "";
    }
    return catalogMetadata.installedApplicationEndpointTemplate.replace(
      /\{applicationId\}/g,
      encodeURIComponent(applicationId),
    );
  });

  const detailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["blueprint-catalog-detail", localizedDetailEndpoint],
      queryFn: async () =>
        normalizeBlueprintDetailResponse(
          await request<BlueprintDetailResponse>(localizedDetailEndpoint),
        ),
      enabled: browser && Boolean(localizedDetailEndpoint),
      staleTime: 30_000,
    }),
  );

  const detail = $derived(detailQuery.data ?? null);
  const listing = $derived(detail?.listing ?? null);
  const manifest = $derived(detail?.manifest ?? null);
  const variantOptions = $derived(detail?.install?.variants ?? []);
  const selectedVariantDefinition = $derived(
    manifest && selectedVariant ? manifest.variants?.[selectedVariant] : undefined,
  );
  const effectiveManifest = $derived.by(() =>
    manifest ? resolveEffectiveBlueprintManifest(manifest, selectedVariant) : null,
  );
  const selectedUpgrade = $derived(selectedVariantDefinition?.upgrade ?? detail?.install?.upgrade ?? manifest?.upgrade);
  const profileNames = $derived(
    effectiveManifest ? Object.keys(effectiveManifest.profiles ?? {}).sort() : (detail?.install?.profiles ?? []),
  );
  const selectedProfileDefinition = $derived(
    effectiveManifest && profile ? effectiveManifest.profiles?.[profile] : undefined,
  );
  const allVariables = $derived.by(() => {
    const componentVariables = effectiveManifest?.components.flatMap((component) => component.variables) ?? [];
    const profileVariables = selectedProfileDefinition?.variables ?? [];
    return [...componentVariables, ...profileVariables];
  });
  const installedApplicationComponents = $derived(
    installResult?.installedApplication?.components ?? [],
  );
  const installedApplicationDependencies = $derived(
    installResult?.installedApplication?.dependencies ?? [],
  );
  const installedApplicationPublicEndpoints = $derived(
    installedApplicationComponents.flatMap((component) =>
      (component.endpoints ?? [])
        .filter((endpoint) => endpoint.url)
        .map((endpoint) => ({
          componentId: component.componentId,
          componentName: component.name ?? component.componentId,
          label: endpoint.label ?? component.name ?? component.componentId,
          url: endpoint.url ?? "",
          public: endpoint.public ?? false,
        })),
    ),
  );

  function blueprintRegistryEntryToListing(
    entry: BlueprintRegistryEntry,
    normalizedManifest: BlueprintDetailResponse["manifest"],
  ): NonNullable<BlueprintDetailResponse["listing"]> {
    return {
      slug: entry.id,
      title: entry.name,
      subtitle: entry.summary,
      category: "Blueprints",
      blueprint: {
        id: normalizedManifest.id ?? entry.id,
        version: normalizedManifest.version ?? entry.version,
        summary: normalizedManifest.summary ?? entry.summary,
        tags: [...new Set([...(entry.tags ?? []), ...(normalizedManifest.tags ?? [])])],
      },
      requirementsSummary: {
        components: normalizedManifest.components.length,
        dependencies: [
          ...new Set(normalizedManifest.resources.map((resource) => resource.kind)),
        ].sort(),
        ports: normalizedManifest.components.flatMap((component) =>
          component.ports.map(
            (port) => `${component.id}:${port.name}:${port.containerPort}/${port.protocol}`,
          ),
        ),
      },
      ...(entry.defaultVariant ? { defaultVariant: entry.defaultVariant } : {}),
      ...(entry.variants ? { variants: entry.variants } : {}),
    };
  }

  function manifestFallbackListing(
    normalizedManifest: BlueprintDetailResponse["manifest"],
  ): NonNullable<BlueprintDetailResponse["listing"]> {
    const fallbackSlug = normalizedManifest.id ?? slug;
    return {
      slug: fallbackSlug,
      title: normalizedManifest.name ?? fallbackSlug,
      subtitle: normalizedManifest.summary,
      category: "Blueprints",
      blueprint: {
        id: normalizedManifest.id ?? fallbackSlug,
        version: normalizedManifest.version ?? "1.0.0",
        summary: normalizedManifest.summary,
        tags: normalizedManifest.tags ?? [],
      },
      requirementsSummary: {
        components: normalizedManifest.components.length,
        dependencies: [
          ...new Set(normalizedManifest.resources.map((resource) => resource.kind)),
        ].sort(),
        ports: normalizedManifest.components.flatMap((component) =>
          component.ports.map(
            (port) => `${component.id}:${port.name}:${port.containerPort}/${port.protocol}`,
          ),
        ),
      },
    };
  }

  function normalizeBlueprintManifest(
    manifest: BlueprintDetailResponse["manifest"],
  ): BlueprintDetailResponse["manifest"] {
    return {
      ...manifest,
      parameters: manifest.parameters ?? [],
      secrets: manifest.secrets ?? [],
      resources: manifest.resources ?? [],
      components: manifest.components ?? [],
      profiles: manifest.profiles ?? {},
      variants: Object.fromEntries(
        Object.entries(manifest.variants ?? {}).map(([id, variant]) => [
          id,
          {
            ...variant,
            parameters: variant.parameters ?? manifest.parameters ?? [],
            secrets: variant.secrets ?? manifest.secrets ?? [],
            resources: variant.resources ?? manifest.resources ?? [],
            components: variant.components ?? manifest.components ?? [],
            profiles: variant.profiles ?? manifest.profiles ?? {},
          },
        ]),
      ),
    };
  }

  function normalizeBlueprintDetailResponse(
    response: BlueprintDetailResponse,
  ): BlueprintDetailResponse {
    const normalizedManifest = normalizeBlueprintManifest(response.manifest);
    const listing =
      response.listing ??
      (response.entry
        ? blueprintRegistryEntryToListing(response.entry, normalizedManifest)
        : manifestFallbackListing(normalizedManifest));
    const variantEntries =
      response.install?.variants ??
      response.entry?.variants ??
      Object.entries(normalizedManifest.variants ?? {}).map(([id, variant]) => ({
        id,
        ...(variant.label ? { label: variant.label } : {}),
        ...(variant.summary ? { summary: variant.summary } : {}),
      }));
    const profileKeys = Object.keys(normalizedManifest.profiles ?? {}).sort();
    const defaultVariant =
      response.install?.defaultVariant ??
      response.entry?.defaultVariant ??
      normalizedManifest.defaultVariant ??
      variantEntries[0]?.id;
    const defaultProfile =
      response.install?.defaultProfile ??
      (defaultVariant ? normalizedManifest.variants?.[defaultVariant]?.defaultProfile : undefined) ??
      profileKeys[0] ??
      "production";

    return {
      ...response,
      listing,
      manifest: normalizedManifest,
      install: {
        profiles: response.install?.profiles ?? profileKeys,
        defaultProfile,
        parameters: response.install?.parameters ?? normalizedManifest.parameters,
        secrets: response.install?.secrets ?? normalizedManifest.secrets,
        ...(defaultVariant ? { defaultVariant } : {}),
        variants: variantEntries,
        upgrade: response.install?.upgrade ?? normalizedManifest.upgrade,
      },
    };
  }

  $effect(() => {
    installDialogOpen = modalIsOpen(page, "blueprint-install");
  });

  $effect(() => {
    if (!detail) {
      return;
    }

    const requestedVariant = selectedVariant || returnToBlueprintVariant;
    if (
      variantOptions.length > 0 &&
      (!requestedVariant || !variantOptions.some((variant) => variant.id === requestedVariant))
    ) {
      selectedVariant = detail.install?.defaultVariant ?? variantOptions[0]?.id ?? "";
      return;
    }
    if (requestedVariant !== selectedVariant) {
      selectedVariant = requestedVariant;
      return;
    }

    if (!profile || !profileNames.includes(profile)) {
      profile = selectedVariantDefinition?.defaultProfile ?? detail.install?.defaultProfile ?? "production";
    }

    const nextValues = { ...parameterValues };
    let valuesChanged = false;
    for (const parameter of effectiveManifest?.parameters ?? detail.install?.parameters ?? []) {
      if (nextValues[parameter.key] === undefined) {
        nextValues[parameter.key] = String(parameter.default ?? "");
        valuesChanged = true;
      }
    }
    if (valuesChanged) {
      parameterValues = nextValues;
    }
  });

  function setInstallDialogOpen(open: boolean): void {
    installDialogOpen = open;
    void setModalOpen(page, "blueprint-install", open);
  }

  function openInstallDialog(): void {
    setInstallDialogOpen(true);
  }

  function updateParameter(key: string, value: string): void {
    parameterValues = {
      ...parameterValues,
      [key]: value,
    };
  }

  function updateSecretValue(key: string, value: string): void {
    secretValues = {
      ...secretValues,
      [key]: value,
    };
  }

  function blueprintInstallSecretValueInput(): { key: string; value: string }[] {
    return Object.entries(secretValues)
      .filter(([, value]) => value.length > 0)
      .map(([key, value]) => ({ key, value }));
  }

  function installIdempotencyKey(): string {
    const suffix = browser && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
    return `install:${listing?.slug ?? slug}:web:${suffix}`;
  }

  async function acceptInstall(): Promise<void> {
    if (!installEndpoint || !listing) {
      return;
    }

    installPending = true;
    installError = "";
    try {
      const result = await request<InstalledApplicationInstallResult>(installEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...(selectedVariant ? { variant: selectedVariant } : {}),
          profile,
          parameters: Object.fromEntries(
            Object.entries(parameterValues).filter(([, value]) => value.trim() !== ""),
          ),
          target: {
            projectName: listing.title,
            environmentName: profile || "production",
            resourceSlugPrefix: listing.slug,
          },
          idempotencyKey: installIdempotencyKey(),
          acknowledgements: requiredInstallAcknowledgements,
          secretValues: blueprintInstallSecretValueInput(),
        }),
      });
      installResult = result;
      secretValues = {};
      setInstallDialogOpen(false);
    } catch (error) {
      installError = readErrorMessage(error);
    } finally {
      installPending = false;
    }
  }

  async function refreshInstalledApplicationProgress(): Promise<void> {
    if (!installedApplicationEndpoint) {
      return;
    }

    installRefreshPending = true;
    installError = "";
    try {
      const result = await request<InstalledApplicationShowResponse>(installedApplicationEndpoint);
      installResult = {
        ...installResult,
        applicationId: result.applicationId ?? installResult?.applicationId,
        installedApplication: {
          applicationId: result.applicationId ?? installResult?.installedApplication?.applicationId,
          status: result.status ?? installResult?.installedApplication?.status,
          components: result.components ?? installResult?.installedApplication?.components,
          dependencies: result.dependencies ?? installResult?.installedApplication?.dependencies,
        },
        progress: result.progress ?? installResult?.progress,
      };
    } catch (error) {
      installError = readErrorMessage(error);
    } finally {
      installRefreshPending = false;
    }
  }

  function progressBadgeLabel(progress: InstalledApplicationProgress): string {
    if (progress.userStatus === "succeeded") {
      return detailCopy.statusComplete;
    }
    if (progress.userStatus === "failed") {
      return detailCopy.statusNeedsAttention;
    }
    return detailCopy.statusInProgress;
  }

  function progressDeploymentHref(deploymentId: string): string {
    return `/deployments/${encodeURIComponent(deploymentId)}`;
  }

  function progressResourceHref(resourceId: string): string {
    return `/resources/${encodeURIComponent(resourceId)}`;
  }

  function dependencyResourceCollectionHref(dependencyResourceId?: string): string {
    const params = new URLSearchParams();
    if (dependencyResourceId) {
      params.set("resourceId", dependencyResourceId);
    }
    const query = params.toString();
    return query ? `/dependency-resources?${query}` : "/dependency-resources";
  }

  function installedApplicationHref(applicationId: string): string {
    return `/installed-applications/${encodeURIComponent(applicationId)}`;
  }

  function installHandoffTitle(progress: InstalledApplicationProgress): string {
    if (progress.userStatus === "succeeded") {
      return detailCopy.installHandoffTitle;
    }
    if (progress.userStatus === "failed") {
      return detailCopy.installHandoffNeedsAttentionTitle;
    }
    return detailCopy.installHandoffInProgressTitle;
  }

  function installHandoffDescription(progress: InstalledApplicationProgress): string {
    if (progress.userStatus === "succeeded") {
      return detailCopy.installHandoffDone;
    }
    if (progress.userStatus === "failed") {
      return detailCopy.installHandoffFailed;
    }
    return detailCopy.installHandoffProgress;
  }

  function componentDeploymentStatus(
    deployment: InstalledApplicationProgress["componentDeployments"][number]["deployment"],
  ): string {
    return "deploymentId" in deployment ? detailCopy.deploymentAttemptCreated : installPlanStatusLabel(deployment.status);
  }

  function blueprintComponentKindLabel(kind: string): string {
    switch (kind) {
      case "service":
        return detailCopy.serviceKind;
      case "worker":
        return detailCopy.workerKind;
      case "static":
        return detailCopy.staticKind;
      default:
        return kind;
    }
  }

  function blueprintRuntimeStrategyLabel(strategy: string): string {
    switch (strategy) {
      case "auto":
        return detailCopy.autoRuntime;
      case "dockerfile":
        return "Dockerfile";
      case "docker-compose":
        return "Docker Compose";
      case "prebuilt-image":
        return detailCopy.prebuiltImageRuntime;
      case "static":
        return detailCopy.staticRuntime;
      case "workspace-commands":
        return detailCopy.workspaceCommandsRuntime;
      default:
        return strategy;
    }
  }

  function blueprintRuntimeSummary(component: BlueprintComponent): string {
    return component.runtime.image ?? component.runtime.startCommand ?? component.runtime.outputDirectory ?? detailCopy.runtimeConfig;
  }

  function dependencyKindSummary(): string {
    const kinds = effectiveManifest?.resources.map((resource) => resource.kind) ?? [];
    return kinds.length ? kinds.join(" / ") : detailCopy.none;
  }

  function installPlanStatusLabel(status: string | undefined): string {
    switch (status) {
      case "planned":
        return detailCopy.planned;
      case "bound":
        return detailCopy.bound;
      case "blocked":
        return detailCopy.blocked;
      case "realized":
        return detailCopy.realized;
      case "pending":
        return detailCopy.pending;
      default:
        return status ?? detailCopy.pending;
    }
  }

  function countOrNoneLabel(count: number): string | number {
    return count > 0 ? count : detailCopy.none;
  }

  function pendingResourceLabel(value: string | undefined): string {
    return value ?? detailCopy.pendingResource;
  }

  function pendingDependencyLabel(value: string | undefined): string {
    return value ? installPlanStatusLabel(value) : detailCopy.pendingDependency;
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
      profiles: variant.profiles ?? baseManifest.profiles ?? {},
      defaultVariant: variantId,
      upgrade: variant.upgrade ?? baseManifest.upgrade,
    };
  }

  function selectedVariantLabel(): string {
    if (!selectedVariant) {
      return detailCopy.defaultPlan;
    }
    return (
      variantOptions.find((variant) => variant.id === selectedVariant)?.label ??
      selectedVariantDefinition?.label ??
      selectedVariant
    );
  }

  function upgradeSummary(upgrade: BlueprintUpgradePolicy | undefined): string {
    if (!upgrade) {
      return detailCopy.noUpgradePolicy;
    }
    const firstRisk = upgrade.steps?.[0]?.classification ?? "non-breaking";
    return [
      upgrade.strategy,
      firstRisk,
      upgrade.destructive ? detailCopy.destructiveRisk : detailCopy.nonDestructiveRisk,
      upgrade.steps?.some((step) => step.requiresManualReview) ? detailCopy.manualReviewRequired : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
</script>

<svelte:head>
  <title>{listing?.title ?? detailCopy.detailTitle} · {detailCopy.catalogTitle} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={listing?.title ?? detailCopy.detailTitle}
  description={listing?.subtitle ?? detailCopy.detailDescription}
  breadcrumbs={[
    { label: detailCopy.catalogTitle, href: "/marketplace" },
    { label: listing?.title ?? slug },
  ]}
>
  <div class="p-4 md:p-6">
  {#if webExtensionsQuery.isPending || detailQuery.isPending}
<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section class="console-panel space-y-3 p-5">
          <h1 class="text-2xl font-semibold">Blueprint title</h1>
          <p class="text-sm text-muted-foreground">Sample marketplace blueprint detail.</p>
        </section>
        <aside class="console-panel space-y-3 p-5">
          <h2 class="text-lg font-semibold">Deploy</h2>
          <p class="text-sm text-muted-foreground">One-click install actions</p>
        </aside>
      </div>
    {:else if !catalogMetadata}
    <section class="console-panel p-5">
      <div class="flex items-start gap-3">
        <Package class="mt-0.5 size-5 text-muted-foreground" />
        <div class="space-y-1">
          <h1 class="text-lg font-semibold">{detailCopy.catalogMissingTitle}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {detailCopy.catalogMissingDescription}
          </p>
        </div>
      </div>
    </section>
  {:else if detailQuery.isError || !detail || !listing || !manifest || !effectiveManifest}
    <section class="console-panel p-5">
      <div class="flex items-start gap-3">
        <Package class="mt-0.5 size-5 text-destructive" />
        <div class="space-y-1">
          <h1 class="text-lg font-semibold">{detailCopy.unavailableTitle}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {detailCopy.unavailableDescription}
          </p>
        </div>
      </div>
    </section>
  {:else}
    <div
      class="mx-auto grid w-full max-w-7xl gap-5 xl:grid-cols-[minmax(0,1fr)_390px]"
      data-blueprint-detail-display-surface
    >
      <div class="min-w-0 space-y-5">
        <section class="console-panel p-5">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div class="flex min-w-0 items-start gap-4">
              <BlueprintProductIcon
                title={listing.title}
                icon={listing.icon}
                class="size-14"
                imageClass="size-8"
              />
              <div class="min-w-0 space-y-3">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{listing.category}</Badge>
                    {#if listing.featured}
                      <Badge variant="outline">{detailCopy.featured}</Badge>
                    {/if}
                    {#if listing.publisher}
                      <Badge variant="outline">{listing.publisher.name}</Badge>
                    {/if}
                    {#if variantOptions.length > 0}
                      <Badge variant="outline">{detailCopy.planPrefix}{selectedVariantLabel()}</Badge>
                    {/if}
                    {#if selectedUpgrade}
                      <Badge variant="outline">{upgradeSummary(selectedUpgrade)}</Badge>
                    {/if}
                  </div>
                  <h1 class="text-3xl font-semibold tracking-normal md:text-4xl">{listing.title}</h1>
                  <p class="max-w-3xl text-sm leading-6 text-muted-foreground">{listing.subtitle}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  {#if listing.websiteUrl}
                    <Button href={listing.websiteUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
                      {detailCopy.website}
                      <ExternalLink class="size-4" />
                    </Button>
                  {/if}
                  {#if listing.documentationUrl}
                    <Button href={listing.documentationUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
                      {detailCopy.docs}
                      <ExternalLink class="size-4" />
                    </Button>
                  {/if}
                </div>
              </div>
            </div>
            <Button
              type="button"
              class="shrink-0 xl:hidden"
              onclick={openInstallDialog}
              disabled={!installEndpoint}
            >
              {detailCopy.quickDeploy}
              <ArrowRight class="size-4" />
            </Button>
          </div>
        </section>

        {#if selectedUpgrade || variantOptions.length > 0}
          <section class="console-panel p-5" data-blueprint-variant-display-surface>
            <div class="grid gap-4 lg:grid-cols-2">
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">{detailCopy.deploymentPlans}</h2>
                {#if variantOptions.length > 0}
                  <div class="grid gap-2">
                    {#each variantOptions as variant (variant.id)}
                      <article
                        class={`rounded-md border px-3 py-2 text-sm ${selectedVariant === variant.id ? "border-primary bg-primary/5" : "bg-background"}`}
                        data-blueprint-variant-option
                      >
                        <div class="flex items-start justify-between gap-3">
                          <span class="min-w-0 font-medium">{variant.label ?? variant.id}</span>
                          {#if selectedVariant === variant.id}
                            <Badge variant="outline">{detailCopy.currentPlan}</Badge>
                          {/if}
                        </div>
                        <span class="mt-1 block text-xs leading-5 text-muted-foreground">
                          {variant.summary ?? detailCopy.optionalTopology}
                        </span>
                      </article>
                    {/each}
                  </div>
                {:else}
                  <p class="text-sm leading-6 text-muted-foreground">{detailCopy.onlyDefaultPlan}</p>
                {/if}
                <p class="text-xs leading-5 text-muted-foreground">
                  {detailCopy.deploymentPlanHelp}
                </p>
              </div>
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">{detailCopy.upgradePolicy}</h2>
                <div class="console-subtle-panel px-3 py-2 text-sm">
                  <p class="font-medium">{upgradeSummary(selectedUpgrade)}</p>
                  <p class="mt-1 text-xs leading-5 text-muted-foreground">
                    {selectedUpgrade?.instructions ??
                      selectedUpgrade?.steps?.[0]?.changes?.[0] ??
                      detailCopy.upgradeRequiresMaintenance}
                  </p>
                </div>
              </div>
            </div>
          </section>
        {/if}

        <section class="grid gap-3 md:grid-cols-3">
          <article class="console-panel p-4">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Server class="size-4 text-muted-foreground" />
              {detailCopy.components}
            </div>
            <p class="mt-3 text-2xl font-semibold">{effectiveManifest.components.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">{detailCopy.componentSummary}</p>
          </article>
          <article class="console-panel p-4">
            <div class="flex items-center gap-2 text-sm font-medium">
              <PlugZap class="size-4 text-muted-foreground" />
              {detailCopy.dependencies}
            </div>
            <p class="mt-3 text-2xl font-semibold">{effectiveManifest.resources.length}</p>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              {dependencyKindSummary()}
            </p>
          </article>
          <article class="console-panel p-4">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Route class="size-4 text-muted-foreground" />
              {detailCopy.publicEntry}
            </div>
            <p class="mt-3 text-2xl font-semibold">
              {effectiveManifest.components.reduce((count, component) => count + component.routes.length, 0)}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">{detailCopy.publicEntrySummary}</p>
          </article>
        </section>

        <section class="console-panel p-5">
          <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">{detailCopy.overview}</h2>
              <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
                {effectiveManifest.description ?? listing.blueprint.summary ?? listing.subtitle}
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              {#if listing.websiteUrl}
                <Button href={listing.websiteUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
                  {detailCopy.officialWebsite}
                  <ExternalLink class="size-4" />
                </Button>
              {/if}
              {#if listing.documentationUrl}
                <Button href={listing.documentationUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
                  {detailCopy.deploymentDocs}
                  <ExternalLink class="size-4" />
                </Button>
              {/if}
            </div>
          </div>

          <div class="grid gap-5 md:grid-cols-2">
            <div class="space-y-2">
              <h3 class="text-sm font-semibold">{detailCopy.useCases}</h3>
              <ul class="space-y-2 text-sm leading-6 text-muted-foreground">
                {#each listing.overview?.useCases ?? [detailCopy.deployAppUseCase(listing.title), detailCopy.inspectTopologyUseCase] as useCase (useCase)}
                  <li class="flex gap-2">
                    <span class="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/55"></span>
                    <span>{useCase}</span>
                  </li>
                {/each}
              </ul>
            </div>
            <div class="space-y-2">
              <h3 class="text-sm font-semibold">{detailCopy.appaloftCreates}</h3>
              <ul class="space-y-2 text-sm leading-6 text-muted-foreground">
                {#each listing.overview?.highlights ?? [
                  detailCopy.runtimeUnitsHighlight(effectiveManifest.components.length),
                  effectiveManifest.resources.length > 0
                    ? detailCopy.dependencyBindingsHighlight(effectiveManifest.resources.map((resource) => resource.kind).join(" / "))
                    : detailCopy.noManagedDependencies,
                  detailCopy.projectEnvironmentPlanHighlight,
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

        <section class="console-panel p-5">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold">{detailCopy.topology}</h2>
              <p class="text-sm text-muted-foreground">{detailCopy.topologyDescription}</p>
            </div>
            <Badge variant="outline">{listing.blueprint.version}</Badge>
          </div>
          <div class="space-y-3">
            {#each effectiveManifest.components as component (component.id)}
              <article class="console-subtle-panel p-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div class="min-w-0">
                    <h3 class="font-semibold">{component.name}</h3>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {blueprintComponentKindLabel(component.kind)} · {blueprintRuntimeStrategyLabel(component.runtime.strategy)}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {blueprintRuntimeSummary(component)}
                  </Badge>
                </div>
                <div class="mt-3 grid gap-2 text-xs md:grid-cols-3">
                  <div>
                    <p class="text-muted-foreground">{detailCopy.ports}</p>
                    <p class="font-medium">
                      {component.ports.map((port) => `${port.name}:${port.containerPort}/${port.protocol}`).join(", ") || detailCopy.none}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground">{detailCopy.routes}</p>
                    <p class="font-medium">
                      {component.routes.map((route) => `${route.port}${route.pathPrefix}`).join(", ") || detailCopy.none}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground">{detailCopy.bindings}</p>
                    <p class="font-medium">
                      {[...component.usesResources, ...component.usesSecrets].join(", ") || detailCopy.none}
                    </p>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        </section>

        <section class="grid gap-5 lg:grid-cols-2">
          <article class="console-panel p-5">
            <div class="mb-4 flex items-center gap-2">
              <PlugZap class="size-4 text-muted-foreground" />
              <h2 class="text-lg font-semibold">{detailCopy.dependencyResources}</h2>
            </div>
            <div class="space-y-2">
              {#each effectiveManifest.resources as resource (resource.id)}
                <div class="console-subtle-panel px-3 py-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium">{resource.label}</span>
                    <Badge variant="outline">{resource.kind}</Badge>
                  </div>
                  <p class="mt-1 text-xs text-muted-foreground">{resource.id}</p>
                </div>
              {:else}
                <p class="text-sm text-muted-foreground">{detailCopy.noExternalDependencies}</p>
              {/each}
            </div>
          </article>

          <article class="console-panel p-5">
            <div class="mb-4 flex items-center gap-2">
              <KeyRound class="size-4 text-muted-foreground" />
              <h2 class="text-lg font-semibold">{detailCopy.configurationAndSecrets}</h2>
            </div>
            <div class="space-y-3">
              <div>
                <p class="mb-2 text-xs font-medium text-muted-foreground">{detailCopy.parameters}</p>
                <div class="space-y-2">
                  {#each effectiveManifest.parameters as parameter (parameter.key)}
                    <div class="console-subtle-panel px-3 py-2 text-sm">
                      <div class="flex items-center justify-between gap-3">
                        <span class="font-medium">{parameter.label}</span>
                        <Badge variant="outline">{parameter.type}</Badge>
                      </div>
                      <p class="mt-1 font-mono text-xs text-muted-foreground">{parameter.key}</p>
                    </div>
                  {:else}
                    <p class="text-sm text-muted-foreground">{detailCopy.noParameters}</p>
                  {/each}
                </div>
              </div>
              <div>
                <p class="mb-2 text-xs font-medium text-muted-foreground">{detailCopy.secretPlaceholders}</p>
                <div class="space-y-2">
                  {#each effectiveManifest.secrets as secret (secret.key)}
                    <div class="console-subtle-panel px-3 py-2 text-sm">
                      <div class="flex items-center justify-between gap-3">
                        <span class="font-medium">{secret.label}</span>
                        <Badge variant="outline">{secret.required ? detailCopy.required : detailCopy.optional}</Badge>
                      </div>
                      <p class="mt-1 font-mono text-xs text-muted-foreground">{secret.key}</p>
                    </div>
                  {:else}
                    <p class="text-sm text-muted-foreground">{detailCopy.noSecretPlaceholders}</p>
                  {/each}
                </div>
              </div>
            </div>
          </article>
        </section>

        <section class="console-panel p-5">
          <div class="mb-4 flex items-center gap-2">
            <SlidersHorizontal class="size-4 text-muted-foreground" />
            <h2 class="text-lg font-semibold">{detailCopy.environmentVariables}</h2>
          </div>
          <div class="grid gap-2 md:grid-cols-2">
            {#each allVariables as variable (`${variable.key}-${variable.value}`)}
              <div class="console-subtle-panel px-3 py-2 text-sm">
                <p class="font-mono font-medium">{variable.key}</p>
                <p class="mt-1 truncate text-xs text-muted-foreground">{variable.value}</p>
              </div>
            {:else}
              <p class="text-sm text-muted-foreground">{detailCopy.noPlainVariables}</p>
            {/each}
          </div>
        </section>
      </div>

      <aside class="min-w-0 space-y-5 xl:sticky xl:top-20 xl:self-start">
        <section class="console-side-panel space-y-4" data-blueprint-install-summary>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold">{detailCopy.quickDeploy}</h2>
              <p class="text-sm text-muted-foreground">{detailCopy.quickDeployDescription}</p>
            </div>
            <Boxes class="size-5 text-muted-foreground" />
          </div>

          <div class="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">{detailCopy.targetPlan}</span>
              <span class="min-w-0 truncate font-medium">{selectedVariantLabel()}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">{detailCopy.defaultProfile}</span>
              <span class="font-mono">{profile}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">{detailCopy.parametersAndSecrets}</span>
              <span class="font-mono">{effectiveManifest.parameters.length} / {effectiveManifest.secrets.length}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">{detailCopy.componentsAndDependencies}</span>
              <span class="font-mono">{effectiveManifest.components.length} / {effectiveManifest.resources.length}</span>
            </div>
          </div>

          <div class="grid gap-2">
            <Button
              type="button"
              class="hidden xl:inline-flex"
              onclick={openInstallDialog}
              disabled={!installEndpoint}
            >
              {#if installPending}
                <LoaderCircle class="size-4 animate-spin" />
              {/if}
              {detailCopy.quickDeploy}
              <ArrowRight class="size-4" />
            </Button>
          </div>

          {#if installError}
            <div class="console-subtle-panel border-destructive/30 px-3 py-2 text-sm text-destructive">
              {installError}
            </div>
          {/if}

          {#if installResult?.progress}
            <div
              class="console-subtle-panel space-y-4 p-3"
              data-blueprint-install-progress
              data-blueprint-install-handoff
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold">{installHandoffTitle(installResult.progress)}</p>
                  <p class="mt-1 text-xs leading-5 text-muted-foreground">
                    {installHandoffDescription(installResult.progress)}
                  </p>
                </div>
                <Badge variant={installResult.progress.userStatus === "failed" ? "destructive" : "outline"}>
                  {progressBadgeLabel(installResult.progress)}
                </Badge>
              </div>

              <div class="grid gap-2 rounded-md border bg-background p-3 text-xs">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-muted-foreground">{detailCopy.currentStep}</span>
                  <span class="font-mono">{installResult.progress.currentStep}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-muted-foreground">{detailCopy.applicationStatus}</span>
                  <span class="font-mono">{installResult.progress.status}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-muted-foreground">{detailCopy.applicationId}</span>
                  <span class="break-all font-mono">{installResult.progress.applicationId}</span>
                </div>
                <p class="border-t pt-2 leading-5 text-muted-foreground">
                  {installResult.progress.message}
                </p>
              </div>

              <section class="space-y-2" data-blueprint-install-created-resources>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-medium text-muted-foreground">{detailCopy.createdResources}</p>
                  <Badge variant="outline">{countOrNoneLabel(installedApplicationComponents.length)}</Badge>
                </div>
                {#each installedApplicationComponents as component (component.componentId)}
                  <div class="rounded-md border bg-background px-3 py-2 text-xs">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="min-w-0">
                        <p class="truncate font-medium">{component.name ?? component.componentId}</p>
                        <p class="mt-1 truncate font-mono text-muted-foreground">
                          {pendingResourceLabel(component.resource?.resourceId ?? component.resource?.resourceSlug)}
                        </p>
                      </div>
                      {#if component.resource?.resourceId}
                        <Button
                          href={progressResourceHref(component.resource.resourceId)}
                          variant="outline"
                          size="sm"
                        >
                          {detailCopy.openResource}
                          <ArrowRight class="size-3.5" />
                        </Button>
                      {:else}
                        <Badge variant="outline">{detailCopy.planned}</Badge>
                      {/if}
                    </div>
                  </div>
                {:else}
                  <div class="rounded-md border border-dashed bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {detailCopy.createdResourcesEmpty}
                  </div>
                {/each}
              </section>

              <section class="space-y-2" data-blueprint-install-dependencies>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-medium text-muted-foreground">{detailCopy.dependencyResources}</p>
                  <Badge variant="outline">{countOrNoneLabel(installedApplicationDependencies.length)}</Badge>
                </div>
                {#each installedApplicationDependencies as dependency (dependency.requirementId)}
                  <div class="rounded-md border bg-background px-3 py-2 text-xs">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="min-w-0">
                        <p class="truncate font-medium">{dependency.requirementId}</p>
                        <p class="mt-1 truncate font-mono text-muted-foreground">
                          {dependency.dependencyResourceId ?? pendingDependencyLabel(dependency.plannedMode)}
                        </p>
                      </div>
                      {#if dependency.dependencyResourceId}
                        <Button
                          href={dependencyResourceCollectionHref(dependency.dependencyResourceId)}
                          variant="outline"
                          size="sm"
                        >
                          {detailCopy.openGovernance}
                          <ArrowRight class="size-3.5" />
                        </Button>
                      {:else}
                        <Badge variant={dependency.bindingStatus === "blocked" ? "destructive" : "outline"}>
                          {installPlanStatusLabel(dependency.bindingStatus)}
                        </Badge>
                      {/if}
                    </div>
                    {#if dependency.dependencyResourceId}
                      <p class="mt-2 border-t pt-2 leading-5 text-muted-foreground">
                        {detailCopy.dependencyGovernanceReady}
                      </p>
                    {/if}
                  </div>
                {:else}
                  <div class="rounded-md border border-dashed bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {detailCopy.installNoDependencies}
                  </div>
                {/each}
              </section>

              <section class="space-y-2" data-blueprint-install-public-urls>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-medium text-muted-foreground">{detailCopy.publicUrl}</p>
                  <Badge variant="outline">{countOrNoneLabel(installedApplicationPublicEndpoints.length)}</Badge>
                </div>
                {#each installedApplicationPublicEndpoints as endpoint (`${endpoint.componentId}-${endpoint.url}`)}
                  <div class="rounded-md border bg-background px-3 py-2 text-xs">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="min-w-0">
                        <p class="truncate font-medium">{endpoint.label}</p>
                        <p class="mt-1 truncate font-mono text-muted-foreground">{endpoint.url}</p>
                      </div>
                      <Button href={endpoint.url} target="_blank" rel="noreferrer" variant="outline" size="sm">
                        {detailCopy.open}
                        <ExternalLink class="size-3.5" />
                      </Button>
                    </div>
                  </div>
                {:else}
                  <div class="rounded-md border border-dashed bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {detailCopy.publicUrlEmpty}
                  </div>
                {/each}
              </section>

              <section class="space-y-2" data-blueprint-install-component-deployments>
                <p class="text-xs font-medium text-muted-foreground">{detailCopy.componentDeployments}</p>
                {#each installResult.progress.componentDeployments as component (component.componentId)}
                  <div class="rounded-md border bg-background px-3 py-2 text-xs">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="min-w-0">
                        <p class="truncate font-medium">{component.name}</p>
                        <p class="mt-1 font-mono text-muted-foreground">
                          {componentDeploymentStatus(component.deployment)}
                        </p>
                      </div>
                      {#if "deploymentId" in component.deployment}
                        <Button
                          href={progressDeploymentHref(component.deployment.deploymentId)}
                          variant="outline"
                          size="sm"
                        >
                          {detailCopy.viewDeployment}
                          <ArrowRight class="size-3.5" />
                        </Button>
                      {:else}
                        <Badge variant="outline">{detailCopy.planned}</Badge>
                      {/if}
                    </div>
                  </div>
                {:else}
                  <div class="rounded-md border border-dashed bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {detailCopy.componentDeploymentsEmpty}
                  </div>
                {/each}
              </section>

              {#if installResult.progress.failure}
                <div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {installResult.progress.failure.reason}
                </div>
              {/if}

              <div class="grid gap-2" data-blueprint-install-next-actions>
                {#if installedApplicationEndpoint}
                  <Button
                    type="button"
                    onclick={refreshInstalledApplicationProgress}
                    disabled={installRefreshPending}
                    variant="outline"
                    class="w-full"
                  >
                    {#if installRefreshPending}
                      <LoaderCircle class="size-4 animate-spin" />
                    {/if}
                    {detailCopy.refreshInstallStatus}
                  </Button>
                {/if}
                {#if installedApplicationComponents.find((component) => component.resource?.resourceId)?.resource?.resourceId}
                  {@const firstResourceId = installedApplicationComponents.find((component) => component.resource?.resourceId)?.resource?.resourceId}
                  {#if firstResourceId}
                    <Button
                      href={progressResourceHref(firstResourceId)}
                      variant="outline"
                      class="w-full"
                    >
                      {detailCopy.openFirstResource}
                      <ArrowRight class="size-4" />
                    </Button>
                  {/if}
                {/if}
                {#if installedApplicationPublicEndpoints[0]?.url}
                  <Button
                    href={installedApplicationPublicEndpoints[0].url}
                    target="_blank"
                    rel="noreferrer"
                    variant="outline"
                    class="w-full"
                  >
                    {detailCopy.openPublicUrl}
                    <ExternalLink class="size-4" />
                  </Button>
                {/if}
                {#if installResult.progress.deploymentIds[0]}
                  <Button
                    href={progressDeploymentHref(installResult.progress.deploymentIds[0])}
                    variant="outline"
                    class="w-full"
                  >
                    {detailCopy.openLatestDeployment}
                    <ArrowRight class="size-4" />
                  </Button>
                {/if}
                {#if installResult.progress.applicationId}
                  <Button
                    href={installedApplicationHref(installResult.progress.applicationId)}
                    variant="outline"
                    class="w-full"
                  >
                    {detailCopy.viewInstalledApplication}
                    <ArrowRight class="size-4" />
                  </Button>
                {:else}
                  <div class="rounded-md border border-dashed bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {detailCopy.installedApplicationPending}
                  </div>
                {/if}
                <Button href="/projects" variant="outline" class="w-full">
                  {detailCopy.openProjects}
                  <ArrowRight class="size-4" />
                </Button>
              </div>
            </div>
          {/if}
        </section>

        <Button href="/marketplace" variant="outline" class="w-full">
          <ArrowLeft class="size-4" />
          {detailCopy.backToMarketplace}
        </Button>
      </aside>

      <Dialog.Root bind:open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <Dialog.Content closeLabel={detailCopy.close} class="max-w-3xl">
          <Dialog.Header>
            <Dialog.Title>{detailCopy.quickDeployDialogTitle(listing.title)}</Dialog.Title>
            <Dialog.Description>
              {detailCopy.quickDeployDialogDescription}
            </Dialog.Description>
          </Dialog.Header>

          <section class="space-y-5 px-5 pb-5" data-blueprint-install-dialog>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="space-y-1.5 text-sm">
                <span class="font-medium">Profile</span>
                <Select.Root bind:value={profile} type="single">
                  <Select.Trigger class="w-full">
                    {profile || "production"}
                  </Select.Trigger>
                  <Select.Content>
                    {#each profileNames as profileName (profileName)}
                      <Select.Item value={profileName}>{profileName}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>

              {#if variantOptions.length > 0}
                <label class="space-y-1.5 text-sm">
                  <span class="font-medium">{detailCopy.deploymentPlans}</span>
                  <Select.Root bind:value={selectedVariant} type="single">
                    <Select.Trigger class="w-full">
                      {selectedVariantLabel()}
                    </Select.Trigger>
                    <Select.Content>
                      {#each variantOptions as variant (variant.id)}
                        <Select.Item value={variant.id}>{variant.label ?? variant.id}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <span class="block text-xs leading-5 text-muted-foreground">
                    {selectedVariantDefinition?.summary ?? detailCopy.variantDescriptionFallback}
                  </span>
                </label>
              {/if}
            </div>

            {#if effectiveManifest.parameters.length > 0}
              <section class="space-y-3">
                <div>
                  <h3 class="text-sm font-semibold">{detailCopy.parameters}</h3>
                  <p class="mt-1 text-xs leading-5 text-muted-foreground">
                    {detailCopy.parameterHelp}
                  </p>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  {#each effectiveManifest.parameters as parameter (parameter.key)}
                    <label class="space-y-1.5 text-sm">
                      <span class="font-medium">{parameter.label}</span>
                      <Input
                        value={parameterValues[parameter.key] ?? ""}
                        oninput={(event) => updateParameter(parameter.key, event.currentTarget.value)}
                        placeholder={String(parameter.default ?? "")}
                      />
                      <span class="block truncate font-mono text-xs text-muted-foreground">
                        {parameter.key} · {parameter.type}
                      </span>
                    </label>
                  {/each}
                </div>
              </section>
            {/if}

            {#if effectiveManifest.secrets.length > 0}
              <section class="space-y-3" data-blueprint-install-secret-inputs>
                <div>
                  <h3 class="text-sm font-semibold">{detailCopy.deploymentSecrets}</h3>
                  <p class="mt-1 text-xs leading-5 text-muted-foreground">
                    {detailCopy.deploymentSecretsHelp}
                  </p>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  {#each effectiveManifest.secrets as secret (secret.key)}
                    <label class="space-y-1.5 text-sm">
                      <span class="font-medium">
                        {secret.label}
                        {#if secret.required}
                          <span class="text-destructive">*</span>
                        {/if}
                      </span>
                      <Input
                        value={secretValues[secret.key] ?? ""}
                        type="password"
                        autocomplete="new-password"
                        oninput={(event) => updateSecretValue(secret.key, event.currentTarget.value)}
                        placeholder={secret.key}
                      />
                      <span class="block truncate font-mono text-xs text-muted-foreground">
                        {secret.key}
                      </span>
                    </label>
                  {/each}
                </div>
              </section>
            {/if}

            <div class="rounded-md border bg-muted/30 p-3 text-xs">
              <div class="grid gap-2 sm:grid-cols-2">
                <div>
                  <span class="text-muted-foreground">{detailCopy.targetProject}</span>
                  <p class="mt-1 font-medium">{listing.title}</p>
                </div>
                <div>
                  <span class="text-muted-foreground">{detailCopy.targetEnvironment}</span>
                  <p class="mt-1 font-mono">{profile || "production"}</p>
                </div>
              </div>
            </div>

            <Dialog.Footer>
              {#if installEndpoint}
                <Button
                  type="button"
                  onclick={acceptInstall}
                  disabled={installPending}
                  data-blueprint-accept-install
                >
                  {#if installPending}
                    <LoaderCircle class="size-4 animate-spin" />
                  {/if}
                  {detailCopy.startDeployment}
                </Button>
              {/if}
            </Dialog.Footer>
          </section>
        </Dialog.Content>
      </Dialog.Root>
    </div>
    {/if}
  </div>
</ConsoleShell>

<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
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

  import { request, readErrorMessage } from "$lib/api/client";
  import BlueprintProductIcon from "$lib/components/console/BlueprintProductIcon.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    endpointFromTemplate,
    findBlueprintCatalogExtensionByKey,
    findBlueprintCatalogExtension,
    readBlueprintCatalogExtensionMetadata,
  } from "$lib/console/blueprint-marketplace-extension";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";

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
  type BlueprintUpgradePlanResponse = {
    current?: {
      applicationId: string;
      status: string;
      source: {
        blueprintVersion: string;
        blueprintVariant?: string;
        profile: string;
      };
      dependencyBindings?: readonly { requirementId: string; bindingStatus: string; plannedMode: string }[];
    };
    target?: {
      blueprint: {
        version: string;
        variant?: string;
        profile: string;
      };
    };
    plan?: {
      classification: "non-breaking" | "potentially-breaking" | "breaking";
      destructive: boolean;
      requiresManualReview: boolean;
      blueprint: {
        fromVersion: string;
        toVersion: string;
        fromVariant?: string;
        toVariant?: string;
      };
      operations?: readonly { kind: string; classification?: string }[];
      warnings?: readonly string[];
    };
    changes?: readonly { kind: string; classification: string; requiresManualReview: boolean; summary: string }[];
    preservedUserConfigurationWarnings?: readonly string[];
    nonExecution?: {
      marker: string;
      createsExternalResources: false;
      executesUpgrade: false;
      applyCommandAvailable: false;
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

  const slug = $derived(page.params.slug ?? "");
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
  let planPending = $state(false);
  let planError = $state("");
  let planOutput = $state<unknown>(null);
  let secretValues = $state<Record<string, string>>({});
  let installPending = $state(false);
  let installRefreshPending = $state(false);
  let installError = $state("");
  let installResult = $state<InstalledApplicationInstallResult | null>(null);
  let upgradeApplicationId = $state(
    browser
      ? (page.url.searchParams.get("applicationId") ??
          page.url.searchParams.get("installedApplicationId") ??
          "")
      : "",
  );
  let upgradePlanPending = $state(false);
  let upgradePlanError = $state("");
  let upgradePlanOutput = $state<BlueprintUpgradePlanResponse | null>(null);
  let installDialogOpen = $state(false);
  let upgradePlanDialogOpen = $state(false);

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
  const deploySourceExtension = $derived(
    findBlueprintCatalogExtensionByKey(
      webExtensionsQuery.data?.items ?? [],
      returnToSourceExtensionKey,
    ) ??
      findBlueprintCatalogExtension(webExtensionsQuery.data?.items ?? [], "quick-deploy-source") ??
      catalogExtension,
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
  const installPlanEndpoint = $derived.by(() => {
    if (!catalogMetadata || !slug) {
      return "";
    }
    if (catalogMetadata.installPlanEndpointTemplate) {
      return endpointFromTemplate(catalogMetadata.installPlanEndpointTemplate, slug);
    }
    return `${detailEndpoint}/install-plan`;
  });
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
  const upgradePlanEndpoint = $derived.by(() => {
    if (!catalogMetadata || !slug) {
      return "";
    }
    if (catalogMetadata.upgradePlanEndpointTemplate) {
      return endpointFromTemplate(catalogMetadata.upgradePlanEndpointTemplate, slug);
    }
    return "";
  });

  const detailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["blueprint-catalog-detail", detailEndpoint],
      queryFn: async () =>
        normalizeBlueprintDetailResponse(await request<BlueprintDetailResponse>(detailEndpoint)),
      enabled: browser && Boolean(detailEndpoint),
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
    upgradePlanDialogOpen = modalIsOpen(page, "blueprint-upgrade-plan");
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

    if (!upgradeApplicationId && installedApplicationIdFromUrl) {
      upgradeApplicationId = installedApplicationIdFromUrl;
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

  function quickDeployDialogHref(): string {
    const params = new URLSearchParams(page.url.searchParams);
    params.set("modal", "quick-deploy");
    params.set("source", "blueprint");
    const sourceExtensionKey =
      deploySourceExtension?.key ?? params.get("sourceExtension") ?? "";
    if (sourceExtensionKey) {
      params.set("sourceExtension", sourceExtensionKey);
    }
    params.set("blueprintSlug", listing?.slug ?? slug);
    params.set("blueprintTitle", listing?.title ?? slug);
    if (selectedVariant) {
      params.set("blueprintVariant", selectedVariant);
    } else {
      params.delete("blueprintVariant");
    }
    params.set("step", "project");
    params.set("projectMode", "new");
    params.set("projectName", listing?.title ?? slug);

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function openQuickDeployDialog(): void {
    void goto(quickDeployDialogHref(), {
      keepFocus: true,
      noScroll: true,
    });
  }

  function setInstallDialogOpen(open: boolean): void {
    installDialogOpen = open;
    void setModalOpen(page, "blueprint-install", open);
  }

  function openInstallDialog(): void {
    setInstallDialogOpen(true);
  }

  function setUpgradePlanDialogOpen(open: boolean): void {
    upgradePlanDialogOpen = open;
    void setModalOpen(page, "blueprint-upgrade-plan", open);
  }

  function openUpgradePlanDialog(): void {
    setUpgradePlanDialogOpen(true);
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
      return "完成";
    }
    if (progress.userStatus === "failed") {
      return "需要处理";
    }
    return "进行中";
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
      return "安装交接";
    }
    if (progress.userStatus === "failed") {
      return "安装需要处理";
    }
    return "安装正在进行";
  }

  function installHandoffDescription(progress: InstalledApplicationProgress): string {
    if (progress.userStatus === "succeeded") {
      return "查看这次安装已经能确认的结果；还未接入的交接信息会明确标出。";
    }
    if (progress.userStatus === "failed") {
      return "先查看失败原因和部署尝试，再决定重试、回滚或打开对应对象页面。";
    }
    return "部署尝试和工作项会持续更新；这里保持为状态和下一步，不展示安装表单。";
  }

  function componentDeploymentStatus(
    deployment: InstalledApplicationProgress["componentDeployments"][number]["deployment"],
  ): string {
    return "deploymentId" in deployment ? "已创建部署尝试" : installPlanStatusLabel(deployment.status);
  }

  function blueprintComponentKindLabel(kind: string): string {
    switch (kind) {
      case "service":
        return "应用服务";
      case "worker":
        return "后台任务";
      case "static":
        return "静态站点";
      default:
        return kind;
    }
  }

  function blueprintRuntimeStrategyLabel(strategy: string): string {
    switch (strategy) {
      case "auto":
        return "自动识别";
      case "dockerfile":
        return "Dockerfile";
      case "docker-compose":
        return "Docker Compose";
      case "prebuilt-image":
        return "预构建镜像";
      case "static":
        return "静态构建";
      case "workspace-commands":
        return "工作区命令";
      default:
        return strategy;
    }
  }

  function blueprintRuntimeSummary(component: BlueprintComponent): string {
    return component.runtime.image ?? component.runtime.startCommand ?? component.runtime.outputDirectory ?? "运行配置";
  }

  function dependencyKindSummary(): string {
    const kinds = effectiveManifest?.resources.map((resource) => resource.kind) ?? [];
    return kinds.length ? kinds.join(" / ") : "无";
  }

  function installPlanStatusLabel(status: string | undefined): string {
    switch (status) {
      case "planned":
        return "计划中";
      case "bound":
        return "已绑定";
      case "blocked":
        return "阻塞";
      case "realized":
        return "已创建";
      case "pending":
        return "等待中";
      default:
        return status ?? "等待中";
    }
  }

  function countOrNoneLabel(count: number): string | number {
    return count > 0 ? count : "无";
  }

  function pendingResourceLabel(value: string | undefined): string {
    return value ?? "等待创建";
  }

  function pendingDependencyLabel(value: string | undefined): string {
    return value ? installPlanStatusLabel(value) : "等待处理";
  }

  function upgradeClassificationLabel(classification: string | undefined): string {
    switch (classification) {
      case "non-breaking":
        return "兼容变更";
      case "potentially-breaking":
        return "需要复核";
      case "breaking":
        return "破坏性变更";
      default:
        return "未评估";
    }
  }

  function upgradeDestructiveLabel(destructive: boolean | undefined): string {
    return destructive ? "可能破坏性" : "非破坏性";
  }

  function upgradeReviewLabel(requiresManualReview: boolean | undefined): string {
    return requiresManualReview ? "需要人工复核" : "自动复核";
  }

  async function generatePlan(): Promise<void> {
    if (!installPlanEndpoint || !listing) {
      return;
    }

    planPending = true;
    planError = "";
    try {
      planOutput = await request<unknown>(installPlanEndpoint, {
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
        }),
      });
      setInstallDialogOpen(false);
    } catch (error) {
      planError = readErrorMessage(error);
    } finally {
      planPending = false;
    }
  }

  async function generateUpgradePlan(): Promise<void> {
    if (!upgradePlanEndpoint || !listing) {
      return;
    }
    const applicationId = upgradeApplicationId.trim();
    if (!applicationId) {
      upgradePlanError = "需要已安装应用 ID 才能生成升级 dry-run。";
      return;
    }

    upgradePlanPending = true;
    upgradePlanError = "";
    try {
      upgradePlanOutput = await request<BlueprintUpgradePlanResponse>(upgradePlanEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          applicationId,
          ...(selectedVariant ? { targetVariant: selectedVariant } : {}),
          ...(profile ? { targetProfile: profile } : {}),
        }),
      });
      setUpgradePlanDialogOpen(false);
    } catch (error) {
      upgradePlanError = readErrorMessage(error);
    } finally {
      upgradePlanPending = false;
    }
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
      return "默认方案";
    }
    return (
      variantOptions.find((variant) => variant.id === selectedVariant)?.label ??
      selectedVariantDefinition?.label ??
      selectedVariant
    );
  }

  function upgradeSummary(upgrade: BlueprintUpgradePolicy | undefined): string {
    if (!upgrade) {
      return "未声明升级策略";
    }
    const firstRisk = upgrade.steps?.[0]?.classification ?? "non-breaking";
    return [
      upgrade.strategy,
      firstRisk,
      upgrade.destructive ? "可能破坏性" : "非破坏性",
      upgrade.steps?.some((step) => step.requiresManualReview) ? "需要人工确认" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
</script>

<svelte:head>
  <title>{listing?.title ?? "蓝图详情"} · 应用市场 · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={listing?.title ?? "蓝图详情"}
  description={listing?.subtitle ?? "查看官方 Blueprint 的组件、依赖资源、环境变量与部署计划。"}
  breadcrumbs={[
    { label: "应用市场", href: "/marketplace" },
    { label: listing?.title ?? slug },
  ]}
>
  {#if webExtensionsQuery.isPending || detailQuery.isPending}
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Skeleton class="h-96 w-full" />
      <Skeleton class="h-96 w-full" />
    </div>
  {:else if !catalogMetadata}
    <section class="console-panel p-5">
      <div class="flex items-start gap-3">
        <Package class="mt-0.5 size-5 text-muted-foreground" />
        <div class="space-y-1">
          <h1 class="text-lg font-semibold">未注册蓝图目录</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            当前运行时没有提供可渲染的蓝图目录扩展元数据。
          </p>
        </div>
      </div>
    </section>
  {:else if detailQuery.isError || !detail || !listing || !manifest || !effectiveManifest}
    <section class="console-panel p-5">
      <div class="flex items-start gap-3">
        <Package class="mt-0.5 size-5 text-destructive" />
        <div class="space-y-1">
          <h1 class="text-lg font-semibold">蓝图暂不可用</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            无法加载这个蓝图。
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
                      <Badge variant="outline">精选</Badge>
                    {/if}
                    {#if listing.publisher}
                      <Badge variant="outline">{listing.publisher.name}</Badge>
                    {/if}
                    {#if variantOptions.length > 0}
                      <Badge variant="outline">方案：{selectedVariantLabel()}</Badge>
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
                      官网
                      <ExternalLink class="size-4" />
                    </Button>
                  {/if}
                  {#if listing.documentationUrl}
                    <Button href={listing.documentationUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
                      文档
                      <ExternalLink class="size-4" />
                    </Button>
                  {/if}
                </div>
              </div>
            </div>
            {#if installEndpoint}
              <Button type="button" class="shrink-0 xl:hidden" onclick={openInstallDialog}>
                配置安装
                <ArrowRight class="size-4" />
              </Button>
            {:else}
              <Button type="button" class="shrink-0 xl:hidden" onclick={openQuickDeployDialog}>
                快速部署
                <ArrowRight class="size-4" />
              </Button>
            {/if}
          </div>
        </section>

        {#if selectedUpgrade || variantOptions.length > 0}
          <section class="console-panel p-5" data-blueprint-variant-display-surface>
            <div class="grid gap-4 lg:grid-cols-2">
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">部署方案</h2>
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
                            <Badge variant="outline">当前方案</Badge>
                          {/if}
                        </div>
                        <span class="mt-1 block text-xs leading-5 text-muted-foreground">
                          {variant.summary ?? "同一 Blueprint 的可选拓扑。"}
                        </span>
                      </article>
                    {/each}
                  </div>
                {:else}
                  <p class="text-sm leading-6 text-muted-foreground">这个 Blueprint 只有默认部署方案。</p>
                {/if}
                <p class="text-xs leading-5 text-muted-foreground">
                  方案选择、Profile 和参数输入在配置安装弹窗内完成；默认页只展示 Blueprint 能创建什么。
                </p>
              </div>
              <div class="space-y-2">
                <h2 class="text-lg font-semibold">升级策略</h2>
                <div class="console-subtle-panel px-3 py-2 text-sm">
                  <p class="font-medium">{upgradeSummary(selectedUpgrade)}</p>
                  <p class="mt-1 text-xs leading-5 text-muted-foreground">
                    {selectedUpgrade?.instructions ??
                      selectedUpgrade?.steps?.[0]?.changes?.[0] ??
                      "升级执行不在 dry-run plan 内自动触发。"}
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
              组件
            </div>
            <p class="mt-3 text-2xl font-semibold">{effectiveManifest.components.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">应用服务、后台任务或静态站点</p>
          </article>
          <article class="console-panel p-4">
            <div class="flex items-center gap-2 text-sm font-medium">
              <PlugZap class="size-4 text-muted-foreground" />
              依赖资源
            </div>
            <p class="mt-3 text-2xl font-semibold">{effectiveManifest.resources.length}</p>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              {dependencyKindSummary()}
            </p>
          </article>
          <article class="console-panel p-4">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Route class="size-4 text-muted-foreground" />
              公开入口
            </div>
            <p class="mt-3 text-2xl font-semibold">
              {effectiveManifest.components.reduce((count, component) => count + component.routes.length, 0)}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">安装后生成访问入口</p>
          </article>
        </section>

        <section class="console-panel p-5">
          <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">介绍</h2>
              <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
                {effectiveManifest.description ?? listing.blueprint.summary ?? listing.subtitle}
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              {#if listing.websiteUrl}
                <Button href={listing.websiteUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
                  官方网站
                  <ExternalLink class="size-4" />
                </Button>
              {/if}
              {#if listing.documentationUrl}
                <Button href={listing.documentationUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
                  部署文档
                  <ExternalLink class="size-4" />
                </Button>
              {/if}
            </div>
          </div>

          <div class="grid gap-5 md:grid-cols-2">
            <div class="space-y-2">
              <h3 class="text-sm font-semibold">适合场景</h3>
              <ul class="space-y-2 text-sm leading-6 text-muted-foreground">
                {#each listing.overview?.useCases ?? [`部署 ${listing.title} 应用`, "先查看拓扑和依赖，再进入部署流程"] as useCase (useCase)}
                  <li class="flex gap-2">
                    <span class="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/55"></span>
                    <span>{useCase}</span>
                  </li>
                {/each}
              </ul>
            </div>
            <div class="space-y-2">
              <h3 class="text-sm font-semibold">Appaloft 会创建</h3>
              <ul class="space-y-2 text-sm leading-6 text-muted-foreground">
                {#each listing.overview?.highlights ?? [
                  `${effectiveManifest.components.length} 个应用运行单元`,
                  effectiveManifest.resources.length > 0
                    ? `${effectiveManifest.resources.map((resource) => resource.kind).join(" / ")} 依赖绑定`
                    : "无托管依赖资源",
                  "项目、环境、资源、网络和部署 dry-run 计划",
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
              <h2 class="text-lg font-semibold">应用拓扑</h2>
              <p class="text-sm text-muted-foreground">安装后会创建的应用运行单元。</p>
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
                    <p class="text-muted-foreground">端口</p>
                    <p class="font-medium">
                      {component.ports.map((port) => `${port.name}:${port.containerPort}/${port.protocol}`).join(", ") || "无"}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground">访问路径</p>
                    <p class="font-medium">
                      {component.routes.map((route) => `${route.port}${route.pathPrefix}`).join(", ") || "无"}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground">依赖绑定</p>
                    <p class="font-medium">
                      {[...component.usesResources, ...component.usesSecrets].join(", ") || "无"}
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
              <h2 class="text-lg font-semibold">依赖资源</h2>
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
                <p class="text-sm text-muted-foreground">这个 Blueprint 不声明外部依赖资源。</p>
              {/each}
            </div>
          </article>

          <article class="console-panel p-5">
            <div class="mb-4 flex items-center gap-2">
              <KeyRound class="size-4 text-muted-foreground" />
              <h2 class="text-lg font-semibold">配置与密钥</h2>
            </div>
            <div class="space-y-3">
              <div>
                <p class="mb-2 text-xs font-medium text-muted-foreground">参数</p>
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
                    <p class="text-sm text-muted-foreground">无参数。</p>
                  {/each}
                </div>
              </div>
              <div>
                <p class="mb-2 text-xs font-medium text-muted-foreground">密钥占位</p>
                <div class="space-y-2">
                  {#each effectiveManifest.secrets as secret (secret.key)}
                    <div class="console-subtle-panel px-3 py-2 text-sm">
                      <div class="flex items-center justify-between gap-3">
                        <span class="font-medium">{secret.label}</span>
                        <Badge variant="outline">{secret.required ? "必填" : "可选"}</Badge>
                      </div>
                      <p class="mt-1 font-mono text-xs text-muted-foreground">{secret.key}</p>
                    </div>
                  {:else}
                    <p class="text-sm text-muted-foreground">无密钥占位。</p>
                  {/each}
                </div>
              </div>
            </div>
          </article>
        </section>

        <section class="console-panel p-5">
          <div class="mb-4 flex items-center gap-2">
            <SlidersHorizontal class="size-4 text-muted-foreground" />
            <h2 class="text-lg font-semibold">环境变量</h2>
          </div>
          <div class="grid gap-2 md:grid-cols-2">
            {#each allVariables as variable (`${variable.key}-${variable.value}`)}
              <div class="console-subtle-panel px-3 py-2 text-sm">
                <p class="font-mono font-medium">{variable.key}</p>
                <p class="mt-1 truncate text-xs text-muted-foreground">{variable.value}</p>
              </div>
            {:else}
              <p class="text-sm text-muted-foreground">默认不写入普通环境变量；依赖和密钥通过 binding/ref 进入 plan。</p>
            {/each}
          </div>
        </section>
      </div>

      <aside class="min-w-0 space-y-5 xl:sticky xl:top-20 xl:self-start">
        <section class="console-side-panel space-y-4" data-blueprint-install-summary>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold">安装入口</h2>
              <p class="text-sm text-muted-foreground">配置、dry-run 和接受安装在弹窗内完成。</p>
            </div>
            <Boxes class="size-5 text-muted-foreground" />
          </div>

          <div class="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">目标方案</span>
              <span class="min-w-0 truncate font-medium">{selectedVariantLabel()}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">默认 Profile</span>
              <span class="font-mono">{profile}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">参数 / 密钥</span>
              <span class="font-mono">{effectiveManifest.parameters.length} / {effectiveManifest.secrets.length}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted-foreground">组件 / 依赖</span>
              <span class="font-mono">{effectiveManifest.components.length} / {effectiveManifest.resources.length}</span>
            </div>
          </div>

          <div class="grid gap-2">
            <Button
              type="button"
              class="hidden xl:inline-flex"
              onclick={openInstallDialog}
              disabled={!installPlanEndpoint}
            >
              {#if planPending || installPending}
                <LoaderCircle class="size-4 animate-spin" />
              {/if}
              配置安装
            </Button>
            <Button type="button" variant="outline" onclick={openQuickDeployDialog}>
              打开快速部署
              <ArrowRight class="size-4" />
            </Button>
          </div>

          {#if planError}
            <div class="console-subtle-panel border-destructive/30 px-3 py-2 text-sm text-destructive">
              {planError}
            </div>
          {/if}

          {#if installError}
            <div class="console-subtle-panel border-destructive/30 px-3 py-2 text-sm text-destructive">
              {installError}
            </div>
          {/if}

          {#if planOutput}
            <details class="console-subtle-panel p-3" data-blueprint-install-plan-result>
              <summary class="cursor-pointer text-sm font-medium">查看 dry-run plan JSON</summary>
              <pre class="mt-3 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(planOutput, null, 2)}</pre>
            </details>
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
                  <span class="text-muted-foreground">当前步骤</span>
                  <span class="font-mono">{installResult.progress.currentStep}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-muted-foreground">应用状态</span>
                  <span class="font-mono">{installResult.progress.status}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-muted-foreground">应用 ID</span>
                  <span class="break-all font-mono">{installResult.progress.applicationId}</span>
                </div>
                <p class="border-t pt-2 leading-5 text-muted-foreground">
                  {installResult.progress.message}
                </p>
              </div>

              <section class="space-y-2" data-blueprint-install-created-resources>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-medium text-muted-foreground">创建的资源</p>
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
                          打开资源
                          <ArrowRight class="size-3.5" />
                        </Button>
                      {:else}
                        <Badge variant="outline">计划中</Badge>
                      {/if}
                    </div>
                  </div>
                {:else}
                  <div class="rounded-md border border-dashed bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    创建的资源还没有返回。等待安装完成，或刷新安装状态。
                  </div>
                {/each}
              </section>

              <section class="space-y-2" data-blueprint-install-dependencies>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-medium text-muted-foreground">依赖资源</p>
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
                          打开治理
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
                        依赖资源已记录，可以从依赖资源页面继续查看绑定、备份和恢复状态。
                      </p>
                    {/if}
                  </div>
                {:else}
                  <div class="rounded-md border border-dashed bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    这个安装结果没有依赖资源；可能不需要依赖，或仍在安装中。
                  </div>
                {/each}
              </section>

              <section class="space-y-2" data-blueprint-install-public-urls>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-medium text-muted-foreground">公开 URL</p>
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
                        打开
                        <ExternalLink class="size-3.5" />
                      </Button>
                    </div>
                  </div>
                {:else}
                  <div class="rounded-md border border-dashed bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    当前安装结果没有公开访问摘要。公开 URL、域名和证书仍从资源网络页或域名绑定页治理。
                  </div>
                {/each}
              </section>

              <section class="space-y-2" data-blueprint-install-component-deployments>
                <p class="text-xs font-medium text-muted-foreground">组件部署</p>
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
                          查看部署
                          <ArrowRight class="size-3.5" />
                        </Button>
                      {:else}
                        <Badge variant="outline">计划中</Badge>
                      {/if}
                    </div>
                  </div>
                {:else}
                  <div class="rounded-md border border-dashed bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    当前安装进度没有组件部署。等待安装继续，或刷新状态。
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
                    刷新安装状态
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
                      打开首个资源
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
                    打开公开 URL
                    <ExternalLink class="size-4" />
                  </Button>
                {/if}
                {#if installResult.progress.deploymentIds[0]}
                  <Button
                    href={progressDeploymentHref(installResult.progress.deploymentIds[0])}
                    variant="outline"
                    class="w-full"
                  >
                    打开最新部署
                    <ArrowRight class="size-4" />
                  </Button>
                {/if}
                {#if installResult.progress.applicationId}
                  <Button
                    href={installedApplicationHref(installResult.progress.applicationId)}
                    variant="outline"
                    class="w-full"
                  >
                    查看安装聚合
                    <ArrowRight class="size-4" />
                  </Button>
                {:else}
                  <div class="rounded-md border border-dashed bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    安装结果页会在应用 ID 返回后出现。现在可以先查看资源或部署记录。
                  </div>
                {/if}
                <Button href="/projects" variant="outline" class="w-full">
                  打开项目列表
                  <ArrowRight class="size-4" />
                </Button>
              </div>
            </div>
          {/if}
        </section>

        {#if upgradePlanEndpoint}
          <section class="console-side-panel space-y-4" data-blueprint-upgrade-summary>
            <div>
              <h2 class="text-lg font-semibold">升级 dry-run</h2>
              <p class="text-sm text-muted-foreground">输入已安装应用 ID 的操作在弹窗内完成。</p>
            </div>

            <div class="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">目标版本</span>
                <span class="font-mono">{listing.blueprint.version}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">目标方案</span>
                <span class="min-w-0 truncate font-medium">{selectedVariantLabel()}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">目标 Profile</span>
                <span class="font-mono">{profile}</span>
              </div>
              {#if upgradeApplicationId}
                <div class="flex items-center justify-between gap-3">
                  <span class="text-muted-foreground">已安装应用</span>
                  <span class="min-w-0 truncate font-mono">{upgradeApplicationId}</span>
                </div>
              {/if}
            </div>

            <Button
              type="button"
              onclick={openUpgradePlanDialog}
              disabled={upgradePlanPending || !upgradePlanEndpoint}
              variant="outline"
              class="w-full"
            >
              {#if upgradePlanPending}
                <LoaderCircle class="size-4 animate-spin" />
              {/if}
              配置升级 dry-run
            </Button>
          </section>
        {/if}

        <Button href="/marketplace" variant="outline" class="w-full">
          <ArrowLeft class="size-4" />
          返回应用市场
        </Button>
      </aside>

      <Dialog.Root bind:open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <Dialog.Content closeLabel="关闭" class="max-w-3xl">
          <Dialog.Header>
            <Dialog.Title>配置 Blueprint 安装</Dialog.Title>
            <Dialog.Description>
              选择本次安装的方案、Profile 和输入值。关闭后默认页只保留安装摘要和执行结果。
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
                  <span class="font-medium">部署方案</span>
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
                    {selectedVariantDefinition?.summary ?? "选择同一应用的不同依赖资源或运行配置。"}
                  </span>
                </label>
              {/if}
            </div>

            {#if effectiveManifest.parameters.length > 0}
              <section class="space-y-3">
                <div>
                  <h3 class="text-sm font-semibold">参数</h3>
                  <p class="mt-1 text-xs leading-5 text-muted-foreground">
                    这些值只用于生成本次 install plan，不代表系统中已经存在的配置。
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
                  <h3 class="text-sm font-semibold">安装密钥</h3>
                  <p class="mt-1 text-xs leading-5 text-muted-foreground">
                    只在接受安装时提交给运行时；安装进度和 dry-run 不会回显密钥值。
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
                  <span class="text-muted-foreground">目标项目</span>
                  <p class="mt-1 font-medium">{listing.title}</p>
                </div>
                <div>
                  <span class="text-muted-foreground">目标环境</span>
                  <p class="mt-1 font-mono">{profile || "production"}</p>
                </div>
              </div>
            </div>

            <Dialog.Footer>
              <Button
                type="button"
                variant="outline"
                onclick={generatePlan}
                disabled={planPending || !installPlanEndpoint}
              >
                {#if planPending}
                  <LoaderCircle class="size-4 animate-spin" />
                {/if}
                生成 dry-run
              </Button>
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
                  接受安装
                </Button>
              {/if}
            </Dialog.Footer>
          </section>
        </Dialog.Content>
      </Dialog.Root>

      {#if upgradePlanEndpoint}
        <Dialog.Root bind:open={upgradePlanDialogOpen} onOpenChange={setUpgradePlanDialogOpen}>
          <Dialog.Content closeLabel="关闭" class="max-w-xl">
            <Dialog.Header>
              <Dialog.Title>配置升级 dry-run</Dialog.Title>
              <Dialog.Description>
                从一个已安装应用读取当前状态，预览升级到当前 Blueprint 方案的风险和差异。
              </Dialog.Description>
            </Dialog.Header>

            <section class="space-y-5 px-5 pb-5" data-blueprint-upgrade-plan-dialog>
              <label class="space-y-1.5 text-sm" data-blueprint-upgrade-from-installed-application>
                <span class="font-medium">已安装应用 ID</span>
                <Input
                  value={upgradeApplicationId}
                  oninput={(event) => {
                    upgradeApplicationId = event.currentTarget.value;
                  }}
                  placeholder="cia_..."
                />
              </label>

              <div class="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-muted-foreground">目标版本</span>
                  <span class="font-mono">{listing.blueprint.version}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-muted-foreground">目标方案</span>
                  <span class="min-w-0 truncate font-medium">{selectedVariantLabel()}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-muted-foreground">目标 Profile</span>
                  <span class="font-mono">{profile}</span>
                </div>
              </div>

              <Dialog.Footer>
                <Button
                  type="button"
                  onclick={generateUpgradePlan}
                  disabled={upgradePlanPending || !upgradePlanEndpoint}
                >
                  {#if upgradePlanPending}
                    <LoaderCircle class="size-4 animate-spin" />
                  {/if}
                  生成升级 dry-run
                </Button>
              </Dialog.Footer>

              {#if upgradePlanError}
                <div class="console-subtle-panel border-destructive/30 px-3 py-2 text-sm text-destructive">
                  {upgradePlanError}
                </div>
              {/if}

              {#if upgradePlanOutput}
                <div class="grid gap-2 rounded-md border border-border p-3 text-xs">
                  <div class="flex flex-wrap gap-2">
                    <Badge variant="outline">{upgradeClassificationLabel(upgradePlanOutput.plan?.classification)}</Badge>
                    <Badge variant="outline">
                      {upgradeDestructiveLabel(upgradePlanOutput.plan?.destructive)}
                    </Badge>
                    <Badge variant="outline">
                      {upgradeReviewLabel(upgradePlanOutput.plan?.requiresManualReview)}
                    </Badge>
                    <Badge variant="outline">
                      {upgradePlanOutput.nonExecution ? "仅生成计划" : "可执行计划"}
                    </Badge>
                  </div>

                  <div class="grid gap-2 sm:grid-cols-2">
                    <div class="rounded-md bg-muted/40 p-2">
                      <p class="text-muted-foreground">当前</p>
                      <p class="mt-1 font-mono">
                        {upgradePlanOutput.current?.source.blueprintVersion ??
                          upgradePlanOutput.plan?.blueprint.fromVersion}
                      </p>
                      <p class="mt-1 truncate">
                        {upgradePlanOutput.current?.source.blueprintVariant ??
                          upgradePlanOutput.plan?.blueprint.fromVariant ??
                          "default"}
                        {" · "}
                        {upgradePlanOutput.current?.source.profile ?? "profile"}
                      </p>
                    </div>
                    <div class="rounded-md bg-muted/40 p-2">
                      <p class="text-muted-foreground">目标</p>
                      <p class="mt-1 font-mono">
                        {upgradePlanOutput.target?.blueprint.version ??
                          upgradePlanOutput.plan?.blueprint.toVersion}
                      </p>
                      <p class="mt-1 truncate">
                        {upgradePlanOutput.target?.blueprint.variant ??
                          upgradePlanOutput.plan?.blueprint.toVariant ??
                          "default"}
                        {" · "}
                        {upgradePlanOutput.target?.blueprint.profile ?? profile}
                      </p>
                    </div>
                  </div>

                  {#if upgradePlanOutput.changes?.length}
                    <ul class="space-y-1">
                      {#each upgradePlanOutput.changes.slice(0, 5) as change (`${change.kind}-${change.summary}`)}
                        <li class="leading-5">
                          <span class="font-medium">{change.classification}</span>
                          {" · "}
                          <span>{change.summary}</span>
                        </li>
                      {/each}
                    </ul>
                  {/if}

                  {#if upgradePlanOutput.preservedUserConfigurationWarnings?.length}
                    <ul class="space-y-1 text-muted-foreground">
                      {#each upgradePlanOutput.preservedUserConfigurationWarnings.slice(0, 4) as warning (warning)}
                        <li>{warning}</li>
                      {/each}
                    </ul>
                  {/if}
                </div>

                <details class="console-subtle-panel p-3">
                  <summary class="cursor-pointer text-sm font-medium">查看 upgrade plan JSON</summary>
                  <pre class="mt-3 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(upgradePlanOutput, null, 2)}</pre>
                </details>
              {/if}
            </section>
          </Dialog.Content>
        </Dialog.Root>
      {/if}
    </div>
  {/if}
</ConsoleShell>

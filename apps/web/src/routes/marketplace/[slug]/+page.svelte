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

  import { request, readErrorMessage } from "$lib/api/client";
  import BlueprintProductIcon from "$lib/components/console/BlueprintProductIcon.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    endpointFromTemplate,
    findBlueprintCatalogExtensionByKey,
    findBlueprintCatalogExtension,
    readBlueprintCatalogExtensionMetadata,
  } from "$lib/console/blueprint-marketplace-extension";

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
  type BlueprintDetailResponse = {
    listing: {
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
    manifest: {
      summary: string;
      description?: string;
      parameters: readonly BlueprintParameter[];
      secrets: readonly { key: string; label: string; required?: boolean; description?: string }[];
      resources: readonly { id: string; kind: string; label: string; optional?: boolean }[];
      components: readonly BlueprintComponent[];
      profiles: Record<string, { label?: string; replicas?: number; variables?: readonly { key: string; value: string }[] }>;
    };
    install: {
      profiles: readonly string[];
      defaultProfile: string;
      parameters: readonly BlueprintParameter[];
      secrets: readonly { key: string; label: string; required?: boolean }[];
    };
  };

  const slug = $derived(page.params.slug ?? "");
  const returnTo = $derived(browser ? page.url.searchParams.get("returnTo") : null);

  let profile = $state("");
  let parameterValues = $state<Record<string, string>>({});
  let planPending = $state(false);
  let planError = $state("");
  let planOutput = $state<unknown>(null);

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

  const detailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["blueprint-catalog-detail", detailEndpoint],
      queryFn: () => request<BlueprintDetailResponse>(detailEndpoint),
      enabled: browser && Boolean(detailEndpoint),
      staleTime: 30_000,
    }),
  );

  const detail = $derived(detailQuery.data ?? null);
  const listing = $derived(detail?.listing ?? null);
  const manifest = $derived(detail?.manifest ?? null);
  const profileNames = $derived(detail?.install.profiles ?? []);
  const selectedProfileDefinition = $derived(
    manifest && profile ? manifest.profiles[profile] : undefined,
  );
  const allVariables = $derived.by(() => {
    const componentVariables = manifest?.components.flatMap((component) => component.variables) ?? [];
    const profileVariables = selectedProfileDefinition?.variables ?? [];
    return [...componentVariables, ...profileVariables];
  });

  $effect(() => {
    if (!detail) {
      return;
    }

    if (!profile || !profileNames.includes(profile)) {
      profile = detail.install.defaultProfile;
    }

    const nextValues = { ...parameterValues };
    let valuesChanged = false;
    for (const parameter of detail.install.parameters) {
      if (nextValues[parameter.key] === undefined) {
        nextValues[parameter.key] = String(parameter.default ?? "");
        valuesChanged = true;
      }
    }
    if (valuesChanged) {
      parameterValues = nextValues;
    }
  });

  function deployHref(): string {
    const url = new URL(returnTo || "/deploy", "https://appaloft.local");
    url.pathname = "/deploy";
    url.searchParams.set("source", "blueprint");
    const sourceExtensionKey =
      deploySourceExtension?.key ?? url.searchParams.get("sourceExtension") ?? "";
    if (sourceExtensionKey) {
      url.searchParams.set("sourceExtension", sourceExtensionKey);
    }
    url.searchParams.set("blueprintSlug", listing?.slug ?? slug);
    url.searchParams.set("blueprintTitle", listing?.title ?? slug);
    url.searchParams.set("step", "project");
    url.searchParams.set("projectMode", "new");
    url.searchParams.set("projectName", listing?.title ?? slug);
    return `${url.pathname}${url.search}`;
  }

  function updateParameter(key: string, value: string): void {
    parameterValues = {
      ...parameterValues,
      [key]: value,
    };
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
    } catch (error) {
      planError = readErrorMessage(error);
    } finally {
      planPending = false;
    }
  }
</script>

<svelte:head>
  <title>{listing?.title ?? "Blueprint"} · Marketplace · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={listing?.title ?? "Marketplace"}
  description={listing?.subtitle ?? "Blueprint detail"}
  breadcrumbs={[
    { label: "Marketplace", href: "/marketplace" },
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
          <h1 class="text-lg font-semibold">未注册 Blueprint Catalog</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            当前运行时没有提供可渲染的 Blueprint catalog extension metadata。
          </p>
        </div>
      </div>
    </section>
  {:else if detailQuery.isError || !detail || !listing || !manifest}
    <section class="console-panel p-5">
      <div class="flex items-start gap-3">
        <Package class="mt-0.5 size-5 text-destructive" />
        <div class="space-y-1">
          <h1 class="text-lg font-semibold">Blueprint 暂不可用</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            无法加载这个 Marketplace Blueprint。
          </p>
        </div>
      </div>
    </section>
  {:else}
    <div class="mx-auto grid w-full max-w-7xl gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
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
                    <Badge variant="outline">{listing.featured ? "Featured" : "Official"}</Badge>
                    <Badge variant="outline">{listing.publisher.name}</Badge>
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
            <Button href={deployHref()} class="shrink-0">
              进入部署流程
              <ArrowRight class="size-4" />
            </Button>
          </div>
        </section>

        <section class="grid gap-3 md:grid-cols-3">
          <article class="console-panel p-4">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Server class="size-4 text-muted-foreground" />
              组件
            </div>
            <p class="mt-3 text-2xl font-semibold">{manifest.components.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">service / worker / static surface</p>
          </article>
          <article class="console-panel p-4">
            <div class="flex items-center gap-2 text-sm font-medium">
              <PlugZap class="size-4 text-muted-foreground" />
              依赖资源
            </div>
            <p class="mt-3 text-2xl font-semibold">{manifest.resources.length}</p>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              {manifest.resources.map((resource) => resource.kind).join(" / ") || "none"}
            </p>
          </article>
          <article class="console-panel p-4">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Route class="size-4 text-muted-foreground" />
              公开入口
            </div>
            <p class="mt-3 text-2xl font-semibold">
              {manifest.components.reduce((count, component) => count + component.routes.length, 0)}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">route intent from Blueprint</p>
          </article>
        </section>

        <section class="console-panel p-5">
          <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">介绍</h2>
              <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
                {manifest.description ?? listing.blueprint.summary ?? listing.subtitle}
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
                  `${manifest.components.length} 个应用运行单元`,
                  manifest.resources.length > 0
                    ? `${manifest.resources.map((resource) => resource.kind).join(" / ")} 依赖绑定`
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
              <p class="text-sm text-muted-foreground">Blueprint 会生成的可部署 workload。</p>
            </div>
            <Badge variant="outline">{listing.blueprint.version}</Badge>
          </div>
          <div class="space-y-3">
            {#each manifest.components as component (component.id)}
              <article class="console-subtle-panel p-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div class="min-w-0">
                    <h3 class="font-semibold">{component.name}</h3>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {component.kind} · {component.runtime.strategy}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {component.runtime.image ?? component.runtime.startCommand ?? component.runtime.outputDirectory ?? "runtime"}
                  </Badge>
                </div>
                <div class="mt-3 grid gap-2 text-xs md:grid-cols-3">
                  <div>
                    <p class="text-muted-foreground">Ports</p>
                    <p class="font-medium">
                      {component.ports.map((port) => `${port.name}:${port.containerPort}/${port.protocol}`).join(", ") || "none"}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground">Routes</p>
                    <p class="font-medium">
                      {component.routes.map((route) => `${route.port}${route.pathPrefix}`).join(", ") || "none"}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground">Bindings</p>
                    <p class="font-medium">
                      {[...component.usesResources, ...component.usesSecrets].join(", ") || "none"}
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
              {#each manifest.resources as resource (resource.id)}
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
                  {#each detail.install.parameters as parameter (parameter.key)}
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
                  {#each detail.install.secrets as secret (secret.key)}
                    <div class="console-subtle-panel px-3 py-2 text-sm">
                      <div class="flex items-center justify-between gap-3">
                        <span class="font-medium">{secret.label}</span>
                        <Badge variant="outline">{secret.required ? "required" : "optional"}</Badge>
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
        <section class="console-side-panel space-y-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold">安装计划</h2>
              <p class="text-sm text-muted-foreground">先生成 dry-run，再决定是否进入部署流程。</p>
            </div>
            <Boxes class="size-5 text-muted-foreground" />
          </div>

          <div class="space-y-3">
            <label class="space-y-1.5">
              <span>Profile</span>
              <select
                class="min-h-9 rounded-md border border-input bg-background px-3 text-sm"
                bind:value={profile}
              >
                {#each profileNames as profileName (profileName)}
                  <option value={profileName}>{profileName}</option>
                {/each}
              </select>
            </label>

            {#each detail.install.parameters as parameter (parameter.key)}
              <label class="space-y-1.5">
                <span>{parameter.label}</span>
                <Input
                  value={parameterValues[parameter.key] ?? ""}
                  oninput={(event) => updateParameter(parameter.key, event.currentTarget.value)}
                  placeholder={String(parameter.default ?? "")}
                />
              </label>
            {/each}
          </div>

          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Button onclick={generatePlan} disabled={planPending}>
              {#if planPending}
                <LoaderCircle class="size-4 animate-spin" />
              {/if}
              Generate dry-run
            </Button>
            <Button href={deployHref()} variant="outline">
              部署流程
              <ArrowRight class="size-4" />
            </Button>
          </div>

          {#if planError}
            <div class="console-subtle-panel border-destructive/30 px-3 py-2 text-sm text-destructive">
              {planError}
            </div>
          {/if}

          {#if planOutput}
            <details class="console-subtle-panel p-3">
              <summary class="cursor-pointer text-sm font-medium">查看 dry-run plan JSON</summary>
              <pre class="mt-3 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(planOutput, null, 2)}</pre>
            </details>
          {/if}
        </section>

        <Button href="/marketplace" variant="outline" class="w-full">
          <ArrowLeft class="size-4" />
          返回 Marketplace
        </Button>
      </aside>
    </div>
  {/if}
</ConsoleShell>

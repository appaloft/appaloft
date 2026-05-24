<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { ArrowRight, ExternalLink, Eye, Package, Search } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  import { request } from "$lib/api/client";
  import BlueprintProductIcon from "$lib/components/console/BlueprintProductIcon.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Input } from "$lib/components/ui/input";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    findBlueprintCatalogExtensionByKey,
    findBlueprintCatalogExtension,
    readBlueprintCatalogExtensionMetadata,
  } from "$lib/console/blueprint-marketplace-extension";

  type CatalogSurface = "page" | "dialog";
  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
  };
  type BlueprintCatalogCategory = {
    key: string;
    label: string;
    description: string;
    count: number;
  };
  type BlueprintCatalogListing = {
    slug: string;
    title: string;
    subtitle: string;
    categoryKey: string;
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
  type BlueprintCatalogListResponse = {
    categories: readonly BlueprintCatalogCategory[];
    items: readonly BlueprintCatalogListing[];
  };

  let {
    surface = "page",
    selectedSlug = "",
    actionLabel = surface === "dialog" ? "选择" : "部署",
    onselect,
    onview,
  }: {
    surface?: CatalogSurface;
    selectedSlug?: string;
    actionLabel?: string;
    onselect?: (item: BlueprintCatalogListing) => void;
    onview?: (item: BlueprintCatalogListing) => void;
  } = $props();

  let searchTerm = $state("");
  let selectedCategoryKey = $state("all");

  const webExtensionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system-plugins", "web-extensions", "blueprint-catalog"],
      queryFn: () => request<SystemPluginWebExtensionsResponse>("/api/system-plugins/web-extensions"),
      enabled: browser,
      staleTime: 30_000,
    }),
  );

  const returnTo = $derived(browser ? page.url.searchParams.get("returnTo") : null);
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
    ) ??
      findBlueprintCatalogExtension(
        webExtensionsQuery.data?.items ?? [],
        surface === "dialog" || page.url.searchParams.get("surface") === "quick-deploy"
          ? "quick-deploy-source"
          : "navigation",
      ) ??
      findBlueprintCatalogExtension(webExtensionsQuery.data?.items ?? [], "navigation"),
  );
  const catalogMetadata = $derived(readBlueprintCatalogExtensionMetadata(catalogExtension));
  const listEndpoint = $derived(catalogMetadata?.listEndpoint ?? "");

  const catalogQuery = createQuery(() =>
    queryOptions({
      queryKey: ["blueprint-catalog", listEndpoint],
      queryFn: () => request<BlueprintCatalogListResponse>(listEndpoint),
      enabled: browser && Boolean(listEndpoint),
      staleTime: 30_000,
    }),
  );

  const categories = $derived(catalogQuery.data?.categories ?? []);
  const listings = $derived(catalogQuery.data?.items ?? []);
  const filteredListings = $derived.by(() => {
    const query = searchTerm.trim().toLowerCase();
    return listings.filter((item) => {
      const categoryMatches = selectedCategoryKey === "all" || item.categoryKey === selectedCategoryKey;
      if (!categoryMatches) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        item.title,
        item.subtitle,
        item.category,
        item.blueprint.summary,
        item.publisher.name,
        ...item.blueprint.tags,
        ...(item.requirementsSummary?.dependencies ?? []),
      ].some((value) => value.toLowerCase().includes(query));
    });
  });
  const groupedListings = $derived.by(() =>
    categories
      .map((category) => ({
        category,
        items: filteredListings.filter((item) => item.categoryKey === category.key),
      }))
      .filter((group) => group.items.length > 0),
  );
  const selectedCategory = $derived(
    categories.find((category) => category.key === selectedCategoryKey) ?? null,
  );

  function listingDetailHref(item: BlueprintCatalogListing): string {
    const params = new URLSearchParams();
    if (returnTo) {
      params.set("returnTo", returnTo);
    }
    const search = params.toString();
    return `/marketplace/${encodeURIComponent(item.slug)}${search ? `?${search}` : ""}`;
  }

  function dependencySummary(item: BlueprintCatalogListing): string {
    const dependencies = item.requirementsSummary?.dependencies ?? [];
    if (dependencies.length === 0) {
      return "无托管依赖";
    }
    return dependencies.join(" / ");
  }

  function portSummary(item: BlueprintCatalogListing): string {
    const ports = item.requirementsSummary?.ports ?? [];
    if (ports.length === 0) {
      return "无公开端口";
    }
    return ports
      .map((port) => port.split(":").at(-1) ?? port)
      .slice(0, 2)
      .join(" / ");
  }

  function handlePrimaryAction(item: BlueprintCatalogListing): void {
    onselect?.(item);
  }
</script>

<section
  class={surface === "dialog" ? "space-y-4" : "mx-auto flex w-full max-w-7xl flex-col gap-5"}
  data-blueprint-marketplace-selector
>
  <div class="console-panel p-4">
    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-end">
      <div class="min-w-0 space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Blueprint Catalog</Badge>
          {#if catalogExtension?.pluginDisplayName}
            <Badge variant="outline">{catalogExtension.pluginDisplayName}</Badge>
          {/if}
        </div>
        <div class="space-y-1">
          <h1 class="text-2xl font-semibold tracking-normal md:text-3xl">
            {catalogExtension?.title ?? "Marketplace"}
          </h1>
          <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
            选择官方 Blueprint，先看清应用组件、依赖资源和部署计划，再进入部署流程。
          </p>
        </div>
      </div>
      <div class="relative min-w-0">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          class="pl-9"
          placeholder="搜索应用、分类、依赖或标签"
          value={searchTerm}
          oninput={(event) => {
            searchTerm = event.currentTarget.value;
          }}
        />
      </div>
    </div>
  </div>

  {#if webExtensionsQuery.isPending || catalogQuery.isPending}
    <div class="grid gap-3 lg:grid-cols-3">
      <Skeleton class="h-48 w-full" />
      <Skeleton class="h-48 w-full" />
      <Skeleton class="h-48 w-full" />
    </div>
  {:else if !catalogMetadata}
    <section class="console-panel p-5">
      <div class="flex items-start gap-3">
        <Package class="mt-0.5 size-5 text-muted-foreground" />
        <div class="space-y-1">
          <h2 class="text-base font-semibold">未注册 Blueprint Catalog</h2>
          <p class="text-sm leading-6 text-muted-foreground">
            当前运行时没有提供可渲染的 Blueprint catalog extension metadata。
          </p>
        </div>
      </div>
    </section>
  {:else if catalogQuery.isError}
    <section class="console-panel p-5">
      <div class="flex items-start gap-3">
        <Package class="mt-0.5 size-5 text-destructive" />
        <div class="space-y-1">
          <h2 class="text-base font-semibold">Marketplace 暂不可用</h2>
          <p class="text-sm leading-6 text-muted-foreground">
            Catalog endpoint 暂时无法返回 Blueprint 列表。
          </p>
        </div>
      </div>
    </section>
  {:else}
    <nav class="flex flex-wrap gap-2" aria-label="Blueprint categories">
      <Button
        type="button"
        size="sm"
        variant={selectedCategoryKey === "all" ? "selected" : "outline"}
        onclick={() => {
          selectedCategoryKey = "all";
        }}
      >
        全部
        <Badge variant="outline">{listings.length}</Badge>
      </Button>
      {#each categories as category (category.key)}
        <Button
          type="button"
          size="sm"
          variant={selectedCategoryKey === category.key ? "selected" : "outline"}
          onclick={() => {
            selectedCategoryKey = category.key;
          }}
        >
          {category.label}
          <Badge variant="outline">{category.count}</Badge>
        </Button>
      {/each}
    </nav>

    {#if selectedCategory}
      <div class="console-subtle-panel p-3 text-sm leading-6 text-muted-foreground">
        <span class="font-medium text-foreground">{selectedCategory.label}</span>
        <span class="mx-2 text-muted-foreground">/</span>
        {selectedCategory.description}
      </div>
    {/if}

    {#if filteredListings.length === 0}
      <section class="console-panel p-5 text-sm text-muted-foreground">
        没有匹配的 Blueprint。
      </section>
    {:else}
      <div class="space-y-6">
        {#each groupedListings as group (group.category.key)}
          <section class="space-y-3">
            <div class="flex items-end justify-between gap-3">
              <div class="min-w-0">
                <h2 class="text-lg font-semibold">{group.category.label}</h2>
                <p class="truncate text-sm text-muted-foreground">{group.category.description}</p>
              </div>
              <Badge variant="outline">{group.items.length}</Badge>
            </div>
            <div class="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {#each group.items as item (item.slug)}
                <article
                  class={`console-panel flex min-h-72 flex-col p-4 ${selectedSlug === item.slug ? "border-ring/45 ring-1 ring-ring/20" : ""}`}
                >
                  <div class="flex min-w-0 items-start justify-between gap-3">
                    <div class="flex min-w-0 items-start gap-3">
                      <BlueprintProductIcon title={item.title} icon={item.icon} />
                      <div class="min-w-0">
                        <h3 class="truncate text-base font-semibold">{item.title}</h3>
                        <p class="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <div class="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline">{item.featured ? "Featured" : "Official"}</Badge>
                      {#if selectedSlug === item.slug}
                        <Badge variant="outline">已选择</Badge>
                      {/if}
                    </div>
                  </div>

                  <p class="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {item.blueprint.summary}
                  </p>

                  <div class="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                    <div class="console-subtle-panel min-w-0 px-3 py-2">
                      <p class="text-muted-foreground">依赖资源</p>
                      <p class="truncate font-medium">{dependencySummary(item)}</p>
                    </div>
                    <div class="console-subtle-panel min-w-0 px-3 py-2">
                      <p class="text-muted-foreground">运行单元</p>
                      <p class="truncate font-medium">
                        {(item.requirementsSummary?.components ?? 1).toString()} component
                      </p>
                    </div>
                    <div class="console-subtle-panel min-w-0 px-3 py-2 sm:col-span-2">
                      <p class="text-muted-foreground">公开入口</p>
                      <p class="truncate font-medium">{portSummary(item)}</p>
                    </div>
                  </div>

                  <div class="mt-4 flex flex-wrap gap-1.5">
                    {#each item.blueprint.tags.slice(0, 5) as tag (tag)}
                      <Badge variant="outline">{tag}</Badge>
                    {/each}
                  </div>

                  <div class="mt-auto flex items-center justify-between gap-3 pt-4">
                    <div class="min-w-0 text-xs text-muted-foreground">
                      <span>{item.publisher.name}</span>
                      <span class="mx-1">/</span>
                      <span>{item.blueprint.version}</span>
                    </div>
                    <div class="flex shrink-0 gap-2">
                      {#if item.websiteUrl}
                        <Button
                          href={item.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          size="icon-sm"
                          variant="outline"
                          aria-label={`${item.title} website`}
                          title={`${item.title} website`}
                        >
                          <ExternalLink class="size-4" />
                        </Button>
                      {/if}
                      {#if onview}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onclick={() => onview?.(item)}
                        >
                          查看
                          <Eye class="size-4" />
                        </Button>
                      {/if}
                      {#if onselect}
                        <Button type="button" size="sm" onclick={() => handlePrimaryAction(item)}>
                          {actionLabel}
                          <ArrowRight class="size-4" />
                        </Button>
                      {:else}
                        <Button href={listingDetailHref(item)} size="sm">
                          {actionLabel}
                          <ArrowRight class="size-4" />
                        </Button>
                      {/if}
                    </div>
                  </div>
                </article>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    {/if}
  {/if}
</section>

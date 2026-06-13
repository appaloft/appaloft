<script lang="ts">
  import BlueprintMarketplaceCard from "./BlueprintMarketplaceCard.svelte";
  import type {
    BlueprintMarketplaceCategory,
    BlueprintMarketplaceCardLabels,
    BlueprintMarketplaceChrome,
    BlueprintMarketplaceListResponse,
    BlueprintMarketplaceListing,
    BlueprintMarketplacePrimaryAction,
    BlueprintMarketplaceSurface,
  } from "./types";
  import {
    createBlueprintDeployHandoffUrl,
    createBlueprintDetailHref,
    createBlueprintMarketplaceEndpoint,
    defaultBlueprintMarketplaceListEndpoint,
  } from "./url";
  import { Skeleton } from "@appaloft/ui/skeleton";

  type BlueprintRegistryEntry = {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly summary: string;
    readonly tags?: readonly string[];
    readonly defaultVariant?: string;
    readonly variants?: readonly {
      readonly id: string;
      readonly label?: string;
      readonly summary?: string;
    }[];
  };

  type BlueprintRegistryListResponse = {
    readonly items: readonly BlueprintRegistryEntry[];
  };

  type Props = {
    readonly apiBaseUrl?: string;
    readonly listEndpoint?: string;
    readonly deployBaseUrl?: string;
    readonly detailBasePath?: string;
    readonly sourceExtension?: string;
    readonly title?: string;
    readonly subtitle?: string;
    readonly badgeLabel?: string;
    readonly pluginDisplayName?: string;
    readonly loading?: boolean;
    readonly chrome?: BlueprintMarketplaceChrome;
    readonly surface?: BlueprintMarketplaceSurface;
    readonly primaryAction?: BlueprintMarketplacePrimaryAction;
    readonly actionLabel?: string;
    readonly selectedSlug?: string;
    readonly onselect?: (item: BlueprintMarketplaceListing) => void;
    readonly onview?: (item: BlueprintMarketplaceListing) => void;
  };

  let {
    apiBaseUrl = "",
    listEndpoint = defaultBlueprintMarketplaceListEndpoint,
    deployBaseUrl = "",
    detailBasePath = "/marketplace",
    sourceExtension = "blueprint-marketplace",
    title = "应用市场",
    subtitle = "选择官方 Blueprint，先看清应用组件、依赖资源和部署计划，再进入部署流程。",
    badgeLabel = "蓝图目录",
    pluginDisplayName = "",
    loading = false,
    chrome = "embedded",
    surface = "page",
    primaryAction = "detail",
    actionLabel = primaryAction === "deploy" ? "部署" : primaryAction === "select" ? "选择" : "查看",
    selectedSlug = "",
    onselect,
    onview,
  }: Props = $props();

  let searchTerm = $state("");
  let selectedCategoryKey = $state("all");
  let isLoading = $state(true);
  let errorMessage = $state("");
  let marketplace = $state<BlueprintMarketplaceListResponse | null>(null);
  let loadRequestId = 0;
  const cardLabels: Partial<BlueprintMarketplaceCardLabels> = {
    dependencies: "依赖资源",
    components: "运行单元",
    variants: "部署方案",
    ports: "公开入口",
    noDependencies: "无托管依赖",
    noPorts: "无公开端口",
    official: "官方",
    featured: "精选",
    selected: "已选择",
    website: "网站",
  };

  const categories = $derived(marketplace?.categories ?? []);
  const listings = $derived(marketplace?.items ?? []);
  const selectedCategory = $derived(
    categories.find((category) => category.key === selectedCategoryKey) ?? null,
  );
  const filteredListings = $derived.by(() => {
    const query = searchTerm.trim().toLowerCase();
    return listings.filter((item) => {
      const categoryMatches =
        selectedCategoryKey === "all" || item.categoryKey === selectedCategoryKey;
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
        item.publisher?.name ?? "",
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

  $effect(() => {
    const endpoint = listEndpoint;
    const baseUrl = apiBaseUrl;
    const catalogIsPending = loading;

    loadRequestId += 1;
    const requestId = loadRequestId;

    if (catalogIsPending) {
      errorMessage = "";
      isLoading = true;
      return;
    }

    if (!endpoint) {
      marketplace = null;
      isLoading = false;
      errorMessage = "没有注册 Blueprint 目录接口。";
      return;
    }

    void loadMarketplace({ baseUrl, endpoint, requestId });
  });

  async function loadMarketplace({
    baseUrl = apiBaseUrl,
    endpoint = listEndpoint,
    requestId = ++loadRequestId,
  }: {
    readonly baseUrl?: string;
    readonly endpoint?: string;
    readonly requestId?: number;
  } = {}): Promise<void> {
    if (!endpoint) {
      isLoading = false;
      errorMessage = "没有注册 Blueprint 目录接口。";
      return;
    }

    isLoading = true;
    errorMessage = "";

    try {
      const response = await fetch(createBlueprintMarketplaceEndpoint(baseUrl, endpoint), {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Blueprint 目录接口返回 ${response.status}`);
      }

      const result = normalizeMarketplaceList(await response.json());
      if (requestId === loadRequestId) {
        marketplace = result;
      }
    } catch (error) {
      if (requestId === loadRequestId) {
        errorMessage = error instanceof Error ? error.message : "Blueprint 目录暂时不可用。";
      }
    } finally {
      if (requestId === loadRequestId) {
        isLoading = false;
      }
    }
  }

  function actionHref(item: BlueprintMarketplaceListing): string {
    if (primaryAction === "deploy") {
      return createBlueprintDeployHandoffUrl({
        deployBaseUrl,
        sourceExtension,
        slug: item.slug,
        title: item.title,
      });
    }

    return createBlueprintDetailHref(detailBasePath, item.slug);
  }

  function normalizeMarketplaceList(value: unknown): BlueprintMarketplaceListResponse {
    if (isMarketplaceListResponse(value)) {
      return value;
    }

    if (isBlueprintRegistryListResponse(value)) {
      const items = value.items.map(registryEntryToListing);
      return {
        categories: [
          {
            key: "blueprints",
            label: "Blueprints",
            description: "Blueprint catalog entries",
            count: items.length,
          },
        ],
        items,
      };
    }

    return { categories: [], items: [] };
  }

  function registryEntryToListing(entry: BlueprintRegistryEntry): BlueprintMarketplaceListing {
    return {
      slug: entry.id,
      title: entry.name,
      subtitle: entry.summary,
      categoryKey: "blueprints",
      category: "Blueprints",
      blueprint: {
        id: entry.id,
        version: entry.version,
        summary: entry.summary,
        tags: entry.tags ?? [],
      },
      ...(entry.defaultVariant ? { defaultVariant: entry.defaultVariant } : {}),
      ...(entry.variants ? { variants: entry.variants } : {}),
    };
  }

  function isMarketplaceListResponse(value: unknown): value is BlueprintMarketplaceListResponse {
    const firstItem = (value as BlueprintMarketplaceListResponse | null)?.items?.[0];
    return (
      Boolean(value) &&
      typeof value === "object" &&
      Array.isArray((value as BlueprintMarketplaceListResponse).categories) &&
      Array.isArray((value as BlueprintMarketplaceListResponse).items) &&
      (firstItem === undefined || "slug" in firstItem)
    );
  }

  function isBlueprintRegistryListResponse(value: unknown): value is BlueprintRegistryListResponse {
    const firstItem = (value as BlueprintRegistryListResponse | null)?.items?.[0];
    return (
      Boolean(value) &&
      typeof value === "object" &&
      Array.isArray((value as BlueprintRegistryListResponse).items) &&
      (firstItem === undefined || "id" in firstItem)
    );
  }

  function categoryButtonLabel(category: BlueprintMarketplaceCategory): string {
    return `${category.label} ${category.count}`;
  }

  function handlePrimaryAction(item: BlueprintMarketplaceListing): void {
    if (primaryAction === "select") {
      onselect?.(item);
    }
  }
</script>

<section
  class:standalone={chrome === "standalone"}
  class:embedded={chrome === "embedded"}
  class="blueprint-marketplace"
  data-marketplace-surface={surface}
  data-blueprint-marketplace-page
>
  <header class="marketplace-hero">
    {#if chrome === "standalone"}
      <a class="marketplace-brand" href="/" aria-label="Appaloft">
        <img src="/appaloft-logo-horizontal.svg" alt="Appaloft" width="188" height="54" />
      </a>
    {/if}
    <div class="hero-copy">
      <div class="badge-row">
        <span>{badgeLabel}</span>
        {#if pluginDisplayName}
          <span>{pluginDisplayName}</span>
        {/if}
      </div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    {#if chrome === "standalone" && deployBaseUrl}
      <div class="hero-actions">
        <a class="secondary-link" href={deployBaseUrl}>打开控制台</a>
      </div>
    {/if}
  </header>

  <div class="marketplace-controls" data-blueprint-marketplace-controls>
    <div class="marketplace-toolbar">
      <label class="search-field">
        <span class="sr-only">搜索 Blueprint 目录</span>
        <input
          data-blueprint-marketplace-search
          type="search"
          placeholder="搜索应用、分类、依赖或标签"
          bind:value={searchTerm}
        />
      </label>
      <div class="catalog-count" aria-live="polite">
        {#if marketplace}
          {filteredListings.length} / {listings.length} 个 Blueprint
        {:else}
          正在加载 Blueprint
        {/if}
      </div>
    </div>

    {#if !isLoading && !errorMessage}
      <nav class="category-tabs" aria-label="Blueprint categories" data-blueprint-marketplace-category-tabs>
        <button
          type="button"
          class:selected={selectedCategoryKey === "all"}
          aria-pressed={selectedCategoryKey === "all"}
          onclick={() => {
            selectedCategoryKey = "all";
          }}
        >
          全部 {listings.length}
        </button>
        {#each categories as category (category.key)}
          <button
            type="button"
            class:selected={selectedCategoryKey === category.key}
            aria-pressed={selectedCategoryKey === category.key}
            title={category.description}
            onclick={() => {
              selectedCategoryKey = category.key;
            }}
          >
            {categoryButtonLabel(category)}
          </button>
        {/each}
      </nav>
    {/if}
  </div>

  {#if isLoading}
    <section class="marketplace-loading" aria-label="正在加载 Blueprint 目录" data-blueprint-marketplace-skeleton>
      <div class="category-tabs is-loading-tabs" aria-hidden="true">
        {#each Array.from({ length: 12 }) as _, index (index)}
          <Skeleton class={index === 1 || index === 8 ? "h-9 w-40 rounded-lg" : "h-9 w-28 rounded-lg"} />
        {/each}
      </div>
      {#each Array.from({ length: 3 }) as _, groupIndex (groupIndex)}
        <section class="marketplace-skeleton-group" aria-hidden="true">
          <div class="group-heading">
            <div>
              <Skeleton class="h-7 w-[190px]" />
              <Skeleton class="mt-2.5 h-4 w-full max-w-[360px]" />
            </div>
            <Skeleton class="h-7 w-[34px]" />
          </div>
          <div class="marketplace-grid">
            {#each Array.from({ length: groupIndex === 2 ? 2 : 4 }) as _, cardIndex (cardIndex)}
              <article class="listing-card is-loading">
                <div class="listing-card-main">
                  <Skeleton class="size-14 rounded-lg" />
                  <div>
                    <Skeleton class="h-[26px] w-2/3" />
                    <Skeleton class="mt-2 h-4 w-full" />
                    <Skeleton class="mt-2 h-4 w-[58%]" />
                  </div>
                </div>
                <Skeleton class="h-12 w-[88%]" />
                <Skeleton class="h-[42px] w-full" />
                <Skeleton class="h-[42px] w-[58%]" />
                <Skeleton class="mt-auto h-[38px] w-full" />
              </article>
            {/each}
          </div>
        </section>
      {/each}
    </section>
  {:else if errorMessage}
    <section class="marketplace-empty">
      <h2>无法加载 Blueprint 目录</h2>
      <p>{errorMessage}</p>
      <button type="button" onclick={() => loadMarketplace()}>重试</button>
    </section>
  {:else}
    {#if selectedCategory}
      <p class="category-note">
        <strong>{selectedCategory.label}</strong>
        <span>/</span>
        {selectedCategory.description}
      </p>
    {/if}

    <div class="marketplace-groups" data-blueprint-marketplace-groups>
      {#each groupedListings as group (group.category.key)}
        <section class="marketplace-group">
          <div class="group-heading">
            <div>
              <h2>{group.category.label}</h2>
              <p>{group.category.description}</p>
            </div>
            <span>{group.items.length}</span>
          </div>
          <div class="marketplace-grid">
            {#each group.items as item (item.slug)}
              <BlueprintMarketplaceCard
                {item}
                actionHref={primaryAction === "select" ? "#" : actionHref(item)}
                {actionLabel}
                labels={cardLabels}
                selected={selectedSlug === item.slug}
                onprimaryaction={(event) => {
                  if (primaryAction === "select") {
                    event.preventDefault();
                    handlePrimaryAction(item);
                  }
                }}
                {onview}
              />
            {/each}
          </div>
        </section>
      {:else}
        <section class="marketplace-empty">
          <h2>没有匹配的 Blueprint</h2>
          <p>试试其他搜索词或分类。</p>
        </section>
      {/each}
    </div>
  {/if}
</section>

<style>
  .blueprint-marketplace {
    --marketplace-background: #f8fafc;
    --marketplace-foreground: #172033;
    --marketplace-muted: #526071;
    --marketplace-border: #dbe2ea;
    --marketplace-border-strong: #c9d3df;
    --marketplace-card: rgba(255, 255, 255, 0.92);
    --marketplace-accent: #0f766e;
    --marketplace-primary: #4e84ff;
    --marketplace-primary-foreground: #ffffff;
    --marketplace-panel-shadow: 0 18px 48px rgba(20, 31, 47, 0.07);
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 18px;
    color: var(--marketplace-foreground);
    font-family:
      "IBM Plex Sans",
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .blueprint-marketplace.standalone {
    min-height: 100svh;
    padding: 24px max(20px, calc((100vw - 1180px) / 2)) 64px;
    background:
      linear-gradient(180deg, rgba(242, 247, 255, 0.95), rgba(255, 255, 255, 0.98) 42%),
      var(--marketplace-background);
  }

  .blueprint-marketplace.embedded {
    width: 100%;
  }

  .marketplace-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 20px;
    align-items: start;
  }

  .standalone .marketplace-hero {
    grid-template-columns: minmax(180px, 220px) minmax(0, 1fr) auto;
    padding: 18px 0 20px;
  }

  .marketplace-brand {
    display: inline-flex;
    width: fit-content;
    line-height: 0;
  }

  .marketplace-brand img {
    width: 188px;
    height: auto;
  }

  .hero-copy {
    min-width: 0;
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .badge-row span,
  .group-heading > span {
    border: 1px solid var(--marketplace-border);
    border-radius: 999px;
    color: var(--marketplace-muted);
    padding: 4px 8px;
    font-size: 0.72rem;
    font-weight: 800;
  }

  .badge-row span:first-child {
    border-color: rgba(15, 118, 110, 0.24);
    color: var(--marketplace-accent);
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    max-width: 720px;
    font-size: clamp(2rem, 6vw, 4.8rem);
    line-height: 0.96;
    letter-spacing: 0;
  }

  .embedded h1 {
    font-size: clamp(1.6rem, 4vw, 2.4rem);
    line-height: 1.1;
  }

  .hero-copy > p {
    max-width: 680px;
    margin-top: 12px;
    color: var(--marketplace-muted);
    font-size: 1rem;
    line-height: 1.7;
  }

  .hero-actions {
    display: flex;
    justify-content: flex-end;
  }

  .secondary-link,
  .marketplace-empty button {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--marketplace-primary);
    border-radius: 8px;
    background: var(--marketplace-primary);
    color: var(--marketplace-primary-foreground);
    padding: 0 12px;
    font: inherit;
    font-weight: 800;
    font-size: 0.82rem;
    text-decoration: none;
    transition:
      transform 160ms ease,
      background 160ms ease;
  }

  .secondary-link {
    background: white;
    border-color: var(--marketplace-border-strong);
    color: var(--marketplace-foreground);
  }

  .secondary-link:hover,
  .marketplace-empty button:hover {
    transform: translateY(-1px);
  }

  .marketplace-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
  }

  .marketplace-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .blueprint-marketplace[data-marketplace-surface="dialog"] .marketplace-controls,
  .blueprint-marketplace[data-marketplace-surface="quick-deploy"] .marketplace-controls {
    position: sticky;
    top: 0;
    z-index: 20;
    margin: -2px -2px 0;
    border-bottom: 1px solid rgba(219, 226, 234, 0.82);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.94)),
      var(--marketplace-card);
    padding: 2px 2px 14px;
    box-shadow: 0 12px 24px rgba(20, 31, 47, 0.06);
    backdrop-filter: blur(10px);
  }

  .search-field input {
    width: 100%;
    min-height: 46px;
    border: 1px solid var(--marketplace-border-strong);
    border-radius: 8px;
    background: white;
    color: var(--marketplace-foreground);
    font: inherit;
    padding: 0 16px;
    outline: none;
  }

  .search-field input:focus {
    border-color: var(--marketplace-primary);
    box-shadow: 0 0 0 3px rgba(78, 132, 255, 0.14);
  }

  .catalog-count,
  .category-note {
    color: #64748b;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .category-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .category-tabs button {
    min-height: 36px;
    border: 1px solid var(--marketplace-border);
    border-radius: 8px;
    background: white;
    color: #425166;
    padding: 0 12px;
    font: inherit;
    font-weight: 800;
  }

  .category-tabs button.selected {
    border-color: color-mix(in srgb, var(--marketplace-primary) 42%, var(--marketplace-border));
    background: color-mix(in srgb, var(--marketplace-primary) 12%, white);
    color: var(--marketplace-primary);
  }

  .category-note {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .marketplace-groups {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .marketplace-loading {
    display: flex;
    min-height: 760px;
    flex-direction: column;
    gap: 28px;
  }

  .marketplace-group,
  .marketplace-skeleton-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .group-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 12px;
  }

  .group-heading h2 {
    font-size: 1.05rem;
  }

  .group-heading p {
    margin-top: 4px;
    color: var(--marketplace-muted);
    font-size: 0.9rem;
  }

  .marketplace-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    gap: 16px;
  }

  .embedded .marketplace-grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  }

  .marketplace-empty {
    border: 1px solid var(--marketplace-border);
    border-radius: 8px;
    background: var(--marketplace-card);
    box-shadow: var(--marketplace-panel-shadow);
  }

  .listing-card-main {
    display: grid;
    min-width: 0;
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 12px;
  }

  .marketplace-empty {
    padding: 28px;
  }

  .marketplace-empty h2 {
    font-size: 1.25rem;
  }

  .marketplace-empty p {
    margin-top: 8px;
    color: var(--marketplace-muted);
  }

  .marketplace-empty button {
    margin-top: 16px;
    cursor: pointer;
  }

  .is-loading-tabs {
    pointer-events: none;
  }

  .listing-card.is-loading {
    min-height: 300px;
  }

  .listing-card.is-loading .listing-card-main {
    grid-template-columns: 56px minmax(0, 1fr);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @keyframes pulse {
    from {
      background-position: 120% 0;
    }
    to {
      background-position: -120% 0;
    }
  }

  @media (max-width: 820px) {
    .blueprint-marketplace.standalone {
      padding: 18px 16px 48px;
    }

    .marketplace-hero,
    .standalone .marketplace-hero,
    .marketplace-toolbar {
      grid-template-columns: 1fr;
    }

    .hero-actions {
      justify-content: flex-start;
    }

    .blueprint-marketplace[data-marketplace-surface="dialog"] .category-tabs,
    .blueprint-marketplace[data-marketplace-surface="quick-deploy"] .category-tabs {
      flex-wrap: nowrap;
      margin-inline: -2px;
      overflow-x: auto;
      padding-inline: 2px;
      padding-bottom: 2px;
      scrollbar-width: thin;
    }

    .blueprint-marketplace[data-marketplace-surface="dialog"] .category-tabs button,
    .blueprint-marketplace[data-marketplace-surface="quick-deploy"] .category-tabs button {
      flex: 0 0 auto;
    }

    h1 {
      font-size: clamp(2rem, 18vw, 4rem);
    }
  }
</style>

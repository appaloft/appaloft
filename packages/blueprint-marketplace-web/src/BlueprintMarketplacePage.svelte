<script lang="ts">
  import type {
    BlueprintMarketplaceCategory,
    BlueprintMarketplaceChrome,
    BlueprintMarketplaceListResponse,
    BlueprintMarketplaceListing,
    BlueprintMarketplacePrimaryAction,
  } from "./types";
  import {
    createBlueprintDeployHandoffUrl,
    createBlueprintDetailHref,
    createBlueprintMarketplaceEndpoint,
    defaultBlueprintMarketplaceListEndpoint,
  } from "./url";
  import { Skeleton } from "@appaloft/ui/skeleton";

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
  let failedIconSlugs = $state<Record<string, true>>({});
  let loadRequestId = 0;

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

      const result = (await response.json()) as BlueprintMarketplaceListResponse;
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

  function dependencySummary(item: BlueprintMarketplaceListing): string {
    const dependencies = item.requirementsSummary?.dependencies ?? [];
    return dependencies.length > 0 ? dependencies.join(" / ") : "无托管依赖";
  }

  function portSummary(item: BlueprintMarketplaceListing): string {
    const ports = item.requirementsSummary?.ports ?? [];
    if (ports.length === 0) {
      return "无公开端口";
    }
    return ports
      .map((port) => port.split(":").at(-1) ?? port)
      .slice(0, 2)
      .join(" / ");
  }

  function iconLabel(item: BlueprintMarketplaceListing): string {
    return (item.icon?.label ?? item.title.slice(0, 2)).trim();
  }

  function hasIconImage(item: BlueprintMarketplaceListing): boolean {
    return Boolean(item.icon?.url && !failedIconSlugs[item.slug]);
  }

  function iconFallbackStyle(item: BlueprintMarketplaceListing): string | undefined {
    return item.icon?.tone
      ? `background:${item.icon.tone};color:white;border-color:${item.icon.tone}`
      : undefined;
  }

  function markIconFailed(item: BlueprintMarketplaceListing): void {
    failedIconSlugs = { ...failedIconSlugs, [item.slug]: true };
  }

  function componentSummary(item: BlueprintMarketplaceListing): string {
    const count = item.requirementsSummary?.components ?? 1;
    return `${count.toString()} 个组件`;
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

  <div class="marketplace-toolbar">
    <label class="search-field">
      <span class="sr-only">搜索 Blueprint 目录</span>
      <input
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
    <nav class="category-tabs" aria-label="Blueprint categories">
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

    {#if selectedCategory}
      <p class="category-note">
        <strong>{selectedCategory.label}</strong>
        <span>/</span>
        {selectedCategory.description}
      </p>
    {/if}

    <div class="marketplace-groups">
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
              <article class:selected={selectedSlug === item.slug} class="listing-card">
                <div class="listing-card-header">
                  <div class="listing-card-main">
                    <div
                      class:has-image={hasIconImage(item)}
                      class="listing-icon"
                      style={hasIconImage(item) ? undefined : iconFallbackStyle(item)}
                    >
                      {#if hasIconImage(item)}
                        <img
                          src={item.icon?.url ?? ""}
                          alt={item.icon?.alt ?? `${item.title} icon`}
                          loading="lazy"
                          decoding="async"
                          onerror={() => {
                            markIconFailed(item);
                          }}
                        />
                      {:else if iconLabel(item)}
                        <span>{iconLabel(item)}</span>
                      {:else}
                        <span aria-hidden="true">□</span>
                      {/if}
                    </div>
                    <div class="listing-title">
                      <h3>{item.title}</h3>
                      <p>{item.subtitle}</p>
                    </div>
                  </div>
                  <div class="status-badges">
                    <span>{item.featured ? "精选" : "官方"}</span>
                    {#if selectedSlug === item.slug}
                      <span>已选择</span>
                    {/if}
                  </div>
                </div>

                <p class="listing-summary">{item.blueprint.summary}</p>

                <dl class="listing-facts">
                  <div>
                    <dt>依赖资源</dt>
                    <dd>{dependencySummary(item)}</dd>
                  </div>
                  <div>
                    <dt>运行单元</dt>
                    <dd>{componentSummary(item)}</dd>
                  </div>
                  <div>
                    <dt>公开入口</dt>
                    <dd>{portSummary(item)}</dd>
                  </div>
                </dl>

                <div class="tag-row">
                  {#each item.blueprint.tags.slice(0, 5) as tag (tag)}
                    <span>{tag}</span>
                  {/each}
                </div>

                <div class="listing-footer">
                  <span>{item.publisher.name} / {item.blueprint.version}</span>
                  <div class="action-row">
                    {#if item.websiteUrl}
                      <a
                        class="icon-link"
                        href={item.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${item.title} website`}
                        title={`${item.title} website`}
                      >
                        ↗
                      </a>
                    {/if}
                    {#if onview}
                      <button type="button" class="outline-action" onclick={() => onview?.(item)}>
                        查看 <span aria-hidden="true">↗</span>
                      </button>
                    {/if}
                    {#if primaryAction === "select"}
                      <button type="button" class="primary-action" onclick={() => handlePrimaryAction(item)}>
                        {actionLabel} <span aria-hidden="true">→</span>
                      </button>
                    {:else}
                      <a class="primary-action" href={actionHref(item)}>{actionLabel} <span aria-hidden="true">→</span></a>
                    {/if}
                  </div>
                </div>
              </article>
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
  .tag-row span,
  .status-badges span,
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
  h3,
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
  .primary-action,
  .outline-action,
  .icon-link,
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

  .secondary-link,
  .outline-action,
  .icon-link {
    background: white;
    border-color: var(--marketplace-border-strong);
    color: var(--marketplace-foreground);
  }

  .icon-link {
    width: 32px;
    padding: 0;
    font-size: 1rem;
  }

  .secondary-link:hover,
  .primary-action:hover,
  .outline-action:hover,
  .icon-link:hover,
  .marketplace-empty button:hover {
    transform: translateY(-1px);
  }

  .marketplace-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
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

  .listing-card,
  .marketplace-empty {
    border: 1px solid var(--marketplace-border);
    border-radius: 8px;
    background: var(--marketplace-card);
    box-shadow: var(--marketplace-panel-shadow);
  }

  .listing-card {
    display: flex;
    min-height: 300px;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
    padding: 16px;
  }

  .listing-card.selected {
    border-color: rgba(15, 118, 110, 0.48);
    box-shadow:
      0 0 0 1px rgba(15, 118, 110, 0.16),
      var(--marketplace-panel-shadow);
  }

  .listing-card-header {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .listing-card-main {
    display: grid;
    min-width: 0;
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 12px;
  }

  .listing-icon {
    display: grid;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--marketplace-border-strong);
    border-radius: 8px;
    background: #eef2ff;
    color: var(--marketplace-foreground);
    font-size: 0.78rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  .listing-icon.has-image {
    border-color: var(--marketplace-border);
    background: white;
    color: var(--marketplace-foreground);
  }

  .listing-icon img {
    width: 26px;
    height: 26px;
    object-fit: contain;
  }

  .listing-title {
    min-width: 0;
  }

  .status-badges {
    display: flex;
    flex-wrap: wrap;
    flex: 0 0 auto;
    justify-content: flex-end;
    gap: 6px;
  }

  .listing-title h3 {
    overflow: hidden;
    font-size: 1rem;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .listing-title p,
  .listing-summary {
    color: var(--marketplace-muted);
    font-size: 0.92rem;
    line-height: 1.55;
  }

  .listing-title p {
    display: -webkit-box;
    margin-top: 5px;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .listing-summary {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .listing-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }

  .listing-facts div {
    display: grid;
    min-width: 0;
    gap: 2px;
    border: 1px solid var(--marketplace-border);
    border-radius: 8px;
    background: color-mix(in srgb, #f8fafc 68%, white);
    padding: 8px 10px;
  }

  .listing-facts div:last-child {
    grid-column: 1 / -1;
  }

  .listing-facts dt {
    color: #64748b;
    font-size: 0.74rem;
    font-weight: 800;
  }

  .listing-facts dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: #26364a;
    font-size: 0.88rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .listing-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px solid #e6ebf1;
    padding-top: 14px;
  }

  .listing-footer > span {
    min-width: 0;
    overflow: hidden;
    color: #64748b;
    font-size: 0.82rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-row {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
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
    .marketplace-toolbar,
    .listing-footer {
      grid-template-columns: 1fr;
    }

    .listing-footer {
      align-items: stretch;
    }

    .hero-actions,
    .action-row {
      justify-content: flex-start;
    }

    h1 {
      font-size: clamp(2rem, 18vw, 4rem);
    }
  }
</style>

<script lang="ts">
  import BlueprintMarketplaceCard from "./BlueprintMarketplaceCard.svelte";
  import type {
    BlueprintMarketplaceCategory,
    BlueprintMarketplaceCardDensity,
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
  import { cn } from "@appaloft/ui/utils";

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
  const featuredListings = $derived(
    filteredListings.filter((item) => item.featured).slice(0, 6),
  );
  const groupedListings = $derived.by(() =>
    categories
      .map((category) => ({
        category,
        items: filteredListings.filter((item) => item.categoryKey === category.key),
      }))
      .filter((group) => group.items.length > 0),
  );
  const cardDensity: BlueprintMarketplaceCardDensity = $derived(
    surface === "dialog" || surface === "quick-deploy" ? "compact" : "default",
  );
  const isDialogSurface = $derived(surface === "dialog" || surface === "quick-deploy");
  const rootClass = $derived(cn(
    "flex min-w-0 flex-col gap-[18px] font-sans text-[#172033]",
    chrome === "standalone"
      ? "min-h-svh bg-[#f8fafc] bg-[linear-gradient(180deg,rgba(242,247,255,0.95),rgba(255,255,255,0.98)_42%)] px-4 pb-12 pt-[18px] min-[821px]:px-[max(20px,calc((100vw-1180px)/2))] min-[821px]:pb-16 min-[821px]:pt-6"
      : "w-full",
    isDialogSurface && "max-[820px]:gap-3.5",
  ));
  const heroClass = $derived(cn(
    "grid items-start gap-5 max-[820px]:grid-cols-1",
    chrome === "standalone"
      ? "grid-cols-[minmax(180px,220px)_minmax(0,1fr)_auto] py-[18px] pb-5"
      : "grid-cols-[minmax(0,1fr)_auto]",
    isDialogSurface && "grid-cols-1 gap-2",
  ));
  const badgeClass =
    "rounded-full border border-[#dbe2ea] px-2 py-1 text-[0.72rem] font-extrabold text-[#526071]";
  const primaryBadgeClass =
    "rounded-full border border-teal-700/25 px-2 py-1 text-[0.72rem] font-extrabold uppercase text-teal-700";
  const heroTitleClass = $derived(cn(
    "m-0 max-w-[720px] tracking-normal",
    isDialogSurface
      ? "text-base font-semibold leading-6"
      : chrome === "embedded"
        ? "text-[clamp(1.6rem,4vw,2.4rem)] leading-[1.1] max-[820px]:text-[clamp(2rem,18vw,4rem)]"
        : "text-[clamp(2rem,6vw,4.8rem)] leading-[0.96] max-[820px]:text-[clamp(2rem,18vw,4rem)]",
  ));
  const heroDescriptionClass = $derived(cn(
    "m-0 mt-3 max-w-[680px] text-base leading-[1.7] text-[#526071]",
    isDialogSurface && "mt-1 max-w-none text-sm leading-6",
  ));
  const controlsClass = $derived(cn(
    "flex flex-col gap-3",
    isDialogSurface &&
      "sticky top-0 z-20 -mx-0.5 mt-[-2px] border-b border-[#dbe2ea]/80 bg-white/95 px-0.5 pb-3.5 pt-4 backdrop-blur max-[820px]:-mx-2.5 max-[820px]:px-2.5 max-[820px]:pb-3 max-[820px]:pt-3",
  ));
  const toolbarClass =
    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 max-[820px]:grid-cols-1";
  const categoryTabsClass = $derived(cn(
    "flex flex-wrap gap-2",
    isDialogSurface &&
      "max-[820px]:-mx-0.5 max-[820px]:flex-nowrap max-[820px]:overflow-x-auto max-[820px]:px-0.5 max-[820px]:pb-0.5 max-[820px]:[scrollbar-width:thin]",
  ));
  const groupsClass = $derived(cn(
    "flex flex-col gap-6",
    isDialogSurface && "max-[820px]:gap-[18px]",
  ));
  const gridClass = $derived(cn(
    "grid gap-4 min-[821px]:grid-cols-2 xl:grid-cols-3",
    chrome === "standalone" && "gap-5",
    isDialogSurface &&
      "gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))] max-[820px]:grid-cols-1 max-[820px]:gap-2.5",
  ));

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

  function categoryTabClass(selected: boolean): string {
    return cn(
      "min-h-9 rounded-lg border border-[#dbe2ea] bg-white px-3 font-sans text-sm font-extrabold text-[#425166]",
      selected && "border-[#9bb8ff] bg-[#edf3ff] text-[#4e84ff]",
      isDialogSurface && "max-[820px]:shrink-0",
    );
  }
</script>

<section class={rootClass} data-marketplace-surface={surface} data-blueprint-marketplace-page>
  <header class={heroClass}>
    {#if chrome === "standalone"}
      <a class="inline-flex w-fit leading-none" href="/" aria-label="Appaloft">
        <img class="h-auto w-[188px]" src="/appaloft-logo-horizontal.svg" alt="Appaloft" width="188" height="54" />
      </a>
    {/if}
    <div class="min-w-0">
      <div class="mb-3 flex flex-wrap gap-2">
        <span class={primaryBadgeClass}>{badgeLabel}</span>
        {#if pluginDisplayName}
          <span class={badgeClass}>{pluginDisplayName}</span>
        {/if}
      </div>
      <h1 class={heroTitleClass}>{title}</h1>
      <p class={heroDescriptionClass}>{subtitle}</p>
    </div>
    {#if chrome === "standalone" && deployBaseUrl}
      <div class="flex justify-end max-[820px]:justify-start">
        <a
          class="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-[#c9d3df] bg-white px-3 text-[0.82rem] font-extrabold text-[#172033] no-underline transition-transform duration-150 hover:-translate-y-px"
          href={deployBaseUrl}
        >
          打开控制台
        </a>
      </div>
    {/if}
  </header>

  <div class={controlsClass} data-blueprint-marketplace-controls>
    <div class={toolbarClass}>
      <label>
        <span class="sr-only">搜索 Blueprint 目录</span>
        <input
          class="min-h-[46px] w-full rounded-lg border border-[#c9d3df] bg-white px-4 font-sans text-[#172033] outline-none focus:border-[#4e84ff] focus:shadow-[0_0_0_3px_rgba(78,132,255,0.14)]"
          data-blueprint-marketplace-search
          type="search"
          placeholder="搜索应用、分类、依赖或标签"
          bind:value={searchTerm}
        />
      </label>
      <div class="text-sm font-bold text-slate-500" aria-live="polite">
        {#if marketplace}
          {filteredListings.length} / {listings.length} 个 Blueprint
        {:else}
          正在加载 Blueprint
        {/if}
      </div>
    </div>

    {#if !isLoading && !errorMessage}
      <nav class={categoryTabsClass} aria-label="Blueprint categories" data-blueprint-marketplace-category-tabs>
        <button
          type="button"
          class={categoryTabClass(selectedCategoryKey === "all")}
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
            class={categoryTabClass(selectedCategoryKey === category.key)}
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
    <section class="flex min-h-[760px] flex-col gap-7" aria-label="正在加载 Blueprint 目录" data-blueprint-marketplace-skeleton>
      <div class={cn(categoryTabsClass, "pointer-events-none")} aria-hidden="true">
        {#each Array.from({ length: 12 }) as _, index (index)}
          <Skeleton class={index === 1 || index === 8 ? "h-9 w-40 rounded-lg" : "h-9 w-28 rounded-lg"} />
        {/each}
      </div>
      {#each Array.from({ length: 3 }) as _, groupIndex (groupIndex)}
        <section class="flex flex-col gap-3" aria-hidden="true">
          <div class="flex items-end justify-between gap-3">
            <div>
              <Skeleton class="h-7 w-[190px]" />
              <Skeleton class="mt-2.5 h-4 w-full max-w-[360px]" />
            </div>
            <Skeleton class="h-7 w-[34px]" />
          </div>
          <div class={gridClass}>
            {#each Array.from({ length: groupIndex === 2 ? 2 : 4 }) as _, cardIndex (cardIndex)}
              <article class="min-h-[300px]">
                <div class="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] gap-3">
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
    <section class="rounded-lg border border-[#dbe2ea] bg-white/90 p-7 shadow-[0_18px_48px_rgba(20,31,47,0.07)]">
      <h2 class="m-0 text-xl">无法加载 Blueprint 目录</h2>
      <p class="m-0 mt-2 text-[#526071]">{errorMessage}</p>
      <button
        class="mt-4 inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#4e84ff] bg-[#4e84ff] px-3 font-sans text-[0.82rem] font-extrabold text-white transition-transform duration-150 hover:-translate-y-px"
        type="button"
        onclick={() => loadMarketplace()}
      >
        重试
      </button>
    </section>
  {:else}
    {#if selectedCategory}
      <p class="m-0 flex flex-wrap gap-2 text-sm font-bold text-slate-500">
        <strong>{selectedCategory.label}</strong>
        <span>/</span>
        {selectedCategory.description}
      </p>
    {/if}

    <div class={groupsClass} data-blueprint-marketplace-groups>
      {#if !isDialogSurface && featuredListings.length > 0}
        <section class="flex flex-col gap-3" data-blueprint-marketplace-featured>
          <div class="flex flex-col gap-1.5">
            <h2 class="m-0 text-[1.2rem]">精选蓝图</h2>
            <p class="m-0 text-sm leading-6 text-[#526071]">
              排序参考官方推荐优先级、GitHub 关注度和近期热度。
            </p>
          </div>
          <div class={gridClass}>
            {#each featuredListings as item (item.slug)}
              <BlueprintMarketplaceCard
                {item}
                actionHref={primaryAction === "select" ? "#" : actionHref(item)}
                {actionLabel}
                density="default"
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

        <section class="flex flex-col gap-3" data-blueprint-marketplace-catalog-heading>
          <div class="flex flex-col gap-1.5">
            <h2 class="m-0 text-[1.2rem]">全部官方蓝图</h2>
            <p class="m-0 text-sm leading-6 text-[#526071]">
              {categories.length} 分类 · {filteredListings.length} 条目
            </p>
          </div>
        </section>
      {/if}

      {#each groupedListings as group (group.category.key)}
        <section class="flex flex-col gap-3">
          <div class="flex items-end justify-between gap-3">
            <div>
              <h2 class="m-0 text-[1.05rem]">{group.category.label}</h2>
              <p class="m-0 mt-1 text-sm text-[#526071]">{group.category.description}</p>
            </div>
            <span class={badgeClass}>{group.items.length}</span>
          </div>
          <div class={gridClass}>
            {#each group.items as item (item.slug)}
              <BlueprintMarketplaceCard
                {item}
                actionHref={primaryAction === "select" ? "#" : actionHref(item)}
                {actionLabel}
                density={cardDensity}
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
        <section class="rounded-lg border border-[#dbe2ea] bg-white/90 p-7 shadow-[0_18px_48px_rgba(20,31,47,0.07)]">
          <h2 class="m-0 text-xl">没有匹配的 Blueprint</h2>
          <p class="m-0 mt-2 text-[#526071]">试试其他搜索词或分类。</p>
        </section>
      {/each}
    </div>
  {/if}
</section>

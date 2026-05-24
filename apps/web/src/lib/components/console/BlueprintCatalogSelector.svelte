<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import {
    BlueprintMarketplacePage,
    type BlueprintMarketplaceListing,
  } from "@appaloft/blueprint-marketplace-web";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";

  import { request } from "$lib/api/client";
  import {
    findBlueprintCatalogExtension,
    findBlueprintCatalogExtensionByKey,
    readBlueprintCatalogExtensionMetadata,
  } from "$lib/console/blueprint-marketplace-extension";

  type CatalogSurface = "page" | "dialog";
  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
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
    onselect?: (item: BlueprintMarketplaceListing) => void;
    onview?: (item: BlueprintMarketplaceListing) => void;
  } = $props();

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
</script>

<div
  class={surface === "dialog" ? "space-y-4" : "mx-auto w-full max-w-7xl"}
  data-blueprint-marketplace-selector
>
  <BlueprintMarketplacePage
    chrome="embedded"
    title={catalogExtension?.title ?? "应用市场"}
    subtitle="选择官方 Blueprint，先看清应用组件、依赖资源和部署计划，再进入部署流程。"
    badgeLabel="蓝图目录"
    loading={webExtensionsQuery.isPending}
    listEndpoint={catalogMetadata?.listEndpoint ?? ""}
    selectedSlug={selectedSlug}
    primaryAction={onselect ? "select" : "detail"}
    actionLabel={actionLabel}
    sourceExtension={catalogExtension?.key ?? "blueprint-marketplace"}
    onselect={onselect}
    onview={onview}
  />
</div>

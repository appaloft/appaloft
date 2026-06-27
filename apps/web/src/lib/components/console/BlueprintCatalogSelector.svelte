<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import {
    BlueprintMarketplacePage,
    type BlueprintMarketplaceListing,
    type BlueprintMarketplaceSurface,
  } from "@appaloft/blueprint-marketplace-web";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";

  import { request } from "$lib/api/client";
  import {
    findBlueprintCatalogExtension,
    findBlueprintCatalogExtensionByKey,
    readBlueprintCatalogExtensionMetadata,
  } from "$lib/console/blueprint-marketplace-extension";
  import { systemPluginExtensionTitle } from "$lib/console/web-extension-presentation";
  import { locale } from "$lib/i18n";

  type CatalogSurface = Extract<BlueprintMarketplaceSurface, "page" | "dialog">;
  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
  };

  let {
    surface = "page",
    selectedSlug = "",
    actionLabel,
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
  const directSourceExtensionKey = $derived(
    browser ? (page.url.searchParams.get("sourceExtension") ?? "") : "",
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
  const requestedSourceExtensionKey = $derived(
    returnToSourceExtensionKey || directSourceExtensionKey,
  );
  const catalogExtension = $derived(
    findBlueprintCatalogExtensionByKey(
      webExtensionsQuery.data?.items ?? [],
      requestedSourceExtensionKey,
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
  const catalogMetadataLoading = $derived(
    webExtensionsQuery.isPending ||
      (browser && !webExtensionsQuery.data && !webExtensionsQuery.error),
  );
  const marketplaceSurface: BlueprintMarketplaceSurface = $derived(
    surface === "dialog"
      ? "dialog"
      : page.url.searchParams.get("surface") === "quick-deploy"
        ? "quick-deploy"
        : "page",
  );
  const catalogTitle = $derived(
    catalogExtension ? systemPluginExtensionTitle(catalogExtension, $locale) : undefined,
  );
</script>

<div
  class={surface === "dialog" ? "space-y-4" : "w-full"}
  data-blueprint-marketplace-selector
>
  <BlueprintMarketplacePage
    chrome="embedded"
    title={catalogTitle}
    locale={$locale}
    loading={catalogMetadataLoading}
    surface={marketplaceSurface}
    listEndpoint={catalogMetadata?.listEndpoint ?? ""}
    selectedSlug={selectedSlug}
    primaryAction={onselect ? "select" : "detail"}
    actionLabel={actionLabel}
    sourceExtension={catalogExtension?.key ?? "blueprint-marketplace"}
    onselect={onselect}
    onview={onview}
  />
</div>

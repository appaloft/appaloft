import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  createBlueprintDeployHandoffUrl,
  createBlueprintDetailHref,
  createBlueprintMarketplaceEndpoint,
  defaultBlueprintMarketplaceListEndpoint,
} from "../src/url";

describe("Blueprint marketplace web URLs", () => {
  test("builds catalog endpoints without owning catalog data", () => {
    expect(defaultBlueprintMarketplaceListEndpoint).toBe("/api/blueprints");
    expect(createBlueprintMarketplaceEndpoint("", "/api/blueprints")).toBe("/api/blueprints");
    expect(createBlueprintMarketplaceEndpoint("https://app.example.test/", "/api/blueprints")).toBe(
      "https://app.example.test/api/blueprints",
    );
  });

  test("builds deploy handoff and detail URLs", () => {
    expect(createBlueprintDetailHref("/marketplace", "pocketbase")).toBe("/marketplace/pocketbase");
    expect(
      createBlueprintDeployHandoffUrl({
        deployBaseUrl: "https://app.example.test/",
        sourceExtension: "blueprint-marketplace",
        slug: "pocketbase",
        title: "PocketBase",
      }),
    ).toBe(
      "https://app.example.test/?modal=quick-deploy&source=blueprint&sourceExtension=blueprint-marketplace&blueprintSlug=pocketbase&blueprintTitle=PocketBase&step=project&projectMode=new&projectName=PocketBase",
    );
  });

  test("keeps product icon and primary button visuals in the shared card component", async () => {
    const [pageSource, cardSource] = await Promise.all([
      readFile(new URL("../src/BlueprintMarketplacePage.svelte", import.meta.url), "utf8"),
      readFile(new URL("../src/BlueprintMarketplaceCard.svelte", import.meta.url), "utf8"),
    ]);

    expect(pageSource).toContain("BlueprintMarketplaceCard");
    expect(pageSource).toContain("readonly surface?: BlueprintMarketplaceSurface");
    expect(pageSource).toContain("data-marketplace-surface={surface}");
    expect(pageSource).toContain('import { cn } from "@appaloft/ui/utils"');
    expect(pageSource).toContain("const controlsClass = $derived");
    expect(pageSource).toContain("pb-3.5 pt-4");
    expect(pageSource).toContain("max-[820px]:pb-3 max-[820px]:pt-3");
    expect(pageSource).not.toContain("shadow-[0_12px");
    expect(pageSource).toContain("data-blueprint-marketplace-search");
    expect(pageSource).toContain("data-blueprint-marketplace-category-tabs");
    expect(pageSource).toContain("data-blueprint-marketplace-groups");
    expect(pageSource).toContain(
      'const isDialogSurface = $derived(surface === "dialog" || surface === "quick-deploy")',
    );
    expect(pageSource).toContain("const cardDensity: BlueprintMarketplaceCardDensity = $derived");
    expect(pageSource).toContain(
      'surface === "dialog" || surface === "quick-deploy" ? "compact" : "default"',
    );
    expect(pageSource).toContain("density={cardDensity}");
    expect(pageSource).toContain("minmax(min(100%,280px),1fr)");
    expect(pageSource).not.toContain("<style>");
    expect(pageSource).toContain("isBlueprintRegistryListResponse(value)");
    expect(pageSource).toContain("registryEntryToListing");
    expect(pageSource).not.toContain('name: "Appaloft"');
    expect(cardSource).toContain("@appaloft/ui/card");
    expect(cardSource).toContain("@appaloft/ui/button");
    expect(cardSource).toContain("@appaloft/ui/badge");
    expect(cardSource).toContain("item.featured");
    expect(cardSource).toContain("iconFailed = true");
    expect(cardSource).toContain("bg-card");
    expect(cardSource).toContain("data-blueprint-marketplace-card");
    expect(cardSource).toContain("data-blueprint-marketplace-facts");
    expect(cardSource).toContain("readonly detailHref?: string");
    expect(cardSource).toContain("{labels.detail}");
    expect(cardSource).toContain("grid-cols-[minmax(6.5rem,7rem)_minmax(0,1fr)]");
    expect(cardSource).toContain("compactFactLabelClass");
    expect(cardSource).not.toContain("grid-cols-[3rem_minmax(0,1fr)]");
    expect(cardSource).not.toContain("<style>");
  });
});

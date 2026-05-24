import { readFile } from "node:fs/promises";
import { type SystemPluginWebExtension } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import {
  endpointFromTemplate,
  findBlueprintCatalogExtension,
  findBlueprintCatalogExtensionByKey,
  readBlueprintCatalogExtensionMetadata,
} from "./blueprint-marketplace-extension";

const marketplaceExtension: SystemPluginWebExtension = {
  key: "example-marketplace",
  pluginName: "example",
  pluginDisplayName: "Example",
  title: "Marketplace",
  path: "/marketplace",
  placement: "navigation",
  target: "console-route",
  requiresAuth: false,
  metadata: {
    renderer: "blueprint-catalog",
    listEndpoint: "/example/blueprints",
    detailEndpointTemplate: "/example/blueprints/{slug}",
    installPlanEndpointTemplate: "/example/blueprints/{slug}/install-plan",
  },
};
const quickDeployExtension: SystemPluginWebExtension = {
  ...marketplaceExtension,
  key: "example-marketplace.quick-deploy-source",
  placement: "quick-deploy-source",
};

describe("Blueprint marketplace console surface", () => {
  test("[CLOUD-BLUEPRINT-UI-NAV-026] renders navigation extensions at workspace level", async () => {
    const shellSource = await readFile(
      new URL("../components/console/ConsoleShell.svelte", import.meta.url),
      "utf8",
    );

    expect(shellSource).toContain("{#each navigationExtensions as extension");
    expect(shellSource).not.toContain("i18nKeys.console.nav.extensions");
  });

  test("[CLOUD-BLUEPRINT-SELECTOR-027] discovers neutral Blueprint catalog extension metadata", () => {
    expect(findBlueprintCatalogExtension([marketplaceExtension], "navigation")).toEqual(
      marketplaceExtension,
    );
    expect(
      findBlueprintCatalogExtensionByKey(
        [marketplaceExtension, quickDeployExtension],
        "example-marketplace.quick-deploy-source",
      ),
    ).toEqual(quickDeployExtension);
    expect(readBlueprintCatalogExtensionMetadata(marketplaceExtension)).toMatchObject({
      renderer: "blueprint-catalog",
      listEndpoint: "/example/blueprints",
    });
    expect(endpointFromTemplate("/example/blueprints/{slug}/install-plan", "n8n")).toBe(
      "/example/blueprints/n8n/install-plan",
    );
  });

  test("[CLOUD-BLUEPRINT-DETAIL-UX-029] keeps Marketplace inside ConsoleShell and hides raw plan JSON behind details", async () => {
    const [listPageSource, detailPageSource, selectorSource, quickDeploySource] = await Promise.all(
      [
        readFile(new URL("../../routes/marketplace/+page.svelte", import.meta.url), "utf8"),
        readFile(new URL("../../routes/marketplace/[slug]/+page.svelte", import.meta.url), "utf8"),
        readFile(
          new URL("../components/console/BlueprintCatalogSelector.svelte", import.meta.url),
          "utf8",
        ),
        readFile(new URL("../components/console/QuickDeploySheet.svelte", import.meta.url), "utf8"),
      ],
    );

    expect(listPageSource).toContain("ConsoleShell");
    expect(detailPageSource).toContain("ConsoleShell");
    expect(selectorSource).toContain("data-blueprint-marketplace-selector");
    expect(detailPageSource).toContain("依赖资源");
    expect(detailPageSource).toContain("环境变量");
    expect(detailPageSource).toContain("<details");
    expect(quickDeploySource).toContain("blueprintSlug");
    expect(quickDeploySource).toContain("selectedBlueprintDetailHref");
  });
});

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
    upgradePlanEndpointTemplate: "/example/blueprints/{slug}/upgrade-plan",
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
      upgradePlanEndpointTemplate: "/example/blueprints/{slug}/upgrade-plan",
    });
    expect(endpointFromTemplate("/example/blueprints/{slug}/install-plan", "n8n")).toBe(
      "/example/blueprints/n8n/install-plan",
    );
  });

  test("[CLOUD-BLUEPRINT-DETAIL-UX-029] keeps Marketplace inside ConsoleShell and hides raw plan JSON behind details", async () => {
    const [
      listPageSource,
      detailPageSource,
      selectorSource,
      sharedPackageSource,
      quickDeploySource,
      viteConfigSource,
    ] = await Promise.all([
      readFile(new URL("../../routes/marketplace/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/marketplace/[slug]/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../components/console/BlueprintCatalogSelector.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../../../packages/blueprint-marketplace-web/src/BlueprintMarketplacePage.svelte",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../components/console/QuickDeploySheet.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../../vite.config.ts", import.meta.url), "utf8"),
    ]);

    expect(listPageSource).toContain("ConsoleShell");
    expect(listPageSource).toContain('title="应用市场"');
    expect(detailPageSource).toContain("ConsoleShell");
    expect(detailPageSource).toContain('title={listing?.title ?? "蓝图详情"}');
    expect(selectorSource).toContain("data-blueprint-marketplace-selector");
    expect(selectorSource).toContain("@appaloft/blueprint-marketplace-web");
    expect(selectorSource).toContain("BlueprintMarketplacePage");
    expect(selectorSource).toContain('title={catalogExtension?.title ?? "应用市场"}');
    expect(selectorSource).toContain('badgeLabel="蓝图目录"');
    expect(selectorSource).toContain("loading={webExtensionsQuery.isPending}");
    expect(selectorSource).not.toContain("pluginDisplayName={catalogExtension");
    expect(selectorSource).not.toContain("@appaloft-cloud");
    expect(sharedPackageSource).toContain("data-blueprint-marketplace-page");
    expect(sharedPackageSource).toContain("data-blueprint-marketplace-skeleton");
    expect(sharedPackageSource).toContain("marketplace-skeleton-group");
    expect(sharedPackageSource).toContain("readonly loading?: boolean");
    expect(sharedPackageSource).toContain('title = "应用市场"');
    expect(sharedPackageSource).not.toContain('title = "Marketplace"');
    expect(detailPageSource).toContain("依赖资源");
    expect(detailPageSource).toContain("环境变量");
    expect(detailPageSource).toContain("官方网站");
    expect(detailPageSource).toContain("部署方案");
    expect(detailPageSource).toContain("升级策略");
    expect(detailPageSource).toContain("upgradePlanEndpoint");
    expect(detailPageSource).toContain("generateUpgradePlan");
    expect(detailPageSource).toContain("生成升级 dry-run");
    expect(detailPageSource).toContain("data-blueprint-upgrade-from-installed-application");
    expect(detailPageSource).toContain("applicationId");
    expect(detailPageSource).toContain("preservedUserConfigurationWarnings");
    expect(detailPageSource).toContain("nonExecution?.marker");
    expect(detailPageSource).not.toContain("currentVersion:");
    expect(detailPageSource).toContain("<details");
    expect(quickDeploySource).toContain("blueprintSlug");
    expect(quickDeploySource).toContain("blueprintVariant");
    expect(quickDeploySource).toContain("selectedBlueprintVariantLabel");
    expect(quickDeploySource).toContain("Dialog.Root bind:open={blueprintSelectorDialogOpen}");
    expect(quickDeploySource).toContain("onselect={applyBlueprintListing}");
    expect(quickDeploySource).toContain("openSelectedBlueprintDetailDialog");
    expect(quickDeploySource).toContain("selectedBlueprintDetailHref");
    expect(quickDeploySource).toContain("data-blueprint-dependency-provisioning");
    expect(quickDeploySource).toContain("blueprintDependencyProvisioningPayload");
    expect(quickDeploySource).toContain("blueprintQuickDeployDependencyProvisioningInput");
    expect(quickDeploySource).toContain('case "dependencyResources.provision"');
    expect(quickDeploySource).toContain("orpcClient.dependencyResources.provisioning.plan");
    expect(quickDeploySource).toContain("orpcClient.dependencyResources.provisioning.accept");
    expect(quickDeploySource).toContain("orpcClient.resources.dependencyBindings.bind");
    expect(quickDeploySource).toContain('from "@thesvg/icons/mysql"');
    expect(quickDeploySource).toContain('from "@thesvg/icons/clickhouse"');
    expect(quickDeploySource).toContain('from "@thesvg/icons/minio"');
    expect(quickDeploySource).toContain('from "@thesvg/icons/opensearch"');
    expect(quickDeploySource).toContain('brandIcon(mysqlIcon, "light")');
    expect(quickDeploySource).not.toContain("simple-icons");
    expect(viteConfigSource).toContain("APPALOFT_WEB_DEV_EXTENSION_PROXY_PREFIXES");
    expect(viteConfigSource).toContain("APPALOFT_WEB_DEV_FS_ALLOW");
    expect(viteConfigSource).toContain("createFsAllow");
    expect(viteConfigSource).toContain("createRuntimeExtensionProxyPrefixes");
  });
});

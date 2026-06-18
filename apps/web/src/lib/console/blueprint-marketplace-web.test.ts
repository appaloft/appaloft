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
    remoteDetailEndpoint: "/example/blueprints/remote",
    remoteInstallEndpoint: "/example/blueprints/remote/install",
    installPlanEndpointTemplate: "/example/blueprints/{slug}/install-plan",
    installEndpointTemplate: "/example/blueprints/{slug}/install",
    upgradePlanEndpointTemplate: "/example/blueprints/{slug}/upgrade-plan",
    installedApplicationEndpointTemplate: "/example/installed-applications/{applicationId}",
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
      remoteDetailEndpoint: "/example/blueprints/remote",
      remoteInstallEndpoint: "/example/blueprints/remote/install",
      installEndpointTemplate: "/example/blueprints/{slug}/install",
      upgradePlanEndpointTemplate: "/example/blueprints/{slug}/upgrade-plan",
      installedApplicationEndpointTemplate: "/example/installed-applications/{applicationId}",
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
      blueprintCatalogSchemaSource,
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
      readFile(
        new URL(
          "../../../../../packages/application/src/operations/blueprints/blueprint-catalog.schema.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    expect(listPageSource).toContain("ConsoleShell");
    expect(listPageSource).toContain('title="应用市场"');
    expect(detailPageSource).toContain("ConsoleShell");
    expect(detailPageSource).toContain('title={listing?.title ?? "蓝图详情"}');
    expect(detailPageSource).toContain("normalizeBlueprintDetailResponse");
    expect(detailPageSource).toContain("response.entry");
    expect(detailPageSource).toContain("blueprintRegistryEntryToListing");
    expect(detailPageSource).toContain('return "";');
    expect(selectorSource).toContain("data-blueprint-marketplace-selector");
    expect(selectorSource).toContain("@appaloft/blueprint-marketplace-web");
    expect(selectorSource).toContain("BlueprintMarketplacePage");
    expect(selectorSource).toContain("marketplaceSurface");
    expect(selectorSource).toContain("directSourceExtensionKey");
    expect(selectorSource).toContain('page.url.searchParams.get("sourceExtension")');
    expect(selectorSource).toContain("requestedSourceExtensionKey");
    expect(selectorSource).toContain('page.url.searchParams.get("surface") === "quick-deploy"');
    expect(selectorSource).toContain("surface={marketplaceSurface}");
    expect(selectorSource).toContain('title={catalogExtension?.title ?? "应用市场"}');
    expect(selectorSource).toContain('badgeLabel="蓝图目录"');
    expect(selectorSource).toContain("catalogMetadataLoading");
    expect(selectorSource).toContain("loading={catalogMetadataLoading}");
    expect(selectorSource).not.toContain("pluginDisplayName={catalogExtension");
    expect(selectorSource).not.toContain("@appaloft-cloud");
    expect(sharedPackageSource).toContain("data-blueprint-marketplace-page");
    expect(sharedPackageSource).toContain("marketplace-controls");
    expect(sharedPackageSource).toContain('data-marketplace-surface="dialog"');
    expect(sharedPackageSource).toContain('data-marketplace-surface="quick-deploy"');
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
    expect(detailPageSource).toContain("应用服务、后台任务或静态站点");
    expect(detailPageSource).toContain("安装后生成访问入口");
    expect(detailPageSource).toContain("安装后会创建的应用运行单元。");
    expect(detailPageSource).toContain("端口");
    expect(detailPageSource).toContain("访问路径");
    expect(detailPageSource).toContain("依赖绑定");
    expect(detailPageSource).toContain("必填");
    expect(detailPageSource).toContain("可选");
    expect(detailPageSource).not.toContain("service / worker / static surface");
    expect(detailPageSource).not.toContain("route intent from Blueprint");
    expect(detailPageSource).not.toContain("可部署 workload");
    expect(detailPageSource).not.toContain(">Ports<");
    expect(detailPageSource).not.toContain(">Routes<");
    expect(detailPageSource).not.toContain(">Bindings<");
    expect(detailPageSource).not.toContain('"required" : "optional"');
    expect(detailPageSource).not.toContain('"resource pending"');
    expect(detailPageSource).not.toContain('"dependency pending"');
    expect(detailPageSource).not.toContain("Generate dry-run");
    expect(detailPageSource).toContain("upgradePlanEndpoint");
    expect(detailPageSource).toContain("installEndpoint");
    expect(detailPageSource).toContain("installedApplicationEndpoint");
    expect(detailPageSource).toContain("acceptInstall");
    expect(detailPageSource).toContain("refreshInstalledApplicationProgress");
    expect(detailPageSource).toContain("data-blueprint-install-progress");
    expect(detailPageSource).not.toContain("data-blueprint-install-operator-work");
    expect(detailPageSource).not.toContain("progressSupportCommand");
    expect(detailPageSource).not.toContain("appaloft work show");
    expect(detailPageSource).toContain("installResult.progress.failure");
    expect(detailPageSource).toContain("查看部署");
    expect(detailPageSource).toContain("data-blueprint-install-secret-inputs");
    expect(detailPageSource).toContain("secretValues: blueprintInstallSecretValueInput()");
    expect(detailPageSource).toContain("progressBadgeLabel");
    expect(detailPageSource).not.toContain("workerId");
    expect(detailPageSource).not.toContain("leaseOwner");
    expect(detailPageSource).toContain("generateUpgradePlan");
    expect(detailPageSource).toContain("生成升级 dry-run");
    expect(detailPageSource).toContain("data-blueprint-upgrade-from-installed-application");
    expect(detailPageSource).toContain("{#if upgradePlanEndpoint}");
    expect(detailPageSource).toContain("applicationId");
    expect(detailPageSource).toContain("preservedUserConfigurationWarnings");
    expect(detailPageSource).toContain("upgradePlanOutput.nonExecution");
    expect(detailPageSource).toContain("仅生成计划");
    expect(detailPageSource).toContain("可执行计划");
    expect(detailPageSource).not.toContain("currentVersion:");
    expect(detailPageSource).toContain("<details");
    expect(quickDeploySource).toContain("blueprintSlug");
    expect(quickDeploySource).toContain("blueprintUrl");
    expect(quickDeploySource).toContain("remoteDetailEndpoint");
    expect(quickDeploySource).toContain("remoteInstallEndpoint");
    expect(quickDeploySource).toContain("selectedBlueprintSourceIsRemoteUrl");
    expect(quickDeploySource).toContain("自定义 Blueprint URL");
    expect(quickDeploySource).toContain("blueprintVariant");
    expect(quickDeploySource).toContain("selectedBlueprintVariantLabel");
    expect(quickDeploySource).toContain("Dialog.Root bind:open={blueprintSelectorDialogOpen}");
    expect(quickDeploySource).toContain("onselect={applyBlueprintListing}");
    expect(quickDeploySource).toContain("openSelectedBlueprintDetailDialog");
    expect(quickDeploySource).toContain("selectedBlueprintDetailHref");
    expect(quickDeploySource).toContain("data-blueprint-dependency-provisioning");
    expect(quickDeploySource).toContain("blueprintDependencyProvisioningPayload");
    expect(quickDeploySource).toContain("installBlueprintFromQuickDeploy");
    expect(quickDeploySource).toContain("orpcClient.blueprints.install");
    expect(quickDeploySource).toContain("orpcClient.blueprints.installation.show");
    expect(quickDeploySource).toContain("observeWorkflowDeploymentProgress");
    expect(quickDeploySource).toContain("requireBlueprintInstallDeploymentTimeline");
    expect(quickDeploySource).not.toContain("startBlueprintInstallDeploymentProgressObservation");
    expect(quickDeploySource).not.toContain("onProgressSummary?.(latestSummary)");
    expect(quickDeploySource).not.toContain("appendBlueprintInstallAcceptedEvent");
    expect(quickDeploySource).toContain("summarizeBlueprintInstallProgress");
    expect(quickDeploySource).not.toContain("startBlueprintDeploymentDiscovery");
    expect(quickDeploySource).not.toContain("orpcClient.operatorWork.eventsStream");
    expect(quickDeploySource).not.toContain("orpcClient.operatorWork.show");
    expect(quickDeploySource).not.toContain("operatorWorkEventStreamEnvelope");
    expect(quickDeploySource).not.toContain("operatorWorkEventResponseEnvelopes");
    expect(quickDeploySource).not.toContain("operatorWorkItemToProgressEvent");
    expect(quickDeploySource).not.toContain("lastOperatorWorkId");
    expect(quickDeploySource).toContain("blueprintInstallAcceptedTitle");
    expect(quickDeploySource).not.toContain('status !== "rollback-required"');
    expect(quickDeploySource).toContain("observeDeploymentProgressAfterAcceptance");
    expect(quickDeploySource).toContain("orpcClient.servers.prepareRuntime");
    expect(quickDeploySource).toContain("servers.testConnectivity");
    expect(quickDeploySource).toContain("runtimeAvailability");
    expect(quickDeploySource).not.toContain("waitForBlueprintInstall");
    expect(quickDeploySource.match(/orpcClient\.blueprints\.install\(/g) ?? []).toHaveLength(1);
    expect(quickDeploySource).toContain("data-blueprint-secret-list");
    expect(quickDeploySource).toContain("secretValues: blueprintInstallSecretValueInput()");
    expect(quickDeploySource).toContain('if (sourceKind === "blueprint")');
    expect(quickDeploySource).toContain("await installBlueprintFromQuickDeploy();");
    expect(quickDeploySource).toMatch(
      /if \(sourceKind === "blueprint"\) \{\s+await installBlueprintFromQuickDeploy\(\);\s+return;\s+\}/,
    );
    expect(quickDeploySource.indexOf('if (sourceKind === "blueprint")')).toBeLessThan(
      quickDeploySource.indexOf("runQuickDeployWorkflow("),
    );
    expect(quickDeploySource).not.toContain("selectedBlueprintInstallPlanEndpoint");
    expect(quickDeploySource).toContain("healthCheckPolicyForSource");
    expect(quickDeploySource).toContain("blueprintComponentForQuickDeploy().healthCheck");
    expect(quickDeploySource).toContain("configureResourceAccessMutation");
    expect(quickDeploySource).toContain("orpcClient.resources.configureAccess");
    expect(quickDeploySource).toContain('case "dependencyResources.provision"');
    expect(quickDeploySource).toContain("orpcClient.dependencyResources.provisioning.plan");
    expect(quickDeploySource).toContain("orpcClient.dependencyResources.provisioning.accept");
    expect(quickDeploySource).not.toContain("capabilities: requirement.capabilities");
    expect(quickDeploySource).toContain("capabilities: item.capabilities");
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
    expect(blueprintCatalogSchemaSource).toContain("BlueprintRegistryDisplayMetadataResponse");
    expect(blueprintCatalogSchemaSource).not.toContain("@appaloft/blueprints");
  });

  test("[MARKETPLACE-CATALOG-IA-001] keeps catalog display-first and out of runtime ownership", async () => {
    const [listPageSource, selectorSource, sharedPackageSource, sharedCardSource] =
      await Promise.all([
        readFile(new URL("../../routes/marketplace/+page.svelte", import.meta.url), "utf8"),
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
        readFile(
          new URL(
            "../../../../../packages/blueprint-marketplace-web/src/BlueprintMarketplaceCard.svelte",
            import.meta.url,
          ),
          "utf8",
        ),
      ]);

    expect(listPageSource).toContain("data-marketplace-catalog-display-surface");
    expect(selectorSource).toContain("data-blueprint-marketplace-selector");
    expect(selectorSource).toContain('primaryAction={onselect ? "select" : "detail"}');
    expect(selectorSource).toContain(
      'subtitle="选择官方 Blueprint，先看清应用组件、依赖资源和部署计划，再进入部署流程。"',
    );
    expect(sharedPackageSource).toContain("data-blueprint-marketplace-page");
    expect(sharedPackageSource).toContain("data-blueprint-marketplace-controls");
    expect(sharedPackageSource).toContain("data-blueprint-marketplace-search");
    expect(sharedPackageSource).toContain("data-blueprint-marketplace-category-tabs");
    expect(sharedPackageSource).toContain("data-blueprint-marketplace-groups");
    expect(sharedPackageSource).toContain("createBlueprintDetailHref");
    expect(sharedPackageSource).toContain("createBlueprintDeployHandoffUrl");
    expect(sharedPackageSource).toContain('primaryAction === "select"');
    expect(sharedPackageSource).not.toContain("<form");
    expect(sharedPackageSource).not.toContain("<textarea");
    expect(sharedPackageSource).not.toContain("orpcClient.resources");
    expect(sharedPackageSource).not.toContain("orpcClient.deployments");
    expect(sharedPackageSource).not.toContain("orpcClient.servers");
    expect(sharedPackageSource).not.toMatch(/\b(delete|destroy|danger|archive)\b/i);
    expect(sharedCardSource).toContain("data-blueprint-marketplace-card");
    expect(sharedCardSource).toContain("data-blueprint-marketplace-facts");
    expect(sharedCardSource).toContain("labels.dependencies");
    expect(sharedCardSource).toContain("labels.ports");
    expect(sharedCardSource).toContain("variantSummary()");
    expect(sharedCardSource).toContain("componentSummary()");
    expect(sharedCardSource).not.toContain("<form");
    expect(sharedCardSource).not.toContain("<textarea");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const homePageSource = readFileSync(
  fileURLToPath(new URL("./+page.svelte", import.meta.url)),
  "utf8",
);

describe("project-first home", () => {
  test("[HOME-PROJECT-FIRST-001] uses list queries for the project entry view", () => {
    expect(homePageSource).toContain("const homeProjectListLimit = 8");
    expect(homePageSource).toContain("orpcClient.projects.list({ limit: homeProjectListLimit })");
    expect(homePageSource).toContain("orpcClient.resources.list({ limit: homeResourceListLimit })");
    expect(homePageSource).toContain(
      "orpcClient.environments.list({ limit: homeEnvironmentListLimit })",
    );
    expect(homePageSource).toContain(
      "orpcClient.deployments.list({ limit: homeDeploymentListLimit })",
    );
  });

  test("[HOME-PROJECT-FIRST-002] demotes raw metrics and avoids dashboard count grids", () => {
    expect(homePageSource).not.toContain("nothing-metric-grid");
    expect(homePageSource).not.toContain("nothing-metric-cell");
    expect(homePageSource).not.toContain("orpcClient.projects.count({})");
    expect(homePageSource).not.toContain("orpcClient.resources.count({})");
    expect(homePageSource).not.toContain("orpcClient.environments.count({})");
    expect(homePageSource).not.toContain("orpcClient.dependencyResources.count({})");
    expect(homePageSource).not.toContain(
      "orpcClient.deployments.count({ statuses: [...activeDeploymentStatuses] })",
    );
    expect(homePageSource).not.toContain('orpcClient.deployments.count({ status: "failed" })');
  });

  test("[HOME-PROJECT-FIRST-003] renders projects as the primary interactive surface", () => {
    expect(homePageSource).toContain("data-home-project-list");
    expect(homePageSource).toContain("data-home-project-row");
    expect(homePageSource).toContain("projectDetailHref(project.id)");
    expect(homePageSource).toContain("visibleProjectResources(project)");
    expect(homePageSource).toContain("resourceDetailHref(resource)");
    expect(homePageSource).toContain("selectCurrentResourceAccessRoute(resource.accessSummary)");
  });

  test("[HOME-PROJECT-FIRST-004] keeps app/resource detail in project and resource routes", () => {
    expect(homePageSource).toContain("i18nKeys.console.home.resourcePreviewLabel");
    expect(homePageSource).toContain("i18nKeys.console.home.accessRouteTitle");
    expect(homePageSource).toContain("i18nKeys.console.home.noResourcesInProject");
    expect(homePageSource).toContain("i18nKeys.common.actions.viewDetails");
    expect(homePageSource).not.toContain("i18nKeys.console.home.projectRelationsTitle");
    expect(homePageSource).not.toContain("i18nKeys.console.home.dashboardOverviewTitle");
  });

  test("[HOME-EMPTY-STATE-001] guides the first deployment only when there is no work", () => {
    expect(homePageSource).toContain("!hasWork");
    expect(homePageSource).toContain("<ConsoleEmptyState");
    expect(homePageSource).toContain('tone="deployment"');
    expect(homePageSource).toContain('href="/deploy"');
    expect(homePageSource).toContain("i18nKeys.console.home.emptyStateTitle");
    expect(homePageSource).toContain("i18nKeys.common.actions.quickDeploy");
  });

  test("[HOME-LAYOUT-001] lets project rows use the available console width", () => {
    expect(homePageSource).toContain(
      'import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";',
    );
    expect(homePageSource).toContain('<ConsoleResourceCanvas class="max-w-none">');
    expect(homePageSource).toContain("container-type: inline-size");
    expect(homePageSource).toContain("@container (min-width: 42rem)");
    expect(homePageSource).not.toContain("@media (min-width: 1320px)");
    expect(homePageSource).not.toContain("@media (min-width: 980px)");
    expect(homePageSource).toContain('<section class="nothing-home-heading">');
    expect(homePageSource).toContain('<div>\n          <p class="nothing-label">');
  });

  test("[HOME-OPERATION-CONTEXT-001] keeps only compact operational context on home", () => {
    expect(homePageSource).toContain("nothing-side-stack");
    expect(homePageSource).toContain("i18nKeys.console.home.operationContextTitle");
    expect(homePageSource).toContain("i18nKeys.console.home.recentDeploymentsTitle");
    expect(homePageSource).toContain("orpcClient.servers.count({})");
    expect(homePageSource).toContain("orpcClient.deployments.count({})");
    expect(homePageSource).not.toContain("nothing-dashboard-grid");
    expect(homePageSource).not.toContain("nothing-ai-section");
  });

  test("[HOME-SKELETON-001] uses the shared shadcn skeleton primitive", () => {
    expect(homePageSource).toContain('import { Skeleton } from "$lib/components/ui/skeleton";');
    expect(homePageSource).toContain("<Skeleton class=");
    expect(homePageSource).not.toContain("nothing-skeleton");
    expect(homePageSource).not.toContain("@keyframes nothing-skeleton");
  });
});

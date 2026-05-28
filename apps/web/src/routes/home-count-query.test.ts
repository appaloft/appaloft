import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const homePageSource = readFileSync(
  fileURLToPath(new URL("./+page.svelte", import.meta.url)),
  "utf8",
);

describe("home count queries", () => {
  test("[HOME-COUNT-QUERY-001] uses count queries for dashboard totals", () => {
    expect(homePageSource).toContain("orpcClient.projects.count({})");
    expect(homePageSource).toContain("orpcClient.servers.count({})");
    expect(homePageSource).toContain("orpcClient.environments.count({})");
    expect(homePageSource).toContain("orpcClient.resources.count({})");
    expect(homePageSource).toContain("orpcClient.dependencyResources.count({})");
    expect(homePageSource).toContain("orpcClient.deployments.count({})");
    expect(homePageSource).toContain(
      "orpcClient.deployments.count({ statuses: [...activeDeploymentStatuses] })",
    );
    expect(homePageSource).toContain('orpcClient.deployments.count({ status: "failed" })');
  });

  test("[HOME-COUNT-QUERY-002] keeps list queries only for rendered list previews", () => {
    expect(homePageSource).toContain("orpcClient.projects.list({ limit: homeProjectListLimit })");
    expect(homePageSource).toContain(
      "orpcClient.deployments.list({ limit: homeDeploymentListLimit })",
    );
    expect(homePageSource).not.toContain("orpcClient.servers.list");
    expect(homePageSource).not.toContain("orpcClient.environments.list");
    expect(homePageSource).not.toContain("orpcClient.resources.list");
    expect(homePageSource).not.toContain("orpcClient.dependencyResources.list");
  });

  test("[HOME-METRIC-NAV-001] renders every metric cell as an interactive navigation cue", () => {
    expect(homePageSource.match(/<a href="[^"]+" class="nothing-metric-cell">/g)).toHaveLength(6);
    expect(homePageSource).not.toContain('<div class="nothing-metric-cell">');
    expect(homePageSource).toContain(".nothing-metric-cell:hover");
    expect(homePageSource).toContain(".nothing-metric-cell:focus-visible");
    expect(homePageSource).toContain('<ArrowRight class="size-3.5" />');
  });

  test("[HOME-METRIC-MOTION-001] keeps metric hover motion smooth and accessible", () => {
    expect(homePageSource).toContain("--nothing-motion-ease: cubic-bezier(0.2, 0, 0, 1);");
    expect(homePageSource).toContain(
      "background-color var(--nothing-motion-duration) var(--nothing-motion-ease)",
    );
    expect(homePageSource).toContain("transform: translate3d(3px, 0, 0);");
    expect(homePageSource).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("[HOME-PAAS-DASHBOARD-001] keeps dependency resources as a compact metric and action", () => {
    expect(homePageSource).toContain("nothing-overview-head");
    expect(homePageSource).toContain("nothing-dashboard-grid");
    expect(homePageSource).not.toContain("nothing-feature-strip");
    expect(homePageSource).not.toContain("i18nKeys.console.home.dependencyResourcesTitle");
    expect(homePageSource).not.toContain("i18nKeys.console.home.dependencyResourcesDescription");
  });

  test("[HOME-PAAS-DASHBOARD-002] does not duplicate the global quick deploy action", () => {
    expect(homePageSource).not.toContain("i18nKeys.common.actions.quickDeploy");
    expect(homePageSource).not.toContain('href="/deploy"');
  });

  test("[HOME-AI-INTEGRATION-001] highlights Skill and MCP docs without adding business actions", () => {
    expect(homePageSource).toContain("nothing-ai-section");
    expect(homePageSource).toContain("webDocsHrefs.appaloftSkill");
    expect(homePageSource).toContain("webDocsHrefs.appaloftMcpServer");
    expect(homePageSource).toContain("i18nKeys.console.home.aiIntegrationSkillTitle");
    expect(homePageSource).toContain("i18nKeys.console.home.aiIntegrationMcpTitle");
    expect(homePageSource).not.toContain("quick_deploy_create");
  });

  test("[HOME-INSTANCE-DIAGNOSTICS-001] keeps instance diagnostics off the home page", () => {
    expect(homePageSource).not.toContain("/api/readiness");
    expect(homePageSource).not.toContain("nothing-system-strip");
    expect(homePageSource).not.toContain("i18nKeys.console.home.readinessCard");
    expect(homePageSource).not.toContain("i18nKeys.console.home.databaseCard");
  });

  test("[HOME-SKELETON-001] uses the shared shadcn skeleton primitive", () => {
    expect(homePageSource).toContain('import { Skeleton } from "$lib/components/ui/skeleton";');
    expect(homePageSource).toContain("<Skeleton class=");
    expect(homePageSource).not.toContain("nothing-skeleton");
    expect(homePageSource).not.toContain("@keyframes nothing-skeleton");
  });
});

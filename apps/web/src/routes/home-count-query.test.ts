import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const homePageSource = readFileSync(
  fileURLToPath(new URL("./+page.svelte", import.meta.url)),
  "utf8",
);

describe("operations workbench home", () => {
  test("[HOME-WORKBENCH-001] uses list queries for cross-project operational context", () => {
    expect(homePageSource).toContain("const homeProjectListLimit = 12");
    expect(homePageSource).toContain("orpc.projects.list.queryOptions({");
    expect(homePageSource).toContain("input: { limit: homeProjectListLimit }");
    expect(homePageSource).toContain("orpc.resources.list.queryOptions({");
    expect(homePageSource).toContain("input: { limit: homeResourceListLimit }");
    expect(homePageSource).toContain("orpc.environments.list.queryOptions({");
    expect(homePageSource).toContain("input: { limit: homeEnvironmentListLimit }");
    expect(homePageSource).toContain("orpc.deployments.list.queryOptions({");
    expect(homePageSource).toContain("input: { limit: homeDeploymentListLimit }");
    expect(homePageSource).toContain("orpc.servers.count.queryOptions({");
    expect(homePageSource).toContain("orpc.deployments.count.queryOptions({");
    expect(homePageSource).toContain("input: { statuses: activeDeploymentStatuses }");
    expect(homePageSource).toContain('input: { status: "failed" }');
    expect(homePageSource).toContain("orpc.resources.count.queryOptions({");
  });

  test("[HOME-WORKBENCH-002] does not render projects as the primary list surface", () => {
    expect(homePageSource).toContain("data-home-workbench-heading");
    expect(homePageSource).toContain("data-home-status-strip");
    expect(homePageSource).toContain("data-home-deployment-watchlist");
    expect(homePageSource).toContain("data-home-attention-workqueue");
    expect(homePageSource).toContain("data-home-active-deployments");
    expect(homePageSource).toContain("data-home-failed-deployments");
    expect(homePageSource).toContain("data-home-deployment-rollup");
    expect(homePageSource).toContain("nothing-status-strip");
    expect(homePageSource).toContain("nothing-status-cell");
    expect(homePageSource).not.toContain("nothing-context-grid");
    expect(homePageSource).not.toContain("nothing-context-cell");
    expect(homePageSource).not.toContain("data-home-project-context");
    expect(homePageSource).not.toContain("data-home-project-list");
    expect(homePageSource).not.toContain("data-home-project-row");
    expect(homePageSource).not.toContain("visibleProjectResources(project)");
    expect(homePageSource).not.toContain("nothing-project-card");
    expect(homePageSource).not.toContain("nothing-project-metrics");
    expect(homePageSource).not.toContain("nothing-project-context-row");
    expect(homePageSource).not.toContain("nothing-project-context-list");
    expect(homePageSource).not.toContain("projectContextLine(project)");
  });

  test("[HOME-WORKBENCH-002A] leads with deployment status instead of a project list", () => {
    expect(homePageSource.indexOf("data-home-deployment-watchlist")).toBeGreaterThan(-1);
    expect(homePageSource.indexOf("data-home-attention-workqueue")).toBeGreaterThan(-1);
    expect(homePageSource.indexOf("data-home-deployment-watchlist")).toBeLessThan(
      homePageSource.indexOf("data-home-attention-workqueue"),
    );
  });

  test("[HOME-WORKBENCH-002B] keeps project resource totals as a non-navigating status card", () => {
    expect(homePageSource).toContain("data-home-resource-status-cell");
    expect(homePageSource).toContain("resourceCountQuery.isPending");
    expect(homePageSource).toContain("resourceTotal");
    expect(homePageSource).not.toContain('href="/resources" class="nothing-status-cell"');
  });

  test("[HOME-WORKBENCH-003] derives attention from deployment and access state", () => {
    expect(homePageSource).toContain(
      'type HomeAttentionReason = "failed" | "running" | "no-access" | "no-deployment"',
    );
    expect(homePageSource).toContain("const attentionItems = $derived.by");
    expect(homePageSource).toContain("failedDeployment");
    expect(homePageSource).toContain("runningDeployment");
    expect(homePageSource).toContain("resourceWithoutAccess");
    expect(homePageSource).toContain("selectCurrentResourceAccessRoute(resource.accessSummary)");
    expect(homePageSource).toContain("deploymentDetailHref(failedDeployment)");
    expect(homePageSource).toContain("deploymentDetailHref(runningDeployment)");
  });

  test("[HOME-WORKBENCH-004] keeps creation in modal/focused entry points", () => {
    expect(homePageSource).toContain("<ConsoleEmptyState");
    expect(homePageSource).toContain('href="/?modal=quick-deploy"');
    expect(homePageSource).toContain("i18nKeys.common.actions.quickDeploy");
    expect(homePageSource).not.toContain('href="/deploy"');
    expect(homePageSource).not.toContain("deployments/new");
    expect(homePageSource).not.toContain("<form");
    expect(homePageSource).not.toContain("ProjectCreateForm");
    expect(homePageSource).not.toContain("ServerRegistrationForm");
  });

  test("[HOME-WORKBENCH-005] marks activity as a read-model gap", () => {
    expect(homePageSource).toContain("data-home-activity-read-model-gap");
    expect(homePageSource).toContain("recentActivityTitle");
    expect(homePageSource).toContain("recentActivityDescription");
    expect(homePageSource).toContain("recentActivityReadModelGap");
    expect(homePageSource).toContain("recentDeploymentsReadModelGap");
    expect(homePageSource).not.toContain("orpcClient.activity");
    expect(homePageSource).not.toContain("orpcClient.events");
    expect(homePageSource).not.toContain("activityQuery");
  });

  test("[HOME-LAYOUT-001] keeps home wide, responsive, and panel based", () => {
    expect(homePageSource).toContain(
      'import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";',
    );
    expect(homePageSource).toContain('<ConsoleResourceCanvas class="max-w-none">');
    expect(homePageSource).toContain("nothing-home-layout");
    expect(homePageSource).toContain("nothing-operations-board");
    expect(homePageSource).toContain("nothing-side-stack");
    expect(homePageSource).not.toContain("@media (min-width: 1320px)");
    expect(homePageSource).not.toContain("letter-spacing: 0.08em");
  });

  test("[HOME-SKELETON-001] uses the shared shadcn skeleton primitive", () => {
    expect(homePageSource).toContain('import { Skeleton } from "$lib/components/ui/skeleton";');
    expect(homePageSource).toContain("<Skeleton class=");
    expect(homePageSource).toContain("const workStateLoading = $derived(");
    expect(homePageSource).toContain("{#if !workStateLoading && !hasWork}");
    expect(homePageSource).toContain("deploymentsLoading");
    expect(homePageSource).toContain("serverCountQuery.isPending");
    expect(homePageSource).toContain("resourceCountQuery.isPending");
    expect(homePageSource).not.toContain("pageLoading");
    expect(homePageSource).not.toContain(
      '<section class="nothing-home-heading" aria-hidden="true">',
    );
    expect(homePageSource).not.toContain("nothing-skeleton");
    expect(homePageSource).not.toContain("@keyframes nothing-skeleton");
  });

  test("[HOME-COPY-001] keeps home copy factual instead of exposing IA intent", () => {
    const zhLocaleSource = readFileSync(
      fileURLToPath(new URL("../../../../packages/i18n/src/locales/zh-CN.ts", import.meta.url)),
      "utf8",
    );
    const enLocaleSource = readFileSync(
      fileURLToPath(new URL("../../../../packages/i18n/src/locales/en-US.ts", import.meta.url)),
      "utf8",
    );

    expect(zhLocaleSource).toContain('projectsHeading: "运行状态"');
    expect(zhLocaleSource).toContain(
      'projectsDescription: "查看跨项目的部署、访问地址和运行目标状态。"',
    );
    expect(zhLocaleSource).toContain('attentionTitle: "项目"');
    expect(zhLocaleSource).toContain('attentionHeading: "项目健康"');
    expect(zhLocaleSource).toContain('nextStepsTitle: "快捷入口"');
    expect(zhLocaleSource).not.toContain("先处理当前");
    expect(zhLocaleSource).not.toContain("最值得");
    expect(zhLocaleSource).not.toContain("值得立刻");
    expect(zhLocaleSource).not.toContain("值得打开");
    expect(zhLocaleSource).not.toContain("只显示值得");
    expect(zhLocaleSource).not.toContain("待处理状态");
    expect(zhLocaleSource).not.toContain("访问地址缺口");
    expect(zhLocaleSource).not.toContain("read model");
    expect(zhLocaleSource).not.toContain("尚未接入");
    expect(zhLocaleSource).not.toContain("暂未开放");
    expect(enLocaleSource).toContain('projectsHeading: "Operations status"');
    expect(enLocaleSource).toContain('attentionTitle: "Projects"');
    expect(enLocaleSource).toContain('attentionHeading: "Project health"');
    expect(enLocaleSource).toContain('nextStepsTitle: "Shortcuts"');
    expect(enLocaleSource).not.toContain("worth opening");
    expect(enLocaleSource).not.toContain("next actions");
    expect(enLocaleSource).not.toContain("Status to review");
    expect(enLocaleSource).not.toContain("Common entries");
    expect(enLocaleSource).not.toContain("Access route gap");
    expect(enLocaleSource).not.toContain("obviously incomplete");
    expect(enLocaleSource).not.toContain("Triage attention");
    expect(enLocaleSource).not.toContain("read model is not connected");
  });
});

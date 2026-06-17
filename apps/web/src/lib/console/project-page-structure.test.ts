import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("project detail page structure", () => {
  test("[PROJECT-IA-001] keeps Project overview outcome-first and moves edits into focused dialogs", async () => {
    const [projectSource, i18nKeysSource, englishLocaleSource, chineseLocaleSource] =
      await Promise.all([
        readFile(
          new URL(
            "../../routes/projects/[projectId=consoleObjectId]/+page.svelte",
            import.meta.url,
          ),
          "utf8",
        ),
        readFile(new URL("../../../../../packages/i18n/src/keys.ts", import.meta.url), "utf8"),
        readFile(
          new URL("../../../../../packages/i18n/src/locales/en-US.ts", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../../../../../packages/i18n/src/locales/zh-CN.ts", import.meta.url),
          "utf8",
        ),
      ]);

    expect(projectSource).toContain('"activity"');
    expect(projectSource).toContain("projectAttentionItems");
    expect(projectSource).toContain("projectNextAction");
    expect(projectSource).toContain("nonEmptyProjectResourceGroups");
    expect(projectSource).toContain("DeploymentStatusBadge");
    expect(projectSource).toContain("i18nKeys.console.projects.healthSummaryGap");
    expect(projectSource).toContain('from "$lib/console/layout-classes"');
    expect(projectSource).toContain("<div class={detailPageClass}>");
    expect(projectSource).toContain("<Tabs.Root value={activeProjectTab} class={detailBodyClass}>");
    expect(projectSource).toContain("detailTabPanelScrollClass");
    expect(projectSource.match(/detailTabPanelScrollClass/g)?.length).toBeGreaterThanOrEqual(7);
    expect(projectSource).not.toContain("console-detail-");
    expect(projectSource).not.toContain("pt-0");
    expect(projectSource).not.toContain('<div class="space-y-0">');
    expect(projectSource).not.toContain('<Tabs.Root value={activeProjectTab} class="space-y-6">');
    expect(projectSource).toContain("EnvironmentCreateForm");
    expect(projectSource).toContain('import * as Select from "$lib/components/ui/select"');
    expect(projectSource).toContain("data-project-monitor-environment-select");
    expect(projectSource).toContain("data-project-resource-environment-filter");
    expect(projectSource).toContain("data-project-resource-deployment-create-dialog");
    expect(projectSource).toContain("<Select.Root bind:value={selectedMonitoringEnvironmentId}");
    expect(projectSource).toContain("<Select.Root bind:value={resourceEnvironmentFilter}");
    expect(projectSource).toContain(
      "onclick={() => openProjectResourceDeploymentDialog(resource)}",
    );
    expect(projectSource).toContain("onDeployResource={openProjectResourceDeploymentDialog}");
    expect(projectSource).not.toContain("openResourceQuickDeploy");
    expect(projectSource).not.toContain("<select");
    expect(projectSource).not.toContain("<option");
    expect(projectSource).toContain("projectRenameDialogOpen");
    expect(projectSource).toContain("environmentRenameDialogOpen");
    expect(projectSource).toContain("environmentCloneDialogOpen");
    expect(projectSource).toContain("i18nKeys.console.projects.activityGapTitle");
    expect(projectSource).toContain("i18nKeys.console.projects.dangerZoneTitle");
    expect(projectSource).toContain('type ProjectSettingsSection = "general" | "danger"');
    expect(projectSource).toContain(
      'const projectSettingsSections = ["general", "danger"] as const',
    );
    expect(projectSource).toContain(
      'parseProjectSettingsSection(page.url.searchParams.get("section"))',
    );
    expect(projectSource).toContain("projectSettingsSectionHref(section)");
    expect(projectSource).toContain("selectProjectSettingsSection(section, event)");
    expect(projectSource).toContain("data-project-settings-display-surface");
    expect(projectSource).toContain("data-project-settings-general");
    expect(projectSource).toContain("detailTabPanelSubnavClass");
    expect(projectSource).toContain("detailSubnavLayoutClass");
    expect(projectSource).toContain("detailSubnavClass");
    expect(projectSource).toContain("subnavListClass");
    expect(projectSource).toContain("subnavItemClass");
    expect(projectSource).toContain("detailSubnavContentClass");
    expect(projectSource.indexOf("data-project-settings-general")).toBeLessThan(
      projectSource.indexOf("data-project-danger-display-surface"),
    );
    expect(projectSource).toContain('{#if activeProjectSettingsSection === "general"}');
    expect(projectSource).toContain('{:else if activeProjectSettingsSection === "danger"}');
    expect(projectSource.indexOf('value="overview"')).toBeLessThan(
      projectSource.indexOf("i18nKeys.console.runtimeUsage.monitorTitle"),
    );
    expect(projectSource.indexOf("data-project-danger-display-surface")).toBeGreaterThan(
      projectSource.indexOf('value="settings"'),
    );
    expect(projectSource).not.toContain(`id={\`environment-rename-form-\${environment.id}\`}`);
    expect(projectSource).not.toContain(`id={\`environment-clone-form-\${environment.id}\`}`);
    expect(projectSource).not.toContain(
      "{resource.lastDeploymentStatus ?? latestDeployment?.status ?? $t(i18nKeys.console.projects.noDeploymentShort)}",
    );
    expect(i18nKeysSource).toContain('activityTitle: "console:projects.activityTitle"');
    expect(i18nKeysSource).toContain('healthSummaryGap: "console:projects.healthSummaryGap"');
    expect(englishLocaleSource).toContain(
      "Project health is shown from deployment status and access state.",
    );
    expect(chineseLocaleSource).toContain("这里按部署状态和访问状态展示项目健康。");
    expect(englishLocaleSource).toContain("Activity summary");
    expect(chineseLocaleSource).toContain("活动汇总");
    expect(englishLocaleSource).not.toContain("Health summary is not available yet");
    expect(chineseLocaleSource).not.toContain("健康汇总暂不可用");
    expect(englishLocaleSource).not.toContain("Project activity is not available yet");
    expect(chineseLocaleSource).not.toContain("项目活动暂不可用");
  });

  test("[PROJECT-DEPLOY-PROGRESS-001] exposes deployment progress without raw worker links", async () => {
    const [
      projectSource,
      quickDeployProgressDialogSource,
      deploymentProgressDialogSource,
      deploymentStatusBadgeSource,
      quickDeploySheetSource,
      operationProgressPanelSource,
      deploymentProgressTerminalSource,
    ] = await Promise.all([
      readFile(
        new URL("../../routes/projects/[projectId=consoleObjectId]/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/console/QuickDeployProgressDialog.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/console/DeploymentProgressDialog.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/console/DeploymentStatusBadge.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../components/console/QuickDeploySheet.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../components/console/OperationProgressPanel.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/console/DeploymentProgressTerminal.svelte", import.meta.url),
        "utf8",
      ),
    ]);

    expect(projectSource).toContain("data-project-attention-progress-item");
    expect(projectSource).toContain("data-project-attention-progress-trigger");
    expect(projectSource).toContain("data-project-attention-status-signal");
    expect(projectSource).not.toContain("data-project-resource-install-failures");
    expect(projectSource).not.toContain("failedProjectBlueprintInstallItems");
    expect(projectSource).toContain("DropdownMenuContent");
    expect(projectSource).toContain("projectAttentionStatusLabel");
    expect(projectSource).toContain("key: `operator-work-${work.id}`");
    expect(projectSource).toContain("{#each projectAttentionItems as item (item.key)}");
    expect(projectSource).not.toContain("work.id, work.step");
    expect(projectSource).not.toContain("item.href ?? item.resourceId ?? item.title");
    expect(quickDeployProgressDialogSource).not.toContain("work {operatorWorkId}");
    expect(quickDeployProgressDialogSource).not.toContain("onOpenOperatorWork");
    expect(quickDeployProgressDialogSource).not.toContain("disabled={pending}");
    expect(quickDeployProgressDialogSource).toContain("embedded?: boolean");
    expect(quickDeployProgressDialogSource).toContain("accessUrl?: string");
    expect(quickDeployProgressDialogSource).toContain("sm:ml-auto sm:justify-end");
    expect(quickDeployProgressDialogSource).toContain("data-quick-deploy-success-access-url");
    expect(quickDeployProgressDialogSource).toContain(
      "i18nKeys.console.deployments.accessUrlTitle",
    );
    expect(quickDeployProgressDialogSource).toContain("i18nKeys.console.deployments.openAccessUrl");
    expect(quickDeployProgressDialogSource).toContain("DeploymentProgressTerminal");
    expect(quickDeployProgressDialogSource).toContain("quick-deploy-confetti");
    expect(deploymentProgressDialogSource).not.toContain('disabled={status === "running"');
    expect(quickDeploySheetSource).toContain("embedded");
    expect(quickDeploySheetSource).toContain("onClose?: () => void");
    expect(quickDeploySheetSource).toContain("function closeQuickDeploySurface()");
    expect(quickDeploySheetSource).toContain("blueprintSelectorDialogOpen = false");
    expect(quickDeploySheetSource).toContain("blueprintDetailDialogOpen = false");
    expect(quickDeploySheetSource).toContain("readBlueprintInstallFinalSummary");
    expect(quickDeploySheetSource).toContain("requireBlueprintInstallDeploymentTimeline");
    expect(quickDeploySheetSource).not.toContain("readBlueprintInstallProgressSummary");
    expect(quickDeploySheetSource).not.toContain("appendBlueprintInstallAcceptedEvent");
    expect(quickDeploySheetSource).not.toContain("startBlueprintOperatorWorkStatusPoll");
    expect(quickDeploySheetSource).not.toContain("orpcClient.operatorWork.show");
    expect(quickDeploySheetSource).not.toContain("startBlueprintDeploymentDiscovery");
    expect(quickDeploySheetSource).not.toContain("orpcClient.operatorWork.eventsStream");
    expect(quickDeploySheetSource).not.toContain("operatorWorkEventStreamEnvelope");
    expect(quickDeploySheetSource).not.toContain("operatorWorkEventResponseEnvelopes");
    expect(quickDeploySheetSource).not.toContain("operatorWorkItemToProgressEvent");
    expect(quickDeploySheetSource).toContain("Promise.race");
    expect(quickDeploySheetSource).toContain("observeBlueprintInstallDeploymentProgress");
    expect(quickDeploySheetSource).toContain("...installSummary.deploymentIds");
    expect(quickDeploySheetSource).toContain("accessUrl={lastAccessUrl}");
    expect(quickDeploySheetSource).toContain("appendWorkflowDeploymentProgressEventOnce");
    expect(quickDeploySheetSource).not.toContain('installSummary.terminalStatus === "running"');
    expect(operationProgressPanelSource).toContain("{#if requestId}");
    expect(operationProgressPanelSource).toContain("DeploymentProgressTerminal");
    expect(deploymentProgressTerminalSource).toContain("Intl.DateTimeFormat");
    expect(deploymentProgressTerminalSource).toContain("new Date(timestamp)");
    expect(deploymentProgressTerminalSource).toContain("data-deployment-progress-terminal");
    expect(deploymentProgressTerminalSource).toContain("progressColumnSource");
    expect(deploymentProgressTerminalSource).toContain('case "docker"');
    expect(deploymentProgressTerminalSource).toContain("bg-zinc-950");
    expect(operationProgressPanelSource).not.toContain("xl:grid-cols");
    expect(deploymentStatusBadgeSource).toContain("data-deployment-running-signal");
    expect(deploymentStatusBadgeSource).toContain("bg-amber-50");
  });
});

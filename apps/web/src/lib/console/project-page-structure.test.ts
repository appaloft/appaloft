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
    expect(projectSource).toContain("i18nKeys.console.projects.healthSummaryGap");
    expect(projectSource).toContain('<div class="console-detail-page">');
    expect(projectSource).toContain(
      '<Tabs.Root value={activeProjectTab} class="console-detail-body">',
    );
    expect(projectSource).toContain("console-detail-tab-panel console-detail-tab-panel-scroll");
    expect(projectSource).not.toContain('<div class="space-y-0">');
    expect(projectSource).not.toContain('<Tabs.Root value={activeProjectTab} class="space-y-6">');
    expect(projectSource).toContain("EnvironmentCreateForm");
    expect(projectSource).toContain('import * as Select from "$lib/components/ui/select"');
    expect(projectSource).toContain("data-project-monitor-environment-select");
    expect(projectSource).toContain("data-project-resource-environment-filter");
    expect(projectSource).toContain("<Select.Root bind:value={selectedMonitoringEnvironmentId}");
    expect(projectSource).toContain("<Select.Root bind:value={resourceEnvironmentFilter}");
    expect(projectSource).not.toContain("<select");
    expect(projectSource).not.toContain("<option");
    expect(projectSource).toContain("projectRenameDialogOpen");
    expect(projectSource).toContain("environmentRenameDialogOpen");
    expect(projectSource).toContain("environmentCloneDialogOpen");
    expect(projectSource).toContain("i18nKeys.console.projects.activityGapTitle");
    expect(projectSource).toContain("i18nKeys.console.projects.dangerZoneTitle");
    expect(projectSource.indexOf('value="overview"')).toBeLessThan(
      projectSource.indexOf("i18nKeys.console.runtimeUsage.monitorTitle"),
    );
    expect(projectSource.indexOf("i18nKeys.console.projects.dangerZoneTitle")).toBeGreaterThan(
      projectSource.indexOf('value="settings"'),
    );
    expect(projectSource).not.toContain(`id={\`environment-rename-form-\${environment.id}\`}`);
    expect(projectSource).not.toContain(`id={\`environment-clone-form-\${environment.id}\`}`);
    expect(i18nKeysSource).toContain('activityTitle: "console:projects.activityTitle"');
    expect(i18nKeysSource).toContain('healthSummaryGap: "console:projects.healthSummaryGap"');
    expect(englishLocaleSource).toContain("Activity read model gap");
    expect(chineseLocaleSource).toContain("Activity read model 缺口");
  });
});

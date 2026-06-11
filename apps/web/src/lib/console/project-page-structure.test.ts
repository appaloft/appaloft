import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("project detail page structure", () => {
  test("[PROJECT-IA-001] keeps Project overview outcome-first and moves edits into focused dialogs", async () => {
    const [projectSource, i18nKeysSource, englishLocaleSource, chineseLocaleSource] =
      await Promise.all([
        readFile(
          new URL("../../routes/projects/[projectId]/+page.svelte", import.meta.url),
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
    expect(projectSource).toContain("EnvironmentCreateForm");
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

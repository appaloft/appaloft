import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("preview environments console page", () => {
  test("[PGP-WEB-001] Web console exposes read-only preview environment records", async () => {
    const [
      pageSource,
      detailSource,
      shellSource,
      resourceSource,
      projectSource,
      querySource,
      clientContractSource,
      i18nKeysSource,
      englishLocaleSource,
      chineseLocaleSource,
    ] = await Promise.all([
      readFile(new URL("../../routes/preview-environments/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../../routes/preview-environments/[previewEnvironmentId=consoleObjectId]/+page.svelte",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../components/console/ConsoleShell.svelte", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../../routes/resources/[resourceId=consoleObjectId]/+page.svelte",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../../routes/projects/[projectId=consoleObjectId]/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("./queries.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../../../../../packages/orpc/src/client-contract.ts", import.meta.url),
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

    expect(pageSource).toContain("i18nKeys.console.previewEnvironments.pageTitle");
    expect(pageSource).toContain("previewEnvironmentsQuery");
    expect(pageSource).toContain("previewEnvironmentsLoading");
    expect(pageSource).toContain("previewEnrichmentLoading");
    expect(pageSource).not.toContain("const pageLoading = $derived");
    expect(pageSource).not.toContain(
      "projectsQuery.isPending ||\n      environmentsQuery.isPending",
    );
    expect(pageSource).toContain("productGradePreviews");
    expect(pageSource).toContain("previewEnvironmentDetailHref");
    expect(detailSource).toContain("orpcClient.previewEnvironments.show");
    expect(detailSource).toContain("orpcClient.previewEnvironments.delete");
    expect(detailSource).toContain("resourceDetailHref");
    expect(detailSource).toContain("i18nKeys.console.previewEnvironments.cleanupAction");
    expect(detailSource).toContain("i18nKeys.console.previewEnvironments.lifecycleManageAction");
    expect(detailSource).toContain("i18nKeys.console.previewEnvironments.lifecycleReady");
    expect(detailSource).toContain("i18nKeys.console.previewEnvironments.lifecycleBlocked");
    expect(detailSource).toContain("cleanupDialogOpen");
    expect(detailSource).toContain("openCleanupDialog");
    expect(detailSource).toContain("data-preview-environment-detail-display-surface");
    expect(detailSource).toContain("data-preview-environment-cleanup-handoff");
    expect(detailSource).toContain("data-preview-environment-cleanup-dialog");
    expect(detailSource).toContain("productGradePreviews");
    expect(detailSource).not.toContain("requestConsoleConfirm");
    expect(detailSource).not.toContain("requestConsolePrompt");
    expect(resourceSource).toContain("previewEnvironments.list");
    expect(resourceSource).toContain("const resourcePreviewsEnabled = $derived");
    expect(resourceSource).toContain('activeTab === "previews"');
    expect(resourceSource).toContain("enabled: resourcePreviewsEnabled");
    expect(resourceSource).toContain("resourcePreviewEnvironmentDetailHref");
    expect(resourceSource).toContain("i18nKeys.console.resources.previewEnvironmentsTab");
    expect(resourceSource).toContain("orpcClient.previewEnvironments.delete");
    expect(resourceSource).toContain("deletePreviewResource");
    expect(resourceSource).toContain('environment?.kind === "preview"');
    expect(projectSource).toContain("type ProjectDetailTab =");
    expect(projectSource).toContain('"preview"');
    expect(projectSource).toContain("projectPreviewEnvironmentsQuery");
    expect(projectSource).toContain("orpcClient.previewEnvironments.list");
    expect(projectSource).toContain("projectId,");
    expect(projectSource).toContain("includePreviewResources: true");
    expect(projectSource).toContain("projectPreviewResources");
    expect(projectSource).toContain('environment.kind === "preview"');
    expect(projectSource).toContain("resourcePreviewEnvironmentDetailHref");
    expect(projectSource).toContain("i18nKeys.console.projects.previewTitle");
    expect(querySource).toContain("previewEnvironmentsQuery");
    expect(querySource).toContain("orpcClient.previewEnvironments.list");
    expect(shellSource).not.toContain('href: "/preview-environments"');
    expect(clientContractSource).toContain("previewEnvironments: {");
    expect(clientContractSource).toContain("ListPreviewEnvironmentsResponse");
    expect(i18nKeysSource).toContain('previewTitle: "console:projects.previewTitle"');
    expect(englishLocaleSource).toContain("Preview resources");
    expect(chineseLocaleSource).toContain("Preview 资源");

    const detailDisplaySurface =
      detailSource.match(
        /<div class="space-y-8" data-preview-environment-detail-display-surface>[\s\S]*?<\/div>\s*<Dialog\.Root bind:open={cleanupDialogOpen}>/,
      )?.[0] ?? "";
    const headerActionSource =
      detailSource.match(
        /<section class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">[\s\S]*?<\/section>/,
      )?.[0] ?? "";
    const cleanupHandoffSource =
      detailSource.match(
        /<div class="rounded-md border bg-muted\/15 px-3 py-2" data-preview-environment-cleanup-handoff>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
      )?.[0] ?? "";
    const cleanupDialogSource =
      detailSource.match(
        /<Dialog\.Root bind:open={cleanupDialogOpen}[\s\S]*?data-preview-environment-cleanup-dialog[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    expect(headerActionSource).toContain("common.actions.openResource");
    expect(headerActionSource).not.toContain("openCleanupDialog");
    expect(detailDisplaySurface).toContain("data-preview-environment-cleanup-handoff");
    expect(detailDisplaySurface).not.toContain("data-preview-environment-cleanup-dialog");
    expect(detailDisplaySurface).not.toContain('variant="destructive"');
    expect(detailDisplaySurface).not.toContain("onclick={requestCleanup}");
    expect(detailDisplaySurface).not.toContain("previewEnvironments.cleanupAction");
    expect(detailDisplaySurface).not.toContain("<Trash2");
    expect(cleanupHandoffSource).toContain('type="button"');
    expect(cleanupHandoffSource).toContain("onclick={openCleanupDialog}");
    expect(cleanupHandoffSource).toContain("lifecycleManageAction");
    expect(cleanupHandoffSource).toContain("lifecycleReady");
    expect(cleanupHandoffSource).toContain("lifecycleBlocked");
    expect(cleanupHandoffSource).not.toContain("onclick={requestCleanup}");
    expect(cleanupHandoffSource).not.toContain("cleanupAction");
    expect(cleanupHandoffSource).not.toContain("<Trash2");
    expect(cleanupDialogSource).toContain("onclick={requestCleanup}");
    expect(cleanupDialogSource).toContain('variant="destructive"');
    expect(cleanupDialogSource).toContain("<Trash2");
    expect(cleanupDialogSource).toContain("cleanupConfirm");
    expect(cleanupDialogSource).toContain("previewEnvironment.resourceId");
  });
});

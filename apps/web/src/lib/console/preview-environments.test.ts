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
          "../../routes/preview-environments/[previewEnvironmentId]/+page.svelte",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../components/console/ConsoleShell.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../routes/projects/[projectId]/+page.svelte", import.meta.url), "utf8"),
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
    expect(pageSource).toContain("productGradePreviews");
    expect(pageSource).toContain("previewEnvironmentDetailHref");
    expect(detailSource).toContain("orpcClient.previewEnvironments.show");
    expect(detailSource).toContain("orpcClient.previewEnvironments.delete");
    expect(detailSource).toContain("resourceDetailHref");
    expect(detailSource).toContain("i18nKeys.console.previewEnvironments.cleanupAction");
    expect(detailSource).toContain("productGradePreviews");
    expect(resourceSource).toContain("previewEnvironments.list");
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
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("preview environments console page", () => {
  test("[PGP-WEB-001] Web console exposes read-only preview environment records", async () => {
    const [pageSource, shellSource, querySource, clientContractSource] = await Promise.all([
      readFile(new URL("../../routes/preview-environments/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../components/console/ConsoleShell.svelte", import.meta.url), "utf8"),
      readFile(new URL("./queries.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../../../../../packages/orpc/src/client-contract.ts", import.meta.url),
        "utf8",
      ),
    ]);

    expect(pageSource).toContain("i18nKeys.console.previewEnvironments.pageTitle");
    expect(pageSource).toContain("previewEnvironmentsQuery");
    expect(pageSource).toContain("productGradePreviews");
    expect(pageSource).toContain("resourceDetailHref");
    expect(querySource).toContain("orpcClient.previewEnvironments.list");
    expect(shellSource).toContain('href: "/preview-environments"');
    expect(shellSource).toContain("i18nKeys.console.nav.previewEnvironments");
    expect(clientContractSource).toContain("previewEnvironments: {");
    expect(clientContractSource).toContain("ListPreviewEnvironmentsResponse");
  });
});

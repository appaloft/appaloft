import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("preview policies console page", () => {
  test("[PGP-WEB-002] Web console exposes preview policy readback and configure controls", async () => {
    const [pageSource, shellSource] = await Promise.all([
      readFile(new URL("../../routes/preview-policies/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../components/console/ConsoleShell.svelte", import.meta.url), "utf8"),
    ]);

    expect(pageSource).toContain("orpcClient.previewPolicies.show");
    expect(pageSource).toContain("orpcClient.previewPolicies.configure");
    expect(pageSource).toContain("i18nKeys.console.previewPolicies.pageTitle");
    expect(pageSource).toContain("productGradePreviews");
    expect(pageSource).toContain("selectedScopeKind");
    expect(shellSource).toContain('href: "/preview-policies"');
    expect(shellSource).toContain("i18nKeys.console.nav.previewPolicies");
  });
});

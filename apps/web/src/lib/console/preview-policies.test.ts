import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("preview policies console page", () => {
  test("[PGP-WEB-002] Web console exposes preview policy readback and configure controls", async () => {
    const [pageSource, shellSource] = await Promise.all([
      readFile(new URL("../../routes/preview-policies/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../components/console/ConsoleShell.svelte", import.meta.url), "utf8"),
    ]);

    expect(pageSource).toContain("orpc.previewPolicies.show.queryOptions");
    expect(pageSource).toContain("orpcClient.previewPolicies.configure");
    expect(pageSource).toContain("i18nKeys.console.previewPolicies.pageTitle");
    expect(pageSource).toContain("productGradePreviews");
    expect(pageSource).toContain("selectedScopeKind");
    expect(pageSource).toContain("scopeDialogOpen");
    expect(pageSource).toContain("data-preview-policy-scope-display-surface");
    expect(pageSource).toContain("data-preview-policy-scope-dialog");
    expect(shellSource).toContain('href: "/preview-policies"');
    expect(shellSource).toContain("i18nKeys.console.nav.previewPolicies");
  });

  test("[PGP-WEB-003] keeps preview policy editing behind an intent dialog", async () => {
    const pageSource = await readFile(
      new URL("../../routes/preview-policies/+page.svelte", import.meta.url),
      "utf8",
    );

    const scopeDisplaySource =
      pageSource.match(
        /<section[\s\S]*?data-preview-policy-scope-display-surface[\s\S]*?<\/section>/,
      )?.[0] ?? "";
    const summarySource =
      pageSource.match(
        /<section class="console-panel space-y-5 p-5" data-preview-policy-summary>[\s\S]*?<Dialog\.Root/,
      )?.[0] ?? "";
    const scopeDialogSource =
      pageSource.match(
        /<Dialog\.Root bind:open={scopeDialogOpen}[\s\S]*?data-preview-policy-scope-dialog[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";
    const dialogSource =
      pageSource.match(
        /<Dialog\.Root bind:open={policyEditDialogOpen}[\s\S]*?data-preview-policy-edit-dialog[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    expect(pageSource).toContain("policyEditDialogOpen");
    expect(pageSource).toContain("function openPolicyEditDialog()");
    expect(pageSource).toContain("function closePolicyEditDialog()");
    expect(pageSource).toContain("data-preview-policy-summary");
    expect(pageSource).toContain("data-preview-policy-edit-dialog");
    expect(pageSource).toContain("data-preview-policy-scope-display-surface");
    expect(pageSource).toContain("data-preview-policy-scope-dialog");
    expect(scopeDisplaySource).toContain("onclick={openScopeDialog}");
    expect(scopeDisplaySource).not.toContain("<form");
    expect(scopeDisplaySource).not.toContain("<Input");
    expect(scopeDisplaySource).not.toContain("<Select.Root");
    expect(scopeDialogSource).toContain("<Select.Root");
    expect(scopeDialogSource).toContain("bind:value={selectedProjectId}");
    expect(scopeDialogSource).toContain("bind:value={selectedScopeKind}");
    expect(scopeDialogSource).toContain("bind:value={selectedResourceId}");
    expect(summarySource).toContain("onclick={openPolicyEditDialog}");
    expect(summarySource).not.toContain("<form");
    expect(dialogSource).toContain("onsubmit={submitPolicy}");
    expect(dialogSource).toContain("<Dialog.Footer");
  });
});

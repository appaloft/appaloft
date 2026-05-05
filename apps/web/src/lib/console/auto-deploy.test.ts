import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("resource auto-deploy console settings", () => {
  test("[SRC-AUTO-ENTRY-001] Resource detail exposes auto-deploy settings over the shared command", async () => {
    const source = await readFile(
      new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(source).toContain('"auto-deploy"');
    expect(source).toContain("orpcClient.resources.configureAutoDeploy");
    expect(source).toContain("ConfigureResourceAutoDeployInput");
    expect(source).toContain("autoDeployGenericWebhookSecretRef");
    expect(source).toContain("acknowledge-source-binding");
    expect(source).toContain("sourceAutoDeploySetup");
    expect(source).toContain("sourceAutoDeploySignatures");
  });
});

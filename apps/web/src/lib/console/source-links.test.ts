import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("source link console surface", () => {
  test("[SOURCE-LINK-STATE-008] resource page exposes HTTP relink action", async () => {
    const [pageSource, clientContractSource] = await Promise.all([
      readFile(
        new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../../../../packages/orpc/src/client-contract.ts", import.meta.url),
        "utf8",
      ),
    ]);

    expect(pageSource).toContain("orpcClient.sourceLinks.relink");
    expect(pageSource).toContain("resource-source-link-form");
    expect(pageSource).toContain("sourceLinkFingerprint");
    expect(clientContractSource).toContain("sourceLinks: {");
    expect(clientContractSource).toContain("RelinkSourceLinkCommandInput");
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("platform migration Web journey", () => {
  test("[MIG-SURFACE-009] exposes review, apply, status, verify, and owner-confirmed cleanup", async () => {
    const source = await readFile(new URL("./+page.svelte", import.meta.url), "utf8");

    expect(source).toContain("orpcClient.migrations.plan");
    expect(source).toContain("orpcClient.migrations.apply");
    expect(source).toContain("orpcClient.migrations.status");
    expect(source).toContain("orpcClient.migrations.verify");
    expect(source).toContain("orpcClient.migrations.cleanup");
    expect(source).toContain("planDigestConfirmation !== plan.planDigest");
    expect(source).toContain("cleanupDigestConfirmation !== plan.planDigest");
    expect(source).toContain("blockers");
    expect(source).toContain("receipts");
    expect(source).toContain("evidence");
  });
});

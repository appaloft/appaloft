import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("deployment source event evidence", () => {
  test("[SRC-AUTO-QUERY-003] deployment detail renders final-diff trigger evidence", async () => {
    const source = await readFile(
      new URL("../../routes/deployments/[deploymentId=deploymentId]/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(source).toContain("data-deployment-source-event");
    expect(source).toContain("deploymentDetail.sourceEvent.changeSet");
    expect(source).toContain("deploymentDetail.sourceEvent.matchedPaths");
    expect(source).toContain("sourceEventMatchedPaths");
  });
});

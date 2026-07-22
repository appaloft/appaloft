import { describe, expect, test } from "bun:test";
import {
  discoverQueryBatchingSourceFiles,
  findQueryBatchingViolations,
} from "../check-query-batching";

describe("query batching architecture check", () => {
  test("[QUERY-BATCH-GUARD-000] scans application source packages", async () => {
    const files = await discoverQueryBatchingSourceFiles();

    expect(files).toContain(
      "packages/application/src/operations/servers/prune-server-capacity.use-case.ts",
    );
  });

  test("[QUERY-BATCH-GUARD-001] rejects async map callbacks that issue findOne calls", () => {
    const source = `
      const resources = await Promise.all(
        resourceIds.map(async (resourceId) => repository.findOne(context, byId(resourceId))),
      );
    `;

    expect(findQueryBatchingViolations("capacity-prune.ts", source)).toEqual([
      expect.objectContaining({ rule: "no-async-map-find-one", line: 3 }),
    ]);
  });

  test("[QUERY-BATCH-GUARD-002] accepts one batched list query followed by in-memory mapping", () => {
    const source = `
      const resources = await readModel.list(context, { resourceIds });
      return resourceIds.map((resourceId) => resourcesById.get(resourceId));
    `;

    expect(findQueryBatchingViolations("capacity-prune.ts", source)).toEqual([]);
  });
});

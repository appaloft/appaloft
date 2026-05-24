import { describe, expect, test } from "bun:test";

import { ResourceInstanceKindValue } from "../src";

describe("dependency resource kind vocabulary", () => {
  test("[DEP-RES-KIND-COVERAGE-001] accepts neutral mainstream dependency kinds", () => {
    for (const kind of ["mysql", "clickhouse", "object-storage", "opensearch"] as const) {
      const parsed = ResourceInstanceKindValue.create(kind);

      expect(parsed.isOk()).toBe(true);
      expect(parsed._unsafeUnwrap().value).toBe(kind);
    }
  });

  test("[DEP-RES-KIND-COVERAGE-001] keeps S3 as an object-storage provider alias, not a core kind", () => {
    expect(ResourceInstanceKindValue.create("s3").isErr()).toBe(true);
  });
});

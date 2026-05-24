import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { ListDependencyResourcesQuery } from "../src";

describe("dependency resource kind vocabulary", () => {
  test("[DEP-RES-KIND-COVERAGE-001] list filters accept neutral mainstream dependency kinds", () => {
    for (const kind of ["mysql", "clickhouse", "object-storage", "opensearch"] as const) {
      const query = ListDependencyResourcesQuery.create({ kind });

      expect(query.isOk()).toBe(true);
      expect(query._unsafeUnwrap().kind).toBe(kind);
    }
  });

  test("[DEP-RES-KIND-COVERAGE-001] list filters reject storage-provider aliases as canonical kinds", () => {
    const input = { kind: "s3" } as unknown as Parameters<
      typeof ListDependencyResourcesQuery.create
    >[0];

    expect(ListDependencyResourcesQuery.create(input).isErr()).toBe(true);
  });
});

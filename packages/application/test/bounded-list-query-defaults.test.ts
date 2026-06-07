import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  ListDependencyResourcesQuery,
  ListDeploymentsQuery,
  ListEnvironmentsQuery,
  ListProjectsQuery,
  ListResourcesQuery,
  ListServersQuery,
} from "../src";

describe("bounded list query defaults", () => {
  test("[CQRS-LIST-BOUND-001] omitted list limits materialize a bounded backend default", () => {
    expect(ListProjectsQuery.create()._unsafeUnwrap().limit).toBe(100);
    expect(ListProjectsQuery.create()._unsafeUnwrap().lifecycleStatus).toBe("active");
    expect(ListServersQuery.create()._unsafeUnwrap().limit).toBe(100);
    expect(ListEnvironmentsQuery.create({})._unsafeUnwrap().limit).toBe(100);
    expect(ListResourcesQuery.create({})._unsafeUnwrap().limit).toBe(100);
    expect(ListDeploymentsQuery.create({})._unsafeUnwrap().limit).toBe(100);
    expect(ListDependencyResourcesQuery.create({})._unsafeUnwrap().limit).toBe(100);
  });

  test("[CQRS-LIST-BOUND-002] excessive caller list limits are rejected before handlers run", () => {
    expect(ListProjectsQuery.create({ limit: 1_000 }).isErr()).toBe(true);
    expect(ListServersQuery.create({ limit: 1_000 }).isErr()).toBe(true);
    expect(ListEnvironmentsQuery.create({ limit: 1_000 }).isErr()).toBe(true);
    expect(ListResourcesQuery.create({ limit: 1_000 }).isErr()).toBe(true);
    expect(ListDeploymentsQuery.create({ limit: 1_000 }).isErr()).toBe(true);
    expect(ListDependencyResourcesQuery.create({ limit: 1_000 }).isErr()).toBe(true);
  });

  test("[CQRS-LIST-BOUND-003] HTTP query string limits are coerced before handlers run", () => {
    expect(ListServersQuery.create({ limit: "50" })._unsafeUnwrap().limit).toBe(50);
  });
});

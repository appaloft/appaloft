import { describe, expect, test } from "bun:test";
import {
  findGenericAggregateMutationOperations,
  type OperationCatalogEntry,
  operationCatalog,
} from "../src/operation-catalog";

const noopToken = Symbol("test");

function catalogEntry(overrides: Partial<OperationCatalogEntry>): OperationCatalogEntry {
  return {
    key: "resources.configure-source",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceSourceCommand",
    handlerName: "ConfigureResourceSourceCommandHandler",
    serviceName: "ConfigureResourceSourceUseCase",
    serviceToken: noopToken,
    transports: {
      cli: "appaloft resource configure-source <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/source" },
    },
    ...overrides,
  };
}

describe("operation catalog aggregate mutation boundary", () => {
  test("[AGG-MUTATION-CATALOG-001] operation catalog exposes no generic aggregate update commands", () => {
    expect(findGenericAggregateMutationOperations(operationCatalog)).toEqual([]);
  });

  test("[AGG-MUTATION-CATALOG-002] detects generic aggregate update operation keys and command names", () => {
    const violations = findGenericAggregateMutationOperations([
      catalogEntry({
        key: "resources.update",
        messageName: "UpdateResourceCommand",
        handlerName: "UpdateResourceCommandHandler",
        serviceName: "UpdateResourceUseCase",
      }),
    ]);

    expect(violations).toEqual([
      { key: "resources.update", field: "key", value: "resources.update" },
      { key: "resources.update", field: "messageName", value: "UpdateResourceCommand" },
      { key: "resources.update", field: "handlerName", value: "UpdateResourceCommandHandler" },
      { key: "resources.update", field: "serviceName", value: "UpdateResourceUseCase" },
    ]);
  });

  test("[AGG-MUTATION-CATALOG-003] detects generic update transport names and paths", () => {
    const violations = findGenericAggregateMutationOperations([
      catalogEntry({
        key: "resources.configure-source",
        transports: {
          cli: "appaloft resource update <resourceId>",
          orpc: { method: "POST", path: "/api/resources/{resourceId}/update" },
          orpcStream: { method: "POST", path: "/api/resources/{resourceId}/patch/stream" },
        },
      }),
    ]);

    expect(violations).toEqual([
      {
        key: "resources.configure-source",
        field: "transports.cli",
        value: "appaloft resource update <resourceId>",
      },
      {
        key: "resources.configure-source",
        field: "transports.orpc.path",
        value: "/api/resources/{resourceId}/update",
      },
      {
        key: "resources.configure-source",
        field: "transports.orpcStream.path",
        value: "/api/resources/{resourceId}/patch/stream",
      },
    ]);
  });
});

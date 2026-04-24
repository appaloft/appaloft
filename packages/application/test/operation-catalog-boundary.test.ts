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

  test("[MIN-CONSOLE-OPS-001] minimum console loop operations expose CLI and HTTP/oRPC transports", () => {
    const minimumLoopOperationKeys = [
      "projects.create",
      "projects.list",
      "environments.create",
      "environments.list",
      "environments.show",
      "environments.set-variable",
      "environments.unset-variable",
      "environments.diff",
      "environments.promote",
      "servers.register",
      "servers.configure-credential",
      "credentials.create-ssh",
      "credentials.list-ssh",
      "servers.list",
      "servers.show",
      "servers.deactivate",
      "servers.delete-check",
      "servers.test-connectivity",
      "resources.create",
      "resources.list",
      "resources.show",
      "resources.health",
      "resources.runtime-logs",
      "resources.proxy-configuration.preview",
      "resources.diagnostic-summary",
      "deployments.create",
      "deployments.list",
      "deployments.show",
      "deployments.logs",
      "deployments.stream-events",
    ];
    const catalogEntries: readonly OperationCatalogEntry[] = operationCatalog;
    const entriesByKey = new Map<string, OperationCatalogEntry>(
      catalogEntries.map((entry) => [entry.key, entry]),
    );

    for (const key of minimumLoopOperationKeys) {
      const entry = entriesByKey.get(key);

      expect(entry, key).toBeDefined();
      expect(entry?.inputSchema, key).toBeDefined();
      expect(entry?.transports.cli, key).toBeTruthy();
      expect(entry?.transports.orpc, key).toBeDefined();
    }
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

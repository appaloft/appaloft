import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type OperationCatalogEntry,
  operationCatalog,
} from "@appaloft/application/operation-catalog";
import { generatedSdkOperations } from "@appaloft/sdk";

type ExpectedRoute = {
  readonly method: string;
  readonly path: string;
  readonly sdkPath: string;
  readonly streaming: boolean;
};

const generatedOperationsWithoutRemoteCli = new Set([
  "account.delete",
  "account.profile.change",
  "account.profile.show",
  "account.sessions.list",
  "account.sessions.revoke",
  "capabilities.query",
  "entitlements.query",
  "organizations.delete",
  "organizations.profile.change",
  "organizations.profile.show",
  "servers.test-draft-connectivity",
  "source-events.ingest",
  "static-artifacts.publications.list",
  "static-artifacts.publish",
  "system.github-app-connection.show",
  "system.github-repositories.list",
  "system.integrations.list",
]);

function routeMatrix(entry: OperationCatalogEntry): ExpectedRoute[] {
  const routes = [
    ...(entry.transports.orpc
      ? [
          {
            ...entry.transports.orpc,
            streaming: false,
          },
        ]
      : []),
    ...(entry.transports.orpcAdditional ?? []).map((route) => ({
      ...route,
      streaming: false,
    })),
    ...(entry.transports.orpcStream
      ? [
          {
            ...entry.transports.orpcStream,
            streaming: true,
          },
        ]
      : []),
  ];

  return routes.map((route) => ({
    ...route,
    sdkPath: route.path.replace(/^\/api(?=\/)/, ""),
  }));
}

const remoteCliMappings = operationCatalog
  .filter((entry) => entry.transports.cli && routeMatrix(entry).length > 0)
  .flatMap((entry) =>
    routeMatrix(entry).map((route) => ({
      cli: entry.transports.cli ?? "",
      key: entry.key,
      kind: entry.kind,
      route,
    })),
  );

describe("Remote CLI Mapping Matrix", () => {
  test.each(remoteCliMappings)("$cli -> $key $route.method $route.sdkPath", (mapping) => {
    const generated = generatedSdkOperations.find(
      (operation) =>
        operation.operationKey === mapping.key &&
        operation.route.method === mapping.route.method &&
        operation.route.path === mapping.route.sdkPath,
    );

    expect(generated, mapping.cli).toMatchObject({
      operationKey: mapping.key,
      kind: mapping.kind,
      route: {
        method: mapping.route.method,
        path: mapping.route.sdkPath,
      },
      streaming: mapping.route.streaming,
    });
  });

  test("[CONTROL-PLANE-CLI-010] every generated operation is registered for remote CLI or explicitly classified", () => {
    const remoteCliKeys = new Set(remoteCliMappings.map((mapping) => mapping.key));
    const uniqueGeneratedKeys = [
      ...new Set(generatedSdkOperations.map((operation) => operation.operationKey)),
    ];

    expect(
      uniqueGeneratedKeys.filter(
        (key) => !remoteCliKeys.has(key) && !generatedOperationsWithoutRemoteCli.has(key),
      ),
    ).toEqual([]);
  });

  test("[CONTROL-PLANE-CLI-010] every explicit non-CLI generated operation still exists", () => {
    const uniqueGeneratedKeys = new Set(
      generatedSdkOperations.map((operation) => operation.operationKey),
    );

    expect(
      [...generatedOperationsWithoutRemoteCli].filter((key) => !uniqueGeneratedKeys.has(key)),
    ).toEqual([]);
  });
});

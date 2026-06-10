import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type OperationCatalogEntry,
  operationCatalog,
} from "@appaloft/application/operation-catalog";
import { createAppaloftOpenApiSpec } from "@appaloft/openapi";
import { renderSdkFacadeManifest } from "@appaloft/sdk-generator";

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
  test.each(remoteCliMappings)("$cli -> $key $route.method $route.sdkPath", async (mapping) => {
    const manifest = await renderFacadeManifestLines();
    const matchingLine = manifest.find((line) => line.includes(`-> ${mapping.key} `));

    expect(matchingLine, mapping.cli).toBeDefined();
  });

  test("[CONTROL-PLANE-CLI-010] every generated facade operation is registered for remote CLI or explicitly classified", async () => {
    const remoteCliKeys = new Set(remoteCliMappings.map((mapping) => mapping.key));
    const uniqueGeneratedKeys = [
      ...new Set((await renderFacadeManifestLines()).map(readOperationKey)),
    ];

    expect(
      uniqueGeneratedKeys.filter(
        (key) => !remoteCliKeys.has(key) && !generatedOperationsWithoutRemoteCli.has(key),
      ),
    ).toEqual([]);
  });

  test("[CONTROL-PLANE-CLI-010] every explicit non-CLI generated facade operation still exists", async () => {
    const uniqueGeneratedKeys = new Set((await renderFacadeManifestLines()).map(readOperationKey));

    expect(
      [...generatedOperationsWithoutRemoteCli].filter((key) => !uniqueGeneratedKeys.has(key)),
    ).toEqual([]);
  });
});

let facadeManifestLines: Promise<string[]> | undefined;

function renderFacadeManifestLines(): Promise<string[]> {
  facadeManifestLines ??= createAppaloftOpenApiSpec().then((spec) =>
    renderSdkFacadeManifest(spec)
      .trim()
      .split("\n")
      .filter((line) => line.length > 0),
  );

  return facadeManifestLines;
}

function readOperationKey(line: string): string {
  return line.split(" -> ")[1]?.split(" ")[0] ?? "";
}

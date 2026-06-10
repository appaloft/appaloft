import { describe, expect, test } from "bun:test";
import {
  type OperationCatalogEntry,
  operationCatalog,
} from "@appaloft/application/operation-catalog";
import { createAppaloftOpenApiSpec } from "@appaloft/openapi";

import {
  collectSdkOperationsFromOpenApi,
  operationFacadePathFromKey,
  operationMethodFromKey,
  renderSdkFacadeManifest,
  renderTypescriptSdkFacade,
} from "../src";

describe("TypeScript SDK generator", () => {
  test("[TS-SDK-GEN-001] generates operation methods from annotated OpenAPI metadata", async () => {
    const spec = await createAppaloftOpenApiSpec();
    const operations = collectSdkOperationsFromOpenApi(spec);
    const catalogKeysWithHttpRoutes: Set<string> = new Set(
      (operationCatalog as readonly OperationCatalogEntry[])
        .filter((entry) =>
          Boolean(
            entry.transports.orpc ?? entry.transports.orpcStream ?? entry.transports.orpcAdditional,
          ),
        )
        .map((entry) => entry.key),
    );
    const generatedKeys = new Set(operations.map((operation) => operation.operationKey));

    expect(operations.length).toBeGreaterThan(0);
    expect(generatedKeys).toEqual(catalogKeysWithHttpRoutes);

    expect(
      operations.find((operation) => operation.operationKey === "projects.create"),
    ).toMatchObject({
      operationGroup: "projects",
      operationMethod: "create",
      kind: "command",
      route: {
        method: "POST",
        path: "/projects",
      },
    });
    expect(
      operations.find((operation) => operation.operationKey === "servers.capacity.inspect"),
    ).toMatchObject({
      operationGroup: "servers",
      operationMethod: "capacityInspect",
      facadePath: ["servers", "capacity", "inspect"],
      kind: "query",
      route: {
        method: "GET",
        path: "/servers/{serverId}/capacity",
      },
    });
    expect(
      operations.find(
        (operation) =>
          operation.operationKey === "deployments.stream-events" && operation.streaming,
      ),
    ).toMatchObject({
      operationGroup: "deployments",
      operationMethod: "streamEvents",
      facadePath: ["deployments", "streamEvents"],
      facadeDefault: true,
      route: {
        method: "GET",
        path: "/deployments/{deploymentId}/events/stream",
      },
    });

    for (const operation of operations) {
      expect(operation.operationMethod, operation.operationKey).toBe(
        operationMethodFromKey(operation.operationKey),
      );
      expect(operation.facadePath, operation.operationKey).toEqual(
        operationFacadePathFromKey(operation.operationKey),
      );
      expect(catalogKeysWithHttpRoutes.has(operation.operationKey), operation.operationKey).toBe(
        true,
      );
    }
  });

  test("[TS-SDK-GEN-001] derives language-friendly facade paths from operation keys", () => {
    expect(operationFacadePathFromKey("projects.create")).toEqual(["projects", "create"]);
    expect(operationFacadePathFromKey("dependency-resources.provisioning.plan")).toEqual([
      "dependencyResources",
      "provisioning",
      "plan",
    ]);
    expect(operationFacadePathFromKey("deployments.stream-events")).toEqual([
      "deployments",
      "streamEvents",
    ]);
    expect(operationFacadePathFromKey("audit-events.legal-holds.release")).toEqual([
      "auditEvents",
      "legalHolds",
      "release",
    ]);
  });

  test("[TS-SDK-GEN-001] renders a reproducible TypeScript operation facade", async () => {
    const spec = await createAppaloftOpenApiSpec();
    const firstRender = renderTypescriptSdkFacade(spec);
    const secondRender = renderTypescriptSdkFacade(spec);

    expect(firstRender).toBe(secondRender);
    expect(firstRender).toContain("satisfies readonly SdkOperationDescriptor[]");
    expect(firstRender).toContain('"operationKey": "projects.create"');
    expect(firstRender).toContain('"facadePath": [');
    expect(firstRender).toContain('"operationMethod": "capacityInspect"');
    expect(firstRender).toContain('"facadeDefault": true');
    expect(firstRender).toContain('"streaming": true');
  });

  test("[TS-SDK-FACADE-002] locks the public SDK facade manifest", async () => {
    const spec = await createAppaloftOpenApiSpec();
    const manifest = renderSdkFacadeManifest(spec);
    const expected = await Bun.file(
      new URL("./fixtures/facade-manifest.snapshot.txt", import.meta.url),
    ).text();

    expect(manifest).toBe(expected);
  });
});

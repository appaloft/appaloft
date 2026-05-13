import { describe, expect, test } from "bun:test";
import {
  type OperationCatalogEntry,
  operationCatalog,
} from "@appaloft/application/operation-catalog";
import { type OpenAPI } from "@orpc/openapi";

import {
  createAppaloftOpenApiReferencePlugin,
  createAppaloftOpenApiSpec,
  createAppaloftOpenApiSpecResponse,
  createAppaloftScalarReferenceHtml,
  defaultAppaloftOpenApiReferencePath,
  defaultAppaloftOpenApiSpecPath,
} from "../src";

describe("Appaloft OpenAPI reference package", () => {
  test("generates an OpenAPI document from the Appaloft oRPC router", async () => {
    const spec = await createAppaloftOpenApiSpec({
      appVersion: "0.3.0-openapi-test",
    });

    expect(spec.openapi).toBe("3.1.1");
    expect(spec.info.title).toBe("Appaloft HTTP API");
    expect(spec.info.version).toBe("0.3.0-openapi-test");
    expect(spec.servers).toEqual([{ url: "/api" }]);
    expect(spec.paths).toBeDefined();
    const paths = spec.paths ?? {};
    expect(paths["/projects/{projectId}"]?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "projectId",
          in: "path",
          required: true,
        }),
      ]),
    );
    expect(paths["/servers/{serverId}/connectivity-tests"]?.post?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "serverId",
          in: "path",
          required: true,
        }),
      ]),
    );
  });

  test("groups operations by Appaloft business domain tags", async () => {
    const spec = await createAppaloftOpenApiSpec();

    expect(spec.tags?.map((tag) => tag.name)).toEqual([
      "Projects",
      "Servers And Credentials",
      "Environments And Configuration",
      "Resources",
      "Deployments",
      "Access And Domains",
      "Certificates",
      "Observability",
      "Providers",
      "Plugins",
      "Integrations",
    ]);
    expect(spec.paths?.["/projects"]?.get?.tags).toEqual(["Projects"]);
    expect(spec.paths?.["/credentials/ssh"]?.post?.tags).toEqual(["Servers And Credentials"]);
    expect(spec.paths?.["/resources/{resourceId}/source"]?.post?.tags).toEqual(["Resources"]);
    expect(spec.paths?.["/resources/{resourceId}/variables/{key}"]?.delete?.tags).toEqual([
      "Environments And Configuration",
    ]);
    expect(spec.paths?.["/domain-bindings"]?.post?.tags).toEqual(["Access And Domains"]);
    expect(spec.paths?.["/certificates"]?.get?.tags).toEqual(["Certificates"]);
    expect(spec.paths?.["/deployments/{deploymentId}/events"]?.get?.tags).toEqual([
      "Observability",
    ]);
    expect(spec.paths?.["/domain-events/prune"]?.post?.tags).toEqual(["Observability"]);
    expect(spec.paths?.["/integrations/github/repositories"]?.get?.tags).toEqual(["Integrations"]);
  });

  test("promotes schema examples into request media examples for Scalar", async () => {
    const spec = await createAppaloftOpenApiSpec();
    const operation = spec.paths?.["/resources/{resourceId}/source"]?.post;

    expect(operation).toBeDefined();

    if (!operation) {
      throw new Error("Expected configure resource source operation to exist");
    }

    const requestJson = getJsonRequestMediaType(operation);

    expect(getExampleValue(requestJson.examples?.default)).toEqual({
      source: {
        kind: "local-folder",
        locator: "./apps/web",
        displayName: "Web console",
        baseDirectory: ".",
        metadata: {
          framework: "sveltekit",
        },
      },
      idempotencyKey: "configure-source-res-web-console",
    });
  });

  test("[TS-SDK-OPENAPI-001] annotates catalog-backed OpenAPI operations with Appaloft SDK metadata", async () => {
    const spec = await createAppaloftOpenApiSpec();
    const createProject = spec.paths?.["/projects"]?.post;
    const replayDeploymentEvents = spec.paths?.["/deployments/{deploymentId}/events"]?.get;
    const streamDeploymentEvents = spec.paths?.["/deployments/{deploymentId}/events/stream"]?.get;

    expect(createProject).toBeDefined();
    expect(createProject).toMatchObject({
      "x-appaloft-operation-key": "projects.create",
      "x-appaloft-operation-kind": "command",
      "x-appaloft-operation-domain": "projects",
      "x-appaloft-message-name": "CreateProjectCommand",
      "x-appaloft-docs-href": "/docs/resources/projects/#concept-project",
      "x-appaloft-auth-policy": "product-session",
      "x-appaloft-error-family": "structured-platform-error",
      "x-appaloft-streaming": false,
    });

    expect(replayDeploymentEvents).toMatchObject({
      "x-appaloft-operation-key": "deployments.stream-events",
      "x-appaloft-operation-kind": "query",
      "x-appaloft-operation-domain": "deployments",
      "x-appaloft-message-name": "StreamDeploymentEventsQuery",
      "x-appaloft-docs-href": "/docs/deploy/lifecycle/#deployment-lifecycle",
      "x-appaloft-auth-policy": "product-session",
      "x-appaloft-error-family": "structured-platform-error",
      "x-appaloft-streaming": false,
    });

    expect(streamDeploymentEvents).toMatchObject({
      "x-appaloft-operation-key": "deployments.stream-events",
      "x-appaloft-streaming": true,
    });
  });

  test("[TS-SDK-OPENAPI-002][TS-SDK-OPENAPI-003] keeps OpenAPI SDK operations synchronized with the operation catalog", async () => {
    const spec = await createAppaloftOpenApiSpec();
    const openApiOperations = collectAppaloftOpenApiOperations(spec);
    const operationsByRoute = new Map(
      openApiOperations.map((operation) => [routeKey(operation.method, operation.path), operation]),
    );

    for (const entry of operationCatalog) {
      for (const route of operationCatalogHttpRoutes(entry)) {
        const operation = operationsByRoute.get(
          routeKey(route.method.toLowerCase(), stripApiPrefix(route.path)),
        );

        expect(operation, `${entry.key} ${route.method} ${route.path}`).toBeDefined();
        expect(operation?.operation["x-appaloft-operation-key"], entry.key).toBe(entry.key);
        expect(operation?.operation["x-appaloft-operation-kind"], entry.key).toBe(entry.kind);
      }
    }

    const catalogKeys = new Set<string>(operationCatalog.map((entry) => entry.key));
    const annotatedKeys = openApiOperations
      .map((operation) => operation.operation["x-appaloft-operation-key"])
      .filter((key): key is string => typeof key === "string");

    expect(annotatedKeys.length).toBeGreaterThan(0);
    for (const key of annotatedKeys) {
      expect(catalogKeys.has(key), key).toBe(true);
    }
  });

  test("returns JSON and Scalar HTML responses without binding to Elysia", async () => {
    const specResponse = await createAppaloftOpenApiSpecResponse({
      appVersion: "0.3.0-openapi-response-test",
    });
    const html = createAppaloftScalarReferenceHtml();

    expect(specResponse.headers.get("content-type")).toContain("application/json");
    expect(await specResponse.json()).toMatchObject({
      info: {
        title: "Appaloft HTTP API",
        version: "0.3.0-openapi-response-test",
      },
    });
    expect(html).toContain("@scalar/api-reference");
    expect(html).toContain(defaultAppaloftOpenApiSpecPath);
  });

  test("exports a system plugin with route handlers and a docs/navigation extension", async () => {
    const plugin = createAppaloftOpenApiReferencePlugin();

    expect(plugin.manifest).toMatchObject({
      name: "builtin-openapi-reference",
      kind: "system-extension",
      capabilities: expect.arrayContaining(["http-route", "web-page"]),
    });
    expect(plugin.webExtensions).toEqual([
      expect.objectContaining({
        key: "openapi-reference",
        path: defaultAppaloftOpenApiReferencePath,
        placement: "navigation",
      }),
    ]);

    const specRoute = plugin.http?.routes?.find(
      (route) => route.path === defaultAppaloftOpenApiSpecPath,
    );
    const referenceRoute = plugin.http?.routes?.find(
      (route) => route.path === defaultAppaloftOpenApiReferencePath,
    );

    expect(specRoute).toBeDefined();
    expect(referenceRoute).toBeDefined();
    const referenceResponse = await referenceRoute?.handle({
      request: new Request(`http://localhost${defaultAppaloftOpenApiReferencePath}`),
      method: "GET",
      path: defaultAppaloftOpenApiReferencePath,
      params: {},
      query: new URLSearchParams(),
      readJson: async () => null,
    });

    expect(referenceResponse).toBeInstanceOf(Response);
    expect(await (referenceResponse as Response).text()).toContain("@scalar/api-reference");
  });
});

function getJsonRequestMediaType(operation: OpenAPI.OperationObject): OpenAPI.MediaTypeObject {
  const requestBody = operation.requestBody;

  if (!requestBody || isReferenceObject(requestBody)) {
    throw new Error("Expected inline request body");
  }

  const mediaType = requestBody.content["application/json"];

  if (!mediaType) {
    throw new Error("Expected application/json request body content");
  }

  return mediaType;
}

function getExampleValue(
  example: OpenAPI.ReferenceObject | OpenAPI.ExampleObject | undefined,
): unknown {
  if (!example || isReferenceObject(example)) {
    return undefined;
  }

  return example.value;
}

function isReferenceObject(value: unknown): value is OpenAPI.ReferenceObject {
  return typeof value === "object" && value !== null && "$ref" in value;
}

function collectAppaloftOpenApiOperations(spec: OpenAPI.Document): {
  method: string;
  path: string;
  operation: OpenAPI.OperationObject & Record<string, unknown>;
}[] {
  const operations: {
    method: string;
    path: string;
    operation: OpenAPI.OperationObject & Record<string, unknown>;
  }[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!pathItem || isReferenceObject(pathItem)) {
      continue;
    }

    for (const method of ["get", "post", "delete"] as const) {
      const operation = pathItem[method];

      if (operation) {
        operations.push({ method, path, operation });
      }
    }
  }

  return operations;
}

function operationCatalogHttpRoutes(entry: OperationCatalogEntry): {
  method: string;
  path: string;
}[] {
  return [
    ...("orpc" in entry.transports && entry.transports.orpc ? [entry.transports.orpc] : []),
    ...(entry.transports.orpcAdditional ?? []),
    ...("orpcStream" in entry.transports && entry.transports.orpcStream
      ? [entry.transports.orpcStream]
      : []),
  ];
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function stripApiPrefix(path: string): string {
  return path.replace(/^\/api(?=\/)/, "");
}

import { describe, expect, test } from "bun:test";
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

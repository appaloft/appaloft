import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type CommandBus,
  createExecutionContext,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import {
  createAppaloftOpenApiReferencePlugin,
  defaultAppaloftOpenApiReferencePath,
  defaultAppaloftOpenApiSpecPath,
} from "@appaloft/openapi";
import { createHttpApp } from "../src";

class SilentLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

function createTestApp() {
  const plugin = createAppaloftOpenApiReferencePlugin({
    appVersion: "0.1.0-test",
  });

  return createHttpApp({
    config: resolveConfig({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        webStaticDir: "",
      },
    }),
    commandBus: {} as unknown as CommandBus,
    queryBus: {} as unknown as QueryBus,
    logger: new SilentLogger(),
    executionContextFactory: {
      create(input) {
        return createExecutionContext(input);
      },
    },
    pluginRuntime: {
      listWebExtensions: () =>
        (plugin.webExtensions ?? []).map((extension) => ({
          ...extension,
          pluginName: plugin.manifest.name,
          pluginDisplayName: plugin.manifest.displayName ?? plugin.manifest.name,
        })),
      listHttpMiddlewares: () => [],
      listHttpRoutes: () => plugin.http?.routes ?? [],
    },
  });
}

async function withServer<T>(
  app: ReturnType<typeof createHttpApp>,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  app.listen({
    hostname: "127.0.0.1",
    port: 0,
  });

  const port = app.server?.port;
  if (typeof port !== "number") {
    throw new Error("HTTP test server did not expose a port");
  }

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    app.server?.stop(true);
  }
}

describe("OpenAPI reference plugin routes", () => {
  test("serves the OpenAPI document and Scalar UI through Elysia plugin routes", async () => {
    const app = createTestApp();

    await withServer(app, async (baseUrl) => {
      const specResponse = await fetch(`${baseUrl}${defaultAppaloftOpenApiSpecPath}`);
      const spec = await specResponse.json();
      const referenceResponse = await fetch(`${baseUrl}${defaultAppaloftOpenApiReferencePath}`);
      const extensionResponse = await fetch(`${baseUrl}/api/system-plugins/web-extensions`);

      expect(specResponse.status).toBe(200);
      expect(spec).toMatchObject({
        info: {
          title: "Appaloft HTTP API",
          version: "0.1.0-test",
        },
      });
      expect(referenceResponse.status).toBe(200);
      expect(await referenceResponse.text()).toContain("@scalar/api-reference");
      expect(await extensionResponse.json()).toMatchObject({
        items: [
          {
            key: "openapi-reference",
            path: defaultAppaloftOpenApiReferencePath,
          },
        ],
      });
    });
  });
});

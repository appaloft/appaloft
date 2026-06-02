import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type CommandBus,
  createExecutionContext,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { type SystemPluginHttpRoute, systemPluginHtml } from "@appaloft/plugin-sdk";
import { createHttpApp } from "../src";

class SilentLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

function createTestApp(routes: SystemPluginHttpRoute[] = []) {
  return createHttpApp({
    config: resolveConfig({
      flags: {
        authProvider: "none",
        betterAuthTrustedOrigins: ["https://www.example.com"],
        webOrigin: "https://app.example.com",
        webStaticDir: "",
      },
    }),
    commandBus: {} as unknown as CommandBus,
    executionContextFactory: {
      create(input) {
        return createExecutionContext(input);
      },
    },
    logger: new SilentLogger(),
    pluginRuntime: {
      listHttpMiddlewares: () => [],
      listHttpRoutes: () => routes,
      listWebExtensions: () => [],
    },
    queryBus: {} as unknown as QueryBus,
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

describe("HTTP plugin HTML routes", () => {
  test("serves explicit plugin HTML results as text/html responses", async () => {
    const app = createTestApp([
      {
        handle: () =>
          systemPluginHtml("<html><head><title>Plugin HTML</title></head><body>OK</body></html>"),
        method: "GET",
        path: "/extensions/html",
      },
    ]);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/extensions/html`);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(await response.text()).toContain("<title>Plugin HTML</title>");
    });
  });
});

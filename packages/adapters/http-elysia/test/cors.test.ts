import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type CommandBus,
  createExecutionContext,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { type SystemPluginHttpRoute } from "@appaloft/plugin-sdk";
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
        webOrigin: "https://app.example.com",
        betterAuthTrustedOrigins: ["https://www.example.com"],
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
      listWebExtensions: () => [],
      listHttpMiddlewares: () => [],
      listHttpRoutes: () => routes,
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

describe("HTTP CORS", () => {
  test("allows configured trusted origins on API and plugin routes", async () => {
    const app = createTestApp([
      {
        method: "POST",
        path: "/extensions/upload",
        handle: () => ({ ok: true }),
      },
    ]);

    await withServer(app, async (baseUrl) => {
      const apiResponse = await fetch(`${baseUrl}/api/health`, {
        headers: {
          Origin: "https://www.example.com",
        },
      });
      const preflightResponse = await fetch(`${baseUrl}/extensions/upload`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://www.example.com",
          "Access-Control-Request-Headers": "content-type,x-appaloft-locale",
        },
      });
      const pluginResponse = await fetch(`${baseUrl}/extensions/upload`, {
        method: "POST",
        headers: {
          Origin: "https://www.example.com",
        },
      });

      expect(apiResponse.headers.get("access-control-allow-origin")).toBe(
        "https://www.example.com",
      );
      expect(preflightResponse.status).toBe(204);
      expect(preflightResponse.headers.get("access-control-allow-origin")).toBe(
        "https://www.example.com",
      );
      expect(preflightResponse.headers.get("access-control-allow-credentials")).toBe("true");
      expect(preflightResponse.headers.get("access-control-allow-headers")).toBe(
        "content-type,x-appaloft-locale",
      );
      expect(pluginResponse.headers.get("access-control-allow-origin")).toBe(
        "https://www.example.com",
      );
    });
  });
});

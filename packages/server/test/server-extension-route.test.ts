import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppaloftServer } from "@appaloft/server";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createTempDataDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "appaloft-server-extension-"));
  tempRoots.push(path);
  return path;
}

describe("createAppaloftServer", () => {
  test("allows an external extension to add an HTTP route", async () => {
    const dataDir = await createTempDataDir();
    const server = await createAppaloftServer({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        dataDir,
        docsStaticDir: "",
        httpPort: 0,
        pgliteDataDir: join(dataDir, "pglite"),
        webStaticDir: "",
      },
      extensions: [
        {
          name: "extension-health",
          http: {
            routes: [
              {
                method: "GET",
                path: "/extension/health",
                handle: () => new Response("ok", { status: 200 }),
              },
            ],
          },
        },
      ],
    });

    try {
      const response = await server.httpApp.handle(
        new Request("http://localhost/extension/health"),
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
    } finally {
      await server.shutdown();
    }
  });

  test("keeps configured HTTP routes active when app version is a deployment SHA", async () => {
    const dataDir = await createTempDataDir();
    const server = await createAppaloftServer({
      flags: {
        appVersion: "0313c2dd90333931d3b6d767668f6f36774735fa",
        authProvider: "none",
        dataDir,
        docsStaticDir: "",
        httpPort: 0,
        pgliteDataDir: join(dataDir, "pglite"),
        webStaticDir: "",
      },
      extensions: [
        {
          name: "deployment-sha-extension-route",
          http: {
            routes: [
              {
                method: "GET",
                path: "/extension/deployment-sha-health",
                handle: () => new Response("ok", { status: 200 }),
              },
            ],
          },
        },
      ],
    });

    try {
      const response = await server.httpApp.handle(
        new Request("http://localhost/extension/deployment-sha-health"),
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
    } finally {
      await server.shutdown();
    }
  });
});

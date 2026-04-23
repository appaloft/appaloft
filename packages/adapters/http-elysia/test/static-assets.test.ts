import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type AppLogger,
  type CommandBus,
  createExecutionContext,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { createHttpApp } from "../src";

class SilentLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "appaloft-http-static-"));
  tempRoots.push(path);
  return path;
}

function createTestApp(input?: {
  docsStaticDir?: string;
  embeddedDocsAssets?: Readonly<Record<string, Blob>>;
  embeddedWebAssets?: Readonly<Record<string, Blob>>;
  webStaticDir?: string;
}) {
  return createHttpApp({
    config: resolveConfig({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        webStaticDir: input?.webStaticDir ?? "",
        docsStaticDir: input?.docsStaticDir ?? "",
      },
    }),
    commandBus: {} as unknown as CommandBus,
    queryBus: {} as unknown as QueryBus,
    logger: new SilentLogger(),
    executionContextFactory: {
      create(contextInput) {
        return createExecutionContext(contextInput);
      },
    },
    ...(input?.embeddedWebAssets ? { embeddedWebAssets: input.embeddedWebAssets } : {}),
    ...(input?.embeddedDocsAssets ? { embeddedDocsAssets: input.embeddedDocsAssets } : {}),
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

describe("HTTP static assets", () => {
  test("[PUB-DOCS-013] serves embedded docs under /docs without changing Web fallback", async () => {
    const app = createTestApp({
      embeddedWebAssets: {
        "/index.html": new Blob(["web-shell"]),
      },
      embeddedDocsAssets: {
        "/index.html": new Blob(["docs-index"]),
        "/start/first-deployment/index.html": new Blob(["docs-start"]),
      },
    });

    await withServer(app, async (baseUrl) => {
      await expect(fetch(`${baseUrl}/`).then((response) => response.text())).resolves.toBe(
        "web-shell",
      );
      await expect(
        fetch(`${baseUrl}/console-route`).then((response) => response.text()),
      ).resolves.toBe("web-shell");
      await expect(fetch(`${baseUrl}/docs`).then((response) => response.text())).resolves.toBe(
        "docs-index",
      );
      await expect(
        fetch(`${baseUrl}/docs/start/first-deployment`).then((response) => response.text()),
      ).resolves.toBe("docs-start");

      const missingDocs = await fetch(`${baseUrl}/docs/missing-page`);
      expect(missingDocs.status).toBe(404);
    });
  });

  test("[PUB-DOCS-014] serves docsStaticDir separately from webStaticDir", async () => {
    const webDir = await createTempDir();
    const docsDir = await createTempDir();
    await mkdir(join(docsDir, "start", "first-deployment"), { recursive: true });
    await Bun.write(join(webDir, "index.html"), "web-dir");
    await Bun.write(join(docsDir, "index.html"), "docs-dir");
    await Bun.write(join(docsDir, "start", "first-deployment", "index.html"), "docs-start-dir");

    const app = createTestApp({
      webStaticDir: webDir,
      docsStaticDir: docsDir,
    });

    await withServer(app, async (baseUrl) => {
      await expect(
        fetch(`${baseUrl}/any-web-route`).then((response) => response.text()),
      ).resolves.toBe("web-dir");
      await expect(fetch(`${baseUrl}/docs`).then((response) => response.text())).resolves.toBe(
        "docs-dir",
      );
      await expect(
        fetch(`${baseUrl}/docs/start/first-deployment`).then((response) => response.text()),
      ).resolves.toBe("docs-start-dir");
    });
  });
});

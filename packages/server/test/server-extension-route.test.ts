import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CommandBus, PublishStaticArtifactCommand, tokens } from "@appaloft/application";
import { type AuthRuntime } from "@appaloft/auth-better";
import { ok } from "@appaloft/core";
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
  test("[STATIC-ARTIFACT-EXT-010][STATIC-ARTIFACT-EXT-012] wires static artifact publishing to the local filesystem runtime and HTTP route", async () => {
    const dataDir = await createTempDataDir();
    const distDir = join(dataDir, "dist");
    await mkdir(join(distDir, "assets"), { recursive: true });
    await writeFile(join(distDir, "index.html"), "<h1>Static App</h1>", "utf8");
    await writeFile(join(distDir, "assets", "app.css"), "body { color: #123456; }", "utf8");

    const server = await createAppaloftServer({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        dataDir,
        docsStaticDir: "",
        httpHost: "localhost",
        httpPort: 3001,
        pgliteDataDir: join(dataDir, "pglite"),
        webStaticDir: "",
      },
      authRuntime: createTestAuthRuntime(),
    });

    try {
      const command = PublishStaticArtifactCommand.create({
        projectId: "project_static_runtime",
        resourceId: "res_static_runtime",
        sourcePath: distDir,
        artifactId: "static_artifact_runtime",
        promoteAlias: true,
      })._unsafeUnwrap();
      const context = server.executionContextFactory.create({ entrypoint: "system" });
      const commandBus = server.container.resolve<CommandBus>(tokens.commandBus);
      const result = await commandBus.execute(context, command);

      if (result.isErr()) {
        throw new Error(`${result.error.code}: ${result.error.message}`);
      }
      const publication = result._unsafeUnwrap();
      expect(publication.url).toBe(
        "http://localhost:3001/static-artifacts/projects/project_static_runtime/resources/res_static_runtime/current/",
      );

      const indexResponse = await server.httpApp.handle(new Request(publication.url));
      expect(indexResponse.status).toBe(200);
      expect(await indexResponse.text()).toBe("<h1>Static App</h1>");

      const assetResponse = await server.httpApp.handle(
        new Request(`${publication.url}assets/app.css`),
      );
      expect(assetResponse.status).toBe(200);
      expect(await assetResponse.text()).toBe("body { color: #123456; }");
    } finally {
      await server.shutdown();
    }
  }, 15_000);

  test("[STATIC-ARTIFACT-EXT-017] publishes a zipped static artifact through the API and serves it locally", async () => {
    const dataDir = await createTempDataDir();
    const server = await createAppaloftServer({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        dataDir,
        docsStaticDir: "",
        httpHost: "localhost",
        httpPort: 3001,
        pgliteDataDir: join(dataDir, "pglite"),
        webStaticDir: "",
      },
      authRuntime: createTestAuthRuntime(),
    });

    try {
      const archiveBase64 = Buffer.from(
        createZipArchive([
          { path: "index.html", content: "<h1>Archive App</h1>" },
          { path: "assets/app.css", content: "body { color: #654321; }" },
        ]),
      ).toString("base64");
      const publishResponse = await server.httpApp.handle(
        new Request("http://localhost/api/static-artifacts/publish-archive", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            projectId: "project_static_archive_runtime",
            resourceId: "res_static_archive_runtime",
            artifactId: "static_artifact_archive_runtime",
            promoteAlias: true,
            archiveBase64,
          }),
        }),
      );

      expect(publishResponse.status).toBe(201);
      const publication = (await publishResponse.json()) as {
        readonly routeUrl: string;
      };
      expect(publication.routeUrl).toBe(
        "http://localhost:3001/static-artifacts/projects/project_static_archive_runtime/resources/res_static_archive_runtime/current/",
      );

      const indexResponse = await server.httpApp.handle(new Request(publication.routeUrl));
      expect(indexResponse.status).toBe(200);
      expect(await indexResponse.text()).toBe("<h1>Archive App</h1>");

      const assetResponse = await server.httpApp.handle(
        new Request(`${publication.routeUrl}assets/app.css`),
      );
      expect(assetResponse.status).toBe(200);
      expect(await assetResponse.text()).toBe("body { color: #654321; }");
    } finally {
      await server.shutdown();
    }
  }, 15_000);

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

function createTestAuthRuntime(): AuthRuntime {
  return {
    async authorizeProductSession(_context, input) {
      return ok({
        actor: {
          kind: "user",
          id: "usr_static_archive",
          label: "static-archive@example.test",
        },
        email: "static-archive@example.test",
        organizationId: input.organizationId ?? "org_static_archive",
        role: input.requiredRole,
        userId: "usr_static_archive",
      });
    },
    async getSessionStatus() {
      return {
        accountSecurity: {
          enabled: true,
          passwordState: "unknown",
        },
        accountRecovery: {
          enabled: false,
        },
        enabled: true,
        emailVerification: {
          enabled: false,
          otpEnabled: false,
          required: false,
        },
        provider: "better-auth",
        loginRequired: true,
        deferredAuth: false,
        session: { user: { id: "usr_static_archive" } },
        providers: [],
      };
    },
    async getProviderAccessToken() {
      return null;
    },
    async issueCliProductSessionCookie() {
      return null;
    },
    async handle() {
      return new Response(null, { status: 404 });
    },
  } as AuthRuntime;
}

function createZipArchive(entries: readonly { path: string; content: string }[]): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(content.byteLength, 18);
    localHeader.writeUInt32LE(content.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(content.byteLength, 20);
    centralHeader.writeUInt32LE(content.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt32LE(0, 34);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.byteLength + name.byteLength + content.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.byteLength, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

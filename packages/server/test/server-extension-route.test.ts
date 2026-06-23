import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AppQuery,
  type AuditEventRecorder,
  type CommandBus,
  type ExecutionContext,
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  operationCatalog,
  PublishStaticArtifactCommand,
  type QueryBus,
  type TerminalSession,
  type TerminalSessionGateway,
  tokens,
  toRepositoryContext,
} from "@appaloft/application";
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
  test("[FIRST-ADMIN-BOOTSTRAP-008] worker composition skips installer first-admin bootstrap readback", async () => {
    const dataDir = await createTempDataDir();
    const server = await createAppaloftServer({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        dataDir,
        docsStaticDir: "",
        firstAdminEmail: "admin@example.com",
        firstAdminPassword: "startup-admin-password",
        httpHost: "localhost",
        httpPort: 3001,
        pgliteDataDir: join(dataDir, "pglite"),
        webStaticDir: "",
        workerRuntime: {
          mode: "disabled",
          queueBackend: "database",
          workerCount: 0,
          workerGroup: "test-worker",
        },
      },
      authRuntime: createTestAuthRuntime(),
      extensions: [
        {
          name: "fail-if-first-admin-bootstrap-runs",
          configureApplication(context) {
            context.container.registerInstance(tokens.queryBus, {
              execute: async (_context: unknown, query: AppQuery<unknown>) => {
                throw new Error(`first-admin bootstrap query should not run: ${query.type}`);
              },
            } as QueryBus);
          },
        },
      ],
    });

    try {
      expect(server.config.firstAdminEmail).toBe("admin@example.com");
    } finally {
      await server.shutdown();
    }
  }, 45_000);

  test("[SERVER-DI-001] fails startup registration drift before operations execute", async () => {
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
      const missing = operationCatalog.filter((entry) => {
        if (!server.container.isRegistered(entry.serviceToken, true)) {
          return true;
        }

        try {
          server.container.resolve(entry.serviceToken);
          return false;
        } catch {
          return true;
        }
      });

      expect(missing).toEqual([]);
    } finally {
      await server.shutdown();
    }
  }, 45_000);

  test("[SERVER-DI-002] operation services use guards registered by application extensions", async () => {
    const dataDir = await createTempDataDir();
    const guard = new RecordingDenyingOperationGuardPort();
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
      extensions: [
        {
          name: "operation-guard-extension",
          configureApplication(context) {
            context.container.registerInstance(tokens.operationGuardPort, guard);
          },
        },
      ],
    });

    try {
      const registerServerUseCase = server.container.resolve<{
        execute(
          context: ExecutionContext,
          input: {
            name: string;
            host: string;
            providerKey: string;
            port?: number;
            proxyKind?: "none" | "traefik" | "caddy";
            targetKind?: "single-server" | "orchestrator-cluster";
          },
        ): Promise<{ isErr(): boolean }>;
      }>(tokens.registerServerUseCase);
      const context = server.executionContextFactory.create({ entrypoint: "system" });
      const result = await registerServerUseCase.execute(context, {
        name: "extension-guarded-server",
        host: "127.0.0.1",
        providerKey: "local-shell",
        port: 22,
        proxyKind: "none",
        targetKind: "single-server",
      });

      expect(result.isErr()).toBe(true);
      expect(guard.requests).toHaveLength(1);
      expect(guard.requests[0]).toMatchObject({
        operationKey: "servers.register",
        contextAttributes: {
          host: "127.0.0.1",
          providerKey: "local-shell",
          targetKind: "single-server",
        },
      });
    } finally {
      await server.shutdown();
    }
  }, 45_000);

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
  }, 30_000);

  test("[STATIC-ARTIFACT-EXT-017] publishes a zipped static artifact through the API and serves it locally", async () => {
    const dataDir = await createTempDataDir();
    const authorizationRequests: Parameters<AuthRuntime["authorizeProductSession"]>[1][] = [];
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
      authRuntime: createTestAuthRuntime(authorizationRequests),
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
            cookie: "better-auth.session_token=test-static-archive-session",
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
      expect(authorizationRequests).toContainEqual({
        cookieHeader: "better-auth.session_token=test-static-archive-session",
        method: "POST",
        path: "/api/static-artifacts/publish-archive",
        requiredRole: "admin",
      });
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
  }, 45_000);

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
  }, 45_000);

  test("[AUDIT-LOG-CONSOLE-001] exposes neutral Audit Log console route and default self-hosted navigation", async () => {
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
    });

    try {
      const extensionResponse = await server.httpApp.handle(
        new Request("http://localhost/api/system-plugins/web-extensions"),
      );
      expect(extensionResponse.status).toBe(200);
      const extensions = (await extensionResponse.json()) as {
        items: Array<{
          key: string;
          metadata?: Record<string, unknown>;
          path?: string;
          placement?: string;
          surface?: string;
        }>;
      };
      expect(extensions.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: "appaloft-audit-log.navigation",
            path: "/audit-log",
            placement: "navigation",
            metadata: expect.objectContaining({
              renderer: "console-page",
              pageEndpoint: "/audit-log/console-page?query={query}",
            }),
          }),
        ]),
      );

      const pageResponse = await server.httpApp.handle(
        new Request("http://localhost/audit-log/console-page", {
          headers: {
            "x-appaloft-locale": "en-US",
          },
        }),
      );
      expect(pageResponse.status).toBe(200);
      await expect(pageResponse.json()).resolves.toMatchObject({
        schemaVersion: "appaloft.console.extension-page/v1",
        title: "Audit Log",
      });

      const zhPageResponse = await server.httpApp.handle(
        new Request("http://localhost/audit-log/console-page", {
          headers: {
            "x-appaloft-locale": "zh-CN",
          },
        }),
      );
      expect(zhPageResponse.status).toBe(200);
      const zhPage = await zhPageResponse.json();
      expect(zhPage).toMatchObject({
        schemaVersion: "appaloft.console.extension-page/v1",
        title: "审计日志",
      });
      expect(JSON.stringify(zhPage)).toContain("审计");
      expect(JSON.stringify(zhPage)).not.toContain("Audit events");
    } finally {
      await server.shutdown();
    }
  }, 45_000);

  test("[AUDIT-LOG-CONSOLE-002] lets hosted Cloud disable public nav while retaining the neutral route", async () => {
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
      auditLogConsole: {
        routeEnabled: true,
        webExtensionEnabled: false,
      },
    });

    try {
      const extensionResponse = await server.httpApp.handle(
        new Request("http://localhost/api/system-plugins/web-extensions"),
      );
      expect(extensionResponse.status).toBe(200);
      const extensions = (await extensionResponse.json()) as {
        items: Array<{ key: string }>;
      };
      expect(extensions.items.map((item) => item.key)).not.toContain(
        "appaloft-audit-log.navigation",
      );

      const pageResponse = await server.httpApp.handle(
        new Request("http://localhost/audit-log/console-page", {
          headers: {
            "x-appaloft-locale": "en-US",
          },
        }),
      );
      expect(pageResponse.status).toBe(200);
      await expect(pageResponse.json()).resolves.toMatchObject({
        schemaVersion: "appaloft.console.extension-page/v1",
        title: "Audit Log",
      });
    } finally {
      await server.shutdown();
    }
  }, 45_000);

  test("[AUDIT-LOG-CONSOLE-003] renders time, resource, action, and actor filters from audit rows", async () => {
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
    });

    try {
      const recorder = server.container.resolve(tokens.auditEventRecorder) as AuditEventRecorder;
      const recorded = await recorder.record(
        toRepositoryContext(server.executionContextFactory.create({ entrypoint: "system" })),
        {
          id: "aud_console_filter",
          aggregateId: "prj_console_filter",
          eventType: "projects.create",
          createdAt: new Date().toISOString(),
          payload: {
            schemaVersion: "operation-audit/v1",
            operationKey: "projects.create",
            operationName: "CreateProjectCommand",
            action: "create",
            domain: "projects",
            result: "success",
            organizationId: "org_console_filter",
            actorKind: "user",
            actorId: "usr_console_admin",
            actorLabel: "Console Admin",
            resourceType: "project",
            resourceId: "prj_console_filter",
            requestId: "req_console_filter",
            entrypoint: "http",
            tenantId: "tenant_console_filter",
            tenantMode: "single-tenant",
          },
        },
      );
      expect(recorded.isOk()).toBe(true);

      const pageResponse = await server.httpApp.handle(
        new Request(
          "http://localhost/audit-log/console-page?query=range%3D7d%26resourceType%3Dproject%26action%3Dcreate%26actorId%3Dusr_console_admin",
          {
            headers: {
              "x-appaloft-locale": "zh-CN",
            },
          },
        ),
      );
      expect(pageResponse.status).toBe(200);
      const page = await pageResponse.json();
      expect(page).toMatchObject({
        schemaVersion: "appaloft.console.extension-page/v1",
        title: "审计日志",
      });
      const serialized = JSON.stringify(page);
      expect(serialized).toContain("时间范围");
      expect(serialized).toContain("资源类型");
      expect(serialized).toContain("操作类型");
      expect(serialized).toContain("操作者");
      expect(serialized).toContain("项目");
      expect(serialized).toContain("创建");
      expect(serialized).toContain("Console Admin");
      expect(serialized).toContain(
        "/audit-log?range=7d&resourceType=project&action=create&actorId=usr_console_admin",
      );
      expect(serialized).toContain(
        "/audit-log?range=7d&resourceType=project&actorId=usr_console_admin",
      );
      expect(serialized).not.toContain("All resources");
      expect(serialized).not.toContain("All actions");
    } finally {
      await server.shutdown();
    }
  }, 45_000);

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
  }, 45_000);

  test("[TERM-SESSION-ENTRY-006] started server passes Bun websocket handle to terminal attach routes", async () => {
    const dataDir = await createTempDataDir();
    const httpPort = await reserveLocalPort();
    const server = await createAppaloftServer({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        dataDir,
        docsStaticDir: "",
        httpHost: "127.0.0.1",
        httpPort,
        pgliteDataDir: join(dataDir, "pglite"),
        webStaticDir: "",
        workerRuntime: {
          mode: "disabled",
        },
      },
      authRuntime: createTestAuthRuntime(),
      extensions: [
        {
          name: "terminal-session-test-gateway",
          configureRuntime({ container }) {
            container.registerInstance(
              tokens.terminalSessionGateway,
              new TestTerminalSessionGateway(),
            );
          },
        },
      ],
    });
    let socket: WebSocket | undefined;

    try {
      await server.startServer();
      socket = new WebSocket(`ws://127.0.0.1:${httpPort}/api/terminal-sessions/term_test/attach`);
      await waitForOpen(socket);
      const frame = JSON.parse(await waitForMessage(socket)) as {
        readonly kind?: string;
        readonly sessionId?: string;
      };

      expect(frame).toMatchObject({
        kind: "ready",
        sessionId: "term_test",
      });
    } finally {
      socket?.close();
      await server.shutdown();
    }
  }, 45_000);
});

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("WebSocket did not open"));
    }, 1_000);

    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket failed to open"));
      },
      { once: true },
    );
  });
}

function waitForMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("WebSocket message was not received"));
    }, 1_000);

    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout);
        resolve(String(event.data));
      },
      { once: true },
    );
  });
}

async function reserveLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Local port reservation failed")));
        return;
      }

      server.close(() => resolve(address.port));
    });
  });
}

function createTestAuthRuntime(
  authorizationRequests: Parameters<AuthRuntime["authorizeProductSession"]>[1][] = [],
): AuthRuntime {
  return {
    async authorizeProductSession(_context, input) {
      authorizationRequests.push(input);
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

class TestTerminalSessionGateway implements TerminalSessionGateway {
  private readonly session = new TestTerminalSession();

  async open() {
    return ok({
      sessionId: "term_test",
      scope: "server" as const,
      serverId: "srv_test",
      providerKey: "local-shell",
      transport: {
        kind: "websocket" as const,
        path: "/api/terminal-sessions/term_test/attach",
      },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  }

  attach() {
    return ok(this.session);
  }

  list() {
    return [];
  }

  show() {
    return ok({
      sessionId: "term_test",
      scope: "server" as const,
      serverId: "srv_test",
      providerKey: "local-shell",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      status: "active" as const,
    });
  }

  async close() {
    return ok({
      sessionId: "term_test",
      status: "closed" as const,
    });
  }

  async expire() {
    return ok({
      expired: [],
    });
  }
}

class TestTerminalSession implements TerminalSession {
  async *[Symbol.asyncIterator]() {
    yield {
      kind: "ready" as const,
      sessionId: "term_test",
    };
  }

  async write() {}

  async resize() {}

  async close() {}
}

class RecordingDenyingOperationGuardPort implements OperationGuardPort {
  readonly requests: OperationCheckRequest[] = [];

  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    this.requests.push(request);
    return {
      allowed: false,
      checks: [
        {
          allowed: false,
          checkKey: "test.operation_guard",
          kind: "validation",
          reason: "test-operation-denied",
        },
      ],
      deniedBy: {
        checkKey: "test.operation_guard",
        kind: "validation",
      },
      reason: "test-operation-denied",
    };
  }
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

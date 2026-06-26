import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type AppLogger,
  type AuthBootstrapStatus,
  type CommandBus,
  createExecutionContext,
  GetAuthBootstrapStatusQuery,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { type AuthPublicConfig, type AuthSessionResponse } from "@appaloft/contracts";
import { ok } from "@appaloft/core";
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
  authPublicConfig?: AuthPublicConfig;
  authSessionStatus?: AuthSessionResponse;
  authBootstrapStatus?: AuthBootstrapStatus;
  docsStaticDir?: string;
  embeddedDocsAssets?: Readonly<Record<string, Blob>>;
  embeddedWebAssets?: Readonly<Record<string, Blob>>;
  middlewareHeaders?: Record<string, string>;
  onAuthSessionStatus?: (request: Request) => void;
  onExecutionContextCreate?: Parameters<
    typeof createHttpApp
  >[0]["executionContextFactory"]["create"];
  onQuery?: (query: Query<unknown>) => void;
  publicDocsBasePath?: string;
  webStaticDir?: string;
}) {
  const queryBus = {
    execute: async <T>(_context: unknown, query: Query<T>) => {
      input?.onQuery?.(query as Query<unknown>);
      return ok(
        (input?.authBootstrapStatus ?? {
          bootstrapRequired: false,
          firstAdminConfigured: true,
          organizationConfigured: true,
          loginMethods: [{ key: "local-password", configured: true, enabled: true }],
          nextSteps: ["sign-in"],
        }) as T,
      );
    },
  } as QueryBus;

  return createHttpApp({
    config: resolveConfig({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        publicDocsBasePath: input?.publicDocsBasePath,
        webStaticDir: input?.webStaticDir ?? "",
        docsStaticDir: input?.docsStaticDir ?? "",
      },
    }),
    commandBus: {} as unknown as CommandBus,
    queryBus,
    logger: new SilentLogger(),
    executionContextFactory: {
      create(contextInput) {
        input?.onExecutionContextCreate?.(contextInput);
        return createExecutionContext(contextInput);
      },
    },
    ...(input?.authSessionStatus
      ? {
          authRuntime: {
            authorizeProductSession: async () =>
              ok({
                actor: {
                  type: "user" as const,
                  userId: "usr_test",
                },
                principal: {
                  type: "user" as const,
                  userId: "usr_test",
                  organizationId: "org_test",
                  organizationRole: "owner" as const,
                  productRole: "owner" as const,
                },
              }),
            getPublicConfig: () =>
              input.authPublicConfig ?? {
                schemaVersion: "appaloft.auth.public-config/v1",
                enabled: input.authSessionStatus?.enabled ?? false,
                provider: input.authSessionStatus?.provider ?? "none",
                providers:
                  input.authSessionStatus?.providers.map((provider) => ({
                    key: provider.key,
                    title: provider.title,
                    configured: provider.configured,
                    deferred: provider.deferred,
                    ...(provider.connectPath ? { connectPath: provider.connectPath } : {}),
                    ...(provider.reason ? { reason: provider.reason } : {}),
                  })) ?? [],
              },
            getProviderAccessToken: async () => null,
            getSessionStatus: async (request: Request) => {
              input.onAuthSessionStatus?.(request);
              return input.authSessionStatus as AuthSessionResponse;
            },
            handle: async () => new Response("auth-runtime"),
          },
        }
      : {}),
    ...(input?.embeddedWebAssets ? { embeddedWebAssets: input.embeddedWebAssets } : {}),
    ...(input?.embeddedDocsAssets ? { embeddedDocsAssets: input.embeddedDocsAssets } : {}),
    ...(input?.middlewareHeaders
      ? {
          pluginRuntime: {
            listWebExtensions: () => [],
            listHttpRoutes: () => [],
            listHttpMiddlewares: () => [
              {
                name: "test-static-header-middleware",
                handle: () => ({ headers: input.middlewareHeaders ?? {} }),
              },
            ],
          },
        }
      : {}),
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
  test("returns CORS preflight for API paths before route-specific auth handlers", async () => {
    const app = createTestApp();

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/get-session`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:4173",
          "access-control-request-headers": "content-type,x-request-id",
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:4173");
      expect(response.headers.get("access-control-allow-methods")).toContain("OPTIONS");
      expect(response.headers.get("access-control-allow-headers")).toBe(
        "content-type,x-request-id",
      );
    });
  });

  test("[PRODUCT-AUTH-PUBLIC-CONFIG-001] serves provider availability without session state", async () => {
    const authChecks: string[] = [];
    const app = createTestApp({
      authPublicConfig: {
        schemaVersion: "appaloft.auth.public-config/v1",
        enabled: true,
        provider: "better-auth",
        providers: [
          {
            key: "github",
            title: "GitHub",
            configured: true,
            deferred: true,
            connectPath: "/api/auth/sign-in/social",
          },
        ],
      },
      authSessionStatus: {
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
        deferredAuth: true,
        session: null,
        providers: [],
      },
      onAuthSessionStatus: (request) => authChecks.push(new URL(request.url).pathname),
    });

    await withServer(app, async (baseUrl) => {
      const configResponse = await fetch(`${baseUrl}/api/auth/public-config`);
      expect(configResponse.status).toBe(200);
      expect(configResponse.headers.get("cache-control")).toBe("no-store");
      await expect(configResponse.json()).resolves.toMatchObject({
        schemaVersion: "appaloft.auth.public-config/v1",
        enabled: true,
        provider: "better-auth",
        providers: [
          {
            key: "github",
            configured: true,
            connectPath: "/api/auth/sign-in/social",
          },
        ],
      });

      const scriptResponse = await fetch(`${baseUrl}/api/auth/public-config.js`);
      expect(scriptResponse.status).toBe(200);
      expect(scriptResponse.headers.get("content-type")).toContain("application/javascript");
      const script = await scriptResponse.text();
      expect(script).toContain("window.__APPALOFT_PUBLIC_CONFIG__");
      expect(script).toContain('"schemaVersion":"appaloft.auth.public-config/v1"');
      expect(script).toContain('"github"');
      expect(script).toContain('"configured":true');
      expect(script).not.toContain("clientSecret");
    });

    expect(authChecks).toEqual([]);
  });

  test("serves public docs base path through runtime config script", async () => {
    const app = createTestApp({
      publicDocsBasePath: "https://appaloft.com/docs",
    });

    await withServer(app, async (baseUrl) => {
      const scriptResponse = await fetch(`${baseUrl}/api/auth/public-config.js`);
      expect(scriptResponse.status).toBe(200);
      const script = await scriptResponse.text();
      expect(script).toContain('"docs":{"basePath":"https://appaloft.com/docs"}');
      expect(script).not.toContain("clientSecret");
    });
  });

  test("[FIRST-ADMIN-NAV-001] redirects console navigation to first-admin before serving SPA", async () => {
    const queries: Query<unknown>[] = [];
    const app = createTestApp({
      authBootstrapStatus: {
        bootstrapRequired: true,
        firstAdminConfigured: false,
        organizationConfigured: false,
        loginMethods: [{ key: "local-password", configured: true, enabled: true }],
        nextSteps: ["create-first-admin"],
      },
      embeddedWebAssets: {
        "/index.html": new Blob(["web-index"]),
        "/200.html": new Blob(["web-spa-fallback"]),
        "/_app/immutable/app.js": new Blob(["console-asset"]),
      },
      onQuery: (query) => queries.push(query),
    });

    await withServer(app, async (baseUrl) => {
      const rootResponse = await fetch(`${baseUrl}/`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });

      expect(rootResponse.status).toBe(302);
      expect(rootResponse.headers.get("location")).toBe("/bootstrap/auth/first-admin");

      const response = await fetch(`${baseUrl}/projects/prj_1/environments/env_1`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/bootstrap/auth/first-admin");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(queries).toHaveLength(2);
      expect(queries[0]).toBeInstanceOf(GetAuthBootstrapStatusQuery);
      expect(queries[1]).toBeInstanceOf(GetAuthBootstrapStatusQuery);

      const firstAdminPage = await fetch(`${baseUrl}/bootstrap/auth/first-admin`, {
        headers: {
          accept: "text/html",
        },
      });
      expect(firstAdminPage.status).toBe(200);
      expect(await firstAdminPage.text()).toBe("web-spa-fallback");

      const asset = await fetch(`${baseUrl}/_app/immutable/app.js`, {
        headers: {
          accept: "text/html",
        },
      });
      expect(asset.status).toBe(200);
      expect(await asset.text()).toBe("console-asset");

      const health = await fetch(`${baseUrl}/api/health`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });
      expect(health.status).toBe(200);
    });
  });

  test("[FIRST-ADMIN-NAV-001] caches completed bootstrap for console navigation", async () => {
    const queries: Query<unknown>[] = [];
    const app = createTestApp({
      authBootstrapStatus: {
        bootstrapRequired: false,
        firstAdminConfigured: true,
        organizationConfigured: true,
        loginMethods: [{ key: "local-password", configured: true, enabled: true }],
        nextSteps: ["sign-in"],
      },
      embeddedWebAssets: {
        "/200.html": new Blob(["web-spa-fallback"]),
      },
      onQuery: (query) => queries.push(query),
    });

    await withServer(app, async (baseUrl) => {
      await expect(
        fetch(`${baseUrl}/projects/prj_1`, {
          headers: {
            accept: "text/html",
          },
        }).then((response) => response.text()),
      ).resolves.toBe("web-spa-fallback");

      await expect(
        fetch(`${baseUrl}/resources/res_1`, {
          headers: {
            accept: "text/html",
          },
        }).then((response) => response.text()),
      ).resolves.toBe("web-spa-fallback");

      expect(queries).toHaveLength(1);
      expect(queries[0]).toBeInstanceOf(GetAuthBootstrapStatusQuery);
    });
  });

  test("[OP-GUARD-005] carries neutral request security headers into HTTP execution context", async () => {
    const contexts: Parameters<typeof createExecutionContext>[0][] = [];
    const app = createTestApp({
      embeddedWebAssets: {
        "/200.html": new Blob(["web-spa-fallback"]),
      },
      onExecutionContextCreate: (contextInput) => {
        contexts.push(contextInput);
        return createExecutionContext(contextInput);
      },
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/projects/prj_request_security`, {
        headers: {
          accept: "text/html",
          "x-appaloft-edge-action": "managed_challenge",
          "x-appaloft-edge-provider": "edge-fixture",
          "x-appaloft-edge-ray-id": "ray_fixture",
          "x-appaloft-edge-rule-id": "rule_fixture",
          "x-appaloft-bot-score": "7",
          "x-appaloft-fraud-risk-score": "95",
          "x-request-id": "req_http_request_security",
        },
      });

      expect(response.status).toBe(200);
    });

    expect(contexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entrypoint: "http",
          requestId: "req_http_request_security",
          requestSecurity: {
            botScore: 7,
            edgeAction: "managed_challenge",
            edgeProvider: "edge-fixture",
            edgeRayId: "ray_fixture",
            edgeRuleId: "rule_fixture",
            fraudRiskScore: 95,
          },
        }),
      ]),
    );
  });

  test("[PRODUCT-AUTH-NAV-001] redirects anonymous console navigation to login before serving SPA", async () => {
    const authChecks: string[] = [];
    const app = createTestApp({
      authSessionStatus: {
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
        deferredAuth: true,
        session: null,
        providers: [],
      },
      embeddedWebAssets: {
        "/200.html": new Blob(["web-spa-fallback"]),
        "/_app/immutable/app.js": new Blob(["console-asset"]),
      },
      onAuthSessionStatus: (request) => authChecks.push(new URL(request.url).pathname),
    });

    await withServer(app, async (baseUrl) => {
      const rootResponse = await fetch(`${baseUrl}/`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });

      expect(rootResponse.status).toBe(302);
      expect(rootResponse.headers.get("location")).toBe("/login?next=%2F");
      expect(rootResponse.headers.get("cache-control")).toBe("no-store");

      const deepLinkResponse = await fetch(`${baseUrl}/projects/prj_1?tab=logs`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });

      expect(deepLinkResponse.status).toBe(302);
      expect(deepLinkResponse.headers.get("location")).toBe(
        "/login?next=%2Fprojects%2Fprj_1%3Ftab%3Dlogs",
      );

      const loginPage = await fetch(`${baseUrl}/login`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });
      expect(loginPage.status).toBe(200);
      expect(await loginPage.text()).toBe("web-spa-fallback");

      const signUpPage = await fetch(`${baseUrl}/sign-up`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });
      expect(signUpPage.status).toBe(200);
      expect(await signUpPage.text()).toBe("web-spa-fallback");

      const verifyEmailPage = await fetch(`${baseUrl}/verify-email`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });
      expect(verifyEmailPage.status).toBe(200);
      expect(await verifyEmailPage.text()).toBe("web-spa-fallback");

      const forgotPasswordPage = await fetch(`${baseUrl}/forgot-password`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });
      expect(forgotPasswordPage.status).toBe(200);
      expect(await forgotPasswordPage.text()).toBe("web-spa-fallback");

      const resetPasswordPage = await fetch(`${baseUrl}/reset-password?token=tok_test`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });
      expect(resetPasswordPage.status).toBe(200);
      expect(await resetPasswordPage.text()).toBe("web-spa-fallback");

      const asset = await fetch(`${baseUrl}/_app/immutable/app.js`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });
      expect(asset.status).toBe(200);
      expect(await asset.text()).toBe("console-asset");

      const health = await fetch(`${baseUrl}/api/health`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });
      expect(health.status).toBe(200);

      const signUpApi = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "user@example.com",
          name: "User",
          password: "password-1234",
        }),
      });
      expect(signUpApi.status).toBe(200);
      expect(await signUpApi.text()).toBe("auth-runtime");
    });

    expect(authChecks).toEqual(["/", "/projects/prj_1"]);
  });

  test("[PRODUCT-AUTH-NAV-001] serves console navigation when a product session exists", async () => {
    const app = createTestApp({
      authSessionStatus: {
        accountSecurity: {
          enabled: true,
          passwordState: "set",
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
        loginRequired: false,
        deferredAuth: true,
        session: {
          user: {
            id: "usr_test",
          },
        },
        providers: [],
      },
      embeddedWebAssets: {
        "/200.html": new Blob(["web-spa-fallback"]),
      },
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/projects/prj_1`, {
        headers: {
          accept: "text/html",
        },
        redirect: "manual",
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("web-spa-fallback");
    });
  });

  test("[CONTROL-PLANE-INSTALL-005] serves SvelteKit clean URLs before the SPA fallback from embedded Web assets", async () => {
    const app = createTestApp({
      embeddedWebAssets: {
        "/index.html": new Blob(["web-index"]),
        "/200.html": new Blob(["web-spa-fallback"]),
        "/domain-bindings.html": new Blob(["domain-bindings-page"]),
        "/servers/srv_1/index.html": new Blob(["server-page"]),
      },
    });

    await withServer(app, async (baseUrl) => {
      await expect(fetch(`${baseUrl}/`).then((response) => response.text())).resolves.toBe(
        "web-index",
      );
      await expect(
        fetch(`${baseUrl}/domain-bindings`).then((response) => response.text()),
      ).resolves.toBe("domain-bindings-page");
      await expect(
        fetch(`${baseUrl}/servers/srv_1`).then((response) => response.text()),
      ).resolves.toBe("server-page");
      await expect(
        fetch(`${baseUrl}/projects/prj_1/environments/env_1/resources/res_1`).then((response) =>
          response.text(),
        ),
      ).resolves.toBe("web-spa-fallback");
    });
  });

  test("[CONTROL-PLANE-INSTALL-005] serves SvelteKit clean URLs before the SPA fallback from webStaticDir", async () => {
    const webDir = await createTempDir();
    await mkdir(join(webDir, "servers", "srv_1"), { recursive: true });
    await Bun.write(join(webDir, "index.html"), "web-index");
    await Bun.write(join(webDir, "200.html"), "web-spa-fallback");
    await Bun.write(join(webDir, "domain-bindings.html"), "domain-bindings-page");
    await Bun.write(join(webDir, "servers", "srv_1", "index.html"), "server-page");

    const app = createTestApp({
      webStaticDir: webDir,
    });

    await withServer(app, async (baseUrl) => {
      await expect(fetch(`${baseUrl}/`).then((response) => response.text())).resolves.toBe(
        "web-index",
      );
      await expect(
        fetch(`${baseUrl}/domain-bindings`).then((response) => response.text()),
      ).resolves.toBe("domain-bindings-page");
      await expect(
        fetch(`${baseUrl}/servers/srv_1`).then((response) => response.text()),
      ).resolves.toBe("server-page");
      await expect(
        fetch(`${baseUrl}/projects/prj_1/environments/env_1/resources/res_1`).then((response) =>
          response.text(),
        ),
      ).resolves.toBe("web-spa-fallback");
    });
  });

  test("[HTTP-STATIC-MIME-001] preserves static file MIME types when middleware adds response headers", async () => {
    const webDir = await createTempDir();
    await mkdir(join(webDir, "_app", "immutable", "assets"), { recursive: true });
    await Bun.write(join(webDir, "index.html"), "<!doctype html><title>Appaloft</title>");
    await Bun.write(join(webDir, "_app", "immutable", "assets", "app.css"), "body{}");

    const app = createTestApp({
      webStaticDir: webDir,
      middlewareHeaders: {
        "x-content-type-options": "nosniff",
        "x-test-static-header": "applied",
      },
    });

    await withServer(app, async (baseUrl) => {
      const rootResponse = await fetch(`${baseUrl}/`);
      const cssResponse = await fetch(`${baseUrl}/_app/immutable/assets/app.css`);

      expect(rootResponse.status).toBe(200);
      expect(rootResponse.headers.get("content-type")).toContain("text/html");
      expect(rootResponse.headers.get("x-content-type-options")).toBe("nosniff");
      expect(rootResponse.headers.get("x-test-static-header")).toBe("applied");
      expect(await rootResponse.text()).toContain("<!doctype html>");

      expect(cssResponse.status).toBe(200);
      expect(cssResponse.headers.get("content-type")).toContain("text/css");
      expect(cssResponse.headers.get("x-content-type-options")).toBe("nosniff");
      expect(cssResponse.headers.get("x-test-static-header")).toBe("applied");
      expect(await cssResponse.text()).toBe("body{}");
    });
  });

  test("[HTTP-STATIC-MIME-001] preserves embedded asset MIME types when middleware adds response headers", async () => {
    const app = createTestApp({
      embeddedWebAssets: {
        "/index.html": new Blob(["<!doctype html><title>Appaloft</title>"], {
          type: "text/html;charset=utf-8",
        }),
        "/_app/immutable/assets/app.css": new Blob(["body{}"], {
          type: "text/css;charset=utf-8",
        }),
      },
      middlewareHeaders: {
        "x-content-type-options": "nosniff",
        "x-test-static-header": "applied",
      },
    });

    await withServer(app, async (baseUrl) => {
      const rootResponse = await fetch(`${baseUrl}/`);
      const cssResponse = await fetch(`${baseUrl}/_app/immutable/assets/app.css`);

      expect(rootResponse.status).toBe(200);
      expect(rootResponse.headers.get("content-type")).toContain("text/html");
      expect(rootResponse.headers.get("x-content-type-options")).toBe("nosniff");
      expect(rootResponse.headers.get("x-test-static-header")).toBe("applied");
      expect(await rootResponse.text()).toContain("<!doctype html>");

      expect(cssResponse.status).toBe(200);
      expect(cssResponse.headers.get("content-type")).toContain("text/css");
      expect(cssResponse.headers.get("x-content-type-options")).toBe("nosniff");
      expect(cssResponse.headers.get("x-test-static-header")).toBe("applied");
      expect(await cssResponse.text()).toBe("body{}");
    });
  });

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

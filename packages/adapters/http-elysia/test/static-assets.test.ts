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
import { type AuthSessionResponse } from "@appaloft/contracts";
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
  authSessionStatus?: AuthSessionResponse;
  authBootstrapStatus?: AuthBootstrapStatus;
  docsStaticDir?: string;
  embeddedDocsAssets?: Readonly<Record<string, Blob>>;
  embeddedWebAssets?: Readonly<Record<string, Blob>>;
  onAuthSessionStatus?: (request: Request) => void;
  onQuery?: (query: Query<unknown>) => void;
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
        webStaticDir: input?.webStaticDir ?? "",
        docsStaticDir: input?.docsStaticDir ?? "",
      },
    }),
    commandBus: {} as unknown as CommandBus,
    queryBus,
    logger: new SilentLogger(),
    executionContextFactory: {
      create(contextInput) {
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

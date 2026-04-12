import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = String(3400 + Math.floor(Math.random() * 200));
const baseUrl = `http://127.0.0.1:${port}`;
const shellRoot = new URL("../..", import.meta.url).pathname;

function runtimeEnv(options: {
  dataDir: string;
  pgliteDataDir: string;
  baseUrl: string;
  port: string;
  githubClientId?: string;
  githubClientSecret?: string;
}): Record<string, string | undefined> {
  return {
    ...process.env,
    YUNDU_RUNTIME_MODE: "hosted-control-plane",
    YUNDU_DATABASE_DRIVER: "pglite",
    YUNDU_DATA_DIR: options.dataDir,
    YUNDU_PGLITE_DATA_DIR: options.pgliteDataDir,
    YUNDU_BETTER_AUTH_URL: options.baseUrl,
    YUNDU_BETTER_AUTH_SECRET: "development-only-yundu-better-auth-secret-change-me",
    YUNDU_HTTP_HOST: "127.0.0.1",
    YUNDU_HTTP_PORT: options.port,
    YUNDU_APP_VERSION: "0.1.0-hosted-test",
    YUNDU_WEB_STATIC_DIR: "",
    ...(options.githubClientId ? { YUNDU_GITHUB_CLIENT_ID: options.githubClientId } : {}),
    ...(options.githubClientSecret
      ? { YUNDU_GITHUB_CLIENT_SECRET: options.githubClientSecret }
      : {}),
  };
}

function runCli(
  args: string[],
  options: {
    dataDir: string;
    pgliteDataDir: string;
    baseUrl?: string;
    port?: string;
    githubClientId?: string;
    githubClientSecret?: string;
  },
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: runtimeEnv({
      dataDir: options.dataDir,
      pgliteDataDir: options.pgliteDataDir,
      baseUrl: options.baseUrl ?? baseUrl,
      port: options.port ?? port,
      ...(options.githubClientId ? { githubClientId: options.githubClientId } : {}),
      ...(options.githubClientSecret ? { githubClientSecret: options.githubClientSecret } : {}),
    }),
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }

    await Bun.sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

describe("hosted auth runtime e2e", () => {
  test("mounts Better Auth as built-in runtime while keeping plugins separate", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "yundu-hosted-plugins-"));
    const dataDir = join(workspaceDir, ".yundu", "data");
    const pgliteDataDir = join(dataDir, "pglite");
    let serverProcess: Bun.Subprocess | null = null;

    try {
      const migration = runCli(["db", "migrate"], {
        dataDir,
        pgliteDataDir,
      });
      expect(migration.exitCode).toBe(0);

      serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
        cwd: shellRoot,
        env: runtimeEnv({ dataDir, pgliteDataDir, baseUrl, port }),
        stdout: "ignore",
        stderr: "ignore",
      });

      await waitForHealth(`${baseUrl}/api/health`);

      const versionResponse = await fetch(`${baseUrl}/api/version`);
      const pluginsResponse = await fetch(`${baseUrl}/api/plugins`);
      const webExtensionsResponse = await fetch(`${baseUrl}/api/system-plugins/web-extensions`);
      const authSessionResponse = await fetch(`${baseUrl}/api/auth/session`);
      const betterAuthSessionResponse = await fetch(`${baseUrl}/api/auth/get-session`);

      expect(versionResponse.ok).toBe(true);
      expect(pluginsResponse.ok).toBe(true);
      expect(webExtensionsResponse.ok).toBe(true);
      expect(authSessionResponse.ok).toBe(true);
      expect(betterAuthSessionResponse.ok).toBe(true);

      expect(
        (await versionResponse.json()) as {
          mode: string;
        },
      ).toEqual(
        expect.objectContaining({
          mode: "hosted-control-plane",
        }),
      );

      expect(
        (
          (await pluginsResponse.json()) as {
            items: Array<{ name: string; kind: string }>;
          }
        ).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "builtin-fake-runtime",
          }),
        ]),
      );

      expect(
        (
          (await webExtensionsResponse.json()) as {
            items: Array<{ path: string; pluginName: string }>;
          }
        ).items,
      ).toEqual([]);
      expect(
        (await authSessionResponse.json()) as {
          provider: string;
          enabled: boolean;
          deferredAuth: boolean;
          providers: Array<{ key: string; configured: boolean; connected: boolean }>;
        },
      ).toEqual(
        expect.objectContaining({
          enabled: true,
          provider: "better-auth",
          deferredAuth: true,
          providers: expect.arrayContaining([
            expect.objectContaining({
              key: "github",
              configured: false,
              connected: false,
            }),
          ]),
        }),
      );

      expect(await betterAuthSessionResponse.text()).toBe("null");
    } finally {
      serverProcess?.kill();
      await serverProcess?.exited;
      rmSync(workspaceDir, {
        recursive: true,
        force: true,
      });
    }
  }, 30000);

  test("returns a GitHub authorization URL when OAuth is configured", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "yundu-github-oauth-"));
    const dataDir = join(workspaceDir, ".yundu", "data");
    const pgliteDataDir = join(dataDir, "pglite");
    const oauthPort = String(3600 + Math.floor(Math.random() * 200));
    const oauthBaseUrl = `http://127.0.0.1:${oauthPort}`;
    let serverProcess: Bun.Subprocess | null = null;

    try {
      const migration = runCli(["db", "migrate"], {
        dataDir,
        pgliteDataDir,
        baseUrl: oauthBaseUrl,
        port: oauthPort,
        githubClientId: "yundu-test-client",
        githubClientSecret: "yundu-test-secret",
      });
      expect(migration.exitCode).toBe(0);

      serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
        cwd: shellRoot,
        env: runtimeEnv({
          dataDir,
          pgliteDataDir,
          baseUrl: oauthBaseUrl,
          port: oauthPort,
          githubClientId: "yundu-test-client",
          githubClientSecret: "yundu-test-secret",
        }),
        stdout: "ignore",
        stderr: "ignore",
      });

      await waitForHealth(`${oauthBaseUrl}/api/health`);

      const authSessionResponse = await fetch(`${oauthBaseUrl}/api/auth/session`);
      expect(authSessionResponse.ok).toBe(true);
      expect(
        (await authSessionResponse.json()) as {
          providers: Array<{ key: string; configured: boolean; connected: boolean }>;
        },
      ).toEqual(
        expect.objectContaining({
          providers: expect.arrayContaining([
            expect.objectContaining({
              key: "github",
              configured: true,
              connected: false,
            }),
          ]),
        }),
      );

      const authorizeResponse = await fetch(`${oauthBaseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: "github",
          callbackURL: `${oauthBaseUrl}/after-oauth`,
          scopes: ["repo", "read:user"],
          disableRedirect: true,
        }),
      });
      expect(authorizeResponse.ok).toBe(true);

      const authorizePayload = (await authorizeResponse.json()) as {
        redirect: boolean;
        url?: string;
      };
      expect(authorizePayload.redirect).toBe(false);
      expect(typeof authorizePayload.url).toBe("string");

      const authorizeUrl = new URL(authorizePayload.url ?? "");
      expect(authorizeUrl.origin).toBe("https://github.com");
      expect(authorizeUrl.pathname).toBe("/login/oauth/authorize");
      expect(authorizeUrl.searchParams.get("client_id")).toBe("yundu-test-client");
    } finally {
      serverProcess?.kill();
      await serverProcess?.exited;
      rmSync(workspaceDir, {
        recursive: true,
        force: true,
      });
    }
  }, 30000);
});

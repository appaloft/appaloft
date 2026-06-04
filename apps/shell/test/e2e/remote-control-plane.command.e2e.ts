import { afterEach, describe, expect, test } from "bun:test";
import {
  type CliResult,
  cleanupWorkspace,
  createShellE2eWorkspace,
  createShellHttpAdminSession,
  expectCliSuccess,
  parseJson,
  reservePort,
  runShellCli,
  type ShellCliOptions,
  type ShellE2eWorkspace,
  shellRoot,
  waitForHttpHealth,
} from "./support/shell-e2e-fixture";

const htmlShell = [
  "<!doctype html>",
  "<html>",
  "<head><title>Appaloft</title></head>",
  '<body><div id="svelte">Svelte shell fallback</div></body>',
  "</html>",
].join("");

let workspace: ShellE2eWorkspace | undefined;

afterEach(() => {
  if (workspace) {
    cleanupWorkspace(workspace.workspaceDir);
    workspace = undefined;
  }
});

function expectJsonStdout(result: ReturnType<typeof runShellCli>, label: string): unknown {
  expectCliSuccess(result, label);
  expect(result.stdout, label).not.toContain("<!doctype html>");
  expect(result.stdout, label).not.toContain("<html");
  expect(result.stderr, label).not.toContain("<!doctype html>");
  expect(result.stderr, label).not.toContain("<html");
  return parseJson(result.stdout);
}

async function runShellCliAsync(args: string[], options: ShellCliOptions): Promise<CliResult> {
  const child = Bun.spawn([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: {
      ...process.env,
      OTEL_SDK_DISABLED: "true",
      APPALOFT_APP_VERSION: options.appVersion ?? "0.1.0-e2e",
      APPALOFT_DATABASE_DRIVER: "pglite",
      APPALOFT_DATA_DIR: options.dataDir,
      APPALOFT_HTTP_HOST: "127.0.0.1",
      APPALOFT_HTTP_PORT: options.httpPort ?? "0",
      APPALOFT_PGLITE_DATA_DIR: options.pgliteDataDir,
      APPALOFT_WEB_STATIC_DIR: "",
      ...options.env,
    },
    stderr: "pipe",
    stdout: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return {
    exitCode,
    stderr,
    stdout,
  };
}

async function startRemoteControlPlaneServer(options: ShellCliOptions): Promise<{
  readonly baseUrl: string;
  readonly stop: () => Promise<void>;
}> {
  if (!options.httpPort) {
    throw new Error("startRemoteControlPlaneServer requires options.httpPort");
  }

  const serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
    cwd: shellRoot,
    env: {
      ...process.env,
      OTEL_SDK_DISABLED: "true",
      APPALOFT_APP_VERSION: options.appVersion ?? "0.1.0-remote-cli-e2e",
      APPALOFT_DATABASE_DRIVER: "pglite",
      APPALOFT_DATA_DIR: options.dataDir,
      APPALOFT_HTTP_HOST: "127.0.0.1",
      APPALOFT_HTTP_PORT: options.httpPort,
      APPALOFT_PGLITE_DATA_DIR: options.pgliteDataDir,
      APPALOFT_WEB_STATIC_DIR: "",
      ...options.env,
    },
    stderr: "pipe",
    stdout: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${options.httpPort}`;

  try {
    await waitForHttpHealth(`${baseUrl}/api/health`);
  } catch (error) {
    serverProcess.kill();
    const stderr = await new Response(serverProcess.stderr).text().catch(() => "");
    await serverProcess.exited.catch(() => undefined);
    throw new Error(
      [`Remote control-plane server did not become healthy at ${baseUrl}`, stderr, String(error)]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return {
    baseUrl,
    async stop() {
      serverProcess.kill();
      await serverProcess.exited;
    },
  };
}

describe("remote control-plane CLI e2e", () => {
  test("[CONTROL-PLANE-CLI-010] serve-backed remote commands return JSON through generated SDK routes", async () => {
    const port = await reservePort();
    workspace = createShellE2eWorkspace("appaloft-remote-cli-e2e-", {
      httpPort: String(port),
    });
    const server = await startRemoteControlPlaneServer(workspace.cliOptions);

    try {
      const admin = await createShellHttpAdminSession(server.baseUrl);
      const cliOptions = {
        ...workspace.cliOptions,
        env: {
          ...workspace.cliOptions.env,
          APPALOFT_AUTH_COOKIE: admin.cookie,
        },
      };
      const remotePrefix = [
        "--control-plane-mode",
        "self-hosted",
        "--control-plane-url",
        server.baseUrl,
      ];

      const createdProject = expectJsonStdout(
        runShellCli([...remotePrefix, "project", "create", "--name", "Remote CLI E2E"], cliOptions),
        "project create",
      ) as { id: string };

      const readOnlyCases = [
        {
          label: "organization context",
          args: ["organization", "context"],
        },
        {
          label: "project list",
          args: ["project", "list"],
        },
        {
          label: "default access list",
          args: ["default-access", "list"],
        },
        {
          label: "server list",
          args: ["server", "list"],
        },
        {
          label: "storage volume list",
          args: ["storage", "volume", "list", "--project", createdProject.id],
        },
        {
          label: "providers list",
          args: ["providers", "list"],
        },
        {
          label: "plugins list",
          args: ["plugins", "list"],
        },
      ];

      for (const remoteCase of readOnlyCases) {
        expectJsonStdout(
          runShellCli([...remotePrefix, ...remoteCase.args], cliOptions),
          remoteCase.label,
        );
      }
    } finally {
      await server.stop();
    }
  });

  test("[CONTROL-PLANE-CLI-014] HTML fallback transport errors do not leak the Svelte shell", async () => {
    workspace = createShellE2eWorkspace("appaloft-remote-cli-html-");
    const fakeServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(htmlShell, {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
          status: 200,
        }),
    });

    try {
      const baseUrl = `http://127.0.0.1:${fakeServer.port}`;
      const result = await runShellCliAsync(
        ["--control-plane-mode", "self-hosted", "--control-plane-url", baseUrl, "project", "list"],
        {
          ...workspace.cliOptions,
          env: {
            APPALOFT_TOKEN: "tok_fake_html_fallback",
          },
        },
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("control_plane_unexpected_html_response");
      expect(result.stderr).toContain("method");
      expect(result.stderr).toContain("GET");
      expect(result.stderr).toContain(`${baseUrl}/api/version`);
      expect(result.stderr).toContain("status");
      expect(result.stderr).toContain("200");
      expect(result.stderr).toContain("contentType");
      expect(result.stderr).toContain("text/html");
      expect(result.stderr).not.toContain("<!doctype html>");
      expect(result.stderr).not.toContain("<html");
      expect(result.stdout).not.toContain("<!doctype html>");
      expect(result.stdout).not.toContain("<html");
      expect(result.stderr).not.toContain("Unexpected token");
    } finally {
      fakeServer.stop(true);
    }
  });
});

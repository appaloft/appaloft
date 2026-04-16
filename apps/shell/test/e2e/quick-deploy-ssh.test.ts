import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const enabled = process.env.YUNDU_E2E_SSH_QUICK_DEPLOY === "true";
const shellRoot = new URL("../..", import.meta.url).pathname;
const successfulFixtureDir = new URL("../fixtures/docker-express-hello", import.meta.url).pathname;
const failingFixtureDir = new URL("../fixtures/docker-exits-fast", import.meta.url).pathname;

interface CliOptions {
  dataDir: string;
  pgliteDataDir: string;
}

interface SshConfig {
  host: string;
  port: string;
  username: string;
  privateKeyFile: string;
}

interface WorkspaceDirs extends CliOptions {
  workspaceDir: string;
}

interface QuickDeployContext {
  projectId: string;
  serverId: string;
  environmentId: string;
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function sshConfig(): SshConfig {
  const host = process.env.YUNDU_E2E_SSH_HOST;
  const privateKeyFile = expandHome(process.env.YUNDU_E2E_SSH_PRIVATE_KEY ?? "~/.ssh/yundu");

  if (!host) {
    throw new Error("YUNDU_E2E_SSH_HOST is required when YUNDU_E2E_SSH_QUICK_DEPLOY=true");
  }

  if (!existsSync(privateKeyFile)) {
    throw new Error(`SSH private key file does not exist: ${privateKeyFile}`);
  }

  return {
    host,
    port: process.env.YUNDU_E2E_SSH_PORT ?? "22",
    username: process.env.YUNDU_E2E_SSH_USERNAME ?? "root",
    privateKeyFile,
  };
}

function runCli(
  args: string[],
  options: CliOptions,
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: {
      ...process.env,
      YUNDU_DATABASE_DRIVER: "pglite",
      YUNDU_DATA_DIR: options.dataDir,
      YUNDU_HTTP_HOST: "127.0.0.1",
      YUNDU_HTTP_PORT: "0",
      YUNDU_PGLITE_DATA_DIR: options.pgliteDataDir,
      YUNDU_WEB_STATIC_DIR: "",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function runSsh(
  config: SshConfig,
  command: string,
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync(
    [
      "ssh",
      "-i",
      config.privateKeyFile,
      "-p",
      config.port,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      `${config.username}@${config.host}`,
      command,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function parseJson<T>(raw: string): T {
  const objectStart = raw.indexOf("{");
  const arrayStart = raw.indexOf("[");
  const start =
    objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  if (start < 0) {
    throw new SyntaxError("No JSON payload found");
  }

  const opening = raw[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === opening) {
      depth += 1;
      continue;
    }

    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(raw.slice(start, index + 1)) as T;
      }
    }
  }

  throw new SyntaxError("Unterminated JSON payload");
}

function expectCliSuccess(result: ReturnType<typeof runCli>, label: string): void {
  expect(result.exitCode, `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
}

function remoteCleanup(config: SshConfig, deploymentId: string): void {
  const containerName = `yundu-${deploymentId}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  const imageName = `yundu-image-${deploymentId}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  const remoteRuntimeRoot = process.env.YUNDU_REMOTE_RUNTIME_ROOT ?? "/var/lib/yundu/runtime";
  const remoteRoot = `${remoteRuntimeRoot.replace(/\/+$/, "")}/ssh-deployments/${deploymentId.toLowerCase().replace(/[^a-z0-9_.-]/g, "-")}`;
  runSsh(
    config,
    [
      `docker rm -f '${containerName}' >/dev/null 2>&1 || true`,
      `docker image rm -f '${imageName}' >/dev/null 2>&1 || true`,
      `rm -rf '${remoteRoot}'`,
    ].join(" && "),
  );
}

function createWorkspaceDirs(): WorkspaceDirs {
  const workspaceDir = mkdtempSync(join(tmpdir(), "yundu-quick-deploy-ssh-"));
  const dataDir = join(workspaceDir, ".yundu", "data");

  return {
    workspaceDir,
    dataDir,
    pgliteDataDir: join(dataDir, "pglite"),
  };
}

function bootstrapSshContext(
  config: SshConfig,
  options: CliOptions,
  input: {
    suffix: string;
    proxyKind: "none" | "traefik";
  },
): QuickDeployContext {
  const project = runCli(["project", "create", "--name", `SSH Quick ${input.suffix}`], options);
  expectCliSuccess(project, "create project");
  const projectId = parseJson<{ id: string }>(project.stdout).id;

  const server = runCli(
    [
      "server",
      "register",
      "--name",
      `ssh-${input.suffix}`,
      "--host",
      config.host,
      "--port",
      config.port,
      "--provider",
      "generic-ssh",
      "--proxy-kind",
      input.proxyKind,
    ],
    options,
  );
  expectCliSuccess(server, "register server");
  const serverId = parseJson<{ id: string }>(server.stdout).id;

  const credential = runCli(
    [
      "server",
      "credential",
      serverId,
      "--kind",
      "ssh-private-key",
      "--username",
      config.username,
      "--private-key-file",
      resolve(config.privateKeyFile),
    ],
    options,
  );
  expectCliSuccess(credential, "configure server credential");

  const doctor = runCli(["server", "doctor", serverId], options);
  expectCliSuccess(doctor, "server doctor");
  const doctorOutput = parseJson<{
    status: string;
    checks: Array<{ name: string; status: string }>;
  }>(doctor.stdout);
  expect(doctorOutput.status).not.toBe("unreachable");
  expect(doctorOutput.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "ssh", status: "passed" }),
      expect.objectContaining({ name: "docker", status: "passed" }),
    ]),
  );

  const environment = runCli(
    ["env", "create", "--project", projectId, "--name", "production", "--kind", "production"],
    options,
  );
  expectCliSuccess(environment, "create environment");

  return {
    projectId,
    serverId,
    environmentId: parseJson<{ id: string }>(environment.stdout).id,
  };
}

describe("quick deploy ssh e2e", () => {
  if (!enabled) {
    test("is opt-in because it needs a real SSH target with Docker", () => {
      expect(enabled).toBe(false);
    });
    return;
  }

  test("quick deploys a Dockerfile app to an SSH target with embedded PGlite state", () => {
    const config = sshConfig();
    const dockerVersion = runSsh(config, "docker version --format '{{.Server.Version}}'");
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const workspace = createWorkspaceDirs();
    const suffix = crypto.randomUUID().slice(0, 8);
    const appPort = 4500 + Math.floor(Math.random() * 500);
    let deploymentId: string | undefined;

    try {
      const context = bootstrapSshContext(config, workspace, {
        suffix,
        proxyKind: "traefik",
      });

      const deployment = runCli(
        [
          "deploy",
          successfulFixtureDir,
          "--project",
          context.projectId,
          "--server",
          context.serverId,
          "--environment",
          context.environmentId,
          "--method",
          "dockerfile",
          "--port",
          String(appPort),
          "--health-path",
          "/health",
          "--app-log-lines",
          "8",
        ],
        workspace,
      );
      expectCliSuccess(deployment, "quick deploy");
      deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      const deployments = runCli(["deployments", "list"], workspace);
      expectCliSuccess(deployments, "list deployments");
      expect(
        parseJson<{ items: Array<{ id: string; status: string }> }>(deployments.stdout).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: deploymentId,
            status: "succeeded",
          }),
        ]),
      );

      const logs = runCli(["logs", deploymentId], workspace);
      expectCliSuccess(logs, "deployment logs");
      expect(logs.stdout).toContain("Using SSH docker-container execution");
      expect(logs.stdout).toContain("SSH container is reachable internally");
      expect(logs.stdout).toContain("SSH public route is reachable");
    } finally {
      if (deploymentId) {
        remoteCleanup(config, deploymentId);
      }
      rmSync(workspace.workspaceDir, { recursive: true, force: true });
    }
  }, 240000);

  test("captures Docker diagnostics when an SSH container exits before health passes", () => {
    const config = sshConfig();
    const workspace = createWorkspaceDirs();
    const suffix = crypto.randomUUID().slice(0, 8);
    const appPort = 5000 + Math.floor(Math.random() * 500);
    let deploymentId: string | undefined;

    try {
      const context = bootstrapSshContext(config, workspace, {
        suffix,
        proxyKind: "none",
      });
      const deployment = runCli(
        [
          "deploy",
          failingFixtureDir,
          "--project",
          context.projectId,
          "--server",
          context.serverId,
          "--environment",
          context.environmentId,
          "--method",
          "dockerfile",
          "--port",
          String(appPort),
          "--health-path",
          "/health",
          "--app-log-lines",
          "8",
        ],
        workspace,
      );
      expectCliSuccess(deployment, "quick deploy expected to accept failed runtime attempt");
      deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      const deployments = runCli(["deployments", "list"], workspace);
      expectCliSuccess(deployments, "list deployments");
      expect(
        parseJson<{ items: Array<{ id: string; status: string }> }>(deployments.stdout).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: deploymentId,
            status: "failed",
          }),
        ]),
      );

      const logs = runCli(["logs", deploymentId], workspace);
      expectCliSuccess(logs, "deployment logs");
      expect(logs.stdout).toContain("Inspect SSH Docker container");
      expect(logs.stdout).toContain("status=exited");
      expect(logs.stdout).toContain("exitCode=42");
      expect(logs.stdout).toContain("intentional startup failure");
    } finally {
      if (deploymentId) {
        remoteCleanup(config, deploymentId);
      }
      rmSync(workspace.workspaceDir, { recursive: true, force: true });
    }
  }, 240000);
});

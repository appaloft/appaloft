import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  cleanupWorkspace,
  createShellE2eWorkspace,
  expectCliSuccess,
  fixturePath,
  parseJson,
  runShellCli,
  type ShellE2eWorkspace,
} from "./support/shell-e2e-fixture";

const enabled = process.env.APPALOFT_E2E_SSH_QUICK_DEPLOY === "true";
const successfulFixtureDir = fixturePath("docker-express-hello");
const failingFixtureDir = fixturePath("docker-exits-fast");
const staticFixtureDir = fixturePath("static-site");

interface SshConfig {
  host: string;
  port: string;
  privateKeyFile: string;
  username: string;
}

interface QuickDeployContext {
  environmentId: string;
  projectId: string;
  serverId: string;
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function sshConfig(): SshConfig {
  const host = process.env.APPALOFT_E2E_SSH_HOST;
  const privateKeyFile = expandHome(process.env.APPALOFT_E2E_SSH_PRIVATE_KEY ?? "~/.ssh/appaloft");

  if (!host) {
    throw new Error("APPALOFT_E2E_SSH_HOST is required when APPALOFT_E2E_SSH_QUICK_DEPLOY=true");
  }

  if (!existsSync(privateKeyFile)) {
    throw new Error(`SSH private key file does not exist: ${privateKeyFile}`);
  }

  return {
    host,
    port: process.env.APPALOFT_E2E_SSH_PORT ?? "22",
    privateKeyFile,
    username: process.env.APPALOFT_E2E_SSH_USERNAME ?? "root",
  };
}

function runSsh(
  config: SshConfig,
  command: string,
): {
  exitCode: number;
  stderr: string;
  stdout: string;
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
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

function remoteCleanup(config: SshConfig, deploymentId: string): void {
  const containerName = `appaloft-${deploymentId}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  const imageName = `appaloft-image-${deploymentId}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  const remoteRuntimeRoot = process.env.APPALOFT_REMOTE_RUNTIME_ROOT ?? "/var/lib/appaloft/runtime";
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

function bootstrapSshContext(input: {
  config: SshConfig;
  proxyKind: "none" | "traefik";
  suffix: string;
  workspace: ShellE2eWorkspace;
}): QuickDeployContext {
  const project = runShellCli(
    ["project", "create", "--name", `SSH Quick ${input.suffix}`],
    input.workspace.cliOptions,
  );
  expectCliSuccess(project, "create project");
  const projectId = parseJson<{ id: string }>(project.stdout).id;

  const server = runShellCli(
    [
      "server",
      "register",
      "--name",
      `ssh-${input.suffix}`,
      "--host",
      input.config.host,
      "--port",
      input.config.port,
      "--provider",
      "generic-ssh",
      "--proxy-kind",
      input.proxyKind,
    ],
    input.workspace.cliOptions,
  );
  expectCliSuccess(server, "register server");
  const serverId = parseJson<{ id: string }>(server.stdout).id;

  const credential = runShellCli(
    [
      "server",
      "credential",
      serverId,
      "--kind",
      "ssh-private-key",
      "--username",
      input.config.username,
      "--private-key-file",
      resolve(input.config.privateKeyFile),
    ],
    input.workspace.cliOptions,
  );
  expectCliSuccess(credential, "configure server credential");

  const doctor = runShellCli(["server", "doctor", serverId], input.workspace.cliOptions);
  expectCliSuccess(doctor, "server doctor");
  const doctorOutput = parseJson<{
    checks: Array<{ name: string; status: string }>;
    status: string;
  }>(doctor.stdout);
  expect(doctorOutput.status).not.toBe("unreachable");
  expect(doctorOutput.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "ssh", status: "passed" }),
      expect.objectContaining({ name: "docker", status: "passed" }),
    ]),
  );

  const environment = runShellCli(
    ["env", "create", "--project", projectId, "--name", "production", "--kind", "production"],
    input.workspace.cliOptions,
  );
  expectCliSuccess(environment, "create environment");

  return {
    environmentId: parseJson<{ id: string }>(environment.stdout).id,
    projectId,
    serverId,
  };
}

describe("quick deploy SSH workflow e2e", () => {
  if (!enabled) {
    test.skip("[QUICK-DEPLOY-WF-022] opt-in SSH Docker workflow requires APPALOFT_E2E_SSH_QUICK_DEPLOY=true", () => {});
    test.skip("[QUICK-DEPLOY-WF-034] opt-in SSH failure diagnostics workflow requires APPALOFT_E2E_SSH_QUICK_DEPLOY=true", () => {});
    test.skip("[QUICK-DEPLOY-WF-040] opt-in SSH static site workflow requires APPALOFT_E2E_SSH_QUICK_DEPLOY=true", () => {});
    return;
  }

  let config: SshConfig;
  let failedRuntimeContext: QuickDeployContext;
  let successfulRuntimeContext: QuickDeployContext;
  let workspace: ShellE2eWorkspace;

  beforeAll(() => {
    config = sshConfig();
    const dockerVersion = runSsh(config, "docker version --format '{{.Server.Version}}'");
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    workspace = createShellE2eWorkspace("appaloft-quick-deploy-ssh-", {
      appVersion: "0.1.0-quick-deploy-ssh-e2e",
    });
    const suffix = crypto.randomUUID().slice(0, 8);

    successfulRuntimeContext = bootstrapSshContext({
      config,
      proxyKind: "traefik",
      suffix: `${suffix}-proxy`,
      workspace,
    });
    failedRuntimeContext = bootstrapSshContext({
      config,
      proxyKind: "none",
      suffix: `${suffix}-plain`,
      workspace,
    });
  }, 60000);

  afterAll(() => {
    if (workspace) {
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 60000);

  test("[QUICK-DEPLOY-WF-022] quick deploys a Dockerfile app to an SSH target with embedded PGlite state", () => {
    const appPort = 4500 + Math.floor(Math.random() * 500);
    let deploymentId: string | undefined;

    try {
      const deployment = runShellCli(
        [
          "deploy",
          successfulFixtureDir,
          "--project",
          successfulRuntimeContext.projectId,
          "--server",
          successfulRuntimeContext.serverId,
          "--environment",
          successfulRuntimeContext.environmentId,
          "--method",
          "dockerfile",
          "--port",
          String(appPort),
          "--health-path",
          "/health",
          "--app-log-lines",
          "8",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(deployment, "quick deploy");
      deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      const deployments = runShellCli(["deployments", "list"], workspace.cliOptions);
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

      const logs = runShellCli(["logs", deploymentId], workspace.cliOptions);
      expectCliSuccess(logs, "deployment logs");
      expect(logs.stdout).toContain("Using SSH docker-container execution");
      expect(logs.stdout).toContain("SSH container is reachable internally");
      expect(logs.stdout).toContain("SSH public route is reachable");
    } finally {
      if (deploymentId) {
        remoteCleanup(config, deploymentId);
      }
    }
  }, 240000);

  test("[QUICK-DEPLOY-WF-040] quick deploys a static site to an SSH Docker target", () => {
    let deploymentId: string | undefined;

    try {
      const deployment = runShellCli(
        [
          "deploy",
          staticFixtureDir,
          "--project",
          successfulRuntimeContext.projectId,
          "--server",
          successfulRuntimeContext.serverId,
          "--environment",
          successfulRuntimeContext.environmentId,
          "--method",
          "static",
          "--publish-dir",
          "/dist",
          "--health-path",
          "/",
          "--app-log-lines",
          "8",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(deployment, "quick deploy static site");
      deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      const deployments = runShellCli(["deployments", "list"], workspace.cliOptions);
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

      const logs = runShellCli(["logs", deploymentId], workspace.cliOptions);
      expectCliSuccess(logs, "deployment logs");
      expect(logs.stdout).toContain("Using SSH docker-container execution");
      expect(logs.stdout).toContain("Generated static site Dockerfile");
      expect(logs.stdout).toContain("SSH container is reachable internally");
      expect(logs.stdout).toContain("SSH public route is reachable");
    } finally {
      if (deploymentId) {
        remoteCleanup(config, deploymentId);
      }
    }
  }, 240000);

  test("[QUICK-DEPLOY-WF-034] captures Docker diagnostics when an SSH container exits before health passes", () => {
    const appPort = 5000 + Math.floor(Math.random() * 500);
    let deploymentId: string | undefined;

    try {
      const deployment = runShellCli(
        [
          "deploy",
          failingFixtureDir,
          "--project",
          failedRuntimeContext.projectId,
          "--server",
          failedRuntimeContext.serverId,
          "--environment",
          failedRuntimeContext.environmentId,
          "--method",
          "dockerfile",
          "--port",
          String(appPort),
          "--health-path",
          "/health",
          "--app-log-lines",
          "8",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(deployment, "quick deploy expected to accept failed runtime attempt");
      deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      const deployments = runShellCli(["deployments", "list"], workspace.cliOptions);
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

      const logs = runShellCli(["logs", deploymentId], workspace.cliOptions);
      expectCliSuccess(logs, "deployment logs");
      expect(logs.stdout).toContain("Inspect SSH Docker container");
      expect(logs.stdout).toContain("status=exited");
      expect(logs.stdout).toContain("exitCode=42");
      expect(logs.stdout).toContain("intentional startup failure");
    } finally {
      if (deploymentId) {
        remoteCleanup(config, deploymentId);
      }
    }
  }, 240000);
});

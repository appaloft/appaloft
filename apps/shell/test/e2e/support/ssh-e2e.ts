import { expect } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  expectCliSuccess,
  parseJson,
  runShellCli,
  type ShellE2eWorkspace,
} from "./shell-e2e-fixture";

export interface SshConfig {
  host: string;
  port: string;
  privateKeyFile: string;
  username: string;
}

export interface QuickDeploySshContext {
  environmentId: string;
  projectId: string;
  serverId: string;
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export function sshConfig(input: { enabledVariable: string }): SshConfig {
  const host = process.env.APPALOFT_E2E_SSH_HOST;
  const privateKeyFile = expandHome(process.env.APPALOFT_E2E_SSH_PRIVATE_KEY ?? "~/.ssh/appaloft");

  if (!host) {
    throw new Error(`APPALOFT_E2E_SSH_HOST is required when ${input.enabledVariable}=true`);
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

export function runSsh(
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

export function remoteCleanup(config: SshConfig, deploymentId: string): void {
  const containerName = `appaloft-${deploymentId}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  const imageName = `appaloft-image-${deploymentId}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  const remoteRuntimeRoot = process.env.APPALOFT_REMOTE_RUNTIME_ROOT ?? "/var/lib/appaloft/runtime";
  const remoteRoot = `${remoteRuntimeRoot.replace(/\/+$/, "")}/ssh-deployments/${deploymentId.toLowerCase().replace(/[^a-z0-9_.-]/g, "-")}`;

  runSsh(
    config,
    [
      `docker compose -p '${containerName}' down --remove-orphans >/dev/null 2>&1 || true`,
      `docker rm -f '${containerName}' >/dev/null 2>&1 || true`,
      `docker image rm -f '${imageName}' >/dev/null 2>&1 || true`,
      `rm -rf '${remoteRoot}'`,
    ].join(" && "),
  );
}

export function bootstrapSshContext(input: {
  config: SshConfig;
  proxyKind: "none" | "traefik";
  suffix: string;
  workspace: ShellE2eWorkspace;
}): QuickDeploySshContext {
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

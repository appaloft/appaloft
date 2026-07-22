import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ash } from "@appaloft/ash";

type SmokeScenario = "basic-docker" | "github-repo" | "scheduled-task-cron";

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface SshConfig {
  host: string;
  port: string;
  privateKeyFile: string;
  username: string;
}

const repositoryRoot = resolve(new URL("../..", import.meta.url).pathname);
const shellRoot = join(repositoryRoot, "apps/shell");
const smokeRunId = resolveSmokeRunId();
const smokeScenario = resolveSmokeScenario();

if (process.env.APPALOFT_PUBLIC_LAUNCH_SMOKE_CONFIRM !== "true") {
  fail(
    "APPALOFT_PUBLIC_LAUNCH_SMOKE_CONFIRM=true is required because this smoke uses a real SSH deployment target.",
  );
}

const workspace = mkdtempSync(join(tmpdir(), "appaloft-public-launch-smoke-"));
const dataDir = join(workspace, ".appaloft", "data");
const pgliteDataDir = join(dataDir, "pglite");
const ssh = readSshConfig();
const deploymentIds: string[] = [];

console.log(`[public-launch-smoke] Scenario: ${smokeScenario}`);
console.log(`[public-launch-smoke] Run id: ${smokeRunId}`);
console.log(`[public-launch-smoke] Target: ${ssh.username}@${ssh.host}:${ssh.port}`);

try {
  runPreflight();
  if (smokeScenario === "scheduled-task-cron") {
    runScheduledTaskCronSmoke();
  } else {
    runDeploymentSmoke(smokeScenario);
  }
  console.log(`[public-launch-smoke] ${smokeScenario} passed.`);
} finally {
  cleanupRemoteDeployments();
  rmSync(workspace, { recursive: true, force: true });
}

function resolveSmokeRunId(): string {
  const raw =
    process.env.APPALOFT_PUBLIC_LAUNCH_SMOKE_RUN_ID ||
    (process.env.GITHUB_RUN_ID
      ? `ci-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || "1"}`
      : `local-${Date.now()}`);
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(normalized)) {
    fail(
      "Smoke run id must start with a lowercase letter or digit and use lowercase letters, digits, or hyphens.",
    );
  }
  return normalized;
}

function resolveSmokeScenario(): SmokeScenario {
  const scenario = process.env.APPALOFT_PUBLIC_LAUNCH_SMOKE_SCENARIO ?? "basic-docker";
  if (
    scenario === "basic-docker" ||
    scenario === "github-repo" ||
    scenario === "scheduled-task-cron"
  ) {
    return scenario;
  }
  fail(
    "APPALOFT_PUBLIC_LAUNCH_SMOKE_SCENARIO must be basic-docker, github-repo, or scheduled-task-cron.",
  );
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} is required.`);
  }
  return value;
}

function readSshConfig(): SshConfig {
  const privateKeyFile = expandHome(readRequiredEnv("APPALOFT_E2E_SSH_PRIVATE_KEY"));
  if (!existsSync(privateKeyFile)) {
    fail(`SSH private key file does not exist: ${privateKeyFile}`);
  }
  return {
    host: readRequiredEnv("APPALOFT_E2E_SSH_HOST"),
    port: process.env.APPALOFT_E2E_SSH_PORT?.trim() || "22",
    privateKeyFile,
    username: process.env.APPALOFT_E2E_SSH_USERNAME?.trim() || "root",
  };
}

function runPreflight(): void {
  const result = run(["bun", "run", "smoke:ssh:preflight"], {
    cwd: repositoryRoot,
    label: "ssh preflight",
  });
  expectSuccess(result, "ssh preflight");
}

function runDeploymentSmoke(scenario: Exclude<SmokeScenario, "scheduled-task-cron">): void {
  const context = bootstrapContext();
  const deployment =
    scenario === "github-repo" ? deployGitHubRepository(context) : deployBasicDockerImage(context);
  deploymentIds.push(deployment.id);
  assertDeploymentSucceeded(deployment.id);
}

function bootstrapContext(): { environmentId: string; projectId: string; serverId: string } {
  const suffix = `${smokeScenario}-${smokeRunId}`.slice(0, 56);
  const project = cli(["project", "create", "--name", `Public smoke ${suffix}`], "create project");
  const projectId = parseJson<{ id: string }>(project.stdout).id;

  const server = cli(
    [
      "server",
      "register",
      "--name",
      `public-smoke-${suffix}`,
      "--host",
      ssh.host,
      "--port",
      ssh.port,
      "--provider",
      "generic-ssh",
    ],
    "register server",
  );
  const serverId = parseJson<{ id: string }>(server.stdout).id;

  cli(
    [
      "server",
      "credential",
      serverId,
      "--kind",
      "ssh-private-key",
      "--username",
      ssh.username,
      "--private-key-file",
      ssh.privateKeyFile,
    ],
    "configure server credential",
  );
  cli(["server", "doctor", serverId], "server doctor");

  const environment = cli(
    ["env", "create", "--project", projectId, "--name", "production", "--kind", "production"],
    "create environment",
  );

  return {
    environmentId: parseJson<{ id: string }>(environment.stdout).id,
    projectId,
    serverId,
  };
}

function deployBasicDockerImage(context: {
  environmentId: string;
  projectId: string;
  serverId: string;
}): { id: string } {
  const image = process.env.APPALOFT_PUBLIC_LAUNCH_SMOKE_DOCKER_IMAGE || "nginx:1.27-alpine";
  const deployment = cli(
    [
      "deploy",
      `docker://${image}`,
      "--project",
      context.projectId,
      "--server",
      context.serverId,
      "--environment",
      context.environmentId,
      "--resource-name",
      `public-smoke-nginx-${smokeRunId}`,
      "--method",
      "prebuilt-image",
      "--port",
      process.env.APPALOFT_PUBLIC_LAUNCH_SMOKE_DOCKER_INTERNAL_PORT || "80",
      "--health-path",
      process.env.APPALOFT_PUBLIC_LAUNCH_SMOKE_DOCKER_HEALTH_CHECK_PATH || "/",
      "--app-log-lines",
      "8",
    ],
    "deploy basic Docker image",
  );
  return parseJson<{ id: string }>(deployment.stdout);
}

function deployGitHubRepository(context: {
  environmentId: string;
  projectId: string;
  serverId: string;
}): { id: string } {
  const repositoryUrl =
    process.env.APPALOFT_PUBLIC_LAUNCH_SMOKE_GITHUB_TREE_URL ||
    "https://github.com/coollabsio/coolify-examples/tree/v4.x/bun";
  const deployment = cli(
    [
      "deploy",
      repositoryUrl,
      "--project",
      context.projectId,
      "--server",
      context.serverId,
      "--environment",
      context.environmentId,
      "--resource-name",
      `public-smoke-github-${smokeRunId}`,
      "--method",
      process.env.APPALOFT_PUBLIC_LAUNCH_SMOKE_GITHUB_METHOD || "dockerfile",
      "--port",
      process.env.APPALOFT_PUBLIC_LAUNCH_SMOKE_GITHUB_INTERNAL_PORT || "3000",
      "--health-path",
      process.env.APPALOFT_PUBLIC_LAUNCH_SMOKE_GITHUB_HEALTH_CHECK_PATH || "/",
      "--app-log-lines",
      "8",
    ],
    "deploy public GitHub repository",
  );
  return parseJson<{ id: string }>(deployment.stdout);
}

function runScheduledTaskCronSmoke(): void {
  const result = run(["bun", "run", "smoke:scheduled-task:ssh"], {
    cwd: repositoryRoot,
    label: "scheduled task SSH smoke",
  });
  expectSuccess(result, "scheduled task SSH smoke");
}

function assertDeploymentSucceeded(deploymentId: string): void {
  const deployments = cli(["deployments", "list"], "list deployments");
  const items = parseJson<{ items: Array<{ id: string; status: string }> }>(
    deployments.stdout,
  ).items;
  const deployment = items.find((item) => item.id === deploymentId);
  if (deployment?.status !== "succeeded") {
    fail(`Deployment ${deploymentId} did not succeed; status=${deployment?.status ?? "missing"}.`);
  }

  const logs = cli(
    ["deployments", "timeline", deploymentId, "--history-limit", "100"],
    "deployment timeline",
  );
  for (const marker of [
    "Using SSH docker-container execution",
    "SSH container is reachable internally",
    "SSH public route is reachable",
  ]) {
    if (!logs.stdout.includes(marker)) {
      fail(
        `Deployment ${deploymentId} logs did not include marker: ${marker}\nlogs:\n${logs.stdout}`,
      );
    }
  }
}

function cli(args: string[], label: string): CliResult {
  const result = run([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    label,
  });
  expectSuccess(result, label);
  return result;
}

function run(command: string[], input: { cwd: string; label: string }): CliResult {
  const result = Bun.spawnSync(command, {
    cwd: input.cwd,
    env: cliEnv(),
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

function cliEnv(): Record<string, string | undefined> {
  return {
    ...process.env,
    OTEL_SDK_DISABLED: "true",
    APPALOFT_APP_VERSION: "0.1.0-public-launch-smoke",
    APPALOFT_CONTROL_PLANE_MODE: "none",
    APPALOFT_DATABASE_DRIVER: "pglite",
    APPALOFT_DATA_DIR: dataDir,
    APPALOFT_HTTP_HOST: "127.0.0.1",
    APPALOFT_HTTP_PORT: "0",
    APPALOFT_OTEL_ENABLED: "false",
    APPALOFT_PGLITE_DATA_DIR: pgliteDataDir,
    APPALOFT_WEB_STATIC_DIR: "",
  };
}

function cleanupRemoteDeployments(): void {
  for (const deploymentId of deploymentIds) {
    const containerName = safeDockerName(`appaloft-${deploymentId}`);
    const imageName = safeDockerName(`appaloft-image-${deploymentId}`);
    const normalizedDeploymentId = safeDockerName(deploymentId);
    const remoteRuntimeRoot =
      process.env.APPALOFT_REMOTE_RUNTIME_ROOT ?? "/var/lib/appaloft/runtime";
    const remoteRoot = `${remoteRuntimeRoot.replace(/\/+$/, "")}/ssh-deployments/${normalizedDeploymentId}`;
    runSsh(
      [
        `docker compose -p ${ash.quote(containerName)} down --remove-orphans >/dev/null 2>&1 || true`,
        `docker rm -f ${ash.quote(containerName)} >/dev/null 2>&1 || true`,
        `docker image rm -f ${ash.quote(imageName)} >/dev/null 2>&1 || true`,
        `rm -rf ${ash.quote(remoteRoot)}`,
      ].join(" && "),
    );
  }
}

function runSsh(command: string): CliResult {
  return run(
    [
      "ssh",
      "-i",
      ssh.privateKeyFile,
      "-p",
      ssh.port,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      `${ssh.username}@${ssh.host}`,
      command,
    ],
    { cwd: repositoryRoot, label: "remote cleanup" },
  );
}

function safeDockerName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

function parseJson<T>(raw: string): T {
  const [payload] = parseJsonPayloads(raw);
  if (!payload) {
    throw new SyntaxError("No JSON payload found in command output.");
  }
  return payload as T;
}

function parseJsonPayloads(raw: string): unknown[] {
  const payloads: unknown[] = [];

  for (let offset = 0; offset < raw.length; ) {
    const objectStart = raw.indexOf("{", offset);
    const arrayStart = raw.indexOf("[", offset);
    const start =
      objectStart < 0
        ? arrayStart
        : arrayStart < 0
          ? objectStart
          : Math.min(objectStart, arrayStart);

    if (start < 0) {
      return payloads;
    }

    const opening = raw[start];
    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    let escaped = false;
    let inString = false;

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
          try {
            payloads.push(JSON.parse(raw.slice(start, index + 1)));
          } catch {
            // Ignore non-JSON fragments from structured application logs.
          }
          offset = index + 1;
          break;
        }
      }
    }

    if (offset <= start) {
      return payloads;
    }
  }

  return payloads;
}

function expectSuccess(result: CliResult, label: string): void {
  if (result.exitCode === 0) {
    return;
  }
  fail(`${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function fail(message: string): never {
  console.error(`[public-launch-smoke] ${message}`);
  process.exit(1);
}

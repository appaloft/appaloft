import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
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

const enabled = process.env.APPALOFT_E2E_SSH_REMOTE_STATE === "true";
const fixtureDir = fixturePath("docker-express-hello");
const routeEnabled =
  enabled &&
  Boolean(
    process.env.APPALOFT_E2E_PUBLIC_ROUTE_HOST ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(process.env.APPALOFT_E2E_SSH_HOST ?? ""),
  );

interface SshConfig {
  host: string;
  port: string;
  privateKeyFile: string;
  username: string;
}

interface DeploymentSummary {
  id: string;
  resourceId: string;
  status: string;
}

interface ResourceSummary {
  accessSummary?: {
    latestServerAppliedDomainRoute?: {
      hostname: string;
      url: string;
    };
    proxyRouteStatus?: string;
  };
  id: string;
  name: string;
}

interface ResourceHealthSummary {
  publicAccess: {
    kind?: string;
    status: string;
    url?: string;
  };
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function publicRouteHost(host: string, suffix: string): string | undefined {
  const configured = process.env.APPALOFT_E2E_PUBLIC_ROUTE_HOST;
  if (configured) {
    return configured.replaceAll("{suffix}", suffix);
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return `appaloft-${suffix}.${host}.sslip.io`;
  }

  return undefined;
}

function sshConfig(): SshConfig {
  const host = process.env.APPALOFT_E2E_SSH_HOST;
  const privateKeyFile = expandHome(process.env.APPALOFT_E2E_SSH_PRIVATE_KEY ?? "~/.ssh/appaloft");

  if (!host) {
    throw new Error("APPALOFT_E2E_SSH_HOST is required when APPALOFT_E2E_SSH_REMOTE_STATE=true");
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

function remoteCleanup(config: SshConfig, remoteRuntimeRoot: string, deploymentId: string): void {
  const normalizedDeploymentId = deploymentId.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  const containerName = `appaloft-${normalizedDeploymentId}`;
  const imageName = `appaloft-image-${normalizedDeploymentId}`;
  const remoteRoot = `${remoteRuntimeRoot.replace(/\/+$/, "")}/ssh-deployments/${normalizedDeploymentId}`;

  runSsh(
    config,
    [
      `docker rm -f ${shellQuote(containerName)} >/dev/null 2>&1 || true`,
      `docker image rm -f ${shellQuote(imageName)} >/dev/null 2>&1 || true`,
      `rm -rf ${shellQuote(remoteRoot)}`,
    ].join(" && "),
  );
}

function createSourceWorkspace(input: { publicRouteHost?: string } = {}): string {
  const sourceRoot = mkdtempSync(join(tmpdir(), "appaloft-github-action-source-"));
  const sourceDir = join(sourceRoot, "www");
  const accessConfig = input.publicRouteHost
    ? [
        "access:",
        "  domains:",
        `    - host: ${input.publicRouteHost}`,
        "      pathPrefix: /",
        "      tlsMode: disabled",
        "",
      ]
    : [];

  cpSync(fixtureDir, sourceDir, { recursive: true });
  writeFileSync(
    join(sourceDir, "appaloft.yml"),
    [
      "runtime:",
      "  strategy: dockerfile",
      "  healthCheckPath: /health",
      "network:",
      "  internalPort: 3000",
      "  upstreamProtocol: http",
      "health:",
      "  path: /health",
      "",
      ...accessConfig,
    ].join("\n"),
  );

  return sourceRoot;
}

function githubActionEnv(input: {
  remoteRuntimeRoot: string;
  repositoryName: string;
  sourceDir: string;
  suffix: string;
}): Record<string, string> {
  return {
    APPALOFT_REMOTE_RUNTIME_ROOT: input.remoteRuntimeRoot,
    GITHUB_REPOSITORY: `appaloft/${input.repositoryName}`,
    GITHUB_REPOSITORY_ID: `appaloft-e2e-${input.suffix}`,
    GITHUB_REF: "refs/heads/main",
    GITHUB_WORKSPACE: input.sourceDir,
  };
}

function deployFromWorkspace(input: {
  config: SshConfig;
  resourceName: string;
  serverProxyKind?: "none" | "traefik";
  sourceDir: string;
  workspace: ShellE2eWorkspace;
}): string {
  const result = runShellCli(
    [
      "deploy",
      input.sourceDir,
      "--config",
      join(input.sourceDir, "appaloft.yml"),
      "--server-host",
      input.config.host,
      "--server-port",
      input.config.port,
      "--server-provider",
      "generic-ssh",
      "--server-proxy-kind",
      input.serverProxyKind ?? "none",
      "--server-ssh-username",
      input.config.username,
      "--server-ssh-private-key-file",
      resolve(input.config.privateKeyFile),
      "--state-backend",
      "ssh-pglite",
      "--resource-name",
      input.resourceName,
      "--app-log-lines",
      "8",
    ],
    input.workspace.cliOptions,
  );
  expectCliSuccess(result, "deploy from isolated GitHub Action runner workspace");

  return parseJson<{ id: string }>(result.stdout).id;
}

function verifyRemoteHttpRoute(config: SshConfig, domain: string): void {
  const script = [
    "set -eu",
    "body_file=$(mktemp)",
    "trap 'rm -f \"$body_file\"' EXIT",
    "if command -v curl >/dev/null 2>&1; then",
    [
      "code=$(curl",
      "--silent --show-error",
      "--max-time 15",
      `--header ${shellQuote(`Host: ${domain}`)}`,
      '--output "$body_file"',
      '--write-out "%{http_code}"',
      "http://127.0.0.1/health",
      ")",
    ].join(" "),
    'cat "$body_file"',
    'test "$code" = "200"',
    "else",
    [
      "wget",
      "--quiet",
      "--timeout=15",
      "--tries=1",
      `--header=${shellQuote(`Host: ${domain}`)}`,
      '--output-document="$body_file"',
      "http://127.0.0.1/health",
    ].join(" "),
    'cat "$body_file"',
    "fi",
    "grep -F 'hello from express' \"$body_file\" >/dev/null",
    `grep -F ${shellQuote(`"host":"${domain}"`)} "$body_file" >/dev/null`,
  ].join("\n");
  const result = runSsh(config, `sh -lc ${shellQuote(script)}`);

  expect(
    result.exitCode,
    `remote route verification failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  ).toBe(0);
}

describe("GitHub Action SSH remote-state workflow e2e", () => {
  if (!enabled) {
    test.skip("[CONFIG-FILE-STATE-013] opt-in SSH remote-state workflow requires APPALOFT_E2E_SSH_REMOTE_STATE=true", () => {});
    return;
  }

  let config: SshConfig | undefined;
  let firstWorkspace: ShellE2eWorkspace | undefined;
  let routeWorkspace: ShellE2eWorkspace | undefined;
  let secondWorkspace: ShellE2eWorkspace | undefined;
  let remoteRuntimeRoot = "";
  let routeRemoteRuntimeRoot = "";
  let routeResourceName = "";
  let routeSourceDir = "";
  let routeSourceRoot = "";
  let routeDomain = "";
  let resourceName = "";
  let sourceDir = "";
  let sourceRoot = "";
  const deploymentCleanups: Array<{ deploymentId: string; remoteRuntimeRoot: string }> = [];

  beforeAll(() => {
    config = sshConfig();
    const dockerVersion = runSsh(config, "docker version --format '{{.Server.Version}}'");
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const suffix = crypto.randomUUID().slice(0, 8);
    const configuredRoot = process.env.APPALOFT_E2E_REMOTE_STATE_ROOT;
    remoteRuntimeRoot = configuredRoot
      ? `${configuredRoot.replace(/\/+$/, "")}/${suffix}`
      : `/tmp/appaloft-e2e-remote-state-${suffix}`;
    routeRemoteRuntimeRoot = configuredRoot
      ? `${configuredRoot.replace(/\/+$/, "")}/${suffix}-route`
      : `/tmp/appaloft-e2e-remote-state-${suffix}-route`;
    resourceName = `gha-remote-state-${suffix}`;
    routeResourceName = `gha-route-${suffix}`;
    sourceRoot = createSourceWorkspace();
    sourceDir = join(sourceRoot, "www");
    routeDomain = publicRouteHost(config.host, suffix) ?? "";
    if (routeEnabled && routeDomain) {
      routeSourceRoot = createSourceWorkspace({ publicRouteHost: routeDomain });
      routeSourceDir = join(routeSourceRoot, "www");
    }
    const repositoryName = `www-${suffix}`;
    const baseEnv = githubActionEnv({
      remoteRuntimeRoot,
      repositoryName,
      sourceDir,
      suffix,
    });

    const cleanup = runSsh(config, `rm -rf ${shellQuote(remoteRuntimeRoot)}`);
    expect(cleanup.exitCode, cleanup.stderr).toBe(0);
    const routeCleanup = runSsh(config, `rm -rf ${shellQuote(routeRemoteRuntimeRoot)}`);
    expect(routeCleanup.exitCode, routeCleanup.stderr).toBe(0);

    firstWorkspace = createShellE2eWorkspace("appaloft-remote-state-runner-a-", {
      appVersion: "0.1.0-remote-state-e2e",
      env: {
        ...baseEnv,
        GITHUB_SHA: "1111111111111111111111111111111111111111",
      },
    });
    secondWorkspace = createShellE2eWorkspace("appaloft-remote-state-runner-b-", {
      appVersion: "0.1.0-remote-state-e2e",
      env: {
        ...baseEnv,
        GITHUB_SHA: "2222222222222222222222222222222222222222",
      },
    });
    if (routeEnabled && routeDomain) {
      routeWorkspace = createShellE2eWorkspace("appaloft-remote-state-route-runner-", {
        appVersion: "0.1.0-route-e2e",
        env: {
          ...githubActionEnv({
            remoteRuntimeRoot: routeRemoteRuntimeRoot,
            repositoryName: `www-route-${suffix}`,
            sourceDir: routeSourceDir,
            suffix: `${suffix}-route`,
          }),
          GITHUB_SHA: "3333333333333333333333333333333333333333",
        },
      });
    }
  }, 60000);

  afterAll(() => {
    if (config) {
      for (const cleanup of deploymentCleanups) {
        remoteCleanup(config, cleanup.remoteRuntimeRoot, cleanup.deploymentId);
      }
    }

    if (config && remoteRuntimeRoot) {
      runSsh(config, `rm -rf ${shellQuote(remoteRuntimeRoot)}`);
    }
    if (config && routeRemoteRuntimeRoot) {
      runSsh(config, `rm -rf ${shellQuote(routeRemoteRuntimeRoot)}`);
    }

    if (firstWorkspace) {
      cleanupWorkspace(firstWorkspace.workspaceDir);
    }

    if (secondWorkspace) {
      cleanupWorkspace(secondWorkspace.workspaceDir);
    }

    if (routeWorkspace) {
      cleanupWorkspace(routeWorkspace.workspaceDir);
    }

    if (sourceRoot) {
      rmSync(sourceRoot, { recursive: true, force: true });
    }

    if (routeSourceRoot) {
      rmSync(routeSourceRoot, { recursive: true, force: true });
    }
  }, 60000);

  test("[CONFIG-FILE-STATE-013] reuses remote SSH PGlite source link across isolated GitHub Action runner processes", () => {
    if (!config || !firstWorkspace || !secondWorkspace) {
      throw new Error("workspaces were not initialized");
    }

    const firstDeploymentId = deployFromWorkspace({
      config,
      resourceName,
      sourceDir,
      workspace: firstWorkspace,
    });
    deploymentCleanups.push({ deploymentId: firstDeploymentId, remoteRuntimeRoot });

    const secondDeploymentId = deployFromWorkspace({
      config,
      resourceName,
      sourceDir,
      workspace: secondWorkspace,
    });
    deploymentCleanups.push({ deploymentId: secondDeploymentId, remoteRuntimeRoot });

    expect(secondDeploymentId).not.toBe(firstDeploymentId);

    const resources = runShellCli(["resource", "list"], secondWorkspace.cliOptions);
    expectCliSuccess(resources, "list resources from second runner state");
    const matchingResources = parseJson<{ items: ResourceSummary[] }>(
      resources.stdout,
    ).items.filter((resource) => resource.name === resourceName);
    expect(matchingResources).toHaveLength(1);
    const resourceId = matchingResources[0]?.id;
    expect(typeof resourceId).toBe("string");
    if (!resourceId) {
      throw new Error("source-linked resource was not found");
    }

    const deployments = runShellCli(
      ["deployments", "list", "--resource", resourceId],
      secondWorkspace.cliOptions,
    );
    expectCliSuccess(deployments, "list deployments from second runner state");
    const deploymentItems = parseJson<{ items: DeploymentSummary[] }>(deployments.stdout).items;
    expect(deploymentItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstDeploymentId,
          resourceId,
          status: "succeeded",
        }),
        expect.objectContaining({
          id: secondDeploymentId,
          resourceId,
          status: "succeeded",
        }),
      ]),
    );
  }, 720000);

  const routeTest = routeEnabled ? test : test.skip;

  routeTest(
    "[CONFIG-FILE-DOMAIN-005] applies and verifies a server-applied domain route on the SSH target",
    () => {
      if (!config || !routeWorkspace || !routeSourceDir || !routeDomain) {
        throw new Error("route e2e workspace was not initialized");
      }

      const deploymentId = deployFromWorkspace({
        config,
        resourceName: routeResourceName,
        serverProxyKind: "traefik",
        sourceDir: routeSourceDir,
        workspace: routeWorkspace,
      });
      deploymentCleanups.push({ deploymentId, remoteRuntimeRoot: routeRemoteRuntimeRoot });

      const resources = runShellCli(["resource", "list"], routeWorkspace.cliOptions);
      expectCliSuccess(resources, "list resources from route runner state");
      const matchingResources = parseJson<{ items: ResourceSummary[] }>(
        resources.stdout,
      ).items.filter((resource) => resource.name === routeResourceName);
      expect(matchingResources).toHaveLength(1);
      const resource = matchingResources[0];
      const resourceId = resource?.id;
      expect(typeof resourceId).toBe("string");
      expect(resource?.accessSummary).toMatchObject({
        latestServerAppliedDomainRoute: {
          hostname: routeDomain,
          url: `http://${routeDomain}`,
        },
        proxyRouteStatus: "ready",
      });
      if (!resourceId) {
        throw new Error("route e2e resource was not found");
      }

      verifyRemoteHttpRoute(config, routeDomain);

      const health = runShellCli(["resource", "health", resourceId], routeWorkspace.cliOptions);
      expectCliSuccess(health, "read resource health with server-applied route");
      expect(parseJson<ResourceHealthSummary>(health.stdout).publicAccess).toMatchObject({
        kind: "server-applied-domain",
        status: "ready",
        url: `http://${routeDomain}`,
      });
    },
    420000,
  );
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  cleanupWorkspace,
  createShellE2eWorkspace,
  expectCliSuccess,
  fixturePath,
  parseJson,
  runShellCli,
  type ShellE2eWorkspace,
} from "./support/shell-e2e-fixture";
import {
  bootstrapSshContext,
  type QuickDeploySshContext,
  remoteCleanup,
  runSsh,
  type SshConfig,
  sshConfig,
} from "./support/ssh-e2e";

const enabled = process.env.APPALOFT_E2E_SSH_QUICK_DEPLOY === "true";
const successfulFixtureDir = fixturePath("docker-express-hello");
const failingFixtureDir = fixturePath("docker-exits-fast");
const staticFixtureDir = fixturePath("static-site");
const composeFixtureFile = join(fixturePath("docker-compose-hello"), "docker-compose.yml");
const prebuiltImage = process.env.APPALOFT_E2E_SSH_PREBUILT_IMAGE ?? "nginx:1.27-alpine";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

describe("quick deploy SSH workflow e2e", () => {
  if (!enabled) {
    test.skip("[QUICK-DEPLOY-WF-022] local explicit SSH Docker workflow requires APPALOFT_E2E_SSH_QUICK_DEPLOY=true", () => {});
    test.skip("[QUICK-DEPLOY-WF-060] local explicit SSH Docker Compose workflow requires APPALOFT_E2E_SSH_QUICK_DEPLOY=true", () => {});
    test.skip("[QUICK-DEPLOY-WF-061] local explicit SSH prebuilt image workflow requires APPALOFT_E2E_SSH_QUICK_DEPLOY=true", () => {});
    test.skip("[QUICK-DEPLOY-WF-034] local explicit SSH failure diagnostics workflow requires APPALOFT_E2E_SSH_QUICK_DEPLOY=true", () => {});
    test.skip("[QUICK-DEPLOY-WF-040] local explicit SSH static site workflow requires APPALOFT_E2E_SSH_QUICK_DEPLOY=true", () => {});
    return;
  }

  let config: SshConfig;
  let failedRuntimeContext: QuickDeploySshContext;
  let successfulRuntimeContext: QuickDeploySshContext;
  let workspace: ShellE2eWorkspace;

  beforeAll(() => {
    config = sshConfig({ enabledVariable: "APPALOFT_E2E_SSH_QUICK_DEPLOY" });
    const dockerVersion = runSsh(config, "docker version --format '{{.Server.Version}}'");
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    workspace = createShellE2eWorkspace("appaloft-quick-deploy-ssh-", {
      appVersion: "0.1.0-quick-deploy-ssh-e2e",
    });
    const suffix = crypto.randomUUID().slice(0, 8);

    successfulRuntimeContext = bootstrapSshContext({
      config,
      suffix: `${suffix}-proxy`,
      workspace,
    });
    failedRuntimeContext = bootstrapSshContext({
      config,
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

  test("[QUICK-DEPLOY-WF-060] quick deploys a Docker Compose stack to an SSH target", () => {
    let deploymentId: string | undefined;

    try {
      const deployment = runShellCli(
        [
          "deploy",
          composeFixtureFile,
          "--project",
          failedRuntimeContext.projectId,
          "--server",
          failedRuntimeContext.serverId,
          "--environment",
          failedRuntimeContext.environmentId,
          "--method",
          "docker-compose",
          "--port",
          "3000",
          "--app-log-lines",
          "8",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(deployment, "quick deploy SSH Docker Compose");
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
      expect(logs.stdout).toContain("Using SSH docker-compose-stack execution");
      expect(logs.stdout).toContain("SSH compose stack started");
      expect(logs.stdout).toContain("docker-compose.yml");
    } finally {
      if (deploymentId) {
        remoteCleanup(config, deploymentId);
      }
    }
  }, 240000);

  test("[QUICK-DEPLOY-WF-061] quick deploys a prebuilt image to an SSH Docker target", () => {
    let deploymentId: string | undefined;

    try {
      const preflightPull = runSsh(config, `docker pull ${shellQuote(prebuiltImage)}`);
      expect(preflightPull.exitCode, preflightPull.stderr).toBe(0);

      const deployment = runShellCli(
        [
          "deploy",
          `docker://${prebuiltImage}`,
          "--project",
          successfulRuntimeContext.projectId,
          "--server",
          successfulRuntimeContext.serverId,
          "--environment",
          successfulRuntimeContext.environmentId,
          "--method",
          "prebuilt-image",
          "--port",
          "80",
          "--health-path",
          "/",
          "--app-log-lines",
          "8",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(deployment, "quick deploy SSH prebuilt image");
      deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      const logs = runShellCli(["logs", deploymentId], workspace.cliOptions);
      expectCliSuccess(logs, "SSH prebuilt image logs");
      expect(logs.stdout).toContain("Using SSH docker-container execution");
      expect(logs.stdout).toContain("SSH container is reachable internally");
      expect(logs.stdout).toContain("SSH public route is reachable");

      const deploymentDetail = runShellCli(
        ["deployments", "show", deploymentId],
        workspace.cliOptions,
      );
      expectCliSuccess(deploymentDetail, "show SSH prebuilt image deployment");
      expect(
        parseJson<{
          deployment: {
            runtimePlan?: {
              buildStrategy?: string;
              execution?: { kind?: string; port?: number };
              runtimeArtifact?: { kind?: string };
              target?: { providerKey?: string };
            };
          };
          status: { current: string };
        }>(deploymentDetail.stdout),
      ).toMatchObject({
        deployment: {
          runtimePlan: {
            buildStrategy: "prebuilt-image",
            execution: {
              kind: "docker-container",
              port: 80,
            },
            runtimeArtifact: {
              kind: "prebuilt-image",
            },
            target: {
              providerKey: "generic-ssh",
            },
          },
        },
        status: {
          current: "succeeded",
        },
      });
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

import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type FrameworkDockerSmokeFixture,
  frameworkDockerSmokeFixtures,
} from "./support/framework-docker-smoke-fixtures";
import {
  cleanupWorkspace,
  createShellE2eWorkspace,
  expectCliSuccess,
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

const enabled = process.env.APPALOFT_E2E_SSH_FRAMEWORK_DOCKER === "true";
const frameworkFixturesRoot = new URL(
  "../../../../packages/adapters/filesystem/test/fixtures/frameworks",
  import.meta.url,
).pathname;

function deployArgsFor(input: {
  fixture: FrameworkDockerSmokeFixture;
  projectId: string;
  serverId: string;
  environmentId: string;
  suffix: string;
}): string[] {
  const fixtureDir = join(frameworkFixturesRoot, input.fixture.fixture);
  const args = [
    "deploy",
    fixtureDir,
    "--project",
    input.projectId,
    "--server",
    input.serverId,
    "--environment",
    input.environmentId,
    "--resource-name",
    `${input.fixture.fixture}-ssh-${input.suffix}`,
    "--method",
    input.fixture.method,
    "--port",
    String(input.fixture.port),
    "--health-path",
    input.fixture.healthPath,
    "--app-log-lines",
    "8",
  ];

  if (input.fixture.install) {
    args.push("--install", input.fixture.install);
  }
  if (input.fixture.build) {
    args.push("--build", input.fixture.build);
  }
  if (input.fixture.start) {
    args.push("--start", input.fixture.start);
  }

  return args;
}

describe("quick deploy framework fixture SSH workflow e2e", () => {
  if (!enabled) {
    test.skip("[WF-PLAN-SMOKE-006] local explicit generic-SSH framework fixture smoke requires APPALOFT_E2E_SSH_FRAMEWORK_DOCKER=true", () => {});
    return;
  }

  let config: SshConfig;
  let runtimeContext: QuickDeploySshContext;
  let workspace: ShellE2eWorkspace;

  beforeAll(() => {
    config = sshConfig({ enabledVariable: "APPALOFT_E2E_SSH_FRAMEWORK_DOCKER" });
    const dockerVersion = runSsh(config, "docker version --format '{{.Server.Version}}'");
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    workspace = createShellE2eWorkspace("appaloft-framework-ssh-", {
      appVersion: "0.1.0-framework-fixture-ssh-e2e",
    });
    runtimeContext = bootstrapSshContext({
      config,
      proxyKind: "none",
      suffix: crypto.randomUUID().slice(0, 8),
      workspace,
    });
  }, 60000);

  test("[WF-PLAN-SMOKE-006][QUICK-DEPLOY-ENTRY-015] real generic-SSH builds, runs, and verifies framework fixtures", async () => {
    const fixtureFilter = Bun.env.APPALOFT_E2E_FRAMEWORK_FIXTURE;
    const fixtures = fixtureFilter
      ? frameworkDockerSmokeFixtures.filter((fixture) => fixture.fixture === fixtureFilter)
      : frameworkDockerSmokeFixtures;
    expect(
      fixtures.length,
      `unknown framework fixture filter ${fixtureFilter ?? ""}`,
    ).toBeGreaterThan(0);
    const suffix = crypto.randomUUID().slice(0, 8);
    const deploymentIds: string[] = [];

    try {
      for (const fixture of fixtures) {
        expect(existsSync(join(frameworkFixturesRoot, fixture.fixture)), fixture.fixture).toBe(
          true,
        );

        const deployment = runShellCli(
          deployArgsFor({
            fixture,
            projectId: runtimeContext.projectId,
            serverId: runtimeContext.serverId,
            environmentId: runtimeContext.environmentId,
            suffix,
          }),
          workspace.cliOptions,
        );
        expectCliSuccess(deployment, `quick deploy SSH framework fixture ${fixture.fixture}`);
        const deploymentId = parseJson<{ id: string }>(deployment.stdout).id;
        deploymentIds.push(deploymentId);

        const logs = runShellCli(["logs", deploymentId], workspace.cliOptions);
        expectCliSuccess(logs, `SSH framework logs ${fixture.fixture}`);
        expect(logs.stdout).toContain("Using SSH docker-container execution");
        expect(logs.stdout).toContain(fixture.expectedGeneratedLog);
        expect(logs.stdout).toContain("SSH container is reachable internally");

        const deploymentDetail = runShellCli(
          ["deployments", "show", deploymentId],
          workspace.cliOptions,
        );
        expectCliSuccess(deploymentDetail, `show SSH deployment ${fixture.fixture}`);
        expect(
          parseJson<{
            deployment: {
              runtimePlan?: {
                buildStrategy?: string;
                runtimeArtifact?: { metadata?: Record<string, string> };
                execution?: { kind?: string; port?: number };
                target?: { providerKey?: string };
              };
            };
            status: { current: string };
          }>(deploymentDetail.stdout),
        ).toMatchObject({
          deployment: {
            runtimePlan: {
              buildStrategy: fixture.expectedBuildStrategy,
              runtimeArtifact: {
                metadata: expect.objectContaining({
                  planner: fixture.expectedPlanner,
                }),
              },
              execution: {
                kind: "docker-container",
                port: fixture.port,
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
      }
    } finally {
      for (const deploymentId of deploymentIds) {
        remoteCleanup(config, deploymentId);
      }
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 1_800_000);
});

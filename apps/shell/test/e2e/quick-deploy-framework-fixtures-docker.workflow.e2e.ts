import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type FrameworkDockerSmokeFixture,
  frameworkDockerSmokeFixtures,
} from "./support/framework-docker-smoke-fixtures";
import {
  cleanupLocalDockerDeployment,
  cleanupWorkspace,
  createShellE2eWorkspace,
  expectCliSuccess,
  parseJson,
  runDocker,
  runShellCli,
  waitForHttpHealth,
} from "./support/shell-e2e-fixture";

const frameworkFixturesRoot = new URL(
  "../../../../packages/adapters/filesystem/test/fixtures/frameworks",
  import.meta.url,
).pathname;

function deploymentRuntimeUrl(logs: string): string {
  const parsed = parseJson<{ logs?: Array<{ message?: string }> }>(logs);
  const runtimeUrl = parsed.logs
    ?.map((entry) => entry.message ?? "")
    .map(
      (message) =>
        /Container is reachable at (http:\/\/127\.0\.0\.1:\d+\/?[^\s]*)/u.exec(message)?.[1],
    )
    .find((url): url is string => Boolean(url));

  if (!runtimeUrl) {
    throw new Error(`Could not find runtime URL in logs:\n${logs}`);
  }

  return runtimeUrl;
}

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
    `${input.fixture.fixture}-${input.suffix}`,
    "--method",
    input.fixture.method,
    "--port",
    String(input.fixture.port),
    "--health-path",
    input.fixture.healthPath,
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

describe("quick deploy framework fixture Docker workflow e2e", () => {
  if (Bun.env.APPALOFT_E2E_FRAMEWORK_DOCKER !== "true") {
    test.skip("[WF-PLAN-SMOKE-005] local explicit real Docker framework fixture smoke requires APPALOFT_E2E_FRAMEWORK_DOCKER=true", () => {});
    return;
  }

  test("[WF-PLAN-SMOKE-005][QUICK-DEPLOY-ENTRY-015] real local Docker builds, runs, and verifies representative framework fixtures", async () => {
    const fixtureFilter = Bun.env.APPALOFT_E2E_FRAMEWORK_FIXTURE;
    const fixtures = fixtureFilter
      ? frameworkDockerSmokeFixtures.filter((fixture) => fixture.fixture === fixtureFilter)
      : frameworkDockerSmokeFixtures;
    expect(
      fixtures.length,
      `unknown framework fixture filter ${fixtureFilter ?? ""}`,
    ).toBeGreaterThan(0);
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const workspace = createShellE2eWorkspace("appaloft-framework-docker-", {
      appVersion: "0.1.0-framework-fixture-docker-e2e",
    });
    const suffix = crypto.randomUUID().slice(0, 8);
    const deploymentIds: string[] = [];

    try {
      const project = runShellCli(
        ["project", "create", "--name", `Framework Docker ${suffix}`],
        workspace.cliOptions,
      );
      expectCliSuccess(project, "create project");
      const projectId = parseJson<{ id: string }>(project.stdout).id;

      const server = runShellCli(
        [
          "server",
          "register",
          "--name",
          `local-framework-${suffix}`,
          "--host",
          "127.0.0.1",
          "--provider",
          "local-shell",
          "--proxy-kind",
          "none",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(server, "register local server");
      const serverId = parseJson<{ id: string }>(server.stdout).id;

      const environment = runShellCli(
        ["env", "create", "--project", projectId, "--name", "local", "--kind", "local"],
        workspace.cliOptions,
      );
      expectCliSuccess(environment, "create environment");
      const environmentId = parseJson<{ id: string }>(environment.stdout).id;

      for (const fixture of fixtures) {
        const fixtureDir = join(frameworkFixturesRoot, fixture.fixture);
        expect(existsSync(fixtureDir), fixture.fixture).toBe(true);

        const deployment = runShellCli(
          deployArgsFor({ fixture, projectId, serverId, environmentId, suffix }),
          workspace.cliOptions,
        );
        expectCliSuccess(deployment, `quick deploy framework fixture ${fixture.fixture}`);
        const deploymentId = parseJson<{ id: string }>(deployment.stdout).id;
        deploymentIds.push(deploymentId);

        const logs = runShellCli(["logs", deploymentId], workspace.cliOptions);
        expect(logs.exitCode, logs.stderr).toBe(0);
        expect(logs.stdout).toContain("Using local docker-container execution");
        expect(logs.stdout).toContain(fixture.expectedGeneratedLog);
        expect(logs.stdout).toContain("docker build");
        expect(logs.stdout).toContain("docker run -d");
        expect(logs.stdout).toContain("Container is reachable");

        const runtimeUrl = deploymentRuntimeUrl(logs.stdout);
        await waitForHttpHealth(runtimeUrl);
        const runtimeResponse = await fetch(runtimeUrl);
        expect(runtimeResponse.ok).toBe(true);
        if (fixture.expectedRuntimeText) {
          expect(await runtimeResponse.text()).toContain(fixture.expectedRuntimeText);
        }

        const deploymentDetail = runShellCli(
          ["deployments", "show", deploymentId],
          workspace.cliOptions,
        );
        expectCliSuccess(deploymentDetail, `show deployment ${fixture.fixture}`);
        const deploymentJson = parseJson<{
          schemaVersion: string;
          deployment: {
            id: string;
            projectId: string;
            environmentId: string;
            resourceId: string;
            runtimePlan?: {
              buildStrategy?: string;
              runtimeArtifact?: {
                metadata?: Record<string, string>;
              };
              execution?: {
                kind?: string;
                port?: number;
                verificationSteps?: Array<{ kind: string; label: string }>;
              };
            };
          };
          status: { current: string };
          relatedContext?: { resource?: { id?: string; kind?: string } };
        }>(deploymentDetail.stdout);
        expect(deploymentJson).toMatchObject({
          schemaVersion: "deployments.show/v1",
          deployment: {
            id: deploymentId,
            projectId,
            environmentId,
          },
          status: {
            current: "succeeded",
          },
          relatedContext: {
            resource: {
              kind: fixture.expectedResourceKind,
            },
          },
        });
        expect(deploymentJson.deployment.runtimePlan).toMatchObject({
          buildStrategy: fixture.expectedBuildStrategy,
          runtimeArtifact: {
            metadata: expect.objectContaining({
              planner: fixture.expectedPlanner,
            }),
          },
          execution: {
            kind: "docker-container",
            port: fixture.port,
            verificationSteps: [
              {
                kind: "internal-http",
                label: "Verify internal container health",
              },
            ],
          },
        });

        const resourceId = deploymentJson.deployment.resourceId;
        const resourceDetail = runShellCli(["resource", "show", resourceId], workspace.cliOptions);
        expectCliSuccess(resourceDetail, `show resource ${fixture.fixture}`);
        expect(
          parseJson<{
            schemaVersion: string;
            resource: { id: string; kind: string };
            latestDeployment?: { id: string; status: string };
            networkProfile?: { internalPort?: number };
          }>(resourceDetail.stdout),
        ).toMatchObject({
          schemaVersion: "resources.show/v1",
          resource: {
            id: resourceId,
            kind: fixture.expectedResourceKind,
          },
          latestDeployment: {
            id: deploymentId,
            status: "succeeded",
          },
          networkProfile: {
            internalPort: fixture.port,
          },
        });

        const generatedDockerfile = join(
          workspace.dataDir,
          "runtime",
          "local-deployments",
          deploymentId,
          fixture.expectedDockerfile,
        );
        expect(existsSync(generatedDockerfile)).toBe(true);
        const dockerfileText = await Bun.file(generatedDockerfile).text();
        expect(dockerfileText).toContain("FROM ");
        if (fixture.expectedDockerfile === "Dockerfile.appaloft-static") {
          expect(dockerfileText).toContain("FROM nginx:1.27-alpine");
          expect(dockerfileText).toContain("EXPOSE 80");
        } else {
          expect(dockerfileText).toContain(`EXPOSE ${fixture.port}`);
          expect(dockerfileText).toContain("CMD ");
        }
      }
    } finally {
      for (const deploymentId of deploymentIds) {
        cleanupLocalDockerDeployment(deploymentId);
      }
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 3_600_000);
});

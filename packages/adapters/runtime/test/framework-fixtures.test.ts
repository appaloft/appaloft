import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { ExecutionContext } from "@appaloft/application";
import {
  ConfigScopeValue,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  GeneratedAt,
} from "@appaloft/core";
import { RuntimeCommandBuilder, renderRuntimeCommandString } from "../src/runtime-commands";
import { pinnedBunAlpineImage } from "../src/workspace-planners/bun";

function createTestExecutionContext(): ExecutionContext {
  return {
    entrypoint: "system",
    requestId: "req_framework_fixture",
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  };
}

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??=
    () =>
    () => {};
}

function createEnvironmentSnapshot(snapshotId: string) {
  return EnvironmentConfigSnapshot.rehydrate({
    id: EnvironmentSnapshotId.rehydrate(snapshotId),
    environmentId: EnvironmentId.rehydrate("env_test"),
    createdAt: GeneratedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    precedence: [
      ConfigScopeValue.rehydrate("defaults"),
      ConfigScopeValue.rehydrate("system"),
      ConfigScopeValue.rehydrate("organization"),
      ConfigScopeValue.rehydrate("project"),
      ConfigScopeValue.rehydrate("environment"),
      ConfigScopeValue.rehydrate("deployment"),
    ],
    variables: [],
  });
}

const fixturesRoot = join(import.meta.dir, "../../filesystem/test/fixtures/frameworks");

interface PlannerFixtureExpectation {
  matrixIds: string;
  fixture: string;
  port: number;
  buildStrategy: "static-artifact" | "workspace-commands";
  planner: string;
  runtimeKind: string;
  applicationShape: string;
  framework?: string;
  packageManager?: string;
  baseImage?: string;
  publishDirectory?: string;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
}

const plannerFixtures: PlannerFixtureExpectation[] = [
  {
    matrixIds: "WF-PLAN-CAT-001",
    fixture: "next-ssr",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "nextjs",
    runtimeKind: "nextjs",
    applicationShape: "ssr",
    framework: "nextjs",
    packageManager: "pnpm",
    baseImage: "node:22-alpine",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
  },
  {
    matrixIds: "WF-PLAN-CAT-002",
    fixture: "next-static-export",
    port: 80,
    buildStrategy: "static-artifact",
    planner: "nextjs-static",
    runtimeKind: "static",
    applicationShape: "static",
    framework: "nextjs",
    packageManager: "pnpm",
    baseImage: "node:22-alpine",
    publishDirectory: "/out",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "vite-spa",
    port: 80,
    buildStrategy: "static-artifact",
    planner: "vite-static",
    runtimeKind: "static",
    applicationShape: "static",
    framework: "vite",
    packageManager: "bun",
    baseImage: pinnedBunAlpineImage,
    publishDirectory: "/dist",
    installCommand: "bun install",
    buildCommand: "bun run build",
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "react-spa",
    port: 80,
    buildStrategy: "static-artifact",
    planner: "react-static",
    runtimeKind: "static",
    applicationShape: "static",
    framework: "react",
    packageManager: "npm",
    baseImage: "node:22-alpine",
    publishDirectory: "/build",
    installCommand: "npm install",
    buildCommand: "npm run build",
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "vue-spa",
    port: 80,
    buildStrategy: "static-artifact",
    planner: "vue-static",
    runtimeKind: "static",
    applicationShape: "static",
    framework: "vue",
    packageManager: "pnpm",
    baseImage: "node:22-alpine",
    publishDirectory: "/dist",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "svelte-spa",
    port: 80,
    buildStrategy: "static-artifact",
    planner: "svelte-static",
    runtimeKind: "static",
    applicationShape: "static",
    framework: "svelte",
    packageManager: "yarn",
    baseImage: "node:22-alpine",
    publishDirectory: "/public",
    installCommand: "yarn install --frozen-lockfile",
    buildCommand: "yarn build",
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "solid-spa",
    port: 80,
    buildStrategy: "static-artifact",
    planner: "solid-static",
    runtimeKind: "static",
    applicationShape: "static",
    framework: "solid",
    packageManager: "bun",
    baseImage: pinnedBunAlpineImage,
    publishDirectory: "/dist",
    installCommand: "bun install",
    buildCommand: "bun run build",
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "angular-spa",
    port: 80,
    buildStrategy: "static-artifact",
    planner: "angular-static",
    runtimeKind: "static",
    applicationShape: "static",
    framework: "angular",
    packageManager: "npm",
    baseImage: "node:22-alpine",
    publishDirectory: "/dist/angular-spa",
    installCommand: "npm install",
    buildCommand: "npm run build",
  },
  {
    matrixIds: "WF-PLAN-CAT-005",
    fixture: "sveltekit-static",
    port: 80,
    buildStrategy: "static-artifact",
    planner: "sveltekit-static",
    runtimeKind: "static",
    applicationShape: "static",
    framework: "sveltekit",
    packageManager: "pnpm",
    baseImage: "node:22-alpine",
    publishDirectory: "/build",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
  },
  {
    matrixIds: "WF-PLAN-CAT-004",
    fixture: "nuxt-generate",
    port: 80,
    buildStrategy: "static-artifact",
    planner: "nuxt-static",
    runtimeKind: "static",
    applicationShape: "static",
    framework: "nuxt",
    packageManager: "pnpm",
    baseImage: "node:22-alpine",
    publishDirectory: "/.output/public",
    installCommand: "pnpm install",
    buildCommand: "pnpm generate",
  },
  {
    matrixIds: "WF-PLAN-CAT-006",
    fixture: "astro-static",
    port: 80,
    buildStrategy: "static-artifact",
    planner: "astro-static",
    runtimeKind: "static",
    applicationShape: "static",
    framework: "astro",
    packageManager: "npm",
    baseImage: "node:22-alpine",
    publishDirectory: "/dist",
    installCommand: "npm install",
    buildCommand: "npm run build",
  },
  {
    matrixIds: "WF-PLAN-CAT-003",
    fixture: "remix-ssr",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "remix",
    runtimeKind: "remix",
    applicationShape: "ssr",
    framework: "remix",
    packageManager: "npm",
    baseImage: "node:22-alpine",
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm run start",
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "express-server",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "node",
    runtimeKind: "node",
    applicationShape: "serverful-http",
    framework: "express",
    packageManager: "npm",
    baseImage: "node:22-alpine",
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm run start",
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "fastify-server",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "node",
    runtimeKind: "node",
    applicationShape: "serverful-http",
    framework: "fastify",
    packageManager: "pnpm",
    baseImage: "node:22-alpine",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "nestjs-server",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "node",
    runtimeKind: "node",
    applicationShape: "serverful-http",
    framework: "nestjs",
    packageManager: "npm",
    baseImage: "node:22-alpine",
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm run start:built",
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "hono-server",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "node",
    runtimeKind: "node",
    applicationShape: "serverful-http",
    framework: "hono",
    packageManager: "bun",
    baseImage: pinnedBunAlpineImage,
    installCommand: "bun install",
    buildCommand: "bun run build",
    startCommand: "bun run start",
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "koa-server",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "node",
    runtimeKind: "node",
    applicationShape: "serverful-http",
    framework: "koa",
    packageManager: "yarn",
    baseImage: "node:22-alpine",
    installCommand: "yarn install --frozen-lockfile",
    buildCommand: "yarn build",
    startCommand: "yarn start",
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "generic-node-server",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "node",
    runtimeKind: "node",
    applicationShape: "serverful-http",
    packageManager: "npm",
    baseImage: "node:22-alpine",
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm run start:built",
  },
  {
    matrixIds: "WF-PLAN-CAT-009",
    fixture: "fastapi-uv",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "fastapi",
    runtimeKind: "fastapi",
    applicationShape: "serverful-http",
    framework: "fastapi",
    packageManager: "uv",
    baseImage: "python:3.12-slim",
    installCommand: "pip install --no-cache-dir uv && uv sync --frozen --no-dev",
    startCommand: "uv run python -m uvicorn main:app --host 0.0.0.0 --port 3000",
  },
  {
    matrixIds: "WF-PLAN-CAT-010",
    fixture: "django-pip",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "django",
    runtimeKind: "django",
    applicationShape: "serverful-http",
    framework: "django",
    packageManager: "pip",
    baseImage: "python:3.12-slim",
    installCommand: "pip install --no-cache-dir -r requirements.txt",
    startCommand: "python manage.py runserver 0.0.0.0:3000",
  },
  {
    matrixIds: "WF-PLAN-CAT-010",
    fixture: "flask-pip",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "flask",
    runtimeKind: "flask",
    applicationShape: "serverful-http",
    framework: "flask",
    packageManager: "pip",
    baseImage: "python:3.12-slim",
    installCommand: "pip install --no-cache-dir -r requirements.txt",
    startCommand: "python -m flask run --host 0.0.0.0 --port 3000",
  },
];

type ResourceRuntimeStrategy = "auto" | "static" | "workspace-commands";

interface ResourceProfileDeploySmoke {
  matrixIds: string;
  fixture: string;
  resourceProfile: {
    source: {
      kind: "local-folder";
      locator: string;
      baseDirectory: string;
    };
    runtimeProfile: {
      strategy: ResourceRuntimeStrategy;
      publishDirectory?: string;
      installCommand?: string;
      buildCommand?: string;
      startCommand?: string;
    };
    networkProfile: {
      internalPort: number;
      upstreamProtocol: "http";
      exposureMode: "reverse-proxy";
    };
  };
  expected: {
    planner: string;
    framework: string;
    buildStrategy: "static-artifact" | "workspace-commands";
    dockerfilePath: "Dockerfile.appaloft" | "Dockerfile.appaloft-static";
    artifactSource: "static-site" | "workspace-commands";
  };
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function localFixtureProfile(input: {
  fixture: string;
  strategy?: ResourceRuntimeStrategy;
  internalPort: number;
}): ResourceProfileDeploySmoke["resourceProfile"] {
  return {
    source: {
      kind: "local-folder",
      locator: join(fixturesRoot, input.fixture),
      baseDirectory: ".",
    },
    runtimeProfile: {
      strategy: input.strategy ?? "auto",
    },
    networkProfile: {
      internalPort: input.internalPort,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    },
  };
}

const resourceProfileDeploySmokes: ResourceProfileDeploySmoke[] = [
  {
    matrixIds: "WF-PLAN-SMOKE-001,QUICK-DEPLOY-ENTRY-015",
    fixture: "vite-spa",
    resourceProfile: localFixtureProfile({ fixture: "vite-spa", internalPort: 80 }),
    expected: {
      planner: "vite-static",
      framework: "vite",
      buildStrategy: "static-artifact",
      dockerfilePath: "Dockerfile.appaloft-static",
      artifactSource: "static-site",
    },
  },
  {
    matrixIds: "WF-PLAN-SMOKE-002,QUICK-DEPLOY-ENTRY-015",
    fixture: "fastify-server",
    resourceProfile: localFixtureProfile({ fixture: "fastify-server", internalPort: 3000 }),
    expected: {
      planner: "node",
      framework: "fastify",
      buildStrategy: "workspace-commands",
      dockerfilePath: "Dockerfile.appaloft",
      artifactSource: "workspace-commands",
    },
  },
  {
    matrixIds: "WF-PLAN-SMOKE-003,QUICK-DEPLOY-ENTRY-015",
    fixture: "fastapi-uv",
    resourceProfile: localFixtureProfile({ fixture: "fastapi-uv", internalPort: 8000 }),
    expected: {
      planner: "fastapi",
      framework: "fastapi",
      buildStrategy: "workspace-commands",
      dockerfilePath: "Dockerfile.appaloft",
      artifactSource: "workspace-commands",
    },
  },
];

describe("DefaultRuntimePlanResolver framework fixtures", () => {
  for (const fixture of plannerFixtures) {
    test(`[${fixture.matrixIds}][WF-PLAN-DET-007] plans pinned ${fixture.fixture} fixture`, async () => {
      ensureReflectMetadata();
      const [
        { FileSystemSourceDetector },
        { DefaultRuntimePlanResolver },
        { generateStaticSiteDockerBuild, generateWorkspaceDockerBuild },
      ] = await Promise.all([
        import("@appaloft/adapter-filesystem"),
        import("../src"),
        import("../src/workspace-planners"),
      ]);
      const context = createTestExecutionContext();
      const sourceResult = await new FileSystemSourceDetector().detect(
        context,
        join(fixturesRoot, fixture.fixture),
      );

      expect(sourceResult.isOk()).toBe(true);

      const result = await new DefaultRuntimePlanResolver().resolve(context, {
        id: `plan_${fixture.fixture}`,
        source: sourceResult._unsafeUnwrap().source,
        server: {
          id: `srv_${fixture.fixture}`,
          providerKey: "local-shell",
        },
        environmentSnapshot: createEnvironmentSnapshot(`snap_${fixture.fixture}`),
        detectedReasoning: [`detected ${fixture.fixture}`],
        requestedDeployment: {
          method: "auto",
          port: fixture.port,
        },
        generatedAt: "2026-01-01T00:00:00.000Z",
      });

      expect(result.isOk()).toBe(true);
      const plan = result._unsafeUnwrap();
      expect(plan.buildStrategy).toBe(fixture.buildStrategy);
      expect(plan.runtimeArtifact?.metadata).toEqual(
        expect.objectContaining({
          planner: fixture.planner,
          runtimeKind: fixture.runtimeKind,
          applicationShape: fixture.applicationShape,
          ...(fixture.framework ? { framework: fixture.framework } : {}),
          ...(fixture.packageManager ? { packageManager: fixture.packageManager } : {}),
          ...(fixture.baseImage ? { baseImage: fixture.baseImage } : {}),
          ...(fixture.publishDirectory
            ? { publishDirectory: fixture.publishDirectory }
            : {}),
        }),
      );
      expect(plan.execution.port).toBe(fixture.port);
      expect(plan.execution.installCommand).toBe(fixture.installCommand);
      expect(plan.execution.buildCommand).toBe(fixture.buildCommand);
      expect(plan.execution.startCommand).toBe(fixture.startCommand);

      if (fixture.buildStrategy === "workspace-commands" && fixture.baseImage) {
        const dockerBuild = generateWorkspaceDockerBuild({
          execution: plan.execution,
          sourceInspection: plan.source.inspection,
        });

        expect(dockerBuild?.dockerfile).toContain(`FROM ${fixture.baseImage}`);
        if (fixture.installCommand) {
          expect(dockerBuild?.dockerfile).toContain(fixture.installCommand);
        }
        if (fixture.buildCommand) {
          expect(dockerBuild?.dockerfile).toContain(fixture.buildCommand);
        }
        if (fixture.startCommand) {
          expect(dockerBuild?.dockerfile).toContain(fixture.startCommand);
        }
      }

      if (fixture.buildStrategy === "static-artifact" && fixture.baseImage) {
        const dockerBuild = generateStaticSiteDockerBuild({
          execution: plan.execution,
          sourceInspection: plan.source.inspection,
        });

        expect(dockerBuild?.dockerfile).toContain(`FROM ${fixture.baseImage} AS build`);
        expect(dockerBuild?.dockerfile).toContain("FROM nginx:1.27-alpine");
        if (fixture.publishDirectory) {
          expect(plan.execution.metadata).toEqual(
            expect.objectContaining({
              "static.publishDirectory": fixture.publishDirectory,
              "static.serverConfig": "appaloft-nginx",
              "workspace.packageCommand": "static-server",
            }),
          );
        }
        if (fixture.installCommand) {
          expect(dockerBuild?.dockerfile).toContain(fixture.installCommand);
        }
        if (fixture.buildCommand) {
          expect(dockerBuild?.dockerfile).toContain(fixture.buildCommand);
        }
      }
    });
  }

  for (const smoke of resourceProfileDeploySmokes) {
    test(`[${smoke.matrixIds}] headless deploy smoke maps ${smoke.fixture} resource profile to Docker/OCI runtime plan`, async () => {
      ensureReflectMetadata();
      const [
        { FileSystemSourceDetector },
        { DefaultRuntimePlanResolver },
        { generateStaticSiteDockerBuild, generateWorkspaceDockerBuild },
      ] = await Promise.all([
        import("@appaloft/adapter-filesystem"),
        import("../src"),
        import("../src/workspace-planners"),
      ]);
      const context = createTestExecutionContext();
      const deploymentCreateInput = {
        projectId: "proj_framework_smoke",
        environmentId: "env_framework_smoke",
        resourceId: `res_${smoke.fixture.replaceAll("-", "_")}`,
        serverId: `srv_${smoke.fixture.replaceAll("-", "_")}`,
      };
      const requestedDeployment = {
        method: smoke.resourceProfile.runtimeProfile.strategy,
        port: smoke.resourceProfile.networkProfile.internalPort,
        exposureMode: smoke.resourceProfile.networkProfile.exposureMode,
        upstreamProtocol: smoke.resourceProfile.networkProfile.upstreamProtocol,
        ...(smoke.resourceProfile.runtimeProfile.publishDirectory
          ? { publishDirectory: smoke.resourceProfile.runtimeProfile.publishDirectory }
          : {}),
        ...(smoke.resourceProfile.runtimeProfile.installCommand
          ? { installCommand: smoke.resourceProfile.runtimeProfile.installCommand }
          : {}),
        ...(smoke.resourceProfile.runtimeProfile.buildCommand
          ? { buildCommand: smoke.resourceProfile.runtimeProfile.buildCommand }
          : {}),
        ...(smoke.resourceProfile.runtimeProfile.startCommand
          ? { startCommand: smoke.resourceProfile.runtimeProfile.startCommand }
          : {}),
      };

      expect(Object.keys(deploymentCreateInput).sort()).toEqual([
        "environmentId",
        "projectId",
        "resourceId",
        "serverId",
      ]);
      expect(smoke.resourceProfile.runtimeProfile).not.toHaveProperty("framework");
      expect(smoke.resourceProfile.runtimeProfile).not.toHaveProperty("baseImage");
      expect(deploymentCreateInput).not.toHaveProperty("framework");
      expect(deploymentCreateInput).not.toHaveProperty("baseImage");
      expect(deploymentCreateInput).not.toHaveProperty("buildpack");

      const sourceResult = await new FileSystemSourceDetector().detect(
        context,
        smoke.resourceProfile.source.locator,
      );

      expect(sourceResult.isOk()).toBe(true);
      const source = sourceResult._unsafeUnwrap().source;

      const result = await new DefaultRuntimePlanResolver().resolve(context, {
        id: `plan_smoke_${smoke.fixture}`,
        source,
        server: {
          id: deploymentCreateInput.serverId,
          providerKey: "local-shell",
        },
        environmentSnapshot: createEnvironmentSnapshot(`snap_smoke_${smoke.fixture}`),
        detectedReasoning: [`quick deploy smoke detected ${smoke.fixture}`],
        requestedDeployment,
        generatedAt: "2026-01-01T00:00:00.000Z",
      });

      expect(result.isOk()).toBe(true);
      const plan = result._unsafeUnwrap();
      const imageName = `appaloft-smoke-${smoke.fixture}:latest`;
      const docker = RuntimeCommandBuilder.docker();
      const dockerBuild =
        plan.buildStrategy === "static-artifact"
          ? generateStaticSiteDockerBuild({
              execution: plan.execution,
              sourceInspection: plan.source.inspection,
            })
          : generateWorkspaceDockerBuild({
              execution: plan.execution,
              sourceInspection: plan.source.inspection,
            });

      expect(plan.buildStrategy).toBe(smoke.expected.buildStrategy);
      expect(plan.packagingMode).toBe("all-in-one-docker");
      expect(plan.runtimeArtifact).toEqual(
        expect.objectContaining({
          kind: "image",
          intent: "build-image",
          metadata: expect.objectContaining({
            planner: smoke.expected.planner,
            framework: smoke.expected.framework,
          }),
        }),
      );
      expect(plan.execution).toEqual(
        expect.objectContaining({
          kind: "docker-container",
          dockerfilePath: smoke.expected.dockerfilePath,
          port: smoke.resourceProfile.networkProfile.internalPort,
          metadata: expect.objectContaining({
            "artifact.source": smoke.expected.artifactSource,
          }),
        }),
      );
      expect(
        plan.execution.verificationSteps.map((step) => ({ kind: step.kind, label: step.label })),
      ).toEqual([
        {
          kind: "internal-http",
          label: "Verify internal container health",
        },
      ]);
      expect(dockerBuild?.dockerfile).toContain("FROM ");

      const buildCommand = renderRuntimeCommandString(
        docker.buildImage({
          image: imageName,
          dockerfilePath: `${source.locator}/${plan.execution.dockerfilePath}`,
          contextPath: source.locator,
        }),
        { quote: shellQuote },
      );
      const runCommand = renderRuntimeCommandString(
        docker.runContainer({
          image: imageName,
          containerName: `appaloft-smoke-${smoke.fixture}`,
          publishedPorts: [
            docker.publishPort({
              containerPort: smoke.resourceProfile.networkProfile.internalPort,
              mode: "loopback-ephemeral",
            }),
          ],
        }),
        { quote: shellQuote },
      );

      expect(buildCommand).toContain("docker build");
      expect(buildCommand).toContain(`-f '${source.locator}/${smoke.expected.dockerfilePath}'`);
      expect(runCommand).toContain("docker run -d");
      expect(runCommand).toContain(
        `-p 127.0.0.1::${smoke.resourceProfile.networkProfile.internalPort}`,
      );
      expect(runCommand).toContain(`'${imageName}'`);
    });
  }

  test("[WF-PLAN-CAT-005][WF-PLAN-DET-007] rejects pinned ambiguous SvelteKit fixture", async () => {
    ensureReflectMetadata();
    const [{ FileSystemSourceDetector }, { DefaultRuntimePlanResolver }] = await Promise.all([
      import("@appaloft/adapter-filesystem"),
      import("../src"),
    ]);
    const context = createTestExecutionContext();
    const sourceResult = await new FileSystemSourceDetector().detect(
      context,
      join(fixturesRoot, "sveltekit-ambiguous"),
    );

    expect(sourceResult.isOk()).toBe(true);

    const result = await new DefaultRuntimePlanResolver().resolve(context, {
      id: "plan_sveltekit_ambiguous_fixture",
      source: sourceResult._unsafeUnwrap().source,
      server: {
        id: "srv_sveltekit_ambiguous_fixture",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_sveltekit_ambiguous_fixture"),
      detectedReasoning: ["detected sveltekit ambiguous fixture"],
      requestedDeployment: {
        method: "auto",
        port: 3000,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details).toEqual(
      expect.objectContaining({
        phase: "runtime-plan-resolution",
        framework: "sveltekit",
        applicationShape: "hybrid-static-server",
      }),
    );
  });
});

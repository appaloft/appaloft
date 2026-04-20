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
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm run start",
  },
  {
    matrixIds: "WF-PLAN-CAT-009",
    fixture: "fastapi-uv",
    port: 3000,
    buildStrategy: "workspace-commands",
    planner: "fastapi",
    runtimeKind: "fastapi",
    applicationShape: "serverful-http",
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
    installCommand: "pip install --no-cache-dir -r requirements.txt",
    startCommand: "python -m flask run --host 0.0.0.0 --port 3000",
  },
];

describe("DefaultRuntimePlanResolver framework fixtures", () => {
  for (const fixture of plannerFixtures) {
    test(`[${fixture.matrixIds}][WF-PLAN-DET-007] plans pinned ${fixture.fixture} fixture`, async () => {
      ensureReflectMetadata();
      const [{ FileSystemSourceDetector }, { DefaultRuntimePlanResolver }] = await Promise.all([
        import("@appaloft/adapter-filesystem"),
        import("../src"),
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
          ...(fixture.publishDirectory
            ? { publishDirectory: fixture.publishDirectory }
            : {}),
        }),
      );
      expect(plan.execution.port).toBe(fixture.port);
      expect(plan.execution.installCommand).toBe(fixture.installCommand);
      expect(plan.execution.buildCommand).toBe(fixture.buildCommand);
      expect(plan.execution.startCommand).toBe(fixture.startCommand);
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

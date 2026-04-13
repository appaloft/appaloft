import { describe, expect, test } from "bun:test";
import type { ExecutionContext } from "@yundu/application";
import {
  ConfigScopeValue,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  GeneratedAt,
} from "@yundu/core";

function createTestExecutionContext(): ExecutionContext {
  return {
    entrypoint: "system",
    requestId: "req_runtime_test",
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

describe("DefaultRuntimePlanResolver", () => {
  test("selects workspace commands when explicitly requested", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_1",
      source: {
        kind: "local-folder",
        locator: "/tmp/demo",
        displayName: "demo",
        metadata: {
          hasPackageJson: "false",
        },
      },
      server: {
        id: "srv_1",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_1"),
      detectedReasoning: ["detected local folder"],
      requestedDeployment: {
        method: "workspace-commands",
        buildCommand: "node build.mjs",
        startCommand: "node dist/server.js",
        port: 4310,
        healthCheckPath: "/health",
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("workspace-commands");
    expect(plan.packagingMode).toBe("host-process-runtime");
    expect(plan.execution).toEqual(
      expect.objectContaining({
        kind: "host-process",
        buildCommand: "node build.mjs",
        startCommand: "node dist/server.js",
        port: 4310,
        healthCheckPath: "/health",
      }),
    );
  });

  test("prefers dockerfile deployment when Dockerfile is present", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_2",
      source: {
        kind: "local-folder",
        locator: "/tmp/docker-app",
        displayName: "docker-app",
        metadata: {
          hasDockerfile: "true",
          dockerfilePath: "Dockerfile",
          hasPackageJson: "true",
          packageManager: "npm",
        },
      },
      server: {
        id: "srv_2",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_2"),
      detectedReasoning: ["detected dockerfile"],
      requestedDeployment: {
        method: "auto",
        port: 4311,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("dockerfile");
    expect(plan.execution).toEqual(
      expect.objectContaining({
        kind: "docker-container",
        dockerfilePath: "Dockerfile",
        port: 4311,
      }),
    );
  });

  test("adds access routes when public domains are requested", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_3",
      source: {
        kind: "docker-image",
        locator: "docker://ghcr.io/example/app:latest",
        displayName: "app",
      },
      server: {
        id: "srv_3",
        providerKey: "generic-ssh",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_3"),
      detectedReasoning: ["detected docker image"],
      requestedDeployment: {
        method: "prebuilt-image",
        port: 4312,
        domains: ["api.example.com"],
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    const [route] = plan.execution.accessRoutes;

    expect(route?.domains).toEqual(["api.example.com"]);
    expect(route?.proxyKind).toBe("traefik");
    expect(route?.pathPrefix).toBe("/");
    expect(route?.tlsMode).toBe("auto");
    expect(route?.targetPort).toBe(4312);
  });
});

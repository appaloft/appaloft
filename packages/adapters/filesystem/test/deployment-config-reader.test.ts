import { describe, expect, test } from "bun:test";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  reflectObject.metadata ??= () => () => {};
}

async function createGitWorkspace(): Promise<{
  root: string;
  source: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "appaloft-config-"));
  const source = join(root, "apps", "api");

  await Bun.$`mkdir -p ${source}`.quiet();
  await Bun.$`git init`.cwd(root).quiet();

  return { root, source };
}

describe("FileSystemDeploymentConfigReader", () => {
  test("[CONFIG-FILE-DISC-002] discovers appaloft.yml from the git root for nested sources", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemDeploymentConfigReader }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const { root, source } = await createGitWorkspace();
    await Bun.write(
      join(root, "appaloft.yml"),
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  buildCommand: bun run build",
        "  startCommand: bun run start",
        "network:",
        "  internalPort: 4310",
        "  exposureMode: direct-port",
        "  hostPort: 80",
        "retention:",
        "  runtimePrune:",
        "    retentionDays: 14",
        "    destructive: true",
        "    categories:",
        "      - stopped-containers",
        "      - preview-workspaces",
      ].join("\n"),
    );

    const result = await new FileSystemDeploymentConfigReader().read(
      createExecutionContext({ entrypoint: "cli", requestId: "req_config" }),
      {
        sourceLocator: source,
      },
    );

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    expect(snapshot?.configFilePath).toBe(await realpath(join(root, "appaloft.yml")));
    expect(snapshot?.deployment).toEqual({
      method: "workspace-commands",
      buildCommand: "bun run build",
      startCommand: "bun run start",
      port: 4310,
      exposureMode: "direct-port",
      hostPort: 80,
    });
    expect(snapshot?.retention?.runtimePrune).toEqual({
      retentionDays: 14,
      destructive: true,
      categories: ["stopped-containers", "preview-workspaces"],
      retryOnFailure: true,
      enabled: true,
    });
    expect(snapshot?.project).toBeUndefined();
    expect(snapshot?.targets).toBeUndefined();
  });

  test("[CONFIG-FILE-SERVICE-GRAPH-005] preserves service graph runtime planning details", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemDeploymentConfigReader }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const { root, source } = await createGitWorkspace();
    await Bun.write(
      join(root, "appaloft.yml"),
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  buildCommand: bun run build",
        "  startCommand: bun run start:web",
        "network:",
        "  internalPort: 3000",
        "  targetServiceName: web",
        "services:",
        "  web:",
        "    kind: web",
        "    runtime:",
        "      strategy: workspace-commands",
        "      startCommand: bun run start:web",
        "    network:",
        "      internalPort: 3000",
        "      exposureMode: reverse-proxy",
        "  worker:",
        "    kind: worker",
        "    runtime:",
        "      strategy: workspace-commands",
        "      startCommand: bun run start:worker",
        "    network:",
        "      exposureMode: none",
        "    replicas: 4",
      ].join("\n"),
    );

    const result = await new FileSystemDeploymentConfigReader().read(
      createExecutionContext({ entrypoint: "cli", requestId: "req_service_graph_config" }),
      {
        sourceLocator: source,
      },
    );

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    expect(snapshot?.services).toEqual([
      expect.objectContaining({
        name: "web",
        kind: "web",
        runtime: expect.objectContaining({
          strategy: "workspace-commands",
          startCommand: "bun run start:web",
        }),
        network: expect.objectContaining({
          internalPort: 3000,
          exposureMode: "reverse-proxy",
        }),
      }),
      expect.objectContaining({
        name: "worker",
        kind: "worker",
        runtime: expect.objectContaining({
          strategy: "workspace-commands",
          startCommand: "bun run start:worker",
        }),
        network: expect.objectContaining({
          exposureMode: "none",
        }),
        replicas: 4,
      }),
    ]);
  });

  test("[CONFIG-FILE-APPLICATION-GRAPH-003] preserves application graph entries", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemDeploymentConfigReader }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const { root, source } = await createGitWorkspace();
    await Bun.write(
      join(root, "appaloft.yml"),
      [
        "applications:",
        "  worker:",
        "    resource:",
        "      name: Acme Worker",
        "    runtime:",
        "      strategy: workspace-commands",
        "      startCommand: bun run worker",
        "    services:",
        "      worker:",
        "        kind: worker",
        "        runtime:",
        "          strategy: workspace-commands",
        "          startCommand: bun run worker",
        "        network:",
        "          exposureMode: none",
        "        replicas: 4",
        "  api:",
        "    resource:",
        "      name: Acme API",
        "      kind: application",
        "    source:",
        "      type: git",
        "      repository: https://github.com/acme/app",
        "      baseDirectory: apps/api",
        "      gitRef: main",
        "    runtime:",
        "      strategy: workspace-commands",
        "      buildCommand: bun run build:api",
        "      startCommand: bun run start:api",
        "      healthCheckPath: /ready",
        "    network:",
        "      internalPort: 3000",
        "      exposureMode: reverse-proxy",
      ].join("\n"),
    );

    const result = await new FileSystemDeploymentConfigReader().read(
      createExecutionContext({ entrypoint: "cli", requestId: "req_application_graph_config" }),
      {
        sourceLocator: source,
      },
    );

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    expect(snapshot?.applications).toEqual([
      {
        key: "api",
        resource: {
          name: "Acme API",
          kind: "application",
        },
        source: {
          type: "git",
          repository: "https://github.com/acme/app",
          baseDirectory: "apps/api",
          gitRef: "main",
        },
        deployment: {
          method: "workspace-commands",
          buildCommand: "bun run build:api",
          startCommand: "bun run start:api",
          port: 3000,
          exposureMode: "reverse-proxy",
          healthCheckPath: "/ready",
        },
      },
      {
        key: "worker",
        resource: {
          name: "Acme Worker",
          services: [
            expect.objectContaining({
              name: "worker",
              kind: "worker",
              replicas: 4,
            }),
          ],
        },
        deployment: {
          method: "workspace-commands",
          startCommand: "bun run worker",
        },
        services: [
          expect.objectContaining({
            name: "worker",
            kind: "worker",
            runtime: expect.objectContaining({
              startCommand: "bun run worker",
            }),
            network: expect.objectContaining({
              exposureMode: "none",
            }),
            replicas: 4,
          }),
        ],
      },
    ]);
  });

  test("[CONFIG-FILE-ID-002] refuses config files that contain project or target identity", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemDeploymentConfigReader }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const { root, source } = await createGitWorkspace();
    const configFilePath = join(root, "appaloft.json");
    await Bun.write(
      configFilePath,
      `${JSON.stringify({
        project: {
          name: "production",
        },
        runtime: {
          strategy: "auto",
        },
      })}\n`,
    );

    const result = await new FileSystemDeploymentConfigReader().read(
      createExecutionContext({ entrypoint: "cli", requestId: "req_config" }),
      {
        sourceLocator: source,
        configFilePath,
      },
    );

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details?.phase).toBe("config-identity");
  });
});

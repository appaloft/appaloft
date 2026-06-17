import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DestinationId,
  EnvironmentId,
  ok,
  PortNumber,
  ProjectId,
  Resource,
  ResourceExposureModeValue,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceNetworkProtocolValue,
  ResourceServiceKindValue,
  ResourceServiceName,
  RuntimePlanStrategyValue,
} from "@appaloft/core";
import { FixedClock, MemoryEnvironmentProfileDecisionStore } from "@appaloft/testkit";

import {
  type Command as AppCommand,
  type CommandBus,
  CreateResourceCommand,
  createExecutionContext,
  type DomainBindingReadModel,
  type EnvironmentReadModel,
  type ResourceDependencyBindingReadModel,
  type ResourceReadModel,
  type StorageVolumeReadModel,
  toRepositoryContext,
} from "../src";
import { type ResourceRepository } from "../src/ports";
import { SyncEnvironmentProfileUseCase } from "../src/use-cases";

const sourceEnvironment = {
  id: "env_prod",
  projectId: "prj_demo",
  name: "production",
  kind: "production",
  lifecycleStatus: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  maskedVariables: [],
} satisfies Awaited<ReturnType<EnvironmentReadModel["findOne"]>>;

const targetEnvironment = {
  ...sourceEnvironment,
  id: "env_staging",
  name: "staging",
  kind: "staging",
} satisfies Awaited<ReturnType<EnvironmentReadModel["findOne"]>>;

const sourceResources = [
  {
    id: "res_web",
    projectId: "prj_demo",
    environmentId: "env_prod",
    destinationId: "dst_demo",
    name: "Web",
    slug: "web",
    kind: "application",
    createdAt: "2026-01-01T00:00:01.000Z",
    services: [{ name: "web", kind: "web" }],
    deploymentCount: 1,
  },
  {
    id: "res_worker",
    projectId: "prj_demo",
    environmentId: "env_prod",
    destinationId: "dst_demo",
    name: "Worker",
    slug: "worker",
    kind: "worker",
    createdAt: "2026-01-01T00:00:02.000Z",
    services: [{ name: "worker", kind: "worker" }],
    networkProfile: {
      internalPort: 4000,
      upstreamProtocol: "http",
      exposureMode: "none",
    },
    deploymentCount: 1,
  },
] satisfies Awaited<ReturnType<ResourceReadModel["list"]>>;

const targetResources = [
  {
    id: "res_web_staging",
    projectId: "prj_demo",
    environmentId: "env_staging",
    destinationId: "dst_demo",
    name: "Web",
    slug: "web",
    kind: "application",
    createdAt: "2026-01-01T00:00:03.000Z",
    services: [{ name: "web", kind: "web" }],
    deploymentCount: 2,
  },
] satisfies Awaited<ReturnType<ResourceReadModel["list"]>>;

function specName(spec: unknown): string {
  return spec && typeof spec === "object" ? spec.constructor.name : "";
}

const environmentReadModel = {
  async count() {
    return 2;
  },
  async list() {
    return [sourceEnvironment, targetEnvironment];
  },
  async findOne(_context, spec) {
    if (specName(spec) !== "EnvironmentByIdSpec") {
      return null;
    }
    const id = (spec as unknown as { id: { value: string } }).id.value;
    return (
      [sourceEnvironment, targetEnvironment].find((environment) => environment.id === id) ?? null
    );
  },
} satisfies EnvironmentReadModel;

const resourceReadModel = {
  async count() {
    return sourceResources.length + targetResources.length;
  },
  async list(_context, input) {
    if (input?.environmentId === "env_prod") {
      return sourceResources;
    }
    if (input?.environmentId === "env_staging") {
      return targetResources;
    }
    return [];
  },
  async findOne() {
    return null;
  },
} satisfies ResourceReadModel;

const bindingReadModel = {
  async list(_context, input) {
    if (input?.resourceId !== "res_worker") {
      return ok([]);
    }
    return ok([
      {
        id: "rbind_worker_pg",
        projectId: "prj_demo",
        environmentId: "env_prod",
        resourceId: "res_worker",
        dependencyResourceId: "rsi_worker_pg",
        dependencyResourceName: "Worker DB",
        dependencyResourceSlug: "worker-db",
        kind: "postgres",
        sourceMode: "appaloft-managed",
        providerKey: "appaloft-managed-postgres",
        providerManaged: true,
        lifecycleStatus: "ready",
        target: {
          targetName: "WORKER_DATABASE_URL",
          scope: "environment",
          injectionMode: "env",
          secretRef: "secret://dependency/postgres/rsi_worker_pg",
        },
        bindingReadiness: { status: "ready" },
        snapshotReadiness: { status: "ready" },
        status: "active",
        createdAt: "2026-01-01T00:00:04.000Z",
      },
    ]);
  },
  async findOne() {
    return ok(null);
  },
} satisfies ResourceDependencyBindingReadModel;

const domainBindingReadModel = {
  async list(_context, input) {
    if (input?.resourceId !== "res_worker") {
      return [];
    }
    return [
      {
        id: "dom_worker_prod",
        projectId: "prj_demo",
        environmentId: "env_prod",
        resourceId: "res_worker",
        serverId: "srv_demo",
        destinationId: "dst_demo",
        domainName: "worker.example.com",
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "auto",
        certificatePolicy: "auto",
        status: "ready",
        verificationAttemptCount: 1,
        createdAt: "2026-01-01T00:00:05.000Z",
      },
    ];
  },
} satisfies DomainBindingReadModel;

const storageVolumeReadModel = {
  async list(_context, input) {
    if (input?.environmentId !== "env_prod") {
      return [];
    }
    return [
      {
        id: "stv_worker_cache",
        projectId: "prj_demo",
        environmentId: "env_prod",
        name: "Worker Cache",
        slug: "worker-cache",
        kind: "named-volume",
        lifecycleStatus: "active",
        attachmentCount: 1,
        attachments: [
          {
            attachmentId: "rsta_worker_cache",
            resourceId: "res_worker",
            destinationPath: "/app/cache",
            mountMode: "read-write",
            dataFormat: "filesystem",
            applicationDataLabel: "worker cache",
            attachedAt: "2026-01-01T00:00:06.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:06.000Z",
      },
    ];
  },
  async findOne() {
    return null;
  },
  async countAttachments() {
    return 1;
  },
} satisfies StorageVolumeReadModel;

function createResource(id: "res_web" | "res_worker") {
  const summary = sourceResources.find((resource) => resource.id === id);
  if (!summary) {
    throw new Error(`Missing source resource fixture ${id}`);
  }
  return Resource.create({
    id: ResourceId.rehydrate(summary.id),
    projectId: ProjectId.rehydrate(summary.projectId),
    environmentId: EnvironmentId.rehydrate(summary.environmentId),
    destinationId: DestinationId.rehydrate("dst_demo"),
    name: ResourceName.rehydrate(summary.name),
    kind: ResourceKindValue.rehydrate(summary.kind),
    services: summary.services.map((service) => ({
      name: ResourceServiceName.rehydrate(service.name),
      kind: ResourceServiceKindValue.rehydrate(service.kind),
    })),
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("workspace-commands"),
    },
    ...(summary.networkProfile
      ? {
          networkProfile: {
            internalPort: PortNumber.rehydrate(summary.networkProfile.internalPort),
            upstreamProtocol: ResourceNetworkProtocolValue.rehydrate(
              summary.networkProfile.upstreamProtocol,
            ),
            exposureMode: ResourceExposureModeValue.rehydrate(summary.networkProfile.exposureMode),
          },
        }
      : {}),
    createdAt: CreatedAt.rehydrate(summary.createdAt),
  })._unsafeUnwrap();
}

function createResourceRepository(): ResourceRepository {
  const resources = new Map([
    ["res_web", createResource("res_web")],
    ["res_worker", createResource("res_worker")],
  ]);
  return {
    async findOne(_context, spec) {
      if (specName(spec) !== "ResourceByIdSpec") {
        return null;
      }
      const id = (spec as unknown as { id: { value: string } }).id.value;
      return resources.get(id) ?? null;
    },
    async upsert() {},
  };
}

function createCommandBus(commands: AppCommand<unknown>[]): CommandBus {
  return {
    async execute<T>(_context: unknown, command: AppCommand<T>) {
      commands.push(command as AppCommand<unknown>);
      if (command instanceof CreateResourceCommand) {
        return ok({ id: "res_worker_staging" } as T);
      }
      return ok({} as T);
    },
  } as CommandBus;
}

function createUseCase(
  commands: AppCommand<unknown>[] = [],
  decisions = new MemoryEnvironmentProfileDecisionStore(),
) {
  return new SyncEnvironmentProfileUseCase(
    createCommandBus(commands),
    environmentReadModel,
    resourceReadModel,
    createResourceRepository(),
    bindingReadModel,
    new FixedClock("2026-01-01T00:00:10.000Z"),
    decisions,
    domainBindingReadModel,
    storageVolumeReadModel,
  );
}

describe("environment profile sync command", () => {
  test("[ENV-PROFILE-DUP-009] syncs selected missing resource shape without copying decisions", async () => {
    const commands: AppCommand<unknown>[] = [];
    const decisions = new MemoryEnvironmentProfileDecisionStore();
    const result = await createUseCase(commands, decisions).execute(
      createExecutionContext({ requestId: "req_env_profile_sync", entrypoint: "system" }),
      {
        environmentId: "env_prod",
        targetEnvironmentId: "env_staging",
        resourceIds: ["res_worker"],
      },
    );

    expect(result.isOk()).toBe(true);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(CreateResourceCommand);
    expect(commands[0]).toMatchObject({
      projectId: "prj_demo",
      environmentId: "env_staging",
      destinationId: "dst_demo",
      name: "Worker",
      kind: "worker",
      services: [{ name: "worker", kind: "worker" }],
      runtimeProfile: { strategy: "workspace-commands" },
      networkProfile: {
        internalPort: 4000,
        upstreamProtocol: "http",
        exposureMode: "none",
      },
    });

    const sync = result._unsafeUnwrap();
    expect(sync).toMatchObject({
      schemaVersion: "environments.sync-profile/v1",
      sourceEnvironmentId: "env_prod",
      targetEnvironmentId: "env_staging",
      syncedResources: [
        {
          sourceResourceId: "res_worker",
          targetResourceId: "res_worker_staging",
          name: "Worker",
          slug: "worker",
          action: "created",
        },
      ],
      skippedResources: [],
      generatedAt: "2026-01-01T00:00:10.000Z",
    });
    expect(sync.deferredDecisions).toEqual([
      expect.objectContaining({ kind: "dependency-binding", sourceId: "rbind_worker_pg" }),
      expect.objectContaining({ kind: "route", sourceId: "dom_worker_prod" }),
      expect.objectContaining({ kind: "storage", sourceId: "rsta_worker_cache" }),
    ]);
    expect(JSON.stringify(sync)).not.toContain("secret://dependency");

    const pending = await decisions.listPending(
      toRepositoryContext(
        createExecutionContext({ requestId: "req_env_profile_sync_read", entrypoint: "system" }),
      ),
      {
        environmentId: "env_staging",
        resourceId: "res_worker_staging",
      },
    );
    expect(pending).toEqual([
      expect.objectContaining({
        kind: "dependency-binding",
        sourceId: "rbind_worker_pg",
        sourceEnvironmentId: "env_prod",
        sourceResourceId: "res_worker",
      }),
      expect.objectContaining({
        kind: "route",
        sourceId: "dom_worker_prod",
        sourceEnvironmentId: "env_prod",
        sourceResourceId: "res_worker",
      }),
      expect.objectContaining({
        kind: "storage",
        sourceId: "rsta_worker_cache",
        sourceEnvironmentId: "env_prod",
        sourceResourceId: "res_worker",
      }),
    ]);
  });

  test("[ENV-PROFILE-DUP-009] skips existing target resources without overwriting target state", async () => {
    const commands: AppCommand<unknown>[] = [];
    const result = await createUseCase(commands).execute(
      createExecutionContext({
        requestId: "req_env_profile_sync_existing",
        entrypoint: "system",
      }),
      {
        environmentId: "env_prod",
        targetEnvironmentId: "env_staging",
        resourceIds: ["res_web"],
      },
    );

    expect(result.isOk()).toBe(true);
    expect(commands).toHaveLength(0);
    expect(result._unsafeUnwrap()).toMatchObject({
      syncedResources: [],
      skippedResources: [
        {
          sourceResourceId: "res_web",
          targetResourceId: "res_web_staging",
          name: "Web",
          slug: "web",
          reason: "target-resource-exists",
        },
      ],
      deferredDecisions: [],
      warnings: [],
    });
  });
});

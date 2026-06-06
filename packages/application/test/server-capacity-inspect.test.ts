import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetLifecycleStatusValue,
  DeploymentTargetName,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  type Result,
  TargetKindValue,
} from "@appaloft/core";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { InspectServerCapacityQuery } from "../src/operations/servers/inspect-server-capacity.query";
import {
  type RuntimeTargetCapacityInspection,
  type RuntimeTargetCapacityInspector,
  type ServerRepository,
} from "../src/ports";
import { InspectServerCapacityQueryService } from "../src/use-cases";

function unwrap<T>(result: Result<T>): T {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

function deploymentTarget(overrides: { id?: string; providerKey?: string } = {}): DeploymentTarget {
  return DeploymentTarget.rehydrate({
    id: unwrap(DeploymentTargetId.create(overrides.id ?? "srv_primary")),
    name: DeploymentTargetName.rehydrate("Primary"),
    providerKey: ProviderKey.rehydrate(overrides.providerKey ?? "generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.active(),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function capacityInspection(server: DeploymentTarget): RuntimeTargetCapacityInspection {
  const state = server.toState();

  return {
    schemaVersion: "servers.capacity.inspect/v1",
    server: {
      id: state.id.value,
      name: state.name.value,
      host: state.host.value,
      port: state.port.value,
      providerKey: state.providerKey.value,
      targetKind: state.targetKind.value,
    },
    inspectedAt: "2026-01-01T00:00:10.000Z",
    disk: [],
    inodes: [],
    docker: {
      imagesSize: 0,
      reclaimableImagesSize: 0,
      buildCacheSize: 0,
      reclaimableBuildCacheSize: 0,
      containersSize: 0,
      volumesSize: 0,
    },
    memory: {
      total: null,
      available: null,
      used: null,
      usePercent: null,
    },
    cpu: {
      logicalCores: null,
      loadAverage1m: null,
      loadAverage5m: null,
      loadAverage15m: null,
    },
    appaloftRuntime: {
      runtimeRoot: { path: "/var/lib/appaloft/runtime", size: null, detectable: false },
      stateRoot: { path: "/var/lib/appaloft/runtime/state", size: null, detectable: false },
      sourceWorkspace: {
        path: "/var/lib/appaloft/runtime/ssh-deployments",
        size: null,
        detectable: false,
      },
    },
    appaloftContainers: [],
    appaloftWorkspaces: [],
    safeReclaimableEstimate: {
      stoppedContainersSize: 0,
      danglingImagesSize: 0,
      oldBuildCacheSize: 0,
      oldPreviewWorkspaceCandidatesSize: 0,
      total: 0,
    },
    warnings: [],
    partial: false,
  };
}

class MemoryServerRepository implements ServerRepository {
  constructor(private readonly server: DeploymentTarget | null) {}

  async findOne(): Promise<DeploymentTarget | null> {
    return this.server;
  }

  async upsert(_context: RepositoryContext, _server: DeploymentTarget): Promise<void> {}
}

class StaticCapacityInspector implements RuntimeTargetCapacityInspector {
  readonly inputs: Parameters<RuntimeTargetCapacityInspector["inspect"]>[1][] = [];

  constructor(private readonly server: DeploymentTarget) {}

  async inspect(
    _context: Parameters<RuntimeTargetCapacityInspector["inspect"]>[0],
    input: Parameters<RuntimeTargetCapacityInspector["inspect"]>[1],
  ): Promise<Result<RuntimeTargetCapacityInspection>> {
    this.inputs.push(input);
    return ok(capacityInspection(this.server));
  }
}

class HangingCapacityInspector implements RuntimeTargetCapacityInspector {
  readonly inputs: Parameters<RuntimeTargetCapacityInspector["inspect"]>[1][] = [];

  async inspect(
    _context: Parameters<RuntimeTargetCapacityInspector["inspect"]>[0],
    input: Parameters<RuntimeTargetCapacityInspector["inspect"]>[1],
  ): Promise<Result<RuntimeTargetCapacityInspection>> {
    this.inputs.push(input);
    return new Promise<Result<RuntimeTargetCapacityInspection>>(() => {});
  }
}

function createService(input?: {
  boundedInspectTimeoutMs?: number;
  inspector?: RuntimeTargetCapacityInspector;
  server?: DeploymentTarget | null;
}) {
  const server = input?.server ?? deploymentTarget();
  const inspector = input?.inspector ?? new StaticCapacityInspector(server ?? deploymentTarget());
  const service = new InspectServerCapacityQueryService(
    new MemoryServerRepository(server),
    inspector,
  );

  if (input?.boundedInspectTimeoutMs) {
    (
      service as unknown as {
        boundedInspectTimeoutMs: number;
      }
    ).boundedInspectTimeoutMs = input.boundedInspectTimeoutMs;
  }

  return { inspector, server, service };
}

describe("InspectServerCapacityQueryService", () => {
  test("returns capacity inspection through the injected inspector", async () => {
    const { inspector, service } = createService();
    const query = InspectServerCapacityQuery.create({
      serverId: "srv_primary",
    })._unsafeUnwrap();

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().schemaVersion).toBe("servers.capacity.inspect/v1");
    expect((inspector as StaticCapacityInspector).inputs[0]?.server.id.value).toBe("srv_primary");
  });

  test("returns a structured timeout when target capacity inspection hangs", async () => {
    const inspector = new HangingCapacityInspector();
    const { service } = createService({
      boundedInspectTimeoutMs: 1,
      inspector,
    });
    const query = InspectServerCapacityQuery.create({
      serverId: "srv_primary",
    })._unsafeUnwrap();

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), query);

    expect(result.isErr()).toBe(true);
    expect(inspector.inputs[0]?.server.id.value).toBe("srv_primary");
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "timeout",
      details: {
        phase: "runtime-target-capacity",
        queryName: "servers.capacity.inspect",
        serverId: "srv_primary",
        step: "inspect-timeout",
        timeoutMs: 1,
      },
    });
  });
});

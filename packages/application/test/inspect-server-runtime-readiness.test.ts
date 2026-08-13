import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  type Result,
  RuntimeTargetProfile,
  TargetKindValue,
  UpdatedAt,
  UpsertServerSpec,
} from "@appaloft/core";
import { FixedClock, MemoryServerRepository } from "@appaloft/testkit";

import {
  createExecutionContext,
  InspectServerRuntimeReadinessQuery,
  InspectServerRuntimeReadinessQueryHandler,
  InspectServerRuntimeReadinessQueryService,
  type RuntimeTargetBackend,
  type RuntimeTargetBackendDescriptor,
  type RuntimeTargetBackendRegistry,
  type RuntimeTargetReadinessBackendInspection,
  type RuntimeTargetReadinessInspection,
  toRepositoryContext,
} from "../src";

function cluster(withProfile: boolean): DeploymentTarget {
  const target = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_r5a_cluster"),
    name: DeploymentTargetName.rehydrate("R5a cluster"),
    host: HostAddress.rehydrate("kubernetes.invalid"),
    port: PortNumber.rehydrate(6443),
    providerKey: ProviderKey.rehydrate("kubernetes"),
    targetKind: TargetKindValue.rehydrate("orchestrator-cluster"),
    createdAt: CreatedAt.rehydrate("2026-08-13T00:00:00.000Z"),
  })._unsafeUnwrap();
  if (withProfile) {
    target
      .configureRuntimeTargetProfile({
        profile: RuntimeTargetProfile.create({
          connectionReference: "file:///tmp/appaloft-r5a.kubeconfig",
          credentialReference: "secret://cluster/r5a",
        })._unsafeUnwrap(),
        configuredAt: UpdatedAt.rehydrate("2026-08-13T00:01:00.000Z"),
      })
      ._unsafeUnwrap();
  }
  return target;
}

class ReadyBackend {
  readonly descriptor = {
    key: "kubernetes",
    providerKey: "kubernetes",
    targetKinds: ["orchestrator-cluster"],
    capabilities: ["runtime.readiness"],
  } satisfies RuntimeTargetBackendDescriptor;
  inspections = 0;

  async inspectReadiness(): Promise<Result<RuntimeTargetReadinessBackendInspection>> {
    this.inspections += 1;
    return ok({
      checks: [
        { capability: "api-reachability", status: "ready" },
        { capability: "version", status: "ready" },
        { capability: "authorization", status: "ready" },
        { capability: "namespace-isolation", status: "ready" },
        { capability: "routing", status: "ready" },
        { capability: "storage", status: "ready" },
      ],
    });
  }

  async execute() {
    throw new Error("not used");
  }
  async cancel() {
    throw new Error("not used");
  }
  async rollback() {
    throw new Error("not used");
  }
}

async function harness(withProfile: boolean) {
  const context = createExecutionContext({ requestId: "req_r5a_readiness", entrypoint: "system" });
  const repositoryContext = toRepositoryContext(context);
  const repository = new MemoryServerRepository();
  const target = cluster(withProfile);
  await repository.upsert(repositoryContext, target, UpsertServerSpec.fromServer(target));
  const backend = new ReadyBackend();
  const registry: RuntimeTargetBackendRegistry = {
    find: () => ok(backend as unknown as RuntimeTargetBackend),
  };
  const handler = new InspectServerRuntimeReadinessQueryHandler(
    new InspectServerRuntimeReadinessQueryService(
      repository,
      registry,
      new FixedClock("2026-08-13T00:02:00.000Z"),
    ),
  );
  const query = InspectServerRuntimeReadinessQuery.create({
    serverId: "srv_r5a_cluster",
  })._unsafeUnwrap();

  return { backend, context, handler, query };
}

describe("InspectServerRuntimeReadinessQueryService", () => {
  test("[K8S-READY-002] delegates to the exact backend and returns normalized checks", async () => {
    const { backend, context, handler, query } = await harness(true);

    const result = await handler.handle(context, query);

    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "servers.runtime-readiness/v1",
      serverId: "srv_r5a_cluster",
      targetKind: "orchestrator-cluster",
      status: "ready",
      checks: [
        { capability: "api-reachability", status: "ready" },
        { capability: "version", status: "ready" },
        { capability: "authorization", status: "ready" },
        { capability: "namespace-isolation", status: "ready" },
        { capability: "routing", status: "ready" },
        { capability: "storage", status: "ready" },
      ],
      checkedAt: "2026-08-13T00:02:00.000Z",
    } satisfies RuntimeTargetReadinessInspection);
    expect(backend.inspections).toBe(1);
  });

  test("[K8S-READY-002] missing profile is blocked without probing any backend", async () => {
    const { backend, context, handler, query } = await harness(false);

    const result = await handler.handle(context, query);

    expect(result._unsafeUnwrap()).toMatchObject({
      status: "blocked",
      checks: [
        {
          capability: "api-reachability",
          status: "blocked",
          reasonCode: "runtime-target-profile-missing",
        },
      ],
    });
    expect(backend.inspections).toBe(0);
  });
});

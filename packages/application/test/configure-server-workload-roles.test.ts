import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTargetWorkloadRoles,
  HostAddress,
  PortNumber,
  ProviderKey,
  ServerByIdSpec,
  TargetKindValue,
  UpsertServerSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryServerRepository,
  NoopLogger,
} from "@appaloft/testkit";

import {
  ConfigureServerWorkloadRolesCommand,
  ConfigureServerWorkloadRolesCommandHandler,
  ConfigureServerWorkloadRolesUseCase,
  createExecutionContext,
  toRepositoryContext,
} from "../src";

function serverFixture(): DeploymentTarget {
  return DeploymentTarget.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_primary"),
    name: DeploymentTargetName.rehydrate("Primary"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    workloadRoles: DeploymentTargetWorkloadRoles.rehydrate([
      "deployment-runtime",
      "artifact-builder",
    ]),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

async function createHarness() {
  const context = createExecutionContext({ requestId: "req_roles", entrypoint: "system" });
  const repositoryContext = toRepositoryContext(context);
  const servers = new MemoryServerRepository();
  const eventBus = new CapturedEventBus();
  const server = serverFixture();
  await servers.upsert(repositoryContext, server, UpsertServerSpec.fromServer(server));
  server.pullDomainEvents();

  const handler = new ConfigureServerWorkloadRolesCommandHandler(
    new ConfigureServerWorkloadRolesUseCase(
      servers,
      new FixedClock("2026-01-01T00:00:10.000Z"),
      eventBus,
      new NoopLogger(),
    ),
  );

  return { context, eventBus, handler, repositoryContext, servers };
}

describe("ConfigureServerWorkloadRolesUseCase", () => {
  test("[SRV-ROLE-003] replaces only the complete canonical workload role set", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness();
    const command = ConfigureServerWorkloadRolesCommand.create({
      serverId: "srv_primary",
      workloadRoles: ["sandbox-worker", "deployment-runtime"],
    });

    expect(command.isOk()).toBe(true);
    const result = await handler.handle(context, command._unsafeUnwrap());
    expect(result._unsafeUnwrap()).toEqual({
      workloadRoles: ["deployment-runtime", "sandbox-worker"],
      changed: true,
    });

    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    expect(persisted?.toState().workloadRoles.toJSON()).toEqual([
      "deployment-runtime",
      "sandbox-worker",
    ]);
    expect(persisted?.toState().name.value).toBe("Primary");
    expect(eventBus.events).toHaveLength(1);
  });

  test("[SRV-ROLE-004] rejects unknown and duplicate workload roles before mutation", () => {
    const duplicate = ConfigureServerWorkloadRolesCommand.create({
      serverId: "srv_primary",
      workloadRoles: ["deployment-runtime", "deployment-runtime"],
    });
    const unknown = ConfigureServerWorkloadRolesCommand.create({
      serverId: "srv_primary",
      workloadRoles: ["unknown-role" as "deployment-runtime"],
    });

    expect(duplicate.isErr()).toBe(true);
    expect(unknown.isErr()).toBe(true);
    expect(duplicate._unsafeUnwrapErr().code).toBe("validation_error");
    expect(unknown._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[SRV-ROLE-005] reordered role replacement is idempotent", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness();
    const command = ConfigureServerWorkloadRolesCommand.create({
      serverId: "srv_primary",
      workloadRoles: ["artifact-builder", "deployment-runtime"],
    });

    const result = await handler.handle(context, command._unsafeUnwrap());
    expect(result._unsafeUnwrap()).toEqual({
      workloadRoles: ["deployment-runtime", "artifact-builder"],
      changed: false,
    });
    expect(eventBus.events).toHaveLength(0);
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    expect(persisted?.toState().workloadRoles.toJSON()).toEqual([
      "deployment-runtime",
      "artifact-builder",
    ]);
  });
});

import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
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
  ConfigureServerRuntimeTargetProfileCommand,
  ConfigureServerRuntimeTargetProfileCommandHandler,
  ConfigureServerRuntimeTargetProfileUseCase,
  createExecutionContext,
  toRepositoryContext,
} from "../src";

function target(targetKind: "single-server" | "orchestrator-cluster" = "orchestrator-cluster") {
  return DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_r5a_cluster"),
    name: DeploymentTargetName.rehydrate("R5a cluster"),
    host: HostAddress.rehydrate("kubernetes.invalid"),
    port: PortNumber.rehydrate(6443),
    providerKey: ProviderKey.rehydrate(
      targetKind === "orchestrator-cluster" ? "kubernetes" : "ssh",
    ),
    targetKind: TargetKindValue.rehydrate(targetKind),
    createdAt: CreatedAt.rehydrate("2026-08-13T00:00:00.000Z"),
  })._unsafeUnwrap();
}

async function harness(
  targetKind: "single-server" | "orchestrator-cluster" = "orchestrator-cluster",
) {
  const context = createExecutionContext({ requestId: "req_r5a_profile", entrypoint: "system" });
  const repositoryContext = toRepositoryContext(context);
  const servers = new MemoryServerRepository();
  const eventBus = new CapturedEventBus();
  const server = target(targetKind);
  await servers.upsert(repositoryContext, server, UpsertServerSpec.fromServer(server));
  server.pullDomainEvents();

  const handler = new ConfigureServerRuntimeTargetProfileCommandHandler(
    new ConfigureServerRuntimeTargetProfileUseCase(
      servers,
      new FixedClock("2026-08-13T00:01:00.000Z"),
      eventBus,
      new NoopLogger(),
    ),
  );

  return { context, eventBus, handler, repositoryContext, servers };
}

function commandInput() {
  return {
    serverId: "srv_r5a_cluster",
    connectionReference: "file:///tmp/appaloft-r5a.kubeconfig",
    credentialReference: "secret://cluster/r5a",
    placementPolicyReference: "policy://placement/default",
    routingPolicyReference: "policy://routing/gateway-api",
  };
}

describe("ConfigureServerRuntimeTargetProfileUseCase", () => {
  test("[K8S-PROFILE-001] persists the complete opaque profile and emits one redacted event", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await harness();
    const command = ConfigureServerRuntimeTargetProfileCommand.create(
      commandInput(),
    )._unsafeUnwrap();

    const result = await handler.handle(context, command);

    expect(result._unsafeUnwrap()).toEqual({
      profile: {
        schemaVersion: "runtime-target-profile/v1",
        connectionReference: "file:///tmp/appaloft-r5a.kubeconfig",
        credentialReference: "secret://cluster/r5a",
        placementPolicyReference: "policy://placement/default",
        routingPolicyReference: "policy://routing/gateway-api",
      },
      changed: true,
    });
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_r5a_cluster")),
    );
    expect(persisted?.toState().runtimeTargetProfile?.toSnapshot()).toEqual({
      schemaVersion: "runtime-target-profile/v1",
      connectionReference: "file:///tmp/appaloft-r5a.kubeconfig",
      credentialReference: "secret://cluster/r5a",
      placementPolicyReference: "policy://placement/default",
      routingPolicyReference: "policy://routing/gateway-api",
    });
    expect(eventBus.events).toEqual([
      expect.objectContaining({
        type: "deployment_target.runtime_target_profile_configured",
        payload: {
          providerKey: "kubernetes",
          targetKind: "orchestrator-cluster",
          configuredReferences: ["connection", "credential", "placement-policy", "routing-policy"],
        },
      }),
    ]);
  });

  test("[K8S-PROFILE-001] equivalent complete profile is idempotent", async () => {
    const { context, eventBus, handler } = await harness();
    const command = ConfigureServerRuntimeTargetProfileCommand.create(
      commandInput(),
    )._unsafeUnwrap();

    expect((await handler.handle(context, command))._unsafeUnwrap().changed).toBe(true);
    eventBus.events.length = 0;
    expect((await handler.handle(context, command))._unsafeUnwrap().changed).toBe(false);
    expect(eventBus.events).toEqual([]);
  });

  test("[K8S-PROFILE-001] rejects inline payloads and unsupported target kinds before mutation", async () => {
    expect(
      ConfigureServerRuntimeTargetProfileCommand.create({
        ...commandInput(),
        connectionReference: "apiVersion: v1\nclusters: []",
      }).isErr(),
    ).toBe(true);

    const { context, eventBus, handler } = await harness("single-server");
    const result = await handler.handle(
      context,
      ConfigureServerRuntimeTargetProfileCommand.create(commandInput())._unsafeUnwrap(),
    );
    expect(result.isErr()).toBe(true);
    expect(eventBus.events).toEqual([]);
  });
});

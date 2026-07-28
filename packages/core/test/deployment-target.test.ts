import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeactivatedAt,
  DeletedAt,
  DeploymentTarget,
  DeploymentTargetDisplayOrder,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTargetWorkloadRoles,
  EdgeProxyKindValue,
  EdgeProxyStatusValue,
  ErrorCodeText,
  HostAddress,
  MessageText,
  PortNumber,
  ProviderKey,
  ServerWorkloadRoleValue,
  TargetKindValue,
  UpdatedAt,
} from "../src";

function target(input?: {
  edgeProxyKind?: "none" | "traefik" | "caddy";
  edgeProxyStatus?: "pending" | "starting" | "ready" | "failed" | "disabled";
}) {
  const edgeProxyKind = input?.edgeProxyKind;
  const edgeProxyStatus = input?.edgeProxyStatus;

  return DeploymentTarget.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("demo"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("local-shell"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    ...(edgeProxyKind
      ? {
          edgeProxy: {
            kind: EdgeProxyKindValue.rehydrate(edgeProxyKind),
            status: EdgeProxyStatusValue.rehydrate(
              edgeProxyStatus ?? (edgeProxyKind === "none" ? "disabled" : "pending"),
            ),
          },
        }
      : {}),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

describe("DeploymentTarget workload roles", () => {
  test("[SRV-ROLE-DOM-001] validates and canonicalizes workload role sets", () => {
    const roles = DeploymentTargetWorkloadRoles.create([
      "sandbox-worker",
      "deployment-runtime",
    ])._unsafeUnwrap();

    expect(roles.values.map((role) => role.value)).toEqual([
      "deployment-runtime",
      "sandbox-worker",
    ]);
    expect(roles.allows(ServerWorkloadRoleValue.rehydrate("deployment-runtime"))).toBe(true);
    expect(roles.allows(ServerWorkloadRoleValue.rehydrate("artifact-builder"))).toBe(false);
    expect(DeploymentTargetWorkloadRoles.create([])._unsafeUnwrap().isUnrestricted()).toBe(true);
    expect(
      DeploymentTargetWorkloadRoles.create(["artifact-builder", "artifact-builder"]).isErr(),
    ).toBe(true);
    expect(DeploymentTargetWorkloadRoles.create(["unknown-role"]).isErr()).toBe(true);
  });

  test("[SRV-ROLE-001/005] defaults to unrestricted and treats reordered configuration as no change", () => {
    const deploymentTarget = target();
    const configuredAt = UpdatedAt.rehydrate("2026-07-28T00:00:00.000Z");

    expect(deploymentTarget.toState().workloadRoles.isUnrestricted()).toBe(true);

    expect(
      deploymentTarget
        .configureWorkloadRoles({
          workloadRoles: DeploymentTargetWorkloadRoles.create([
            "deployment-runtime",
            "sandbox-worker",
          ])._unsafeUnwrap(),
          configuredAt,
        })
        ._unsafeUnwrap().changed,
    ).toBe(true);
    deploymentTarget.pullDomainEvents();

    expect(
      deploymentTarget
        .configureWorkloadRoles({
          workloadRoles: DeploymentTargetWorkloadRoles.create([
            "sandbox-worker",
            "deployment-runtime",
          ])._unsafeUnwrap(),
          configuredAt,
        })
        ._unsafeUnwrap().changed,
    ).toBe(false);
    expect(deploymentTarget.pullDomainEvents()).toEqual([]);
  });

  test("[SRV-ROLE-DOM-002] combines lifecycle and role admission without treating role as capability", () => {
    const deploymentTarget = target();
    deploymentTarget
      .configureWorkloadRoles({
        workloadRoles: DeploymentTargetWorkloadRoles.create(["sandbox-worker"])._unsafeUnwrap(),
        configuredAt: UpdatedAt.rehydrate("2026-07-28T00:00:00.000Z"),
      })
      ._unsafeUnwrap();

    expect(
      deploymentTarget
        .ensureCanAcceptNewWork("deployments.create", {
          requiredRole: ServerWorkloadRoleValue.rehydrate("sandbox-worker"),
        })
        .isOk(),
    ).toBe(true);

    const mismatch = deploymentTarget.ensureCanAcceptNewWork("deployments.create", {
      requiredRole: ServerWorkloadRoleValue.rehydrate("deployment-runtime"),
    });
    expect(mismatch.isErr()).toBe(true);
    if (mismatch.isErr()) {
      expect(mismatch.error.code).toBe("server_workload_role_mismatch");
      expect(mismatch.error.details).toMatchObject({
        phase: "server-workload-role-guard",
        requiredRole: "deployment-runtime",
        workloadRoles: ["sandbox-worker"],
      });
    }
  });
});

describe("DeploymentTarget", () => {
  test("[DMBH-TARGET-001] answers route proxy selection without caller-owned primitive checks", () => {
    expect(target().selectEdgeProxyKindForGeneratedRoutes()).toBeUndefined();
    expect(
      target({
        edgeProxyKind: "none",
        edgeProxyStatus: "disabled",
      }).selectEdgeProxyKindForGeneratedRoutes()?.value,
    ).toBeUndefined();
    expect(
      target({
        edgeProxyKind: "traefik",
        edgeProxyStatus: "disabled",
      }).selectEdgeProxyKindForGeneratedRoutes()?.value,
    ).toBeUndefined();

    expect(
      target({
        edgeProxyKind: "traefik",
        edgeProxyStatus: "pending",
      }).selectEdgeProxyKindForGeneratedRoutes()?.value,
    ).toBe("traefik");
    expect(
      target({
        edgeProxyKind: "caddy",
        edgeProxyStatus: "failed",
      }).selectEdgeProxyKindForGeneratedRoutes()?.value,
    ).toBe("caddy");
  });

  test("[DMBH-TARGET-001] answers bootstrap provider eligibility through target behavior", () => {
    const missingProxy = target().requireEdgeProxyKindForBootstrap({
      phase: "proxy-bootstrap",
      commandName: "servers.bootstrap-proxy",
    });
    expect(missingProxy.isErr()).toBe(true);
    if (missingProxy.isErr()) {
      expect(missingProxy.error.details?.phase).toBe("proxy-bootstrap");
      expect(missingProxy.error.details?.serverId).toBe("srv_demo");
    }

    const disabledProxy = target({
      edgeProxyKind: "none",
      edgeProxyStatus: "disabled",
    }).requireEdgeProxyKindForBootstrap({
      phase: "proxy-bootstrap",
      commandName: "servers.bootstrap-proxy",
    });
    expect(disabledProxy.isErr()).toBe(true);

    const providerBacked = target({
      edgeProxyKind: "traefik",
      edgeProxyStatus: "ready",
    }).requireEdgeProxyKindForBootstrap({
      phase: "proxy-bootstrap",
      commandName: "servers.bootstrap-proxy",
    });
    expect(providerBacked.isOk()).toBe(true);
    if (providerBacked.isOk()) {
      expect(providerBacked.value.value).toBe("traefik");
    }
  });

  test("[DMBH-TARGET-001] preserves transition behavior while naming proxy intent", () => {
    const deploymentTarget = target({ edgeProxyKind: "caddy", edgeProxyStatus: "pending" });

    expect(deploymentTarget.selectEdgeProxyKindForBootstrapIntent()?.value).toBe("caddy");

    const started = deploymentTarget.beginEdgeProxyBootstrap({
      attemptedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
    });

    expect(started.isOk()).toBe(true);
    expect(deploymentTarget.toState().edgeProxy?.status.value).toBe("starting");
  });
});

describe("DeploymentTarget lifecycle", () => {
  test("[CORE-TARGET-001] registers a target and emits a redacted registration event", () => {
    const registered = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_new"),
      name: DeploymentTargetName.rehydrate("edge-1"),
      host: HostAddress.rehydrate("10.0.0.8"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      edgeProxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      createdAt: CreatedAt.rehydrate("2026-07-20T00:00:00.000Z"),
    })._unsafeUnwrap();

    expect(registered.toState().lifecycleStatus.value).toBe("active");
    expect(registered.toState().edgeProxy?.kind.value).toBe("traefik");
    expect(registered.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "deployment_target.registered",
        aggregateId: "srv_new",
        payload: expect.objectContaining({
          providerKey: "generic-ssh",
          targetKind: "single-server",
        }),
      }),
    ]);
  });

  test("[CORE-TARGET-002] deactivates before delete and blocks active delete", () => {
    const deploymentTarget = target({ edgeProxyKind: "traefik", edgeProxyStatus: "ready" });
    const deletedAt = DeletedAt.rehydrate("2026-07-20T00:20:00.000Z");

    const activeDelete = deploymentTarget.delete({ deletedAt });
    expect(activeDelete.isErr()).toBe(true);
    expect(activeDelete._unsafeUnwrapErr().details).toMatchObject({
      phase: "server-lifecycle-guard",
      lifecycleStatus: "active",
    });

    expect(
      deploymentTarget
        .deactivate({
          deactivatedAt: DeactivatedAt.rehydrate("2026-07-20T00:10:00.000Z"),
        })
        .isOk(),
    ).toBe(true);
    expect(deploymentTarget.toState().lifecycleStatus.value).toBe("inactive");

    const inactiveWork = deploymentTarget.ensureCanAcceptNewWork("servers.configure-edge-proxy");
    expect(inactiveWork.isErr()).toBe(true);

    expect(deploymentTarget.delete({ deletedAt }).isOk()).toBe(true);
    expect(deploymentTarget.toState().lifecycleStatus.value).toBe("deleted");
    expect(deploymentTarget.delete({ deletedAt })._unsafeUnwrap().changed).toBe(false);
  });

  test("[CORE-TARGET-003] renames and reorders only non-deleted targets", () => {
    const deploymentTarget = target();
    const renamedAt = UpdatedAt.rehydrate("2026-07-20T00:05:00.000Z");

    expect(
      deploymentTarget
        .rename({
          name: DeploymentTargetName.rehydrate("renamed"),
          renamedAt,
        })
        ._unsafeUnwrap().changed,
    ).toBe(true);
    expect(
      deploymentTarget
        .reorder({
          displayOrder: DeploymentTargetDisplayOrder.create(2)._unsafeUnwrap(),
          reorderedAt: renamedAt,
        })
        ._unsafeUnwrap().changed,
    ).toBe(true);

    deploymentTarget
      .deactivate({
        deactivatedAt: DeactivatedAt.rehydrate("2026-07-20T00:10:00.000Z"),
      })
      ._unsafeUnwrap();
    deploymentTarget
      .delete({
        deletedAt: DeletedAt.rehydrate("2026-07-20T00:20:00.000Z"),
      })
      ._unsafeUnwrap();

    expect(
      deploymentTarget
        .rename({
          name: DeploymentTargetName.rehydrate("again"),
          renamedAt,
        })
        .isErr(),
    ).toBe(true);
    expect(
      deploymentTarget
        .reorder({
          displayOrder: DeploymentTargetDisplayOrder.rehydrate(9),
          reorderedAt: renamedAt,
        })
        .isErr(),
    ).toBe(true);
  });

  test("[CORE-TARGET-004] configures edge proxy and completes bootstrap ready/fail paths", () => {
    const deploymentTarget = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_proxy"),
      name: DeploymentTargetName.rehydrate("proxy-host"),
      host: HostAddress.rehydrate("10.0.0.9"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("local-shell"),
      createdAt: CreatedAt.rehydrate("2026-07-20T00:00:00.000Z"),
    })._unsafeUnwrap();
    deploymentTarget.pullDomainEvents();

    const configured = deploymentTarget.configureEdgeProxy({
      kind: EdgeProxyKindValue.rehydrate("caddy"),
      configuredAt: UpdatedAt.rehydrate("2026-07-20T00:01:00.000Z"),
    });
    expect(configured.isOk()).toBe(true);
    expect(configured._unsafeUnwrap().changed).toBe(true);
    expect(deploymentTarget.toState().edgeProxy?.kind.value).toBe("caddy");

    deploymentTarget
      .beginEdgeProxyBootstrap({
        attemptedAt: UpdatedAt.rehydrate("2026-07-20T00:02:00.000Z"),
      })
      ._unsafeUnwrap();
    expect(deploymentTarget.toState().edgeProxy?.status.value).toBe("starting");

    deploymentTarget
      .markEdgeProxyReady({
        completedAt: UpdatedAt.rehydrate("2026-07-20T00:03:00.000Z"),
      })
      ._unsafeUnwrap();
    expect(deploymentTarget.toState().edgeProxy?.status.value).toBe("ready");

    const failedTarget = target({ edgeProxyKind: "traefik", edgeProxyStatus: "starting" });
    failedTarget
      .markEdgeProxyFailed({
        failedAt: UpdatedAt.rehydrate("2026-07-20T00:04:00.000Z"),
        errorCode: ErrorCodeText.rehydrate("bootstrap_failed"),
        errorMessage: MessageText.rehydrate("proxy healthcheck failed"),
      })
      ._unsafeUnwrap();
    expect(failedTarget.toState().edgeProxy?.status.value).toBe("failed");
    expect(failedTarget.toState().edgeProxy?.lastErrorCode?.value).toBe("bootstrap_failed");
  });
});

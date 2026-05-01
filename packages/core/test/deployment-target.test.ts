import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  EdgeProxyKindValue,
  EdgeProxyStatusValue,
  HostAddress,
  PortNumber,
  ProviderKey,
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

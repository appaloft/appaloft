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

import {
  parseRuntimeTargetCapacityPruneOutput,
  renderRuntimeTargetCapacityPruneScript,
  RuntimeTargetCapacityPrunerAdapter,
} from "../src/runtime-target-capacity";

function unwrap<T>(result: Result<T>): T {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

function serverState(overrides: { providerKey?: string } = {}) {
  return DeploymentTarget.rehydrate({
    id: unwrap(DeploymentTargetId.create("srv_primary")),
    name: DeploymentTargetName.rehydrate("Primary"),
    providerKey: ProviderKey.rehydrate(overrides.providerKey ?? "generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.active(),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  }).toState();
}

describe("runtime target capacity prune adapter", () => {
  test("[RT-CAP-PRUNE-004] unsupported provider returns runtime_target_unsupported without mutation", async () => {
    const adapter = new RuntimeTargetCapacityPrunerAdapter("/var/lib/appaloft/runtime");

    const result = await adapter.prune(
      {
        requestId: "req_runtime_capacity_prune_unsupported_test",
        entrypoint: "test",
      },
      {
        server: serverState({ providerKey: "unsupported-provider" }),
        before: "2026-01-01T00:05:00.000Z",
        categories: ["source-workspaces"],
        dryRun: false,
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "runtime_target_unsupported",
      details: {
        phase: "runtime-target-capacity-prune",
        serverId: "srv_primary",
        providerKey: "unsupported-provider",
        missingCapability: "runtime.capacity",
      },
    });
  });

  test("[RT-CAP-PRUNE-003] parses skip and exclusion diagnostics without counting them as pruned", () => {
    const result = parseRuntimeTargetCapacityPruneOutput({
      stdout: [
        "APPALOFT_CAPACITY_PRUNE_V1",
        "PRUNE_CANDIDATE\tstopped-containers\tctr_active\tapp_web\t2026-01-01T00:00:00.000Z\t0\tskipped\tactive-runtime",
        "PRUNE_CANDIDATE\tsource-workspaces\tdep_rollback\t/var/lib/appaloft/runtime/ssh-deployments/dep_rollback\t2026-01-01T00:00:00.000Z\t2048\tskipped\trollback-candidate",
        "PRUNE_CANDIDATE\tsource-workspaces\tstate-root\t/var/lib/appaloft/runtime/state\t\t0\texcluded\tstate-root-excluded",
        "PRUNE_CANDIDATE\tsource-workspaces\tvolumes\tdocker-volumes\t\t0\texcluded\tvolume-excluded",
        "PRUNE_CANDIDATE\tpreview-workspaces\tpreview_old\t/var/lib/appaloft/runtime/ssh-deployments/preview_old\t2026-01-01T00:00:00.000Z\t4096\tmatched\t",
        "PRUNE_CANDIDATE\tdocker-build-cache\tdocker-build-cache\tdocker-build-cache\t2026-01-01T00:00:00.000Z\t8192\tmatched\t",
        "PRUNE_CANDIDATE\tunused-images\tdocker-unused-images\tdocker-unused-images\t2026-01-01T00:00:00.000Z\t16384\tmatched\t",
      ].join("\n"),
      server: serverState(),
      before: "2026-01-01T00:05:00.000Z",
      categories: [
        "stopped-containers",
        "preview-workspaces",
        "source-workspaces",
        "docker-build-cache",
        "unused-images",
      ],
      dryRun: true,
      prunedAt: "2026-01-01T00:10:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "servers.capacity.prune/v1",
      dryRun: true,
      summary: {
        inspectedCount: 7,
        matchedCount: 3,
        prunedCount: 0,
        skippedCount: 2,
        excludedCount: 2,
      },
    });
  });

  test("[RT-CAP-PRUNE-002] destructive parse reports reclaimed bytes only for pruned candidates", () => {
    const result = parseRuntimeTargetCapacityPruneOutput({
      stdout: [
        "APPALOFT_CAPACITY_PRUNE_V1",
        "PRUNE_CANDIDATE\tsource-workspaces\tdep_old\t/var/lib/appaloft/runtime/ssh-deployments/dep_old\t2026-01-01T00:00:00.000Z\t4096\tpruned\t",
        "PRUNE_CANDIDATE\tsource-workspaces\tdep_new\t/var/lib/appaloft/runtime/ssh-deployments/dep_new\t2026-01-01T00:06:00.000Z\t8192\tskipped\tcutoff-not-reached",
      ].join("\n"),
      server: serverState(),
      before: "2026-01-01T00:05:00.000Z",
      categories: ["source-workspaces"],
      dryRun: false,
      prunedAt: "2026-01-01T00:10:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      summary: {
        matchedCount: 0,
        prunedCount: 1,
        skippedCount: 1,
        reclaimedBytes: 4096,
      },
    });
  });

  test("[RT-CAP-PRUNE-007] rendered prune script keeps Docker cache and image prune explicit and filtered", () => {
    const script = renderRuntimeTargetCapacityPruneScript({
      runtimeRoot: "/var/lib/appaloft/runtime",
      before: "2026-01-01T00:05:00.000Z",
      categories: ["docker-build-cache", "unused-images"],
      dryRun: true,
    });

    expect(script).toContain("APPALOFT_CAPACITY_PRUNE_V1");
    expect(script).toContain("docker builder prune --force --filter");
    expect(script).toContain("docker image prune --force --filter");
    expect(script).toContain("until=$APPALOFT_PRUNE_BEFORE");
    expect(script).toContain("state-root-excluded");
    expect(script).toContain("volume-excluded");
    expect(script).not.toContain("docker volume prune");
    expect(script).not.toContain("docker system prune");
    expect(script).not.toContain("docker rmi");
  });
});

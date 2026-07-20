import { describe, expect, test } from "bun:test";

import { generatedSdkOperations } from "../src/internal";

describe("generated SDK operation metadata", () => {
  test("[SBX-SDK-001] exposes the complete external sandbox capability surface", () => {
    const operations = generatedSdkOperations.filter(
      (operation) =>
        operation.operationGroup === "sandboxes" || operation.operationGroup.startsWith("sandbox-"),
    );

    expect(operations).toHaveLength(19);
    expect(
      operations.find((operation) => operation.operationKey === "sandboxes.create"),
    ).toMatchObject({
      facadePath: ["sandboxes", "create"],
      kind: "command",
      route: { method: "POST", path: "/sandboxes" },
    });
    expect(
      operations.find((operation) => operation.operationKey === "sandbox-files.read"),
    ).toMatchObject({
      facadePath: ["sandboxFiles", "read"],
      kind: "query",
      route: { method: "POST", path: "/sandboxes/{sandboxId}/files/read" },
    });
    expect(
      operations.find((operation) => operation.operationKey === "sandbox-snapshots.create"),
    ).toMatchObject({
      facadePath: ["sandboxSnapshots", "create"],
      kind: "command",
      route: { method: "POST", path: "/sandboxes/{sandboxId}/snapshots" },
    });
  });

  test("[DEP-PROOF-CONTRACT-001] exposes deployment proof metadata", () => {
    expect(
      generatedSdkOperations.find((item) => item.operationKey === "deployments.proof"),
    ).toMatchObject({
      kind: "query",
      messageName: "DeploymentProofQuery",
      route: { method: "GET", path: "/deployments/{deploymentId}/proof" },
    });
  });
  test("[RT-MON-002][RT-MON-003][TS-SDK-GEN-001] exposes runtime monitoring read operations", () => {
    expect(
      generatedSdkOperations.find(
        (operation) => operation.operationKey === "runtime-monitoring.samples.list",
      ),
    ).toMatchObject({
      operationGroup: "runtime-monitoring",
      operationMethod: "samplesList",
      kind: "query",
      route: {
        method: "GET",
        path: "/runtime-monitoring/samples",
      },
      docsHref: "/docs/observe/diagnostics/#runtime-monitoring-samples-and-rollups",
    });

    expect(
      generatedSdkOperations.find(
        (operation) => operation.operationKey === "runtime-monitoring.rollup",
      ),
    ).toMatchObject({
      operationGroup: "runtime-monitoring",
      operationMethod: "rollup",
      kind: "query",
      route: {
        method: "GET",
        path: "/runtime-monitoring/rollup",
      },
      docsHref: "/docs/observe/diagnostics/#runtime-monitoring-samples-and-rollups",
    });
  });

  test("[RES-HEALTH-HIST-003][TS-SDK-GEN-001] exposes resource health history metadata", () => {
    expect(
      generatedSdkOperations.find(
        (operation) => operation.operationKey === "resources.health-history",
      ),
    ).toMatchObject({
      operationGroup: "resources",
      operationMethod: "healthHistory",
      kind: "query",
      route: {
        method: "GET",
        path: "/resources/{resourceId}/health-history",
      },
      docsHref: "/docs/observe/logs-health/#observe-health-summary",
    });
  });

  test("[RES-PROFILE-DELETE-CHECK-001][TS-SDK-GEN-001] exposes resource delete-check metadata", () => {
    expect(
      generatedSdkOperations.find(
        (operation) => operation.operationKey === "resources.delete-check",
      ),
    ).toMatchObject({
      operationGroup: "resources",
      operationMethod: "deleteCheck",
      kind: "query",
      route: {
        method: "GET",
        path: "/resources/{resourceId}/delete-check",
      },
      docsHref: "/docs/resources/projects/#concept-resource",
    });
  });

  test("[PROJ-LIFE-RESTORE-001][TS-SDK-GEN-001] exposes project restore metadata", () => {
    expect(
      generatedSdkOperations.find((operation) => operation.operationKey === "projects.restore"),
    ).toMatchObject({
      operationGroup: "projects",
      operationMethod: "restore",
      kind: "command",
      route: {
        method: "POST",
        path: "/projects/{projectId}/restore",
      },
      docsHref: "/docs/resources/projects/#project-lifecycle",
    });
  });

  test("[PROJ-LIFE-REORDER-001][TS-SDK-GEN-001] exposes project reorder metadata", () => {
    expect(
      generatedSdkOperations.find((operation) => operation.operationKey === "projects.reorder"),
    ).toMatchObject({
      operationGroup: "projects",
      operationMethod: "reorder",
      kind: "command",
      route: {
        method: "POST",
        path: "/projects/reorder",
      },
      docsHref: "/docs/resources/projects/#project-lifecycle",
    });
  });

  test("[PROJ-LIFE-DELETE-CHECK-001][PROJ-LIFE-DELETE-001][TS-SDK-GEN-001] exposes project delete metadata", () => {
    expect(
      generatedSdkOperations.find(
        (operation) => operation.operationKey === "projects.delete-check",
      ),
    ).toMatchObject({
      operationGroup: "projects",
      operationMethod: "deleteCheck",
      kind: "query",
      route: {
        method: "GET",
        path: "/projects/{projectId}/delete-check",
      },
      docsHref: "/docs/resources/projects/#project-lifecycle",
    });

    expect(
      generatedSdkOperations.find((operation) => operation.operationKey === "projects.delete"),
    ).toMatchObject({
      operationGroup: "projects",
      operationMethod: "delete",
      kind: "command",
      route: {
        method: "DELETE",
        path: "/projects/{projectId}",
      },
      docsHref: "/docs/resources/projects/#project-lifecycle",
    });
  });

  test("[SRV-LIFE-REORDER-001][TS-SDK-GEN-001] exposes server reorder metadata", () => {
    expect(
      generatedSdkOperations.find((operation) => operation.operationKey === "servers.reorder"),
    ).toMatchObject({
      operationGroup: "servers",
      operationMethod: "reorder",
      kind: "command",
      route: {
        method: "POST",
        path: "/servers/reorder",
      },
      docsHref: "/docs/servers/register-connect/#server-deployment-target",
    });
  });

  test("[DEP-CANCEL-ENTRY-003][TS-SDK-GEN-001] exposes deployment cancel metadata", () => {
    expect(
      generatedSdkOperations.find((operation) => operation.operationKey === "deployments.cancel"),
    ).toMatchObject({
      operationGroup: "deployments",
      operationMethod: "cancel",
      kind: "command",
      route: {
        method: "POST",
        path: "/deployments/{deploymentId}/cancel",
      },
      docsHref: "/docs/deploy/recovery/#deployment-recovery-readiness",
    });
  });

  test("[DEP-ARCHIVE-ENTRY-003][DEP-PRUNE-ENTRY-003][TS-SDK-GEN-001] exposes deployment archive and prune metadata", () => {
    expect(
      generatedSdkOperations.find((operation) => operation.operationKey === "deployments.archive"),
    ).toMatchObject({
      operationGroup: "deployments",
      operationMethod: "archive",
      kind: "command",
      route: {
        method: "POST",
        path: "/deployments/{deploymentId}/archive",
      },
      docsHref: "/docs/deploy/recovery/#deployment-recovery-readiness",
    });
    expect(
      generatedSdkOperations.find((operation) => operation.operationKey === "deployments.prune"),
    ).toMatchObject({
      operationGroup: "deployments",
      operationMethod: "prune",
      kind: "command",
      route: {
        method: "POST",
        path: "/deployments/prune",
      },
      docsHref: "/docs/deploy/recovery/#deployment-recovery-readiness",
    });
  });

  test("[SRC-AUTO-PRUNE-003][TS-SDK-GEN-001] exposes source event prune metadata", () => {
    expect(
      generatedSdkOperations.find((operation) => operation.operationKey === "source-events.prune"),
    ).toMatchObject({
      operationGroup: "source-events",
      operationMethod: "prune",
      kind: "command",
      route: {
        method: "POST",
        path: "/source-events/prune",
      },
      docsHref: "/docs/deploy/sources/#source-auto-deploy-retention",
    });
  });

  test("[INTEGRATION-SOURCE-001][TS-SDK-GEN-001] exposes integration catalog metadata", () => {
    expect(
      generatedSdkOperations.find(
        (operation) => operation.operationKey === "system.integrations.list",
      ),
    ).toMatchObject({
      operationGroup: "system",
      operationMethod: "integrationsList",
      kind: "query",
      route: {
        method: "GET",
        path: "/integrations",
      },
      docsHref: "/docs/deploy/sources/#deployment-source",
    });
  });

  test("[SYSTEM-DIAG-004][TS-SDK-GEN-001] exposes system doctor operation metadata", () => {
    expect(
      generatedSdkOperations.find((operation) => operation.operationKey === "system.doctor"),
    ).toMatchObject({
      operationGroup: "system",
      operationMethod: "doctor",
      kind: "query",
      route: {
        method: "GET",
        path: "/system/doctor",
      },
      docsHref: "/docs/self-hosting/advanced/#maintenance-worker-activation",
    });
  });

  test("[STOR-CLEANUP-005][TS-SDK-GEN-001] exposes storage runtime cleanup operation metadata", () => {
    expect(
      generatedSdkOperations.find(
        (operation) => operation.operationKey === "storage-volumes.cleanup-runtime",
      ),
    ).toMatchObject({
      operationGroup: "storage-volumes",
      operationMethod: "cleanupRuntime",
      kind: "command",
      route: {
        method: "POST",
        path: "/storage-volumes/{storageVolumeId}/runtime-cleanup",
      },
      docsHref: "/docs/resources/storage-volumes/#storage-volume-lifecycle",
    });
  });
});

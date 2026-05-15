import { describe, expect, test } from "bun:test";

import { generatedSdkOperations } from "../src";

describe("generated SDK operation metadata", () => {
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
      docsHref: "/docs/self-hosting/advanced/#advanced-control-plane-modes",
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

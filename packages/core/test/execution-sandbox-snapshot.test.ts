import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  ExpiresAt,
  SandboxId,
  SandboxSnapshot,
  SandboxSnapshotId,
  UpdatedAt,
} from "../src";

describe("SandboxSnapshot", () => {
  test("[SBX-DOM-004] keeps reusable snapshot lifecycle independent from its source Sandbox", () => {
    const snapshot = SandboxSnapshot.create({
      id: SandboxSnapshotId.rehydrate("ssn_demo"),
      sourceSandboxId: SandboxId.rehydrate("sbx_demo"),
      capability: "filesystem",
      createdAt: CreatedAt.rehydrate("2026-07-20T00:10:00.000Z"),
      expiresAt: ExpiresAt.rehydrate("2026-07-27T00:10:00.000Z"),
    })._unsafeUnwrap();

    expect(snapshot.toState().status.value).toBe("requested");
    snapshot
      .startCapture({
        attemptId: "sat_snapshot_1",
        at: UpdatedAt.rehydrate("2026-07-20T00:10:01.000Z"),
      })
      ._unsafeUnwrap();
    snapshot
      .markReady({
        providerHandle: "snapshot-handle-1",
        sizeBytes: 4096,
        at: UpdatedAt.rehydrate("2026-07-20T00:10:02.000Z"),
      })
      ._unsafeUnwrap();

    expect(snapshot.canCreateSandbox()).toBe(true);
    expect(snapshot.toState().capability).toBe("filesystem");
    expect(snapshot.toState().sourceSandboxId.value).toBe("sbx_demo");
    expect(JSON.stringify(snapshot.pullDomainEvents())).not.toContain("snapshot-handle-1");
  });
});

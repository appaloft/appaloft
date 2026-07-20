import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  ExpiresAt,
  Sandbox,
  SandboxId,
  SandboxIsolationLevel,
  SandboxNetworkPolicy,
  SandboxResourceLimits,
  SandboxWorkspacePath,
  UpdatedAt,
} from "../src";

function fixture() {
  return Sandbox.create({
    id: SandboxId.rehydrate("sbx_demo"),
    source: { kind: "image", image: "python@sha256:abc123" },
    requestedIsolation: SandboxIsolationLevel.gvisor(),
    limits: SandboxResourceLimits.create({
      cpuMillis: 1_000,
      memoryBytes: 512 * 1024 * 1024,
      diskBytes: 2 * 1024 * 1024 * 1024,
      maxProcesses: 32,
    })._unsafeUnwrap(),
    networkPolicy: SandboxNetworkPolicy.defaultDeny(),
    createdAt: CreatedAt.rehydrate("2026-07-20T00:00:00.000Z"),
    expiresAt: ExpiresAt.rehydrate("2026-07-20T01:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("Execution Sandbox", () => {
  test("[SBX-DOM-001] validates identities, limits, isolation, expiry and confined paths", () => {
    expect(SandboxId.create(" ").isErr()).toBe(true);
    expect(
      SandboxResourceLimits.create({
        cpuMillis: 0,
        memoryBytes: 1,
        diskBytes: 1,
        maxProcesses: 1,
      }).isErr(),
    ).toBe(true);
    expect(SandboxIsolationLevel.microvm().satisfies(SandboxIsolationLevel.gvisor())).toBe(true);
    expect(SandboxIsolationLevel.containerTrusted().satisfies(SandboxIsolationLevel.gvisor())).toBe(
      false,
    );
    expect(SandboxWorkspacePath.create("src/index.ts")._unsafeUnwrap().value).toBe("src/index.ts");
    expect(SandboxWorkspacePath.create("../secret").isErr()).toBe(true);
    expect(SandboxWorkspacePath.create("/etc/passwd").isErr()).toBe(true);
  });

  test("[SBX-DOM-002] enforces lifecycle transitions and records safe facts", () => {
    const sandbox = fixture();
    expect(sandbox.toState().status.value).toBe("requested");

    sandbox
      .startProvisioning({
        attemptId: "sat_create_1",
        at: UpdatedAt.rehydrate("2026-07-20T00:00:01.000Z"),
      })
      ._unsafeUnwrap();
    sandbox
      .markReady({
        realizedIsolation: SandboxIsolationLevel.gvisor(),
        providerHandle: "sandbox-handle-1",
        at: UpdatedAt.rehydrate("2026-07-20T00:00:02.000Z"),
      })
      ._unsafeUnwrap();

    expect(sandbox.toState().status.value).toBe("ready");
    expect(sandbox.canUseRuntime()).toBe(true);
    sandbox.requestPause({ at: UpdatedAt.rehydrate("2026-07-20T00:00:03.000Z") })._unsafeUnwrap();
    sandbox.markPaused({ at: UpdatedAt.rehydrate("2026-07-20T00:00:04.000Z") })._unsafeUnwrap();
    expect(sandbox.toState().status.value).toBe("paused");
    expect(sandbox.canUseRuntime()).toBe(false);
    sandbox.requestResume({ at: UpdatedAt.rehydrate("2026-07-20T00:00:05.000Z") })._unsafeUnwrap();
    sandbox
      .markReady({
        realizedIsolation: SandboxIsolationLevel.gvisor(),
        providerHandle: "sandbox-handle-1",
        at: UpdatedAt.rehydrate("2026-07-20T00:00:06.000Z"),
      })
      ._unsafeUnwrap();
    sandbox
      .requestTermination({ at: UpdatedAt.rehydrate("2026-07-20T00:00:07.000Z") })
      ._unsafeUnwrap();
    sandbox.markTerminated({ at: UpdatedAt.rehydrate("2026-07-20T00:00:08.000Z") })._unsafeUnwrap();

    expect(sandbox.toState().status.value).toBe("terminated");
    expect(
      sandbox.requestPause({ at: UpdatedAt.rehydrate("2026-07-20T00:00:09.000Z") }).isErr(),
    ).toBe(true);
    expect(JSON.stringify(sandbox.pullDomainEvents())).not.toContain("sandbox-handle-1");
  });
});

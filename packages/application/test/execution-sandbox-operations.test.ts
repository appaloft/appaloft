import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import {
  createExecutionContext,
  ExecutionSandboxService,
  InMemorySandboxRepository,
  type SandboxProvider,
  SandboxProviderRegistry,
  StaticSandboxQuotaPolicy,
  StaticSandboxSnapshotLifecyclePolicy,
} from "../src";

const context = createExecutionContext({
  entrypoint: "http",
  requestId: "req_sandbox_test",
  tenant: { tenantId: "tenant_a", organizationId: "org_a" },
});

function provider(input: { isolation?: "container-trusted" | "gvisor" } = {}) {
  let provisionCalls = 0;
  let terminateCalls = 0;
  let resumeCalls = 0;
  let snapshotCaptureCalls = 0;
  const deletedSnapshotIds: string[] = [];
  let updatedNetworkMode: "deny" | "allowlist" | undefined;
  let lastProvisionSource: Parameters<SandboxProvider["provision"]>[0]["source"] | undefined;
  let lastProvisionOwner:
    | Pick<Parameters<SandboxProvider["provision"]>[0], "ownerScope" | "ownerOrganizationId">
    | undefined;
  const adapter: SandboxProvider = {
    key: "hermetic",
    capabilities: {
      isolation: input.isolation ?? "gvisor",
      pause: { mode: "compute-released", portability: "provider-local" },
      snapshot: ["filesystem"],
      snapshotRecovery: { portability: "provider-local" },
      processes: true,
      files: true,
      ports: true,
      networkPolicy: ["deny"],
      credentialBroker: false,
    },
    async provision(request) {
      provisionCalls += 1;
      lastProvisionSource = request.source;
      lastProvisionOwner = {
        ownerScope: request.ownerScope,
        ...(request.ownerOrganizationId
          ? { ownerOrganizationId: request.ownerOrganizationId }
          : {}),
      };
      return {
        providerHandle: `handle:${request.sandboxId}`,
        realizedIsolation: input.isolation ?? "gvisor",
      };
    },
    async pause(request) {
      return { providerHandle: `recovery:${request.sandboxId}` };
    },
    async resume(request) {
      resumeCalls += 1;
      return {
        providerHandle: request.providerHandle,
        realizedIsolation: input.isolation ?? "gvisor",
      };
    },
    async terminate() {
      terminateCalls += 1;
    },
    async exec() {
      return {
        mode: "foreground",
        frames: [
          { kind: "stdout", sequence: 1, data: "hello\n" },
          { kind: "exit", sequence: 2, exitCode: 0 },
        ],
      };
    },
    async listFiles() {
      return [];
    },
    async readFile() {
      return new Uint8Array([1, 2, 3]);
    },
    async writeFile(request) {
      return { path: request.path, sizeBytes: request.content.byteLength, digest: "sha256:test" };
    },
    async removeFile() {},
    async exposePort(request) {
      return {
        exposureId: "sexp_1",
        port: request.port,
        visibility: "private",
        url: "https://preview.invalid/token",
        expiresAt: "2026-07-20T01:00:00.000Z",
      };
    },
    async listPorts() {
      return [];
    },
    async revokePort() {},
    async listProcesses() {
      return [{ processId: "proc_1", status: "running" }];
    },
    async terminateProcess() {},
    async captureSnapshot(request) {
      snapshotCaptureCalls += 1;
      return {
        providerHandle: `snapshot:${request.snapshotId}`,
        sizeBytes: 3,
        portability: "provider-local",
      };
    },
    async deleteSnapshot(request) {
      deletedSnapshotIds.push(request.snapshotId);
    },
    async updateNetworkPolicy(request) {
      updatedNetworkMode = request.networkPolicy.mode;
    },
  };
  return {
    adapter,
    provisionCalls: () => provisionCalls,
    terminateCalls: () => terminateCalls,
    resumeCalls: () => resumeCalls,
    snapshotCaptureCalls: () => snapshotCaptureCalls,
    deletedSnapshotIds: () => [...deletedSnapshotIds],
    updatedNetworkMode: () => updatedNetworkMode,
    lastProvisionSource: () => lastProvisionSource,
    lastProvisionOwner: () => lastProvisionOwner,
  };
}

function service(
  adapter: SandboxProvider,
  now: () => string = () => "2026-07-20T00:00:00.000Z",
  options: {
    repository?: InMemorySandboxRepository;
    snapshotLifecyclePolicy?: StaticSandboxSnapshotLifecyclePolicy;
    idGenerator?: { next(prefix: string): string };
  } = {},
) {
  return new ExecutionSandboxService({
    repository: options.repository ?? new InMemorySandboxRepository(),
    providerRegistry: new SandboxProviderRegistry([adapter]),
    clock: { now },
    idGenerator: options.idGenerator ?? { next: (prefix) => `${prefix}_test` },
    ...(options.snapshotLifecyclePolicy
      ? { snapshotLifecyclePolicy: options.snapshotLifecyclePolicy }
      : {}),
  });
}

const createInput = {
  source: { kind: "image" as const, image: "python@sha256:abc123" },
  requestedIsolation: "gvisor" as const,
  limits: {
    cpuMillis: 1_000,
    memoryBytes: 512 * 1024 * 1024,
    diskBytes: 2 * 1024 * 1024 * 1024,
    maxProcesses: 32,
  },
  networkPolicy: { mode: "deny" as const, rules: [] },
  expiresAt: "2026-07-20T01:00:00.000Z",
};

describe("ExecutionSandboxService", () => {
  test("[SBX-CMD-001] persists accepted create before provider provisioning", async () => {
    const fake = provider();
    const app = service(fake.adapter);

    const created = await app.create(context, createInput);
    expect(created.isOk()).toBe(true);
    expect(created._unsafeUnwrap()).toMatchObject({
      sandboxId: "sbx_test",
      attemptId: "sat_test",
      status: "requested",
    });
    expect(fake.provisionCalls()).toBe(0);

    const provisioned = await app.reconcile(context, "sbx_test");
    expect(provisioned._unsafeUnwrap().status).toBe("ready");
    expect(fake.provisionCalls()).toBe(1);
    expect(fake.lastProvisionOwner()).toEqual({
      ownerScope: "tenant_a",
      ownerOrganizationId: "org_a",
    });
  });

  test("[SBX-API-003] public create closes provisioning for synchronous external callers", async () => {
    const fake = provider();
    const app = service(fake.adapter);

    const result = await app.createAndReconcile(context, createInput);
    expect(result._unsafeUnwrap()).toMatchObject({ sandboxId: "sbx_test", status: "ready" });
    expect(fake.provisionCalls()).toBe(1);
  });

  test("[SBX-CMD-002] rejects weaker provider before persistence or mutation", async () => {
    const fake = provider({ isolation: "container-trusted" });
    const app = service(fake.adapter);
    const created = await app.create(context, createInput);

    expect(created.isErr()).toBe(true);
    if (created.isErr()) expect(created.error.code).toBe("sandbox_isolation_unsupported");
    expect(fake.provisionCalls()).toBe(0);
    expect((await app.list(context, {}))._unsafeUnwrap().items).toHaveLength(0);
  });

  test("[SBX-CMD-003] terminates idempotently and blocks later runtime access", async () => {
    const fake = provider();
    const app = service(fake.adapter);
    await app.create(context, createInput);
    await app.reconcile(context, "sbx_test");

    expect((await app.exec(context, "sbx_test", { argv: ["python", "-V"] })).isOk()).toBe(true);
    expect((await app.terminate(context, "sbx_test")).isOk()).toBe(true);
    expect((await app.terminate(context, "sbx_test")).isOk()).toBe(true);
    expect((await app.exec(context, "sbx_test", { argv: ["python", "-V"] })).isErr()).toBe(true);
  });

  test("[SBX-FILE-001] writes binary content through a confined provider request", async () => {
    const fake = provider();
    const app = service(fake.adapter);
    await app.create(context, createInput);
    await app.reconcile(context, "sbx_test");

    const written = await app.writeFile(context, "sbx_test", {
      path: "data/input.bin",
      content: new Uint8Array([0, 255, 1]),
    });
    expect(written._unsafeUnwrap()).toMatchObject({ path: "data/input.bin", sizeBytes: 3 });
    expect(
      (
        await app.writeFile(context, "sbx_test", {
          path: "../host-secret",
          content: new Uint8Array([1]),
        })
      ).isErr(),
    ).toBe(true);
  });

  test("[SBX-CMD-003][HIB-SNAPSHOT-001] closes pause/resume, port and snapshot capabilities", async () => {
    const fake = provider();
    const app = service(fake.adapter);
    await app.create(context, createInput);
    await app.reconcile(context, "sbx_test");

    expect((await app.pause(context, "sbx_test"))._unsafeUnwrap().status).toBe("paused");
    expect((await app.resume(context, "sbx_test"))._unsafeUnwrap().status).toBe("ready");
    expect(
      (await app.exposePort(context, "sbx_test", { port: 3000 }))._unsafeUnwrap(),
    ).toMatchObject({ port: 3000, visibility: "private" });
    const snapshot = await app.createSnapshot(context, "sbx_test", {
      capability: "filesystem",
    });
    expect(snapshot._unsafeUnwrap()).toMatchObject({
      snapshotId: "ssn_test",
      sourceSandboxId: "sbx_test",
      status: "ready",
    });
    expect((await app.listSnapshots(context, {}))._unsafeUnwrap().items).toHaveLength(1);
    const restored = await app.createAndReconcile(context, {
      ...createInput,
      source: { kind: "snapshot", snapshotId: "ssn_test" },
    });
    expect(restored._unsafeUnwrap()).toMatchObject({ sourceKind: "snapshot", status: "ready" });
    expect(fake.lastProvisionSource()).toEqual({
      kind: "snapshot",
      providerHandle: "snapshot:ssn_test",
      portability: "provider-local",
    });
    expect((await app.deleteSnapshot(context, "ssn_test"))._unsafeUnwrap().status).toBe("deleted");
  });

  test("[SNAP-PORT-002][SNAP-PORT-003] restores a retained Snapshot only on a compatible provider family", async () => {
    const source = provider();
    const target = provider();
    const incompatible = provider();
    const sourceAdapter: SandboxProvider = {
      ...source.adapter,
      key: "source",
      capabilities: {
        ...source.adapter.capabilities,
        snapshotRecovery: {
          portability: "provider-family",
          recoveryFamily: "shared-snapshot-store",
        },
      },
      async captureSnapshot(request) {
        return {
          providerHandle: `portable:${request.snapshotId}`,
          sizeBytes: 3,
          portability: "provider-family",
          recoveryFamily: "shared-snapshot-store",
        };
      },
    };
    const targetAdapter: SandboxProvider = {
      ...target.adapter,
      key: "target",
      capabilities: {
        ...target.adapter.capabilities,
        snapshotRecovery: {
          portability: "provider-family",
          recoveryFamily: "shared-snapshot-store",
        },
      },
    };
    const incompatibleAdapter: SandboxProvider = {
      ...incompatible.adapter,
      key: "incompatible",
      capabilities: {
        ...incompatible.adapter.capabilities,
        snapshotRecovery: {
          portability: "provider-family",
          recoveryFamily: "different-store",
        },
      },
    };
    let sandboxSequence = 0;
    const app = new ExecutionSandboxService({
      repository: new InMemorySandboxRepository(),
      providerRegistry: new SandboxProviderRegistry([
        sourceAdapter,
        targetAdapter,
        incompatibleAdapter,
      ]),
      clock: { now: () => "2026-07-20T00:00:00.000Z" },
      idGenerator: {
        next(prefix) {
          if (prefix === "sbx") return `sbx_${++sandboxSequence}`;
          if (prefix === "ssn") return "ssn_portable";
          return `${prefix}_${sandboxSequence}`;
        },
      },
    });
    await app.createAndReconcile(context, {
      ...createInput,
      providerKey: "source",
    });
    await app.createSnapshot(context, "sbx_1", { capability: "filesystem" });

    const restored = await app.createAndReconcile(context, {
      ...createInput,
      source: { kind: "snapshot", snapshotId: "ssn_portable" },
      providerKey: "target",
    });
    expect(restored._unsafeUnwrap()).toMatchObject({
      sandboxId: "sbx_2",
      providerKey: "target",
      status: "ready",
    });
    expect(target.lastProvisionSource()).toEqual({
      kind: "snapshot",
      providerHandle: "portable:ssn_portable",
      portability: "provider-family",
      recoveryFamily: "shared-snapshot-store",
    });

    const rejected = await app.create(context, {
      ...createInput,
      source: { kind: "snapshot", snapshotId: "ssn_portable" },
      providerKey: "incompatible",
    });
    expect(rejected.isErr()).toBe(true);
    if (rejected.isErr()) {
      expect(rejected.error.code).toBe("sandbox_snapshot_recovery_not_portable");
    }
    expect(incompatible.provisionCalls()).toBe(0);
  });

  test("[SNAP-POL-001] cleans an observed Snapshot when provider recovery metadata contradicts its declaration", async () => {
    const fake = provider();
    fake.adapter.capabilities.snapshotRecovery = {
      portability: "provider-family",
      recoveryFamily: "shared-snapshot-store",
    };
    const app = service(fake.adapter);
    await app.createAndReconcile(context, createInput);

    const captured = await app.createSnapshot(context, "sbx_test", {
      capability: "filesystem",
    });
    expect(captured.isErr()).toBe(true);
    expect(fake.deletedSnapshotIds()).toEqual(["ssn_test"]);
    expect((await app.showSnapshot(context, "ssn_test"))._unsafeUnwrap()).toMatchObject({
      status: "failed",
    });
  });

  test("[SBX-PROC-001][SBX-NET-002] reads one process and persists an applied policy", async () => {
    const fake = provider();
    const app = service(fake.adapter);
    await app.createAndReconcile(context, createInput);

    expect((await app.showProcess(context, "sbx_test", "proc_1"))._unsafeUnwrap()).toEqual({
      processId: "proc_1",
      status: "running",
    });
    expect((await app.showProcess(context, "sbx_test", "missing")).isErr()).toBe(true);
    const updated = await app.updateNetworkPolicy(context, "sbx_test", {
      networkPolicy: { mode: "deny", rules: [] },
    });
    expect(updated._unsafeUnwrap().networkPolicy).toEqual({ mode: "deny", rules: [] });
    expect(fake.updatedNetworkMode()).toBe("deny");
  });

  test("[SBX-TEMPLATE-001] resolves a governed template without exposing host access", async () => {
    const fake = provider();
    const app = service(fake.adapter);
    const template = await app.createTemplate(context, {
      name: "Python 3.13",
      image: "python@sha256:abc123",
      minimumIsolation: "gvisor",
      limits: createInput.limits,
      networkPolicy: createInput.networkPolicy,
    });
    expect(template._unsafeUnwrap()).toMatchObject({ templateId: "stp_test", name: "Python 3.13" });

    const sandbox = await app.createAndReconcile(context, {
      ...createInput,
      source: { kind: "template", templateId: "stp_test" },
    });
    expect(sandbox._unsafeUnwrap()).toMatchObject({ sourceKind: "template", status: "ready" });
    expect(fake.lastProvisionSource()).toEqual({ kind: "image", image: "python@sha256:abc123" });
    expect((await app.listTemplates(context, {}))._unsafeUnwrap().items).toHaveLength(1);
    expect((await app.deleteTemplate(context, "stp_test")).isErr()).toBe(true);
    await app.terminate(context, "sbx_test");
    expect((await app.deleteTemplate(context, "stp_test")).isOk()).toBe(true);
  });

  test("[SBX-TTL-001] maintenance terminates provider runtime before durable expiry", async () => {
    let current = "2026-07-20T00:00:00.000Z";
    const fake = provider();
    const app = service(fake.adapter, () => current);
    await app.createAndReconcile(context, createInput);
    current = "2026-07-20T01:00:01.000Z";

    expect((await app.maintain(context))._unsafeUnwrap()).toEqual({
      expired: ["sbx_test"],
      suspended: [],
      migrated: [],
      reconciled: [],
      snapshotsCaptured: [],
      snapshotsPruned: [],
      failed: [],
    });
    expect(fake.terminateCalls()).toBe(1);
    expect((await app.show(context, "sbx_test"))._unsafeUnwrap().status).toBe("expired");
  });

  test("[SNAP-POL-002][SNAP-POL-004] maintenance schedules and rotates reusable Snapshots", async () => {
    let current = "2026-07-20T00:00:00.000Z";
    let snapshotSequence = 0;
    const fake = provider();
    const policy = new StaticSandboxSnapshotLifecyclePolicy({
      scheduledIntervalSeconds: 60,
      snapshotTtlSeconds: 3_600,
      retainCount: 1,
      beforeTermination: "disabled",
      beforeExpiry: "disabled",
    });
    const app = service(fake.adapter, () => current, {
      snapshotLifecyclePolicy: policy,
      idGenerator: {
        next(prefix) {
          return prefix === "ssn" ? `ssn_${++snapshotSequence}` : `${prefix}_test`;
        },
      },
    });
    const { expiresAt: _expiresAt, ...withoutExpiry } = createInput;
    await app.createAndReconcile(context, withoutExpiry);

    current = "2026-07-20T00:01:01.000Z";
    expect(
      (await app.maintain(context, { protectedSandboxIds: ["sbx_test"] }))._unsafeUnwrap()
        .snapshotsCaptured,
    ).toEqual([]);
    const first = (await app.maintain(context))._unsafeUnwrap();
    expect(first.snapshotsCaptured).toEqual(["ssn_1"]);
    expect(first.snapshotsPruned).toEqual([]);

    current = "2026-07-20T00:02:02.000Z";
    const second = (await app.maintain(context))._unsafeUnwrap();
    expect(second.snapshotsCaptured).toEqual(["ssn_2"]);
    expect(second.snapshotsPruned).toEqual(["ssn_1"]);
    expect(fake.deletedSnapshotIds()).toEqual(["ssn_1"]);
    expect((await app.showSnapshot(context, "ssn_1"))._unsafeUnwrap().status).toBe("deleted");
    expect((await app.showSnapshot(context, "ssn_2"))._unsafeUnwrap()).toMatchObject({
      status: "ready",
      reason: "scheduled",
      portability: "provider-local",
    });
  });

  test("[SNAP-POL-005][SNAP-POL-006] required termination captures once before cleanup", async () => {
    const fake = provider();
    const app = service(fake.adapter, undefined, {
      snapshotLifecyclePolicy: new StaticSandboxSnapshotLifecyclePolicy({
        retainCount: 3,
        beforeTermination: "required",
        beforeExpiry: "disabled",
      }),
    });
    const { expiresAt: _expiresAt, ...withoutExpiry } = createInput;
    await app.createAndReconcile(context, withoutExpiry);

    expect((await app.terminate(context, "sbx_test")).isOk()).toBe(true);
    expect((await app.terminate(context, "sbx_test")).isOk()).toBe(true);
    expect(fake.snapshotCaptureCalls()).toBe(1);
    expect(fake.terminateCalls()).toBe(1);
    expect((await app.listSnapshots(context, {}))._unsafeUnwrap().items).toEqual([
      expect.objectContaining({
        reason: "pre-termination",
        status: "ready",
      }),
    ]);
  });

  test("[SNAP-POL-008] required termination resumes paused recovery before capture", async () => {
    const fake = provider();
    const app = service(fake.adapter, undefined, {
      snapshotLifecyclePolicy: new StaticSandboxSnapshotLifecyclePolicy({
        retainCount: 3,
        beforeTermination: "required",
        beforeExpiry: "disabled",
      }),
    });
    const { expiresAt: _expiresAt, ...withoutExpiry } = createInput;
    await app.createAndReconcile(context, withoutExpiry);
    await app.pause(context, "sbx_test");

    expect((await app.terminate(context, "sbx_test")).isOk()).toBe(true);
    expect(fake.resumeCalls()).toBe(1);
    expect(fake.snapshotCaptureCalls()).toBe(1);
    expect(fake.terminateCalls()).toBe(1);
  });

  test("[SNAP-POL-005] required capture failure preserves the ready runtime", async () => {
    const fake = provider();
    fake.adapter.captureSnapshot = async () => {
      throw new Error("injected Snapshot failure");
    };
    const app = service(fake.adapter, undefined, {
      snapshotLifecyclePolicy: new StaticSandboxSnapshotLifecyclePolicy({
        retainCount: 3,
        beforeTermination: "required",
        beforeExpiry: "disabled",
      }),
    });
    const { expiresAt: _expiresAt, ...withoutExpiry } = createInput;
    await app.createAndReconcile(context, withoutExpiry);

    const terminated = await app.terminate(context, "sbx_test");
    expect(terminated.isErr()).toBe(true);
    if (terminated.isErr()) {
      expect(terminated.error).toMatchObject({
        code: "sandbox_snapshot_required_capture_failed",
        retryable: true,
        details: {
          phase: "execution-sandbox-required-snapshot-gate",
          gatePhase: "capture",
        },
      });
    }
    expect(fake.terminateCalls()).toBe(0);
    expect((await app.show(context, "sbx_test"))._unsafeUnwrap().status).toBe("ready");
    expect((await app.listSnapshots(context, {}))._unsafeUnwrap().items[0]).toMatchObject({
      reason: "pre-termination",
      status: "failed",
    });
  });

  test("[SNAP-POL-007] best-effort capture failure still terminates exact runtime", async () => {
    const fake = provider();
    fake.adapter.captureSnapshot = async () => {
      throw new Error("injected Snapshot failure");
    };
    const app = service(fake.adapter, undefined, {
      snapshotLifecyclePolicy: new StaticSandboxSnapshotLifecyclePolicy({
        retainCount: 3,
        beforeTermination: "best-effort",
        beforeExpiry: "disabled",
      }),
    });
    const { expiresAt: _expiresAt, ...withoutExpiry } = createInput;
    await app.createAndReconcile(context, withoutExpiry);

    expect((await app.terminate(context, "sbx_test")).isOk()).toBe(true);
    expect(fake.terminateCalls()).toBe(1);
    expect((await app.listSnapshots(context, {}))._unsafeUnwrap().items[0]).toMatchObject({
      reason: "pre-termination",
      status: "failed",
    });
  });

  test("[SNAP-POL-004] maintenance expires retained Snapshot after source termination", async () => {
    let current = "2026-07-20T00:00:00.000Z";
    const fake = provider();
    const app = service(fake.adapter, () => current, {
      snapshotLifecyclePolicy: new StaticSandboxSnapshotLifecyclePolicy({
        snapshotTtlSeconds: 60,
        retainCount: 3,
        beforeTermination: "required",
        beforeExpiry: "disabled",
      }),
    });
    const { expiresAt: _expiresAt, ...withoutExpiry } = createInput;
    await app.createAndReconcile(context, withoutExpiry);
    await app.terminate(context, "sbx_test");

    current = "2026-07-20T00:01:01.000Z";
    const maintained = (await app.maintain(context))._unsafeUnwrap();
    expect(maintained.snapshotsPruned).toEqual(["ssn_test"]);
    expect((await app.showSnapshot(context, "ssn_test"))._unsafeUnwrap().status).toBe("deleted");
  });

  test("[SNAP-POL-005] required pre-expiry Snapshot precedes provider cleanup", async () => {
    let current = "2026-07-20T00:00:00.000Z";
    const fake = provider();
    const app = service(fake.adapter, () => current, {
      snapshotLifecyclePolicy: new StaticSandboxSnapshotLifecyclePolicy({
        retainCount: 3,
        beforeTermination: "disabled",
        beforeExpiry: "required",
      }),
    });
    await app.createAndReconcile(context, createInput);
    current = "2026-07-20T01:00:01.000Z";

    const maintained = (await app.maintain(context))._unsafeUnwrap();
    expect(maintained.expired).toEqual(["sbx_test"]);
    expect(maintained.snapshotsCaptured).toEqual(["ssn_test"]);
    expect(fake.snapshotCaptureCalls()).toBe(1);
    expect(fake.terminateCalls()).toBe(1);
  });

  test("[HIB-APP-001][HIB-APP-002] persists compute-released recovery on one identity", async () => {
    const fake = provider();
    const app = service(fake.adapter);
    await app.createAndReconcile(context, createInput);

    const paused = (await app.pause(context, "sbx_test"))._unsafeUnwrap();
    expect(paused).toMatchObject({
      sandboxId: "sbx_test",
      status: "paused",
      suspension: {
        mode: "compute-released",
        portability: "provider-local",
      },
    });
    const resumed = (await app.resume(context, "sbx_test"))._unsafeUnwrap();
    expect(resumed).toMatchObject({
      sandboxId: "sbx_test",
      status: "ready",
      providerKey: "hermetic",
    });
    expect(resumed.suspension).toBeUndefined();
  });

  test("[HIB-APP-003] retains paused recovery metadata when resume fails", async () => {
    const fake = provider();
    fake.adapter.resume = async () => {
      throw new Error("injected resume failure");
    };
    const app = service(fake.adapter);
    await app.createAndReconcile(context, createInput);
    await app.pause(context, "sbx_test");

    expect((await app.resume(context, "sbx_test")).isErr()).toBe(true);
    expect((await app.show(context, "sbx_test"))._unsafeUnwrap()).toMatchObject({
      status: "paused",
      suspension: {
        mode: "compute-released",
        portability: "provider-local",
      },
    });
  });

  test("[WS-OPEN-RESUME-011][HIB-APP-005] coalesces concurrent and completed resume retries", async () => {
    const fake = provider();
    const originalResume = fake.adapter.resume.bind(fake.adapter);
    let releaseResume!: () => void;
    let markResumeEntered!: () => void;
    const resumeGate = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });
    const resumeEntered = new Promise<void>((resolve) => {
      markResumeEntered = resolve;
    });
    fake.adapter.resume = async (request) => {
      markResumeEntered();
      await resumeGate;
      return originalResume(request);
    };
    const app = service(fake.adapter);
    await app.createAndReconcile(context, createInput);
    await app.pause(context, "sbx_test");

    const first = app.resume(context, "sbx_test");
    await resumeEntered;
    const concurrent = app.resume(context, "sbx_test");
    releaseResume();

    const [firstResult, concurrentResult] = await Promise.all([first, concurrent]);
    expect(firstResult._unsafeUnwrap()).toMatchObject({
      sandboxId: "sbx_test",
      status: "ready",
    });
    expect(concurrentResult._unsafeUnwrap()).toMatchObject({
      sandboxId: "sbx_test",
      status: "ready",
    });
    expect((await app.resume(context, "sbx_test"))._unsafeUnwrap()).toMatchObject({
      sandboxId: "sbx_test",
      status: "ready",
    });
    expect(fake.resumeCalls()).toBe(1);
  });

  test("[HIB-APP-004] auto-suspends only idle compute-released Sandboxes", async () => {
    let current = "2026-07-20T00:00:00.000Z";
    const released = provider();
    const app = service(released.adapter, () => current);
    const { expiresAt: _expiresAt, ...withoutExpiry } = createInput;
    await app.createAndReconcile(context, withoutExpiry);
    current = "2026-07-20T00:02:00.000Z";

    expect(
      (
        await app.maintain(context, {
          idleSuspendAfterSeconds: 60,
          protectedSandboxIds: ["sbx_test"],
        })
      )._unsafeUnwrap().suspended,
    ).toEqual([]);
    expect((await app.maintain(context, { idleSuspendAfterSeconds: 60 }))._unsafeUnwrap()).toEqual({
      expired: [],
      suspended: ["sbx_test"],
      migrated: [],
      reconciled: [],
      snapshotsCaptured: [],
      snapshotsPruned: [],
      failed: [],
    });

    const frozen = provider();
    frozen.adapter.capabilities.pause = {
      mode: "process-frozen",
      portability: "provider-local",
    };
    const frozenApp = service(frozen.adapter, () => current);
    await frozenApp.createAndReconcile(context, withoutExpiry);
    current = "2026-07-20T00:04:00.000Z";
    expect(
      (await frozenApp.maintain(context, { idleSuspendAfterSeconds: 60 }))._unsafeUnwrap()
        .suspended,
    ).toEqual([]);
  });

  test("[HIB-QUOTA-001] rejects quota overflow before persistence and provider effects", async () => {
    const fake = provider();
    const repository = new InMemorySandboxRepository();
    const app = new ExecutionSandboxService({
      repository,
      providerRegistry: new SandboxProviderRegistry([fake.adapter]),
      clock: { now: () => "2026-07-20T00:00:00.000Z" },
      idGenerator: { next: (prefix) => `${prefix}_test` },
      quotaPolicy: new StaticSandboxQuotaPolicy({
        activeSandboxes: 1,
        ...createInput.limits,
      }),
    });
    expect((await app.createAndReconcile(context, createInput)).isOk()).toBe(true);
    const rejected = await app.create(context, createInput);
    expect(rejected.isErr()).toBe(true);
    if (rejected.isErr()) expect(rejected.error.code).toBe("sandbox_quota_exceeded");
    expect((await app.list(context, {}))._unsafeUnwrap().items).toHaveLength(1);
    expect(fake.provisionCalls()).toBe(1);
  });

  test("[HIB-QUOTA-002] admits the exact boundary and releases paused compute usage", async () => {
    const fake = provider();
    const repository = new InMemorySandboxRepository();
    let sequence = 0;
    const app = new ExecutionSandboxService({
      repository,
      providerRegistry: new SandboxProviderRegistry([fake.adapter]),
      clock: { now: () => "2026-07-20T00:00:00.000Z" },
      idGenerator: { next: (prefix) => `${prefix}_${++sequence}` },
      quotaPolicy: new StaticSandboxQuotaPolicy({
        activeSandboxes: 2,
        cpuMillis: createInput.limits.cpuMillis,
        memoryBytes: createInput.limits.memoryBytes,
        diskBytes: createInput.limits.diskBytes * 2,
        maxProcesses: createInput.limits.maxProcesses,
      }),
    });
    const first = (await app.createAndReconcile(context, createInput))._unsafeUnwrap();
    await app.pause(context, first.sandboxId);
    expect(await repository.summarizeActiveUsage(context)).toEqual({
      activeSandboxes: 1,
      cpuMillis: 0,
      memoryBytes: 0,
      diskBytes: createInput.limits.diskBytes,
      maxProcesses: 0,
    });
    expect((await app.createAndReconcile(context, createInput)).isOk()).toBe(true);
    expect((await app.create(context, createInput)).isErr()).toBe(true);
    expect(fake.provisionCalls()).toBe(2);
  });

  test("[HIB-PLACE-001][HIB-MIGRATE-001] selects placement and rejects local recovery moves", async () => {
    const first = provider();
    const second = provider();
    const firstAdapter: SandboxProvider = { ...first.adapter, key: "server-a" };
    const secondAdapter: SandboxProvider = { ...second.adapter, key: "server-b" };
    const repository = new InMemorySandboxRepository();
    const app = new ExecutionSandboxService({
      repository,
      providerRegistry: new SandboxProviderRegistry([firstAdapter, secondAdapter]),
      clock: { now: () => "2026-07-20T00:00:00.000Z" },
      idGenerator: { next: (prefix) => `${prefix}_test` },
      placementPolicy: {
        select: () => ok("server-b"),
      },
    });
    const created = (await app.createAndReconcile(context, createInput))._unsafeUnwrap();
    expect(created.providerKey).toBe("server-b");
    await app.pause(context, created.sandboxId);

    const rejected = await app.resume(context, created.sandboxId, { providerKey: "server-a" });
    expect(rejected.isErr()).toBe(true);
    if (rejected.isErr()) expect(rejected.error.code).toBe("sandbox_recovery_not_portable");
    expect((await app.show(context, created.sandboxId))._unsafeUnwrap().status).toBe("paused");
  });

  test("[HIB-PLACE-002] rejects a placement result outside compatible candidates", async () => {
    const fake = provider();
    const repository = new InMemorySandboxRepository();
    const app = new ExecutionSandboxService({
      repository,
      providerRegistry: new SandboxProviderRegistry([fake.adapter]),
      clock: { now: () => "2026-07-20T00:00:00.000Z" },
      idGenerator: { next: (prefix) => `${prefix}_test` },
      placementPolicy: {
        select: () => ok("unknown-provider"),
      },
    });

    expect((await app.create(context, createInput)).isErr()).toBe(true);
    expect((await app.list(context, {}))._unsafeUnwrap().items).toEqual([]);
    expect(fake.provisionCalls()).toBe(0);
  });

  test("[PORT-REC-002][PORT-REC-003] restores through a compatible recovery family", async () => {
    const first = provider();
    const second = provider();
    first.adapter.capabilities.pause = {
      mode: "compute-released",
      portability: "provider-family",
      recoveryFamily: "shared-store-a",
    };
    second.adapter.capabilities.pause = {
      mode: "compute-released",
      portability: "provider-family",
      recoveryFamily: "shared-store-a",
    };
    const firstAdapter: SandboxProvider = { ...first.adapter, key: "server-a" };
    const secondAdapter: SandboxProvider = { ...second.adapter, key: "server-b" };
    let restoredHandle: string | undefined;
    secondAdapter.resume = async (request) => {
      restoredHandle = request.providerHandle;
      return {
        providerHandle: `handle:${request.sandboxId}:server-b`,
        realizedIsolation: "gvisor",
      };
    };
    const repository = new InMemorySandboxRepository();
    const app = new ExecutionSandboxService({
      repository,
      providerRegistry: new SandboxProviderRegistry([firstAdapter, secondAdapter]),
      clock: { now: () => "2026-07-20T00:00:00.000Z" },
      idGenerator: { next: (prefix) => `${prefix}_test` },
      placementPolicy: { select: () => ok("server-a") },
    });
    const created = (await app.createAndReconcile(context, createInput))._unsafeUnwrap();
    await app.pause(context, created.sandboxId);

    const resumed = await app.resume(context, created.sandboxId, { providerKey: "server-b" });
    expect(resumed._unsafeUnwrap()).toMatchObject({
      sandboxId: created.sandboxId,
      status: "ready",
      providerKey: "server-b",
    });
    expect(restoredHandle).toBe(`recovery:${created.sandboxId}`);

    await app.pause(context, created.sandboxId);
    firstAdapter.capabilities.pause = {
      mode: "compute-released",
      portability: "provider-family",
      recoveryFamily: "shared-store-b",
    };
    const rejected = await app.resume(context, created.sandboxId, { providerKey: "server-a" });
    expect(rejected.isErr()).toBe(true);
    if (rejected.isErr()) expect(rejected.error.code).toBe("sandbox_recovery_not_portable");
  });

  test("[PORT-MOVE-001][PORT-MOVE-002] maintenance relocates a ready portable Sandbox", async () => {
    const fake = provider();
    fake.adapter.capabilities.pause = {
      mode: "compute-released",
      portability: "provider-family",
      recoveryFamily: "shared-store-a",
    };
    fake.adapter.requiresRelocation = async () => true;
    const app = service(fake.adapter);
    await app.createAndReconcile(context, createInput);

    expect((await app.maintain(context))._unsafeUnwrap()).toEqual({
      expired: [],
      suspended: [],
      migrated: ["sbx_test"],
      reconciled: [],
      snapshotsCaptured: [],
      snapshotsPruned: [],
      failed: [],
    });
    expect((await app.show(context, "sbx_test"))._unsafeUnwrap()).toMatchObject({
      sandboxId: "sbx_test",
      status: "ready",
    });
  });

  test("[PORT-MOVE-003] failed relocation retains retryable paused recovery", async () => {
    const fake = provider();
    fake.adapter.capabilities.pause = {
      mode: "compute-released",
      portability: "portable",
    };
    fake.adapter.requiresRelocation = async () => true;
    fake.adapter.resume = async () => {
      throw new Error("injected target restore failure");
    };
    const app = service(fake.adapter);
    await app.createAndReconcile(context, createInput);

    const maintained = (await app.maintain(context))._unsafeUnwrap();
    expect(maintained).toEqual({
      expired: [],
      suspended: [],
      migrated: [],
      reconciled: [],
      snapshotsCaptured: [],
      snapshotsPruned: [],
      failed: ["sbx_test"],
    });
    expect((await app.show(context, "sbx_test"))._unsafeUnwrap()).toMatchObject({
      sandboxId: "sbx_test",
      status: "paused",
      suspension: {
        mode: "compute-released",
        portability: "portable",
      },
    });
  });
});

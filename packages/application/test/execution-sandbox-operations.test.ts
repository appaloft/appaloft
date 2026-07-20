import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  ExecutionSandboxService,
  InMemorySandboxRepository,
  type SandboxProvider,
  SandboxProviderRegistry,
} from "../src";

const context = createExecutionContext({
  entrypoint: "http",
  requestId: "req_sandbox_test",
  tenant: { tenantId: "tenant_a", organizationId: "org_a" },
});

function provider(input: { isolation?: "container-trusted" | "gvisor" } = {}) {
  let provisionCalls = 0;
  let terminateCalls = 0;
  let updatedNetworkMode: "deny" | "allowlist" | undefined;
  let lastProvisionSource: Parameters<SandboxProvider["provision"]>[0]["source"] | undefined;
  const adapter: SandboxProvider = {
    key: "hermetic",
    capabilities: {
      isolation: input.isolation ?? "gvisor",
      pause: true,
      snapshot: ["filesystem"],
      processes: true,
      files: true,
      ports: true,
      networkPolicy: ["deny"],
      credentialBroker: false,
    },
    async provision(request) {
      provisionCalls += 1;
      lastProvisionSource = request.source;
      return {
        providerHandle: `handle:${request.sandboxId}`,
        realizedIsolation: input.isolation ?? "gvisor",
      };
    },
    async pause() {},
    async resume(request) {
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
    async captureSnapshot() {
      return { providerHandle: "snapshot:1", sizeBytes: 3 };
    },
    async deleteSnapshot() {},
    async updateNetworkPolicy(request) {
      updatedNetworkMode = request.networkPolicy.mode;
    },
  };
  return {
    adapter,
    provisionCalls: () => provisionCalls,
    terminateCalls: () => terminateCalls,
    updatedNetworkMode: () => updatedNetworkMode,
    lastProvisionSource: () => lastProvisionSource,
  };
}

function service(adapter: SandboxProvider, now: () => string = () => "2026-07-20T00:00:00.000Z") {
  return new ExecutionSandboxService({
    repository: new InMemorySandboxRepository(),
    providerRegistry: new SandboxProviderRegistry([adapter]),
    clock: { now },
    idGenerator: { next: (prefix) => `${prefix}_test` },
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

  test("[SBX-CMD-003] closes pause/resume, port and snapshot capabilities", async () => {
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
    expect(fake.lastProvisionSource()).toEqual({ kind: "snapshot", providerHandle: "snapshot:1" });
    expect((await app.deleteSnapshot(context, "ssn_test"))._unsafeUnwrap().status).toBe("deleted");
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
      reconciled: [],
      failed: [],
    });
    expect(fake.terminateCalls()).toBe(1);
    expect((await app.show(context, "sbx_test"))._unsafeUnwrap().status).toBe("expired");
  });
});

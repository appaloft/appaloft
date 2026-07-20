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
  const adapter: SandboxProvider = {
    key: "hermetic",
    capabilities: {
      isolation: input.isolation ?? "gvisor",
      pause: true,
      snapshot: ["filesystem"],
      processes: true,
      files: true,
      ports: true,
      networkPolicy: true,
      credentialBroker: false,
    },
    async provision(request) {
      provisionCalls += 1;
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
    async terminate() {},
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
      return [];
    },
    async terminateProcess() {},
    async captureSnapshot() {
      return { providerHandle: "snapshot:1", sizeBytes: 3 };
    },
  };
  return { adapter, provisionCalls: () => provisionCalls };
}

function service(adapter: SandboxProvider) {
  return new ExecutionSandboxService({
    repository: new InMemorySandboxRepository(),
    providerRegistry: new SandboxProviderRegistry([adapter]),
    clock: { now: () => "2026-07-20T00:00:00.000Z" },
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
  });
});

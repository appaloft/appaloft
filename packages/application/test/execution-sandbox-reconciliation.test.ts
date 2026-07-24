import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  createExecutionContext,
  ExecutionSandboxService,
  InMemorySandboxRepository,
  type SandboxOwnedRuntime,
  type SandboxProvider,
  SandboxProviderRegistry,
} from "../src";

const context = createExecutionContext({
  entrypoint: "system",
  requestId: "req_sandbox_reconcile",
  tenant: { tenantId: "tenant_a", organizationId: "org_a" },
});

function provider(): SandboxProvider & { removed: SandboxOwnedRuntime[] } {
  const removed: SandboxOwnedRuntime[] = [];
  return {
    key: "reconcile-test",
    capabilities: {
      isolation: "gvisor",
      pause: true,
      snapshot: ["filesystem"],
      processes: true,
      files: true,
      ports: false,
      networkPolicy: ["deny"],
      credentialBroker: false,
    },
    removed,
    async listOwnedRuntimes(request) {
      expect(request.ownerScope).toBe("tenant_a");
      expect(request.ownerOrganizationId).toBe("org_a");
      return {
        items: [
          {
            ownerScope: "tenant_a",
            sandboxId: "sbx_kept",
            providerHandle: "runtime:sbx_kept",
          },
          {
            ownerScope: "tenant_a",
            sandboxId: "sbx_orphan",
            providerHandle: "runtime:orphan",
          },
        ],
      };
    },
    async removeOwnedRuntime(runtime) {
      removed.push(runtime);
    },
    async provision(request) {
      return { providerHandle: `runtime:${request.sandboxId}`, realizedIsolation: "gvisor" };
    },
    async pause() {},
    async resume(request) {
      return { providerHandle: request.providerHandle, realizedIsolation: "gvisor" };
    },
    async terminate() {},
    async exec() {
      return { mode: "foreground", frames: [{ kind: "exit", sequence: 1, exitCode: 0 }] };
    },
    async listProcesses() {
      return [];
    },
    async terminateProcess() {},
    async listFiles() {
      return [];
    },
    async readFile() {
      return new Uint8Array();
    },
    async writeFile(request) {
      return { path: request.path, sizeBytes: request.content.byteLength };
    },
    async removeFile() {},
    async exposePort() {
      throw new Error("unsupported");
    },
    async listPorts() {
      return [];
    },
    async revokePort() {},
    async captureSnapshot() {
      return { providerHandle: "snapshot:test", sizeBytes: 0 };
    },
    async deleteSnapshot() {},
    async updateNetworkPolicy() {},
  };
}

function service(adapter: SandboxProvider, repository = new InMemorySandboxRepository()) {
  return {
    repository,
    service: new ExecutionSandboxService({
      repository,
      providerRegistry: new SandboxProviderRegistry([adapter]),
      clock: { now: () => "2026-07-20T00:00:00.000Z" },
      idGenerator: { next: (prefix) => `${prefix}_kept` },
    }),
  };
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
};

describe("ExecutionSandboxService provider reconciliation", () => {
  test("[SBX-RECONCILE-001] removes only provider-owned runtimes absent from tenant persistence", async () => {
    const adapter = provider();
    const app = service(adapter);
    expect((await app.service.createAndReconcile(context, createInput)).isOk()).toBe(true);

    const result = await app.service.reconcileProviderOrphans(context, {
      providerKey: "reconcile-test",
    });

    expect(result._unsafeUnwrap()).toEqual({
      retained: ["sbx_kept"],
      removed: ["sbx_orphan"],
      failed: [],
    });
    expect(adapter.removed).toEqual([
      {
        ownerScope: "tenant_a",
        sandboxId: "sbx_orphan",
        providerHandle: "runtime:orphan",
      },
    ]);
  });

  test("[SBX-RECONCILE-001] fails closed when provider inventory cannot be read", async () => {
    const adapter = provider();
    adapter.listOwnedRuntimes = async () => {
      throw new Error("provider unavailable");
    };
    const app = service(adapter);

    const result = await app.service.reconcileProviderOrphans(context, {
      providerKey: "reconcile-test",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe("sandbox_provider_operation_failed");
    expect(adapter.removed).toEqual([]);
  });

  test("[SBX-MAINTENANCE-001] system maintenance enumerates each persisted tenant", async () => {
    const adapter = provider();
    adapter.listOwnedRuntimes = async () => ({ items: [] });
    const app = service(adapter);
    const tenantA = createExecutionContext({
      entrypoint: "system",
      tenant: { tenantId: "tenant_a" },
    });
    const tenantB = createExecutionContext({
      entrypoint: "system",
      tenant: { tenantId: "tenant_b" },
    });
    expect((await app.service.createAndReconcile(tenantA, createInput)).isOk()).toBe(true);
    expect((await app.service.createAndReconcile(tenantB, createInput)).isOk()).toBe(true);

    const denied = await app.service.maintainAllTenants(tenantA);
    expect(denied.isErr()).toBe(true);
    if (denied.isErr()) expect(denied.error.code).toBe("operation_authorization_denied");

    const result = await app.service.maintainAllTenants(
      createExecutionContext({
        entrypoint: "system",
        actor: { kind: "system", id: "sandbox-maintenance-test" },
      }),
    );

    expect(result._unsafeUnwrap().tenants.map((item) => item.tenantId)).toEqual([
      "tenant_a",
      "tenant_b",
    ]);
    expect(result._unsafeUnwrap().tenants.every((item) => item.failed === 0)).toBe(true);
  });
});

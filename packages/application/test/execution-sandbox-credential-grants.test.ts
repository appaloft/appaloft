import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import {
  createExecutionContext,
  ExecutionSandboxService,
  InMemorySandboxRepository,
  type SandboxCredentialBroker,
  type SandboxProvider,
  SandboxProviderRegistry,
} from "../src";

const context = createExecutionContext({
  entrypoint: "http",
  requestId: "req_sandbox_credentials",
  tenant: { tenantId: "tenant_a", organizationId: "org_a" },
});

function provider(): SandboxProvider {
  return {
    key: "credential-test",
    capabilities: {
      isolation: "gvisor",
      pause: true,
      snapshot: ["filesystem"],
      processes: true,
      files: true,
      ports: false,
      networkPolicy: ["deny"],
      credentialBroker: true,
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

const createInput = {
  source: { kind: "image" as const, image: "python@sha256:abc123" },
  requestedIsolation: "gvisor" as const,
  limits: {
    cpuMillis: 1_000,
    memoryBytes: 256 * 1024 * 1024,
    diskBytes: 512 * 1024 * 1024,
    maxProcesses: 32,
  },
  networkPolicy: { mode: "deny" as const, rules: [] },
};

describe("ExecutionSandboxService credential grants", () => {
  test("[SBX-SECRET-001] persists only a destination-bound ref and revokes broker access", async () => {
    const calls: Parameters<SandboxCredentialBroker["request"]>[1][] = [];
    const broker: SandboxCredentialBroker = {
      async request(_context, input) {
        calls.push(input);
        return ok({ status: 200, headers: {}, bodyBase64: "b2s=", sizeBytes: 2 });
      },
    };
    const service = new ExecutionSandboxService({
      repository: new InMemorySandboxRepository(),
      providerRegistry: new SandboxProviderRegistry([provider()]),
      credentialBroker: broker,
      clock: { now: () => "2026-07-20T00:00:00.000Z" },
      idGenerator: { next: (prefix) => `${prefix}_credential` },
    });
    await service.createAndReconcile(context, createInput);

    const granted = await service.grantCredential(context, "sbx_credential", {
      grantId: "grant_api",
      secretRef: "vault://sandbox/api-token",
      destination: "api.example.com",
      transformation: "authorization-bearer",
    });
    expect(granted._unsafeUnwrap()).toEqual({
      grantId: "grant_api",
      secretRef: "vault://sandbox/api-token",
      destination: "api.example.com",
      transformation: "authorization-bearer",
    });
    expect(
      await service.brokerCredentialRequest(context, "sbx_credential", {
        grantId: "grant_api",
        method: "GET",
        url: "https://api.example.com/v1/data",
      }),
    ).toMatchObject({ value: { status: 200, bodyBase64: "b2s=" } });
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain("top-secret-token");

    expect(await service.revokeCredential(context, "sbx_credential", "grant_api")).toMatchObject({
      value: { grantId: "grant_api", revoked: true },
    });
    expect(
      (
        await service.brokerCredentialRequest(context, "sbx_credential", {
          grantId: "grant_api",
          method: "GET",
          url: "https://api.example.com/v1/data",
        })
      ).isErr(),
    ).toBe(true);
  });
});

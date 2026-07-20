import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";

import {
  CreateSandboxCommand,
  createExecutionContext,
  type ExecutionSandboxService,
  ListSandboxesQuery,
  ReadSandboxFileQuery,
  SandboxCommandHandler,
  SandboxQueryHandler,
  WriteSandboxFileCommand,
} from "../src";

const context = createExecutionContext({
  entrypoint: "http",
  requestId: "req_sandbox_cqrs",
  tenant: { tenantId: "tenant_a", organizationId: "org_a" },
});

function sandboxService() {
  const calls: Array<{ operation: string; input: unknown }> = [];
  const service = {
    async create(_context: unknown, input: unknown) {
      calls.push({ operation: "create", input });
      return ok({ sandboxId: "sbx_1", status: "requested" });
    },
    async list(_context: unknown, input: unknown) {
      calls.push({ operation: "list", input });
      return ok({ items: [] });
    },
    async writeFile(_context: unknown, sandboxId: string, input: unknown) {
      calls.push({
        operation: "writeFile",
        input: { sandboxId, ...(input as Record<string, unknown>) },
      });
      return ok({ path: "data.bin", sizeBytes: 3 });
    },
    async readFile(_context: unknown, sandboxId: string, input: unknown) {
      calls.push({
        operation: "readFile",
        input: { sandboxId, ...(input as Record<string, unknown>) },
      });
      return ok(new Uint8Array([0, 255, 1]));
    },
  } as unknown as ExecutionSandboxService;
  return { calls, service };
}

describe("execution sandbox CQRS boundary", () => {
  test("[SBX-API-001] parses create/list messages and dispatches tenant-scoped operations", async () => {
    const fake = sandboxService();
    const commands = new SandboxCommandHandler(fake.service);
    const queries = new SandboxQueryHandler(fake.service);
    const created = CreateSandboxCommand.create({
      source: { kind: "image", image: "python@sha256:abc123" },
      requestedIsolation: "gvisor",
      limits: {
        cpuMillis: 1_000,
        memoryBytes: 536_870_912,
        diskBytes: 2_147_483_648,
        maxProcesses: 32,
      },
      networkPolicy: { mode: "deny", rules: [] },
    });

    expect(created.isOk()).toBe(true);
    expect((await commands.handle(context, created._unsafeUnwrap())).isOk()).toBe(true);
    expect(
      (
        await queries.handle(context, ListSandboxesQuery.create({ limit: 10 })._unsafeUnwrap())
      ).isOk(),
    ).toBe(true);
    expect(fake.calls.map((call) => call.operation)).toEqual(["create", "list"]);
  });

  test("[SBX-FILE-002] transports binary files as validated base64 without lossy conversion", async () => {
    const fake = sandboxService();
    const commands = new SandboxCommandHandler(fake.service);
    const queries = new SandboxQueryHandler(fake.service);
    const write = WriteSandboxFileCommand.create({
      sandboxId: "sbx_1",
      path: "data.bin",
      contentBase64: "AP8B",
    });

    expect((await commands.handle(context, write._unsafeUnwrap())).isOk()).toBe(true);
    const read = await queries.handle(
      context,
      ReadSandboxFileQuery.create({ sandboxId: "sbx_1", path: "data.bin" })._unsafeUnwrap(),
    );
    expect(read._unsafeUnwrap()).toEqual({ contentBase64: "AP8B", sizeBytes: 3 });
    expect(fake.calls[0]).toMatchObject({
      operation: "writeFile",
      input: { sandboxId: "sbx_1", path: "data.bin" },
    });
    expect((fake.calls[0]?.input as { content: Uint8Array }).content).toEqual(
      new Uint8Array([0, 255, 1]),
    );
  });

  test("[SBX-API-002] rejects malformed ids, paths and base64 before service mutation", async () => {
    const fake = sandboxService();
    expect(ListSandboxesQuery.create({ limit: 101 }).isErr()).toBe(true);
    expect(ReadSandboxFileQuery.create({ sandboxId: "", path: "../host-secret" }).isErr()).toBe(
      true,
    );

    const malformed = WriteSandboxFileCommand.create({
      sandboxId: "sbx_1",
      path: "data.bin",
      contentBase64: "not base64!",
    })._unsafeUnwrap();
    expect((await new SandboxCommandHandler(fake.service).handle(context, malformed)).isErr()).toBe(
      true,
    );
    expect(fake.calls).toEqual([]);
  });
});

import "../../application/node_modules/reflect-metadata/Reflect.js";

import { afterEach, describe, expect, test } from "bun:test";
import { HermeticSandboxProvider } from "@appaloft/adapter-runtime";
import {
  type AppLogger,
  CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ExecutionSandboxService,
  InMemorySandboxRepository,
  QueryBus,
  SandboxProviderRegistry,
  tokens,
} from "@appaloft/application";
import { mountAppaloftOrpcRoutes } from "@appaloft/orpc";
import { Elysia } from "elysia";
import { container } from "tsyringe";

import { createAppaloftClient } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class SandboxContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_sdk_sandbox",
      entrypoint: input.entrypoint,
      ...(input.actor ? { actor: input.actor } : {}),
      ...(input.principal ? { principal: input.principal } : {}),
      ...(input.tenant ? { tenant: input.tenant } : {}),
    });
  }
}

const servers: Bun.Server<unknown>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

describe("external application sandbox SDK", () => {
  test("[SBX-SDK-001] operates a sandbox through a real HTTP server and public SDK", async () => {
    const child = container.createChildContainer();
    let sequence = 0;
    const service = new ExecutionSandboxService({
      repository: new InMemorySandboxRepository(),
      providerRegistry: new SandboxProviderRegistry([
        new HermeticSandboxProvider({ isolation: "gvisor" }),
      ]),
      clock: { now: () => "2026-07-20T00:00:00.000Z" },
      idGenerator: { next: (prefix) => `${prefix}_sdk_${++sequence}` },
    });
    child.register(tokens.executionSandboxService, { useValue: service });
    const logger = new NoopLogger();
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: new CommandBus(child, logger),
      queryBus: new QueryBus(child, logger),
      executionContextFactory: new SandboxContextFactory(),
      logger,
    });
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => app.handle(request),
    });
    servers.push(server);
    const client = createAppaloftClient({
      baseUrl: `http://127.0.0.1:${server.port}/api`,
      auth: { kind: "deploy-token", token: "sdk-test-token" },
    });

    const template = await client.sandboxTemplates.create({
      name: "Python 3.13",
      image: "python@sha256:abc123",
      minimumIsolation: "gvisor",
      limits: {
        cpuMillis: 1_000,
        memoryBytes: 256 * 1024 * 1024,
        diskBytes: 512 * 1024 * 1024,
        maxProcesses: 32,
      },
      networkPolicy: { mode: "deny", rules: [] },
    });
    expect(template.ok).toBe(true);
    if (!template.ok) return;
    const templateId = (template.data as { templateId: string }).templateId;

    const created = await client.sandboxes.create({
      source: { kind: "template", templateId },
      requestedIsolation: "gvisor",
      limits: {
        cpuMillis: 1_000,
        memoryBytes: 256 * 1024 * 1024,
        diskBytes: 512 * 1024 * 1024,
        maxProcesses: 32,
      },
      networkPolicy: { mode: "deny", rules: [] },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const sandboxId = (created.data as { sandboxId: string }).sandboxId;
    expect(created.data).toMatchObject({ status: "ready", sourceKind: "template" });

    expect(
      await client.sandboxFiles.write({
        sandboxId,
        path: "input/data.bin",
        contentBase64: btoa(String.fromCharCode(0, 255, 1)),
      }),
    ).toMatchObject({ ok: true, data: { sizeBytes: 3 } });
    expect(await client.sandboxFiles.read({ sandboxId, path: "input/data.bin" })).toMatchObject({
      ok: true,
      data: { contentBase64: "AP8B", sizeBytes: 3 },
    });
    expect(await client.sandboxes.exec({ sandboxId, argv: ["python", "-V"] })).toMatchObject({
      ok: true,
      data: { mode: "foreground" },
    });

    const captured = await client.sandboxSnapshots.create({
      sandboxId,
      capability: "filesystem",
    });
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const snapshotId = (captured.data as { snapshotId: string }).snapshotId;
    expect(await client.sandboxes.terminate({ sandboxId })).toMatchObject({ ok: true });

    const restored = await client.sandboxes.create({
      source: { kind: "snapshot", snapshotId },
      requestedIsolation: "gvisor",
      limits: {
        cpuMillis: 1_000,
        memoryBytes: 256 * 1024 * 1024,
        diskBytes: 512 * 1024 * 1024,
        maxProcesses: 32,
      },
      networkPolicy: { mode: "deny", rules: [] },
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const restoredId = (restored.data as { sandboxId: string }).sandboxId;
    expect(
      await client.sandboxFiles.read({ sandboxId: restoredId, path: "input/data.bin" }),
    ).toMatchObject({
      ok: true,
      data: { contentBase64: "AP8B" },
    });
    expect(await client.sandboxes.terminate({ sandboxId: restoredId })).toMatchObject({ ok: true });
    expect(await client.sandboxSnapshots.delete({ snapshotId })).toMatchObject({ ok: true });
    expect(await client.sandboxTemplates.delete({ templateId })).toMatchObject({ ok: true });
  });
});

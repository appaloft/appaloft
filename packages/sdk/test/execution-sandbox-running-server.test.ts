import "../../application/node_modules/reflect-metadata/Reflect.js";

import { afterEach, describe, expect, test } from "bun:test";
import { HermeticSandboxProvider } from "@appaloft/adapter-runtime";
import {
  type AppLogger,
  CommandBus,
  createExecutionContext,
  type EventBus,
  type ExecutionContext,
  type ExecutionContextFactory,
  ExecutionSandboxService,
  InMemorySandboxRepository,
  QueryBus,
  type SandboxCredentialBroker,
  type SandboxEventEnvelope,
  type SandboxEventObserver,
  SandboxProviderRegistry,
  tokens,
} from "@appaloft/application";
import { type DomainEvent, ok } from "@appaloft/core";
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

class MemorySandboxEvents implements EventBus, SandboxEventObserver, SandboxCredentialBroker {
  private readonly events: DomainEvent[] = [];
  async publish(_context: ExecutionContext, events: DomainEvent[]): Promise<void> {
    this.events.push(...events);
  }
  async open(
    _context: ExecutionContext,
    request: { sandboxId: string; untilTerminal: boolean },
    _signal: AbortSignal,
  ) {
    const events = this.events.filter((event) => event.aggregateId === request.sandboxId);
    return ok({
      async *[Symbol.asyncIterator]() {
        for (const [index, event] of events.entries()) {
          const envelope: SandboxEventEnvelope = {
            kind: "event",
            schemaVersion: "sandbox.events/v1",
            cursor: `cursor_${index + 1}`,
            sandboxId: request.sandboxId,
            occurredAt: event.occurredAt,
            eventType: event.type,
            source: event.type.startsWith("sandbox-process-") ? "process" : "lifecycle",
            payload: event.payload,
          };
          yield envelope;
          if (
            request.untilTerminal &&
            event.type === "sandbox-process-frame" &&
            ["exit", "error"].includes(
              String((event.payload.frame as Record<string, unknown> | undefined)?.kind),
            )
          ) {
            yield {
              kind: "closed" as const,
              schemaVersion: "sandbox.events/v1" as const,
              reason: "terminal" as const,
            };
            return;
          }
        }
      },
      async close() {},
    });
  }
  async request() {
    return ok({ status: 200, headers: {}, bodyBase64: "c2FmZQ==", sizeBytes: 4 });
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
    const events = new MemorySandboxEvents();
    const service = new ExecutionSandboxService({
      repository: new InMemorySandboxRepository(),
      providerRegistry: new SandboxProviderRegistry([
        new HermeticSandboxProvider({ isolation: "gvisor", credentialBroker: true }),
      ]),
      clock: { now: () => "2026-07-20T00:00:00.000Z" },
      idGenerator: { next: (prefix) => `${prefix}_sdk_${++sequence}` },
      eventBus: events,
      eventObserver: events,
      credentialBroker: events,
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
    const sandboxId = created.sandboxId;
    expect(created).toMatchObject({ status: "ready", sourceKind: "template" });

    expect(
      await created.files.write({
        path: "input/data.bin",
        contentBase64: btoa(String.fromCharCode(0, 255, 1)),
      }),
    ).toMatchObject({ sizeBytes: 3 });
    expect(await created.files.read({ path: "input/data.bin" })).toMatchObject({
      contentBase64: "AP8B",
      sizeBytes: 3,
    });
    expect(await created.exec({ argv: ["python", "-V"] })).toMatchObject({
      mode: "foreground",
    });
    const streamed = [];
    for await (const envelope of client.sandboxes.events.stream({
      sandboxId,
      untilTerminal: true,
    })) {
      streamed.push(envelope);
    }
    expect(streamed).toContainEqual(
      expect.objectContaining({ kind: "event", eventType: "sandbox-process-frame" }),
    );
    expect(streamed.filter((item) => (item as { kind?: string }).kind === "closed")).toEqual([
      expect.objectContaining({ kind: "closed", reason: "terminal" }),
    ]);
    expect(
      await client.sandboxCredentials.grant({
        sandboxId,
        grantId: "grant_sdk",
        secretRef: "vault://sandbox/api-token",
        destination: "api.example.com",
        transformation: "authorization-bearer",
      }),
    ).toMatchObject({ ok: true, data: { grantId: "grant_sdk" } });
    expect(
      await client.sandboxCredentials.request({
        sandboxId,
        grantId: "grant_sdk",
        method: "GET",
        url: "https://api.example.com/v1/data",
      }),
    ).toMatchObject({ ok: true, data: { status: 200, bodyBase64: "c2FmZQ==" } });
    expect(await client.sandboxCredentials.list({ sandboxId })).toMatchObject({
      ok: true,
      data: { items: [{ grantId: "grant_sdk", secretRef: "vault://sandbox/api-token" }] },
    });
    expect(
      await client.sandboxCredentials.revoke({ sandboxId, grantId: "grant_sdk" }),
    ).toMatchObject({ ok: true, data: { revoked: true } });

    const captured = await client.sandboxSnapshots.create({
      sandboxId,
      capability: "filesystem",
    });
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const snapshotId = (captured.data as { snapshotId: string }).snapshotId;
    expect(await created.terminate()).toMatchObject({ status: "terminated" });

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
    expect(await restored.files.read({ path: "input/data.bin" })).toMatchObject({
      contentBase64: "AP8B",
    });
    expect(await restored.terminate()).toMatchObject({ status: "terminated" });
    expect(await client.sandboxSnapshots.delete({ snapshotId })).toMatchObject({ ok: true });
    expect(await client.sandboxTemplates.delete({ templateId })).toMatchObject({ ok: true });
  });
});

import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import { FixedClock, SequenceIdGenerator } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import {
  InMemoryTunnelProviderRegistry,
  isEligibleTunnelOrigin,
  ListTunnelSessionsQuery,
  RevokeTunnelSessionCommand,
  StartTunnelCommand,
  type TunnelProviderHandle,
  type TunnelProviderPort,
  type TunnelSessionRecord,
  type TunnelSessionRepository,
  TunnelSessionService,
} from "../src/operations/tunnels/tunnel-session";

class MemoryTunnelSessions implements TunnelSessionRepository {
  records = new Map<string, TunnelSessionRecord>();
  async findOne(_context: RepositoryContext, id: string) {
    return ok(this.records.get(id) ?? null);
  }
  async listRecords(
    _context: RepositoryContext,
    filter: Parameters<TunnelSessionRepository["listRecords"]>[1] = {},
  ) {
    let records = [...this.records.values()];
    if (filter?.statuses?.length)
      records = records.filter((item) => filter.statuses?.includes(item.status));
    return ok(filter?.limit ? records.slice(0, filter.limit) : records);
  }
  async save(_context: RepositoryContext, record: TunnelSessionRecord) {
    this.records.set(record.id, record);
    return ok(record);
  }
}

class FakeTunnelProvider implements TunnelProviderPort {
  readonly key = "cloudflare-quick" as const;
  starts = 0;
  revokes = 0;
  running = true;
  async start(input: { sessionId: string; originUrl: string; expiresAt: string }) {
    this.starts += 1;
    return ok({
      publicUrl: "https://safe-session.trycloudflare.com",
      handle: {
        sessionRef: `test:${input.sessionId}`,
        processId: 42,
        executable: "cloudflared",
        originUrl: input.originUrl,
      },
    });
  }
  async inspect(_handle: TunnelProviderHandle) {
    return ok({ running: this.running });
  }
  async revoke(_handle: TunnelProviderHandle) {
    this.revokes += 1;
    this.running = false;
    return ok(undefined);
  }
}

describe("tunnel session lifecycle", () => {
  test("[TUNNEL-AUTH-003] rejects public and credential-bearing origins before provider invocation", () => {
    expect(isEligibleTunnelOrigin("https://example.com")).toBe(false);
    expect(isEligibleTunnelOrigin("https://fd-public.example.com")).toBe(false);
    expect(isEligibleTunnelOrigin("http://user:password@127.0.0.1:3000")).toBe(false);
    expect(isEligibleTunnelOrigin("http://192.168.1.10:8080")).toBe(true);
    expect(isEligibleTunnelOrigin("http://[fd00::1]:8080")).toBe(true);
    expect(
      StartTunnelCommand.create({
        providerKey: "cloudflare-quick",
        originUrl: "https://example.com",
      }).isErr(),
    ).toBe(true);
  });

  test("[TUNNEL-START-CF-001][TUNNEL-STATUS-004][TUNNEL-REVOKE-005] starts, redacts provider state, and revokes idempotently", async () => {
    const repository = new MemoryTunnelSessions();
    const provider = new FakeTunnelProvider();
    const service = new TunnelSessionService(
      repository,
      new InMemoryTunnelProviderRegistry([provider]),
      new FixedClock("2026-07-20T00:00:00.000Z"),
      new SequenceIdGenerator(),
    );
    const context = createExecutionContext({ requestId: "req_tunnel", entrypoint: "http" });
    const command = StartTunnelCommand.create({
      providerKey: "cloudflare-quick",
      originUrl: "http://127.0.0.1:3000",
      durationMinutes: 60,
    })._unsafeUnwrap();
    const started = (await service.start(context, command))._unsafeUnwrap();
    expect(started.session).toMatchObject({
      status: "ready",
      publicUrl: "https://safe-session.trycloudflare.com",
    });
    expect(started.session).not.toHaveProperty("providerHandle");
    const listed = (
      await service.list(context, ListTunnelSessionsQuery.create({})._unsafeUnwrap())
    )._unsafeUnwrap();
    expect(JSON.stringify(listed)).not.toContain("cloudflared");
    const revoke = RevokeTunnelSessionCommand.create({
      sessionId: started.session.id,
    })._unsafeUnwrap();
    expect((await service.revoke(context, revoke.sessionId))._unsafeUnwrap().session.status).toBe(
      "revoked",
    );
    expect((await service.revoke(context, revoke.sessionId))._unsafeUnwrap().session.status).toBe(
      "revoked",
    );
    expect(provider.revokes).toBe(1);
  });

  test("[TUNNEL-EXPIRY-006] reconciler revokes expired sessions and marks disappeared processes failed", async () => {
    const repository = new MemoryTunnelSessions();
    const provider = new FakeTunnelProvider();
    const service = new TunnelSessionService(
      repository,
      new InMemoryTunnelProviderRegistry([provider]),
      new FixedClock("2026-07-20T02:00:00.000Z"),
      new SequenceIdGenerator(),
    );
    const context = createExecutionContext({
      requestId: "req_reconcile",
      entrypoint: "system",
      actor: { kind: "system", id: "test" },
    });
    repository.records.set("tun_expired", {
      id: "tun_expired",
      providerKey: "cloudflare-quick",
      originUrl: "http://127.0.0.1:3000",
      publicUrl: "https://expired.trycloudflare.com",
      status: "ready",
      expiresAt: "2026-07-20T01:00:00.000Z",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      revokedAt: null,
      failureCode: null,
      providerHandle: {
        sessionRef: "expired",
        processId: 42,
        executable: "cloudflared",
        originUrl: "http://127.0.0.1:3000",
      },
    });
    repository.records.set("tun_orphaned", {
      id: "tun_orphaned",
      providerKey: "cloudflare-quick",
      originUrl: "http://127.0.0.1:4000",
      publicUrl: "https://orphaned.trycloudflare.com",
      status: "ready",
      expiresAt: "2026-07-20T03:00:00.000Z",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      revokedAt: null,
      failureCode: null,
      providerHandle: {
        sessionRef: "orphaned",
        processId: 43,
        executable: "cloudflared",
        originUrl: "http://127.0.0.1:4000",
      },
    });
    const result = (await service.reconcile(context))._unsafeUnwrap();
    expect(result).toEqual({ inspected: 2, expired: 1, failed: 1 });
    expect(repository.records.get("tun_expired")?.status).toBe("expired");
    expect(repository.records.get("tun_expired")?.providerHandle).toBeNull();
    expect(repository.records.get("tun_orphaned")).toMatchObject({
      status: "failed",
      failureCode: "TUNNEL_PROCESS_EXITED",
      providerHandle: null,
    });
  });
});

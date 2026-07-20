import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureStorageVolumeBackupPolicyCommand,
  ControlPlanePortabilityExportPlanQuery,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ExportControlPlaneCommand,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  StartTunnelCommand,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      ...input,
      requestId: input.requestId ?? "req_data_safety_http",
    });
  }
}

describe("backup automation, portability, and tunnel HTTP routes", () => {
  test("[STOR-BACKUP-AUTO-ENTRY-008][PORTABILITY-ENTRY-008][TUNNEL-ENTRY-007] mounts shared operations with owner product auth", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const commandBus = {
      async execute<T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> {
        commands.push(command as Command<unknown>);
        if (command instanceof ConfigureStorageVolumeBackupPolicyCommand) {
          return ok({ id: "sbp_http" } as T);
        }
        if (command instanceof ExportControlPlaneCommand) {
          return ok({
            schemaVersion: "control-plane-portability.export/v1",
            artifact: {
              id: "cpa_http",
              schemaVersion: "appaloft.control-plane-portability/v1",
              createdAt: "2026-07-20T00:00:00.000Z",
              sourceRevision: "104",
              tableCount: 2,
              rowCount: 3,
              checksum: "sha256:http",
              sizeBytes: 128,
              kind: "export",
            },
            encryptedEnvelope: "encrypted-envelope-http",
          } as T);
        }
        if (command instanceof StartTunnelCommand) {
          return ok({
            schemaVersion: "tunnel-sessions.start/v1",
            session: {
              id: "tun_http",
              providerKey: "cloudflare-quick",
              originUrl: "http://127.0.0.1:3000",
              publicUrl: "https://safe-http.trycloudflare.com",
              status: "ready",
              expiresAt: "2026-07-20T01:00:00.000Z",
              createdAt: "2026-07-20T00:00:00.000Z",
              updatedAt: "2026-07-20T00:00:00.000Z",
              revokedAt: null,
              failureCode: null,
            },
          } as T);
        }
        throw new Error(`Unexpected command ${command.constructor.name}`);
      },
    } as CommandBus;
    const queryBus = {
      async execute<T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> {
        queries.push(query as Query<unknown>);
        if (query instanceof ControlPlanePortabilityExportPlanQuery) {
          return ok({
            schemaVersion: "control-plane-portability.export-plan/v1",
            sourceRevision: "104",
            tables: [{ name: "projects", rowCount: 1 }],
            totalRows: 1,
            warnings: [],
          } as T);
        }
        throw new Error(`Unexpected query ${query.constructor.name}`);
      },
    } as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) =>
        ok({
          actor: { kind: "user", id: "usr_owner" },
          email: "owner@example.com",
          organizationId: "org_http",
          role: input.requiredRole,
          userId: "usr_owner",
        }),
    };
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort,
      queryBus,
    });
    const authHeaders = { cookie: "better-auth.session_token=test-owner-session" };

    const backup = await app.handle(
      new Request("http://localhost/api/storage-volumes/backup-policies", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          storageVolumeId: "stv_http",
          scheduledEnabled: true,
          preDeployEnabled: true,
          scheduleIntervalHours: 6,
          planRequest: {
            source: { storageVolumeId: "stv_http", dataFormat: "filesystem", liveWrites: false },
            requestedConsistency: "crash-consistent",
            target: {
              providerKey: "s3-compatible",
              targetRef: "s3://backup/http",
              secretRef: "secret:r2",
            },
            retention: { maxCount: 3, maxAgeDays: 7 },
          },
        }),
      }),
    );
    const exportPlan = await app.handle(
      new Request("http://localhost/api/control-plane-portability/export-plan", {
        headers: authHeaders,
      }),
    );
    const exported = await app.handle(
      new Request("http://localhost/api/control-plane-portability/exports", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ passphrase: "correct horse battery staple" }),
      }),
    );
    const tunnel = await app.handle(
      new Request("http://localhost/api/tunnels", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          providerKey: "cloudflare-quick",
          originUrl: "http://127.0.0.1:3000",
          durationMinutes: 60,
        }),
      }),
    );

    expect(backup.status, await backup.clone().text()).toBe(201);
    expect(await backup.json()).toEqual({ id: "sbp_http" });
    expect(exportPlan.status, await exportPlan.clone().text()).toBe(200);
    expect(await exportPlan.json()).toMatchObject({
      schemaVersion: "control-plane-portability.export-plan/v1",
      totalRows: 1,
    });
    expect(exported.status, await exported.clone().text()).toBe(201);
    expect(await exported.json()).toMatchObject({ artifact: { id: "cpa_http" } });
    expect(tunnel.status, await tunnel.clone().text()).toBe(201);
    const tunnelBody = await tunnel.json();
    expect(tunnelBody).toMatchObject({ session: { id: "tun_http", status: "ready" } });
    expect(tunnelBody.session).not.toHaveProperty("providerHandle");
    expect(commands[0]).toBeInstanceOf(ConfigureStorageVolumeBackupPolicyCommand);
    expect(commands[1]).toBeInstanceOf(ExportControlPlaneCommand);
    expect(commands[2]).toBeInstanceOf(StartTunnelCommand);
    expect(queries[0]).toBeInstanceOf(ControlPlanePortabilityExportPlanQuery);
  });
});

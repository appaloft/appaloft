import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  DoctorQuery,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListPluginsQuery,
  ListProvidersQuery,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
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
      requestId: input.requestId ?? "req_orpc_system_diagnostics_test",
      entrypoint: input.entrypoint,
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

function mountSystemDiagnosticRoutes(queryBus: QueryBus) {
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
      ok({} as T),
  } as CommandBus;
  const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
    authorizeProductSession: async (_context, input) =>
      ok({
        actor: {
          kind: "user",
          id: "usr_system_diagnostics",
          label: "system-diagnostics@example.test",
        },
        email: "system-diagnostics@example.test",
        organizationId: input.organizationId ?? "org_system_diagnostics",
        role: input.requiredRole,
        userId: "usr_system_diagnostics",
      }),
  };

  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    productSessionAuthorizationPort,
    queryBus,
  });
}

const authHeaders = {
  cookie: "better-auth.session_token=test-session",
};

describe("system diagnostics HTTP routes", () => {
  test("[SYSTEM-DIAG-003] exposes safe provider capability and configuration diagnostics", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          items: [
            {
              key: "generic-ssh",
              title: "Generic SSH",
              category: "deploy-target",
              capabilities: ["remote-command"],
              capabilityDetails: [
                {
                  key: "remote-command",
                  title: "Remote command execution",
                  enabled: true,
                },
              ],
              configuration: {
                status: "configured",
                diagnostics: [
                  {
                    code: "provider.generic_ssh.configured",
                    severity: "info",
                    message:
                      "Generic SSH uses per-server credentials and requires no global provider secret.",
                  },
                ],
              },
            },
          ],
        } as T);
      },
    } as QueryBus;
    const app = mountSystemDiagnosticRoutes(queryBus);

    const response = await app.handle(
      new Request("http://localhost/api/providers", { headers: authHeaders }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      items: [
        {
          key: "generic-ssh",
          capabilityDetails: [
            {
              key: "remote-command",
              enabled: true,
            },
          ],
          configuration: {
            status: "configured",
          },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("privateKey");
    expect(JSON.stringify(body)).not.toContain("accessToken");
    expect(capturedQuery).toBeInstanceOf(ListProvidersQuery);
  });

  test("[SYSTEM-DIAG-003] exposes safe plugin capability and compatibility diagnostics", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          items: [
            {
              name: "builtin-openapi-reference",
              displayName: "OpenAPI Reference",
              version: "0.1.0",
              kind: "system-extension",
              capabilities: ["http-route", "web-page"],
              capabilityDetails: [
                {
                  key: "http-route",
                  title: "http-route",
                  enabled: true,
                },
              ],
              compatible: true,
              configuration: {
                status: "configured",
                diagnostics: [
                  {
                    code: "plugin.compatible",
                    severity: "info",
                    message: "Plugin compatibility range matches the current Appaloft version.",
                  },
                ],
              },
            },
          ],
        } as T);
      },
    } as QueryBus;
    const app = mountSystemDiagnosticRoutes(queryBus);

    const response = await app.handle(
      new Request("http://localhost/api/plugins", { headers: authHeaders }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      items: [
        {
          name: "builtin-openapi-reference",
          capabilityDetails: [
            {
              key: "http-route",
              enabled: true,
            },
          ],
          configuration: {
            status: "configured",
          },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("privateKey");
    expect(JSON.stringify(body)).not.toContain("accessToken");
    expect(capturedQuery).toBeInstanceOf(ListPluginsQuery);
  });

  test("[SYSTEM-DIAG-004] exposes doctor maintenance worker status without ticking workers", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          readiness: {
            status: "ready",
            checks: {
              database: true,
              migrations: true,
            },
          },
          providers: [],
          plugins: [],
          maintenanceWorkers: [
            {
              key: "durable-worker-runtime",
              label: "Durable worker runtime",
              enabled: true,
              activation: "starts-as-standalone-process",
              safetyMode: "durable-process-delivery",
              intervalSeconds: 0,
              runtimeTopology: {
                mode: "standalone",
                queueBackend: "database",
                workerCount: 2,
                workerGroup: "cloud-deployment-worker",
                workerIds: ["cloud-deployment-worker-1", "cloud-deployment-worker-2"],
                coordinationRole: "coordinator",
              },
              configurationKeys: [
                "APPALOFT_WORKER_RUNTIME_MODE",
                "APPALOFT_WORKER_QUEUE_BACKEND",
                "APPALOFT_WORKER_COUNT",
                "APPALOFT_WORKER_GROUP",
                "APPALOFT_WORKER_EXTERNAL_BACKEND_KIND",
              ],
              operationKeys: [
                "deployments.create",
                "deployments.retry",
                "deployments.rollback",
                "operator-work.*",
              ],
            },
            {
              key: "scheduled-task-runner",
              label: "Scheduled task runner",
              enabled: false,
              activation: "disabled-by-config",
              safetyMode: "runtime-execution",
              intervalSeconds: 60,
              batchSize: 25,
              configurationKeys: [
                "APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED",
                "APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS",
                "APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE",
              ],
              operationKeys: ["scheduled-tasks.run-now", "scheduled-task-runs.run-due"],
            },
            {
              key: "runtime-monitoring-collector-runner",
              label: "Runtime monitoring collector runner",
              enabled: true,
              activation: "starts-with-backend-service",
              safetyMode: "read-only-collection",
              intervalSeconds: 90,
              batchSize: 4,
              rawRetentionHours: 6,
              configurationKeys: [
                "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED",
                "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS",
                "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE",
                "APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS",
              ],
              operationKeys: ["runtime-monitoring.collect"],
            },
          ],
        } as T);
      },
    } as QueryBus;
    const app = mountSystemDiagnosticRoutes(queryBus);

    const response = await app.handle(
      new Request("http://localhost/api/system/doctor", { headers: authHeaders }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      readiness: {
        status: "ready",
      },
      maintenanceWorkers: [
        {
          key: "durable-worker-runtime",
          enabled: true,
          activation: "starts-as-standalone-process",
          safetyMode: "durable-process-delivery",
          intervalSeconds: 0,
          runtimeTopology: {
            mode: "standalone",
            queueBackend: "database",
            workerCount: 2,
            workerGroup: "cloud-deployment-worker",
            workerIds: ["cloud-deployment-worker-1", "cloud-deployment-worker-2"],
            coordinationRole: "coordinator",
          },
        },
        {
          key: "scheduled-task-runner",
          enabled: false,
          activation: "disabled-by-config",
          safetyMode: "runtime-execution",
          configurationKeys: [
            "APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED",
            "APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS",
            "APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE",
          ],
        },
        {
          key: "runtime-monitoring-collector-runner",
          enabled: true,
          activation: "starts-with-backend-service",
          rawRetentionHours: 6,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("privateKey");
    expect(JSON.stringify(body)).not.toContain("accessToken");
    expect(capturedQuery).toBeInstanceOf(DoctorQuery);
  });
});

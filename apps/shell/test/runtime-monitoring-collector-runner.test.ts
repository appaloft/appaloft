import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type EnvironmentReadModel,
  type EnvironmentSummary,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ProjectReadModel,
  type ProjectSummary,
  type RepositoryContext,
  type ResourceReadModel,
  type ResourceSummary,
  type RuntimeMonitoringCollectorRunResult,
  type RuntimeMonitoringCollectorService,
  type ServerReadModel,
  type ServerSummary,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

import { createRuntimeMonitoringCollectorRunner } from "../src/runtime-monitoring-collector-runner";

class CapturingLogger implements AppLogger {
  readonly messages: Array<{ level: string; message: string; details?: Record<string, unknown> }> =
    [];

  debug(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "debug", message, ...(details ? { details } : {}) });
  }

  info(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "info", message, ...(details ? { details } : {}) });
  }

  warn(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "warn", message, ...(details ? { details } : {}) });
  }

  error(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "error", message, ...(details ? { details } : {}) });
  }
}

class FixedExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      entrypoint: input.entrypoint,
      requestId: "req_runtime_monitoring_collector_runner",
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

class CapturingServerReadModel implements Pick<ServerReadModel, "list"> {
  async count(): Promise<number> {
    return 0;
  }

  readonly calls: RepositoryContext[] = [];

  constructor(private readonly servers: ServerSummary[]) {}

  async list(context: RepositoryContext): Promise<ServerSummary[]> {
    this.calls.push(context);
    return this.servers;
  }
}

class CapturingProjectReadModel implements Pick<ProjectReadModel, "list"> {
  async count(): Promise<number> {
    return 0;
  }

  readonly calls: RepositoryContext[] = [];

  constructor(private readonly projects: ProjectSummary[] = []) {}

  async list(context: RepositoryContext): Promise<ProjectSummary[]> {
    this.calls.push(context);
    return this.projects;
  }
}

class CapturingEnvironmentReadModel implements Pick<EnvironmentReadModel, "list"> {
  async count(): Promise<number> {
    return 0;
  }

  readonly calls: Array<{ context: RepositoryContext; projectId?: string }> = [];

  constructor(private readonly environments: EnvironmentSummary[] = []) {}

  async list(
    context: RepositoryContext,
    input?: { projectId?: string },
  ): Promise<EnvironmentSummary[]> {
    const projectId = input?.projectId;
    this.calls.push({ context, ...(projectId ? { projectId } : {}) });
    return projectId
      ? this.environments.filter((environment) => environment.projectId === projectId)
      : this.environments;
  }
}

class CapturingResourceReadModel implements Pick<ResourceReadModel, "list"> {
  async count(): Promise<number> {
    return 0;
  }

  readonly calls: Array<{
    context: RepositoryContext;
    input?: Parameters<ResourceReadModel["list"]>[1];
  }> = [];

  constructor(private readonly resources: ResourceSummary[] = []) {}

  async list(
    context: RepositoryContext,
    input?: Parameters<ResourceReadModel["list"]>[1],
  ): Promise<ResourceSummary[]> {
    this.calls.push({ context, ...(input ? { input } : {}) });
    return this.resources.filter(
      (resource) =>
        (!input?.projectId || resource.projectId === input.projectId) &&
        (!input?.environmentId || resource.environmentId === input.environmentId),
    );
  }
}

class CapturingRuntimeMonitoringCollectorService
  implements Pick<RuntimeMonitoringCollectorService, "run">
{
  readonly calls: Array<{
    context: ExecutionContext;
    input: Parameters<RuntimeMonitoringCollectorService["run"]>[1];
  }> = [];

  constructor(
    private readonly serviceResult: Result<RuntimeMonitoringCollectorRunResult> = ok(
      collectorResult(),
    ),
  ) {}

  async run(
    context: ExecutionContext,
    input: Parameters<RuntimeMonitoringCollectorService["run"]>[1],
  ): ReturnType<RuntimeMonitoringCollectorService["run"]> {
    this.calls.push({ context, input });
    return this.serviceResult;
  }
}

function collectorResult(): RuntimeMonitoringCollectorRunResult {
  return {
    schemaVersion: "runtime-monitoring.collect/v1",
    processAttemptId: "wrk_collect",
    sampleId: "rms_collect",
    scope: { kind: "server", serverId: "srv_primary" },
    observedAt: "2026-02-01T00:00:00.000Z",
    collectedAt: "2026-02-01T00:00:05.000Z",
    retainedUntil: "2026-02-02T00:00:00.000Z",
    partial: false,
    warningCount: 0,
    sourceErrorCount: 0,
  };
}

function server(overrides: Partial<ServerSummary> = {}): ServerSummary {
  return {
    id: "srv_primary",
    name: "Primary",
    host: "203.0.113.10",
    port: 22,
    providerKey: "generic-ssh",
    targetKind: "single-server",
    lifecycleStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "prj_demo",
    name: "Demo",
    slug: "demo",
    lifecycleStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function environment(overrides: Partial<EnvironmentSummary> = {}): EnvironmentSummary {
  return {
    id: "env_prod",
    projectId: "prj_demo",
    name: "Production",
    kind: "production",
    lifecycleStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    maskedVariables: [],
    ...overrides,
  };
}

function resource(overrides: Partial<ResourceSummary> = {}): ResourceSummary {
  return {
    id: "res_api",
    projectId: "prj_demo",
    environmentId: "env_prod",
    name: "API",
    slug: "api",
    kind: "application",
    createdAt: "2026-01-01T00:00:00.000Z",
    services: [{ name: "api", kind: "api" }],
    deploymentCount: 1,
    lastDeploymentId: "dep_api",
    lastDeploymentStatus: "succeeded",
    ...overrides,
  };
}

function emptyProjectReadModel(): CapturingProjectReadModel {
  return new CapturingProjectReadModel();
}

function emptyEnvironmentReadModel(): CapturingEnvironmentReadModel {
  return new CapturingEnvironmentReadModel();
}

function emptyResourceReadModel(): CapturingResourceReadModel {
  return new CapturingResourceReadModel();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RuntimeMonitoringCollectorRunner", () => {
  test("[RT-MON-001] does not start when disabled", async () => {
    const service = new CapturingRuntimeMonitoringCollectorService();
    const runner = createRuntimeMonitoringCollectorRunner({
      config: {
        enabled: false,
        intervalSeconds: 60,
        batchSize: 5,
        rawRetentionHours: 24,
      },
      serverReadModel: new CapturingServerReadModel([server()]),
      projectReadModel: emptyProjectReadModel(),
      environmentReadModel: emptyEnvironmentReadModel(),
      resourceReadModel: emptyResourceReadModel(),
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(service.calls).toHaveLength(0);
  });

  test("[RT-MON-001] collects active server targets through the collector service", async () => {
    const service = new CapturingRuntimeMonitoringCollectorService();
    const logger = new CapturingLogger();
    const serverReadModel = new CapturingServerReadModel([
      server(),
      server({ id: "srv_inactive", lifecycleStatus: "inactive" }),
      server({ id: "srv_secondary" }),
    ]);
    const runner = createRuntimeMonitoringCollectorRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 1,
        rawRetentionHours: 6,
      },
      serverReadModel,
      projectReadModel: emptyProjectReadModel(),
      environmentReadModel: emptyEnvironmentReadModel(),
      resourceReadModel: emptyResourceReadModel(),
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger,
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(serverReadModel.calls).toHaveLength(1);
    expect(service.calls).toHaveLength(1);
    expect(service.calls[0]).toMatchObject({
      context: {
        entrypoint: "system",
        actor: {
          kind: "system",
          id: "runtime-monitoring-collector-runner",
        },
      },
      input: {
        scope: { kind: "server", serverId: "srv_primary" },
        rawRetentionHours: 6,
        collectionProfile: "full",
      },
    });
    expect(logger.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "info",
          message: "runtime_monitoring_collector_runner.tick_completed",
          details: {
            scanned: 2,
            targeted: 1,
            completed: 1,
            failed: 0,
          },
        }),
      ]),
    );
  });

  test("[RT-MON-001][RT-MON-009] collects resource, deployment, project, and environment targets with active runtime ownership", async () => {
    const service = new CapturingRuntimeMonitoringCollectorService();
    const logger = new CapturingLogger();
    const runner = createRuntimeMonitoringCollectorRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 10,
        rawRetentionHours: 6,
      },
      serverReadModel: new CapturingServerReadModel([]),
      projectReadModel: new CapturingProjectReadModel([
        project(),
        project({ id: "prj_archived", lifecycleStatus: "archived" }),
      ]),
      environmentReadModel: new CapturingEnvironmentReadModel([
        environment(),
        environment({ id: "env_archived", lifecycleStatus: "archived" }),
      ]),
      resourceReadModel: new CapturingResourceReadModel([
        resource(),
        resource({
          id: "res_failed",
          lastDeploymentId: "dep_failed",
          lastDeploymentStatus: "failed",
        }),
        resource({
          id: "res_archived_env",
          environmentId: "env_archived",
          lastDeploymentId: "dep_archived_env",
          lastDeploymentStatus: "succeeded",
        }),
      ]),
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger,
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(service.calls.map((call) => call.input.scope)).toEqual([
      { kind: "resource", resourceId: "res_api" },
      { kind: "deployment", deploymentId: "dep_api" },
      { kind: "project", projectId: "prj_demo" },
      { kind: "environment", environmentId: "env_prod" },
    ]);
    expect(service.calls.every((call) => call.input.rawRetentionHours === 6)).toBe(true);
    expect(logger.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "info",
          message: "runtime_monitoring_collector_runner.tick_completed",
          details: {
            scanned: 4,
            targeted: 4,
            completed: 4,
            failed: 0,
          },
        }),
      ]),
    );
  });

  test("[RT-MON-001][PROC-DELIVERY-004] logs collector failures without stopping the tick", async () => {
    const service = new CapturingRuntimeMonitoringCollectorService(
      err(
        domainError.infra("runtime monitoring collection failed", {
          phase: "runtime-monitoring-collector-runner-test",
        }),
      ),
    );
    const logger = new CapturingLogger();
    const runner = createRuntimeMonitoringCollectorRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 1,
        rawRetentionHours: 24,
      },
      serverReadModel: new CapturingServerReadModel([server()]),
      projectReadModel: emptyProjectReadModel(),
      environmentReadModel: emptyEnvironmentReadModel(),
      resourceReadModel: emptyResourceReadModel(),
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger,
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(service.calls).toHaveLength(1);
    expect(logger.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: "runtime_monitoring_collector_runner.collect_failed",
          details: expect.objectContaining({
            serverId: "srv_primary",
            scopeKind: "server",
            scopeId: "srv_primary",
            errorCode: "infra_error",
          }),
        }),
        expect.objectContaining({
          level: "info",
          message: "runtime_monitoring_collector_runner.tick_completed",
          details: expect.objectContaining({
            failed: 1,
          }),
        }),
      ]),
    );
  });
});

import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import {
  ArchiveResourceRuntimeLogsCommand,
  ListResourceRuntimeLogArchivesQuery,
  PruneResourceRuntimeLogArchivesCommand,
  ShowResourceRuntimeLogArchiveQuery,
} from "../src/messages";
import {
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type ResourceReadModel,
  type ResourceRuntimeLogArchiveCreateInput,
  type ResourceRuntimeLogArchiveDetail,
  type ResourceRuntimeLogArchiveListInput,
  type ResourceRuntimeLogArchiveListPage,
  type ResourceRuntimeLogArchivePruneInput,
  type ResourceRuntimeLogArchivePruneStoreResult,
  type ResourceRuntimeLogArchiveShowInput,
  type ResourceRuntimeLogArchiveStore,
  type ResourceRuntimeLogContext,
  type ResourceRuntimeLogEvent,
  type ResourceRuntimeLogReader,
  type ResourceRuntimeLogRequest,
  type ResourceRuntimeLogStream,
  type ResourceSummary,
} from "../src/ports";
import {
  ArchiveResourceRuntimeLogsUseCase,
  ListResourceRuntimeLogArchivesQueryService,
  PruneResourceRuntimeLogArchivesUseCase,
  ResourceRuntimeLogsQueryService,
  ShowResourceRuntimeLogArchiveQueryService,
} from "../src/use-cases";

class FixedIdGenerator {
  next(prefix: string): string {
    return `${prefix}_000001`;
  }
}

class StaticResourceReadModel implements ResourceReadModel {
  async count(): Promise<number> {
    return 0;
  }

  constructor(private readonly resources: ResourceSummary[]) {}

  async list(): Promise<ResourceSummary[]> {
    return this.resources;
  }

  async findOne(): Promise<ResourceSummary | null> {
    return this.resources[0] ?? null;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  async count(): Promise<number> {
    return 0;
  }

  constructor(private readonly deployments: DeploymentSummary[]) {}

  async list(
    _context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
    },
  ): Promise<DeploymentSummary[]> {
    return this.deployments
      .filter((deployment) => (input?.projectId ? deployment.projectId === input.projectId : true))
      .filter((deployment) =>
        input?.resourceId ? deployment.resourceId === input.resourceId : true,
      );
  }

  async findLogs(): Promise<DeploymentLogSummary[]> {
    return [];
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return this.deployments[0] ?? null;
  }
}

class StaticRuntimeLogStream implements ResourceRuntimeLogStream {
  constructor(private readonly events: ResourceRuntimeLogEvent[]) {}

  async close(): Promise<void> {}

  async *[Symbol.asyncIterator](): AsyncIterator<ResourceRuntimeLogEvent> {
    for (const event of this.events) {
      yield event;
    }
  }
}

class StaticRuntimeLogReader implements ResourceRuntimeLogReader {
  constructor(private readonly stream: ResourceRuntimeLogStream) {}

  async open(
    _context: unknown,
    _logContext: ResourceRuntimeLogContext,
    _request: ResourceRuntimeLogRequest,
  ): Promise<Result<ResourceRuntimeLogStream>> {
    return ok(this.stream);
  }
}

class MemoryRuntimeLogArchiveStore implements ResourceRuntimeLogArchiveStore {
  readonly createInputs: ResourceRuntimeLogArchiveCreateInput[] = [];
  readonly pruneInputs: ResourceRuntimeLogArchivePruneInput[] = [];

  constructor(private readonly archives: ResourceRuntimeLogArchiveDetail[] = []) {}

  async create(
    _context: RepositoryContext,
    input: ResourceRuntimeLogArchiveCreateInput,
  ): Promise<Result<ResourceRuntimeLogArchiveDetail>> {
    this.createInputs.push(input);
    const archive: ResourceRuntimeLogArchiveDetail = {
      archiveId: input.archiveId,
      resourceId: input.resourceId,
      capturedAt: input.capturedAt,
      lineCount: input.lines.length,
      retentionStatus: "retained",
      lines: input.lines,
      ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
      ...(input.serverId ? { serverId: input.serverId } : {}),
      ...(input.serviceName ? { serviceName: input.serviceName } : {}),
      ...(input.runtimeKind ? { runtimeKind: input.runtimeKind } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    };
    this.archives.push(archive);
    return ok(archive);
  }

  async list(
    _context: RepositoryContext,
    input: ResourceRuntimeLogArchiveListInput,
  ): Promise<Result<ResourceRuntimeLogArchiveListPage>> {
    const items = this.archives
      .filter((archive) => (input.resourceId ? archive.resourceId === input.resourceId : true))
      .filter((archive) =>
        input.deploymentId ? archive.deploymentId === input.deploymentId : true,
      )
      .filter((archive) => (input.serverId ? archive.serverId === input.serverId : true))
      .filter((archive) => (input.serviceName ? archive.serviceName === input.serviceName : true))
      .slice(0, input.limit)
      .map(({ lines: _lines, ...summary }) => summary);
    return ok({ items });
  }

  async findOne(
    _context: RepositoryContext,
    input: ResourceRuntimeLogArchiveShowInput,
  ): Promise<Result<ResourceRuntimeLogArchiveDetail | null>> {
    return ok(this.archives.find((archive) => archive.archiveId === input.archiveId) ?? null);
  }

  async prune(
    _context: RepositoryContext,
    input: ResourceRuntimeLogArchivePruneInput,
  ): Promise<Result<ResourceRuntimeLogArchivePruneStoreResult>> {
    this.pruneInputs.push(input);
    const matched = this.archives.filter(
      (archive) =>
        archive.capturedAt < input.before &&
        (!input.resourceId || archive.resourceId === input.resourceId) &&
        (!input.deploymentId || archive.deploymentId === input.deploymentId) &&
        (!input.serverId || archive.serverId === input.serverId) &&
        (!input.serviceName || archive.serviceName === input.serviceName),
    );
    const affectedResourceCount = new Set(matched.map((archive) => archive.resourceId)).size;

    if (!input.dryRun) {
      for (const archive of matched) {
        const index = this.archives.findIndex(
          (candidate) => candidate.archiveId === archive.archiveId,
        );
        if (index >= 0) {
          this.archives.splice(index, 1);
        }
      }
    }

    return ok({
      matchedCount: matched.length,
      prunedCount: input.dryRun ? 0 : matched.length,
      affectedResourceCount,
    });
  }
}

function resourceSummary(overrides: Partial<ResourceSummary> = {}): ResourceSummary {
  return {
    id: "res_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    destinationId: "dst_demo",
    name: "Web",
    slug: "web",
    kind: "application",
    services: [{ name: "web", kind: "web" }],
    networkProfile: {
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
      targetServiceName: "web",
    },
    deploymentCount: 1,
    lastDeploymentId: "dep_web",
    lastDeploymentStatus: "succeeded",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentSummary(overrides: Partial<DeploymentSummary> = {}): DeploymentSummary {
  return {
    id: "dep_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    status: "succeeded",
    runtimePlan: {
      id: "rplan_demo",
      source: {
        kind: "local-folder",
        locator: ".",
        displayName: "workspace",
      },
      buildStrategy: "workspace-commands",
      packagingMode: "host-process-runtime",
      execution: {
        kind: "host-process",
        port: 3000,
        metadata: {
          logPath: "/tmp/appaloft-runtime.log",
        },
      },
      target: {
        kind: "single-server",
        providerKey: "local-shell",
        serverIds: ["srv_demo"],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["start process"],
    },
    environmentSnapshot: {
      id: "snap_demo",
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["defaults", "environment", "deployment"],
      variables: [
        {
          key: "TOKEN",
          value: "secret-token",
          kind: "secret",
          exposure: "runtime",
          scope: "environment",
          isSecret: true,
        },
      ],
    },
    logs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    finishedAt: "2026-01-01T00:00:02.000Z",
    logCount: 0,
    ...overrides,
    target: {
      kind: "server-backed",
      serverId: overrides.serverId ?? "srv_demo",
      destinationId: overrides.destinationId ?? "dst_demo",
    },
  };
}

function logLine(message: string): ResourceRuntimeLogEvent {
  return {
    kind: "line",
    line: {
      resourceId: "res_web",
      deploymentId: "dep_web",
      serviceName: "web",
      runtimeKind: "host-process",
      stream: "stdout",
      timestamp: "2026-01-01T00:00:03.000Z",
      sequence: 1,
      message,
      masked: false,
    },
  };
}

function logLineValue(message: string) {
  const event = logLine(message);
  if (event.kind !== "line") {
    throw new Error("Expected line event");
  }
  return event.line;
}

function createRuntimeLogsQueryService() {
  return new ResourceRuntimeLogsQueryService(
    new StaticResourceReadModel([resourceSummary()]),
    new StaticDeploymentReadModel([deploymentSummary()]),
    new StaticRuntimeLogReader(
      new StaticRuntimeLogStream([
        logLine("server started with TOKEN=secret-token"),
        { kind: "closed", reason: "source-ended" },
      ]),
    ),
  );
}

function archiveFixture(
  overrides: Partial<ResourceRuntimeLogArchiveDetail> = {},
): ResourceRuntimeLogArchiveDetail {
  return {
    archiveId: "rla_existing",
    resourceId: "res_web",
    deploymentId: "dep_web",
    serverId: "srv_demo",
    serviceName: "web",
    runtimeKind: "host-process",
    capturedAt: "2026-01-01T00:00:00.000Z",
    lineCount: 1,
    retentionStatus: "retained",
    lines: [logLineValue("redacted line")],
    ...overrides,
  };
}

describe("resource runtime log archives", () => {
  test("[RUNTIME-LOG-ARCHIVE-001] captures bounded redacted runtime log archive snapshots", async () => {
    const store = new MemoryRuntimeLogArchiveStore();
    const useCase = new ArchiveResourceRuntimeLogsUseCase(
      createRuntimeLogsQueryService(),
      store,
      new StaticDeploymentReadModel([deploymentSummary()]),
      new FixedIdGenerator(),
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const command = ArchiveResourceRuntimeLogsCommand.create({
      resourceId: "res_web",
      tailLines: 50,
      reason: "support review",
    })._unsafeUnwrap();

    const result = await useCase.execute(
      createExecutionContext({
        requestId: "req_runtime_log_archive_test",
        entrypoint: "system",
      }),
      command,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "resources.runtime-logs.archive/v1",
      archive: {
        archiveId: "rla_000001",
        resourceId: "res_web",
        deploymentId: "dep_web",
        serverId: "srv_demo",
        serviceName: "web",
        runtimeKind: "host-process",
        capturedAt: "2026-01-01T00:10:00.000Z",
        lineCount: 1,
        reason: "support review",
      },
    });
    expect(store.createInputs[0]?.lines[0]?.message).toContain("********");
    expect(store.createInputs[0]?.lines[0]?.message).not.toContain("secret-token");
    expect(store.createInputs[0]?.lines[0]?.masked).toBe(true);
  });

  test("[RUNTIME-LOG-ARCHIVE-002] lists and shows only safe archive metadata and redacted lines", async () => {
    const store = new MemoryRuntimeLogArchiveStore([
      archiveFixture({
        lines: [
          {
            ...logLineValue("token=********"),
            masked: true,
          },
        ],
      }),
    ]);
    const listService = new ListResourceRuntimeLogArchivesQueryService(
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const showService = new ShowResourceRuntimeLogArchiveQueryService(store);
    const context = createExecutionContext({
      requestId: "req_runtime_log_archive_read_test",
      entrypoint: "system",
    });

    const listResult = await listService.execute(
      context,
      ListResourceRuntimeLogArchivesQuery.create({ resourceId: "res_web" })._unsafeUnwrap(),
    );
    const showResult = await showService.execute(
      context,
      ShowResourceRuntimeLogArchiveQuery.create({ archiveId: "rla_existing" })._unsafeUnwrap(),
    );

    expect(listResult.isOk()).toBe(true);
    expect(listResult._unsafeUnwrap()).toEqual({
      schemaVersion: "resources.runtime-log-archives.list/v1",
      generatedAt: "2026-01-01T00:10:00.000Z",
      items: [
        {
          archiveId: "rla_existing",
          resourceId: "res_web",
          deploymentId: "dep_web",
          serverId: "srv_demo",
          serviceName: "web",
          runtimeKind: "host-process",
          capturedAt: "2026-01-01T00:00:00.000Z",
          lineCount: 1,
          retentionStatus: "retained",
        },
      ],
    });
    expect(showResult.isOk()).toBe(true);
    expect(showResult._unsafeUnwrap().archive.lines[0]?.message).toBe("token=********");
  });

  test("[RUNTIME-LOG-ARCHIVE-003] dry-runs runtime log archive prune by default", async () => {
    const store = new MemoryRuntimeLogArchiveStore([archiveFixture()]);
    const useCase = new PruneResourceRuntimeLogArchivesUseCase(
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const command = PruneResourceRuntimeLogArchivesCommand.create({
      before: "2026-01-01T00:05:00.000Z",
    })._unsafeUnwrap();

    const result = await useCase.execute(
      createExecutionContext({
        requestId: "req_runtime_log_archive_prune_dry_run_test",
        entrypoint: "system",
      }),
      command,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "resources.runtime-log-archives.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: true,
      matchedCount: 1,
      prunedCount: 0,
      affectedResourceCount: 1,
      prunedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(store.pruneInputs).toEqual([
      {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: true,
      },
    ]);
  });

  test("schema normalizes archive filters and rejects malformed prune cutoffs", () => {
    const validArchive = ArchiveResourceRuntimeLogsCommand.create({
      resourceId: " res_web ",
      deploymentId: " dep_web ",
      serviceName: " web ",
      tailLines: "50",
      reason: " support ",
    });
    const invalidPrune = PruneResourceRuntimeLogArchivesCommand.create({
      before: "not-a-date",
    });

    expect(validArchive.isOk()).toBe(true);
    expect(validArchive._unsafeUnwrap()).toMatchObject({
      resourceId: "res_web",
      deploymentId: "dep_web",
      serviceName: "web",
      tailLines: 50,
      reason: "support",
    });
    expect(invalidPrune.isErr()).toBe(true);
    expect(invalidPrune._unsafeUnwrapErr().code).toBe("validation_error");
  });
});

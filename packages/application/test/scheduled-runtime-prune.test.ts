import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetLifecycleStatusValue,
  DeploymentTargetName,
  domainError,
  err,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  type Result,
  TargetKindValue,
} from "@appaloft/core";
import { FixedClock, SequenceIdGenerator as TestSequenceIdGenerator } from "@appaloft/testkit";

import { type Command, type CommandBus } from "../src/cqrs";
import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { ConfigureScheduledRuntimePrunePolicyCommand } from "../src/operations/servers/configure-scheduled-runtime-prune-policy.command";
import { ConfigureScheduledRuntimePrunePolicyUseCase } from "../src/operations/servers/configure-scheduled-runtime-prune-policy.use-case";
import { ListScheduledRuntimePrunePoliciesQueryService } from "../src/operations/servers/list-scheduled-runtime-prune-policies.query-service";
import { PruneServerCapacityCommand } from "../src/operations/servers/prune-server-capacity.command";
import { PruneServerCapacityUseCase } from "../src/operations/servers/prune-server-capacity.use-case";
import {
  type ScheduledRuntimePrunePolicy,
  type ScheduledRuntimePrunePolicyListFilter,
  type ScheduledRuntimePrunePolicyRecord,
  type ScheduledRuntimePrunePolicyRepository,
  ScheduledRuntimePrunePolicyResolver,
  ScheduledRuntimePruneService,
} from "../src/operations/servers/scheduled-runtime-prune.service";
import { ShowScheduledRuntimePrunePolicyQueryService } from "../src/operations/servers/show-scheduled-runtime-prune-policy.query-service";
import {
  type AuditEventRecorder,
  type AuditEventRecordInput,
  type Clock,
  type IdGenerator,
  type ProcessAttemptClaimer,
  type ProcessAttemptClaimInput,
  type ProcessAttemptClaimResult,
  type ProcessAttemptCompleter,
  type ProcessAttemptCompletionInput,
  type ProcessAttemptCompletionResult,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  type RuntimeTargetCapacityPruneResult,
  type RuntimeTargetCapacityPruner,
  type ServerRepository,
} from "../src/ports";

class RecordingCommandBus implements Pick<CommandBus, "execute"> {
  readonly commands: Command<unknown>[] = [];

  constructor(
    private readonly result: Result<RuntimeTargetCapacityPruneResult> = ok(pruneResult()),
  ) {}

  async execute<TResult>(
    _context: Parameters<CommandBus["execute"]>[0],
    command: Command<TResult>,
  ): Promise<Result<TResult>> {
    this.commands.push(command as Command<unknown>);
    return this.result as Result<TResult>;
  }
}

class PruneServerCapacityUseCaseCommandBus implements Pick<CommandBus, "execute"> {
  readonly commands: Command<unknown>[] = [];

  constructor(private readonly useCase: PruneServerCapacityUseCase) {}

  async execute<TResult>(
    context: Parameters<CommandBus["execute"]>[0],
    command: Command<TResult>,
  ): Promise<Result<TResult>> {
    this.commands.push(command as Command<unknown>);
    if (!(command instanceof PruneServerCapacityCommand)) {
      return err(
        domainError.infra("Unsupported command in scheduled prune test bus", {
          command: command.constructor.name,
        }),
      );
    }
    return (await this.useCase.execute(context, command.input)) as Result<TResult>;
  }
}

class MemoryProcessAttemptRecorder implements ProcessAttemptRecorder {
  readonly attempts: ProcessAttemptRecord[] = [];

  async record(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.attempts.push(attempt);
    return ok(attempt);
  }
}

class RecordingProcessAttemptClaimer implements ProcessAttemptClaimer {
  readonly claims: ProcessAttemptClaimInput[] = [];

  async claimDue(
    _context: RepositoryContext,
    input: ProcessAttemptClaimInput,
  ): Promise<Result<ProcessAttemptClaimResult>> {
    this.claims.push(input);
    return ok({
      status: "claimed",
      attempt: {
        id: input.attemptId,
        kind: "runtime-maintenance",
        status: "running",
        operationKey: "servers.capacity.prune",
        updatedAt: input.claimedAt,
        nextActions: ["no-action"],
      },
    });
  }
}

class RecordingProcessAttemptCompleter implements ProcessAttemptCompleter {
  readonly completions: ProcessAttemptCompletionInput[] = [];

  async complete(
    _context: RepositoryContext,
    input: ProcessAttemptCompletionInput,
  ): Promise<Result<ProcessAttemptCompletionResult>> {
    this.completions.push(input);
    return ok({
      status: "completed",
      attempt: {
        id: input.attemptId,
        kind: "runtime-maintenance",
        status: input.status,
        operationKey: "servers.capacity.prune",
        updatedAt: input.completedAt,
        nextActions: input.nextActions,
      },
    });
  }
}

class SequenceIdGenerator implements IdGenerator {
  private count = 0;

  next(prefix: string): string {
    this.count += 1;
    return `${prefix}_${this.count}`;
  }
}

class SequenceClock implements Clock {
  private index = 0;

  constructor(private readonly values: string[]) {}

  now(): string {
    const value =
      this.values[Math.min(this.index, this.values.length - 1)] ?? "2026-01-15T00:00:00.000Z";
    this.index += 1;
    return value;
  }
}

class MemoryServerRepository implements ServerRepository {
  constructor(private readonly server: DeploymentTarget) {}

  async findOne(): Promise<DeploymentTarget | null> {
    return this.server;
  }

  async upsert(): Promise<void> {}
}

class FakeCapacityPruner implements RuntimeTargetCapacityPruner {
  async prune(
    _context: Parameters<RuntimeTargetCapacityPruner["prune"]>[0],
    input: Parameters<RuntimeTargetCapacityPruner["prune"]>[1],
  ): Promise<Result<RuntimeTargetCapacityPruneResult>> {
    return ok({
      schemaVersion: "servers.capacity.prune/v1",
      server: {
        id: input.server.id.value,
        name: input.server.name.value,
        host: input.server.host.value,
        port: input.server.port.value,
        providerKey: input.server.providerKey.value,
        targetKind: input.server.targetKind.value,
      },
      before: input.before,
      categories: input.categories,
      dryRun: input.dryRun,
      prunedAt: "2026-01-31T00:00:10.000Z",
      summary: {
        inspectedCount: 1,
        matchedCount: 1,
        prunedCount: input.dryRun ? 0 : 1,
        skippedCount: 0,
        excludedCount: 0,
        reclaimedBytes: input.dryRun ? 0 : 1024,
      },
      candidates: [
        {
          id: "candidate_1",
          category: input.categories[0] ?? "stopped-containers",
          target: "/var/lib/appaloft/runtime/ssh-deployments/dep_old",
          updatedAt: "2026-01-01T00:00:00.000Z",
          size: 1024,
          action: input.dryRun ? "matched" : "pruned",
        },
      ],
      warnings: [],
    });
  }
}

class MemoryAuditEventRecorder implements AuditEventRecorder {
  readonly records: AuditEventRecordInput[] = [];

  async record(_context: RepositoryContext, input: AuditEventRecordInput): Promise<Result<void>> {
    this.records.push(input);
    return ok(undefined);
  }
}

class MemoryScheduledRuntimePrunePolicyRepository implements ScheduledRuntimePrunePolicyRepository {
  readonly items = new Map<string, ScheduledRuntimePrunePolicyRecord>();

  async findOne(
    _context: RepositoryContext,
    policyId: string,
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord | null>> {
    return ok(this.items.get(policyId) ?? null);
  }

  async list(
    context: RepositoryContext,
    filter: ScheduledRuntimePrunePolicyListFilter = {},
  ): Promise<Result<ScheduledRuntimePrunePolicy[]>> {
    const records = await this.listRecords(context, {
      ...filter,
      enabledOnly: filter.enabledOnly ?? true,
    });
    if (records.isErr()) {
      return err(records.error);
    }

    return ok(
      records.value.map((record) => ({
        id: record.id,
        version: record.version,
        scope: record.scope,
        serverId: record.serverId,
        retentionDays: record.retentionDays,
        destructive: record.destructive,
        categories: record.categories,
        retryOnFailure: record.retryOnFailure,
      })),
    );
  }

  async listRecords(
    _context: RepositoryContext,
    filter: ScheduledRuntimePrunePolicyListFilter = {},
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord[]>> {
    return ok(
      Array.from(this.items.values()).filter((record) => {
        const matchesEnabled = filter.enabledOnly === true ? record.enabled : true;
        const matchesServer = filter.serverId
          ? record.serverId === filter.serverId || record.serverId === "*"
          : true;
        const matchesScope = filter.scopes ? filter.scopes.includes(record.scope) : true;
        return matchesEnabled && matchesServer && matchesScope;
      }),
    );
  }

  async upsert(
    _context: RepositoryContext,
    record: ScheduledRuntimePrunePolicyRecord,
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord>> {
    this.items.set(record.id, record);
    return ok(record);
  }
}

function pruneResult(
  overrides: Partial<RuntimeTargetCapacityPruneResult> = {},
): RuntimeTargetCapacityPruneResult {
  return {
    schemaVersion: "servers.capacity.prune/v1",
    server: {
      id: "srv_primary",
      name: "Primary",
      host: "203.0.113.10",
      port: 22,
      providerKey: "generic-ssh",
      targetKind: "single-server",
    },
    before: "2026-01-08T00:00:00.000Z",
    categories: ["stopped-containers", "preview-workspaces", "source-workspaces"],
    dryRun: true,
    prunedAt: "2026-01-15T00:00:10.000Z",
    summary: {
      inspectedCount: 3,
      matchedCount: 3,
      prunedCount: 0,
      skippedCount: 0,
      excludedCount: 0,
      reclaimedBytes: 0,
    },
    candidates: [],
    warnings: [],
    ...overrides,
  };
}

function deploymentTarget(): DeploymentTarget {
  return DeploymentTarget.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_primary"),
    name: DeploymentTargetName.rehydrate("Primary"),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.active(),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function createService(
  input: {
    commandBus?: Pick<CommandBus, "execute">;
    recorder?: ProcessAttemptRecorder;
    claimer?: ProcessAttemptClaimer;
    completer?: ProcessAttemptCompleter;
    clock?: Clock;
    idGenerator?: IdGenerator;
  } = {},
): ScheduledRuntimePruneService {
  return new ScheduledRuntimePruneService(
    input.commandBus ?? new RecordingCommandBus(),
    input.recorder ?? new MemoryProcessAttemptRecorder(),
    input.claimer ?? new RecordingProcessAttemptClaimer(),
    input.completer ?? new RecordingProcessAttemptCompleter(),
    input.idGenerator ?? new SequenceIdGenerator(),
    input.clock ?? new SequenceClock(["2026-01-15T00:00:00.000Z", "2026-01-15T00:00:10.000Z"]),
  );
}

describe("scheduled runtime prune", () => {
  test("[RT-CAP-SCHED-001] resolves runtime prune policy by precedence with safe readback", () => {
    const resolver = new ScheduledRuntimePrunePolicyResolver();

    const result = resolver.resolve({
      serverId: "srv_primary",
      policies: [
        {
          id: "rpp_defaults",
          version: "v1",
          scope: "defaults",
          serverId: "*",
          retentionDays: 90,
          destructive: true,
          categories: ["stopped-containers", "source-workspaces"],
        },
        {
          id: "rpp_project",
          version: "v3",
          scope: "project",
          serverId: "srv_primary",
          retentionDays: 30,
          categories: ["stopped-containers"],
        },
        {
          id: "rpp_environment",
          version: "v2",
          scope: "environment",
          serverId: "srv_primary",
          retentionDays: 7,
        },
        {
          id: "rpp_deployment_snapshot",
          version: "v1",
          scope: "deployment-snapshot",
          serverId: "srv_primary",
          retentionDays: 1,
          destructive: true,
          categories: ["unused-images"],
        },
        {
          id: "rpp_other_target",
          version: "v1",
          scope: "environment",
          serverId: "srv_other",
          retentionDays: 5,
          destructive: true,
        },
      ],
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "scheduled-runtime-prune.policy-resolution/v1",
      serverId: "srv_primary",
      precedence: [
        "defaults",
        "system",
        "organization",
        "project",
        "environment",
        "deployment-snapshot",
      ],
      candidates: [
        {
          id: "rpp_deployment_snapshot",
          version: "v1",
          scope: "deployment-snapshot",
          serverId: "srv_primary",
          retentionDays: 1,
          destructive: true,
          categories: ["unused-images"],
          categoryCount: 1,
        },
        {
          id: "rpp_environment",
          version: "v2",
          scope: "environment",
          serverId: "srv_primary",
          retentionDays: 7,
          destructive: false,
          categories: [],
          categoryCount: 0,
        },
        {
          id: "rpp_project",
          version: "v3",
          scope: "project",
          serverId: "srv_primary",
          retentionDays: 30,
          destructive: false,
          categories: ["stopped-containers"],
          categoryCount: 1,
        },
        {
          id: "rpp_defaults",
          version: "v1",
          scope: "defaults",
          serverId: "*",
          retentionDays: 90,
          destructive: true,
          categories: ["stopped-containers", "source-workspaces"],
          categoryCount: 2,
        },
      ],
      selectedPolicy: {
        id: "rpp_deployment_snapshot",
        version: "v1",
        scope: "deployment-snapshot",
        serverId: "srv_primary",
        retentionDays: 1,
        destructive: true,
        categories: ["unused-images"],
        categoryCount: 1,
      },
    });
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("secret");
  });

  test("[RT-CAP-SCHED-002] [PROC-DELIVERY-001] [PROC-DELIVERY-002] defaults scheduled prune to dry-run and records durable process state", async () => {
    const commandBus = new RecordingCommandBus();
    const recorder = new MemoryProcessAttemptRecorder();
    const claimer = new RecordingProcessAttemptClaimer();
    const completer = new RecordingProcessAttemptCompleter();
    const service = createService({ commandBus, recorder, claimer, completer });
    const context = createExecutionContext({
      requestId: "req_scheduled_runtime_prune_dry_run",
      entrypoint: "system",
    });

    const result = await service.run(context, {
      policy: {
        id: "rpp_default",
        version: "v1",
        scope: "system",
        serverId: "srv_primary",
        retentionDays: 7,
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "scheduled-runtime-prune.run/v1",
      processAttemptId: "wrk_1",
      serverId: "srv_primary",
      policyId: "rpp_default",
      policyScope: "system",
      before: "2026-01-08T00:00:00.000Z",
      dryRun: true,
    });
    expect(recorder.attempts).toEqual([
      expect.objectContaining({
        id: "wrk_1",
        kind: "runtime-maintenance",
        status: "pending",
        operationKey: "servers.capacity.prune",
        dedupeKey: "scheduled-runtime-prune:srv_primary:rpp_default:2026-01-15T00:00:00.000Z",
        serverId: "srv_primary",
        safeDetails: expect.objectContaining({
          policyId: "rpp_default",
          policyVersion: "v1",
          policyScope: "system",
          before: "2026-01-08T00:00:00.000Z",
          dryRun: true,
          categoryCount: 0,
        }),
      }),
    ]);
    expect(claimer.claims).toEqual([
      expect.objectContaining({
        attemptId: "wrk_1",
        workerId: "scheduled-runtime-prune-worker",
        claimedAt: "2026-01-15T00:00:00.000Z",
      }),
    ]);
    expect(commandBus.commands).toHaveLength(1);
    expect(commandBus.commands[0]).toBeInstanceOf(PruneServerCapacityCommand);
    expect((commandBus.commands[0] as PruneServerCapacityCommand).input).toMatchObject({
      serverId: "srv_primary",
      before: "2026-01-08T00:00:00.000Z",
      dryRun: true,
    });
    expect(completer.completions).toEqual([
      expect.objectContaining({
        attemptId: "wrk_1",
        status: "succeeded",
        phase: "scheduled-runtime-prune",
        step: "servers-capacity-prune",
        nextActions: ["no-action"],
      }),
    ]);
  });

  test("[RT-CAP-SCHED-003] policy-gated destructive scheduled prune dispatches existing command", async () => {
    const commandBus = new RecordingCommandBus(
      ok(
        pruneResult({
          dryRun: false,
          categories: ["stopped-containers"],
          summary: {
            inspectedCount: 1,
            matchedCount: 1,
            prunedCount: 1,
            skippedCount: 0,
            excludedCount: 0,
            reclaimedBytes: 1024,
          },
        }),
      ),
    );
    const completer = new RecordingProcessAttemptCompleter();
    const service = createService({ commandBus, completer });

    const result = await service.run(
      createExecutionContext({
        requestId: "req_scheduled_runtime_prune_destructive",
        entrypoint: "system",
      }),
      {
        policy: {
          id: "rpp_env",
          version: "v2",
          scope: "environment",
          serverId: "srv_primary",
          retentionDays: 30,
          destructive: true,
          categories: ["stopped-containers"],
        },
        scheduledAt: "2026-01-31T00:00:00.000Z",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      before: "2026-01-01T00:00:00.000Z",
      dryRun: false,
      prune: {
        summary: {
          prunedCount: 1,
          reclaimedBytes: 1024,
        },
      },
    });
    expect(commandBus.commands).toHaveLength(1);
    expect((commandBus.commands[0] as PruneServerCapacityCommand).input).toMatchObject({
      serverId: "srv_primary",
      before: "2026-01-01T00:00:00.000Z",
      dryRun: false,
      categories: ["stopped-containers"],
    });
    expect(completer.completions[0]).toMatchObject({
      status: "succeeded",
      safeDetails: {
        policyId: "rpp_env",
        policyVersion: "v2",
        policyScope: "environment",
        serverId: "srv_primary",
        before: "2026-01-01T00:00:00.000Z",
        dryRun: false,
        prunedCount: 1,
        reclaimedBytes: 1024,
        categoryCount: 1,
      },
    });
  });

  test("[RT-CAP-SCHED-008] preview-oriented scheduled policy can explicitly cover remote-state markers", async () => {
    const commandBus = new RecordingCommandBus(
      ok(
        pruneResult({
          dryRun: false,
          categories: [
            "stopped-containers",
            "preview-workspaces",
            "source-workspaces",
            "docker-build-cache",
            "unused-images",
            "remote-state-markers",
          ],
        }),
      ),
    );
    const service = createService({ commandBus });

    const result = await service.run(
      createExecutionContext({
        requestId: "req_scheduled_runtime_prune_preview_policy",
        entrypoint: "system",
      }),
      {
        policy: {
          id: "rpp_preview",
          version: "v1",
          scope: "project",
          serverId: "srv_primary",
          retentionDays: 7,
          destructive: true,
          categories: [
            "stopped-containers",
            "preview-workspaces",
            "source-workspaces",
            "docker-build-cache",
            "unused-images",
            "remote-state-markers",
          ],
        },
        scheduledAt: "2026-01-31T00:00:00.000Z",
      },
    );

    expect(result.isOk()).toBe(true);
    expect((commandBus.commands[0] as PruneServerCapacityCommand).input).toMatchObject({
      serverId: "srv_primary",
      dryRun: false,
      categories: [
        "stopped-containers",
        "preview-workspaces",
        "source-workspaces",
        "docker-build-cache",
        "unused-images",
        "remote-state-markers",
      ],
    });
  });

  test("[RT-CAP-SCHED-006] destructive scheduled prune reuses manual prune audit output", async () => {
    const auditRecorder = new MemoryAuditEventRecorder();
    const commandBus = new PruneServerCapacityUseCaseCommandBus(
      new PruneServerCapacityUseCase(
        new MemoryServerRepository(deploymentTarget()),
        new FakeCapacityPruner(),
        auditRecorder,
        new SequenceIdGenerator(),
        new SequenceClock(["2026-01-31T00:00:11.000Z"]),
      ),
    );
    const service = createService({
      commandBus,
      clock: new SequenceClock(["2026-01-31T00:00:00.000Z", "2026-01-31T00:00:12.000Z"]),
    });

    const result = await service.run(
      createExecutionContext({
        requestId: "req_scheduled_runtime_prune_audit",
        entrypoint: "system",
      }),
      {
        policy: {
          id: "rpp_audit",
          version: "v1",
          scope: "system",
          serverId: "srv_primary",
          retentionDays: 30,
          destructive: true,
          categories: ["stopped-containers"],
        },
        scheduledAt: "2026-01-31T00:00:00.000Z",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      dryRun: false,
      before: "2026-01-01T00:00:00.000Z",
      prune: {
        summary: {
          prunedCount: 1,
          reclaimedBytes: 1024,
        },
      },
    });
    expect(auditRecorder.records).toEqual([
      {
        id: "aud_1",
        aggregateId: "srv_primary",
        eventType: "server-capacity-pruned",
        payload: {
          operationKey: "servers.capacity.prune",
          serverId: "srv_primary",
          before: "2026-01-01T00:00:00.000Z",
          categories: ["stopped-containers"],
          inspectedCount: 1,
          matchedCount: 1,
          prunedCount: 1,
          skippedCount: 0,
          excludedCount: 0,
          reclaimedBytes: 1024,
          prunedAt: "2026-01-31T00:00:10.000Z",
        },
        createdAt: "2026-01-31T00:00:11.000Z",
      },
    ]);
  });

  test("[RT-CAP-SCHED-005] [PROC-DELIVERY-004] failed scheduled prune records retry-scheduled process state", async () => {
    const commandBus = new RecordingCommandBus(
      err(
        domainError.infra("Runtime target unavailable", {
          phase: "servers-capacity-prune",
        }),
      ),
    );
    const completer = new RecordingProcessAttemptCompleter();
    const service = createService({ commandBus, completer });

    const result = await service.run(
      createExecutionContext({
        requestId: "req_scheduled_runtime_prune_failure",
        entrypoint: "system",
      }),
      {
        policy: {
          id: "rpp_retry",
          version: "v1",
          scope: "project",
          serverId: "srv_primary",
          retentionDays: 3,
        },
        scheduledAt: "2026-01-15T00:00:00.000Z",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(completer.completions).toEqual([
      expect.objectContaining({
        attemptId: "wrk_1",
        status: "retry-scheduled",
        errorCode: "infra_error",
        errorCategory: "infra",
        retriable: true,
        nextEligibleAt: "2026-01-15T00:00:00.000Z",
        nextActions: ["retry", "manual-review"],
      }),
    ]);
  });

  test("[RT-CAP-SCHED-001] [RT-CAP-SCHED-007] configures and reads safe policy records", async () => {
    const repository = new MemoryScheduledRuntimePrunePolicyRepository();
    const context = createExecutionContext({
      requestId: "req_scheduled_runtime_prune_policy_configure",
      entrypoint: "system",
    });
    const configureUseCase = new ConfigureScheduledRuntimePrunePolicyUseCase(
      repository,
      new FixedClock("2026-01-15T00:00:00.000Z"),
      new TestSequenceIdGenerator(),
    );
    const listService = new ListScheduledRuntimePrunePoliciesQueryService(repository);
    const showService = new ShowScheduledRuntimePrunePolicyQueryService(repository);

    const first = await configureUseCase.execute(context, {
      scope: "project",
      version: "v1",
      serverId: "*",
      retentionDays: 14,
      destructive: true,
      categories: ["stopped-containers", "docker-build-cache"],
      retryOnFailure: false,
      enabled: true,
    });

    expect(first.isOk()).toBe(true);
    expect(first._unsafeUnwrap()).toEqual({ id: "rpp_0001" });
    expect(repository.items.get("rpp_0001")).toEqual({
      id: "rpp_0001",
      version: "v1",
      scope: "project",
      serverId: "*",
      retentionDays: 14,
      destructive: true,
      categories: ["stopped-containers", "docker-build-cache"],
      retryOnFailure: false,
      enabled: true,
      updatedAt: "2026-01-15T00:00:00.000Z",
    });

    const show = await showService.execute(context, { policyId: "rpp_0001" });
    expect(show.isOk()).toBe(true);
    expect(show._unsafeUnwrap()).toEqual({
      schemaVersion: "scheduled-runtime-prune-policies.show/v1",
      policy: {
        schemaVersion: "scheduled-runtime-prune-policies.policy/v1",
        id: "rpp_0001",
        version: "v1",
        scope: "project",
        serverId: "*",
        retentionDays: 14,
        destructive: true,
        categories: ["stopped-containers", "docker-build-cache"],
        categoryCount: 2,
        retryOnFailure: false,
        enabled: true,
        updatedAt: "2026-01-15T00:00:00.000Z",
      },
    });

    const missing = await showService.execute(context, { policyId: "rpp_missing" });
    expect(missing.isOk()).toBe(true);
    expect(missing._unsafeUnwrap()).toEqual({
      schemaVersion: "scheduled-runtime-prune-policies.show/v1",
      policy: null,
    });

    const list = await listService.execute(context);
    expect(list.isOk()).toBe(true);
    expect(list._unsafeUnwrap().items).toHaveLength(1);
    expect(JSON.stringify(list._unsafeUnwrap())).not.toContain("PRIVATE_KEY");
  });

  test("[RT-CAP-SCHED-001] [RT-CAP-SCHED-007] replaces existing policy ids and filters disabled policies", async () => {
    const repository = new MemoryScheduledRuntimePrunePolicyRepository();
    const context = createExecutionContext({
      requestId: "req_scheduled_runtime_prune_policy_update",
      entrypoint: "system",
    });
    const configureUseCase = new ConfigureScheduledRuntimePrunePolicyUseCase(
      repository,
      new FixedClock("2026-01-15T00:00:00.000Z"),
      new TestSequenceIdGenerator(),
    );
    const listService = new ListScheduledRuntimePrunePoliciesQueryService(repository);

    const first = await configureUseCase.execute(context, {
      policyId: "rpp_system",
      version: "v1",
      scope: "system",
      serverId: "srv_primary",
      retentionDays: 30,
      destructive: false,
      categories: ["stopped-containers"],
      retryOnFailure: true,
      enabled: false,
    });
    const second = await configureUseCase.execute(context, {
      policyId: "rpp_system",
      version: "v2",
      scope: "environment",
      serverId: "srv_primary",
      retentionDays: 7,
      destructive: false,
      categories: ["stopped-containers"],
      retryOnFailure: true,
      enabled: true,
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(repository.items.size).toBe(1);
    expect(repository.items.get("rpp_system")).toMatchObject({
      id: "rpp_system",
      version: "v2",
      scope: "environment",
      serverId: "srv_primary",
      retentionDays: 7,
      destructive: false,
      categories: ["stopped-containers"],
      retryOnFailure: true,
      enabled: true,
    });

    const disabled = await configureUseCase.execute(context, {
      policyId: "rpp_disabled",
      version: "v1",
      scope: "project",
      serverId: "srv_primary",
      retentionDays: 3,
      destructive: false,
      categories: ["stopped-containers"],
      retryOnFailure: true,
      enabled: false,
    });
    expect(disabled.isOk()).toBe(true);

    const all = await listService.execute(context, { serverId: "srv_primary" });
    const enabled = await listService.execute(context, {
      serverId: "srv_primary",
      enabledOnly: true,
    });

    expect(all.isOk()).toBe(true);
    expect(all._unsafeUnwrap().items.map((item) => item.id)).toEqual([
      "rpp_system",
      "rpp_disabled",
    ]);
    expect(enabled.isOk()).toBe(true);
    expect(enabled._unsafeUnwrap().items.map((item) => item.id)).toEqual(["rpp_system"]);
  });

  test("[RT-CAP-SCHED-007] validates scheduled runtime prune policy command input", () => {
    const command = ConfigureScheduledRuntimePrunePolicyCommand.create({
      scope: "system",
      retentionDays: 0,
      categories: ["stopped-containers"],
    });

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });
});

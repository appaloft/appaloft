import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  EnvironmentId,
  ProjectId,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceLifecycleStatusValue,
  ResourceName,
  ResourceSlug,
  type ScheduledTaskDefinition,
  type ScheduledTaskDefinitionMutationSpec,
  type ScheduledTaskDefinitionSelectionSpec,
  UpsertResourceSpec,
} from "@appaloft/core";
import { FixedClock, MemoryResourceRepository, SequenceIdGenerator } from "@appaloft/testkit";

import {
  createExecutionContext,
  type ExecutionContext,
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  type RepositoryContext,
  toRepositoryContext,
} from "../src";
import { type ScheduledTaskDefinitionRepository } from "../src/ports";
import { CreateScheduledTaskUseCase } from "../src/use-cases";

class RecordingScheduledTaskDefinitionRepository implements ScheduledTaskDefinitionRepository {
  readonly records: ScheduledTaskDefinition[] = [];
  readonly specs: ScheduledTaskDefinitionMutationSpec[] = [];

  async findOne(
    _context: RepositoryContext,
    spec: ScheduledTaskDefinitionSelectionSpec,
  ): Promise<ScheduledTaskDefinition | null> {
    return spec.accept({
      visitScheduledTaskDefinitionById: (selection) =>
        this.records.find((record) => record.id.equals(selection.taskId)) ?? null,
    });
  }

  async upsert(
    _context: RepositoryContext,
    task: ScheduledTaskDefinition,
    spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void> {
    this.records.push(task);
    this.specs.push(spec);
  }

  async delete(
    _context: RepositoryContext,
    _spec: ScheduledTaskDefinitionMutationSpec,
  ): Promise<void> {}
}

class DenyingOperationGuardPort implements OperationGuardPort {
  readonly requests: OperationCheckRequest[] = [];

  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    this.requests.push(request);
    return {
      allowed: false,
      checks: [
        {
          allowed: false,
          checkKey: "test.quota",
          kind: "quota",
          reason: "test-operation-denied",
        },
      ],
      deniedBy: {
        checkKey: "test.quota",
        kind: "quota",
      },
      reason: "test-operation-denied",
    };
  }
}

function resourceFixture(input?: { lifecycleStatus?: "active" | "archived" | "deleted" }) {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_api"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("API"),
    slug: ResourceSlug.rehydrate("api"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    lifecycleStatus: ResourceLifecycleStatusValue.rehydrate(input?.lifecycleStatus ?? "active"),
    createdAt: CreatedAt.rehydrate("2026-05-05T00:00:00.000Z"),
  });
}

async function createHarness(input?: { guard?: OperationGuardPort; resource?: Resource }) {
  const context = createExecutionContext({
    requestId: "req_scheduled_task_create_test",
    entrypoint: "system",
  });
  const resourceRepository = new MemoryResourceRepository();
  const resource = input?.resource ?? resourceFixture();
  await resourceRepository.upsert(
    toRepositoryContext(context),
    resource,
    UpsertResourceSpec.fromResource(resource),
  );
  const taskRepository = new RecordingScheduledTaskDefinitionRepository();

  return {
    context,
    taskRepository,
    useCase: new CreateScheduledTaskUseCase(
      taskRepository,
      resourceRepository,
      new SequenceIdGenerator(),
      new FixedClock("2026-05-05T00:20:00.000Z"),
      input?.guard,
    ),
  };
}

describe("CreateScheduledTaskUseCase", () => {
  test("[SCHED-TASK-CREATE-001] creates a Resource-owned task definition", async () => {
    const { context, taskRepository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_api",
      schedule: "0 1 * * *",
      timezone: "UTC",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      retryLimit: 2,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "scheduled-tasks.command/v1",
      task: {
        taskId: "tsk_0001",
        resourceId: "res_api",
        schedule: "0 1 * * *",
        timezone: "UTC",
        commandIntent: "bun run migrate",
        timeoutSeconds: 600,
        retryLimit: 2,
        concurrencyPolicy: "forbid",
        status: "enabled",
        createdAt: "2026-05-05T00:20:00.000Z",
      },
    });
    expect(taskRepository.records).toHaveLength(1);
    expect(taskRepository.records[0]?.belongsToResource(ResourceId.rehydrate("res_api"))).toBe(
      true,
    );
  });

  test("[SCHED-TASK-CREATE-002] rejects archived Resources before creating a task", async () => {
    const { context, taskRepository, useCase } = await createHarness({
      resource: resourceFixture({ lifecycleStatus: "archived" }),
    });

    const result = await useCase.execute(context, {
      resourceId: "res_api",
      schedule: "0 1 * * *",
      timezone: "UTC",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      retryLimit: 2,
    });

    expect(result.isErr()).toBe(true);
    expect(taskRepository.records).toHaveLength(0);

    if (result.isErr()) {
      expect(result.error.code).toBe("resource_archived");
      expect(result.error.details).toMatchObject({
        phase: "scheduled-task-create-admission",
        resourceId: "res_api",
        lifecycleStatus: "archived",
      });
    }
  });

  test("[SCHED-TASK-SECRET-001] rejects unsafe command intent before storing a task", async () => {
    const { context, taskRepository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_api",
      schedule: "0 1 * * *",
      timezone: "UTC",
      commandIntent: "TOKEN=secret bun run migrate",
      timeoutSeconds: 600,
      retryLimit: 2,
    });

    expect(result.isErr()).toBe(true);
    expect(taskRepository.records).toHaveLength(0);

    if (result.isErr()) {
      expect(result.error.code).toBe("validation_error");
      expect(result.error.details).toMatchObject({
        phase: "scheduled-task-definition-admission",
        field: "commandIntent",
      });
    }
  });

  test("[SCHED-TASK-CREATE-GUARD-001] create task can be denied by the generic operation guard", async () => {
    const guard = new DenyingOperationGuardPort();
    const { context, taskRepository, useCase } = await createHarness({ guard });

    const result = await useCase.execute(context, {
      resourceId: "res_api",
      schedule: "0 1 * * *",
      timezone: "UTC",
      commandIntent: "bun run migrate",
      timeoutSeconds: 600,
      retryLimit: 2,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "scheduled-tasks.create",
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_api",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "scheduled-tasks.create",
      resourceRefs: {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_api",
      },
    });
    expect(taskRepository.records).toHaveLength(0);
  });
});

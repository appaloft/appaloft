import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryProjectReadModel,
  MemoryProjectRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";
import { container } from "tsyringe";
import {
  CommandBus,
  CreateProjectCommand,
  CreateProjectUseCase,
  createExecutionContext,
  type OperationAuditRecordInput,
  type OperationAuditSink,
  operationAuditRecordFromCommand,
  PruneDeploymentsCommand,
  PruneStorageVolumeBackupCommand,
  tokens,
} from "../src";

class CapturingOperationAuditSink implements OperationAuditSink {
  readonly records: OperationAuditRecordInput[] = [];

  async recordOperation(
    _context: Parameters<OperationAuditSink["recordOperation"]>[0],
    input: OperationAuditRecordInput,
  ) {
    this.records.push(input);
    return ok(undefined);
  }
}

describe("operation audit pipeline", () => {
  test("[AUDIT-LIFECYCLE-PROJECT-001] command bus records project lifecycle audit intent", async () => {
    const child = container.createChildContainer();
    const projects = new MemoryProjectRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const auditSink = new CapturingOperationAuditSink();

    child.registerInstance(
      tokens.createProjectUseCase,
      new CreateProjectUseCase(
        projects,
        clock,
        idGenerator,
        eventBus,
        logger,
        undefined,
        new MemoryProjectReadModel(projects),
      ),
    );

    const context = createExecutionContext({
      requestId: "req_audit_project_create",
      entrypoint: "http",
      principal: {
        kind: "user",
        actorId: "usr_admin",
        userId: "usr_admin",
        email: "admin@example.com",
        activeOrganization: {
          organizationId: "org_business",
          role: "owner",
          productRole: "owner",
        },
      },
    });
    const command = CreateProjectCommand.create({
      name: "Audit Demo",
      description: "token=should-not-be-recorded",
    })._unsafeUnwrap();
    const bus = new CommandBus(child, logger, undefined, auditSink);

    const result = await bus.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(auditSink.records).toEqual([
      expect.objectContaining({
        operationKey: "projects.create",
        operationName: "CreateProjectCommand",
        domain: "projects",
        action: "create",
        result: "success",
        organizationId: "org_business",
        actor: expect.objectContaining({
          kind: "user",
          id: "usr_admin",
        }),
        primaryTarget: {
          resourceType: "project",
          resourceId: "prj_0001",
        },
      }),
    ]);
    expect(JSON.stringify(auditSink.records)).not.toContain("should-not-be-recorded");
  });

  test("[AUDIT-LIFECYCLE-QUERY-008] internal retention and cleanup commands are not lifecycle audit rows", () => {
    const context = createExecutionContext({
      requestId: "req_audit_prune",
      entrypoint: "system",
    });
    const deploymentPrune = PruneDeploymentsCommand.create({
      before: "2026-01-01T00:00:00.000Z",
      dryRun: true,
    })._unsafeUnwrap();
    const storageBackupPrune = PruneStorageVolumeBackupCommand.create({
      backupId: "bkp_123",
    })._unsafeUnwrap();

    expect(
      operationAuditRecordFromCommand({
        context,
        command: deploymentPrune,
        result: ok({
          schemaVersion: "deployments.prune/v1",
          before: "2026-01-01T00:00:00.000Z",
          dryRun: true,
          matchedCount: 0,
          prunedCount: 0,
          guardedCount: 0,
          affectedDeploymentIds: [],
          guardedDeploymentIds: [],
          prunedAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
    ).toBeNull();
    expect(
      operationAuditRecordFromCommand({
        context,
        command: storageBackupPrune,
        result: ok({
          schemaVersion: "storage-volume-backup.prune/v1",
          backupId: "bkp_123",
          prunedAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
    ).toBeNull();
  });
});

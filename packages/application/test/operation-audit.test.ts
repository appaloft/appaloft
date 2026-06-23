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
  type AuditEventRecorder,
  type AuditEventRecordInput,
  CommandBus,
  CreateDeploymentCommand,
  CreateDomainBindingCommand,
  CreateProjectCommand,
  CreateProjectUseCase,
  CreateResourceCommand,
  CreateSshCredentialCommand,
  CreateStorageVolumeCommand,
  createExecutionContext,
  DefaultOperationAuditSink,
  type OperationAuditRecordInput,
  type OperationAuditSink,
  operationAuditRecordFromCommand,
  ProvisionDependencyResourceCommand,
  PruneDeploymentsCommand,
  PruneStorageVolumeBackupCommand,
  PublishStaticArtifactCommand,
  RegisterServerCommand,
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

class CapturingAuditEventRecorder implements AuditEventRecorder {
  readonly records: AuditEventRecordInput[] = [];

  async record(
    _context: Parameters<AuditEventRecorder["record"]>[0],
    input: AuditEventRecordInput,
  ) {
    this.records.push(input);
    return ok(undefined);
  }
}

class FixedResultUseCase<TResult extends { id: string }> {
  readonly inputs: unknown[] = [];

  constructor(private readonly result: TResult) {}

  async execute(_context: unknown, input: unknown) {
    this.inputs.push(input);
    return ok(this.result);
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

  test("[AUDIT-LIFECYCLE-SMOKE-010] command bus records resource, deployment, and domain lifecycle operations through the shared audit sink", async () => {
    const child = container.createChildContainer();
    const logger = new NoopLogger();
    const auditSink = new CapturingOperationAuditSink();
    const resourceUseCase = new FixedResultUseCase({ id: "res_smoke" });
    const deploymentUseCase = new FixedResultUseCase({ id: "dep_smoke" });
    const domainBindingUseCase = new FixedResultUseCase({ id: "dom_smoke" });

    child.registerInstance(tokens.createResourceUseCase, resourceUseCase);
    child.registerInstance(tokens.createDeploymentUseCase, deploymentUseCase);
    child.registerInstance(tokens.createDomainBindingUseCase, domainBindingUseCase);

    const context = createExecutionContext({
      requestId: "req_audit_lifecycle_smoke",
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
    const bus = new CommandBus(child, logger, undefined, auditSink);

    const resourceResult = await bus.execute(
      context,
      CreateResourceCommand.create({
        projectId: "prj_smoke",
        environmentId: "env_smoke",
        destinationId: "dst_smoke",
        name: "Web",
        kind: "application",
      })._unsafeUnwrap(),
    );
    const deploymentResult = await bus.execute(
      context,
      CreateDeploymentCommand.create({
        projectId: "prj_smoke",
        environmentId: "env_smoke",
        resourceId: "res_smoke",
        serverId: "srv_smoke",
        destinationId: "dst_smoke",
      })._unsafeUnwrap(),
    );
    const domainBindingResult = await bus.execute(
      context,
      CreateDomainBindingCommand.create({
        projectId: "prj_smoke",
        environmentId: "env_smoke",
        resourceId: "res_smoke",
        serverId: "srv_smoke",
        destinationId: "dst_smoke",
        domainName: "app.example.com",
        pathPrefix: "/",
        proxyKind: "traefik",
      })._unsafeUnwrap(),
    );

    expect(resourceResult.isOk()).toBe(true);
    expect(deploymentResult.isOk()).toBe(true);
    expect(domainBindingResult.isOk()).toBe(true);
    expect(resourceUseCase.inputs).toHaveLength(1);
    expect(deploymentUseCase.inputs).toHaveLength(1);
    expect(domainBindingUseCase.inputs).toHaveLength(1);
    expect(auditSink.records).toEqual([
      expect.objectContaining({
        operationKey: "resources.create",
        operationName: "CreateResourceCommand",
        domain: "resources",
        action: "create",
        result: "success",
        organizationId: "org_business",
        primaryTarget: { resourceType: "resource", resourceId: "res_smoke" },
        relatedTargets: [
          { resourceType: "project", resourceId: "prj_smoke" },
          { resourceType: "environment", resourceId: "env_smoke" },
          { resourceType: "destination", resourceId: "dst_smoke" },
        ],
      }),
      expect.objectContaining({
        operationKey: "deployments.create",
        operationName: "CreateDeploymentCommand",
        domain: "deployments",
        action: "create",
        result: "success",
        organizationId: "org_business",
        primaryTarget: { resourceType: "deployment", resourceId: "dep_smoke" },
        relatedTargets: [
          { resourceType: "project", resourceId: "prj_smoke" },
          { resourceType: "environment", resourceId: "env_smoke" },
          { resourceType: "resource", resourceId: "res_smoke" },
          { resourceType: "server", resourceId: "srv_smoke" },
          { resourceType: "destination", resourceId: "dst_smoke" },
        ],
      }),
      expect.objectContaining({
        operationKey: "domain-bindings.create",
        operationName: "CreateDomainBindingCommand",
        domain: "domain-bindings",
        action: "create",
        result: "success",
        organizationId: "org_business",
        primaryTarget: { resourceType: "domain_binding", resourceId: "dom_smoke" },
        relatedTargets: [
          { resourceType: "project", resourceId: "prj_smoke" },
          { resourceType: "environment", resourceId: "env_smoke" },
          { resourceType: "resource", resourceId: "res_smoke" },
          { resourceType: "server", resourceId: "srv_smoke" },
          { resourceType: "destination", resourceId: "dst_smoke" },
        ],
      }),
    ]);
    for (const record of auditSink.records) {
      expect(record.actor).toEqual(
        expect.objectContaining({
          kind: "user",
          id: "usr_admin",
        }),
      );
    }
  });

  test("[AUDIT-LIFECYCLE-RESOURCE-002][AUDIT-LIFECYCLE-DEPLOYMENT-003][AUDIT-LIFECYCLE-DEPENDENCY-004][AUDIT-LIFECYCLE-DOMAIN-005][AUDIT-LIFECYCLE-SERVER-006][AUDIT-LIFECYCLE-STATIC-007] maps lifecycle commands to resource and related targets", () => {
    const context = createExecutionContext({
      requestId: "req_audit_lifecycle_matrix",
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

    const cases = [
      {
        command: CreateResourceCommand.create({
          projectId: "prj_1",
          environmentId: "env_1",
          destinationId: "dst_1",
          name: "Web",
          kind: "application",
        })._unsafeUnwrap(),
        result: ok({ id: "res_1" }),
        expected: {
          operationKey: "resources.create",
          domain: "resources",
          action: "create",
          primaryTarget: { resourceType: "resource", resourceId: "res_1" },
          relatedTargets: [
            { resourceType: "project", resourceId: "prj_1" },
            { resourceType: "environment", resourceId: "env_1" },
            { resourceType: "destination", resourceId: "dst_1" },
          ],
        },
      },
      {
        command: CreateDeploymentCommand.create({
          projectId: "prj_1",
          environmentId: "env_1",
          resourceId: "res_1",
          serverId: "srv_1",
          destinationId: "dst_1",
        })._unsafeUnwrap(),
        result: ok({ id: "dep_1" }),
        expected: {
          operationKey: "deployments.create",
          domain: "deployments",
          action: "create",
          primaryTarget: { resourceType: "deployment", resourceId: "dep_1" },
          relatedTargets: [
            { resourceType: "project", resourceId: "prj_1" },
            { resourceType: "environment", resourceId: "env_1" },
            { resourceType: "resource", resourceId: "res_1" },
            { resourceType: "server", resourceId: "srv_1" },
            { resourceType: "destination", resourceId: "dst_1" },
          ],
        },
      },
      {
        command: ProvisionDependencyResourceCommand.create({
          kind: "postgres",
          projectId: "prj_1",
          environmentId: "env_1",
          serverId: "srv_1",
          name: "Postgres",
          providerKey: "local-postgres",
        })._unsafeUnwrap(),
        result: ok({ id: "dep_res_1" }),
        expected: {
          operationKey: "dependency-resources.provision",
          domain: "dependency-resources",
          action: "provision",
          primaryTarget: { resourceType: "dependency_resource", resourceId: "dep_res_1" },
          relatedTargets: [
            { resourceType: "project", resourceId: "prj_1" },
            { resourceType: "environment", resourceId: "env_1" },
            { resourceType: "server", resourceId: "srv_1" },
          ],
        },
      },
      {
        command: CreateDomainBindingCommand.create({
          projectId: "prj_1",
          environmentId: "env_1",
          resourceId: "res_1",
          serverId: "srv_1",
          destinationId: "dst_1",
          domainName: "app.example.com",
          pathPrefix: "/",
          proxyKind: "traefik",
        })._unsafeUnwrap(),
        result: ok({ id: "dom_1" }),
        expected: {
          operationKey: "domain-bindings.create",
          domain: "domain-bindings",
          action: "create",
          primaryTarget: { resourceType: "domain_binding", resourceId: "dom_1" },
          relatedTargets: [
            { resourceType: "project", resourceId: "prj_1" },
            { resourceType: "environment", resourceId: "env_1" },
            { resourceType: "resource", resourceId: "res_1" },
            { resourceType: "server", resourceId: "srv_1" },
            { resourceType: "destination", resourceId: "dst_1" },
          ],
        },
      },
      {
        command: RegisterServerCommand.create({
          name: "Primary",
          host: "203.0.113.10",
          providerKey: "ssh",
          proxyKind: "traefik",
        })._unsafeUnwrap(),
        result: ok({ id: "srv_1" }),
        expected: {
          operationKey: "servers.register",
          domain: "servers",
          action: "register",
          primaryTarget: { resourceType: "server", resourceId: "srv_1" },
        },
      },
      {
        command: PublishStaticArtifactCommand.create({
          projectId: "prj_1",
          resourceId: "res_1",
          sourcePath: "/tmp/site",
          artifactId: "art_1",
          metadata: {
            token: "should-not-be-recorded",
          },
        })._unsafeUnwrap(),
        result: ok({
          publicationId: "pub_1",
          artifactId: "art_1",
          resourceId: "res_1",
        }),
        expected: {
          operationKey: "static-artifacts.publish",
          domain: "static-artifacts",
          action: "publish",
          primaryTarget: { resourceType: "static_artifact", resourceId: "art_1" },
          relatedTargets: [
            { resourceType: "project", resourceId: "prj_1" },
            { resourceType: "resource", resourceId: "res_1" },
            { resourceType: "static_artifact_publication", resourceId: "pub_1" },
          ],
        },
      },
      {
        command: CreateStorageVolumeCommand.create({
          projectId: "prj_1",
          environmentId: "env_1",
          name: "Uploads",
          kind: "named-volume",
        })._unsafeUnwrap(),
        result: ok({ id: "vol_1" }),
        expected: {
          operationKey: "storage-volumes.create",
          domain: "storage-volumes",
          action: "create",
          primaryTarget: { resourceType: "storage_volume", resourceId: "vol_1" },
          relatedTargets: [
            { resourceType: "project", resourceId: "prj_1" },
            { resourceType: "environment", resourceId: "env_1" },
          ],
        },
      },
      {
        command: CreateSshCredentialCommand.create({
          name: "Deploy key",
          kind: "ssh-private-key",
          username: "appaloft",
          privateKey: "private-key-material-should-not-be-recorded",
        })._unsafeUnwrap(),
        result: ok({ id: "cred_1" }),
        expected: {
          operationKey: "credentials.create-ssh",
          domain: "credentials",
          action: "create-ssh",
          primaryTarget: { resourceType: "ssh_credential", resourceId: "cred_1" },
        },
      },
    ];

    for (const item of cases) {
      expect(
        operationAuditRecordFromCommand({
          context,
          command: item.command,
          result: item.result,
        }),
      ).toEqual(
        expect.objectContaining({
          ...item.expected,
          result: "success",
          organizationId: "org_business",
          actor: expect.objectContaining({
            kind: "user",
            id: "usr_admin",
          }),
        }),
      );
    }

    const serializedCases = JSON.stringify(cases);
    expect(serializedCases).toContain("private-key-material-should-not-be-recorded");
    const serializedRecords = JSON.stringify(
      cases.map((item) =>
        operationAuditRecordFromCommand({ context, command: item.command, result: item.result }),
      ),
    );
    expect(serializedRecords).not.toContain("private-key-material-should-not-be-recorded");
    expect(serializedRecords).not.toContain("should-not-be-recorded");
  });

  test("[AUDIT-LIFECYCLE-REDACTION-009] default sink omits secret-like metadata from retained payload", async () => {
    const recorder = new CapturingAuditEventRecorder();
    const sink = new DefaultOperationAuditSink(
      recorder,
      new FixedClock("2026-01-01T00:00:00.000Z"),
      new SequenceIdGenerator(),
      new NoopLogger(),
    );
    const context = createExecutionContext({
      requestId: "req_audit_redaction",
      entrypoint: "http",
      tenant: {
        tenantId: "tenant_business",
        mode: "single-tenant",
        organizationId: "org_business",
      },
    });

    const result = await sink.recordOperation(context, {
      operationKey: "resources.set-variable",
      operationName: "SetResourceVariableCommand",
      domain: "resources",
      action: "set-variable",
      result: "success",
      organizationId: "org_business",
      primaryTarget: {
        resourceType: "resource",
        resourceId: "res_1",
      },
      metadata: {
        safeNote: "retained",
        token: "raw-token",
        privateKey: "raw-private-key",
        envValue: "DATABASE_URL=postgres://secret",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(recorder.records).toEqual([
      expect.objectContaining({
        id: "aud_0001",
        aggregateId: "res_1",
        eventType: "resources.set-variable",
        createdAt: "2026-01-01T00:00:00.000Z",
        payload: expect.objectContaining({
          schemaVersion: "operation-audit/v1",
          operationKey: "resources.set-variable",
          action: "set-variable",
          resourceType: "resource",
          resourceId: "res_1",
          safeNote: "retained",
        }),
      }),
    ]);
    expect(JSON.stringify(recorder.records)).not.toContain("raw-token");
    expect(JSON.stringify(recorder.records)).not.toContain("raw-private-key");
    expect(JSON.stringify(recorder.records)).not.toContain("DATABASE_URL");
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

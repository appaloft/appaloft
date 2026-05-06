import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { FixedClock } from "@appaloft/testkit";

import {
  ConfigurePreviewPolicyCommand,
  ConfigurePreviewPolicyCommandHandler,
  ConfigurePreviewPolicyUseCase,
  createExecutionContext,
  DeletePreviewEnvironmentCommand,
  ListPreviewEnvironmentsQuery,
  ListPreviewEnvironmentsQueryHandler,
  ListPreviewEnvironmentsQueryService,
  operationCatalog,
  type PreviewEnvironmentReadModel,
  type PreviewEnvironmentSummary,
  type PreviewPolicyReadModel,
  type PreviewPolicyRecord,
  type PreviewPolicyRepository,
  type PreviewPolicyScope,
  type PreviewPolicySummary,
  type RepositoryContext,
  ShowPreviewEnvironmentQuery,
  ShowPreviewEnvironmentQueryHandler,
  ShowPreviewEnvironmentQueryService,
  ShowPreviewPolicyQuery,
  ShowPreviewPolicyQueryHandler,
  ShowPreviewPolicyQueryService,
} from "../src";

class SequentialIdGenerator {
  private sequence = 0;

  next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }
}

class MemoryPreviewPolicyStore implements PreviewPolicyRepository, PreviewPolicyReadModel {
  private readonly records = new Map<string, PreviewPolicyRecord>();

  async findOne(
    _context: RepositoryContext,
    scope: PreviewPolicyScope,
  ): Promise<PreviewPolicyRecord | null> {
    return this.records.get(scopeKey(scope)) ?? null;
  }

  async upsert(
    _context: RepositoryContext,
    record: PreviewPolicyRecord,
  ): Promise<PreviewPolicyRecord> {
    this.records.set(scopeKey(record.scope), cloneRecord(record));
    return cloneRecord(record);
  }

  async findOneSummary(
    _context: RepositoryContext,
    scope: PreviewPolicyScope,
  ): Promise<PreviewPolicySummary> {
    const record = this.records.get(scopeKey(scope));
    if (!record) {
      return {
        scope,
        source: "default",
        settings: {
          sameRepositoryPreviews: true,
          forkPreviews: "disabled",
          secretBackedPreviews: true,
        },
      };
    }

    return {
      id: record.id,
      scope: record.scope,
      source: "configured",
      settings: { ...record.settings },
      updatedAt: record.updatedAt,
    };
  }
}

const previewEnvironmentSummary: PreviewEnvironmentSummary = {
  previewEnvironmentId: "prenv_1",
  projectId: "prj_preview",
  environmentId: "env_preview",
  resourceId: "res_preview_api",
  serverId: "srv_preview",
  destinationId: "dst_preview",
  source: {
    provider: "github",
    repositoryFullName: "appaloft/demo",
    headRepositoryFullName: "appaloft/demo",
    pullRequestNumber: 52,
    baseRef: "main",
    headSha: "abc1234",
    sourceBindingFingerprint: "srcfp_preview_surface",
  },
  status: "cleanup-requested",
  createdAt: "2026-05-06T06:00:00.000Z",
  updatedAt: "2026-05-06T06:05:00.000Z",
  expiresAt: "2026-05-07T06:00:00.000Z",
};

class MemoryPreviewEnvironmentReadModel implements PreviewEnvironmentReadModel {
  listInput: Parameters<PreviewEnvironmentReadModel["list"]>[1] | undefined;
  findOneInput: Parameters<PreviewEnvironmentReadModel["findOne"]>[1] | undefined;

  async list(
    _context: RepositoryContext,
    input?: Parameters<PreviewEnvironmentReadModel["list"]>[1],
  ): Promise<{ items: PreviewEnvironmentSummary[]; nextCursor?: string }> {
    this.listInput = input;
    return { items: [previewEnvironmentSummary], nextCursor: "2026-05-06T06:05:00.000Z" };
  }

  async findOne(
    _context: RepositoryContext,
    input: Parameters<PreviewEnvironmentReadModel["findOne"]>[1],
  ): Promise<PreviewEnvironmentSummary | null> {
    this.findOneInput = input;
    return previewEnvironmentSummary;
  }
}

function scopeKey(scope: PreviewPolicyScope): string {
  return scope.kind === "project"
    ? `project:${scope.projectId}`
    : `resource:${scope.projectId}:${scope.resourceId}`;
}

function cloneRecord(record: PreviewPolicyRecord): PreviewPolicyRecord {
  return {
    ...record,
    scope: { ...record.scope },
    settings: { ...record.settings },
  };
}

function contextFixture() {
  return createExecutionContext({
    requestId: "req_preview_policy_operations_test",
    entrypoint: "system",
  });
}

describe("preview policy operations", () => {
  test("[PG-PREVIEW-SURFACE-001] configure/show preview policy uses shared schemas and read model", async () => {
    const store = new MemoryPreviewPolicyStore();
    const clock = new FixedClock("2026-05-06T02:00:00.000Z");
    const configureHandler = new ConfigurePreviewPolicyCommandHandler(
      new ConfigurePreviewPolicyUseCase(store, clock, new SequentialIdGenerator()),
    );
    const showHandler = new ShowPreviewPolicyQueryHandler(
      new ShowPreviewPolicyQueryService(store, clock),
    );
    const context = contextFixture();
    const command = ConfigurePreviewPolicyCommand.create({
      scope: {
        kind: "resource",
        projectId: "prj_preview",
        resourceId: "res_preview_api",
      },
      policy: {
        sameRepositoryPreviews: true,
        forkPreviews: "without-secrets",
        secretBackedPreviews: false,
      },
      idempotencyKey: "idem_preview_policy_1",
    })._unsafeUnwrap();

    const configured = await configureHandler.handle(context, command);
    const shown = await showHandler.handle(
      context,
      ShowPreviewPolicyQuery.create({
        scope: {
          kind: "resource",
          projectId: "prj_preview",
          resourceId: "res_preview_api",
        },
      })._unsafeUnwrap(),
    );

    expect(configured.isOk()).toBe(true);
    expect(configured._unsafeUnwrap()).toEqual({ id: "pvp_1" });
    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap()).toEqual({
      schemaVersion: "preview-policies.show/v1",
      generatedAt: "2026-05-06T02:00:00.000Z",
      policy: {
        id: "pvp_1",
        scope: {
          kind: "resource",
          projectId: "prj_preview",
          resourceId: "res_preview_api",
        },
        source: "configured",
        settings: {
          sameRepositoryPreviews: true,
          forkPreviews: "without-secrets",
          secretBackedPreviews: false,
        },
        updatedAt: "2026-05-06T02:00:00.000Z",
      },
    });
  });

  test("[PG-PREVIEW-SURFACE-001] preview policy catalog entries are inactive transports", () => {
    const configure = operationCatalog.find((entry) => entry.key === "preview-policies.configure");
    const show = operationCatalog.find((entry) => entry.key === "preview-policies.show");

    expect(configure).toMatchObject({
      kind: "command",
      domain: "preview-policies",
      messageName: "ConfigurePreviewPolicyCommand",
      handlerName: "ConfigurePreviewPolicyCommandHandler",
      serviceName: "ConfigurePreviewPolicyUseCase",
      transports: {},
    });
    expect(show).toMatchObject({
      kind: "query",
      domain: "preview-policies",
      messageName: "ShowPreviewPolicyQuery",
      handlerName: "ShowPreviewPolicyQueryHandler",
      serviceName: "ShowPreviewPolicyQueryService",
      transports: {},
    });
  });

  test("[PG-PREVIEW-SURFACE-001] preview environment list/show/delete uses normalized contracts", async () => {
    const readModel = new MemoryPreviewEnvironmentReadModel();
    const clock = new FixedClock("2026-05-06T06:10:00.000Z");
    const listHandler = new ListPreviewEnvironmentsQueryHandler(
      new ListPreviewEnvironmentsQueryService(readModel, clock),
    );
    const showHandler = new ShowPreviewEnvironmentQueryHandler(
      new ShowPreviewEnvironmentQueryService(readModel, clock),
    );
    const context = contextFixture();

    const listed = await listHandler.handle(
      context,
      ListPreviewEnvironmentsQuery.create({
        projectId: "prj_preview",
        status: "cleanup-requested",
        limit: 25,
      })._unsafeUnwrap(),
    );
    const shown = await showHandler.handle(
      context,
      ShowPreviewEnvironmentQuery.create({
        previewEnvironmentId: "prenv_1",
        resourceId: "res_preview_api",
      })._unsafeUnwrap(),
    );
    const deleteCommand = DeletePreviewEnvironmentCommand.create({
      previewEnvironmentId: "prenv_1",
      resourceId: "res_preview_api",
    })._unsafeUnwrap();

    expect(listed.isOk()).toBe(true);
    expect(listed._unsafeUnwrap()).toEqual({
      schemaVersion: "preview-environments.list/v1",
      items: [previewEnvironmentSummary],
      nextCursor: "2026-05-06T06:05:00.000Z",
      generatedAt: "2026-05-06T06:10:00.000Z",
    });
    expect(readModel.listInput).toEqual({
      projectId: "prj_preview",
      status: "cleanup-requested",
      limit: 25,
    });
    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap()).toEqual({
      schemaVersion: "preview-environments.show/v1",
      previewEnvironment: previewEnvironmentSummary,
      generatedAt: "2026-05-06T06:10:00.000Z",
    });
    expect(readModel.findOneInput).toEqual({
      previewEnvironmentId: "prenv_1",
      resourceId: "res_preview_api",
    });
    expect(deleteCommand.previewEnvironmentId).toBe("prenv_1");
    expect(deleteCommand.resourceId).toBe("res_preview_api");
    expect(JSON.stringify(listed._unsafeUnwrap())).not.toContain("secret");
    expect(JSON.stringify(shown._unsafeUnwrap())).not.toContain("token");
  });

  test("[PG-PREVIEW-SURFACE-001] preview environment catalog entries are inactive transports", () => {
    const list = operationCatalog.find((entry) => entry.key === "preview-environments.list");
    const show = operationCatalog.find((entry) => entry.key === "preview-environments.show");
    const remove = operationCatalog.find((entry) => entry.key === "preview-environments.delete");

    expect(list).toMatchObject({
      kind: "query",
      domain: "preview-environments",
      messageName: "ListPreviewEnvironmentsQuery",
      handlerName: "ListPreviewEnvironmentsQueryHandler",
      serviceName: "ListPreviewEnvironmentsQueryService",
      transports: {},
    });
    expect(show).toMatchObject({
      kind: "query",
      domain: "preview-environments",
      messageName: "ShowPreviewEnvironmentQuery",
      handlerName: "ShowPreviewEnvironmentQueryHandler",
      serviceName: "ShowPreviewEnvironmentQueryService",
      transports: {},
    });
    expect(remove).toMatchObject({
      kind: "command",
      domain: "preview-environments",
      messageName: "DeletePreviewEnvironmentCommand",
      handlerName: "DeletePreviewEnvironmentCommandHandler",
      serviceName: "PreviewEnvironmentCleanupService",
      transports: {},
    });
  });
});

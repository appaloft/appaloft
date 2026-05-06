import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { FixedClock } from "@appaloft/testkit";

import {
  ConfigurePreviewPolicyCommand,
  ConfigurePreviewPolicyCommandHandler,
  ConfigurePreviewPolicyUseCase,
  createExecutionContext,
  operationCatalog,
  type PreviewPolicyReadModel,
  type PreviewPolicyRecord,
  type PreviewPolicyRepository,
  type PreviewPolicyScope,
  type PreviewPolicySummary,
  type RepositoryContext,
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
});

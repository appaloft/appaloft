import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  createExecutionContext,
  DefaultTenantContextResolver,
  DefaultUsageIntentPort,
  ListUsageIntentRecordsQuery,
  ListUsageIntentRecordsQueryService,
  RecordUsageIntentCommand,
  RecordUsageIntentUseCase,
} from "../src";

describe("neutral usage intent extension", () => {
  test("[CLOUD-METER-PUBLIC-002] default usage intent port accepts without side effects", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_usage_intent_default",
      tenant: {
        tenantId: "tenant_local",
        organizationId: "org_local",
      },
    });

    const result = await new DefaultUsageIntentPort().recordUsageIntent(context, {
      idempotencyKey: "usage-intent-public-1",
      capabilityKey: "runtime.local-development",
      source: "application-test",
    });

    expect(result).toEqual({
      idempotencyKey: "usage-intent-public-1",
      capabilityKey: "runtime.local-development",
      accepted: true,
      duplicate: false,
      status: "accepted",
      reason: "usage-intent-default-noop",
      source: "default",
      details: {
        capabilityKey: "runtime.local-development",
        source: "application-test",
        organizationId: "org_local",
        tenantId: "tenant_local",
      },
    });
    await expect(new DefaultUsageIntentPort().listUsageIntentRecords()).resolves.toEqual([]);
  });

  test("[CLOUD-METER-PUBLIC-002] record use case resolves tenant context before recording", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_usage_intent_use_case",
    });
    const command = RecordUsageIntentCommand.create({
      idempotencyKey: "usage-intent-public-2",
      capabilityKey: "static-artifacts.publish",
      source: "api-harness",
    })._unsafeUnwrap();
    const useCase = new RecordUsageIntentUseCase(new DefaultUsageIntentPort(), {
      resolveTenantContext: async () => ({
        tenantId: "tenant_query",
        organizationId: "org_query",
        source: "test",
      }),
    });

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().result).toEqual(
      expect.objectContaining({
        capabilityKey: "static-artifacts.publish",
        accepted: true,
        reason: "usage-intent-default-noop",
        details: expect.objectContaining({
          organizationId: "org_query",
          tenantId: "tenant_query",
        }),
      }),
    );
  });

  test("[CLOUD-METER-QUERY-008] readback query uses the neutral port", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_usage_intent_list",
    });
    const query = ListUsageIntentRecordsQuery.create({ tenantId: "tenant_query" })._unsafeUnwrap();
    const service = new ListUsageIntentRecordsQueryService(
      {
        recordUsageIntent: new DefaultUsageIntentPort().recordUsageIntent.bind(
          new DefaultUsageIntentPort(),
        ),
        listUsageIntentRecords: async (_context, input) => [
          {
            schemaVersion: "usage-intent.record/v1",
            id: "usage_record_1",
            idempotencyKey: "usage-intent-public-3",
            capabilityKey: "runtime.local-development",
            status: "accepted",
            reason: "test-record",
            source: "test",
            tenantId: input?.tenantId,
            occurredAt: "2026-05-20T00:00:00.000Z",
            recordedAt: "2026-05-20T00:00:01.000Z",
          },
        ],
      },
      new DefaultTenantContextResolver(),
    );

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().records).toEqual([
      expect.objectContaining({
        schemaVersion: "usage-intent.record/v1",
        id: "usage_record_1",
        tenantId: "tenant_query",
      }),
    ]);
  });
});

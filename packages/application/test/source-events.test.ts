import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type RepositoryContext,
  type SourceEventListInput,
  type SourceEventListPage,
  type SourceEventReadModel,
  type SourceEventRecord,
  type SourceEventRecorder,
  type SourceEventShowInput,
} from "@appaloft/application";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext } from "../src";
import { IngestSourceEventUseCase } from "../src/operations/source-events/ingest-source-event.use-case";
import { ListSourceEventsQuery } from "../src/operations/source-events/list-source-events.query";
import { ListSourceEventsQueryService } from "../src/operations/source-events/list-source-events.query-service";
import { ShowSourceEventQuery } from "../src/operations/source-events/show-source-event.query";
import { ShowSourceEventQueryService } from "../src/operations/source-events/show-source-event.query-service";

class SequentialIdGenerator {
  private sequence = 0;

  next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }
}

class MemorySourceEventStore implements SourceEventRecorder, SourceEventReadModel {
  readonly records: SourceEventRecord[] = [];

  async findByDedupeKey(
    _context: RepositoryContext,
    dedupeKey: string,
  ): Promise<SourceEventRecord | null> {
    return this.records.find((record) => record.dedupeKey === dedupeKey) ?? null;
  }

  async record(_context: RepositoryContext, record: SourceEventRecord): Promise<SourceEventRecord> {
    const existing = this.records.find((stored) => stored.dedupeKey === record.dedupeKey);
    if (existing) {
      return existing;
    }

    this.records.push(cloneRecord(record));
    return cloneRecord(record);
  }

  async list(
    _context: RepositoryContext,
    input: SourceEventListInput,
  ): Promise<SourceEventListPage> {
    const limit = input.limit ?? 50;
    return {
      items: this.records
        .filter((record) => !input.projectId || record.projectId === input.projectId)
        .filter(
          (record) => !input.resourceId || record.matchedResourceIds.includes(input.resourceId),
        )
        .filter((record) => !input.status || record.status === input.status)
        .filter((record) => !input.sourceKind || record.sourceKind === input.sourceKind)
        .slice(0, limit)
        .map((record) => ({
          sourceEventId: record.sourceEventId,
          ...(record.projectId ? { projectId: record.projectId } : {}),
          resourceIds: [...record.matchedResourceIds],
          sourceKind: record.sourceKind,
          eventKind: record.eventKind,
          ref: record.ref,
          revision: record.revision,
          status: record.status,
          dedupeStatus: record.dedupeStatus,
          ignoredReasons: [...record.ignoredReasons],
          createdDeploymentIds: [...record.createdDeploymentIds],
          receivedAt: record.receivedAt,
        })),
    };
  }

  async findOne(
    _context: RepositoryContext,
    input: SourceEventShowInput,
  ): Promise<SourceEventRecord | null> {
    return (
      this.records.find(
        (record) =>
          record.sourceEventId === input.sourceEventId &&
          (!input.projectId || record.projectId === input.projectId) &&
          (!input.resourceId || record.matchedResourceIds.includes(input.resourceId)),
      ) ?? null
    );
  }
}

function cloneRecord(record: SourceEventRecord): SourceEventRecord {
  return {
    ...record,
    sourceIdentity: { ...record.sourceIdentity },
    verification: { ...record.verification },
    matchedResourceIds: [...record.matchedResourceIds],
    ignoredReasons: [...record.ignoredReasons],
    policyResults: record.policyResults.map((result) => ({ ...result })),
    createdDeploymentIds: [...record.createdDeploymentIds],
  };
}

function sourceEventRecordFixture(): SourceEventRecord {
  return {
    sourceEventId: "sevt_demo",
    projectId: "prj_demo",
    matchedResourceIds: ["res_web"],
    sourceKind: "github",
    eventKind: "push",
    sourceIdentity: {
      locator: "https://github.com/appaloft/demo",
      providerRepositoryId: "repo_1",
      repositoryFullName: "appaloft/demo",
    },
    ref: "main",
    revision: "abc123",
    deliveryId: "delivery_1",
    dedupeKey: "delivery:github:repo_1:appaloft/demo:https://github.com/appaloft/demo:delivery_1",
    dedupeStatus: "new",
    verification: {
      status: "verified",
      method: "provider-signature",
    },
    status: "dispatched",
    ignoredReasons: [],
    policyResults: [
      {
        resourceId: "res_web",
        status: "dispatched",
        deploymentId: "dep_1",
      },
    ],
    createdDeploymentIds: ["dep_1"],
    receivedAt: "2026-01-01T00:00:10.000Z",
  };
}

function createHarness() {
  const context = createExecutionContext({
    requestId: "req_source_events_test",
    entrypoint: "system",
  });
  const sourceEvents = new MemorySourceEventStore();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");

  return {
    context,
    sourceEvents,
    ingest: new IngestSourceEventUseCase(sourceEvents, clock, new SequentialIdGenerator()),
    list: new ListSourceEventsQueryService(sourceEvents, clock),
    show: new ShowSourceEventQueryService(sourceEvents),
  };
}

describe("source event application baseline", () => {
  test("[SRC-AUTO-EVENT-002] dedupes repeated source event deliveries", async () => {
    const { context, ingest, sourceEvents } = createHarness();

    const input = {
      sourceKind: "github" as const,
      eventKind: "push" as const,
      sourceIdentity: {
        locator: "https://token:secret@github.com/appaloft/demo",
        providerRepositoryId: "repo_1",
        repositoryFullName: "appaloft/demo",
      },
      ref: "main",
      revision: "abc123",
      deliveryId: "delivery_1",
      verification: {
        status: "verified" as const,
        method: "provider-signature" as const,
      },
    };

    const first = await ingest.execute(context, input);
    const second = await ingest.execute(context, input);

    expect(first.isOk()).toBe(true);
    expect(first._unsafeUnwrap()).toMatchObject({
      sourceEventId: "sevt_1",
      status: "accepted",
    });
    expect(second.isOk()).toBe(true);
    expect(second._unsafeUnwrap()).toMatchObject({
      sourceEventId: "sevt_1",
      status: "deduped",
      dedupeOfSourceEventId: "sevt_1",
    });
    expect(sourceEvents.records).toHaveLength(1);
    expect(sourceEvents.records[0]?.sourceIdentity.locator).toBe(
      "https://github.com/appaloft/demo",
    );
  });

  test("[SRC-AUTO-QUERY-001] lists source events by Resource scope", async () => {
    const { context, list, sourceEvents } = createHarness();
    sourceEvents.records.push(sourceEventRecordFixture());

    const query = ListSourceEventsQuery.create({ resourceId: "res_web" })._unsafeUnwrap();
    const result = await list.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      generatedAt: "2026-01-01T00:00:10.000Z",
      items: [
        {
          sourceEventId: "sevt_demo",
          projectId: "prj_demo",
          resourceIds: ["res_web"],
          status: "dispatched",
          createdDeploymentIds: ["dep_1"],
        },
      ],
    });
  });

  test("[SRC-AUTO-QUERY-002] shows one source event with safe policy result details", async () => {
    const { context, show, sourceEvents } = createHarness();
    sourceEvents.records.push(sourceEventRecordFixture());

    const query = ShowSourceEventQuery.create({
      sourceEventId: "sevt_demo",
      resourceId: "res_web",
    })._unsafeUnwrap();
    const result = await show.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      sourceEventId: "sevt_demo",
      projectId: "prj_demo",
      matchedResourceIds: ["res_web"],
      sourceIdentity: {
        locator: "https://github.com/appaloft/demo",
      },
      policyResults: [
        {
          resourceId: "res_web",
          status: "dispatched",
          deploymentId: "dep_1",
        },
      ],
    });
  });

  test("source event queries require bounded project or Resource scope", async () => {
    const { context, list, show } = createHarness();

    const listResult = await list.execute(context, ListSourceEventsQuery.create()._unsafeUnwrap());
    const showResult = await show.execute(
      context,
      ShowSourceEventQuery.create({ sourceEventId: "sevt_missing" })._unsafeUnwrap(),
    );

    expect(listResult.isErr()).toBe(true);
    expect(listResult._unsafeUnwrapErr().code).toBe("source_event_scope_required");
    expect(showResult.isErr()).toBe(true);
    expect(showResult._unsafeUnwrapErr().code).toBe("source_event_scope_required");
  });
});

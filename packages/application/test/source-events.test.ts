import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type RepositoryContext,
  type SourceEventDeploymentDispatcher,
  type SourceEventDeploymentDispatchInput,
  type SourceEventListInput,
  type SourceEventListPage,
  type SourceEventOutcomeUpdate,
  type SourceEventPolicyCandidate,
  type SourceEventPolicyReader,
  type SourceEventReadModel,
  type SourceEventRecord,
  type SourceEventRecorder,
  type SourceEventShowInput,
} from "@appaloft/application";
import { ok } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext } from "../src";
import { CreateDeploymentSourceEventDispatcher } from "../src/operations/source-events/create-deployment-source-event-dispatcher";
import { GenericSignedSourceEventVerifier } from "../src/operations/source-events/generic-signed-source-event-verifier";
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

  async updateOutcome(
    _context: RepositoryContext,
    input: SourceEventOutcomeUpdate,
  ): Promise<SourceEventRecord> {
    const record = this.records.find((stored) => stored.sourceEventId === input.sourceEventId);
    if (!record) {
      throw new Error(`Source event ${input.sourceEventId} was not found`);
    }

    const { projectId: _currentProjectId, ...recordWithoutProject } = record;
    const updated: SourceEventRecord = {
      ...recordWithoutProject,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      status: input.status,
      matchedResourceIds: [...input.matchedResourceIds],
      ignoredReasons: [...input.ignoredReasons],
      policyResults: input.policyResults.map((result) => ({ ...result })),
      createdDeploymentIds: [...input.createdDeploymentIds],
    };
    const index = this.records.indexOf(record);
    this.records[index] = updated;
    return cloneRecord(updated);
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

class MemorySourceEventPolicyReader implements SourceEventPolicyReader {
  constructor(private readonly candidates: SourceEventPolicyCandidate[]) {}

  async listCandidates(
    _context: RepositoryContext,
    input: Parameters<SourceEventPolicyReader["listCandidates"]>[1],
  ): Promise<SourceEventPolicyCandidate[]> {
    return this.candidates
      .filter(
        (candidate) =>
          candidate.sourceBinding.locator === input.sourceIdentity.locator ||
          (candidate.sourceBinding.providerRepositoryId &&
            candidate.sourceBinding.providerRepositoryId ===
              input.sourceIdentity.providerRepositoryId) ||
          (candidate.sourceBinding.repositoryFullName &&
            candidate.sourceBinding.repositoryFullName === input.sourceIdentity.repositoryFullName),
      )
      .map((candidate) => ({
        ...candidate,
        refs: [...candidate.refs],
        eventKinds: [...candidate.eventKinds],
        sourceBinding: { ...candidate.sourceBinding },
      }));
  }
}

class MemorySourceEventDeploymentDispatcher implements SourceEventDeploymentDispatcher {
  readonly inputs: SourceEventDeploymentDispatchInput[] = [];

  constructor(private readonly deploymentIds: string[] = ["dep_1"]) {}

  async dispatch(
    _context: Parameters<SourceEventDeploymentDispatcher["dispatch"]>[0],
    input: SourceEventDeploymentDispatchInput,
  ): ReturnType<SourceEventDeploymentDispatcher["dispatch"]> {
    this.inputs.push({ ...input });
    return ok({ deploymentId: this.deploymentIds.shift() ?? "dep_fallback" });
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

function createHarness(
  options: {
    policyCandidates?: SourceEventPolicyCandidate[];
    deploymentDispatcher?: SourceEventDeploymentDispatcher;
  } = {},
) {
  const context = createExecutionContext({
    requestId: "req_source_events_test",
    entrypoint: "system",
  });
  const sourceEvents = new MemorySourceEventStore();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");
  const policyReader = options.policyCandidates
    ? new MemorySourceEventPolicyReader(options.policyCandidates)
    : undefined;

  return {
    context,
    sourceEvents,
    ingest: new IngestSourceEventUseCase(
      sourceEvents,
      clock,
      new SequentialIdGenerator(),
      policyReader,
      options.deploymentDispatcher,
    ),
    list: new ListSourceEventsQueryService(sourceEvents, clock),
    show: new ShowSourceEventQueryService(sourceEvents),
  };
}

async function hmacSha256Hex(secretValue: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretValue),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("source event application baseline", () => {
  test("[SRC-AUTO-EVENT-004] rejects invalid generic signed source event signatures", async () => {
    const { context } = createHarness();
    const verifier = new GenericSignedSourceEventVerifier();

    const result = await verifier.verify(context, {
      sourceKind: "generic-signed",
      eventKind: "push",
      sourceIdentity: {
        locator: "https://github.com/appaloft/demo",
      },
      ref: "main",
      revision: "abc123",
      rawBody: '{"ref":"main","revision":"abc123"}',
      signature: "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      secretValue: "correct-secret",
      method: "generic-hmac",
      idempotencyKey: "generic_delivery_1",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "source_event_signature_invalid",
      details: {
        phase: "source-event-verification",
        sourceKind: "generic-signed",
        eventKind: "push",
        idempotencyKey: "generic_delivery_1",
      },
    });
  });

  test("verifies generic signed source event facts for ingest", async () => {
    const { context } = createHarness();
    const verifier = new GenericSignedSourceEventVerifier();
    const rawBody = '{"ref":"main","revision":"abc123"}';
    const signature = await hmacSha256Hex("correct-secret", rawBody);

    const result = await verifier.verify(context, {
      sourceKind: "generic-signed",
      eventKind: "push",
      sourceIdentity: {
        locator: "https://github.com/appaloft/demo",
      },
      ref: "main",
      revision: "abc123",
      rawBody,
      signature: `sha256=${signature}`,
      secretValue: "correct-secret",
      method: "generic-hmac",
      idempotencyKey: "generic_delivery_1",
      keyVersion: "v1",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      sourceKind: "generic-signed",
      eventKind: "push",
      ref: "main",
      revision: "abc123",
      verification: {
        status: "verified",
        method: "generic-hmac",
        keyVersion: "v1",
      },
    });
  });

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

  test("[SRC-AUTO-EVENT-001] dispatches matching source events through deployment admission", async () => {
    const deploymentDispatcher = new MemorySourceEventDeploymentDispatcher(["dep_1"]);
    const { context, ingest, sourceEvents } = createHarness({
      deploymentDispatcher,
      policyCandidates: [
        {
          projectId: "prj_demo",
          environmentId: "env_prod",
          resourceId: "res_web",
          serverId: "srv_prod",
          destinationId: "dst_prod",
          status: "enabled",
          refs: ["main"],
          eventKinds: ["push"],
          sourceBinding: {
            locator: "https://github.com/appaloft/demo",
            providerRepositoryId: "repo_1",
            repositoryFullName: "appaloft/demo",
          },
        },
      ],
    });

    const result = await ingest.execute(context, {
      sourceKind: "github",
      eventKind: "push",
      sourceIdentity: {
        locator: "https://github.com/appaloft/demo",
        providerRepositoryId: "repo_1",
        repositoryFullName: "appaloft/demo",
      },
      ref: "main",
      revision: "abc123",
      deliveryId: "delivery_matching_push",
      verification: {
        status: "verified",
        method: "provider-signature",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      sourceEventId: "sevt_1",
      status: "dispatched",
      matchedResourceIds: ["res_web"],
      createdDeploymentIds: ["dep_1"],
      ignoredReasons: [],
    });
    expect(deploymentDispatcher.inputs).toEqual([
      {
        sourceEventId: "sevt_1",
        projectId: "prj_demo",
        environmentId: "env_prod",
        resourceId: "res_web",
        serverId: "srv_prod",
        destinationId: "dst_prod",
      },
    ]);
    expect(sourceEvents.records[0]).toMatchObject({
      sourceEventId: "sevt_1",
      projectId: "prj_demo",
      status: "dispatched",
      matchedResourceIds: ["res_web"],
      createdDeploymentIds: ["dep_1"],
      policyResults: [
        {
          resourceId: "res_web",
          status: "dispatched",
          deploymentId: "dep_1",
        },
      ],
    });
  });

  test("[SRC-AUTO-EVENT-006] limits Resource-scoped generic signed events to route Resource", async () => {
    const deploymentDispatcher = new MemorySourceEventDeploymentDispatcher(["dep_web"]);
    const { context, ingest, sourceEvents } = createHarness({
      deploymentDispatcher,
      policyCandidates: [
        {
          projectId: "prj_demo",
          environmentId: "env_prod",
          resourceId: "res_web",
          serverId: "srv_prod",
          destinationId: "dst_prod",
          status: "enabled",
          refs: ["main"],
          eventKinds: ["push"],
          sourceBinding: {
            locator: "https://github.com/appaloft/demo",
            repositoryFullName: "appaloft/demo",
          },
        },
        {
          projectId: "prj_demo",
          environmentId: "env_prod",
          resourceId: "res_worker",
          serverId: "srv_prod",
          destinationId: "dst_prod",
          status: "enabled",
          refs: ["main"],
          eventKinds: ["push"],
          sourceBinding: {
            locator: "https://github.com/appaloft/demo",
            repositoryFullName: "appaloft/demo",
          },
        },
      ],
    });

    const result = await ingest.execute(context, {
      sourceKind: "generic-signed",
      eventKind: "push",
      scopeResourceId: "res_web",
      sourceIdentity: {
        locator: "https://github.com/appaloft/demo",
        repositoryFullName: "appaloft/demo",
      },
      ref: "main",
      revision: "abc123",
      deliveryId: "delivery_scoped_generic",
      verification: {
        status: "verified",
        method: "generic-hmac",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      sourceEventId: "sevt_1",
      status: "dispatched",
      matchedResourceIds: ["res_web"],
      createdDeploymentIds: ["dep_web"],
    });
    expect(deploymentDispatcher.inputs.map((input) => input.resourceId)).toEqual(["res_web"]);
    expect(sourceEvents.records[0]).toMatchObject({
      dedupeKey:
        "delivery:resource:res_web:generic-signed::appaloft/demo:https://github.com/appaloft/demo:delivery_scoped_generic",
      policyResults: [
        {
          resourceId: "res_web",
          status: "dispatched",
          deploymentId: "dep_web",
        },
      ],
    });
  });

  test("source event deployment dispatcher reuses create deployment admission input", async () => {
    const calls: unknown[] = [];
    const dispatcher = new CreateDeploymentSourceEventDispatcher({
      async execute(_context, input) {
        calls.push(input);
        return ok({ id: "dep_admission" });
      },
    });
    const { context } = createHarness();

    const result = await dispatcher.dispatch(context, {
      sourceEventId: "sevt_1",
      projectId: "prj_demo",
      environmentId: "env_prod",
      resourceId: "res_web",
      serverId: "srv_prod",
      destinationId: "dst_prod",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ deploymentId: "dep_admission" });
    expect(calls).toEqual([
      {
        projectId: "prj_demo",
        environmentId: "env_prod",
        resourceId: "res_web",
        serverId: "srv_prod",
        destinationId: "dst_prod",
      },
    ]);
  });

  test("[SRC-AUTO-EVENT-003] ignores source events whose ref does not match Resource policy", async () => {
    const { context, ingest, sourceEvents } = createHarness({
      policyCandidates: [
        {
          projectId: "prj_demo",
          environmentId: "env_prod",
          resourceId: "res_web",
          status: "enabled",
          refs: ["main"],
          eventKinds: ["push"],
          sourceBinding: {
            locator: "https://github.com/appaloft/demo",
            providerRepositoryId: "repo_1",
            repositoryFullName: "appaloft/demo",
          },
        },
      ],
    });

    const result = await ingest.execute(context, {
      sourceKind: "github",
      eventKind: "push",
      sourceIdentity: {
        locator: "https://github.com/appaloft/demo",
        providerRepositoryId: "repo_1",
        repositoryFullName: "appaloft/demo",
      },
      ref: "feature/skip",
      revision: "abc123",
      deliveryId: "delivery_ref_skip",
      verification: {
        status: "verified",
        method: "provider-signature",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      sourceEventId: "sevt_1",
      status: "ignored",
      matchedResourceIds: [],
      createdDeploymentIds: [],
      ignoredReasons: ["ref-not-matched"],
    });
    expect(sourceEvents.records[0]).toMatchObject({
      sourceEventId: "sevt_1",
      projectId: "prj_demo",
      status: "ignored",
      matchedResourceIds: [],
      ignoredReasons: ["ref-not-matched"],
      policyResults: [
        {
          resourceId: "res_web",
          status: "ignored",
          reason: "ref-not-matched",
        },
      ],
    });
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

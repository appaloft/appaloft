import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { createDomainEvent, ok } from "@appaloft/core";
import { FixedClock, NoopLogger, SequenceIdGenerator } from "@appaloft/testkit";
import {
  type AuditEventRecorder,
  type AuditEventRecordInput,
  createExecutionContext,
  OperationAuditDomainEventProjector,
} from "../src";

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

describe("operation audit domain event projector", () => {
  test("[AUDIT-LIFECYCLE-DEPLOYMENT-002] records deployment lifecycle facts without raw secret metadata", async () => {
    const recorder = new CapturingAuditEventRecorder();
    const projector = new OperationAuditDomainEventProjector(
      recorder,
      new FixedClock("2026-01-01T00:00:00.000Z"),
      new SequenceIdGenerator(),
      new NoopLogger(),
    );
    const context = createExecutionContext({
      requestId: "req_deployment_audit",
      entrypoint: "system",
      principal: {
        kind: "system",
        actorId: "deployment-worker",
      },
      tenant: {
        tenantId: "tenant_business",
        mode: "single-tenant",
        organizationId: "org_business",
      },
    });
    const event = createDomainEvent("deployment-succeeded", "dep_123", "2026-01-01T01:02:03.000Z", {
      organizationId: "org_business",
      projectId: "prj_123",
      environmentId: "env_123",
      resourceId: "res_123",
      serverId: "srv_123",
      token: "raw-token-should-not-appear",
      env: "DATABASE_URL=postgres://secret",
      privateKey: "private-key-material",
    });

    const result = await projector.handle(context, event);

    expect(result.isOk()).toBe(true);
    expect(recorder.records).toEqual([
      {
        id: "aud_0001",
        aggregateId: "dep_123",
        eventType: "deployment-succeeded",
        createdAt: "2026-01-01T01:02:03.000Z",
        payload: {
          schemaVersion: "domain-lifecycle-audit/v1",
          domainEventType: "deployment-succeeded",
          action: "deployment-succeeded",
          result: "success",
          organizationId: "org_business",
          actorKind: "system",
          actorId: "deployment-worker",
          actorLabel: null,
          resourceType: "deployment",
          resourceId: "dep_123",
          projectId: "prj_123",
          relatedResourceIds: [
            "project:prj_123",
            "environment:env_123",
            "resource:res_123",
            "server:srv_123",
          ],
          requestId: "req_deployment_audit",
          entrypoint: "system",
          tenantId: "tenant_business",
          tenantMode: "single-tenant",
        },
      },
    ]);
    expect(JSON.stringify(recorder.records)).not.toContain("raw-token-should-not-appear");
    expect(JSON.stringify(recorder.records)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(recorder.records)).not.toContain("private-key-material");
  });
});

import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import { createExecutionContext, type RepositoryContext } from "../src";
import { ResourceAccessFailureEvidenceLookupQuery } from "../src/messages";
import {
  type AndResourceAccessFailureEvidenceSelectionSpec,
  type ResourceAccessFailureDiagnostic,
  type ResourceAccessFailureEvidenceByHostnameSpec,
  type ResourceAccessFailureEvidenceByPathSpec,
  type ResourceAccessFailureEvidenceByRequestIdSpec,
  type ResourceAccessFailureEvidenceByResourceIdSpec,
  type ResourceAccessFailureEvidenceReadModel,
  type ResourceAccessFailureEvidenceRecord,
  type ResourceAccessFailureEvidenceSelectionSpec,
  type ResourceAccessFailureEvidenceSelectionSpecVisitor,
  type ResourceAccessFailureEvidenceUnexpiredAtSpec,
} from "../src/ports";
import { ResourceAccessFailureEvidenceLookupQueryService } from "../src/use-cases";

class FixedClock {
  now(): string {
    return "2026-01-01T00:00:10.000Z";
  }
}

const diagnostic: ResourceAccessFailureDiagnostic = {
  schemaVersion: "resource-access-failure/v1",
  requestId: "req_access_timeout",
  generatedAt: "2026-01-01T00:00:08.000Z",
  code: "resource_access_upstream_timeout",
  category: "timeout",
  phase: "upstream-connection",
  httpStatus: 504,
  retriable: true,
  ownerHint: "resource",
  nextAction: "check-health",
  affected: {
    url: "https://web.example.test/private",
    hostname: "web.example.test",
    path: "/private",
    method: "GET",
  },
  route: {
    resourceId: "res_web",
    deploymentId: "dep_web",
    domainBindingId: "dbnd_web",
    serverId: "srv_web",
    destinationId: "dst_web",
    providerKey: "traefik",
    routeId: "route_web",
    routeSource: "generated-default",
    routeStatus: "ready",
  },
  causeCode: "resource_public_access_probe_failed",
};

class RetainedEvidenceSelectionVisitor
  implements ResourceAccessFailureEvidenceSelectionSpecVisitor<boolean>
{
  constructor(private readonly record: ResourceAccessFailureEvidenceRecord) {}

  visitResourceAccessFailureEvidenceByRequestId(
    matched: boolean,
    spec: ResourceAccessFailureEvidenceByRequestIdSpec,
  ): boolean {
    return matched && this.record.requestId === spec.requestId;
  }

  visitResourceAccessFailureEvidenceByResourceId(
    matched: boolean,
    spec: ResourceAccessFailureEvidenceByResourceIdSpec,
  ): boolean {
    return matched && this.record.diagnostic.route?.resourceId === spec.resourceId;
  }

  visitResourceAccessFailureEvidenceByHostname(
    matched: boolean,
    spec: ResourceAccessFailureEvidenceByHostnameSpec,
  ): boolean {
    return matched && this.record.diagnostic.affected?.hostname === spec.hostname;
  }

  visitResourceAccessFailureEvidenceByPath(
    matched: boolean,
    spec: ResourceAccessFailureEvidenceByPathSpec,
  ): boolean {
    return matched && this.record.diagnostic.affected?.path === spec.path;
  }

  visitResourceAccessFailureEvidenceUnexpiredAt(
    matched: boolean,
    spec: ResourceAccessFailureEvidenceUnexpiredAtSpec,
  ): boolean {
    return matched && spec.at < this.record.expiresAt;
  }

  visitAndResourceAccessFailureEvidenceSelectionSpec(
    matched: boolean,
    spec: AndResourceAccessFailureEvidenceSelectionSpec,
  ): boolean {
    return spec.right.accept(spec.left.accept(matched, this), this);
  }
}

class StaticEvidenceReadModel implements ResourceAccessFailureEvidenceReadModel {
  constructor(private readonly retainedRecord: ResourceAccessFailureEvidenceRecord | null) {}

  async findOne(
    _context: RepositoryContext,
    spec: ResourceAccessFailureEvidenceSelectionSpec,
  ): Promise<Result<ResourceAccessFailureEvidenceRecord | null>> {
    if (!this.retainedRecord) {
      return ok(null);
    }

    return ok(
      spec.accept(true, new RetainedEvidenceSelectionVisitor(this.retainedRecord))
        ? this.retainedRecord
        : null,
    );
  }
}

function createService(record: ResourceAccessFailureEvidenceRecord | null) {
  return new ResourceAccessFailureEvidenceLookupQueryService(
    new StaticEvidenceReadModel(record),
    new FixedClock(),
  );
}

describe("resource access failure evidence lookup", () => {
  test("[RES-ACCESS-DIAG-EVIDENCE-001] returns retained evidence by request id", async () => {
    const service = createService({
      requestId: "req_access_timeout",
      diagnostic,
      capturedAt: "2026-01-01T00:00:08.000Z",
      expiresAt: "2026-01-01T00:10:08.000Z",
    });
    const query = ResourceAccessFailureEvidenceLookupQuery.create({
      requestId: "req_access_timeout",
    })._unsafeUnwrap();

    const result = await service.execute(createExecutionContext({ entrypoint: "cli" }), query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "resources.access-failure-evidence.lookup/v1",
      requestId: "req_access_timeout",
      status: "found",
      matchedSource: "short-retention-evidence-read-model",
      nextAction: "check-health",
      capturedAt: "2026-01-01T00:00:08.000Z",
      expiresAt: "2026-01-01T00:10:08.000Z",
      evidence: {
        requestId: "req_access_timeout",
        code: "resource_access_upstream_timeout",
      },
      relatedIds: {
        resourceId: "res_web",
        deploymentId: "dep_web",
        domainBindingId: "dbnd_web",
      },
    });
  });

  test("[RES-ACCESS-DIAG-EVIDENCE-002] returns safe not-found copy when filters mismatch", async () => {
    const service = createService({
      requestId: "req_access_timeout",
      diagnostic,
      capturedAt: "2026-01-01T00:00:08.000Z",
      expiresAt: "2026-01-01T00:10:08.000Z",
    });
    const query = ResourceAccessFailureEvidenceLookupQuery.create({
      requestId: "req_access_timeout",
      resourceId: "res_other",
      hostname: "other.example.test",
    })._unsafeUnwrap();

    const result = await service.execute(createExecutionContext({ entrypoint: "cli" }), query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      requestId: "req_access_timeout",
      status: "not-found",
      nextAction: "diagnostic-summary",
      filters: {
        resourceId: "res_other",
        hostname: "other.example.test",
      },
      notFound: {
        code: "resource_access_failure_evidence_not_found",
        phase: "evidence-lookup",
      },
    });
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("res_web");
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("dep_web");
  });
});

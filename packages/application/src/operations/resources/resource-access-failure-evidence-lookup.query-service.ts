import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  ResourceAccessFailureEvidenceByHostnameSpec,
  ResourceAccessFailureEvidenceByPathSpec,
  ResourceAccessFailureEvidenceByRequestIdSpec,
  ResourceAccessFailureEvidenceByResourceIdSpec,
  type ResourceAccessFailureEvidenceLookup,
  type ResourceAccessFailureEvidenceLookupFilters,
  type ResourceAccessFailureEvidenceReadModel,
  type ResourceAccessFailureEvidenceRecord,
  type ResourceAccessFailureEvidenceRelatedIds,
  type ResourceAccessFailureEvidenceSelectionSpec,
  ResourceAccessFailureEvidenceUnexpiredAtSpec,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ResourceAccessFailureEvidenceLookupQuery } from "./resource-access-failure-evidence-lookup.query";

function filtersFromQuery(
  query: ResourceAccessFailureEvidenceLookupQuery,
): ResourceAccessFailureEvidenceLookupFilters | undefined {
  const filters: ResourceAccessFailureEvidenceLookupFilters = {
    ...(query.resourceId ? { resourceId: query.resourceId } : {}),
    ...(query.hostname ? { hostname: query.hostname } : {}),
    ...(query.path ? { path: query.path } : {}),
  };

  return Object.keys(filters).length > 0 ? filters : undefined;
}

function relatedIdsFromRecord(
  record: ResourceAccessFailureEvidenceRecord,
): ResourceAccessFailureEvidenceRelatedIds | undefined {
  const route = record.diagnostic.route;
  const relatedIds: ResourceAccessFailureEvidenceRelatedIds = {
    ...(route?.resourceId ? { resourceId: route.resourceId } : {}),
    ...(route?.deploymentId ? { deploymentId: route.deploymentId } : {}),
    ...(route?.domainBindingId ? { domainBindingId: route.domainBindingId } : {}),
    ...(route?.serverId ? { serverId: route.serverId } : {}),
    ...(route?.destinationId ? { destinationId: route.destinationId } : {}),
    ...(route?.routeId ? { routeId: route.routeId } : {}),
  };

  return Object.keys(relatedIds).length > 0 ? relatedIds : undefined;
}

function selectionSpecFromQuery(
  query: ResourceAccessFailureEvidenceLookupQuery,
  generatedAt: string,
): ResourceAccessFailureEvidenceSelectionSpec {
  let spec = ResourceAccessFailureEvidenceByRequestIdSpec.create(query.requestId).and(
    ResourceAccessFailureEvidenceUnexpiredAtSpec.create(generatedAt),
  );

  if (query.resourceId) {
    spec = spec.and(ResourceAccessFailureEvidenceByResourceIdSpec.create(query.resourceId));
  }

  if (query.hostname) {
    spec = spec.and(ResourceAccessFailureEvidenceByHostnameSpec.create(query.hostname));
  }

  if (query.path) {
    spec = spec.and(ResourceAccessFailureEvidenceByPathSpec.create(query.path));
  }

  return spec;
}

function notFoundLookup(input: {
  query: ResourceAccessFailureEvidenceLookupQuery;
  generatedAt: string;
  filters?: ResourceAccessFailureEvidenceLookupFilters;
}): ResourceAccessFailureEvidenceLookup {
  return {
    schemaVersion: "resources.access-failure-evidence.lookup/v1",
    requestId: input.query.requestId,
    status: "not-found",
    generatedAt: input.generatedAt,
    ...(input.filters ? { filters: input.filters } : {}),
    nextAction: "diagnostic-summary",
    notFound: {
      code: "resource_access_failure_evidence_not_found",
      phase: "evidence-lookup",
      message: "No retained access failure evidence matched the request id.",
    },
  };
}

@injectable()
export class ResourceAccessFailureEvidenceLookupQueryService {
  constructor(
    @inject(tokens.resourceAccessFailureEvidenceReadModel)
    private readonly evidenceReadModel: ResourceAccessFailureEvidenceReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ResourceAccessFailureEvidenceLookupQuery,
  ): Promise<Result<ResourceAccessFailureEvidenceLookup>> {
    const generatedAt = this.clock.now();
    const filters = filtersFromQuery(query);
    const spec = selectionSpecFromQuery(query, generatedAt);
    const recordResult = await this.evidenceReadModel.findOne(toRepositoryContext(context), spec);

    if (recordResult.isErr()) {
      return err(recordResult.error);
    }

    const record = recordResult.value;
    if (!record) {
      return ok(
        notFoundLookup({
          query,
          generatedAt,
          ...(filters ? { filters } : {}),
        }),
      );
    }

    const relatedIds = relatedIdsFromRecord(record);
    return ok({
      schemaVersion: "resources.access-failure-evidence.lookup/v1",
      requestId: record.requestId,
      status: "found",
      generatedAt,
      ...(filters ? { filters } : {}),
      matchedSource: "short-retention-evidence-read-model",
      evidence: record.diagnostic,
      ...(relatedIds ? { relatedIds } : {}),
      nextAction: record.diagnostic.nextAction,
      capturedAt: record.capturedAt,
      expiresAt: record.expiresAt,
    });
  }
}

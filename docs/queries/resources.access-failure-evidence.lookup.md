# resources.access-failure-evidence.lookup Query Spec

## Normative Contract

`resources.access-failure-evidence.lookup` is a read-only query for finding short-retention access
failure evidence by request id.

It is not a route repair, deployment retry, health probe, log reader, proxy preview renderer,
domain verification, or certificate lifecycle operation. It must not mutate resource, deployment,
route, proxy, domain binding, certificate, health, or runtime state.

## Input

```ts
type ResourceAccessFailureEvidenceLookupQueryInput = {
  requestId: string;
  resourceId?: string;
  hostname?: string;
  path?: string;
};
```

`requestId` is required. `resourceId`, `hostname`, and `path` are optional narrowing filters. The
query must reuse this input schema across CLI, HTTP/oRPC, Web, and future tools instead of defining
transport-only alternatives.

## Output

```ts
type ResourceAccessFailureEvidenceLookup = {
  schemaVersion: "resources.access-failure-evidence.lookup/v1";
  requestId: string;
  status: "found" | "not-found";
  generatedAt: string;
  filters?: {
    resourceId?: string;
    hostname?: string;
    path?: string;
  };
  matchedSource?: "short-retention-evidence-read-model";
  evidence?: ResourceAccessFailureDiagnostic;
  relatedIds?: {
    resourceId?: string;
    deploymentId?: string;
    domainBindingId?: string;
    serverId?: string;
    destinationId?: string;
    routeId?: string;
  };
  nextAction: ResourceAccessFailureNextAction;
  capturedAt?: string;
  expiresAt?: string;
  notFound?: {
    code: "resource_access_failure_evidence_not_found";
    phase: "evidence-lookup";
    message: string;
  };
};
```

Found results must expose only the stored safe `resource-access-failure/v1` envelope and
retention/source metadata. Not-found results must be safe to display or copy and must not reveal
whether another resource matched the same request id behind a mismatched filter.

## Retention

Evidence is short-retention operational read-model state. Expired evidence must not be returned.
The persistence adapter may prune expired evidence during record or lookup.

The baseline retention window is implementation-configured. The returned `expiresAt` is part of
the contract so operators know when request-id lookup evidence will disappear.

## Error Semantics

Ordinary no-match, filter mismatch, and expired evidence are `ok(status = "not-found")` results.

Infrastructure failures while reading the store return `err(DomainError)` with:

- `code = resource_access_failure_evidence_unavailable`;
- `category = infra`;
- `phase = evidence-lookup`;
- `retriable = true`.

The error details must include only safe request/filter metadata.

## Security

The query must never return:

- secret values;
- private keys;
- SSH credentials;
- provider raw payloads;
- authorization headers or cookies;
- request query strings;
- raw remote logs;
- raw command output;
- internal network coordinates;
- unredacted application output.

## Current Implementation Notes And Migration Gaps

This query is added as the Phase 6 request-id lookup baseline. It uses retained safe envelopes and
does not yet perform automatic route/resource context lookup from applied provider metadata.

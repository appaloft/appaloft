# source-events.show Query Spec

## Status

Accepted candidate read model. Inactive application query handling and durable source-event
read-model persistence exist. Do not expose this query until permission checks, public docs/help,
`CORE_OPERATIONS.md`, `operation-catalog.ts`, and tests are aligned in Code Round.

## Governing Sources

- [ADR-037: Source Event Auto Deploy Ownership](../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [Source Binding Auto Deploy Test Matrix](../testing/source-binding-auto-deploy-test-matrix.md)
- [Source Event Auto Deploy Error Spec](../errors/source-events.md)
- [source-events.ingest Command Spec](../commands/source-events.ingest.md)
- [source-events.list Query Spec](./source-events.list.md)

## Intent

`source-events.show` reads one safe source event delivery record with verification, dedupe, policy
match, ignored/blocked, dispatch, and created deployment details.

It is read-only. It must not replay events, retry failed dispatch, mutate policies, or create
deployments.

## Input

```ts
type ShowSourceEventInput = {
  sourceEventId: string;
  projectId?: string;
  resourceId?: string;
};
```

At least one project or Resource scope should be supplied by external callers unless authorization
already narrowed the lookup context.

## Output

```ts
type SourceEventDetail = {
  sourceEventId: string;
  projectId?: string;
  matchedResourceIds: readonly string[];
  sourceKind: "github" | "gitlab" | "generic-signed";
  eventKind: "push" | "tag";
  sourceIdentity: {
    locator: string;
    providerRepositoryId?: string;
    repositoryFullName?: string;
  };
  ref: string;
  revision: string;
  verification: {
    status: "verified" | "rejected";
    method?: "provider-signature" | "generic-hmac";
    keyVersion?: string;
  };
  status: "accepted" | "deduped" | "ignored" | "blocked" | "dispatched" | "failed";
  dedupeOfSourceEventId?: string;
  policyResults: readonly SourceEventPolicyResult[];
  createdDeploymentIds: readonly string[];
  receivedAt: string;
};

type SourceEventPolicyResult = {
  resourceId: string;
  status: "matched" | "ignored" | "blocked" | "dispatch-failed" | "dispatched";
  reason?: "ref-not-matched" | "policy-disabled" | "policy-blocked" | "dispatch-failed";
  deploymentId?: string;
  errorCode?: string;
};
```

Output must never include raw payloads, signatures, webhook secret values, provider tokens, or
credential-bearing source locators.

## Error Contract

Use [Source Event Auto Deploy Error Spec](../errors/source-events.md). Minimum codes:

- `source_event_not_found`
- `source_event_scope_required`
- `source_event_read_unavailable`
- `validation_error`

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Source event detail drawer or diagnostics page. | Future Code Round |
| CLI | `appaloft source-event show <sourceEventId> --resource <resourceId>`. | Future Code Round |
| oRPC / HTTP | `GET /api/source-events/{sourceEventId}` with project/resource scope. | Future Code Round |
| Automation / MCP | Future read-only query/tool. | Future |

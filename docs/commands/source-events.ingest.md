# source-events.ingest Command Spec

## Status

Accepted candidate integration boundary. Inactive application command handling, generic signed
source-event verification, durable source-event dedupe persistence, and policy matching for ignored
or blocked outcomes exist. A matching source-event dispatcher can invoke existing
`deployments.create` admission and durably update source-event outcomes. Do not expose ingestion
routes until provider adapters, read models, error contracts, public docs/help,
`CORE_OPERATIONS.md`, `operation-catalog.ts`, and tests are aligned in Code Round.

## Governing Sources

- [ADR-037: Source Event Auto Deploy Ownership](../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [Source Binding Auto Deploy Test Matrix](../testing/source-binding-auto-deploy-test-matrix.md)
- [Source Event Auto Deploy Error Spec](../errors/source-events.md)
- [resources.configure-auto-deploy Command Spec](./resources.configure-auto-deploy.md)
- [source-events.list Query Spec](../queries/source-events.list.md)
- [source-events.show Query Spec](../queries/source-events.show.md)
- [deployments.create Command Spec](./deployments.create.md)

## Intent

`source-events.ingest` accepts a verified provider-neutral source event, records durable dedupe and
diagnostic state, evaluates matching Resource auto-deploy policies, and dispatches matching
deployment attempts through the existing `deployments.create` admission path.

It does not store raw webhook payloads as business state, bypass deployment admission, mutate source
binding, or guarantee automatic background retry before Phase 8 process-state work.

## Input

Transport adapters own raw payload parsing and signature extraction. The application command input
uses provider-neutral facts:

```ts
type IngestSourceEventInput = {
  sourceKind: "github" | "gitlab" | "generic-signed";
  eventKind: "push" | "tag";
  scopeResourceId?: string;
  sourceIdentity: {
    locator: string;
    providerRepositoryId?: string;
    repositoryFullName?: string;
  };
  ref: string;
  revision: string;
  deliveryId?: string;
  idempotencyKey?: string;
  verification: {
    status: "verified";
    method: "provider-signature" | "generic-hmac";
    keyVersion?: string;
  };
  receivedAt?: string;
};
```

Invalid signatures or unverified events are rejected before policy matching. If a transport cannot
verify the event, it must not construct a verified command.

`scopeResourceId` is required for Resource-scoped generic signed webhook transport routes. When it
is present, policy matching is limited to that Resource. Provider-signed Git transport routes must
omit it unless a future spec defines a provider-specific scoping rule.

The first Resource-scoped generic signed HTTP route is:

```text
POST /api/resources/{resourceId}/source-events/generic-signed
```

The route:

1. Locates the Resource auto-deploy policy.
2. Resolves `genericWebhookSecretRef` in the `resource-secret:<KEY>` family against the same
   Resource's runtime secret variables.
3. Verifies the raw request body with HMAC SHA-256 from `X-Appaloft-Signature`.
4. Normalizes safe JSON fields into this command input.
5. Dispatches this command with `scopeResourceId = resourceId`.

The raw request body, signature value, and secret value are transport-only inputs. They must not be
included in this command input, source event records, read models, errors, logs, or events.

## Ingestion Flow

1. Validate normalized event facts.
2. Compute the dedupe key using ADR-037 precedence.
3. Persist or read the durable source event record before dispatching deployments.
4. Return deduped result without creating deployments when the event already exists.
5. Find enabled, unblocked Resource policies whose source binding and refs match the event.
6. When `scopeResourceId` is present, discard all policy candidates except that Resource before
   dispatch evaluation.
7. Record ignored or blocked reasons when no deployment is created.
8. For each match, dispatch ordinary `deployments.create` with Resource/environment/runtime context
   only; do not pass source event fields into deployment admission.
9. Record created deployment ids or structured dispatch failure details.

## Result

```ts
type IngestSourceEventResult = {
  sourceEventId: string;
  status: "accepted" | "deduped" | "ignored" | "blocked" | "dispatched" | "failed";
  matchedResourceIds: readonly string[];
  createdDeploymentIds: readonly string[];
  ignoredReasons: readonly (
    | "no-matching-policy"
    | "ref-not-matched"
    | "policy-disabled"
    | "policy-blocked"
  )[];
  dedupeOfSourceEventId?: string;
};
```

Command success means the source event record and its immediate dispatch outcome are durable.
Deployment completion remains observable through deployment queries and events.

## Error Contract

Use [Source Event Auto Deploy Error Spec](../errors/source-events.md). Minimum codes:

- `source_event_signature_invalid`
- `source_event_unsupported_kind`
- `source_event_dispatch_failed`
- `resource_auto_deploy_secret_unavailable`
- `coordination_timeout`
- `validation_error`

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | No raw webhook ingestion; reads source event results. | Future |
| CLI | Optional local smoke/diagnostic ingestion over normalized facts. | Future |
| oRPC / HTTP | `POST /api/resources/{resourceId}/source-events/generic-signed` verifies Resource-scoped generic signed events; future provider-specific verified webhook routes dispatch this command. | Future Code Round |
| Automation / MCP | Future event ingest tool only when verification input is safe. | Future |

## Tests

Stable matrix coverage:

- `SRC-AUTO-EVENT-001`
- `SRC-AUTO-EVENT-002`
- `SRC-AUTO-EVENT-003`
- `SRC-AUTO-EVENT-004`
- `SRC-AUTO-EVENT-005`
- `SRC-AUTO-EVENT-006`

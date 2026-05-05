# ADR-037: Source Event Auto Deploy Ownership

## Status

Accepted

## Context

Phase 7 needs source-binding auto-deploy without turning `deployments.create` into a source-aware or
webhook-aware command. Appaloft already has Resource-owned source binding, source fingerprint link
state, and manual deployment admission through `deployments.create`.

Auto-deploy adds a new trigger path:

```text
verified source event
  -> provider-neutral source event facts
  -> Resource auto-deploy policy match
  -> deployments.create
```

Without a decision record, source event ingestion could drift into provider adapters, webhook
transport handlers, or hidden background behavior that bypasses operation catalog, command/query
schemas, source binding ownership, or deployment recovery semantics.

## Decision

Source event auto-deploy is an application-owned workflow over Resource policy and existing
deployment admission.

The first public Code Round uses these ownership boundaries:

| Concern | Owner |
| --- | --- |
| Auto-deploy policy | Resource-owned configuration, changed only by `resources.configure-auto-deploy`. |
| Source event verification and normalization | Integration/transport adapter plus application ports; application receives provider-neutral facts. |
| Source event dedupe, match result, and diagnostics | Source event application service and read model. |
| Deployment attempt creation | Existing `deployments.create` admission path. |
| Runtime coordination | Existing `resource-runtime` operation coordination. |

`deployments.create` must not gain source event, branch, webhook, provider delivery id, or generic
signed webhook fields. A source-triggered deployment must still be observable as a normal deployment
attempt, with source-event context exposed through read models rather than as deployment admission
input.

## Auto-Deploy Policy

`resources.configure-auto-deploy` enables, disables, or replaces one Resource-owned policy. The
policy is valid only for the Resource's current source binding at the time it is acknowledged.

When `resources.configure-source` changes the Resource source binding, any existing auto-deploy
policy becomes **blocked pending acknowledgement**. The policy is not silently retargeted and is not
silently deleted. Source events must not create deployments from a blocked policy.

Re-enabling or acknowledging the policy requires an explicit `resources.configure-auto-deploy`
command after the source binding change. Read models and Web/CLI/API output must show the blocked
reason so operators can decide whether the policy should apply to the new source.

## Source Event Read Models

Source event records are retained in a project/resource-scoped read model.

Minimum safe fields:

- source event id;
- provider or generic source kind;
- project id when resolved;
- resource id when matched;
- normalized source identity;
- ref and revision;
- event kind;
- delivery id or idempotency key;
- verification result;
- dedupe status;
- ignored or blocked reason;
- created deployment ids;
- received timestamp.

Global operator rollups may be added later, but first Code Round queries must support project and
resource scoping so UI and CLI diagnostics stay bounded and permission checks remain simple.

## Generic Signed Webhook Secret

The first Phase 7 generic signed deploy webhook uses a Resource-scoped secret reference, not a new
reusable credential aggregate.

The secret value itself must live in the existing secret/reference custody model. Auto-deploy stores
only safe reference/version metadata on the Resource policy. Rotation is performed by replacing the
referenced secret through existing secret operations and then acknowledging the policy if needed.

A future reusable webhook credential aggregate may be added only after a separate ADR/spec defines
cross-resource ownership, rotation, audit, and delete-safety behavior.

The initial accepted Resource-scoped reference format is:

```text
resource-secret:<RESOURCE_VARIABLE_KEY>
```

The referenced key must resolve to an active variable on the same Resource with `exposure =
"runtime"` and secret classification (`isSecret = true` or `kind = "secret"`). The resolver must
not read environment-scope variables, dependency binding secrets, certificate secrets, provider
tokens, or arbitrary secret refs for generic signed webhook verification.

Generic signed webhook routes must be Resource-scoped and must pass that Resource id into the
source-event ingestion boundary. Matching for a Resource-scoped generic signed event is limited to
that Resource, even if another Resource has the same source identity and ref. Provider-signed Git
events may still fan out to multiple matching Resource policies.

## Process State And Retry Baseline

The first Code Round does not require the Phase 8 durable outbox/inbox baseline.

It must still persist a durable source event record before dispatching a matching deployment. That
record is the minimum source-event process state for:

- dedupe across retries and process restarts;
- ignored/rejected/deduped/deployed diagnostics;
- created deployment id references;
- replay safety for duplicate deliveries.

Initial behavior may dispatch matching deployments synchronously inside the ingest use case after
the source event record is persisted. If dispatch fails after the source event is accepted, the
source event record must show a failed or partially-dispatched state with structured error details.

No automatic retry guarantee is implied until Phase 8 adds durable outbox/inbox or equivalent
process management. Public docs and read models must not claim background retry beyond the recorded
source event state.

## Ingestion And Dedupe

`source-events.ingest` must authenticate or verify the event before policy matching.

Dedupe key precedence:

1. provider delivery id plus provider/source identity;
2. generic idempotency key plus configured Resource/generic webhook identity;
3. normalized source identity plus ref plus revision plus event kind inside a bounded window when no
   provider delivery id exists.

Duplicate delivery returns the existing source event result or a stable deduped response and must
not create another deployment.

## Entrypoint Requirements

Every active entrypoint must map to the same operation semantics:

- CLI configures policy and lists/shows source events.
- HTTP/oRPC exposes policy commands, source event queries, and verified ingestion routes.
- Web Resource settings uses the same policy command and displays blocked/deduped/ignored event
  state from read models.
- Future MCP/tools derive from operation catalog metadata and must not invent a separate
  auto-deploy workflow.

Transport adapters may own provider-specific signature extraction and raw payload parsing, but they
must dispatch provider-neutral source event commands into application behavior.

The first generic signed HTTP route shape is:

```text
POST /api/resources/{resourceId}/source-events/generic-signed
```

It resolves `genericWebhookSecretRef`, verifies the raw request body with HMAC SHA-256 using the
`X-Appaloft-Signature` header (`sha256=<hex>` or bare hex), normalizes safe JSON body fields into
provider-neutral source event facts, and dispatches `source-events.ingest` with `scopeResourceId =
resourceId`. Raw request body, signature header, and secret values must not be persisted in source
event records, error details, read models, logs, or events.

## Consequences

- Auto-deploy is additive and does not change manual deployment admission.
- Resource source binding remains the durable source owner.
- Source event state becomes a new durable diagnostic/read-model surface.
- Product-grade preview deployments and GitHub App lifecycle remain separate roadmap work.
- First Code Round can proceed before Phase 8 outbox/inbox, but must clearly mark automatic source
  event retry as deferred.

## Required Spec Updates

This decision governs:

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [Source Binding Auto Deploy Test Matrix](../testing/source-binding-auto-deploy-test-matrix.md)
- [Source Binding Auto Deploy Implementation Plan](../implementation/source-binding-auto-deploy-plan.md)
- `resources.configure-auto-deploy`, `source-events.ingest`, `source-events.list`, and
  `source-events.show` specs.

# Source Binding And Auto Deploy

## Status

Spec Round for Phase 7 / `0.9.0`.

This artifact positions source-binding auto-deploy before Code Round. It does not activate new
commands, HTTP routes, Web actions, webhook endpoints, or background workers.

## Governing Sources

- [ADR-037: Source Event Auto Deploy Ownership](../../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- [Deployment Config File Bootstrap](../../workflows/deployment-config-file-bootstrap.md)
- [resources.configure-auto-deploy](../../commands/resources.configure-auto-deploy.md)
- [source-events.ingest](../../commands/source-events.ingest.md)
- [source-events.list](../../queries/source-events.list.md)
- [source-events.show](../../queries/source-events.show.md)
- [Source Event Auto Deploy Error Spec](../../errors/source-events.md)
- [Source Binding Auto Deploy Test Matrix](../../testing/source-binding-auto-deploy-test-matrix.md)
- [Source Binding Auto Deploy Implementation Plan](../../implementation/source-binding-auto-deploy-plan.md)

## Problem

Appaloft already persists Resource source binding and source fingerprint link state, and it can
deploy from a user-initiated CLI, Web, or HTTP/oRPC command. Phase 7 also needs repeat deployments
from trusted source events without making `deployments.create` accept source, branch, webhook, or
provider-specific fields.

Auto-deploy must answer these business questions before implementation:

- which Resource is allowed to deploy from a source event;
- which branch/tag/path event matches the Resource's durable source binding;
- which actor, integration, or generic webhook credential authorized the event;
- whether a matching event creates a deployment immediately, waits for policy, or is ignored;
- how duplicates, redeliveries, and old commits are deduped without hiding behavior in transport
  adapters.

## Business Intent

Source-binding auto-deploy is an operator-controlled Resource policy that turns trusted source
events into ordinary deployment attempts.

The accepted behavior is:

1. A user configures auto-deploy policy on a Resource that already has a durable source binding.
2. A Git provider webhook, future GitHub App event, or generic signed deploy webhook submits a
   source event into Appaloft.
3. Appaloft verifies the event authenticity and normalizes it into provider-neutral source event
   facts.
4. Appaloft matches the event against active Resource auto-deploy policies.
5. For each match, Appaloft dispatches `deployments.create` with existing deployment context ids.

Auto-deploy does not create a parallel deployment command. The resulting deployment attempt uses the
same `detect -> plan -> execute -> verify -> rollback` model as a manual deployment.

## Candidate Operations

| Operation | Kind | Owner | Intent |
| --- | --- | --- | --- |
| `resources.configure-auto-deploy` | Accepted candidate command | Resource | Enables, disables, or replaces one Resource-owned auto-deploy policy for its source binding. |
| `source-events.ingest` | Accepted candidate command / integration boundary | Source event application service | Accepts a verified Git/provider/generic signed source event, dedupes it, evaluates matching policies, and starts deployment attempts through `deployments.create`. |
| `source-events.list` | Accepted candidate query | Source event read model | Lists recent source events, match results, ignored reasons, and created deployment ids for operator diagnostics. |
| `source-events.show` | Accepted candidate query | Source event read model | Shows one source event's safe normalized facts, delivery status, policy matches, and created deployment ids. |

The first Code Round may split `source-events.ingest` into provider-specific transport routes, but
the application behavior must keep one provider-neutral source event command shape.

## Scope

In scope:

- Resource-owned auto-deploy enable/disable policy.
- Git push events for a configured branch or tag selector.
- Generic signed deploy webhook that can supply a safe source revision and optional ref.
- Event dedupe by provider delivery id or generic idempotency key plus source identity.
- Dispatch to `deployments.create` using existing project/environment/resource/server/destination
  context from Resource/source-link/control-plane state.
- Safe read models for source event status, ignored reasons, and created deployments.
- CLI, HTTP/oRPC, Web, public docs/help, and future MCP/tool schema decisions in the Code Round.

Out of scope for the first Code Round:

- Product-grade PR preview lifecycle.
- GitHub App installation management UI.
- Always-on cloud runner execution.
- Deployment queueing beyond the accepted async lifecycle and operation coordination contracts.
- Provider-native branch protection or required status check policy.
- Secrets rotation, reusable webhook credential aggregates, provider-native secret backends, or
  arbitrary secret reference resolution beyond the first Resource-scoped `resource-secret:<KEY>`
  format.

## Policy Semantics

An auto-deploy policy belongs to one Resource. It references the Resource's current durable source
binding and must not retarget the Resource source as a side effect.

Minimum policy fields:

- `enabled`: whether source events may create deployments.
- `sourceKind`: the accepted source family, initially Git or generic signed.
- `refSelector`: branch, tag, or exact ref selector.
- `eventKinds`: initially push; pull request preview remains separate.
- `dedupeWindow`: implementation-defined default recorded in docs and read models.
- `createdBy` and `updatedAt` audit metadata.

When the Resource source binding changes, the policy remains blocked until the new binding is
explicitly acknowledged by `resources.configure-auto-deploy`. The policy is not silently retargeted
and not silently deleted, but source events must not create deployments while it is blocked.

## Event Ingestion Semantics

`source-events.ingest` must:

- authenticate or verify the source event before normalization;
- reject secret-bearing URLs and unsafe payload fields;
- normalize provider-specific payloads into source identity, ref, commit/revision, event kind, and
  delivery id;
- dedupe repeat deliveries before dispatching deployments;
- evaluate policies through application logic, not webhook transport code;
- dispatch `deployments.create` only for matching enabled policies;
- record ignored, deduped, rejected, and deployed outcomes in a safe read model.

If multiple Resources match one event, Appaloft may create multiple deployment attempts, but each
attempt must coordinate independently through the existing `resource-runtime` scope.

Provider-signed Git events may fan out to multiple matching Resource policies. Generic signed
webhook events are different: the first Phase 7 route is Resource-scoped, verifies with that
Resource's `resource-secret:<KEY>` policy reference, and passes `scopeResourceId` into
`source-events.ingest`. A Resource-scoped generic signed event must never deploy a different
Resource even when another Resource shares the same source identity and ref.

The first provider-specific Git HTTP route is:

```text
POST /api/integrations/github/source-events
```

The route verifies the raw body with GitHub's `X-Hub-Signature-256` header and the configured
`APPALOFT_GITHUB_WEBHOOK_SECRET`, reads `X-GitHub-Delivery` as the provider delivery id, and
supports `X-GitHub-Event = push` first. It normalizes GitHub push payloads into provider-neutral
source facts without `scopeResourceId`, so matching may fan out to every Resource policy with the
same source identity and ref selector. GitHub `ping` may return a transport no-op for setup
validation, but it must not create a source event record or deployment attempt. Missing configured
webhook secret, missing/invalid signature, unsupported event kind, or unsafe payload shape reject
before `source-events.ingest` dispatch.

The first generic signed HTTP route is:

```text
POST /api/resources/{resourceId}/source-events/generic-signed
```

The route verifies the raw JSON body with `X-Appaloft-Signature` (`sha256=<hex>` or bare SHA-256
HMAC hex). The request body may include only normalized source facts: `eventKind`, `sourceIdentity`,
`ref`, `revision`, optional `deliveryId`, optional `idempotencyKey`, and optional `receivedAt`.
Raw payloads, signature headers, secret values, provider tokens, and credential-bearing source URLs
must not be persisted.

## Acceptance Criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| `SRC-AUTO-SPEC-001` | User enables auto-deploy for a Resource with Git source binding and branch selector. | Policy is persisted on the Resource without mutating source/runtime/network profile. |
| `SRC-AUTO-SPEC-002` | Verified push event matches one enabled policy. | One accepted deployment attempt is created through `deployments.create`. |
| `SRC-AUTO-SPEC-003` | Event is redelivered with same delivery id. | No duplicate deployment is created; read model reports deduped. |
| `SRC-AUTO-SPEC-004` | Event ref does not match policy. | No deployment is created; read model reports ignored reason. |
| `SRC-AUTO-SPEC-005` | Generic signed webhook has invalid signature. | Event is rejected before policy matching and no deployment is created. |
| `SRC-AUTO-SPEC-006` | Resource source binding changes after policy creation. | Policy is blocked pending explicit acknowledgement and cannot create deployments. |
| `SRC-AUTO-SPEC-007` | Resource-scoped generic signed webhook matches a source shared by another Resource. | Only the Resource named in the webhook route is eligible for deployment dispatch. |
| `SRC-AUTO-SPEC-008` | GitHub push webhook has a valid provider signature. | Payload normalizes to safe provider-neutral source facts, uses provider delivery id for dedupe, and can fan out to all matching enabled Resource policies. |
| `SRC-AUTO-SPEC-009` | GitHub push webhook has missing config, invalid signature, unsupported event kind, or unsafe payload shape. | Request rejects before command dispatch; no source event or deployment is created and no raw payload/signature/secret appears in errors. |

## Public Surfaces

The Code Round must decide and synchronize:

- CLI commands for configuring policy and inspecting source events;
- HTTP/oRPC routes for policy commands and source event ingestion;
- Web Resource detail/settings affordances for enabling/disabling auto-deploy;
- public docs anchors:
  - `/docs/deploy/sources/#source-auto-deploy-setup`;
  - `/docs/deploy/sources/#source-auto-deploy-signatures`;
  - `/docs/deploy/sources/#source-auto-deploy-dedupe`;
  - `/docs/deploy/sources/#source-auto-deploy-ignored-events`;
  - `/docs/deploy/sources/#source-auto-deploy-recovery`;
- future MCP/tool descriptors generated from the same command/query schemas.

## Decisions For Code Round

ADR-037 answers the initial Code Round blockers:

- source event read models are project/resource-scoped first; global operator rollups are future;
- source binding changes block existing auto-deploy policies until explicit acknowledgement;
- generic signed webhook starts with a Resource-scoped `resource-secret:<KEY>` reference, not a
  reusable credential aggregate, and its route is Resource-scoped;
- Phase 7 may use durable source-event records plus synchronous deployment dispatch before Phase 8
  outbox/inbox, but must not claim automatic background retry.

Remaining Test-First / Code Round work:

- GitLab and GitHub App preview lifecycle adapters remain future; the first active provider route is
  the GitHub push webhook baseline;
- transport help text and Web links are implemented against the registered public docs topics.

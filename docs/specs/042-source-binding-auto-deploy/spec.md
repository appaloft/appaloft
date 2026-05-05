# Source Binding And Auto Deploy

## Status

Spec Round for Phase 7 / `0.9.0`.

This artifact positions source-binding auto-deploy before Code Round. It does not activate new
commands, HTTP routes, Web actions, webhook endpoints, or background workers.

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
- Secrets rotation or new credential storage semantics.

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

When the Resource source binding changes, the policy remains disabled or blocked until the new
binding is explicitly acknowledged by `resources.configure-auto-deploy`. Code Round must choose one
behavior and bind it in tests before implementation.

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

## Acceptance Criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| `SRC-AUTO-SPEC-001` | User enables auto-deploy for a Resource with Git source binding and branch selector. | Policy is persisted on the Resource without mutating source/runtime/network profile. |
| `SRC-AUTO-SPEC-002` | Verified push event matches one enabled policy. | One accepted deployment attempt is created through `deployments.create`. |
| `SRC-AUTO-SPEC-003` | Event is redelivered with same delivery id. | No duplicate deployment is created; read model reports deduped. |
| `SRC-AUTO-SPEC-004` | Event ref does not match policy. | No deployment is created; read model reports ignored reason. |
| `SRC-AUTO-SPEC-005` | Generic signed webhook has invalid signature. | Event is rejected before policy matching and no deployment is created. |
| `SRC-AUTO-SPEC-006` | Resource source binding changes after policy creation. | Code Round blocks or disables policy according to the selected explicit rule. |

## Public Surfaces

The Code Round must decide and synchronize:

- CLI commands for configuring policy and inspecting source events;
- HTTP/oRPC routes for policy commands and source event ingestion;
- Web Resource detail/settings affordances for enabling/disabling auto-deploy;
- public docs anchors for auto-deploy setup, generic signed webhook setup, dedupe behavior, and
  recovery;
- future MCP/tool descriptors generated from the same command/query schemas.

## Open Questions Before Code Round

- Should source event read models be retained globally or scoped by project/resource?
- Does `resources.configure-auto-deploy` disable policy automatically when `resources.configure-source`
  changes source binding, or does it keep policy enabled but blocked until acknowledgement?
- Does generic signed webhook own a reusable secret credential aggregate, or does Phase 7 start with
  one Resource-scoped secret reference?
- Does the first Code Round require durable outbox/inbox, or can it use synchronous dispatch plus a
  source-event record until Phase 8 process-state closure?

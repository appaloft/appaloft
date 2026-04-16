# domain-bindings.confirm-ownership Command Spec

## Normative Contract

`domain-bindings.confirm-ownership` is the source-of-truth command for confirming a manual domain ownership verification attempt for an accepted durable domain binding.

Command success means the current manual verification attempt is durably marked verified, the owning binding state is moved to `bound`, and `domain-bound` is published or recorded.

```ts
type ConfirmDomainBindingOwnershipResult = Result<
  { id: string; verificationAttemptId: string },
  DomainError
>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id, verificationAttemptId })`;
- accepted success persists the verified attempt and bound binding state;
- accepted success publishes `domain-bound`;
- certificate issuance and domain readiness remain downstream workflow steps.

## Global References

This command inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [domain-bound Event Spec](../events/domain-bound.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Confirm that the operator or trusted automation has verified the DNS/route ownership evidence required by the binding's current manual verification attempt.

It is not:

- a domain binding creation command;
- a generated default access route operation;
- a DNS provider adapter call;
- a certificate issuance command;
- a domain readiness guarantee;
- a deployment command;
- a read-model update shortcut.

Generated default access routes such as sslip hostnames do not create `DomainBinding` records and do not require this command. They remain generated access state exposed through `ResourceAccessSummary`.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `domainBindingId` | Required | Durable domain binding whose current manual verification attempt is being confirmed. |
| `verificationAttemptId` | Optional | Current attempt id to confirm. When omitted, the command confirms the latest pending manual attempt. |
| `confirmedBy` | Optional | Operator or automation label. Must not contain credentials or secrets. |
| `evidence` | Optional | Safe non-secret confirmation note, such as "DNS record checked" or "operator confirmed route". |
| `idempotencyKey` | Optional | Caller-supplied dedupe key for repeated confirmation submissions. |

`evidence` is descriptive confirmation metadata. It must not contain DNS provider credentials, API tokens, private keys, certificate material, or raw secret-bearing provider responses.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve the domain binding by `domainBindingId`.
3. Reject missing bindings.
4. Select the supplied `verificationAttemptId` or the latest pending manual attempt.
5. Reject when no pending manual verification attempt exists.
6. Reject when the binding is already `ready`, `failed`, or in another state that cannot move to `bound`.
7. Treat an already verified/bound binding for the same attempt as idempotent success.
8. Persist the verified attempt and bound binding state.
9. Publish or record `domain-bound`.
10. Return `ok({ id, verificationAttemptId })`.

## State Transition

```text
domain binding: pending_verification -> bound
verification attempt: pending -> verified
```

`domain-bound` does not mean TLS is ready. If `certificatePolicy = auto`, the downstream certificate workflow may request a certificate after this event. If TLS/certificate policy is disabled, a domain-ready process may evaluate route readiness after this event.

## Events

Canonical event spec:

- `domain-bound`: domain ownership/routing prerequisites are satisfied for the binding.

The event payload must include the confirmed `verificationAttemptId`, binding owner scope, domain name, path prefix, TLS mode, and certificate policy.

## Error Codes

All errors use [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md). Command-specific codes and phases:

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape, attempt id, confirmation actor, or evidence is invalid. |
| `not_found` | `domain-verification` | No | Domain binding does not exist. |
| `domain_verification_not_pending` | `domain-verification` | No | No current pending manual verification attempt can be confirmed. |
| `invariant_violation` | `domain-verification` | No | Binding state cannot transition to `bound`. |
| `infra_error` | `domain-binding-persistence` or `event-publication` | Conditional | Bound state or event could not be safely recorded. |

## Handler Boundary

The handler must delegate to an application use case and return the typed `Result`.

It must not:

- call DNS provider SDKs directly;
- issue or import certificates;
- mutate deployment runtime plans;
- update read models directly;
- infer confirmation from generated sslip/default access routes;
- perform Web/CLI prompt logic.

## Entry Surfaces

Web must provide an owner-scoped affordance on resource detail for pending domain bindings. The standalone domain binding page may provide the same action for cross-resource management.

CLI must expose an explicit confirmation command.

API/oRPC must expose strict command input and dispatch through the command bus.

## Current Implementation Notes And Migration Gaps

Current code creates and lists durable domain bindings, persists the first manual verification attempt, and publishes `domain-binding-requested`.

`domain-bindings.confirm-ownership` is implemented as the first manual verification confirmation slice. Downstream `certificates.issue-or-renew`, `domain-ready`, durable outbox/inbox, DNS-provider verification, and automatic verification retries remain follow-up behavior.

## Open Questions

- None for the manual confirmation baseline. ADR-006 governs why the first verification strategy is manual and auditable.

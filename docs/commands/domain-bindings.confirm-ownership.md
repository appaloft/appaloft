# domain-bindings.confirm-ownership Command Spec

## Normative Contract

`domain-bindings.confirm-ownership` is the source-of-truth command for confirming a domain ownership verification attempt for an accepted durable domain binding.

Command success means the current verification attempt is durably marked verified, the owning binding state is moved to `bound`, and `domain-bound` is published or recorded.

The default confirmation mode is DNS-gated. Appaloft re-observes public DNS through an application port, compares the observed answers with the binding's expected target metadata, records safe DNS observation evidence, and only confirms ownership when the expected target is observed. Explicit manual confirmation remains available as a user/trusted-automation override when DNS cannot be reliably observed from Appaloft's resolver context.

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

Confirm that the DNS or operator evidence required by the binding's current verification attempt is sufficient to move the binding from `pending_verification` to `bound`.

The actors are:

- User or trusted automation: chooses the domain, configures DNS with the registrar/DNS provider, and may request explicit manual override when Appaloft cannot observe the evidence.
- DNS provider and public resolvers: own DNS propagation timing and resolver answers. Appaloft cannot make this step synchronous.
- Appaloft: records the expected target, observes public DNS answers when asked to confirm ownership, stores safe DNS evidence, and performs the write-side binding transition only when confirmation succeeds.

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
| `verificationAttemptId` | Optional | Current attempt id to confirm. When omitted, the command confirms the latest pending attempt. |
| `verificationMode` | Optional | `dns` or `manual`. Defaults to `dns`. `dns` asks Appaloft to verify current public DNS evidence before confirmation; `manual` is an explicit user/trusted-automation override. |
| `confirmedBy` | Optional | Operator or automation label. Must not contain credentials or secrets. |
| `evidence` | Optional | Safe non-secret confirmation note, such as "DNS record checked" or "operator confirmed route". |
| `idempotencyKey` | Optional | Caller-supplied dedupe key for repeated confirmation submissions. |

`evidence` is descriptive confirmation metadata. It must not contain DNS provider credentials, API tokens, private keys, certificate material, or raw secret-bearing provider responses.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve the domain binding by `domainBindingId`.
3. Reject missing bindings.
4. Select the supplied `verificationAttemptId` or the latest pending verification attempt.
5. Reject when no pending verification attempt exists.
6. Reject when the binding is already `ready`, `failed`, or in another state that cannot move to `bound`.
7. Treat an already verified/bound binding for the same attempt as idempotent success.
8. If `verificationMode = dns`, call the injected DNS ownership verifier with the normalized domain name and the binding's expected DNS targets.
9. If DNS observation is `matched`, record `dnsObservation.status = matched` with safe observed targets and proceed.
10. If DNS observation is `pending`, `unresolved`, `mismatch`, or `lookup_failed`, record the observation, keep the verification attempt pending, return a command error, and do not publish `domain-bound`.
11. If `verificationMode = manual`, record no DNS success unless evidence is separately available; the actor is the user/trusted automation that requested override.
12. Persist the verified attempt and bound binding state.
13. Publish or record `domain-bound`.
14. Return `ok({ id, verificationAttemptId })`.

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
| `domain_verification_not_pending` | `domain-verification` | No | No current pending verification attempt can be confirmed. |
| `domain_ownership_unverified` | `domain-verification` | No | DNS mode did not observe the expected target; the user must fix DNS, wait for propagation, or choose an explicit manual override. |
| `dns_lookup_failed` | `domain-verification` | Yes | Appaloft could not complete the DNS lookup through configured resolvers. |
| `invariant_violation` | `domain-verification` | No | Binding state cannot transition to `bound`. |
| `infra_error` | `domain-binding-persistence` or `event-publication` | Conditional | Bound state or event could not be safely recorded. |

## Handler Boundary

The handler must delegate to an application use case and return the typed `Result`.

It must not:

- call DNS provider SDKs directly;
- perform DNS resolution inline instead of using the injected application port;
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

Current code creates and lists durable domain bindings, persists the first verification attempt, records initial DNS observation metadata, and publishes `domain-binding-requested`.

`domain-bindings.confirm-ownership` must support DNS-gated confirmation through an injected DNS ownership verifier and explicit manual override. Downstream `certificates.issue-or-renew`, `domain-ready`, durable outbox/inbox, DNS provider writes, background DNS recheck scheduling, and confirmation-file route proof remain follow-up behavior.

## Open Questions

- None for the DNS-gated confirmation baseline. ADR-006 governs why DNS observation, route proof, and manual override remain separate evidence types.

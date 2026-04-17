# ADR-006: Domain Verification Strategy

Status: Accepted

Date: 2026-04-14

## Decision

The first implementation uses durable verification attempts with DNS-gated confirmation as the default confirmation path and explicit manual override as the escape hatch.

The platform records the expected verification target, DNS observation state, and operator-facing instructions. Appaloft confirms verification through an explicit verification command or process step. In DNS confirmation mode, Appaloft observes public DNS through an application port and confirms only when the observed targets match the expected Appaloft edge target. In manual mode, a user or trusted automation explicitly confirms ownership evidence that Appaloft cannot independently verify from its resolver context.

DNS provider integrations can be added later behind the same verification attempt model. Provider integrations may write or read DNS provider records, but they must not replace the durable Appaloft-side verification attempt and event semantics.

Public DNS propagation is part of the routing/domain/TLS workflow, but it is not controlled by Appaloft. Appaloft must therefore represent DNS propagation as observable pending or mismatch state instead of treating slow public DNS convergence as synchronous command failure or deployment failure.

An HTTP confirmation file or token endpoint is an acceptable route proof pattern when Appaloft needs to prove that requests for a hostname reach the Appaloft edge/proxy. It must not be treated as the only DNS proof. DNS observation proves the public resolver answer; route proof proves that traffic for the hostname and path can reach Appaloft after DNS and proxy routing are in place.

## Context

Durable domain binding must not become ready merely because a deployment runtime plan contains a domain string. The system needs a formal verification gate before publishing `domain-bound`.

Reference product notes:

- Coolify treats DNS checking as a platform concern and lets operators configure resolver servers for that check.
- CapRover reports domain verification failures when it cannot verify that the custom domain points to the CapRover server, and exposes a skip-verification override for environments where its verification path is not authoritative.
- Dokku documentation treats DNS propagation and resolver caching as external realities that can take from seconds to days and asks operators to verify DNS answers with DNS tools.

Appaloft should therefore make the common public-DNS path verifiable by default, preserve an explicit override for non-standard resolver/proxy/tunnel cases, and represent propagation as a workflow state rather than as deployment failure.

## Options Considered

| Option | Rule | Result |
| --- | --- | --- |
| Manual verification first | Platform records verification requirements; operator or automation confirms through an explicit step. | Accepted only as an explicit override. It is no longer the default confirmation path. |
| DNS lookup adapter first | Platform performs DNS queries and verifies expected records automatically. | Accepted for `domain-bindings.confirm-ownership` and DNS observation. It must not block binding creation, deployment admission, or deployment replacement. |
| DNS provider integration first | Platform writes/reads DNS provider records through provider adapters. | Deferred. Requires provider-specific credentials and permissions. |
| HTTP confirmation file first | Platform serves a generated token file/path and verifies it through public HTTP. | Accepted as a future route proof step, not as the sole DNS propagation check. |
| No verification | Binding becomes bound immediately after command acceptance. | Rejected. It makes `domain-bound` untrustworthy. |

## Chosen Rule

`domain-binding-requested` must reference a verification attempt before `domain-bound` can be published. The publisher of `domain-binding-requested` must allocate and persist the first `verificationAttemptId` as part of command admission or the immediately following domain binding process-manager step.

The required verification attempt fields are:

- `domainBindingId`;
- `verificationAttemptId`;
- normalized `domainName`;
- verification method, initially `manual`;
- expected target or instruction text;
- status;
- safe evidence metadata;
- actor or automation id that confirmed verification;
- timestamps;
- correlation id and causation id.

Safe evidence metadata must include the verification method, expected target or instruction, who or what confirmed the evidence, checked/confirmed timestamps when available, and non-secret DNS/route observations when available. It must not include provider credentials, private keys, or raw secret-bearing provider responses.

DNS observation state is separate from verification attempt success. It may record:

- expected public DNS targets, such as the Appaloft edge IP or CNAME target;
- observed public DNS targets from configured public resolvers;
- status `pending`, `matched`, `mismatch`, `unresolved`, `lookup_failed`, or `skipped`;
- checked timestamp and safe message.

`pending`, `unresolved`, `lookup_failed`, and `mismatch` DNS observations must keep the binding observable as waiting/not ready, but they must not roll back a successful deployment or delete a previously serving runtime. Appaloft may retry observation automatically, let the user trigger a recheck, or instruct the user to wait or fix DNS. Waiting is an explicit workflow action because the DNS provider/registrar owns propagation timing.

`domain-bindings.confirm-ownership` defaults to DNS-gated confirmation:

- Appaloft is the actor that performs the DNS lookup through an injected application port.
- The user or trusted automation is the actor that configured DNS with the registrar/DNS provider.
- The DNS provider and public resolvers are external actors that determine propagation timing and resolver answers.
- On DNS match, Appaloft records safe DNS evidence and confirms the current verification attempt.
- On DNS mismatch, unresolved answer, pending propagation, or lookup failure, Appaloft records safe DNS observation state, keeps the binding pending, and returns a command error without publishing `domain-bound`.
- Manual confirmation is explicit. It records that the user/trusted automation accepted evidence outside Appaloft's DNS resolver view and then uses the same write-side state transition.

Route proof state is separate from DNS observation. A confirmation-file style proof may use a generated path and token, for example:

```text
GET /.well-known/appaloft-domain-confirmation/{token}
```

The proof succeeds only when the response body matches the generated non-secret token for the binding. It proves Appaloft controls the edge/proxy route for the requested host and path. It does not by itself prove registrar ownership, and it must not leak secrets.

`domain-bound` may be published only after the verification attempt is recorded as successful.

Manual verification must not bypass the write-side state transition. UI/CLI/API confirmation must dispatch an explicit command or process-manager action, not update a read model directly.

Verification failure retry rules:

- `domain_ownership_unverified` is non-retriable until DNS/configuration/evidence changes.
- `dns_lookup_failed`, DNS provider unavailable, pending public propagation, or transient route/provider failures are retriable or waitable.
- invalid domain binding context, unsupported verification method, and inconsistent owner scope are non-retriable.
- each retry creates a new verification attempt id; old failed attempts remain historical state.

## Consequences

The platform can ship a durable domain binding workflow before adding DNS provider integrations while avoiding a blind one-click ownership confirmation by default.

DNS-gated confirmation creates an auditable Appaloft-observed state transition for ordinary public DNS cases. Manual override remains available for split-horizon DNS, private resolvers, reverse proxies, tunnels, or other cases where Appaloft's configured resolver view is not authoritative for the operator's environment. Confirmation-file route proof and provider integrations can later reuse the same attempt model.

Tests should cover both DNS verifier fakes and manual override without changing the domain event semantics.

## Governed Specs

- [domain-bindings.create Command Spec](../commands/domain-bindings.create.md)
- [domain-binding-requested Event Spec](../events/domain-binding-requested.md)
- [domain-bound Event Spec](../events/domain-bound.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [domain-bindings.create Implementation Plan](../implementation/domain-bindings.create-plan.md)

## Current Implementation Notes And Migration Gaps

Current code has a durable domain verification attempt model and records initial DNS observation
metadata on accepted bindings. `domain-bindings.confirm-ownership` should use the DNS ownership
verifier by default and keep manual confirmation as explicit override. It does not yet perform DNS
provider writes, user-triggered DNS rechecks, background retry scheduling, or confirmation-file route
proof.

## Superseded Open Questions

- Should DNS ownership verification be modeled in this command family or deferred to provider-specific integration commands?
- Should the first verification attempt id be part of this event payload or allocated by the verifier consumer?
- Which verification evidence should be persisted for audit before publishing `domain-bound`?
- Should DNS/domain ownership verification be adapter-owned, provider-owned, or implemented first as manual verification?
- Should DNS verification tests begin with a manual verification fake, a DNS adapter fake, or both?

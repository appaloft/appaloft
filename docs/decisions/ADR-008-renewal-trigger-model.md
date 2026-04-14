# ADR-008: Renewal Trigger Model

Status: Accepted

Date: 2026-04-14

## Decision

The first renewal trigger model is scheduler-driven renewal window detection that dispatches `certificates.issue-or-renew` with `reason = renew`.

Renewal window detection is a process-manager responsibility. It must create a new certificate attempt id and must not replay old certificate events as the renewal mechanism.

## Context

Certificate renewal is long-running operational work that depends on time, certificate expiry, provider state, and retry policy. It should not be hidden inside read-model queries or runtime proxy behavior.

The async lifecycle contract requires retries and attempts to be explicit. Renewal should follow the same rule.

## Options Considered

| Option | Rule | Result |
| --- | --- | --- |
| Scheduler-driven renewal window | A scheduler/process manager scans durable certificate state and dispatches renewal commands. | Accepted. |
| Event-driven renewal window | A certificate-issued event schedules a future durable timer/event. | Deferred. Requires durable delayed event/timer infrastructure. |
| Runtime proxy automatic renewal | Let proxy handle renewal without platform state. | Rejected for platform-owned certificate lifecycle. |
| Operator-only manual renewal | Operator dispatches renew command manually. | Allowed fallback, not the default automation model. |

## Chosen Rule

The scheduler/process manager must:

- query durable certificate state, not a UI read model;
- detect certificates entering the configured renewal window;
- skip certificates with in-flight renewal attempts;
- dispatch `certificates.issue-or-renew` with `reason = renew`;
- pass or create an idempotency key;
- persist renewal attempt state before publishing `certificate-requested`;
- record failures through `certificate-issuance-failed`.

The default renewal window should be a configurable policy. Until a policy is finalized, specs and tests should avoid hardcoding a specific number of days except inside test fixtures.

Domain readiness does not expire solely because time passes. Readiness may move to degraded or not-ready only when certificate expiry, failed renewal, route verification failure, explicit revalidation policy, or an operator command records a durable state transition.

Periodic revalidation can be added later as a separate scheduler/process-manager capability. It must not rewrite prior `domain-ready` facts.

## Consequences

Scheduler-driven renewal is operationally straightforward and does not require durable delayed events as a prerequisite.

The model keeps renewal observable through certificate attempts and events.

Future durable timer/event infrastructure can supersede the scheduler trigger without changing `certificates.issue-or-renew` command semantics.

## Governed Specs

- [certificates.issue-or-renew Command Spec](../commands/certificates.issue-or-renew.md)
- [certificate-requested Event Spec](../events/certificate-requested.md)
- [certificate-issued Event Spec](../events/certificate-issued.md)
- [certificate-issuance-failed Event Spec](../events/certificate-issuance-failed.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [certificates.issue-or-renew Implementation Plan](../implementation/certificates.issue-or-renew-plan.md)
- [certificates.import Implementation Plan](../implementation/certificates.import-plan.md)

## Current Implementation Notes And Migration Gaps

Current code has no durable certificate state, renewal window policy, scheduler integration for certificate renewal, or certificate attempt store.

## Superseded Open Questions

- Should certificate renewal be scheduled by a dedicated scheduler or by event-driven renewal window detection?
- Should domain readiness expire and require periodic revalidation?

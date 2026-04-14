# ADR-009: Certificates Import Command

Status: Accepted

Date: 2026-04-14

## Decision

Manual certificate import should be modeled as a separate command: `certificates.import`.

`certificates.issue-or-renew` remains responsible for provider-driven issuance and renewal attempts. It must not accept raw certificate private key material as a side-path for manual import.

## Context

Manual certificate import has different security and validation semantics than provider issuance. It handles private key material, certificate chains, expiry checks, and secret storage directly.

Keeping import separate preserves command semantics and prevents `certificates.issue-or-renew` from becoming a mixed provider/manual input collector.

## Options Considered

| Option | Rule | Result |
| --- | --- | --- |
| Separate `certificates.import` command | Import validates and stores operator-supplied cert/key material. | Accepted. |
| Add import mode to `certificates.issue-or-renew` | One command handles provider issuance, renewal, replacement, and manual import. | Rejected. It mixes different security boundaries. |
| Defer manual import entirely | Only provider issuance is supported. | Allowed for MVP, but the command boundary should remain reserved. |

## Chosen Rule

`certificates.import` should own manual certificate import when implemented.

The command should accept:

- `domainBindingId`;
- certificate chain material through a secret-safe input path;
- private key material through a secret-safe input path;
- optional passphrase through a secret-safe input path;
- optional `expiresAt` or parsed certificate metadata;
- `idempotencyKey`;
- `causationId` when event-driven.

The command must validate certificate/domain compatibility, expiry, key matching, and storage success before publishing any terminal success event.

Manual import success must publish `certificate-imported`. `certificate-issued` remains reserved for provider-driven issue/renew success.

`certificates.import` may be deferred from the MVP, but the command boundary is accepted and raw certificate private key material must not be added to `certificates.issue-or-renew`.

## Consequences

Manual import can satisfy `domain-ready` for bindings whose certificate policy is `manual` without overloading provider issuance.

Security-sensitive input and secret storage rules stay isolated from provider-driven issuance.

The MVP can defer implementation of `certificates.import` while keeping the command boundary explicit.

## Governed Specs

- [certificates.issue-or-renew Command Spec](../commands/certificates.issue-or-renew.md)
- [certificate-issued Event Spec](../events/certificate-issued.md)
- [domain-ready Event Spec](../events/domain-ready.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [certificates.import Implementation Plan](../implementation/certificates.import-plan.md)

## Current Implementation Notes And Migration Gaps

Current code has no durable certificate state, no manual import command, and no certificate secret storage workflow.

## Superseded Open Questions

- Should manual certificate import be part of this command or a separate `certificates.import` command?

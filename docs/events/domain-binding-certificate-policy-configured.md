# domain-binding-certificate-policy-configured Event Spec

## Meaning

An operator explicitly changed the certificate lifecycle policy of an active TLS-enabled durable
domain binding. This fact records intent and pending reconciliation; it is not evidence that a new
certificate has been issued, imported, activated, or served.

## Payload

- `domainBindingId`, `domainName`, `projectId`, `environmentId`, and `resourceId` identify the
  authoritative binding context.
- `previousCertificatePolicy` and `certificatePolicy` are `auto` or `manual`.
- `configuredAt`, optional `correlationId`, and optional `causationId` provide safe traceability.
- Certificate material, secret references, and passphrases are forbidden.

## Consequences

- The binding enters `certificate_pending` after ownership has already been established.
- `manual` permits a subsequent `certificates.import`; `auto` permits a subsequent
  `certificates.issue-or-renew`.
- The currently serving certificate remains active until the replacement passes route activation,
  proxy reload, and direct hostname/SNI proof.
- Repeating the current policy is idempotent and emits no duplicate event.

## Governing Sources

- [Command](../commands/domain-bindings.configure-certificate-policy.md)
- [ADR-104](../decisions/ADR-104-certificate-route-activation-reconciliation.md)
- [Certificate Route Activation Reconciliation](../specs/121-certificate-route-activation-reconciliation/spec.md)

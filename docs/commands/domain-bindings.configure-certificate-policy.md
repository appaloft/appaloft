# domain-bindings.configure-certificate-policy Command Spec

## Purpose

Explicitly select automatic or imported certificate lifecycle for an existing durable
`DomainBinding` without mixing certificate policy into generic route configuration.

## Input

```ts
interface ConfigureDomainBindingCertificatePolicyCommandInput {
  domainBindingId: string;
  certificatePolicy: "auto" | "manual";
  idempotencyKey?: string;
}
```

## Preconditions

- The binding exists, is active, uses TLS, and is visible in the execution tenant.
- The selected target supports durable domain routes and certificate activation.
- `disabled` is not accepted. TLS disablement requires a separately governed domain/TLS
  transition and must not silently downgrade HTTPS.

## Success

- Persist the selected certificate policy and a pending certificate reconciliation requirement.
- Preserve the currently serving certificate/route until replacement activation and proof succeed.
- `auto` permits a subsequent `certificates.issue-or-renew` attempt.
- `manual` permits a subsequent `certificates.import` attempt.
- Return `ok({ id, certificatePolicy, reconciliationStatus })` without certificate material.
- Repeating the same selected policy is idempotent and does not publish duplicate transition facts.

## Failure

- Missing binding: `not_found`, phase `certificate-policy-configuration`.
- TLS-disabled binding: `certificate_policy_not_allowed`, phase
  `certificate-policy-configuration`.
- Unsupported policy/unknown input: `validation_error`, phase `command-validation`.
- Persistence conflict: stable conflict/infra error with no partial ready transition.

## Side-Effect Boundary

The command does not import material, issue a certificate, activate/reload a proxy, or mark the
binding ready. Those steps remain explicit certificate commands and asynchronous reconciliation.

## Governing Sources

- [ADR-104](../decisions/ADR-104-certificate-route-activation-reconciliation.md)
- [Certificate Route Activation Reconciliation](../specs/121-certificate-route-activation-reconciliation/spec.md)
- [Routing, Domain Binding, And TLS Workflow](../workflows/routing-domain-and-tls.md)

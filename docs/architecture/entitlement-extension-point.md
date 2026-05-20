# Entitlement Extension Point

Appaloft exposes a neutral entitlement boundary for product capability checks that need to run at application, HTTP/RPC, worker, CLI, or UI discovery surfaces. Entitlement answers whether a subject is qualified to use a capability. It is separate from authorization, billing, pricing, quota, and license verification.

Community/local Appaloft registers a default entitlement port that allows capability usage with the stable reason `entitlement-default-allow`. Downstream distributions can replace the port through server extension composition.

The public query contract uses neutral language:

- `capabilityKey`: stable capability string.
- `tenantId`, `accountId`, `organizationId`: optional context references.
- `actor`, `resourceRefs`, `attributes`: optional request metadata.
- decision: `entitled | not_entitled | unknown`, boolean `entitled`, `mode`, `hint`, `reason`, `source`, and safe `details`.

The public contract intentionally does not define commercial plans, billing providers, subscriptions, Stripe objects, or private license verification.

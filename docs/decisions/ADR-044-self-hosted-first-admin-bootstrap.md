# ADR-044: Self-Hosted First Admin Bootstrap

## Status

Accepted

## Context

Self-hosted Appaloft must be usable before any OAuth provider is configured. Operators need a
first local administrator who can sign in, own the initial organization, and later configure OAuth,
members, deploy tokens, and role-aware mutation access.

The repository already carries Better Auth-compatible user, session, account, organization, member,
and invitation tables. Better Auth is the preferred runtime implementation, but Appaloft core and
application semantics must not depend on Better Auth types or route contracts.

## Decision

Self-hosted installs use an Appaloft-owned **first-admin bootstrap** workflow.

- The public bootstrap behavior is expressed through Appaloft command/query messages, not Better
  Auth routes.
- The application layer owns stable ports for local user/organization bootstrap and bootstrap
  status. A Better Auth adapter may implement those ports with Better Auth email/password and
  organization capabilities.
- `packages/core` must not import Better Auth or model Better Auth tables. Core owns organization
  and membership invariants through identity-governance value objects and aggregates.
- The first admin is created only when no Appaloft product admin/organization owner exists. After
  that, bootstrap becomes idempotent and must not create another local admin.
- If an installer supplies a password, it is accepted through trusted runtime configuration only and
  must not be written to logs, `.env` output summaries, read models, health, docs metadata, or error
  details. If no password is supplied, the installer/runtime may generate a one-time password and
  show it only through trusted install output.
- The first admin becomes organization owner of the initial self-hosted organization.
- Optional OAuth is a later login method. Missing OAuth configuration must never block the local
  first-admin path.
- Admin authorization gates for ordinary product mutations may depend on the first-admin session
  and organization membership after this bootstrap path exists.

## Consequences

- Deploy-token lifecycle surfaces stay private until first-admin/admin authorization gates are in
  place.
- Better Auth remains swappable: replacing it should require a new adapter for the application
  ports, not changes to core entities or application use-case semantics.
- The installer can print safe bootstrap status and one-time secrets without teaching operators
  Better Auth internals.
- Product auth failures use product-auth errors, distinct from self-hosted Action deploy-token
  errors.

## Related Specs

- [Self-Hosted First Admin Bootstrap](../specs/053-self-hosted-first-admin-bootstrap/spec.md)
- [Self-Hosted First Admin Bootstrap Workflow](../workflows/self-hosted-first-admin-bootstrap.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
- [Self-Hosted Product Auth Test Matrix](../testing/self-hosted-product-auth-test-matrix.md)
- [Self-Hosted Action Deploy Token Auth](../specs/052-self-hosted-action-deploy-token-auth/spec.md)

# ADR-045: Self-Hosted Organization Team Operations

## Status

Accepted

## Context

Phase 8 needs more than first-admin bootstrap. After the initial owner signs in, multiple
operators must be able to share a self-hosted Appaloft instance through organization membership,
role-aware access, and invitation-based onboarding. Better Auth provides useful runtime
capabilities for users, sessions, organizations, members, and invitations, but Appaloft core and
application semantics must remain portable to another auth implementation.

ADR-044 created the first local administrator and initial organization owner behind Appaloft-owned
bootstrap ports. This decision governs the ordinary post-bootstrap organization/team operations
that use that first organization.

## Decision

Self-hosted organization/team management is expressed through Appaloft-owned command/query
messages and application ports.

- The `Organization` aggregate remains the owner of membership and role invariants in
  `packages/core`. Owner changes are a dedicated ownership transfer operation; generic role update
  and remove-member commands cannot change or remove owner members.
- The application layer defines stable ports for member/invitation commands and organization
  context reads. A Better Auth adapter may implement those ports with Better Auth organization,
  member, invitation, and session APIs.
- `packages/core` must not import Better Auth or model Better Auth tables.
- Application command/query inputs and outputs must use Appaloft terms: organization, member,
  invitation, current user, current organization, and organization role.
- Current organization selection is an Appaloft command over the signed-in product session. It may
  delegate the active-organization write to the auth adapter, but the command input, output,
  authorization policy, and public contracts remain Appaloft-owned and portable.
- Ordinary organization/team management is protected by the product-session authorization policy:
  missing sessions fail with `product_auth_missing`/`401`, and authenticated users outside the
  organization or without the required role fail with `product_auth_forbidden`/`403`.
- The first self-hosted organization is still created by `auth.bootstrap-first-admin`. Phase 8 does
  not add general multi-organization creation unless a later roadmap entry explicitly pulls that
  behavior forward.
- Invitation acceptance may use auth-provider email verification or invite-link mechanics behind
  an adapter, but Appaloft read models must expose only safe invitation metadata and never expose
  provider tokens or raw invite secrets.

## Consequences

- Replacing Better Auth requires a new adapter for the organization/team application ports, not
  changes to core entities, application use cases, or transport contracts.
- Web, CLI, HTTP/oRPC, and future MCP surfaces can share the same operation catalog entries for
  current organization selection, member list, invitation, non-owner role update, ownership
  transfer, non-owner member removal, and current context reads.
- Role-aware access can be broadened from mutation gates to read/context surfaces without making
  Svelte components or transport adapters own membership policy.
- Public docs can explain team invitations and role recovery without exposing Better Auth internals.

## Related Specs

- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
- [Self-Hosted Product Auth Test Matrix](../testing/self-hosted-product-auth-test-matrix.md)
- [Identity Governance Test Matrix](../testing/identity-governance-test-matrix.md)
- [Self-Hosted First Admin Bootstrap](../specs/053-self-hosted-first-admin-bootstrap/spec.md)

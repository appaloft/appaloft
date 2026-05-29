# Plan: Self-Hosted Organization Team Operations

## Source Of Truth

- Roadmap target: Phase 8 `0.10.0` self-hosted auth and organization bootstrap.
- Decisions/ADRs: [ADR-044](../../decisions/ADR-044-self-hosted-first-admin-bootstrap.md) and
  [ADR-045](../../decisions/ADR-045-self-hosted-organization-team-operations.md).
- Domain model: identity governance `Organization`.
- Error contracts: [Self-Hosted Product Auth Errors](../../errors/self-hosted-product-auth.md).
- Test matrices: [Self-Hosted Product Auth Test Matrix](../../testing/self-hosted-product-auth-test-matrix.md)
  and [Identity Governance Test Matrix](../../testing/identity-governance-test-matrix.md).

## Code Round Shape

- Core:
  - extend `Organization` with intention methods for non-owner role updates, ownership transfer,
    and non-owner member removal while keeping duplicate membership, seat policy, and owner
    protection rules inside the aggregate;
  - add value-object/state-machine behavior only where needed for role transition questions.
- Application:
  - add Appaloft-owned organization/team ports for current-context reads, current organization
    switching, member list reads, invitation creation, non-owner role update, ownership transfer,
    and member removal;
  - add command/query messages, handlers, and use cases/query services for
    `organizations.current-context`, `organizations.switch-current`,
    `organizations.list-members`, `organizations.list-invitations`, `organizations.invite-member`,
    `organizations.change-member-role`, `organizations.transfer-owner`, and
    `organizations.remove-member`;
  - keep Better Auth out of application types and only depend on stable ports/tokens.
- Auth adapter:
  - implement the application ports in `@appaloft/auth-better` with Better Auth organization,
    member, invitation, and session capabilities;
  - translate Better Auth failures into Appaloft product-auth/application errors.
- Persistence/read models:
  - read safe member and invitation metadata through `packages/persistence/pg` or the auth adapter
    boundary;
  - never expose raw invite secrets, session tokens, OAuth tokens, cookies, or provider payloads.
- Entrypoints:
  - expose HTTP/oRPC routes behind product-session authorization;
  - add CLI commands after operation-catalog entries exist;
  - add Web current organization switch/member management surfaces with i18n keys;
  - reserve future MCP descriptors for the same schemas.
- Public docs:
  - add task-oriented self-hosting docs for inviting operators, managing non-owner roles,
    transferring ownership, removing non-owner members, and recovering from `401`/`403`.

## Test Strategy

- Core unit tests:
  - extend `IDENTITY-DOMAIN-001` or add `IDENTITY-DOMAIN-002`/`IDENTITY-DOMAIN-003` for non-owner
    role update, ownership transfer, non-owner member removal, and owner protection.
- Application tests:
  - prove commands/queries call Appaloft-owned ports and return safe DTOs;
  - prove duplicate active membership is rejected and owner role/removal changes require transfer.
- Auth adapter tests:
  - prove Better Auth implements the ports without leaking Better Auth types into application.
- HTTP/oRPC and CLI contract tests:
  - prove missing session returns `401`, insufficient role returns `403`, and authorized owners can
    list/invite/update/transfer/remove through command/query dispatch.
- Web tests:
  - prove current organization switch/member management surfaces use i18n copy and shared client
    contracts.
- Docs/help tests:
  - prove public help anchors exist for organization/team operations.

## Compatibility And Release Notes

- Compatibility policy: `pre-1.0-policy`.
- Public impact: adds new auth/organization operations, CLI/API/Web surfaces, public help anchors,
  and stable product-auth error recovery guidance.
- Release outcome: required before selecting `0.10.0`; otherwise Phase 8 remains incomplete.

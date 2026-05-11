# Tasks: Self-Hosted Organization Team Operations

## Test-First

- [x] `ORG-TEAM-CONTEXT-001`: add application/HTTP test proving current context returns safe user,
  organization, role, selectable organization, and login method metadata without secret material.
- [x] `ORG-TEAM-SWITCH-001`: add application/HTTP/Web test proving current organization switch
  accepts only organizations visible to the signed-in product user and returns refreshed safe
  context without leaking session/provider payloads.
- [x] `ORG-TEAM-MEMBERS-001`: add application/read-model test proving member list returns safe
  member metadata and roles.
- [x] `ORG-TEAM-INVITE-001`: add application/adapter test proving invite-member creates a safe
  invitation through an Appaloft-owned port and rejects duplicate active membership.
- [x] `ORG-TEAM-ROLE-001`: add core/application test proving role update preserves at least one
  owner.
- [x] `ORG-TEAM-REMOVE-001`: add core/application test proving remove member preserves at least one
  owner and rejects unauthorized removal.
- [x] `ORG-TEAM-AUTH-001`: add HTTP/oRPC tests proving missing sessions return `401` and
  insufficient roles return `403` before dispatch.
- [x] `ORG-TEAM-ADAPTER-001`: add Better Auth adapter tests proving Better Auth stays behind
  Appaloft-owned ports.
- [x] `ORG-TEAM-DOCS-001`: add docs/help tests for organization/team public help anchors.
- [x] `ORG-TEAM-WEB-001`: add Web source test proving `/organization` uses shared
  `organizations.*` oRPC contracts for current context, member list, invitations, invite, role
  update, and remove.
- [x] `ORG-TEAM-WEB-002`: add Web source test proving `/organization` uses shared
  `deployTokens.*` contracts for token list/create/rotate/revoke and does not couple to the auth
  runtime.
- [x] `ORG-TEAM-WEB-003`: add Web help test proving organization/team Web help points at the
  stable public docs anchor.

## Source Of Truth

- [x] Add ADR-045 for organization/team operation ownership and Better Auth boundary.
- [x] Add feature artifact `docs/specs/054-self-hosted-organization-team-operations`.
- [x] Position organization/team operations in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Add accepted-candidate organization/team operations to `docs/CORE_OPERATIONS.md`.
- [x] Add command/query specs for current context, member list, invitation list, invite member,
  change member role, and remove member.
- [x] Add command spec for current organization switching.
- [x] Extend self-hosted product-auth and identity-governance test matrices.

## Implementation

- [x] Extend `Organization` core behavior for role update, member removal, and at-least-one-owner
  policy.
- [x] Add application-owned organization/team ports and DI tokens.
- [x] Add current-context query service and message/handler.
- [x] Add switch-current use case and message/handler.
- [x] Add list-members and list-invitations query services and messages/handlers.
- [x] Add invite-member, change-member-role, and remove-member use cases plus messages/handlers.
- [x] Implement organization/team ports in `@appaloft/auth-better`.
- [x] Add safe persistence/read-model adapters where the auth adapter does not already own the read.
- [x] Add operation-catalog entries and application exports.
- [x] Wire HTTP/oRPC routes behind product-session authorization.
- [x] Add CLI organization/team commands over the same command/query messages.
- [x] Add operation-catalog entry and application exports for `organizations.switch-current`.
- [x] Wire switch-current HTTP/oRPC route behind product-session authorization.
- [x] Add CLI organization switch command over the same command message.
- [x] Add Web current organization/member management surfaces with i18n keys.
- [x] Add Web current organization switch surface with i18n keys.

## Entrypoints And Docs

- [x] Add public docs/help for inviting operators, member list, role update, removal, and current
  context.
- [x] Add public docs/help coverage for switching current organization.
- [x] Update Web help anchors to point at stable public docs after Web organization/team surfaces
  exist.
- [x] Update future MCP/tool descriptor notes when command/query schemas are active.

## Verification

- [x] Run targeted core organization tests.
- [x] Run targeted application organization/team tests.
- [x] Run targeted switch-current application/HTTP/Web tests.
- [x] Run targeted Better Auth adapter organization/team tests.
- [x] Run targeted HTTP/oRPC organization/team contract tests.
- [x] Run targeted CLI organization/team command tests.
- [x] Run Web typecheck/tests for organization/team surfaces after Web implementation.
- [x] Run docs/help registry tests.
- [x] Run Better Auth boundary check proving no direct Better Auth imports in `packages/core` or
  `packages/application`.

## Post-Implementation Sync

- [x] Reconcile roadmap Phase 8 notes, `BUSINESS_OPERATION_MAP.md`, `CORE_OPERATIONS.md`,
  operation catalog, specs, test matrices, public docs, and remaining migration gaps.

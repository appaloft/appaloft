# Self-Hosted Organization Team Operations

## Status

- Round: Spec Round
- Artifact state: accepted-candidate

## Business Outcome

A self-hosted Appaloft owner can see the current signed-in user and organization context, invite
another operator into the initial organization, list members and pending invitations, change member
roles, and remove members without exposing Better Auth internals to core, application, transport
contracts, Web, CLI, or public docs.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Current user | The signed-in product user represented by the active product session. | Product auth / identity governance | session user |
| Current organization | The organization selected or implied for product operations in the current session. | Identity governance | active organization |
| Organization member | A product user with a role inside an Appaloft organization. | Identity governance | team member |
| Organization role | The role that gates organization/team and product operations. | Identity governance / product auth | member role |
| Organization invitation | A safe pending invitation for an email address to join an organization with a role. | Identity governance / auth adapter | team invite |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ORG-TEAM-SPEC-001 | Current context read | A signed-in product user belongs to the initial organization | Current context is queried | The result includes safe current user metadata, current organization id/name/slug, organization role, selectable organizations, and configured login methods without session tokens or provider payloads. |
| ORG-TEAM-SPEC-002 | Member list | An owner or admin is signed in | Organization members are listed | The result contains safe member metadata, roles, joined timestamps, and invitation-safe links to pending invites without exposing auth-provider internals. |
| ORG-TEAM-SPEC-003 | Invite member | An owner or admin invites an email address with a role | The invite command runs | A safe organization invitation is created through an Appaloft port, duplicate active membership is rejected, and raw invite tokens are not returned by ordinary read models. |
| ORG-TEAM-SPEC-004 | Change member role | An owner changes another member's role | The role update command runs | The member role changes only if the actor has permission and the organization keeps at least one owner. |
| ORG-TEAM-SPEC-005 | Remove member | An owner removes a member | The remove command runs | The member is removed or deactivated only if the organization keeps at least one owner; removing self as the last owner is rejected. |
| ORG-TEAM-SPEC-006 | Unauthorized organization/team operation | A request has no product session or an insufficient organization role | Any organization/team operation runs | Missing sessions fail with `product_auth_missing`/`401`; insufficient role or non-member access fails with `product_auth_forbidden`/`403` before command/query dispatch. |
| ORG-TEAM-SPEC-007 | Better Auth adapter boundary | Better Auth implements the runtime organization capability | Appaloft commands/queries call the application ports | Better Auth types, route contracts, provider payloads, session tokens, and invite secrets do not leak into core or application public APIs. |
| ORG-TEAM-SPEC-008 | Switch current organization | A signed-in product user belongs to more than one visible organization | The user selects another organization as current | The active product session records the selected organization through an Appaloft-owned command/port, rejects non-visible organizations with `product_auth_forbidden`/`403`, and returns refreshed safe current context. |

## Domain Ownership

- Bounded context: identity governance.
- Aggregate owner: `Organization` owns membership and role invariants, including duplicate
  membership, seat capacity, role changes, member removal, and at-least-one-owner rules.
- Adapter boundary: user/session lookup, invitation delivery, invitation acceptance, and provider
  account details are auth-runtime concerns behind Appaloft-owned application ports.
- Upstream/downstream contexts: HTTP/oRPC, CLI, Web, installer, and future MCP surfaces dispatch
  Appaloft commands/queries. They must not manipulate Better Auth tables directly.

## Public Surfaces

- API/oRPC: admin-protected organization/team operations dispatch Appaloft messages.
- CLI: organization/team management commands may be added for operators who manage self-hosted
  instances without using Web.
- Web/UI: current organization context, current organization switching, member list, invitation,
  role update, and member removal are Phase 8 Web surfaces and must use `packages/i18n` keys.
- Public docs/help: explain current organization context and switching, inviting operators, role
  changes, member removal, and common `401`/`403` recovery without exposing Better Auth internals.
- Future MCP: organization/team tools should use the same command/query schemas as HTTP/oRPC.

## Non-Goals

- General multi-organization creation beyond the first organization created by
  `auth.bootstrap-first-admin`.
- Billing, seat purchase, SSO policy, SCIM provisioning, audit-log export, or cross-organization
  tenant administration.
- Exposing raw invitation tokens, session tokens, OAuth provider tokens, cookies, or Better Auth
  internal table shapes in Appaloft contracts.

## Current Implementation Notes And Migration Gaps

- `Organization` already exists in `packages/core` with membership and seat policy foundations.
- `Organization` now owns role update, member removal, and at-least-one-owner protection for the
  core domain slice, covered by `IDENTITY-DOMAIN-002`.
- Better Auth-compatible organization, member, and invitation tables already exist in persistence.
- Product-session authorization gates already protect product mutations through an Appaloft-owned
  port, and deploy-token lifecycle HTTP/oRPC/CLI routes are admin-protected.
- Organization/team command/query specs, application ports, application handlers/use cases/query
  services, operation-catalog entries, core role/removal behavior, and the `@appaloft/auth-better`
  organization/team port implementation are active.
- HTTP/oRPC routes are active at `GET /api/organizations/current-context`,
  `POST /api/organizations/current-context/switch`,
  `GET /api/organizations/{organizationId}/members`,
  `GET /api/organizations/{organizationId}/invitations`,
  `POST /api/organizations/{organizationId}/invitations`,
  `POST /api/organizations/{organizationId}/members/{memberId}/role`, and
  `DELETE /api/organizations/{organizationId}/members/{memberId}`. These routes dispatch through
  `QueryBus`/`CommandBus`, authorize through `ProductSessionAuthorizationPort` before dispatch, and
  pass request auth headers through `ExecutionContext.auth` for the auth adapter boundary.
- CLI commands are active at `appaloft organization context`,
  `appaloft organization switch <organizationId>`,
  `appaloft organization members list`, `appaloft organization invitations list`,
  `appaloft organization member invite`, `appaloft organization member role <memberId>`, and
  `appaloft organization member remove <memberId>`. CLI execution reads
  `APPALOFT_AUTH_COOKIE` and `APPALOFT_AUTHORIZATION` into `ExecutionContext.auth` so the same
  organization/team port can verify the current product session without Better Auth leaking into CLI
  command construction.
- Public docs/help coverage is active under `self-hosting.organization-team-management`, anchored
  at `/docs/self-hosting/organization-team-management/#self-hosting-organization-team-management`,
  for current context, current organization switching, member and invitation lists, invitation,
  role updates, removal, CLI session handoff, safe outputs, owner-retention recovery, and product
  auth `401`/`403` recovery.
- Web `/organization` is active for current organization context, safe member and invitation reads,
  current organization switching, invite, role update, member removal, and deploy-token
  list/create/rotate/revoke. The page uses `packages/i18n` keys and shared oRPC clients for the
  existing application command/query contracts; it does not depend on Better Auth runtime details.
- `organizations.switch-current` is active through the application message/use case, operation
  catalog, HTTP/oRPC route, CLI command, Web switch control, public docs, and
  `ORG-TEAM-SWITCH-001` automation.
- Better Auth default organization roles are adapted to Appaloft roles at the adapter boundary:
  `owner` and `admin` round-trip directly, while Better Auth `member` currently maps back to
  Appaloft `developer` until richer custom-role persistence is added.
- Broader browser-driven self-hosted auth end-to-end tests remain Phase 8 follow-up Code Round work.

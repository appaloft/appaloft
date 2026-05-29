# Account And Organization Settings

## Status

- Round: Code Round
- Artifact state: selected behavior with ADR, operation catalog, test matrix, and Web/API work in
  progress

## Business Outcome

A signed-in Appaloft operator can manage their own profile and account sessions, and an
organization owner or admin can manage organization profile settings, team access, deploy tokens,
ownership transfer, and owner-gated organization deletion from settings pages that share a
console-style sidebar.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Account profile | Safe display metadata for the signed-in product user. | Identity governance | user profile |
| Account session | A safe read model for one signed-in user's auth session. | Identity governance / auth adapter | device session |
| Account danger zone | Explicit destructive account action area requiring confirmation. | Web/API settings | delete account |
| Organization profile | Safe name, slug, and logo metadata for an Appaloft organization. | Identity governance | team profile |
| Organization settings | Sidebar-driven organization configuration, including profile, members, invitations, deploy tokens, and danger zone. | Web/API settings | team settings |
| Ownership transfer | Dedicated organization settings action for moving owner responsibility to another member. | Web/API settings / identity governance | transfer owner |
| Danger zone | A destructive operation area with exact confirmation and owner/session authorization. | Web/API settings | destructive settings |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ACCOUNT-SETTINGS-SPEC-001 | Read account profile | A signed-in product user opens account settings | Account profile is queried | Safe user id, email, display name, avatar URL, email verification status, and creation/update timestamps are returned without session tokens or provider payloads. |
| ACCOUNT-SETTINGS-SPEC-002 | Change account profile | A signed-in product user edits display name or avatar URL | Account profile change command runs | The auth adapter changes only display name and avatar URL, returns the safe profile read model, and leaves email/password/security policy unchanged. |
| ACCOUNT-SETTINGS-SPEC-003 | List account sessions | A signed-in product user opens sessions | Account sessions are queried | Safe bounded session metadata is returned, marks the current session when detectable, and never exposes session token material. |
| ACCOUNT-SETTINGS-SPEC-004 | Revoke account session | A signed-in product user revokes one non-current or current session | Session revoke command runs | The target session is revoked through the auth adapter and a safe revoked-at response is returned. |
| ACCOUNT-SETTINGS-SPEC-005 | Delete account | A signed-in product user enters exact user-id confirmation | Account deletion command runs | The signed-in account is deleted through the auth adapter, session state becomes unusable, and organization/resource/deployment/deploy-token/audit data is not cascaded. |
| ORG-SETTINGS-SPEC-001 | Read organization profile | A signed-in organization member opens organization profile settings | Organization profile is queried | Safe organization id, name, slug, logo URL, role, permissions, and timestamps are returned. |
| ORG-SETTINGS-SPEC-002 | Change organization profile | An owner/admin edits organization name, slug, or logo URL | Organization profile change command runs | The auth adapter changes only organization profile metadata and returns the safe profile read model. |
| ORG-SETTINGS-SPEC-003 | Delete organization | An owner enters exact organization-id confirmation | Organization delete command runs | The auth adapter deletes the organization record/members/invitations where supported, returns a safe deleted-at response, and does not cascade Appaloft resource/deployment/deploy-token/audit/runtime state. |
| ORG-SETTINGS-SPEC-004 | Transfer owner | An owner opens organization member settings | Ownership transfer command runs | Owner rows expose only ownership transfer controls, while generic role update and remove controls stay limited to non-owner members. |
| SETTINGS-WEB-SPEC-001 | Settings sidebar navigation | A signed-in user opens account or organization settings | Web renders the settings shell | Account settings and organization settings use a dedicated console-style sidebar with different item sets, localized copy, route-scoped loading, profile-only organization summary metrics, organization invitation and deploy-token collection pages render one empty state instead of inline empty lists/forms, create actions live in the page header and open URL-synchronized dialogs, and Web has no Better Auth coupling. |

## Domain Ownership

- Bounded context: identity governance.
- Resource owner: account profile/session state is owned by the auth adapter behind
  `AccountSettingsPort`; organization membership/profile/invitation state is owned by the
  organization settings/team port.
- Upstream/downstream contexts: HTTP/oRPC, Web, CLI, and future MCP dispatch Appaloft
  commands/queries. They must not manipulate Better Auth tables directly.

## Public Surfaces

- API/oRPC: product-session protected account and organization settings operations.
- CLI: deferred for account settings; existing organization/team/deploy-token CLI commands remain
  active.
- Web/UI: account profile, security, sessions, and danger-zone pages; organization profile,
  members, invitations, deploy tokens, and danger-zone pages.
- Config: not applicable.
- Events: not added in this slice.
- Public docs/help: existing self-hosted organization/team docs remain the main help anchor; account
  settings public docs are deferred until the docs IA selects a user-account page.

## Non-Goals

- General multi-organization creation.
- Invitation revoke/resend, SSO, SCIM, MFA/passkeys, audit-log export, or bulk session revocation.
- Cascading Appaloft project/resource/deployment/deploy-token cleanup from account or organization
  deletion.
- Moving password/email security flows out of the existing configured auth-runtime status/endpoints.

## Open Questions

- Which public docs page should become the durable account settings help anchor?

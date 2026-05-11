# Self-Hosted First Admin Bootstrap

## Status

- Round: Spec Round
- Artifact state: accepted-candidate

## Business Outcome

A new self-hosted Appaloft operator can install the product, open the printed console URL, and sign
in with a local first-admin account without configuring Google, GitHub, or OIDC first. The first
admin owns the initial organization and can later manage OAuth, team members, deploy tokens, and
role-aware product mutations.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| First admin | The first local user account allowed to administer a self-hosted Appaloft instance. | Identity governance / product auth | local admin, bootstrap admin |
| Initial organization | The first organization owned by the first admin on a self-hosted instance. | Identity governance | self-hosted organization |
| Bootstrap secret | A trusted installer-provided or generated one-time password for the first admin account. | Installer / auth adapter | initial admin password |
| Product session | A user login session for console/API product operations. | Auth runtime | Better Auth session |
| Admin authorization policy | The product mutation gate that maps authenticated users and organization roles to 401/403 outcomes. | Application / transport | role gate |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| FIRST-ADMIN-SPEC-001 | Bootstrap status before setup | A self-hosted instance has no first admin | Bootstrap status is queried | The result says bootstrap is required, no secret is exposed, and OAuth availability is reported separately. |
| FIRST-ADMIN-SPEC-002 | Installer-provided first admin | Trusted install config provides email, display name, and password | Bootstrap runs | A local product user is created through the auth adapter, the initial organization is created, the user becomes owner, and no password appears in logs or read models. |
| FIRST-ADMIN-SPEC-003 | Generated first-admin password | Trusted install config provides email and display name but no password | Bootstrap runs | A strong one-time password is generated behind an application-owned abstraction, returned only to trusted bootstrap output once, and never persisted in raw form by Appaloft code. |
| FIRST-ADMIN-SPEC-004 | Idempotent after first admin exists | A first admin or organization owner already exists | Bootstrap runs again | The workflow returns safe existing status and does not create another user, organization, member, or raw password output. |
| FIRST-ADMIN-SPEC-005 | OAuth optional | No OAuth provider is configured | First-admin bootstrap and login are attempted | Local email/password login remains available and OAuth providers are reported disabled with safe setup hints. |
| FIRST-ADMIN-SPEC-006 | Admin gate foundation | A product mutation endpoint is not explicitly public | Request lacks a valid product session | The adapter returns `401` before dispatch; if a session exists but lacks organization role, it returns `403`. |

## Domain Ownership

- Bounded context: identity governance.
- Aggregate owner: organization membership and role semantics belong to the `Organization`
  aggregate. User/session creation is an auth-runtime adapter concern behind application ports.
- Upstream/downstream contexts: installer and HTTP/oRPC may trigger bootstrap/status commands, but
  they must not manipulate auth tables directly.

## Public Surfaces

- API: bootstrap status and first-admin bootstrap are documented public bootstrap endpoints until
  setup is complete. They dispatch Appaloft messages.
- CLI/installer: `install.sh` may pass trusted first-admin config and print console URL, bootstrap
  status, configured login methods, and generated one-time password when applicable. Operators can
  also call `appaloft auth bootstrap-status` and `appaloft auth bootstrap-first-admin` through the
  same application messages.
- Web/UI: first-admin onboarding is a Phase 8 Web surface and must use i18n keys.
- Config: local first-admin email/name/password, optional output file, OAuth provider settings, and
  trusted browser origin are runtime config only. Password values and OAuth client secrets are
  secrets.
- Public docs/help: explain first install login, local admin bootstrap, optional OAuth, and recovery
  without exposing Better Auth internals.

## Non-Goals

- Implementing Web-based OAuth provider management UI in this slice.
- Implementing full member invitation and role update flows in this slice.
- Exposing deploy-token lifecycle management before admin authorization gates are active.
- Making Better Auth a core/application dependency.

## Current Implementation Notes And Migration Gaps

- Better Auth-compatible tables and the `@appaloft/auth-better` runtime exist.
- `@appaloft/auth-better` reports GitHub, Google, and generic OIDC login availability through
  Appaloft-owned status shapes. A provider is disabled unless its client id, client secret, callback
  URL, and trusted browser origin are configured.
- Web can query auth-session status and has local first-admin/login surfaces. Web `/organization`
  now covers current organization switching, member invitation, and deploy-token management through
  the same oRPC contracts.

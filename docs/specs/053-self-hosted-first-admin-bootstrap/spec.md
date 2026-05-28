# Self-Hosted First Admin Bootstrap

## Status

- Round: Post-Implementation Sync
- Artifact state: active baseline; broader browser-driven self-hosted auth smoke remains a Phase 8
  follow-up hardening gap

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
| FIRST-ADMIN-SPEC-002 | Installer-provided first admin | Trusted install config provides email, display name, and password | Bootstrap runs | A local product user is created through the auth adapter, the stable self-hosted organization tenant is created or reused, the user becomes owner, and no password appears in logs or read models. |
| FIRST-ADMIN-SPEC-003 | Generated first-admin password | Trusted install config provides email and display name but no password | Bootstrap runs | A strong one-time password is generated behind an application-owned abstraction, returned only to trusted bootstrap output once, and never persisted in raw form by Appaloft code. |
| FIRST-ADMIN-SPEC-004 | Idempotent after first admin exists | A first admin or organization owner already exists | Bootstrap runs again | The workflow returns safe existing status and does not create another user, organization, member, or raw password output. |
| FIRST-ADMIN-SPEC-005 | OAuth optional | No OAuth provider is configured | First-admin bootstrap and login are attempted | Local email/password login remains available and OAuth providers are reported disabled with safe setup hints. |
| FIRST-ADMIN-SPEC-006 | Admin gate foundation | A product mutation endpoint is not explicitly public | Request lacks a valid product session | The adapter returns `401` before dispatch; if a session exists but lacks organization role, it returns `403`. |
| FIRST-ADMIN-SPEC-007 | Navigation gate before console boot | A self-hosted instance has no first admin | A browser requests a console document route such as `/` or a project/resource deep link | The HTTP adapter redirects directly to `/bootstrap/auth/first-admin` before serving the SPA shell; API endpoints, docs routes, static assets, ACME challenges, and the first-admin route itself are not redirected. |
| FIRST-ADMIN-SPEC-008 | Startup config bootstrap | Trusted runtime config supplies first-admin email and password | Appaloft server starts | The server checks bootstrap status during startup, creates the first local admin and initial organization when required, suppresses password output, and no-ops after an admin or organization owner exists. |
| FIRST-ADMIN-SPEC-009 | Completed bootstrap hides setup surfaces | A first admin or organization owner already exists | A browser opens the login page, visits the first-admin setup page, or calls the first-admin setup endpoint | Login uses ordinary account language, the login page does not show a create-admin action, the setup page redirects to login unless it just created the account in the current flow, and the setup endpoint returns `404` before input validation or command dispatch. |
| FIRST-ADMIN-SPEC-010 | Product session navigation gate | A first admin exists and a browser has no product session | A browser requests a console document route such as `/`, `/projects`, or `/servers` | The HTTP adapter redirects to `/login?next=...` before serving the SPA shell; login, API endpoints, docs routes, static assets, ACME challenges, and first-admin setup routes are not redirected. |
| FIRST-ADMIN-SPEC-011 | Product account signup stays separate from first-admin bootstrap | Product signup is enabled for ordinary users | A browser opens `/sign-up` or calls `/api/auth/sign-up/email` | The signup page and signup API stay public, are not redirected by the console navigation gate, create an ordinary product account, and start organization setup without exposing first-admin bootstrap controls or language. |

## Domain Ownership

- Bounded context: identity governance.
- Aggregate owner: organization membership and role semantics belong to the `Organization`
  aggregate. User/session creation is an auth-runtime adapter concern behind application ports.
- The initial self-hosted organization uses the stable `org_self_hosted` tenant boundary so
  installer, CLI, and HTTP product-session paths see the same project/server/resource data.
- Upstream/downstream contexts: installer and HTTP/oRPC may trigger bootstrap/status commands, but
  they must not manipulate auth tables directly.

## Public Surfaces

- API: bootstrap status is a documented public endpoint. First-admin bootstrap is public only while
  setup is incomplete; after a first admin or organization owner exists, the setup endpoint must
  return `404` before dispatching the create command.
- CLI/installer: `install.sh` may pass trusted first-admin config and print console URL, bootstrap
  status, configured login methods, and generated one-time password when applicable. Operators can
  also call `appaloft auth bootstrap-status` and `appaloft auth bootstrap-first-admin` through the
  same application messages.
- Web/UI: first-admin onboarding is a Phase 8 Web surface and must use i18n keys. Production
  console document navigation is gated by the backend before the SPA shell is served. Before
  bootstrap, the gate sends operators to first-admin setup; after bootstrap, missing product
  sessions are sent to `/login?next=...`. `/login` and `/sign-up` are ordinary account surfaces,
  not console document routes, and signup starts ordinary organization setup rather than first-admin
  bootstrap. Local Vite dev/preview uses the same bootstrap-status endpoint as a server middleware
  gate.
- Config: local first-admin email/name/password, optional initial organization name/slug, optional
  output file, OAuth provider settings, and trusted browser origin are runtime config only. Password
  values and OAuth client secrets are secrets. Supplying email and password without an output file is
  an explicit startup bootstrap request; supplying email without password still requires a trusted
  output file so generated passwords are not lost.
- Public docs/help: explain first install login, local admin bootstrap, optional OAuth, and recovery
  without exposing Better Auth internals. Login copy must use ordinary account language after setup
  and must not tell users to use an administrator account.

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

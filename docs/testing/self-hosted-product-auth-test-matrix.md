# Self-Hosted Product Auth Test Matrix

## Normative Contract

Phase 8 product-auth tests must prove that a self-hosted instance can bootstrap a first local admin
without OAuth, that bootstrap is one-time and secret-safe, and that product mutations are protected
by session and organization-role authorization.

## Global References

- [ADR-044: Self-Hosted First Admin Bootstrap](../decisions/ADR-044-self-hosted-first-admin-bootstrap.md)
- [Self-Hosted First Admin Bootstrap](../specs/053-self-hosted-first-admin-bootstrap/spec.md)
- [Self-Hosted First Admin Bootstrap Workflow](../workflows/self-hosted-first-admin-bootstrap.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
- [Error Model](../errors/model.md)

## Matrix

| Test ID | Preferred automation | Case | Given | Expected result | Expected error | Expected operation sequence |
| --- | --- | --- | --- | --- | --- | --- |
| FIRST-ADMIN-STATUS-001 | application/query | Bootstrap status | No first admin exists, then one exists | Status reports required before setup and complete after setup without secret output | None | Read status -> safe result |
| FIRST-ADMIN-BOOTSTRAP-001 | application/adapter | Supplied password bootstrap | Trusted config supplies email, display name, and password | Local user and initial organization owner are created through Appaloft auth port | None or `first_admin_bootstrap_failed` | Status check -> auth adapter create user -> create org owner |
| FIRST-ADMIN-BOOTSTRAP-002 | application/unit | Generated password bootstrap | Trusted config supplies email/name and no password | A strong password is generated and returned once to trusted output only | None | Generate password -> bootstrap -> one-time output |
| FIRST-ADMIN-BOOTSTRAP-003 | application/integration | Bootstrap idempotency | A first admin or organization owner already exists | No new user, organization, member, or password output is created | `first_admin_bootstrap_disabled` or safe complete status | Status check -> no-op |
| FIRST-ADMIN-BOOTSTRAP-004 | auth-adapter | Better Auth implementation boundary | `@appaloft/auth-better` implements the Appaloft bootstrap port | Better Auth creates email/password user plus organization owner without Better Auth types leaking into application | None | Appaloft port -> Better Auth API |
| FIRST-ADMIN-BOOTSTRAP-005 | config/auth-adapter | Optional OAuth provider configuration | GitHub, Google, or OIDC config is incomplete, then complete | Provider login remains disabled until client id, client secret, callback URL, and trusted origin are all configured; first-admin local login remains available | None or `oauth_provider_unavailable` | Config read -> Appaloft auth status -> safe login method summary |
| FIRST-ADMIN-BOOTSTRAP-006 | shell/server startup | Startup config bootstrap | Trusted runtime config supplies `APPALOFT_FIRST_ADMIN_EMAIL` and `APPALOFT_FIRST_ADMIN_PASSWORD` without a handoff file | Startup checks status, creates the first admin and initial organization when required, returns safe status, and never echoes or writes the supplied password | None or `first_admin_bootstrap_failed` | Status check -> bootstrap command -> safe result |
| FIRST-ADMIN-NAV-001 | HTTP/adapter contract | First-admin navigation gate before SPA boot | No first admin exists and a browser requests a console document route | The HTTP adapter redirects to `/bootstrap/auth/first-admin` before serving Web static fallback; API, docs, static assets, ACME, and the first-admin setup route are not redirected | None or bootstrap-status lookup failure falls back to ordinary static routing | Document request -> bootstrap status query -> redirect or static routing |
| SELF-HOSTED-AUTH-ARCH-001 | architecture/unit | Auth provider dependency boundary | Core and application source code are scanned | `packages/core/src` and `packages/application/src` contain only Appaloft-owned auth abstractions and no Better Auth package/type markers | None | Source scan -> boundary assertion |
| PRODUCT-AUTH-GATE-001 | HTTP/oRPC contract | Missing product session | Protected mutation endpoint receives no session | Request rejects before command dispatch | `product_auth_missing`, `401` | Parse request -> auth reject -> no command dispatch |
| PRODUCT-AUTH-GATE-002 | HTTP/oRPC contract | Insufficient role | Authenticated user lacks target organization role | Request rejects before mutation | `product_auth_forbidden`, `403` | Session verify -> role reject -> no command dispatch |
| PRODUCT-AUTH-GATE-003 | HTTP/oRPC contract | Explicit public endpoints | Health/version/readiness/bootstrap status are requested | Requests remain public and do not require product session | None | Route -> public response |
| PRODUCT-AUTH-SESSION-001 | installer contract | Stable product auth session secret | `install.sh` writes or repairs a self-hosted stack | A strong product auth session secret is generated on first install, reused from `.env` on rerun, passed to the app container, and never printed to installer stdout | None | Read existing `.env` -> generate or reuse auth secret -> write `.env` -> compose env injection |
| PRODUCT-AUTH-READ-001 | HTTP/oRPC contract | Role-aware product read authorization | Project, environment, resource, deployment target, deployment, or deploy-token read models are requested over HTTP/oRPC | Missing product sessions reject before query dispatch; authenticated members can read safe project/environment/resource/deployment-target/deployment metadata with a user actor; deploy-token read models remain admin-only | `product_auth_missing`, `401`, or `product_auth_forbidden`, `403` | Parse request -> session/role verify -> query dispatch |
| PRODUCT-AUTH-DOCS-001 | docs/help | First install login docs | First-admin bootstrap is user-visible | Docs/help explain local admin bootstrap, generated password, OAuth optionality, login URL, and recovery | None | Docs registry/help lookup |
| ORG-TEAM-CONTEXT-001 | application/HTTP | Current organization context | A signed-in product user belongs to an organization | Safe current user, current organization, role, selectable organizations, and login method metadata are returned | None or `product_auth_missing`/`product_auth_forbidden` | Session verify -> context read model |
| ORG-TEAM-SWITCH-001 | application/HTTP/Web | Switch current organization | A signed-in product user belongs to multiple visible organizations | Selecting a visible organization updates the product-session current organization and returns refreshed safe context; selecting a non-visible organization fails before dispatching downstream product mutations | None, `product_auth_missing`, or `product_auth_forbidden` | Session verify -> visible organization check -> auth adapter active-organization write -> refreshed context |
| ORG-TEAM-MEMBERS-001 | application/read-model | Member list | An authorized owner/admin requests members | Safe member metadata and roles are returned without provider payloads | None or `product_auth_forbidden` | Session verify -> member read model |
| ORG-TEAM-INVITE-001 | application/adapter | Invite member | An owner/admin invites an email address with a role | Safe invitation metadata is created through an Appaloft-owned port and duplicate active membership is rejected | None, `conflict`, or `product_auth_forbidden` | Session verify -> organization/team port |
| ORG-TEAM-ROLE-001 | core/application | Change member role | An owner updates a member role | Role changes only when at least one owner remains | None, `invariant`, or `product_auth_forbidden` | Session verify -> aggregate rule -> auth adapter |
| ORG-TEAM-REMOVE-001 | core/application | Remove member | An owner removes a member | Member is removed/deactivated only when at least one owner remains | None, `invariant`, or `product_auth_forbidden` | Session verify -> aggregate rule -> auth adapter |
| ORG-TEAM-AUTH-001 | HTTP/oRPC contract | Organization/team authorization | Requests lack a session or required organization role | `401` or `403` is returned before command/query dispatch | `product_auth_missing`/`product_auth_forbidden` | Parse request -> auth reject -> no dispatch |
| ORG-TEAM-ADAPTER-001 | auth-adapter | Better Auth organization/team boundary | `@appaloft/auth-better` implements organization/team ports | Better Auth organization/member/invitation capabilities remain behind Appaloft-owned ports | None | Appaloft port -> Better Auth API |
| ORG-TEAM-DOCS-001 | docs/help | Organization/team docs | Team management is user-visible | Docs/help explain current context, invite, role update, removal, and 401/403 recovery | None | Docs registry/help lookup |
| ORG-TEAM-WEB-001 | Web/source | Organization/team Web surface | A signed-in owner/admin opens `/organization` | Web reads current context, members, invitations, invite, role update, and remove through shared oRPC contracts and i18n keys | None or product auth errors from the shared API | Web -> oRPC client -> application command/query |
| ORG-TEAM-WEB-002 | Web/source | Deploy-token Web surface | A signed-in owner/admin opens `/organization` | Web lists, creates, rotates, and revokes deploy tokens through shared oRPC contracts, shows raw token only after create/rotate, and does not couple to Better Auth | None or product auth errors from the shared API | Web -> oRPC client -> application command/query |
| ORG-TEAM-WEB-003 | Web/docs-help | Organization/team Web help | Team management controls are visible in Web | Web help points at `self-hosting.organization-team-management` | None | Web help registry lookup |
| SELF-HOSTED-AUTH-WEB-001 | Web/browser e2e | Console sign out | A signed-in self-hosted user opens the console shell | The console shell exposes localized sign-out affordances, calls the auth runtime sign-out endpoint, clears cached session state, and returns to `/login` | Sign-out request failures stay visible in the user menu | Web sign-out affordance -> auth runtime sign-out -> session cache clear -> login page |
| SELF-HOSTED-AUTH-E2E-001 | WebView/browser e2e | First-admin login and console deploy path | A self-hosted user opens the console after install has exposed the bootstrap/login APIs | Browser creates the first local admin with a generated password, signs in through local password login, and submits a deployment from the console without manual database edits | None or product/auth request failures surfaced by the page | Bootstrap status -> bootstrap first admin -> local sign-in -> console deployment request |
| SELF-HOSTED-AUTH-E2E-002 | installer script contract | Complete first-use auth handoff | `install.sh` completes with a generated first-admin password, and deploy-token bootstrap may be explicitly enabled | Installer output prints the console URL, first-admin login URL/password once, optional Action secret name/token once, and next-step guidance together after install completion without leaking Better Auth internals or persisting raw secrets to `.env`; default SSH install does not create a deploy token | None | Install stack -> health ready -> read optional deploy-token handoff -> read first-admin handoff -> print first-use instructions |
| SELF-HOSTED-AUTH-E2E-003 | opt-in Docker/browser smoke | Printed console URL opens after install, local login works, and Action server mode creates a deployment | `APPALOFT_INSTALL_FULL_SMOKE=1` is set, Docker Compose is available, and installer deploy-token bootstrap is explicitly enabled | `install.sh` runs a real PGlite container stack, prints the console URL, `/api/health` is reachable at that URL, bootstrap status reports first admin configured, the generated first-admin password signs in through the local login API, the session API returns the admin user, the product API creates project/environment/local-shell target/resource context with the signed-in admin session, the installer-generated deploy token calls the Action source-link endpoint without 401/403 and receives `202 Accepted` with a `dep_...` deployment id, and the console page opens | Docker unavailable, image pull/startup failure, health timeout, login/session failure, product API authorization failure, or Action deploy-token authorization/deployment creation failure | Install stack -> printed URL -> health probe -> bootstrap status probe -> local sign-in -> session probe -> active organization switch -> product context creation -> Action source-link deployment creation -> console page probe |

## Current Implementation Notes

- Better Auth-compatible persistence tables exist.
- `@appaloft/auth-better` currently exposes session status and GitHub, Google, and generic OIDC
  provider connection/configuration status.
- Application now has Appaloft-owned first-admin bootstrap/status ports, generated-password issuer
  boundary, `BootstrapFirstAdminCommand`, `GetAuthBootstrapStatusQuery`, handlers, and operation
  catalog entries. These cover the application boundary for `FIRST-ADMIN-STATUS-001` and
  `FIRST-ADMIN-BOOTSTRAP-001` through `FIRST-ADMIN-BOOTSTRAP-003`.
- `@appaloft/auth-better` now implements the `FirstAdminBootstrapper` application port with Better
  Auth email/password signup and organization creation, covering `FIRST-ADMIN-BOOTSTRAP-004`.
- Optional OAuth runtime config now covers GitHub, Google, and generic OIDC through Appaloft-owned
  status shapes. Provider login is reported disabled until client id, client secret, callback URL,
  and trusted browser origin are configured, covering `FIRST-ADMIN-BOOTSTRAP-005`.
- `packages/application/test/auth-provider-boundary.test.ts` covers
  `SELF-HOSTED-AUTH-ARCH-001` by blocking direct Better Auth implementation markers from
  `packages/core/src` and `packages/application/src`; Better Auth remains an adapter/runtime
  implementation behind Appaloft-owned ports and shell composition.
- `PgAuthBootstrapStatusReader` now reads Better Auth-compatible `user`, `organization`, and
  `member` tables through `packages/persistence/pg` and reports safe bootstrap-required/complete
  status for `FIRST-ADMIN-STATUS-001`.
- Shell/server composition now supports `APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE`,
  `APPALOFT_FIRST_ADMIN_EMAIL`, `APPALOFT_FIRST_ADMIN_DISPLAY_NAME`,
  `APPALOFT_FIRST_ADMIN_PASSWORD`, `APPALOFT_FIRST_ADMIN_ORGANIZATION_NAME`, and
  `APPALOFT_FIRST_ADMIN_ORGANIZATION_SLUG` as trusted runtime config for first-admin bootstrap. It
  writes a one-time generated password only when a trusted output file is configured and the
  application command generated one, can bootstrap directly from supplied startup email/password
  without a handoff file, does not echo supplied passwords, and no-ops when the first admin already
  exists.
- `install.sh` now passes first-admin bootstrap settings into Compose/Swarm app containers, reads
  the first-admin handoff output after health readiness, prints generated passwords only from that
  trusted output, suppresses supplied-password echo, and keeps deploy-token output as the separate
  machine-to-machine handoff.
- HTTP/oRPC command dispatch now accepts an Appaloft-owned `ProductSessionAuthorizationPort`.
  Protected product mutations are authorized before `CommandBus` dispatch, rejected with
  `product_auth_missing`/`401` when no product session is present, rejected with
  `product_auth_forbidden`/`403` for insufficient organization role, and dispatched with an
  authenticated user actor when authorized. `@appaloft/auth-better` implements the port through
  Better Auth session and organization-role APIs without leaking Better Auth types into application.
- `install.sh` now generates a strong `APPALOFT_BETTER_AUTH_SECRET` for new installs, reuses an
  existing `.env` value on rerun to avoid invalidating sessions unexpectedly, passes it into the app
  container, and keeps it out of installer stdout. This covers `PRODUCT-AUTH-SESSION-001`.
- HTTP/oRPC product read dispatch now requires member-level product sessions for project,
  environment, resource, deployment-target, and deployment read models before `QueryBus` dispatch,
  while deploy-token and organization/team read models remain admin-only. This is covered by
  `packages/orpc/test/product-auth-gate.http.test.ts` for `PRODUCT-AUTH-READ-001`.
- `auth.bootstrap-status` is exposed as the public `GET /api/bootstrap/auth/status` endpoint and
  `auth.bootstrap-first-admin` as the public `POST /api/bootstrap/auth/first-admin` setup endpoint.
  Both bypass the product session gate intentionally; the setup command remains one-time/idempotent
  through application bootstrap status checks.
- Public docs now cover first install login, local first-admin bootstrap, generated password
  handling, OAuth optionality, public bootstrap endpoints, product auth 401/403 recovery, and
  recovery cautions under `self-hosting.first-admin-bootstrap`, covering `PRODUCT-AUTH-DOCS-001`.
- Web onboarding now exposes `/bootstrap/auth/first-admin` for local first-admin setup and `/login`
  for local email/password sign-in using `packages/i18n` keys. Production static-console routing
  and local Vite dev/preview gate console document navigation through bootstrap status before
  serving the SPA shell, covering `FIRST-ADMIN-NAV-001`. Web `/organization` covers current
  organization switching, member invitation, and token management. The console shell exposes
  localized sign-out affordances, calls `/api/auth/sign-out`, clears cached session state, and returns to
  `/login`, covering `SELF-HOSTED-AUTH-WEB-001`.
- ADR-045 and `docs/specs/054-self-hosted-organization-team-operations` now govern
  organization/team current context, member list, invitation, role update, member removal, and the
  Better Auth adapter boundary.
- Application-level organization/team ports, commands, queries, handlers, use cases/query services,
  and operation-catalog entries now exist and are covered by
  `packages/application/test/organization-team.test.ts`.
- `@appaloft/auth-better` now implements the organization/team management port behind Appaloft-owned
  application abstractions and is covered by `ORG-TEAM-ADAPTER-001`. Better Auth `owner` and
  `admin` roles round-trip directly; Better Auth `member` currently maps back to Appaloft
  `developer` until richer custom-role persistence is added.
- Public HTTP/oRPC routes for current context, current organization switching, member list,
  invitation list, invite, role update, and removal are active behind `ProductSessionAuthorizationPort`, dispatch through
  `CommandBus`/`QueryBus`, and are covered by `packages/orpc/test/organization-team.http.test.ts`.
- CLI commands for the same organization/team operations are active and covered by
  `packages/adapters/cli/test/organization-command.test.ts`.
- Public docs coverage is active under `self-hosting.organization-team-management` for current
  context, current organization switching, member and invitation lists, invitation, role updates,
  removal, CLI session handoff, safe outputs, owner-retention recovery, and `401`/`403` recovery. It is verified by
  `packages/docs-registry/test/operation-coverage.test.ts`, covering `ORG-TEAM-DOCS-001`.
- `organizations.switch-current` is active through the Appaloft-owned command/use case, operation
  catalog, HTTP/oRPC route, CLI command, Web switch control, public docs coverage, and
  `ORG-TEAM-SWITCH-001` automation.
- Web `/organization` now exposes current organization context, safe member and invitation reads,
  current organization switching, invite, role update, member removal, and deploy-token
  list/create/rotate/revoke over the shared oRPC contracts with i18n keys. It is source-tested by
  `apps/web/src/lib/console/auth-management.test.ts` for `ORG-TEAM-WEB-001` through
  `ORG-TEAM-WEB-003`.
- `apps/web/test/e2e-webview/home.webview.test.ts` covers `SELF-HOSTED-AUTH-E2E-001` for the
  browser portion of the first-admin login and console deploy path. `scripts/test/install-sh.test.ts`
  covers `SELF-HOSTED-AUTH-E2E-002` for the installer first-use auth handoff, including the default
  no-token install path and explicit `--bootstrap-deploy-token` handoff path.
  `scripts/test/install-full-smoke.test.ts` defines the opt-in `SELF-HOSTED-AUTH-E2E-003` real
  Docker/browser smoke, exposed as `bun run smoke:install-auth`. It verifies the generated
  first-admin password against the local login/session APIs after install, switches the signed-in
  session to the bootstrapped organization, creates deployment context through the product HTTP API,
  submits a console deployment, and uses the explicitly enabled installer-printed one-time deploy
  token to call the self-hosted Action source-link deployment endpoint. It is skipped by default. On
  2026-05-11 it
  passed against a Docker Compose PGlite stack using a local overlay candidate image and a
  current-source Dockerfile image built by the smoke harness with runtime OpenSSH installation
  disabled. Both carried the current shell/Web/docs artifacts and PGlite runtime assets; the Action
  call returned `202 Accepted` with a `dep_...` deployment id instead of `action_auth_*`. A normal
  default Dockerfile build was attempted on 2026-05-11 and reached shell/Web/docs/PGlite packaging,
  then was cancelled after the runtime `apt-get install openssh-client` layer stayed silent at the
  Debian `trixie/main arm64 Packages` download. A standalone Bun Debian base-image
  `apt-get update && apt-get install --no-install-recommends openssh-client` probe also timed out
  after 240 seconds at the same package index download, so the release candidate still needs the
  normal release-environment image verification gate.

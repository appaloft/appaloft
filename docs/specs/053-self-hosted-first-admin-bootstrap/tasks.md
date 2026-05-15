# Tasks: Self-Hosted First Admin Bootstrap

## Test-First

- [x] `FIRST-ADMIN-STATUS-001`: add application/query test proving bootstrap status reports
  required/complete without exposing secrets.
- [x] `FIRST-ADMIN-BOOTSTRAP-001`: add application command test proving supplied password creates
  first admin through an Appaloft-owned auth port.
- [x] `FIRST-ADMIN-BOOTSTRAP-002`: add application command test proving missing password generates
  one-time password output and persists no raw password in Appaloft read models.
- [x] `FIRST-ADMIN-BOOTSTRAP-003`: add idempotency test proving a second bootstrap does not create
  another user/organization/member.
- [x] `FIRST-ADMIN-BOOTSTRAP-004`: add Better Auth adapter test proving the port creates a local
  user and initial organization owner without leaking Better Auth types into application.
- [x] `FIRST-ADMIN-BOOTSTRAP-005`: add config and auth adapter tests proving optional GitHub,
  Google, and OIDC login methods stay disabled until client id, client secret, callback URL, and
  trusted origin are configured.
- [x] `PRODUCT-AUTH-GATE-001`: add HTTP/oRPC test proving protected mutations reject anonymous
  product requests with `401`.
- [x] `PRODUCT-AUTH-GATE-002`: add HTTP/oRPC test proving authenticated non-members or insufficient
  roles reject with `403`.
- [x] `PRODUCT-AUTH-GATE-003`: add public endpoint tests proving health/version/readiness and
  bootstrap status stay explicitly public.

## Source Of Truth

- [x] Add ADR-044 for self-hosted first-admin bootstrap.
- [x] Add feature artifact `docs/specs/053-self-hosted-first-admin-bootstrap`.
- [x] Add first-admin bootstrap workflow spec.
- [x] Add self-hosted product auth error spec.
- [x] Add self-hosted product auth test matrix rows.
- [x] Add command/query specs for `auth.bootstrap-first-admin` and `auth.bootstrap-status`.
- [x] Add application command/query messages, handlers, operation-catalog entries, and public
  bootstrap CLI/HTTP-oRPC transport declarations.

## Implementation

- [x] Add application-owned first-admin bootstrap/status ports.
- [x] Add first-admin password issuer port for generated one-time password output.
- [x] Add `BootstrapFirstAdminUseCase` and `GetAuthBootstrapStatusQueryService`.
- [x] Add Better Auth adapter implementation in `@appaloft/auth-better`.
- [x] Add PG/PGlite status reader for Better Auth-compatible user/organization/member presence.
- [x] Wire shell installer bootstrap from trusted runtime config and one-time output file.
- [x] Add HTTP/oRPC bootstrap status/setup endpoints.
- [x] Add product admin authorization gate for mutation endpoints.
- [x] Add optional GitHub, Google, and generic OIDC config/status wiring behind the Better Auth
  adapter boundary.

## Entrypoints And Docs

- [x] Update installer output with console login URL, first-admin bootstrap status, configured login
  methods, and generated password when applicable.
- [x] Add Web first-admin onboarding using i18n keys.
- [x] Add CLI first-admin bootstrap/status commands through the command/query bus.
- [x] Add public docs/help for first install login, local admin bootstrap, OAuth setup, and recovery.
- [x] Activate deploy-token lifecycle management only after first-admin/admin authorization is
  active.

## Verification

- [x] Run targeted application tests for first-admin bootstrap/status.
- [x] Run targeted Better Auth adapter tests.
- [x] Run targeted persistence/PGlite tests for first-admin status reader.
- [x] Run targeted HTTP/oRPC authorization gate tests.
- [x] Run installer/bootstrap tests for shell first-admin handoff and config parsing.
- [x] Run installer script-contract test for complete first-use auth handoff output.
- [x] Run docs/help registry tests.

## Post-Implementation Sync

- [x] Reconcile roadmap Phase 8 notes, `BUSINESS_OPERATION_MAP.md`, `CORE_OPERATIONS.md`,
  operation catalog, specs, test matrices, public docs, and remaining migration gaps.

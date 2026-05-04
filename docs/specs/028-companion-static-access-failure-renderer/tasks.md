# Tasks: Companion/Static Access Failure Renderer Baseline

## Spec Round

- [x] Confirm PR #161 is merged into latest `main`.
- [x] Create `fix/companion-static-access-failure-renderer` from latest `main`.
- [x] Locate behavior in `docs/BUSINESS_OPERATION_MAP.md` as existing Resource access failure
  diagnostics transport/read workflow.
- [x] Record no-ADR-needed because the slice reuses existing diagnostic envelopes/read surfaces and
  does not change operation boundaries, route ownership, durable state, or recovery semantics.
- [x] Add this feature artifact directory with `spec.md`, `plan.md`, and `tasks.md`.

## Test-First

- [x] `RES-ACCESS-DIAG-STATIC-001`: add application coverage for rendering a safe
  `resource-access-failure/v1` diagnostic without backend availability.
- [x] `RES-ACCESS-DIAG-STATIC-002`: add application coverage that request id, diagnostic id, code,
  category, phase, retriable, next action, and route context are preserved.
- [x] `RES-ACCESS-DIAG-STATIC-003`: add runtime packaging coverage that static-site Docker builds
  include a renderer asset under `/.appaloft/resource-access-failure`.
- [x] `RES-ACCESS-DIAG-STATIC-004`: add redaction coverage for secrets, private keys, auth headers,
  cookies, sensitive query values, provider raw payloads, SSH credentials, and remote raw logs.
- [x] `ROUTE-TLS-BOUNDARY-008`: add routing/domain boundary coverage that packaging the static
  renderer does not create managed domain, certificate, route repair, redeploy, or rollback state.

## Implementation

- [x] Move shared access-failure HTML/problem rendering model into `packages/application`.
- [x] Add provider-neutral static renderer HTML asset generation that consumes sanitized diagnostic
  fields and is safe without a backend service.
- [x] Package the static renderer asset in adapter-owned static-site Docker builds.
- [x] Keep backend HTTP renderer using shared application helpers and existing evidence enrichment.

## Entrypoints And Docs

- [x] Keep API/oRPC, CLI, Web, and operation catalog unchanged.
- [x] Public docs/help outcome: reuse existing diagnostics troubleshooting anchors because no new
  user workflow or help affordance is added.

## Verification

- [x] Run targeted application resource access failure diagnostic tests.
- [x] Run targeted runtime static Docker build tests.
- [x] Run affected HTTP renderer tests.
- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Update test matrix statuses and roadmap Phase 6 verification notes.
- [x] Reconcile this spec, plan, tasks, source-of-truth docs, tests, and code.

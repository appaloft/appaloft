# Tasks: Platform Migration Journey

## Governance

- [x] Merge ADR-113, Spec 135 and the `MIG-*` Test Matrix.
- [x] Create and label the actor-visible public Ticket `ready-for-agent` (#1084).

## Test First And Implementation

- [x] `MIG-BUNDLE-001`–`MIG-SOURCE-002`: add failing bundle and Railway adapter tests.
- [x] `MIG-PLAN-003`–`MIG-CLEAN-008`: add failing coordinator/resume/cleanup tests.
- [x] `MIG-SURFACE-009`, `MIG-AUTH-013`, `MIG-COMPAT-014`: add CLI/HTTP/SDK/Web/auth tests.
- [x] Implement migration bundle, adapters and coordinator without persistence or direct repositories.
- [x] Implement CLI/headless, HTTP/oRPC/SDK and Web review/progress/verification surfaces.
- [x] Add public migration docs and help registry coverage.

## Acceptance And Sync

- [x] `MIG-WEB-010`: run fresh web migration, rollback and exact cleanup packet.
- [x] `MIG-COMPOSE-011`: run multi-service migration, recovery and cleanup packet.
- [x] `MIG-STATEFUL-012`: run database/volume/domain/TLS, backup/restore and exit packet.
- [x] Run public full gates, docs-impact, Cloud composed gates and final Boundary Review.
- [x] Sync artifacts and acceptance evidence after all three packets pass.

Public implementation PR #1090 merged at `c4a0a4203759380566034c53fa77d420b9a0fe3e` after
Biome, typecheck, unit/integration, two E2E shards, build/smoke and six native Workspace TUI target
checks passed. Cloud composed authz/admission/secret tests, the three exact-cleanup packets and the
final-pin Public/Private Boundary Review passed without a private migration lifecycle. Ticket
closure remains part of the cross-repository delivery sync.

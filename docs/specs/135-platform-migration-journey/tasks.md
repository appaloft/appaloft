# Tasks: Platform Migration Journey

## Governance

- [ ] Merge ADR-113, Spec 135 and the `MIG-*` Test Matrix.
- [ ] Create and label the actor-visible public Ticket `ready-for-agent`.

## Test First And Implementation

- [ ] `MIG-BUNDLE-001`–`MIG-SOURCE-002`: add failing bundle and Railway adapter tests.
- [ ] `MIG-PLAN-003`–`MIG-CLEAN-008`: add failing coordinator/resume/cleanup tests.
- [ ] `MIG-SURFACE-009`, `MIG-AUTH-013`, `MIG-COMPAT-014`: add CLI/HTTP/SDK/Web/auth tests.
- [ ] Implement migration bundle, adapters and coordinator without persistence or direct repositories.
- [ ] Implement CLI/headless, HTTP/oRPC/SDK and Web review/progress/verification surfaces.
- [ ] Add public migration docs and help registry coverage.

## Acceptance And Sync

- [ ] `MIG-WEB-010`: run fresh web migration, rollback and exact cleanup packet.
- [ ] `MIG-COMPOSE-011`: run multi-service migration, recovery and cleanup packet.
- [ ] `MIG-STATEFUL-012`: run database/volume/domain/TLS, backup/restore and exit packet.
- [ ] Run public full gates, docs-impact, Cloud composed gates and final Boundary Review.
- [ ] Sync artifacts, roadmap evidence and close Tickets only after all three packets pass.

# Tasks: Profile-Aware Workspace Open And Attach

## Test First

- [ ] Add `WS-OPEN-GIT-001..004` local Git resolver and remote normalization/preflight tests.
- [ ] Add `WS-OPEN-BIND-005` Repository Binding lifecycle and tenant-isolation tests.
- [ ] Add `WS-OPEN-PROFILE-006/WS-OPEN-CRED-007` Profile name/id/default and named Connection tests.
- [ ] Add `WS-OPEN-ADMIT-008/WS-OPEN-PARTIAL-017` pre-effect ordering, reservation, and partial
  evidence tests.
- [ ] Add `WS-CREATE-PROFILE-009/WS-OPEN-CREATE-010/WS-OPEN-RESUME-011/WS-OPEN-NEW-012/
  WS-OPEN-SHA-013` application and persistence tests.
- [ ] Add `WS-ATTACH-MANAGED-014/WS-ATTACH-NATIVE-015/WS-ATTACH-UNSUPPORTED-016` attach tests.
- [ ] Add `WS-OPEN-REMOTE-018/WS-OPEN-SURFACE-019` remote CLI and API/SDK/Console parity tests.
- [ ] Add `WS-OPEN-CLEANUP-020` exact termination cleanup tests.

## Source Of Truth

- [x] Complete Discovery and owner decisions.
- [x] Add Spec 119, ADR-102, plan, tasks, workflow, and Test Matrix.
- [x] Synchronize Domain Model, Business Operation Map, Core Operations, roadmap, public docs, and
  migration notes.

## Ticket

- [ ] Create public tracking issue and actor-visible vertical slices with `ready-for-agent`.
- [ ] Link the private hosted-composition tracking issue and final public merged commit.

## Implementation

- [ ] Implement Repository Identity and Repository Binding.
- [ ] Implement Project default Workspace Profile configuration.
- [ ] Implement Profile installation named Credential Connection configuration and resolution.
- [ ] Implement Workspace open context, source pin, preferred projection, and application workflow.
- [ ] Implement local Git context resolver and Profile-aware CLI create/open.
- [ ] Implement capability-driven auto attach and managed-terminal session reuse.
- [ ] Route SDK and Console creation through the same workflow.
- [ ] Implement PG/PGlite persistence and migrations.
- [ ] Implement generated operation, HTTP/oRPC, SDK, CLI, and remote-dispatch surfaces.

## Verification

- [ ] Run focused tests for every matrix id.
- [ ] Run public lint, typecheck, test, build, `check:ash`, docs registry, and frozen install gates.
- [ ] Run Cloud focused authz/audit/credential/placement/composition tests and full gates.
- [ ] Run explicit real Pi/OpenCode opt-in smoke and exact cleanup readback.

## Sync

- [ ] Update matrix status and test bindings from actual results.
- [ ] Synchronize CLI help, public docs, SDK guidance, Console behavior, ADR/Spec/tasks and issues.
- [ ] Merge public PR, update Cloud gitlink to the final public `main` SHA, then complete Cloud PR.

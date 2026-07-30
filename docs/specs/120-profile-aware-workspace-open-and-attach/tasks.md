# Tasks: Profile-Aware Workspace Open And Attach

## Test First

- [x] Add `WS-OPEN-GIT-001..004` local Git resolver and remote normalization/preflight tests.
- [x] Add `WS-OPEN-BIND-005` Repository Binding lifecycle and tenant-isolation tests.
- [x] Add `WS-OPEN-BIND-005` GitHub App binding projection and conflicting-Project fail-closed
  regression coverage under public issue #890.
- [x] Add `WS-OPEN-PROFILE-006/WS-OPEN-CRED-007` Profile name/id/default and named Connection tests.
- [x] Add `WS-OPEN-ADMIT-008/WS-OPEN-PARTIAL-017` pre-effect ordering, reservation, and partial
  evidence tests.
- [x] Add `WS-CREATE-PROFILE-009/WS-OPEN-CREATE-010/WS-OPEN-RESUME-011/WS-OPEN-NEW-012/
  WS-OPEN-SHA-013` application and persistence tests.
- [x] Add `WS-ATTACH-MANAGED-014/WS-ATTACH-NATIVE-015/WS-ATTACH-UNSUPPORTED-016` attach tests.
- [x] Add `WS-OPEN-REMOTE-018/WS-OPEN-SURFACE-019` remote CLI and API/SDK/Console parity tests.
- [x] Add `WS-OPEN-CLEANUP-020` exact termination cleanup tests.

## Source Of Truth

- [x] Complete Discovery and owner decisions.
- [x] Add Spec 120, ADR-103, plan, tasks, workflow, and Test Matrix.
- [x] Synchronize Domain Model, Business Operation Map, Core Operations, roadmap, public docs, and
  migration notes.

## Ticket

- [x] Create public tracking issue
  [#857](https://github.com/appaloft/appaloft/issues/857) and actor-visible vertical slices
  [#858](https://github.com/appaloft/appaloft/issues/858),
  [#859](https://github.com/appaloft/appaloft/issues/859), and
  [#861](https://github.com/appaloft/appaloft/issues/861) with `ready-for-agent`.
- [x] Link private hosted-composition tracking
  [#748](https://github.com/appaloft/appaloft-cloud/issues/748) and actor-visible slices
  [#749](https://github.com/appaloft/appaloft-cloud/issues/749),
  [#750](https://github.com/appaloft/appaloft-cloud/issues/750), and
  [#751](https://github.com/appaloft/appaloft-cloud/issues/751).
- [x] Track the npm CLI launcher executable-mode regression under public issue
  [#900](https://github.com/appaloft/appaloft/issues/900).
- [x] Track the generated-facade collision found by remote `workspace open` smoke under public issue
  [#904](https://github.com/appaloft/appaloft/issues/904).
- [x] Track the default execution-context tenant propagation regression found by hosted Credential
  Connection admission under public issue
  [#906](https://github.com/appaloft/appaloft/issues/906).
- [x] Track safe source materialization into Template working directories under public issue
  [#908](https://github.com/appaloft/appaloft/issues/908).
- [ ] Link the final public merged commit.

## Implementation

- [x] Implement Repository Identity and Repository Binding.
- [x] Implement Project default Workspace Profile configuration.
- [x] Implement Profile installation named Credential Connection configuration and resolution.
- [x] Implement Workspace open context, source pin, preferred projection, and application workflow.
- [x] Implement local Git context resolver and Profile-aware CLI create/open.
- [x] Implement capability-driven auto attach and managed-terminal session reuse.
- [x] Route SDK and Console creation through the same workflow.
- [x] Implement PG/PGlite persistence and migrations.
- [x] Implement generated operation, HTTP/oRPC, SDK, CLI, and remote-dispatch surfaces.

## Verification

- [x] Run focused tests for every automated matrix id.
- [x] Run public lint, typecheck, test, build, `check:ash`, and docs registry gates.
- [x] Run Cloud focused authz/audit/credential/placement/composition tests and full gates.
- [x] Run public frozen install gate.
- [x] Add `CLI-NPM-PACKAGE-001` coverage so a frozen install cannot make a clean source checkout
  appear dirty through the tracked npm launcher mode.
- [x] Record reusable registered-Server Pi/OpenCode substrate evidence from Cloud run
  [30433192272](https://github.com/appaloft/appaloft-cloud/actions/runs/30433192272): real-provider
  model replies, managed-terminal/native attach, reconnectable state, hibernation and exact fixture
  cleanup passed.
- [ ] Run explicit Profile-aware `workspace open` Pi/OpenCode opt-in smoke with Repository Binding,
  installed Profile/Connection pins, repeated-open identity, terminate and exact provider orphan
  readback.

## Sync

- [x] Update matrix status and test bindings from actual results.
- [x] Synchronize CLI help, public docs, SDK guidance, Console behavior, ADR/Spec/tasks and issues.
- [ ] Merge public PR, update Cloud gitlink to the final public `main` SHA, then complete Cloud PR.

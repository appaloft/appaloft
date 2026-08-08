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
- [x] Track request-scoped private Repository source credential custody for remote Workspace open
  under public issue [#912](https://github.com/appaloft/appaloft/issues/912).
- [x] Track fail-closed declarative native attach server-port compilation under public issue
  [#914](https://github.com/appaloft/appaloft/issues/914).
- [x] Track the authenticated Workspace source Ash execution boundary under public issue
  [#918](https://github.com/appaloft/appaloft/issues/918) and PR
  [#919](https://github.com/appaloft/appaloft/pull/919).
- [x] Track explicit Profile resume across coexisting Pi/OpenCode Workspaces under public issue
  [#1005](https://github.com/appaloft/appaloft/issues/1005).
- [x] Link public PR
  [#919](https://github.com/appaloft/appaloft/pull/919) final merged commit
  `4a30316e139e2d1a13e2b0f0f9be93b2cedc977b`.
- [x] Link public PR
  [#922](https://github.com/appaloft/appaloft/pull/922) final merged commit
  `a7e939ad582cfc31890b7636bf6ed2545af74b67`, which proves the typed Git credential
  protocol and isolated memory-only credential cache against the authenticated fetch command's
  exact helper arguments.

## Implementation

- [x] Implement Repository Identity and Repository Binding.
- [x] Implement Project default Workspace Profile configuration.
- [x] Implement Profile installation named Credential Connection configuration and resolution.
- [x] Implement Workspace open context, source pin, preferred projection, and application workflow.
- [x] Implement local Git context resolver and Profile-aware CLI create/open.
- [x] Implement capability-driven auto attach and managed-terminal session reuse.
- [x] Route SDK and Console creation through the same workflow.
- [x] Implement PG/PGlite persistence and migrations.
- [x] Resolve an explicit Profile selector to its latest non-terminal Workspace without changing
  the global preferred Workspace or `--new` semantics.
- [x] Implement generated operation, HTTP/oRPC, SDK, CLI, and remote-dispatch surfaces.
- [x] Preserve the exact scoped server port from native-attach Adapter manifests in compiled
  declarative Harness descriptors.

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
- [x] Run explicit Profile-aware `workspace open` Pi/OpenCode opt-in smoke with a challenged private
  GitHub Repository fetch, Repository Binding, installed Profile/Connection pins, repeated-open
  identity, managed-terminal/native-attach reconnect, terminate and exact provider orphan readback
  in Cloud run
  [30531244785](https://github.com/appaloft/appaloft-cloud/actions/runs/30531244785).

## Sync

- [x] Update matrix status and test bindings from actual results.
- [x] Synchronize CLI help, public docs, SDK guidance, Console behavior, ADR/Spec/tasks and issues.
- [x] Merge the public source-authentication implementation through PR
  [#922](https://github.com/appaloft/appaloft/pull/922).
- [x] Merge evidence Sync PR
  [#924](https://github.com/appaloft/appaloft/pull/924) as
  `355715375431dd7a90d911b7646ce828479aa0f1`; the final Cloud gitlink and Ready transition are
  recorded by the hosted-composition feature tasks and PR.

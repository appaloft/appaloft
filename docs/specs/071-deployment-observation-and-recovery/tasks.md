# Tasks: Deployment Observation And Recovery Hardening

## Source Of Truth

- [x] Create coordination artifact at `docs/specs/071-deployment-observation-and-recovery/`.
- [x] Classify this as `0.12.x` patch hardening, not `1.0.0-rc` release scope.
- [x] Keep roadmap, operation map, core operations, workflow, query, error, testing, and docs/help
  outcomes synchronized before Code Round starts.

## Code Round 1: Event Stream Reconnect/Gap/CLI Hardening

- [x] `DEP-EVENTS-QRY-004`: add application/service coverage for cursor continuation after a known
  envelope.
- [x] `DEP-EVENTS-QRY-005`: add source-unavailable startup error coverage.
- [x] `DEP-EVENTS-QRY-007`: add finite historical-only close behavior coverage.
- [x] `DEP-EVENTS-QRY-008`: add explicit detail/log separation coverage.
- [x] `DEP-EVENTS-STREAM-002`: add heartbeat coverage.
- [x] `DEP-EVENTS-STREAM-003`: add terminal close coverage beyond smoke.
- [x] `DEP-EVENTS-STREAM-004`: add caller cancellation and cleanup coverage.
- [x] `DEP-EVENTS-STREAM-005`: add explicit gap-envelope scenario.
- [x] `DEP-EVENTS-STREAM-006`: add post-open follow-source failure coverage.
- [x] `DEP-EVENTS-OWN-001` through `DEP-EVENTS-OWN-004`: add boundary assertions for no hidden write
  affordances and detail/log separation.
- [x] `DEP-EVENTS-ENTRY-003`: add CLI follow/cancellation coverage for
  `appaloft deployments events <deploymentId> --follow --json`.

## Code Round 2: Retry/Redeploy Hardening

- [x] `DEP-RECOVERY-READINESS-003`: cover failed deployment missing snapshot.
- [x] `DEP-RECOVERY-READINESS-005`: cover invalid or drifted current Resource profile.
- [x] `DEP-RETRY-002`: cover retry rejection for active/successful/non-retryable attempts.
- [x] `DEP-RETRY-003`: cover stale readiness marker rejection.
- [x] `DEP-RETRY-004`: cover resource-runtime coordination conflict.
- [x] `DEP-REDEPLOY-002`: cover current-profile redeploy that does not reuse old snapshot truth.
- [x] `DEP-REDEPLOY-003`: cover invalid current profile rejection without falling back to retry.
- [x] `DEP-REDEPLOY-004`: cover resource-runtime coordination conflict.

## Cancel Decision

- [x] Decide whether public `deployments.cancel` is required before `1.0.0-rc`.
- [x] Record that public `deployments.cancel` was not required for this original `0.12.x`
  observation hardening blocker.
- [x] Superseded by the later pre-RC closure round: `deployments.cancel` is now active through
  `docs/specs/073-pre-rc-closure`, `docs/commands/deployments.cancel.md`,
  `docs/workflows/deployments.cancel.md`, `docs/errors/deployments.cancel.md`, and
  `docs/testing/deployments.cancel-test-matrix.md`.

## Rollback Candidate/Readiness Hardening

- [x] `DEP-RECOVERY-READINESS-008`: cover incompatible runtime target/destination candidate.
- [x] Add backend-specific artifact retention or prune-horizon tests only after the owning retention
  specs define the evidence.
- [x] Preserve the non-goal that rollback does not restore databases, volumes, queues, dependency
  resources, or secrets.

## Public Docs And Help

- [x] Keep existing recovery anchors in `apps/docs/src/content/docs/deploy/recovery.md` and
  localized counterpart aligned with active retry/redeploy/rollback commands.
- [x] Keep stream/gap/cancellation guidance tied to `deployments.stream-events` and SDK/reference
  anchors; add a dedicated user-facing anchor only if Code Round changes visible CLI/Web/API output.
- [x] Keep `PUB-DOCS-002`, `PUB-DOCS-003`, `PUB-DOCS-005`, and `PUB-DOCS-016` green or record explicit
  migration gaps.

## Verification Commands

- [x] `bun test packages/application/test/stream-deployment-events.test.ts`
- [x] `bun test apps/shell/test/deployment-event-observer.test.ts`
- [x] `bun test packages/orpc/test/deployment-event-stream.http.test.ts`
- [x] `bun test packages/adapters/cli/test/deployment-events-command.test.ts`
- [x] `bun test packages/application/test/deployment-recovery-readiness.test.ts`
- [x] `bun test packages/application/test/deployment-retry-redeploy.test.ts`
- [x] `bun test packages/application/test/deployment-rollback.test.ts`
- [x] `bun test packages/orpc/test/deployment-recovery-readiness.http.test.ts packages/orpc/test/deployment-create.http.test.ts`
- [x] `bun test packages/docs-registry/test/operation-coverage.test.ts`
- [x] `bun run lint`

## Post-Implementation Sync

- [x] Update this task list with completed matrix ids and test bindings.
- [x] Update the relevant local test matrices from deferred/planned to passing only after tests pass.
- [x] Re-check roadmap classification before any release work: this remains `0.12.x` hardening unless
  the roadmap explicitly selects `1.0.0-rc`.

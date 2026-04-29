# Tasks: Deployment Recovery Readiness

## Spec Round

- [x] Position deployment recovery behavior in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Add ADR-034 for recovery readiness, retry, redeploy, rollback, candidates, events, and errors.
- [x] Create `docs/specs/012-deployment-recovery-readiness/spec.md`.
- [x] Create `docs/specs/012-deployment-recovery-readiness/plan.md`.
- [x] Create this Code Round task checklist.
- [x] Add local query/command specs for `deployments.recovery-readiness`, `deployments.retry`,
  `deployments.redeploy`, and `deployments.rollback`.
- [x] Add local recovery error spec and global stable error-code entries.
- [x] Update `docs/CORE_OPERATIONS.md` with accepted next-operation boundaries without activating
  catalog entries.
- [x] Update deployment observation/read specs so readiness is the shared recovery summary source.
- [x] Add testing and implementation-plan docs with future stable coverage expectations.

## Test-First Round

- [x] Add `docs/testing/deployment-recovery-readiness-test-matrix.md` with stable ids for:
  - `DEP-RECOVERY-READINESS-*`
  - `DEP-RETRY-*`
  - `DEP-REDEPLOY-*`
  - `DEP-ROLLBACK-*`
  - `DEP-RECOVERY-WEB-*`, `DEP-RECOVERY-CLI-*`, `DEP-RECOVERY-HTTP-*`, and
    `DEP-RECOVERY-MCP-*`
- [x] Add automated test bindings for readiness policy/query service.
- [ ] Add planned automated test bindings for retry/redeploy/rollback command admission.
- [x] Add automated test bindings for rollback candidate retention and unavailable artifact
  branches.
- [x] Add API/oRPC, CLI, Web, and future MCP/tool contract rows.
- [x] Add public docs coverage rows or explicit migration gaps for `PUB-DOCS-002`,
  `PUB-DOCS-003`, `PUB-DOCS-011`, `PUB-DOCS-012`, `PUB-DOCS-016`, and `PUB-DOCS-017`.

## Readiness Query Code Round

- [x] Add `deployments.recovery-readiness` operation catalog entry and `CORE_OPERATIONS.md` active
  query row in the same Code Round.
- [x] Add application query schema, query, handler, and query service.
- [x] Add a shared recovery readiness policy service reused by `deployments.show` when it renders a
  compact recovery summary.
- [x] Reuse existing read ports for deployment history, resource profile/lifecycle, runtime target
  summary, and currently available artifact metadata.
- [ ] Add richer persistence/read-model fields or adapters needed to report retained artifact
  retention horizon and target compatibility.
- [x] Add HTTP/oRPC route and typed client/query helper.
- [x] Add CLI `appaloft deployments recovery-readiness <deploymentId>`.
- [x] Add Web deployment detail recovery panel in read-only mode.
- [x] Run targeted tests named with the stable matrix ids.

## Retry Code Round

- [x] Add accepted-candidate `deployments.retry` command spec.
- [ ] Add operation catalog and `CORE_OPERATIONS.md` active command row in the same Code Round.
- [ ] Implement command schema, command, handler, and use case.
- [ ] Create a new deployment attempt from the failed attempt's immutable snapshot intent.
- [ ] Link the new attempt to the source failed attempt.
- [ ] Enforce readiness policy and `resource-runtime` operation coordination at admission.
- [ ] Add API/oRPC, CLI, Web, and future MCP/tool surface decisions.
- [ ] Add tests for retryable, non-retryable, missing snapshot, active-scope, and new-attempt id
  behavior.

## Redeploy Code Round

- [x] Add accepted-candidate `deployments.redeploy` command spec.
- [ ] Add operation catalog and `CORE_OPERATIONS.md` active command row in the same Code Round.
- [ ] Implement command schema, command, handler, and use case.
- [ ] Create a new deployment attempt from the current Resource profile and current effective
  configuration.
- [ ] Enforce resource/environment/project/target lifecycle and profile-drift admission guards.
- [ ] Add API/oRPC, CLI, Web, and future MCP/tool surface decisions.
- [ ] Add tests proving redeploy does not reuse stale deployment snapshots.

## Rollback Code Round

- [x] Add accepted-candidate `deployments.rollback` command spec.
- [ ] Add operation catalog and `CORE_OPERATIONS.md` active command row in the same Code Round.
- [ ] Implement command schema, command, handler, and use case.
- [ ] Select a rollback candidate from the readiness/candidate policy.
- [ ] Create a new rollback deployment attempt from the candidate snapshot/artifact identity.
- [ ] Preserve stateful data rollback as out-of-scope warning/blocker behavior.
- [ ] Add runtime adapter support for candidate apply/failure diagnostics where needed.
- [ ] Add API/oRPC, CLI, Web, and future MCP/tool surface decisions.
- [ ] Add tests for candidate ready, artifact missing, incompatible target, stateful blocker, and
  failed rollback attempt behavior.

## Docs Round

- [x] Add or update public docs page for deployment recovery.
- [x] Register stable help anchors for readiness, retry, redeploy, rollback, and rollback
  candidates.
- [x] Add Web help links, CLI help/docs links, HTTP/API descriptions, and future MCP/tool
  descriptions to the registry.
- [x] Mark `zh-CN` and `en-US` locale state explicitly.
- [ ] Add public error guide entries for recovery admission failures when write commands become
  active.

## Verification

- [ ] Run targeted docs/source checks after Code Round.
- [x] Run targeted application tests for recovery readiness.
- [x] Run targeted API/oRPC contract tests.
- [x] Run targeted CLI type/catalog checks.
- [x] Run targeted Web semantic checks.
- [ ] Run `bun run lint` before final Code Round closure.

## Post-Implementation Sync

- [x] Reconcile ADR-034, feature artifacts, local command/query/workflow/error specs, test
  matrices, implementation plans, public docs, operation catalog, and code.
- [x] Update migration gaps for artifact retention, event payloads, and public docs.
- [x] Confirm `deployments.show`, `deployments.stream-events`, and active readiness query consume the
  same readiness semantics; recovery commands remain future accepted candidates.

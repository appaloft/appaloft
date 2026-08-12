# Operate And Recover Test Matrix

| ID | Level | Planned binding | Required evidence |
| --- | --- | --- | --- |
| OPR-SELECT-001 | CLI/integration | operate coordinator + CLI | zero/one/many/explicit exact target selection |
| OPR-SNAPSHOT-002 | unit/integration | snapshot coordinator | existing query DTOs compose with one observed-at value |
| OPR-PARTIAL-003 | unit/contract | section result mapper | optional failure explicit; target/admission fail closed |
| OPR-TUI-004 | protocol/Rust | loopback renderer + operate module | target/section/action navigation and terminal restore |
| OPR-HEADLESS-005 | CLI | local and remote fake runtimes | same bounded JSON snapshot without renderer |
| OPR-REFRESH-006 | protocol/integration | presentation polling harness | atomic refresh and bounded cancellation |
| OPR-READINESS-007 | unit/integration | action coordinator | fresh readiness before each recovery write |
| OPR-CONFIRM-008 | protocol/Rust | confirmation state machine | exact two-step confirmation; mismatch cancels |
| OPR-RETRY-009 | integration | existing retry/redeploy command dispatch | accepted attempt followed by refreshed evidence |
| OPR-ROLLBACK-010 | integration/e2e | existing rollback command dispatch | exact candidate/timestamp and verified new attempt |
| OPR-BACKUP-011 | integration | existing storage/dependency backup queries/commands | bounded artifacts/blockers and selected create |
| OPR-RESTORE-012 | integration/e2e | storage restore-plan/restore | independent target default and readback |
| OPR-PROOF-013 | integration/e2e | proof/health/timeline refresh | acceptance separated from verified/incomplete/failed |
| OPR-NOTIFY-014 | unit/integration | threshold/delivery evidence mapper | safe actionable state or explicit unavailable |
| OPR-PORTABILITY-015 | unit/CLI | portability readiness/handoff mapper | owner-scoped exact handoff; no replace import |
| OPR-ERROR-016 | contract | TUI/JSON safe error renderer | stable safe fields and no secret/provider payload |
| OPR-CLEANUP-017 | protocol/process | listener/child/poll teardown | signal/exit/failure zero presentation residue |
| OPR-COMPAT-018 | contract | catalog/API/CLI regression | no new business operation; existing schemas unchanged |
| OPR-PACKAGE-019 | package/contract | narrow adapter-cli subpath | Operate presentation resolves without loading SDK-dependent CLI modules |

Required R3 acceptance has two independent journeys in a composed runtime:

1. create a failed Deployment, observe it through Operate, execute an admitted rollback, and verify
   timeline/health/proof before exact workload cleanup;
2. create a supported StorageVolume backup, restore it to an independent target, verify content and
   readback, and clean only the created backup/restore/workload resources.

Both journeys must prove bounded output, no provider-console step, and zero owned residuals.

## Public Implementation Evidence

- `OPR-SELECT-001` through `OPR-PARTIAL-003`, `OPR-HEADLESS-005` through
  `OPR-PORTABILITY-015`, and `OPR-ERROR-016` through `OPR-PACKAGE-019` are covered by the focused
  CLI presentation, command, renderer and control-plane tests under
  `packages/adapters/cli/test/`.
- `OPR-TUI-004`, `OPR-CONFIRM-008` and `OPR-CLEANUP-017` are covered by the Rust module tests and
  the real PTY/loopback renderer tests for protocol `operate/v1`.
- Public repository lint, typecheck, full test, build, locked Rust tests/release build and the
  docs-impact registry checks passed on the implementation branch.
- The two composed-runtime journeys remain a Cloud acceptance obligation and are not implied by
  the public fake-runtime or loopback evidence above.

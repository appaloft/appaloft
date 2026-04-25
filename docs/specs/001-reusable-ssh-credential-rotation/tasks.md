# Tasks: Reusable SSH Credential Rotation

## Spec Round

- [x] Position `credentials.rotate-ssh` in `docs/BUSINESS_OPERATION_MAP.md` as an active command.
- [x] Create feature artifacts under `docs/specs/001-reusable-ssh-credential-rotation/`.
- [x] Add command spec at `docs/commands/credentials.rotate-ssh.md`.
- [x] Update `docs/workflows/ssh-credential-lifecycle.md` for rotation workflow and safety rules.
- [x] Update `docs/errors/credentials.lifecycle.md` for rotation phases and stable errors.
- [x] Add planned rotation rows to `docs/testing/ssh-credential-lifecycle-test-matrix.md`.
- [x] Update `docs/implementation/ssh-credential-lifecycle-plan.md` with Code Round ordering.
- [x] Mark `docs/PRODUCT_ROADMAP.md` complete after Code Round verification.

## Test-First

- [x] SSH-CRED-ROTATE-001 through SSH-CRED-ROTATE-006: add application use-case tests at `packages/application/test/rotate-ssh-credential.test.ts`.
- [x] SSH-CRED-ROTATE-007 through SSH-CRED-ROTATE-008: add PG/PGlite tests at `packages/persistence/pg/test/ssh-credential-rotate.pglite.test.ts`.
- [x] SSH-CRED-ENTRY-011: update operation catalog boundary tests for the active command.
- [x] SSH-CRED-ENTRY-012: add CLI dispatch test at `packages/adapters/cli/test/server-command.test.ts`.
- [x] SSH-CRED-ENTRY-013: add HTTP/oRPC dispatch test at `packages/orpc/test/ssh-credential-rotate.http.test.ts`.
- [x] SSH-CRED-ENTRY-014: add Web confirmation/acknowledgement test for saved SSH credentials or server detail.
- [x] SSH-CRED-ENTRY-015: add docs/help coverage tests only when the operation becomes active.

## Implementation

- [x] Add application command schema/message/handler/use case for `credentials.rotate-ssh`.
- [x] Add core aggregate behavior and value-object/state support for rotated credential metadata.
- [x] Add repository mutation/specification support without adding business verbs to repositories.
- [x] Add PG/PGlite persistence migration or nullable metadata handling if rotated metadata is stored.
- [x] Extend `credentials.show` read model with backward-compatible rotated metadata.
- [x] Add operation catalog and `docs/CORE_OPERATIONS.md` active rows in the same Code Round.

## Entrypoints And Docs

- [x] Add API/oRPC route `POST /api/credentials/ssh/{credentialId}/rotate`.
- [x] Add CLI command `appaloft server credential-rotate <credentialId> --private-key-file <path> --confirm <credentialId>` plus `--acknowledge-server-usage` for nonzero usage.
- [x] Add Web affordance that reads usage, requires exact confirmation, and requires in-use acknowledgement for nonzero usage.
- [x] Update public docs topic `server.ssh-credential` and docs registry/help coverage after the command is active.
- [x] Keep MCP/tool description generation sourced from operation catalog metadata.

## Verification

- [x] Run targeted application tests for `rotate-ssh-credential`.
- [x] Run targeted PG/PGlite credential rotation tests.
- [x] Run targeted CLI and HTTP/oRPC dispatch tests.
- [x] Run targeted Web credential rotation tests if Web affordance is included.
- [x] Run docs registry coverage tests after active operation catalog changes.

## Post-Implementation Sync

- [x] Reconcile feature artifacts, command/workflow/error/testing docs, roadmap, operation map, `CORE_OPERATIONS.md`, operation catalog, public docs/help, and implementation notes.
- [x] Mark the Phase 4 SSH credential rotation item complete after CLI, API/oRPC, Web/docs outcome, tests, and operation catalog are aligned.

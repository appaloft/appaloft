# Repository Config Scheduled Task Graph Tasks

## Spec Round

- [x] Add ADR-068 for repository config scheduled task graph.
- [x] Add `docs/specs/077-repository-config-scheduled-task-graph/spec.md`.
- [x] Add plan and task checklist.
- [x] Classify operation-catalog impact as workflow/profile extension over existing operations.
- [x] Record Appaloft YAML sync decision.

## Code Round

- [x] Extend deployment config parser and generated JSON schema.
- [x] Add parser/schema tests for accepted scheduled tasks and rejected unknown/unsafe fields.
- [x] Extend CLI config deploy seed and orchestration.
- [x] Add CLI tests for create/provenance, configure idempotency, exact adoption, and conflict behavior.
- [x] Extend source-link provenance types and persistence metadata.
- [x] Extend preview cleanup for provenance-owned scheduled tasks.
- [x] Add cleanup tests proving provenance-only deletion.

## Docs Round

- [x] Update repository config workflow docs.
- [x] Update GitHub Action PR preview workflow docs.
- [x] Update `deployments.cleanup-preview` command docs.
- [x] Update deployment config and scheduled task test matrices.
- [x] Update public config-file and scheduled-task docs.
- [x] Update AI-facing deploy skill docs.

## Verification

- [x] `bun test packages/deployment-config/test/appaloft-config.test.ts`
- [x] `bun test packages/adapters/cli/test/deployment-config.test.ts`
- [x] `bun test packages/application/test/cleanup-preview.test.ts`
- [x] `bun test packages/adapters/cli/test/deployment-remote-state.test.ts`
- [x] Targeted typechecks for touched packages

# Repository Config Dependency Backup Policy Tasks

## Spec Round

- [x] Add ADR-070 for repository config dependency backup policy.
- [x] Add `docs/specs/079-repository-config-dependency-backup-policy/spec.md`.
- [x] Add plan and task checklist.
- [x] Classify operation-catalog impact as workflow/profile extension over existing operations.
- [x] Record Appaloft YAML sync decision.

## Code Round

- [x] Extend deployment config parser and generated JSON schema.
- [x] Add parser/schema tests for accepted backup policy and rejected unknown/unsafe fields.
- [x] Extend CLI config deploy seed and dependency orchestration.
- [x] Add CLI tests for create/configure, idempotency, drift, manual conflict, and disable behavior.

## Docs Round

- [x] Update repository config workflow docs.
- [x] Update dependency resource docs.
- [x] Update deployment config and dependency resource test matrices.
- [x] Update public config-file and dependency docs.
- [x] Update AI-facing deploy skill docs.

## Verification

- [x] `bun test packages/deployment-config/test/appaloft-config.test.ts`
- [x] `bun test packages/adapters/cli/test/deployment-config.test.ts`
- [x] Targeted typechecks for touched packages

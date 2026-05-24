# Repository Config Generated Access Profile Tasks

## Spec Round

- [x] Add ADR-071 for repository config generated access profile.
- [x] Add `docs/specs/080-repository-config-generated-access-profile/spec.md`.
- [x] Add plan and task checklist.
- [x] Classify operation-catalog impact as workflow/profile extension over existing operations.
- [x] Record Appaloft YAML sync decision.

## Code Round

- [x] Extend deployment config parser and generated JSON schema.
- [x] Add parser/schema tests for accepted generated access profile and rejected unsafe fields.
- [x] Extend CLI config deploy seed and Resource access profile reconciliation.
- [x] Add CLI tests for configure, idempotency, and disable behavior.

## Docs Round

- [x] Update repository config workflow docs.
- [x] Update deployment config test matrix.
- [x] Update public config-file docs.
- [x] Update AI-facing deploy skill docs.

## Verification

- [x] `bun test packages/deployment-config/test/appaloft-config.test.ts`
- [x] `bun test packages/adapters/cli/test/deployment-config.test.ts`
- [x] Targeted typechecks for touched packages

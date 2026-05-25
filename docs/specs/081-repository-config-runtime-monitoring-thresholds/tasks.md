# Repository Config Runtime Monitoring Thresholds Tasks

## Spec Round

- [x] Add ADR-072 for repository config runtime monitoring thresholds.
- [x] Add `docs/specs/081-repository-config-runtime-monitoring-thresholds/spec.md`.
- [x] Add plan and task checklist.
- [x] Classify operation-catalog impact as workflow/profile extension over existing operations.
- [x] Record Appaloft YAML sync decision.

## Code Round

- [x] Extend deployment config parser and generated JSON schema.
- [x] Add parser/schema tests for accepted thresholds and rejected unsafe fields.
- [x] Extend CLI config deploy seed and Resource-scope threshold reconciliation.
- [x] Add CLI tests for configure, idempotency, and inherited-policy override behavior.

## Docs Round

- [x] Update repository config workflow docs.
- [x] Update deployment config and runtime monitoring test matrices.
- [x] Update public config-file docs.
- [x] Update AI-facing deploy skill docs.

## Verification

- [x] `bun test packages/deployment-config/test/appaloft-config.test.ts`
- [x] `bun test packages/adapters/cli/test/deployment-config.test.ts`
- [x] Targeted typechecks for touched packages

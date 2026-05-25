# Repository Config Auto-Deploy Policy Tasks

## Spec Round

- [x] Add ADR-069 for repository config auto-deploy policy.
- [x] Add `docs/specs/078-repository-config-auto-deploy-policy/spec.md`.
- [x] Add plan and task checklist.
- [x] Classify operation-catalog impact as workflow/profile extension over existing operations.
- [x] Record Appaloft YAML sync decision.

## Code Round

- [x] Extend deployment config parser and generated JSON schema.
- [x] Add parser/schema tests for accepted auto-deploy policy and rejected unknown/unsafe fields.
- [x] Extend CLI config deploy seed and orchestration.
- [x] Add CLI tests for create/configure, idempotency, drift, and disable behavior.

## Docs Round

- [x] Update repository config workflow docs.
- [x] Update GitHub Action PR preview workflow docs.
- [x] Update deployment config and source auto-deploy test matrices.
- [x] Update public config-file and source docs.
- [x] Update AI-facing deploy skill docs.

## Verification

- [x] `bun test packages/deployment-config/test/appaloft-config.test.ts`
- [x] `bun test packages/adapters/cli/test/deployment-config.test.ts`
- [x] Targeted typechecks for touched packages

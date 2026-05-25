# Repository Config Prebuilt Image Source Tasks

## Spec Round

- [x] Add ADR-076 for repository config prebuilt image source.
- [x] Add `docs/specs/085-repository-config-prebuilt-image-source/spec.md`.
- [x] Add plan and task checklist.
- [x] Classify operation-catalog impact as workflow/profile extension over existing operations.
- [x] Record Appaloft YAML sync decision.

## Code Round

- [x] Extend deployment config parser and JSON schema.
- [x] Add parser/schema tests for accepted image source and rejected unsafe/incompatible fields.
- [x] Extend CLI config deploy seed mapping.
- [x] Add CLI tests for image source profile creation and idempotent existing profile.

## Docs Round

- [x] Update repository config workflow docs.
- [x] Update GitHub Action PR preview workflow docs.
- [x] Update deployment config test matrix.
- [x] Update public config-file docs.
- [x] Update AI-facing deploy skill docs.

## Verification

- [x] `bun test packages/deployment-config/test/appaloft-config.test.ts`
- [x] `bun test packages/adapters/cli/test/deployment-config.test.ts`
- [x] Targeted typechecks for touched packages
- [x] `bun run --cwd apps/docs typecheck`

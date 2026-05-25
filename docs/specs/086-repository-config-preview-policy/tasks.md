# Repository Config Preview Policy Tasks

## Spec Round

- [x] Add ADR-077 for repository config preview policy.
- [x] Add `docs/specs/086-repository-config-preview-policy/spec.md`.
- [x] Add plan and task checklist.
- [x] Classify operation-catalog impact as workflow/profile extension over existing operations.
- [x] Record Appaloft YAML sync decision.

## Code Round

- [x] Extend deployment config parser and JSON schema.
- [x] Add parser/schema tests for accepted preview policy and rejected unsafe fields.
- [x] Extend CLI config deploy seed mapping.
- [x] Add CLI tests for policy configure, idempotency, and PR preview skip behavior.

## Docs Round

- [x] Update repository config workflow docs.
- [x] Update GitHub Action PR preview workflow docs.
- [x] Update deployment config test matrix.
- [x] Update cleanup preview command spec.
- [x] Update public config-file docs and preview docs.
- [x] Update AI-facing deploy skill docs.

## Verification

- [x] `bun test packages/deployment-config/test/appaloft-config.test.ts`
- [x] `bun test packages/adapters/cli/test/deployment-config.test.ts`
- [x] Targeted typechecks for touched packages
- [x] `bun run --cwd apps/docs typecheck`

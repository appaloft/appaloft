# Repository Config Storage Graph Tasks

## Spec Round

- [x] Add ADR-067 for repository config storage graph.
- [x] Add `docs/specs/076-repository-config-storage-graph/spec.md`.
- [x] Add plan and task checklist.
- [x] Classify operation-catalog impact as workflow/profile extension over existing operations.
- [x] Record Appaloft YAML sync decision.

## Code Round

- [x] Extend deployment config parser and generated JSON schema.
- [x] Add parser/schema tests for accepted storage and rejected unknown/unsafe fields.
- [x] Extend CLI config deploy seed and orchestration.
- [x] Add CLI tests for create/attach/provenance, idempotency, and conflict behavior.
- [x] Extend source-link provenance types and persistence metadata.
- [x] Extend preview cleanup for provenance-owned storage.
- [x] Add cleanup tests proving provenance-only deletion.

## Docs Round

- [x] Update repository config workflow docs.
- [x] Update GitHub Action PR preview workflow docs.
- [x] Update `deployments.cleanup-preview` command docs.
- [x] Update deployment config and storage volume test matrices.
- [x] Update public config-file and storage-volume docs.
- [x] Update project skill with Appaloft YAML sync gate.

## Verification

- [ ] `bun test packages/deployment-config/test/appaloft-config.test.ts`
- [ ] `bun test packages/adapters/cli/test/deployment-config.test.ts`
- [ ] `bun test packages/application/test/cleanup-preview.test.ts`
- [ ] Targeted typechecks for touched packages

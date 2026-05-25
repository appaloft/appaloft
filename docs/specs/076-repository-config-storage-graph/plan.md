# Repository Config Storage Graph Plan

## Scope

Add repository config support for managed named storage volumes and Resource attachments without
changing deployment admission. Keep provider-native storage, bind-mount source paths, storage
sizing, backup/restore, and runtime cleanup outside this MVP.

## Domain And Operation Mapping

| Concern | Decision |
| --- | --- |
| Bounded context | Workload delivery Resource profile plus Storage Volume lifecycle |
| Existing commands | `storage-volumes.create`, `resources.attach-storage`, `resources.detach-storage`, `storage-volumes.delete`, `deployments.cleanup-preview` |
| Existing queries | `storage-volumes.list`, `resources.show` |
| New operation key | None; repository config storage is a workflow/profile extension |
| Deployment admission | No change; `deployments.create` remains ids-only |
| Durable provenance | Extend source-link metadata with `source-link.storage-provenance/v1` |

## Implementation Plan

1. Extend `@appaloft/deployment-config` parser and generated JSON schema with top-level
   `storage.<key>`.
2. Map parsed storage declarations into CLI `DeploymentPromptSeed.storageGraph`.
3. Add CLI config deploy orchestration that lists storage volumes, reads Resource attachments,
   creates missing managed named volumes, attaches missing mounts, handles idempotency/conflicts,
   and writes preview storage provenance.
4. Extend source-link record types and persistence metadata parsing for storage provenance.
5. Extend preview cleanup to detach/delete only provenance-owned ephemeral storage.
6. Update workflow docs, command docs, test matrices, public docs, and AI/project skill sync rules.
7. Add parser, CLI workflow, idempotency/conflict, and cleanup tests.

## Test Strategy

| Matrix ID | Automated coverage |
| --- | --- |
| CONFIG-FILE-STORAGE-001 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-STORAGE-002 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-STORAGE-004 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-STORAGE-005 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-STORAGE-006 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-STORAGE-007 | `packages/adapters/cli/test/deployment-config.test.ts`; `packages/application/test/cleanup-preview.test.ts` |
| CONFIG-FILE-STORAGE-008 | `packages/application/test/cleanup-preview.test.ts` |

## Appaloft YAML Sync Decision

Storage volumes are user-facing application topology and affect deployment snapshots, so they
belong in `appaloft.yaml` as a high-level `storage` graph. The YAML does not expose internal
StorageVolume DTOs, host bind paths, provider-native handles, or cleanup commands.

## Open Questions

- Cross-resource shared writable volume policy remains governed by the storage lifecycle workflow
  and is not inferred from repository config.
- Bind-mount source path ownership and cleanup require a later accepted ADR before any YAML support.

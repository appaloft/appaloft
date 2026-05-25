# Repository Config Storage Graph

## Status

- Round: Code Round
- Artifact state: MVP planned for managed named-volume declarations in repository config, CLI/Action
  config deploy orchestration, and preview cleanup provenance
- Roadmap target: `0.12.x` repository config hardening
- Compatibility impact: `pre-1.0-policy`, additive repository config fields
- Decision state: governed by
  [ADR-067](../../decisions/ADR-067-repository-config-storage-graph.md)

## Business Outcome

Users can commit an `appaloft.yaml` that says the application needs writable storage at a workload
path such as `/app/uploads`. CLI and GitHub Action config deploy create or reuse the managed
provider-neutral storage volume, attach it to the selected Resource profile, and then create a
deployment from ids only so existing deployment snapshot materialization injects the mount.

For PR previews, users can mark the storage ephemeral so preview cleanup removes only the
Appaloft-managed storage volume and attachment that repository config created for that preview.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| RepositoryStorageGraph | User-facing `appaloft.yaml` storage declarations keyed by application names such as `uploads`. | Repository config |
| ManagedStorageDeclaration | A config entry that asks Appaloft to create or reuse a managed named volume. | Config deploy |
| StorageMountTarget | Absolute workload/container path requested by config, for example `/app/uploads`. | Resource storage attachment |
| PreviewStorageProvenance | Source-link metadata proving a preview storage volume and attachment were created by repository config. | Preview cleanup |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CONFIG-STORAGE-001 | Parse managed storage declaration | `appaloft.yaml` declares `storage.uploads.kind = volume`, `source = managed`, and `mount.path = /app/uploads` | The config parser runs | The config is accepted, defaults `mount.mode` to `read-write`, normalizes the mount path, exposes JSON schema, and still rejects unknown storage fields. |
| CONFIG-STORAGE-002 | Reject unsafe storage material | Config includes provider account, tenant, credential, host source path, provider-native handle, secret value, or provider-specific storage settings under `storage` | The config parser runs | Parsing fails before mutation with strict schema, identity, unsupported, or raw-secret validation. |
| CONFIG-STORAGE-003 | Create and attach from config deploy | No matching storage volume or attachment exists for the selected Resource | CLI/Action config deploy resolves identity | The workflow dispatches `resources.show`, `storage-volumes.list`, `storage-volumes.create`, `resources.attach-storage`, then `deployments.create` with ids only. |
| CONFIG-STORAGE-004 | Reuse existing volume and attachment idempotently | Matching managed named volume and Resource attachment already exist | Config deploy runs again | No duplicate create or attach command is dispatched, and deployment admission still uses ids-only input. |
| CONFIG-STORAGE-005 | Stable conflict on mount target | The Resource already has an active attachment for the same `mount.path` to a different storage volume or mode | Config deploy handles the declaration | The workflow fails before deployment with a stable conflict code and safe details. |
| CONFIG-STORAGE-006 | Preview storage provenance is durable | A PR preview storage declaration has `preview.lifecycle = ephemeral` | Config deploy creates or reuses the preview volume and attachment | The source link records safe repository-config provenance with storage key, destination path, resource id, attachment id, storage volume id, and lifecycle. |
| CONFIG-STORAGE-007 | Cleanup removes only provenance-owned ephemeral storage | Preview cleanup runs for a source fingerprint with matching storage provenance | Runtime cleanup has succeeded | Cleanup detaches the recorded attachment, deletes the recorded storage volume through existing delete safety, removes route/source-link state, and returns safe cleanup counts. |
| CONFIG-STORAGE-008 | Cleanup preserves manual/shared storage | Preview cleanup runs when no matching storage provenance exists or delete safety reports another active/shared blocker | Cleanup reaches storage stage | No unproven storage is deleted; blockers are surfaced without guessing by volume name. |

## Config Contract

MVP repository config fields:

```yaml
storage:
  uploads:
    kind: volume
    source: managed
    mount:
      path: /app/uploads
      mode: read-write
    preview:
      lifecycle: ephemeral
```

Rules:

- storage keys must be stable repository-local names, not Appaloft ids;
- `kind` supports `volume` for the MVP and maps to existing named-volume storage;
- `source` supports `managed` for the MVP;
- `mount.path` must be an absolute normalized workload path, not a host path;
- `mount.mode` supports `read-write` and `read-only`, defaulting to `read-write`;
- `preview.lifecycle` supports `ephemeral`;
- omission of `preview.lifecycle` means normal storage lifecycle; cleanup must not delete it;
- repository config must not declare bind source paths, host paths, provider account, credential,
  tenant, org, raw secret values, provider-native handles, backup handles, or storage provider
  settings.

## Workflow Contract

Config storage deploy must run before deployment admission and after Resource identity is known:

```text
resolve project/environment/resource/server identity
  -> resources.show(resourceId) for current storage attachments
  -> storage-volumes.list(projectId, environmentId)
  -> storage-volumes.create missing managed named volume
  -> resources.attach-storage missing Resource attachment
  -> persist preview storage provenance when lifecycle is ephemeral
  -> deployments.create(ids only)
```

The workflow must use command/query buses only. It must not call storage repositories or
application services from the CLI/HTTP adapter.

Idempotency is based on current read models plus source-link provenance. Preview ephemeral reuse is
not allowed from name alone; matching provenance is required.

## Preview Cleanup Contract

`deployments.cleanup-preview` reads preview source-link provenance and may clean only entries that:

- use schema `source-link.storage-provenance/v1`;
- have `source = repository-config`;
- have the same preview source fingerprint as the cleanup input;
- are `managed` and `ephemeral`;
- match the linked preview `resourceId`;
- include explicit `attachmentId` and `storageVolumeId`.

Cleanup order:

1. Runtime cleanup and stale preview runtime sweep.
2. Unbind provenance-marked ephemeral dependency bindings.
3. Delete provenance-marked ephemeral dependency resources.
4. Detach provenance-marked ephemeral storage attachments.
5. Delete provenance-marked ephemeral storage volumes through `storage-volumes.delete`.
6. Remove server-applied route desired state.
7. Delete the source link.

If storage delete is blocked by another attachment, backup relationship, retained snapshot, or
future provider safety state, the command fails before source-link deletion so a retry can resume
with provenance intact.

## Non-Goals

- No storage fields on `deployments.create`.
- No bind-mount source paths or host paths in repository config.
- No provider-native storage provisioning, sizing, backup, restore, or runtime cleanup fields.
- No deletion of manual, shared, bind-mount, imported, or unproven storage during preview cleanup.
- No automatic `storage-volumes.cleanup-runtime` as part of config deploy or preview cleanup.

## Current Implementation Notes And Migration Gaps

This slice is a repository config workflow/profile extension over existing storage operations. No
new operation-catalog key is introduced. `CORE_OPERATIONS.md` documents the workflow boundary,
while the executable operation catalog remains unchanged because all mutations and reads dispatch
through existing commands and queries.

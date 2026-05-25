# ADR-067: Repository Config Storage Graph

Status: Accepted

Date: 2026-05-24

## Context

`appaloft.yaml` can now describe managed application dependencies such as Postgres, but storage
volumes remain controlled only through explicit storage and Resource attachment commands.

Storage volumes are already modeled as provider-neutral Resource profile records. Deployment
snapshots may carry mount metadata, while `deployments.create` intentionally stays ids-only. PR
preview cleanup can safely delete config-created dependency resources only because source-link
provenance records exactly what repository config created and bound. Storage needs the same
provenance rule before a config file may request ephemeral preview storage.

## Decision

Repository config introduces a top-level `storage` graph for application-owned storage needs:

```yaml
storage:
  uploads:
    kind: volume
    source: managed
    mount:
      path: /app/uploads
    preview:
      lifecycle: ephemeral
```

The user-facing declaration is not a `StorageVolume` DTO. It describes an application storage need
keyed by repository-local names. MVP support is limited to managed named volumes:

- `kind: volume` maps to existing `storage-volumes.create` with `kind = named-volume`;
- `source: managed` means Appaloft creates or reuses provider-neutral storage volume state;
- `mount.path` maps to existing `resources.attach-storage.destinationPath`;
- `mount.mode` defaults to `read-write` and maps to existing Resource storage mount mode;
- `preview.lifecycle: ephemeral` requests preview-scoped storage cleanup only when provenance is
  recorded for that preview source fingerprint.

The CLI/Action repository-config workflow must dispatch existing command/query operations through
the command/query buses:

1. resolve project/environment/resource/server identity outside the committed file;
2. list storage volumes for the selected project/environment;
3. read Resource storage attachments through `resources.show`;
4. create a missing managed named volume through `storage-volumes.create`;
5. attach it through `resources.attach-storage`;
6. record source-link storage provenance when the declaration is preview ephemeral;
7. call `deployments.create` with ids only.

Preview cleanup extends source-link provenance with
`source-link.storage-provenance/v1`. `deployments.cleanup-preview` may detach and delete only
entries that have explicit repository-config provenance for the same preview source fingerprint,
linked Resource, storage volume id, attachment id, and ephemeral lifecycle. Cleanup must not delete
manual, shared, bind-mount, imported, unproven, or name-matched-only storage.

Repository config must not allow host bind source paths, provider account identity, tenant/org
identity, credentials, provider-native handles, backup data, raw secret values, or storage
provider-specific settings. Bind mounts and provider-native storage handles remain explicit
operator workflows until a later ADR accepts safe ownership and cleanup semantics.

## Consequences

- This is a workflow/profile extension over existing storage and cleanup operations. No new
  operation-catalog key is introduced.
- `deployments.create` continues to receive only ids and does not grow storage fields.
- Runtime storage realization remains deployment-driven under ADR-064; repository config creates
  control-plane intent and Resource attachment state only.
- `storage-volumes.delete` still does not clean provider runtime volumes. PR preview cleanup deletes
  provider-neutral storage records after detaching provenance-owned attachments; runtime volume
  cleanup remains the explicit dry-run-first `storage-volumes.cleanup-runtime` operation.
- Existing explicit CLI/Web/API storage commands stay authoritative for manual and shared storage.

## Governed Specs

- [Repository Config Storage Graph](../specs/076-repository-config-storage-graph/spec.md)
- [Repository Deployment Config File Bootstrap Workflow](../workflows/deployment-config-file-bootstrap.md)
- [GitHub Action PR Preview Deploy Workflow](../workflows/github-action-pr-preview-deploy.md)
- [deployments.cleanup-preview Command Spec](../commands/deployments.cleanup-preview.md)
- [Storage Volume Lifecycle Workflow](../workflows/storage-volume-lifecycle.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Storage Volume Test Matrix](../testing/storage-volume-test-matrix.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](./ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-064: Storage Volume Runtime Realization And Cleanup](./ADR-064-storage-volume-runtime-realization-and-cleanup.md)

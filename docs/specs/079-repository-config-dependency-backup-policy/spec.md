# Repository Config Dependency Backup Policy

## Status

- Round: Post-Implementation Sync
- Artifact state: MVP implemented for managed dependency scheduled backup policy declarations in
  repository config and CLI/Action config deploy orchestration
- Roadmap target: `0.12.x` repository config hardening
- Compatibility impact: `pre-1.0-policy`, additive repository config fields
- Decision state: governed by
  [ADR-070](../../decisions/ADR-070-repository-config-dependency-backup-policy.md)

## Business Outcome

Users can declare a managed dependency and its scheduled backup policy in one `appaloft.yaml`.
Config deploy reconciles the policy through existing dependency resource backup policy operations
before deployment admission. Backups and restores remain explicit dependency-resource operations,
and deployment admission remains ids-only.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| RepositoryDependencyBackupPolicy | User-facing `dependencies.<key>.backup` declaration for scheduled dependency backups. | Repository config |
| RepositoryConfigBackupPolicyReconcile | Config deploy step that creates, updates, disables, or no-ops a repository-config-owned backup policy. | Dependency Resources |
| RepositoryConfigBackupPolicyId | Deterministic policy id derived from the dependency resource id to avoid mutating manual policies without provenance. | Dependency Resources |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CONFIG-DEPENDENCY-BACKUP-001 | Parse backup policy | `dependencies.db.backup` declares enabled, interval hours, retention days, and retry policy | The config parser runs | The config is accepted, JSON schema exposes the field, and unknown backup fields remain rejected. |
| CONFIG-DEPENDENCY-BACKUP-002 | Reject unsafe backup material | Config includes policy id, provider key, backup id, restore point id, artifact handle, token, credential, or raw path under `backup` | The config parser runs | Parsing fails before mutation with strict schema, identity, unsupported, or raw-secret validation. |
| CONFIG-DEPENDENCY-BACKUP-003 | Configure missing policy | Managed dependency is selected/provisioned and no repository-config backup policy exists | Config deploy handles dependencies | The workflow dispatches `dependency-resources.backup-policies.configure` before `deployments.create`. |
| CONFIG-DEPENDENCY-BACKUP-004 | Idempotent no-op | The repository-config-owned policy already matches YAML | Config deploy runs | No configure command is dispatched for the policy. |
| CONFIG-DEPENDENCY-BACKUP-005 | Drifted owned policy updated | The repository-config-owned policy differs from YAML | Config deploy runs | The workflow reconfigures the policy with the same deterministic policy id. |
| CONFIG-DEPENDENCY-BACKUP-006 | Manual policy preserved | A dependency resource has only a manually configured policy with different values | Config deploy runs | The workflow fails with a stable conflict before mutating manual policy. |
| CONFIG-DEPENDENCY-BACKUP-007 | Disable owned policy | YAML declares `backup.enabled = false` and the repository-config-owned policy exists | Config deploy runs | The workflow disables the owned policy and keeps deployment admission ids-only. |

## Config Contract

MVP repository config fields:

```yaml
dependencies:
  db:
    kind: postgres
    source: managed
    bind:
      env: DATABASE_URL
    backup:
      enabled: true
      intervalHours: 24
      retentionDays: 7
      retryOnFailure: true
```

Rules:

- `backup.enabled` defaults to `true` when `backup` is present.
- `intervalHours` and `retentionDays` are required when backup is enabled.
- `retryOnFailure` defaults to `true`.
- `enabled: false` disables an existing repository-config-owned policy and does not require
  interval or retention values.
- Repository config must not declare backup policy ids, provider keys, provider accounts, tenant/org
  identity, backup artifact handles, restore point ids, raw paths, raw dump content, credentials, or
  secret values.

## Workflow Contract

Config dependency backup reconcile runs inside dependency graph handling after dependency resource
selection/provisioning:

```text
dependency resource selected/provisioned
  -> dependency backup policies list(dependencyResourceId)
  -> dependency backup policies configure(create/update/disable when needed)
  -> resources.bind-dependency
  -> deployments.create(ids only)
```

The workflow must use command/query buses only. It must not call repositories or application
services from the CLI/HTTP adapter.

## Non-Goals

- No backup or restore execution during config deploy.
- No backup fields on `deployments.create`.
- No backup artifact export, prune/delete, or cross-resource restore declarations.
- No provider-native backup handles, provider keys, or credential material in YAML.

## Current Implementation Notes And Migration Gaps

This slice is a repository config workflow/profile extension over existing
`dependency-resources.backup-policies.configure/list/show`. No new operation-catalog key is
introduced.

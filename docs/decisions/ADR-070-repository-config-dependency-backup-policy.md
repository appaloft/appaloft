# ADR-070: Repository Config Dependency Backup Policy

Status: Accepted

Date: 2026-05-24

## Context

Repository config can declare the application dependency graph and Appaloft can configure scheduled
backup policy for dependency resources through explicit operations. The missing link is user-facing
desired state for "this managed database should be backed up every N hours and retained for N
days" in `appaloft.yaml`.

The YAML must remain an application dependency declaration. It must not expose backup policy ids,
backup artifact handles, restore point ids, provider account ids, provider keys, raw dump paths,
credentials, or secret values. Backup creation and restore remain explicit backup operations; config
deploy only reconciles policy metadata.

## Decision

Repository config extends `dependencies.<key>` with an optional `backup` declaration:

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

Config deploy reconciles this declaration after the dependency resource is selected or provisioned
and before deployment admission. The workflow uses existing command/query operations:

1. list/provision/reuse the dependency resource;
2. list backup policies for that dependency resource;
3. create or update the repository-config-owned backup policy through
   `dependency-resources.backup-policies.configure`;
4. bind the dependency to the Resource and continue to `deployments.create` with ids only.

When enabled, `intervalHours` and `retentionDays` are required. `retryOnFailure` defaults to true.
When disabled, config deploy disables the repository-config-owned policy if it exists; if only a
manual policy exists, config deploy leaves it untouched. A deterministic repository-config policy id
is used as minimal provenance so YAML does not mutate or delete manually created backup policies.

## Consequences

- This is a workflow/profile extension over existing dependency backup policy operations. No new
  operation-catalog key is introduced.
- `deployments.create` remains ids-only and never receives backup policy fields.
- Manual backup creation, restore, backup artifact export, and provider-native backup details stay
  outside repository config.
- The Appaloft YAML sync gate must consider dependency backup policy whenever dependency resource
  behavior changes.

## Governed Specs

- [Repository Config Dependency Backup Policy](../specs/079-repository-config-dependency-backup-policy/spec.md)
- [Repository Config Dependency Graph](../specs/075-repository-config-dependency-graph/spec.md)
- [Dependency Resource Scheduled Backup Policy](../specs/070-dependency-resource-scheduled-backup-policy/spec.md)
- [Repository Deployment Config File Bootstrap Workflow](../workflows/deployment-config-file-bootstrap.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Dependency Resource Test Matrix](../testing/dependency-resource-test-matrix.md)
- [ADR-036: Dependency Resource Backup And Restore Lifecycle](./ADR-036-dependency-resource-backup-restore-lifecycle.md)
- [ADR-066: Repository Config Dependency Graph](./ADR-066-repository-config-dependency-graph.md)

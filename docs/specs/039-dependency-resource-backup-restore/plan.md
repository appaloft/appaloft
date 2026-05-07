# Plan: Dependency Resource Backup And Restore

## Governing Sources

- ADR: `docs/decisions/ADR-036-dependency-resource-backup-restore-lifecycle.md`
- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Workflow spec: `docs/workflows/dependency-resource-lifecycle.md`
- Test matrix: `docs/testing/dependency-resource-test-matrix.md`

## Architecture Approach

- Core:
  - Added a `DependencyResourceBackup` aggregate/process model with value-object state for ids,
    statuses, timestamps, artifact handles, retention metadata, and sanitized failure metadata.
  - Extended `ResourceInstance` delete safety and backup eligibility behavior without storing raw
    provider artifacts or dump material.
  - Kept all domain-significant fields as value objects.
- Application:
  - Added explicit command/query messages and handlers for create backup, restore backup, list
    backups, and show backup.
  - Added provider capability ports for dependency resource backup and restore with safe DTOs.
  - Coordinated admission, persistence, event publication, provider execution, and safe failure
    recording through use cases.
- Persistence/read models:
  - Persisted backup attempts, restore points, restore attempts, retention metadata, and sanitized
    failure metadata.
  - Extended dependency resource delete-safety readers so retained backups and in-flight attempts
    block delete.
  - Added safe backup list/show read models.
- Entrypoints:
  - Added operation catalog entries during Code Round.
  - Added CLI and oRPC/HTTP dispatch using command/query schemas.
  - Kept Web/public docs as an explicit migration gap.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: not releasing in this round.
- Compatibility impact: `pre-1.0-policy`, additive public commands and read models.
- Release-note/changelog: deferred until release prep.

## Testing Strategy

- Matrix ids:
  - DEP-RES-BACKUP-001 through DEP-RES-BACKUP-011
- Test-first bindings:
  - Core tests for backup aggregate transitions, restore attempt transitions, retention blockers,
    and unsafe state rejection.
  - Application use-case tests with fake backup/restore provider success and failure paths.
  - Persistence PGlite tests for backup/restore state, safe list/show read models, and delete
    blocker projection.
  - Contract tests for safe backup summary schemas.
  - CLI/oRPC/HTTP route dispatch tests for all four operations.
  - Operation catalog boundary tests for explicit commands/queries and no generic backup mutation.

## Risks And Migration Gaps

- Durable outbox/inbox and background worker retry are global migration gaps. The first Code Round
  uses synchronous hermetic provider execution while preserving attempt state and events.
- Restore is destructive provider work. The command must require explicit acknowledgements and must
  not restart workloads or imply app-level consistency.
- Backup/restore support depends on provider capabilities for each dependency kind. Unsupported
  providers must fail admission with stable structured errors.
- Web/public documentation affordances remain a migration gap for a later Docs/Web round.

# Repository Config Dependency Backup Policy Plan

## Scope

Add repository config support for scheduled backup policy on managed dependency declarations. Keep
manual backup creation, restore, artifact export, provider-native backup settings, and secret
custody outside this MVP.

## Domain And Operation Mapping

| Concern | Decision |
| --- | --- |
| Bounded context | Dependency Resources |
| Existing commands | `dependency-resources.backup-policies.configure`, `deployments.create` |
| Existing queries | `dependency-resources.backup-policies.list` |
| New operation key | None; repository config backup policy is a workflow/profile extension |
| Deployment admission | No change; `deployments.create` remains ids-only |
| Durable provenance | Deterministic repository-config policy id derived from dependency resource id |

## Implementation Plan

1. Extend `@appaloft/deployment-config` parser and generated JSON schema with
   `dependencies.<key>.backup`.
2. Map parsed declarations into CLI `DeploymentDependencySeed.backupPolicy`.
3. Reconcile backup policy after dependency resource resolution and before deployment admission.
4. Update workflow docs, dependency docs, test matrices, public docs, and AI-facing deploy docs.
5. Add parser and CLI workflow/idempotency/conflict/disable tests.

## Test Strategy

| Matrix ID | Automated coverage |
| --- | --- |
| CONFIG-FILE-DEPENDENCY-BACKUP-001 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-DEPENDENCY-BACKUP-002 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-DEPENDENCY-BACKUP-003 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-DEPENDENCY-BACKUP-004 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-DEPENDENCY-BACKUP-005 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-DEPENDENCY-BACKUP-006 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-DEPENDENCY-BACKUP-007 | `packages/adapters/cli/test/deployment-config.test.ts` |

## Appaloft YAML Sync Decision

Scheduled dependency backup policy is application dependency desired state. It belongs in
`appaloft.yaml` under the dependency declaration when it can be expressed without policy ids,
provider handles, credentials, raw paths, or backup artifacts.

## Open Questions

- Backup prune/delete and export remain future slices.
- Storage volume backup parity remains future work.

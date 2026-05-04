# Dependency Resource Test Matrix

## Scope

This matrix covers the Phase 7 Postgres dependency resource lifecycle baseline:

- `dependency-resources.provision-postgres`
- `dependency-resources.import-postgres`
- `dependency-resources.list`
- `dependency-resources.show`
- `dependency-resources.rename`
- `dependency-resources.delete`

It does not cover Redis, dependency bind/unbind, secret rotation, backup/restore, provider-native
Postgres provisioning, deployment snapshot binding, runtime cleanup, redeploy, or rollback.

## Global References

- [Postgres Dependency Resource Lifecycle](../specs/033-postgres-dependency-resource-lifecycle/spec.md)
- [Dependency Resource Lifecycle Workflow](../workflows/dependency-resource-lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [ADR-012](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-025](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-026](../decisions/ADR-026-aggregate-mutation-command-boundary.md)

## Coverage Rows

| ID | Operation | Type | Scenario | Expected | Automation Binding |
| --- | --- | --- | --- | --- | --- |
| DEP-RES-PG-PROVISION-001 | `dependency-resources.provision-postgres` | Core/application | Provision managed Postgres record. | Persists Appaloft-managed `postgres` ResourceInstance, emits creation event, and performs no provider-native database action. | `packages/core/test/postgres-dependency-resource.test.ts`; `packages/application/test/postgres-dependency-resource-lifecycle.test.ts` |
| DEP-RES-PG-IMPORT-001 | `dependency-resources.import-postgres` | Application | Import external Postgres. | Persists imported-external Postgres with connection secret boundary and masked read model. | `packages/application/test/postgres-dependency-resource-lifecycle.test.ts` |
| DEP-RES-PG-VALIDATION-001 | `dependency-resources.provision-postgres`; `dependency-resources.import-postgres` | Core/application | Invalid name/slug/endpoint/connection metadata. | Returns `validation_error`, `phase = dependency-resource-validation`, no mutation. | `packages/core/test/postgres-dependency-resource.test.ts`; `packages/application/test/postgres-dependency-resource-lifecycle.test.ts` |
| DEP-RES-PG-READ-001 | `dependency-resources.list`; `dependency-resources.show` | Query/read model | Managed and imported resources exist. | Returns safe ownership, status, exposure, binding readiness, and backup relationship summaries. | `packages/application/test/postgres-dependency-resource-lifecycle.test.ts`; `packages/persistence/pg/test/dependency-resource.pglite.test.ts` |
| DEP-RES-PG-READ-002 | `dependency-resources.list`; `dependency-resources.show` | Query/read model | Raw connection secret was provided at import. | No raw password, token, auth header, cookie, SSH credential, provider token, private key, or sensitive query appears in output. | `packages/application/test/postgres-dependency-resource-lifecycle.test.ts`; `packages/persistence/pg/test/dependency-resource.pglite.test.ts` |
| DEP-RES-PG-RENAME-001 | `dependency-resources.rename` | Application | Rename active Postgres dependency resource. | Changes name/slug only; binding/backup/provider/runtime/snapshot metadata remains unchanged. | `packages/application/test/postgres-dependency-resource-lifecycle.test.ts` |
| DEP-RES-PG-DELETE-001 | `dependency-resources.delete` | Application | Delete imported external resource with no blockers. | Tombstones Appaloft record only and does not imply external/provider deletion. | `packages/core/test/postgres-dependency-resource.test.ts`; `packages/application/test/postgres-dependency-resource-lifecycle.test.ts` |
| DEP-RES-PG-DELETE-002 | `dependency-resources.delete` | Application | Delete bound dependency resource. | Returns `dependency_resource_delete_blocked`, no mutation. | `packages/application/test/postgres-dependency-resource-lifecycle.test.ts` |
| DEP-RES-PG-DELETE-003 | `dependency-resources.delete` | Application | Delete resource protected by backup relationship metadata. | Returns `dependency_resource_delete_blocked`, no backup data is deleted. | `packages/core/test/postgres-dependency-resource.test.ts`; `packages/application/test/postgres-dependency-resource-lifecycle.test.ts` |
| DEP-RES-PG-DELETE-004 | `dependency-resources.delete` | Application | Delete provider-managed unsafe resource. | Returns `dependency_resource_delete_blocked`, no provider-native deletion or runtime cleanup. | `packages/core/test/postgres-dependency-resource.test.ts`; `packages/application/test/postgres-dependency-resource-lifecycle.test.ts` |
| DEP-RES-PG-ENTRY-001 | Operation catalog / CLI | Entrypoint | Dependency resource operations are public through the catalog and CLI. | Catalog and CLI dispatch explicit command/query messages and expose no generic update operation. | `packages/application/test/operation-catalog-boundary.test.ts`; `packages/adapters/cli/test/dependency-command.test.ts` |
| DEP-RES-PG-ENTRY-002 | oRPC / HTTP | Entrypoint | Dependency resource operations are public through HTTP/oRPC. | oRPC/HTTP routes reuse command/query schemas and dispatch explicit command/query messages. | `packages/orpc/test/dependency-resource.http.test.ts` |

## Required Non-Coverage Assertions

Tests must assert Postgres dependency resource commands do not:

- create provider-native databases;
- bind or unbind Resources;
- rotate secrets;
- run backup/restore;
- mutate historical deployment snapshots;
- restart, stop, prune, or clean runtime state;
- expose raw connection strings, passwords, tokens, auth headers, cookies, SSH credentials,
  provider tokens, private keys, or sensitive query parameters.

## Current Implementation Notes And Migration Gaps

This baseline implements Postgres dependency resource control-plane records and safe read models.
Redis, dependency bind/unbind, binding secret rotation, provider-native Postgres lifecycle,
backup/restore, deployment snapshot binding, Web affordances, and runtime cleanup remain future
Phase 7 work.

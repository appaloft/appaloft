# Dependency Resource Test Matrix

## Scope

This matrix covers the Phase 7 Postgres dependency resource lifecycle baseline:

- `dependency-resources.provision-postgres`
- `dependency-resources.import-postgres`
- `dependency-resources.list`
- `dependency-resources.show`
- `dependency-resources.rename`
- `dependency-resources.delete`
- `resources.bind-dependency`
- `resources.unbind-dependency`
- `resources.list-dependency-bindings`
- `resources.show-dependency-binding`

It does not cover Redis, secret rotation, backup/restore, provider-native Postgres provisioning,
runtime env injection, runtime cleanup, redeploy, or rollback.

## Global References

- [Postgres Dependency Resource Lifecycle](../specs/033-postgres-dependency-resource-lifecycle/spec.md)
- [Dependency Resource Binding Baseline](../specs/034-dependency-resource-binding-baseline/spec.md)
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
| DEP-BIND-PG-BIND-001 | `resources.bind-dependency` | Core/application | Bind ready Postgres dependency resource to active Resource. | Persists active `ResourceBinding`, emits `resource-dependency-bound`, and performs no provider-native database action. | `packages/core/test/resource-binding.test.ts`; `packages/application/test/dependency-resource-binding.test.ts` |
| DEP-BIND-PG-BIND-002 | `resources.bind-dependency` | Application | Cross-project or cross-environment bind. | Returns `resource_dependency_binding_context_mismatch`, no mutation. | `packages/application/test/dependency-resource-binding.test.ts` |
| DEP-BIND-PG-BIND-003 | `resources.bind-dependency` | Application | Missing, archived, deleted, or not-bindable Resource/Dependency Resource. | Returns structured not-found/lifecycle/validation error, no mutation. | `packages/application/test/dependency-resource-binding.test.ts` |
| DEP-BIND-PG-BIND-004 | `resources.bind-dependency` | Core/application | Duplicate active binding for same Resource, Dependency Resource, and target policy. | Returns `conflict`, `phase = resource-dependency-binding`, no mutation. | `packages/core/test/resource-binding.test.ts`; `packages/application/test/dependency-resource-binding.test.ts` |
| DEP-BIND-PG-READ-001 | `resources.list-dependency-bindings`; `resources.show-dependency-binding` | Query/read model | Resource has active dependency bindings. | Returns safe Resource, Dependency Resource, target policy, masked connection, binding readiness, and snapshot readiness summaries. | `packages/application/test/dependency-resource-binding.test.ts`; `packages/persistence/pg/test/dependency-resource-binding.pglite.test.ts` |
| DEP-BIND-PG-READ-002 | `resources.list-dependency-bindings`; `resources.show-dependency-binding` | Query/read model | Raw connection secret was provided at import. | No raw password, token, auth header, cookie, SSH credential, provider token, private key, sensitive query, raw connection URL, or raw env value appears in output. | `packages/application/test/dependency-resource-binding.test.ts`; `packages/persistence/pg/test/dependency-resource-binding.pglite.test.ts` |
| DEP-BIND-PG-UNBIND-001 | `resources.unbind-dependency` | Application | Unbind active Resource dependency binding. | Binding becomes inactive/tombstoned; Resource, Dependency Resource, external database, runtime, and snapshots remain. | `packages/application/test/dependency-resource-binding.test.ts` |
| DEP-BIND-PG-DELETE-001 | `dependency-resources.delete` | Application/persistence | Delete dependency resource with active binding. | Returns `dependency_resource_delete_blocked` with `resource-binding` blocker from real binding metadata, no mutation. | `packages/application/test/dependency-resource-binding.test.ts`; `packages/persistence/pg/test/dependency-resource-binding.pglite.test.ts` |
| DEP-BIND-PG-DELETE-002 | `resources.unbind-dependency`; `dependency-resources.delete` | Application | Imported external Postgres is unbound and then deleted. | Appaloft removes only control-plane binding/resource records and does not imply external/provider database deletion. | `packages/application/test/dependency-resource-binding.test.ts` |
| DEP-BIND-PG-ENTRY-001 | Operation catalog / CLI / oRPC / HTTP | Entrypoint | Dependency binding operations are public through catalog, CLI, and HTTP/oRPC. | Entrypoints dispatch explicit command/query messages, reuse application schemas, and expose no generic update operation. | `packages/application/test/operation-catalog-boundary.test.ts`; `packages/adapters/cli/test/dependency-command.test.ts`; `packages/orpc/test/dependency-resource.http.test.ts` |
| DEP-BIND-PG-SNAPSHOT-001 | deployment snapshot boundary | Application/read model | Resource has active dependency binding. | Raw binding secrets are not written to deployment snapshots; binding snapshot materialization is reported as deferred. | `packages/application/test/dependency-resource-binding.test.ts`; `packages/persistence/pg/test/dependency-resource-binding.pglite.test.ts` |

## Required Non-Coverage Assertions

Tests must assert Postgres dependency resource commands do not:

- create provider-native databases;
- rotate secrets;
- run backup/restore;
- mutate historical deployment snapshots;
- restart, stop, prune, or clean runtime state;
- expose raw connection strings, passwords, tokens, auth headers, cookies, SSH credentials,
  provider tokens, private keys, or sensitive query parameters.

## Current Implementation Notes And Migration Gaps

This baseline implements Postgres dependency resource control-plane records, Resource binding
metadata, safe read models, and active-binding delete blockers. Redis, binding secret rotation,
provider-native Postgres lifecycle, backup/restore, deployment snapshot materialization, Web
affordances, and runtime cleanup remain future Phase 7 work.

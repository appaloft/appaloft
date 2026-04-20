# Resource Profile Lifecycle Test Matrix

## Scope

This matrix covers the accepted candidate resource profile lifecycle operations:

- `resources.show`
- `resources.configure-source`
- `resources.configure-runtime`
- `resources.configure-network`
- `resources.archive`
- `resources.delete`

It also verifies that existing `resources.configure-health` remains the dedicated health mutation
command and that no entrypoint exposes a generic `resources.update`.

## Global References

- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resources.configure-source Command Spec](../commands/resources.configure-source.md)
- [resources.configure-runtime Command Spec](../commands/resources.configure-runtime.md)
- [resources.configure-network Command Spec](../commands/resources.configure-network.md)
- [resources.archive Command Spec](../commands/resources.archive.md)
- [resources.delete Command Spec](../commands/resources.delete.md)
- [resources.configure-health Command Spec](../commands/resources.configure-health.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Coverage Rows

| ID | Operation | Type | Scenario | Expected |
| --- | --- | --- | --- | --- |
| RES-PROFILE-SHOW-001 | `resources.show` | Query service | Existing active resource with source/runtime/network profile. | Returns `ok` with `schemaVersion = "resources.show/v1"` and durable profile fields. |
| RES-PROFILE-SHOW-002 | `resources.show` | Query service | Missing resource id. | Returns `not_found` with `phase = resource-read`. |
| RES-PROFILE-SHOW-003 | `resources.show` | Query service | Archived resource. | Returns detail with `lifecycle.status = "archived"` and no mutation side effects. |
| RES-PROFILE-SHOW-004 | `resources.show` | Read model | Latest deployment included. | Latest deployment is contextual and does not override lifecycle or health. |
| RES-PROFILE-SHOW-005 | `resources.show` | Read model | Profile diagnostics requested for incomplete profile. | Returns safe diagnostics without failing the query. |
| RES-PROFILE-SOURCE-001 | `resources.configure-source` | Command use case | Valid Git source with explicit `gitRef` and `baseDirectory`. | Persists source, publishes `resource-source-configured`, returns `ok({ id })`. |
| RES-PROFILE-SOURCE-002 | `resources.configure-source` | Command use case | Ambiguous Git tree URL without explicit split or provider lookup. | Returns `validation_error`, `phase = resource-source-resolution`. |
| RES-PROFILE-SOURCE-003 | `resources.configure-source` | Command use case | Docker image tag/digest conflict. | Returns `validation_error`, no aggregate mutation. |
| RES-PROFILE-SOURCE-004 | `resources.configure-source` | Command use case | Source contains token, raw key, or secret value. | Rejects before persistence and error details omit secret value. |
| RES-PROFILE-SOURCE-005 | `resources.configure-source` | Command use case | Archived resource. | Returns `resource_archived`, no event. |
| RES-PROFILE-SOURCE-006 | `resources.configure-source` | Event consumer | Duplicate `resource-source-configured` event. | Consumer is idempotent; read model is not duplicated. |
| RES-PROFILE-RUNTIME-001 | `resources.configure-runtime` | Command use case | Valid static runtime profile with publish directory. | Persists runtime profile, publishes `resource-runtime-configured`. |
| RES-PROFILE-RUNTIME-002 | `resources.configure-runtime` | Command use case | Runtime profile includes health policy mutation. | Rejects with `validation_error`; caller must use `resources.configure-health`. |
| RES-PROFILE-RUNTIME-003 | `resources.configure-runtime` | Command use case | Dockerfile path contains `..` or host absolute path. | Rejects with `phase = resource-runtime-resolution`. |
| RES-PROFILE-RUNTIME-004 | `resources.configure-runtime` | Command use case | Kubernetes/Helm/Swarm/provider-native target field supplied. | Rejects as unsupported runtime target configuration. |
| RES-PROFILE-RUNTIME-005 | `resources.configure-runtime` | Command use case | Archived resource. | Returns `resource_archived`, no event. |
| RES-PROFILE-NETWORK-001 | `resources.configure-network` | Command use case | Valid reverse-proxy HTTP profile with `internalPort`. | Persists network profile, publishes `resource-network-configured`. |
| RES-PROFILE-NETWORK-002 | `resources.configure-network` | Command use case | HTTP inbound resource without internal port. | Rejects with `validation_error`, `phase = resource-network-resolution`. |
| RES-PROFILE-NETWORK-003 | `resources.configure-network` | Command use case | Compose stack lacks required `targetServiceName`. | Rejects with structured validation error. |
| RES-PROFILE-NETWORK-004 | `resources.configure-network` | Command use case | `direct-port` requested without implemented placement guards. | Rejects before persistence. |
| RES-PROFILE-NETWORK-005 | `resources.configure-network` | Command use case | Two reverse-proxy resources share the same `internalPort`. | Command accepts; no port-collision failure for reverse proxy. |
| RES-PROFILE-NETWORK-006 | `resources.configure-network` | Command use case | Archived resource. | Returns `resource_archived`, no event. |
| RES-PROFILE-ARCHIVE-001 | `resources.archive` | Command use case | Active resource archived. | Persists archived lifecycle, publishes `resource-archived`, returns `ok({ id })`. |
| RES-PROFILE-ARCHIVE-002 | `resources.archive` | Command use case | Already archived resource. | Returns idempotent `ok({ id })` without duplicate state effect. |
| RES-PROFILE-ARCHIVE-003 | `resources.archive` | Command use case | Resource has deployment history or runtime logs. | Archive succeeds and retains history; no cleanup side effects. |
| RES-PROFILE-ARCHIVE-004 | `deployments.create` | Command guard | Archived resource selected for deployment. | Rejects with structured lifecycle error. |
| RES-PROFILE-DELETE-001 | `resources.delete` | Command use case | Archived resource has no blockers and matching slug confirmation. | Deletes/tombstones resource, publishes `resource-deleted`, returns `ok({ id })`. |
| RES-PROFILE-DELETE-002 | `resources.delete` | Command use case | Active resource. | Rejects with `resource_delete_blocked`. |
| RES-PROFILE-DELETE-003 | `resources.delete` | Command use case | Confirmation slug mismatch. | Rejects with validation/conflict error and no mutation. |
| RES-PROFILE-DELETE-004 | `resources.delete` | Command use case | Deployment history, domain binding, runtime instance, source link, or retained blocker exists. | Rejects with `resource_delete_blocked` and safe blocker details. |
| RES-PROFILE-DELETE-005 | `resources.delete` | Read model | Deleted resource queried by normal `resources.show`/`resources.list`. | `resources.show` returns `not_found`; list omits the resource. |
| RES-PROFILE-ENTRY-001 | Web | Entrypoint | Resource detail page loads durable profile. | Dispatches `resources.show`; does not synthesize full detail from list-only data. |
| RES-PROFILE-ENTRY-002 | Web | Entrypoint | Source/runtime/network/health forms submitted independently. | Each form dispatches its matching command and refetches detail/health. |
| RES-PROFILE-ENTRY-003 | CLI | Entrypoint | Resource profile commands are listed. | CLI exposes separate subcommands and no generic `resource update`. |
| RES-PROFILE-ENTRY-004 | HTTP/oRPC | Entrypoint | Routes accept show/source/runtime/network/archive/delete requests. | Each route reuses the application schema; no transport-only schema. |
| RES-PROFILE-ENTRY-005 | Operation catalog | Catalog | Public exposure in Code Round. | Each active operation appears in `CORE_OPERATIONS.md` and `operation-catalog.ts` in the same change. |
| RES-PROFILE-ERROR-001 | Error mapping | Contract | Persistence failure before command success. | Returns `infra_error`, `phase = resource-persistence`. |
| RES-PROFILE-ERROR-002 | Error mapping | Contract | Event publication/outbox failure before command success. | Returns `infra_error`, `phase = event-publication`. |
| RES-PROFILE-ERROR-003 | Error mapping | Contract | Event consumer projection failure. | Records `phase = event-consumption` and does not reinterpret command success. |

## Required Non-Coverage Assertions

Tests must assert that profile commands do not:

- create deployments;
- mutate historical deployment snapshots;
- restart or stop runtime;
- bind or unbind domains;
- issue or revoke certificates;
- apply proxy routes;
- retarget source links;
- write secrets into events, read models, errors, logs, or diagnostics.

## Current Implementation Notes And Migration Gaps

Automated coverage now exists for:

- `RES-PROFILE-SHOW-001`, `RES-PROFILE-SHOW-002`, `RES-PROFILE-SHOW-004`, and
  `RES-PROFILE-SHOW-005` in `packages/application/test/show-resource.test.ts`;
- `RES-PROFILE-SOURCE-001`, `RES-PROFILE-SOURCE-002`, `RES-PROFILE-SOURCE-003`, and
  `RES-PROFILE-SOURCE-004` in `packages/application/test/configure-resource-source.test.ts`;
- HTTP/oRPC dispatch for `resources.show` in `packages/orpc/test/resource-show.http.test.ts`;
- HTTP/oRPC dispatch for `resources.configure-source` in
  `packages/orpc/test/resource-source-profile.http.test.ts`;
- Web detail dispatch for `resources.show` in `apps/web/test/e2e-webview/home.webview.test.ts`;
- Web source and network profile submissions in
  `apps/web/test/e2e-webview/home.webview.test.ts`.

`RES-PROFILE-SHOW-003` remains blocked until `resources.archive` introduces explicit lifecycle
state. `RES-PROFILE-SOURCE-005` remains blocked for the same reason. `RES-PROFILE-SOURCE-006`
remains future event-consumer projection work. Runtime/archive/delete profile lifecycle rows remain
future Code Rounds.

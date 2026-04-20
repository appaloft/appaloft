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
| RES-PROFILE-HEALTH-001 | `resources.configure-health` | Command use case | Archived resource. | Returns `resource_archived`, no event. |
| RES-PROFILE-ARCHIVE-001 | `resources.archive` | Command use case | Active resource archived. | Persists archived lifecycle, publishes `resource-archived`, returns `ok({ id })`. |
| RES-PROFILE-ARCHIVE-002 | `resources.archive` | Command use case | Already archived resource. | Returns idempotent `ok({ id })` without duplicate state effect or duplicate event. |
| RES-PROFILE-ARCHIVE-003 | `resources.archive` | Command use case | Resource has deployment history or runtime logs. | Archive succeeds and retains history; no cleanup side effects. |
| RES-PROFILE-ARCHIVE-004 | `deployments.create` | Command guard | Archived resource selected for deployment. | Rejects with structured lifecycle error. |
| RES-PROFILE-ARCHIVE-005 | `resource-archived` | Event payload | Archive has safe reason. | Event includes resource ids, `resourceSlug`, archived timestamp, and normalized reason; excludes secrets and logs. |
| RES-PROFILE-DELETE-001 | `resources.delete` | Command use case | Archived resource has no blockers and matching slug confirmation. | Transitions/tombstones resource as deleted, publishes `resource-deleted`, returns `ok({ id })`. |
| RES-PROFILE-DELETE-002 | `resources.delete` | Command use case | Active resource. | Rejects with `resource_delete_blocked`, `lifecycleStatus = "active"`, `deletionBlockers` includes `active-resource`, and no event. |
| RES-PROFILE-DELETE-003 | `resources.delete` | Command use case | Confirmation slug mismatch. | Rejects with `validation_error`, `phase = resource-deletion-guard`, and no mutation. |
| RES-PROFILE-DELETE-004 | `resources.delete` | Command use case | Archived resource has deployment history. | Rejects with `resource_delete_blocked`, `deletionBlockers` includes `deployment-history`, and no event. |
| RES-PROFILE-DELETE-005 | `resources.delete` | Command use case | Archived resource has domain, certificate, access route, or proxy route state. | Rejects with `resource_delete_blocked` and safe blocker details. |
| RES-PROFILE-DELETE-006 | `resources.delete` | Command use case | Archived resource has source link, dependency binding, terminal session, runtime-log retention, or audit retention. | Rejects with `resource_delete_blocked` and safe blocker details. |
| RES-PROFILE-DELETE-007 | `resources.delete` | Command use case | Already deleted tombstone is retried. | Returns idempotent `ok({ id })` without duplicate state effect or duplicate event when tombstone can be resolved. |
| RES-PROFILE-DELETE-008 | `resources.show` / `resources.list` | Read model | Deleted resource queried by normal active read paths. | `resources.show` returns `not_found`; list omits the resource. |
| RES-PROFILE-DELETE-009 | `resource-deleted` | Event payload | Delete succeeds. | Event includes resource ids, `resourceSlug`, deleted timestamp, and no secrets, logs, certificate material, or provider configs. |
| RES-PROFILE-ENTRY-001 | Web | Entrypoint | Resource detail page loads durable profile. | Dispatches `resources.show`; does not synthesize full detail from list-only data. |
| RES-PROFILE-ENTRY-002 | Web | Entrypoint | Source/runtime/network/archive/delete actions submitted independently. | Each form/action dispatches its matching command and refetches detail/health/list. |
| RES-PROFILE-ENTRY-003 | CLI | Entrypoint | Resource profile commands are listed. | CLI exposes separate subcommands and no generic `resource update`. |
| RES-PROFILE-ENTRY-004 | HTTP/oRPC | Entrypoint | Routes accept show/source/runtime/network/archive/delete requests. | Each route reuses the application schema; no transport-only schema. |
| RES-PROFILE-ENTRY-005 | Operation catalog | Catalog | Public exposure in Code Round. | Each active operation appears in `CORE_OPERATIONS.md` and `operation-catalog.ts` in the same change. |
| RES-PROFILE-ENTRY-006 | CLI | Entrypoint | Delete command submitted with `--confirm-slug`. | Dispatches `DeleteResourceCommand` through `CommandBus`; no generic delete/update helper bypass. |
| RES-PROFILE-ENTRY-007 | HTTP/oRPC | Entrypoint | Delete route submitted with command schema. | Dispatches `DeleteResourceCommand`; a follow-up `resources.show` for the deleted resource returns `not_found`. |
| RES-PROFILE-ENTRY-008 | Web | Entrypoint | Archived resource delete action submitted after typed slug confirmation. | Dispatches `resources.delete`, invalidates resources/detail/list state, and does not hide cleanup side effects. |
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
- `RES-PROFILE-SHOW-003` in `packages/application/test/show-resource.test.ts`;
- `RES-PROFILE-SOURCE-001`, `RES-PROFILE-SOURCE-002`, `RES-PROFILE-SOURCE-003`,
  `RES-PROFILE-SOURCE-004`, and `RES-PROFILE-SOURCE-005` in
  `packages/application/test/configure-resource-source.test.ts`;
- `RES-PROFILE-RUNTIME-001`, `RES-PROFILE-RUNTIME-002`, `RES-PROFILE-RUNTIME-003`,
  `RES-PROFILE-RUNTIME-004`, and `RES-PROFILE-RUNTIME-005` in
  `packages/application/test/configure-resource-runtime.test.ts`;
- `RES-PROFILE-NETWORK-006` in
  `packages/application/test/configure-resource-network.test.ts`;
- `RES-PROFILE-HEALTH-001` in `packages/application/test/configure-resource-health.test.ts`;
- `RES-PROFILE-ARCHIVE-001`, `RES-PROFILE-ARCHIVE-002`, `RES-PROFILE-ARCHIVE-003`, and
  `RES-PROFILE-ARCHIVE-005` in `packages/application/test/archive-resource.test.ts`;
- `RES-PROFILE-ARCHIVE-004` in `packages/application/test/create-deployment.test.ts`;
- HTTP/oRPC dispatch for `resources.show` in `packages/orpc/test/resource-show.http.test.ts`;
- HTTP/oRPC dispatch for `resources.configure-source` in
  `packages/orpc/test/resource-source-profile.http.test.ts`;
- HTTP/oRPC dispatch for `resources.configure-runtime` in
  `packages/orpc/test/resource-runtime-profile.http.test.ts`;
- HTTP/oRPC dispatch for `resources.archive` in
  `packages/orpc/test/resource-archive.http.test.ts`;
- CLI dispatch for `resources.configure-runtime` in
  `packages/adapters/cli/test/resource-command.test.ts`;
- CLI dispatch for `resources.archive` in `packages/adapters/cli/test/resource-command.test.ts`;
- Web detail dispatch for `resources.show` in `apps/web/test/e2e-webview/home.webview.test.ts`;
- Web source, runtime, network, and archive submissions in
  `apps/web/test/e2e-webview/home.webview.test.ts`.

`RES-PROFILE-SOURCE-006` remains future event-consumer projection work. `RES-PROFILE-DELETE-001`
through `RES-PROFILE-DELETE-009` and `RES-PROFILE-ENTRY-006` through `RES-PROFILE-ENTRY-008` are
specified for the next delete Code Round and do not yet have automated coverage.

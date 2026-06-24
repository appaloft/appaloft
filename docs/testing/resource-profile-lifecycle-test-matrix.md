# Resource Profile Lifecycle Test Matrix

## Scope

This matrix covers the active resource profile lifecycle operations:

- `resources.show`
- `resources.configure-source`
- `resources.configure-runtime`
- `resources.configure-network`
- `resources.configure-access`
- `resources.set-variable`
- `resources.secrets.create`
- `resources.secrets.rotate`
- `resources.secrets.delete`
- `resources.secrets.list`
- `resources.secrets.show`
- `resources.unset-variable`
- `resources.effective-config`
- `resources.archive`
- `resources.restore`
- `resources.delete-check`
- `resources.delete`

It also verifies that existing `resources.configure-health` remains the dedicated health mutation
command, that resource profile drift is visible through diagnostics, and that no entrypoint exposes a
generic `resources.update`.

## Global References

- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resources.configure-source Command Spec](../commands/resources.configure-source.md)
- [resources.configure-runtime Command Spec](../commands/resources.configure-runtime.md)
- [resources.configure-network Command Spec](../commands/resources.configure-network.md)
- [resources.configure-access Command Spec](../commands/resources.configure-access.md)
- [resources.set-variable Command Spec](../commands/resources.set-variable.md)
- [resources.secrets.create Command Spec](../commands/resources.secrets.create.md)
- [resources.secrets.rotate Command Spec](../commands/resources.secrets.rotate.md)
- [resources.secrets.delete Command Spec](../commands/resources.secrets.delete.md)
- [resources.secrets.list Query Spec](../queries/resources.secrets.list.md)
- [resources.secrets.show Query Spec](../queries/resources.secrets.show.md)
- [resources.unset-variable Command Spec](../commands/resources.unset-variable.md)
- [resources.effective-config Query Spec](../queries/resources.effective-config.md)
- [resources.archive Command Spec](../commands/resources.archive.md)
- [resources.restore Command Spec](../commands/resources.restore.md)
- [resources.delete-check Query Spec](../queries/resources.delete-check.md)
- [resources.delete Command Spec](../commands/resources.delete.md)
- [resources.configure-health Command Spec](../commands/resources.configure-health.md)
- [Resource Profile Drift Visibility](../specs/011-resource-profile-drift-visibility/spec.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Coverage Rows

| ID | Operation | Type | Scenario | Expected |
| --- | --- | --- | --- | --- |
| RES-PROFILE-SHOW-001 | `resources.show` | Query service | Existing active resource with source/runtime/network profile. | Returns `ok` with `schemaVersion = "resources.show/v1"` and durable profile fields, including `runtimeProfile.runtimeName` when configured. |
| RES-PROFILE-SHOW-002 | `resources.show` | Query service | Missing resource id. | Returns `not_found` with `phase = resource-read`. |
| RES-PROFILE-SHOW-003 | `resources.show` | Query service | Archived resource. | Returns detail with `lifecycle.status = "archived"` and no mutation side effects. |
| RES-PROFILE-SHOW-004 | `resources.show` | Read model | Latest deployment included. | Latest deployment is contextual and does not override lifecycle or health. |
| RES-PROFILE-SHOW-005 | `resources.show` | Read model | Profile diagnostics requested for incomplete profile. | Returns safe diagnostics without failing the query. |
| RES-PROFILE-DRIFT-001 | `resources.show` | Query service | Current Resource profile differs from latest deployment snapshot. | Returns `resource_profile_drift` diagnostics grouped by section and field, marks `blocksDeploymentAdmission = false`, and does not fail the query. |
| RES-PROFILE-DRIFT-002 | `resources.show` / config workflow | Query service / entry preflight | Existing linked resource differs from normalized repository config or trusted entry profile. | Returns or raises drift details with `comparison = resource-vs-entry-profile`, `blocksDeploymentAdmission = true` for config deploy preflight, and includes suggested explicit command. |
| RES-PROFILE-DRIFT-003 | `resources.show` / config workflow | Redaction contract | Drift includes secret or configuration values. | Diagnostics and errors include key/exposure/kind/scope/reference metadata and masked equality state only; no raw secret values. |
| RES-PROFILE-DRIFT-004 | HTTP/oRPC | Contract | Resource detail requested with profile diagnostics. | Route returns the shared diagnostic shape from `resources.show`; no new drift-only route or transport-only schema exists. |
| RES-PROFILE-DRIFT-005 | Web | Entrypoint | Resource detail receives drift diagnostics. | Web renders sectioned drift status and future-only guidance, and points to named resource commands rather than a generic update action. |
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
| RES-PROFILE-RUNTIME-004A | `resources.configure-runtime` | Command use case | Valid reusable runtime name supplied. | Persists `runtimeProfile.runtimeName`, publishes `resource-runtime-configured`, and does not mutate the current running workload in place. |
| RES-PROFILE-RUNTIME-004B | `resources.configure-runtime` | Command use case | Duplicate requested runtime name matches another resource's requested name. | Command still succeeds because uniqueness is derived later during deployment execution. |
| RES-PROFILE-RUNTIME-004C | `resources.configure-runtime` | Command use case | Runtime name is malformed or unsafe. | Rejects with `validation_error`, `phase = resource-runtime-resolution`. |
| RES-PROFILE-RUNTIME-005 | `resources.configure-runtime` | Command use case | Archived resource. | Returns `resource_archived`, no event. |
| RES-PROFILE-NETWORK-001 | `resources.configure-network` | Command use case | Valid reverse-proxy HTTP profile with `internalPort`. | Persists network profile, publishes `resource-network-configured`. |
| RES-PROFILE-NETWORK-002 | `resources.configure-network` | Command use case | HTTP inbound resource without internal port. | Rejects with `validation_error`, `phase = resource-network-resolution`. |
| RES-PROFILE-NETWORK-003 | `resources.configure-network` | Command use case | Compose stack lacks required `targetServiceName`. | Rejects with structured validation error. |
| RES-PROFILE-NETWORK-004 | `resources.configure-network` | Command use case | `direct-port` requested without implemented placement guards. | Rejects before persistence. |
| RES-PROFILE-NETWORK-005 | `resources.configure-network` | Command use case | Two reverse-proxy resources share the same `internalPort`. | Command accepts; no port-collision failure for reverse proxy. |
| RES-PROFILE-NETWORK-006 | `resources.configure-network` | Command use case | Archived resource. | Returns `resource_archived`, no event. |
| DMBH-RES-001 | `Resource` | Domain unit | Resource source/runtime/network questions are evaluated for deployment admission and plan preview. | Core domain tests prove `Resource` answers source descriptor availability, source detector enrichment eligibility, internal-port requirement, and profile-derived deployment request behavior without callers peeling primitive state. |
| RES-PROFILE-ACCESS-001 | `resources.configure-access` | Command use case | Valid profile disables generated default access. | Persists `accessProfile.generatedAccessMode = "disabled"`, publishes `resource-access-configured`, and returns `ok({ id })`. |
| RES-PROFILE-ACCESS-002 | `resources.configure-access` / `resources.show` | Command/query service | Disabled generated access is changed back to inherit. | Persists `generatedAccessMode = "inherit"` and `resources.show` returns the resource access profile. |
| RES-PROFILE-ACCESS-003 | `resources.configure-access` / planned access / deployment route snapshot | Command and read model | Valid path prefix `/app` is supplied. | Planned generated access and future generated route snapshots use `/app`; historical snapshots remain unchanged. |
| RES-PROFILE-ACCESS-004 | `resources.configure-access` | Command use case | Path prefix is missing `/` or otherwise unsafe. | Returns `validation_error`, `phase = resource-access-resolution`, no aggregate mutation, and no event. |
| RES-PROFILE-ACCESS-005 | `resources.configure-access` | Command use case | Archived resource. | Returns `resource_archived`, no event. |
| RES-PROFILE-ACCESS-006 | `resource-access-configured` | Event payload | Access profile is configured. | Event includes resource ids, `generatedAccessMode`, normalized `pathPrefix`, configured timestamp, and no provider configs, route credentials, logs, or secrets. |
| RES-PROFILE-HEALTH-001 | `resources.configure-health` | Command use case | Archived resource. | Returns `resource_archived`, no event. |
| RES-PROFILE-CONFIG-001 | `resources.set-variable` | Command use case | Valid runtime plain-config variable. | Persists resource-scoped override, publishes `resource-variable-set`, returns `ok({ id })`. |
| RES-PROFILE-CONFIG-002 | `resources.set-variable` | Command use case | Valid runtime secret variable. | Persists secret override, publishes `resource-variable-set`, and future read models return only masked values. |
| RES-PROFILE-CONFIG-003 | `resources.set-variable` | Command use case | Build-time variable marked secret. | Rejects with `validation_error`, `phase = config-secret-validation`, and no mutation. |
| RES-PROFILE-CONFIG-004 | `resources.set-variable` | Command use case | Build-time variable without `PUBLIC_` or `VITE_` prefix. | Rejects with `validation_error`, `phase = config-profile-resolution`, and no mutation. |
| RES-PROFILE-CONFIG-005 | `resources.set-variable` | Command use case | Archived resource. | Returns `resource_archived`, no event. |
| RES-PROFILE-CONFIG-006 | `resources.unset-variable` | Command use case | Existing resource-scoped variable. | Removes the override, publishes `resource-variable-unset`, and returns `ok({ id })`. |
| RES-PROFILE-CONFIG-007 | `resources.unset-variable` | Command use case | Missing resource-scoped variable identity. | Returns `not_found` with `phase = config-read`. |
| RES-PROFILE-CONFIG-008 | `resources.unset-variable` | Command use case | Archived resource. | Returns `resource_archived`, no event. |
| RES-PROFILE-CONFIG-009 | `resources.effective-config` | Query service | Environment and resource define the same key plus exposure. | Returns masked effective entry from `scope = "resource"` and includes resource-owned override in owned entries. |
| RES-PROFILE-CONFIG-010 | `resources.effective-config` | Query service | Resource inherits environment-only variable. | Returns environment-owned effective entry and no resource-owned entry. |
| RES-PROFILE-CONFIG-011 | `resources.effective-config` | Query service | Secret values are present. | Returns masked values only; no plaintext secret in owned or effective entries. |
| RES-PROFILE-CONFIG-012 | `deployments.create` | Snapshot boundary | Resource-scoped variable exists at deployment admission. | Immutable deployment snapshot includes the resource-owned effective entry and retains `scope = "resource"` on the resolved snapshot variable. |
| RES-PROFILE-CONFIG-013 | `resources.import-variables` | Command use case | Pasted runtime `.env` content contains plain and secret-like keys. | Stores resource-scoped entries, classifies secret-like keys as secrets, returns masked imported entries, and publishes `resource-variable-set` without raw secret values. |
| RES-PROFILE-CONFIG-014 | `resources.import-variables` | Command use case | Pasted `.env` content contains an invalid key or malformed line. | Rejects with `validation_error`, `phase = resource-env-import-parse`, and no aggregate mutation. |
| RES-PROFILE-CONFIG-015 | `resources.import-variables` | Command use case | Build-time import contains a non-public key or a secret-like key. | Rejects before persistence through build/runtime exposure rules. |
| RES-PROFILE-CONFIG-016 | `resources.import-variables` | Command use case | Pasted content repeats a key and an existing resource entry already has that identity. | Last pasted occurrence wins, existing resource entry is replaced, and response reports duplicate/existing override metadata without raw secret values. |
| RES-PROFILE-CONFIG-017 | `resources.effective-config` | Query service | Environment and resource define the same `key + exposure`. | Returns safe override summary with selected scope `resource` and overridden environment scope. |
| RES-PROFILE-CONFIG-018 | `resources.import-variables` | Command use case | Archived resource receives a `.env` import. | Returns `resource_archived`, no event, no mutation. |
| RES-PROFILE-CONFIG-019 | Operation catalog | Catalog | Resource import is public. | `resources.import-variables` appears in `CORE_OPERATIONS.md` and `operation-catalog.ts` with CLI and oRPC transports. |
| RES-SECRET-CRUD-001 | `resources.secrets.create` | Command use case | New Resource-owned runtime secret reference. | Persists `kind = "secret"`, `isSecret = true`, `scope = "resource"`, returns only safe id/key/exposure metadata, and publishes `resource-secret-reference-created`. |
| RES-SECRET-CRUD-002 | `resources.secrets.rotate` | Command use case | Existing Resource-owned secret reference rotated. | Replaces the value, keeps masked read semantics, and publishes `resource-secret-reference-rotated`. |
| RES-SECRET-CRUD-003 | `resources.secrets.delete` | Command use case | Existing Resource-owned secret reference removed. | Deletes the Resource-owned secret entry and publishes `resource-secret-reference-deleted`. |
| RES-SECRET-CRUD-004 | `resources.secrets.list` | Query service | Resource has secret references. | Returns `resources.secrets.list/v1` with `value = "****"` only. |
| RES-SECRET-CRUD-005 | `resources.secrets.show` | Query service | Existing Resource-owned secret reference read. | Returns `resources.secrets.show/v1` with `value = "****"` only. |
| RES-SECRET-CRUD-006 | HTTP/oRPC | Entrypoint | Secret create/update/delete routes submitted. | Dispatches the matching command through `CommandBus` using shared schemas. |
| RES-SECRET-CRUD-007 | HTTP/oRPC | Entrypoint | Secret list/show routes submitted. | Dispatches the matching query through `QueryBus` using shared schemas. |
| RES-SECRET-CRUD-008 | CLI | Entrypoint | Secret create/update/delete commands submitted. | Dispatches the matching application command through `CommandBus`; no CLI-only secret lifecycle exists. |
| RES-SECRET-CRUD-009 | CLI | Entrypoint | Secret list/show commands submitted. | Dispatches the matching application query through `QueryBus` and returns masked output only. |
| RES-SECRET-CRUD-010 | Operation catalog/docs | Catalog | Secret reference CRUD/list/show is public. | `CORE_OPERATIONS.md`, `BUSINESS_OPERATION_MAP.md`, `operation-catalog.ts`, CLI help, HTTP/oRPC, public docs registry, and future MCP-tool decision surfaces name the same operations. |
| DMBH-RES-NET-001 | `Resource` | Core domain unit | Resource network exposure mode and health-check type vary across direct-port, reverse-proxy, HTTP, and unsupported health checks. | `Resource` owns admission while exposure mode and health-check type value objects answer single-value predicates. |
| RES-PROFILE-ARCHIVE-001 | `resources.archive` | Command use case | Active resource archived. | Coordinates runtime stop when a current supported runtime placement is retained, persists archived lifecycle, publishes `resource-archived`, returns `ok({ id })`. |
| RES-PROFILE-ARCHIVE-002 | `resources.archive` | Command use case | Already archived resource. | Returns idempotent `ok({ id })` without duplicate lifecycle state effect or duplicate event, while still allowing runtime stop coordination to repair older archived resources whose runtime is retained. |
| RES-PROFILE-ARCHIVE-003 | `resources.archive` | Command use case | Resource has deployment history or runtime logs. | Archive succeeds and retains history; runtime stop is limited to the current supported runtime instance and does not delete containers, images, logs, routes, or deployment records. |
| RES-PROFILE-ARCHIVE-003A | `resources.archive` | Command use case | Resource has no retained current runtime placement metadata. | Archive succeeds and records lifecycle state without requiring a runtime-control side effect. |
| RES-PROFILE-ARCHIVE-004 | `deployments.create` | Command guard | Archived resource selected for deployment. | Rejects with structured lifecycle error. |
| RES-PROFILE-ARCHIVE-005 | `resource-archived` | Event payload | Archive has safe reason. | Event includes resource ids, `resourceSlug`, archived timestamp, and normalized reason; excludes secrets and logs. |
| RES-PROFILE-ARCHIVE-006 | `resources.archive` / `resources.runtime.stop` | Command workflow | Runtime stop adapter reports failure for a retained supported runtime placement. | Archive returns a retryable provider error before mutating lifecycle state or publishing `resource-archived`; error details include safe runtime-control status/code only. |
| RES-PROFILE-RESTORE-001 | `resources.restore` | Command use case | Archived resource restored. | Persists active lifecycle, clears archive metadata, preserves profile state, publishes `resource-restored`, and returns `ok({ id })`. |
| RES-PROFILE-RESTORE-002 | `resources.restore` | Command use case | Already active resource. | Returns idempotent `ok({ id })` without duplicate state effect or duplicate event. |
| RES-PROFILE-RESTORE-003 | `resources.restore` | Command use case | Deleted resource. | Rejects with the lifecycle state-machine invariant and no event. |
| RES-PROFILE-DELETE-001 | `resources.delete` | Command use case | Archived resource has no blockers and matching slug confirmation. | Transitions/tombstones resource as deleted, publishes `resource-deleted`, returns `ok({ id })`. |
| RES-PROFILE-DELETE-002 | `resources.delete` | Command use case | Active resource. | Rejects with `resource_delete_blocked`, `lifecycleStatus = "active"`, `deletionBlockers` includes `active-resource`, and no event. |
| RES-PROFILE-DELETE-003 | `resources.delete` | Command use case | Confirmation slug mismatch. | Rejects with `validation_error`, `phase = resource-deletion-guard`, and no mutation. |
| RES-PROFILE-DELETE-004 | `resources.delete` | Command use case | Archived resource has deployment or audit history but no retained deletion blockers. | Delete succeeds and deployment/audit history remains owned by its retention context. |
| RES-PROFILE-DELETE-005 | `resources.delete` | Command use case | Archived resource has domain, certificate, access route, or proxy route state. | Rejects with `resource_delete_blocked` and safe blocker details. |
| RES-PROFILE-DELETE-006 | `resources.delete` | Command use case | Archived resource has source link, dependency binding, terminal session, runtime-log retention, and retained audit history. | Rejects with `resource_delete_blocked` for source/dependency/terminal/runtime-log blockers only; audit history remains retained but is not a resource delete blocker. |
| RES-PROFILE-DELETE-006A | `resources.delete` / `resources.delete-check` | Command/query service | Archived resource retains a current non-stopped runtime instance. | Delete-check returns `eligible = false` and delete rejects with `resource_delete_blocked`, `deletionBlockers` includes `runtime-instance`, and no lifecycle mutation or cleanup occurs. |
| DMBH-BINDING-001 | `ResourceBinding` | Core domain unit | Binding scope and injection mode vary across build-only/runtime-reference and allowed combinations. | `ResourceBinding` owns scope/injection coherence; public behavior is unchanged. |
| RES-PROFILE-DELETE-007 | `resources.delete` | Command use case | Already deleted tombstone is retried. | Returns idempotent `ok({ id })` without duplicate state effect or duplicate event when tombstone can be resolved. |
| RES-PROFILE-DELETE-008 | `resources.show` / `resources.list` | Read model | Deleted resource queried by normal active read paths. | `resources.show` returns `not_found`; list omits the resource. |
| RES-PROFILE-LIST-009 | `resources.list` | Read model | Archived resource queried through the default resource list. | Default `resources.list` returns active resources only and omits archived-but-retained resources. |
| RES-PROFILE-LIST-010 | `resources.list(lifecycleStatus = "archived")` | Read model | Archived resource queried through the archived lifecycle filter. | Returns archived-but-retained resources with `lifecycleStatus`, `archivedAt`, and safe archive reason metadata. |
| RES-PROFILE-DELETE-009 | `resource-deleted` | Event payload | Delete succeeds. | Event includes resource ids, `resourceSlug`, deleted timestamp, and no secrets, logs, certificate material, or provider configs. |
| RES-PROFILE-DELETE-CHECK-001 | `resources.delete-check` | Query service | Active resource. | Returns `eligible = false`, `lifecycleStatus = "active"`, and `blockers` includes `active-resource`. |
| RES-PROFILE-DELETE-CHECK-002 | `resources.delete-check` | Query service | Archived resource has retained blockers. | Returns `eligible = false` with safe blocker kind/count/type/id details and no mutation. |
| RES-PROFILE-DELETE-CHECK-003 | `resources.delete-check` | Query service | Archived resource has no retained blockers and no retained current runtime instance. | Returns `eligible = true`, empty blockers, and no mutation. |
| RES-PROFILE-ENTRY-001 | Web | Entrypoint | Resource detail page loads durable profile. | Dispatches `resources.show`; does not synthesize full detail from list-only data. |
| RES-PROFILE-ENTRY-002 | Web | Entrypoint | Source/runtime/network/access/health/config/archive/delete actions submitted independently. | Each form/action dispatches its matching command and refetches detail/health/effective-config/list. |
| RES-PROFILE-ENTRY-003 | CLI | Entrypoint | Resource profile commands are listed. | CLI exposes separate source/runtime/network/access/health/config/import/archive/delete subcommands and no generic `resource update`. |
| RES-PROFILE-ENTRY-004 | HTTP/oRPC | Entrypoint | Routes accept show/source/runtime/network/access/health/config/import/archive/delete requests. | Each route reuses the application schema; no transport-only schema. |
| RES-PROFILE-ENTRY-005 | Operation catalog | Catalog | Public exposure in Code Round. | Each active operation appears in `CORE_OPERATIONS.md` and `operation-catalog.ts` in the same change. |
| RES-PROFILE-ENTRY-006 | CLI | Entrypoint | Delete command submitted with `--confirm-slug`. | Dispatches `DeleteResourceCommand` through `CommandBus`; no generic delete/update helper bypass. |
| RES-PROFILE-ENTRY-007 | HTTP/oRPC | Entrypoint | Delete route submitted with command schema. | Dispatches `DeleteResourceCommand`; a follow-up `resources.show` for the deleted resource returns `not_found`. |
| RES-PROFILE-ENTRY-008 | Web | Entrypoint | Archived resource delete action submitted after typed slug confirmation. | Reads `resources.delete-check`, disables delete while ineligible, shows safe blocker categories, dispatches `resources.delete` only when eligible, invalidates resources/detail/list/delete-check state, and does not hide cleanup side effects. |
| RES-PROFILE-ENTRY-009 | HTTP/oRPC | Entrypoint | Access profile route submitted with command schema. | Dispatches `ConfigureResourceAccessCommand`; a follow-up `resources.show` returns the access profile. |
| RES-PROFILE-ENTRY-010 | CLI | Entrypoint | Access profile command submitted. | Dispatches `ConfigureResourceAccessCommand` through `CommandBus`; no generic resource update helper bypass. |
| RES-PROFILE-ENTRY-011 | Web | Entrypoint | Resource detail access settings submitted. | Dispatches `resources.configure-access`, invalidates resource detail/list state, and does not bind domains or apply proxy routes. |
| RES-PROFILE-ENTRY-012 | Web | Entrypoint | Resource detail source/runtime/network/access/health/configuration profile editors are visible. | The page states saves are durable resource-level edits for future deployments, verification, route planning, or deployment snapshot materialization; deployments are not created, historical deployment snapshots stay unchanged, current runtime is not restarted, domains are not bound, certificates are not issued, and proxy routes are not applied. |
| RES-PROFILE-ENTRY-013 | Web | Entrypoint | Resource detail health settings submitted. | Dispatches `resources.configure-health`, invalidates resource detail/health state, and does not present the save as deployment, restart, or live health proof. |
| RES-PROFILE-ENTRY-014 | Web | Entrypoint | Resource detail configuration override removed. | Dispatches `resources.unset-variable`, invalidates `resources.effective-config`, and does not mutate environment variables, historical deployment snapshots, or current runtime. |
| RES-PROFILE-ENTRY-015 | CLI | Entrypoint | Resource `.env` import submitted. | Dispatches `ImportResourceVariablesCommand` through `CommandBus`; no CLI-only parser bypasses the application schema. |
| RES-PROFILE-ENTRY-016 | HTTP/oRPC | Entrypoint | Resource `.env` import route submitted. | Dispatches `ImportResourceVariablesCommand` through `CommandBus` using the command schema. |
| RES-PROFILE-ENTRY-017 | Web | Entrypoint | Resource detail `.env` import form submitted. | Dispatches `resources.import-variables` through the shared oRPC command schema, supports explicit secret/plain key classification, invalidates `resources.effective-config`, and does not echo raw secret values. |
| RES-PROFILE-ENTRY-018 | HTTP/oRPC | Entrypoint | Resource delete-check route requested. | Dispatches `CheckResourceDeleteSafetyQuery` through `QueryBus` using the shared query schema. |
| RES-PROFILE-ENTRY-019 | CLI | Entrypoint | Resource delete-check command submitted. | Dispatches `CheckResourceDeleteSafetyQuery` through `QueryBus`; no CLI-only blocker calculation. |
| RES-PROFILE-ERROR-001 | Error mapping | Contract | Persistence failure before command success. | Returns `infra_error`, `phase = resource-persistence`. |
| RES-PROFILE-ERROR-002 | Error mapping | Contract | Event publication/outbox failure before command success. | Returns `infra_error`, `phase = event-publication`. |
| RES-PROFILE-ERROR-003 | Error mapping | Contract | Event consumer projection failure. | Records `phase = event-consumption` and does not reinterpret command success. |

## Required Non-Coverage Assertions

Tests must assert that profile commands, except for the explicit `resources.archive` runtime-stop
coordination step, do not:

- create deployments;
- mutate historical deployment snapshots;
- restart runtime or stop runtime implicitly outside `resources.archive` / `resources.runtime.stop`;
- bind or unbind domains;
- issue or revoke certificates;
- apply proxy routes;
- retarget source links;
- write secrets into events, read models, errors, logs, or diagnostics.
- return plaintext secret values from resource configuration queries or effective deployment snapshot reads.
- return plaintext secret values from `.env` import command summaries.
- hide resource profile drift by mutating profiles through `deployments.create`.
- expose a generic `resources.update` action as a drift remedy.

## Current Implementation Notes And Migration Gaps

Automated coverage now exists for:

- `RES-PROFILE-SHOW-001`, `RES-PROFILE-SHOW-002`, `RES-PROFILE-SHOW-004`, and
  `RES-PROFILE-SHOW-005` in `packages/application/test/show-resource.test.ts`;
- `RES-PROFILE-SHOW-003` in `packages/application/test/show-resource.test.ts`;
- `RES-PROFILE-DELETE-008` show omission in `packages/application/test/show-resource.test.ts`;
- `RES-PROFILE-DRIFT-001` in `packages/application/test/show-resource.test.ts`;
- `RES-PROFILE-DRIFT-002` and `CONFIG-FILE-PROFILE-006` in
  `packages/adapters/cli/test/deployment-config.test.ts`;
- `RES-PROFILE-DRIFT-004` in `packages/orpc/test/resource-show.http.test.ts`;
- `RES-PROFILE-DRIFT-005` through the Resource detail diagnostics panel and docs-help static
  assertions in `apps/web/src/lib/console/docs-help.test.ts`;
- `RES-PROFILE-SOURCE-001`, `RES-PROFILE-SOURCE-002`, `RES-PROFILE-SOURCE-003`,
  `RES-PROFILE-SOURCE-004`, and `RES-PROFILE-SOURCE-005` in
  `packages/application/test/configure-resource-source.test.ts`;
- `RES-PROFILE-RUNTIME-001`, `RES-PROFILE-RUNTIME-002`, `RES-PROFILE-RUNTIME-003`,
  `RES-PROFILE-RUNTIME-004`, and `RES-PROFILE-RUNTIME-005` in
  `packages/application/test/configure-resource-runtime.test.ts`;
- `RES-PROFILE-NETWORK-006` in
  `packages/application/test/configure-resource-network.test.ts`;
- `RES-PROFILE-HEALTH-001` in `packages/application/test/configure-resource-health.test.ts`;
- `RES-PROFILE-CONFIG-001` through `RES-PROFILE-CONFIG-012` in
  `packages/application/test/resource-config.test.ts`;
- `RES-SECRET-CRUD-001` through `RES-SECRET-CRUD-005` in
  `packages/application/test/resource-config.test.ts`;
- `RES-SECRET-CRUD-006` and `RES-SECRET-CRUD-007` in
  `packages/orpc/test/resource-config.http.test.ts`;
- `RES-SECRET-CRUD-008` and `RES-SECRET-CRUD-009` in
  `packages/adapters/cli/test/resource-command.test.ts`;
- `RES-PROFILE-ARCHIVE-001`, `RES-PROFILE-ARCHIVE-002`, `RES-PROFILE-ARCHIVE-003`,
  `RES-PROFILE-ARCHIVE-003A`, `RES-PROFILE-ARCHIVE-005`, and `RES-PROFILE-ARCHIVE-006` in
  `packages/application/test/archive-resource.test.ts`;
- `RES-PROFILE-ARCHIVE-004` in `packages/application/test/create-deployment.test.ts`;
- `RES-PROFILE-RESTORE-001` through `RES-PROFILE-RESTORE-003` in
  `packages/application/test/restore-resource.test.ts`;
- `RES-PROFILE-ENTRY-020` in `packages/orpc/test/resource-show.http.test.ts`;
- `RES-PROFILE-DELETE-001` through `RES-PROFILE-DELETE-008`, `RES-PROFILE-DELETE-006A`, and
  `RES-PROFILE-DELETE-CHECK-001` through `RES-PROFILE-DELETE-CHECK-003` in
  `packages/application/test/delete-resource.test.ts`;
- PG coverage for `RES-PROFILE-DELETE-006` proves retained audit rows are not resource delete
  blockers in `packages/persistence/pg/test/pglite.integration.test.ts`;
- PG runtime-instance blocker coverage for `RES-PROFILE-DELETE-006A` in
  `packages/persistence/pg/test/pglite.integration.test.ts`;
- PG source-link blocker coverage for `RES-PROFILE-DELETE-006` is covered by
  `SOURCE-LINK-STATE-017` in `packages/persistence/pg/test/pglite.integration.test.ts`;
- PG server-applied route blocker coverage for `RES-PROFILE-DELETE-005` is covered by
  `SERVER-APPLIED-ROUTE-STATE-004` in
  `packages/persistence/pg/test/pglite.integration.test.ts`;
- HTTP/oRPC dispatch for `resources.show` in `packages/orpc/test/resource-show.http.test.ts`;
- HTTP/oRPC dispatch for `resources.configure-source` in
  `packages/orpc/test/resource-source-profile.http.test.ts`;
- HTTP/oRPC dispatch for `resources.configure-runtime` in
  `packages/orpc/test/resource-runtime-profile.http.test.ts`;
- HTTP/oRPC dispatch for `resources.archive` in
  `packages/orpc/test/resource-archive.http.test.ts`;
- HTTP/oRPC dispatch for `resources.delete` in
  `packages/orpc/test/resource-delete.http.test.ts`;
- HTTP/oRPC dispatch for `resources.delete-check` in
  `packages/orpc/test/resource-show.http.test.ts`;
- CLI dispatch for `resources.configure-runtime` in
  `packages/adapters/cli/test/resource-command.test.ts`;
- CLI dispatch for `resources.archive` in `packages/adapters/cli/test/resource-command.test.ts`;
- CLI dispatch for `resources.delete` and `resources.delete-check` in
  `packages/adapters/cli/test/resource-command.test.ts`;
- Web detail dispatch for `resources.show` in `apps/web/test/e2e-webview/home.webview.test.ts`;
- Web source, runtime, network, access, configuration set/import, archive, and delete submissions in
  `apps/web/test/e2e-webview/home.webview.test.ts`.
- Web durable future-only profile editing guidance for source/runtime/network/access/health/
  configuration profile forms in
  `apps/web/test/e2e-webview/home.webview.test.ts` under `RES-PROFILE-ENTRY-012`.
- Web health policy submission for `RES-PROFILE-ENTRY-013` and configuration removal for
  `RES-PROFILE-ENTRY-014` in `apps/web/test/e2e-webview/home.webview.test.ts`.
- Web `.env` import submission for `RES-PROFILE-ENTRY-017` and `RES-PROFILE-CONFIG-013` in
  `apps/web/test/e2e-webview/home.webview.test.ts`.
- CLI dispatch coverage for source/runtime/network/access/health/config/archive/delete/delete-check profile
  commands in `packages/adapters/cli/test/resource-command.test.ts` under `RES-PROFILE-ENTRY-003`,
  `RES-PROFILE-ENTRY-006`, `RES-PROFILE-ENTRY-010`, and `RES-PROFILE-ENTRY-019`.

`DMBH-RES-001` is covered in `packages/core/test/resource.test.ts` as part of
[Domain Model Behavior Hardening](../specs/022-domain-model-behavior-hardening/spec.md). It is a
no-behavior-change domain unit row that supports existing deployment admission and plan-preview
rows rather than a new public capability.

`RES-PROFILE-DRIFT-003` is covered for Resource versus latest deployment snapshot configuration
drift in `packages/application/test/show-resource.test.ts` and for config deploy entry
configuration shadowed by resource-scoped effective config overrides in
`packages/adapters/cli/test/deployment-config.test.ts`; diagnostics expose key, exposure, kind,
scope, source, and masked/redacted value states only.
`RES-PROFILE-SOURCE-006` remains future event-consumer projection work. `RES-PROFILE-DELETE-009`
event payload coverage is asserted through the successful delete command test.

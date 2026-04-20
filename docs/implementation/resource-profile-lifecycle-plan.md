# Resource Profile Lifecycle Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for the Resource Profile Lifecycle accepted
candidate operations. It does not replace the command, query, event, workflow, error, or testing
specs.

## Governed Operations

- `resources.show`
- `resources.configure-source`
- `resources.configure-runtime`
- `resources.configure-network`
- `resources.archive`
- `resources.delete`

`resources.configure-health` already has its own command spec and remains the dedicated health
profile mutation.

## Governed Specs

- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Profile Lifecycle Test Matrix](../testing/resource-profile-lifecycle-test-matrix.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resources.configure-source Command Spec](../commands/resources.configure-source.md)
- [resources.configure-runtime Command Spec](../commands/resources.configure-runtime.md)
- [resources.configure-network Command Spec](../commands/resources.configure-network.md)
- [resources.archive Command Spec](../commands/resources.archive.md)
- [resources.delete Command Spec](../commands/resources.delete.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [resources.configure-health Command Spec](../commands/resources.configure-health.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Code Round Ordering

1. Add/confirm core value objects and aggregate methods for source, runtime, network, archived, and
   delete/tombstone lifecycle transitions without adding framework or persistence dependencies to
   `packages/core`.
2. Add repository specs and persistence support needed for `findOne`, profile mutation, archive,
   delete/tombstone, and deletion-blocker reads.
3. Add application vertical slices under `packages/application/src/operations/resources` for each
   command/query.
4. Register handlers through explicit tokens and command/query handler decorators; no service
   locator calls inside methods.
5. Add `CORE_OPERATIONS.md` implemented rows and `packages/application/src/operation-catalog.ts`
   entries in the same Code Round that exposes operations publicly.
6. Add oRPC/OpenAPI routes using application schemas, not transport-only input shapes.
7. Add CLI subcommands, one per operation. Do not add `appaloft resource update`.
8. Update Web resource detail/profile sections to dispatch operation-specific calls and refetch
   `resources.show`, `resources.health`, or related observation queries.
9. Add focused tests from the matrix before broad UI polish.

## Expected Modules And Packages

- `packages/core/src/workload-delivery`: `Resource` aggregate transitions, lifecycle value object,
  source/runtime/network value objects, deletion guard value objects where they are pure domain
  concepts.
- `packages/application/src/operations/resources`: command/query schemas, messages, handlers, use
  cases, query services, and exports for all governed operations.
- `packages/application/src/ports.ts`: repository/read-model ports for resource detail and deletion
  blocker checks.
- `packages/application/src/tokens.ts`: explicit DI tokens for use cases/query services/ports.
- `packages/application/src/operation-catalog.ts`: operation catalog entries when active.
- `packages/persistence/pg`: Kysely repository/read-model adapters and migration updates for
  resource lifecycle status, profile updates, and blocker checks.
- `packages/orpc`: typed RPC/OpenAPI routes and frontend client helpers.
- `packages/adapters/cli`: resource profile subcommands dispatching `CommandBus`/`QueryBus`.
- `apps/web`: resource detail profile sections and lifecycle confirmation flows using i18n keys.
- `apps/shell`: composition root registration.

## Write-Side State Changes

`resources.configure-source` updates only source binding fields.

`resources.configure-runtime` updates only runtime planning fields and must preserve existing health
policy storage even if the current persistence model stores health under runtime profile.

`resources.configure-network` updates only network profile fields.

Initial implementation status: `resources.show` is active for application query handling,
operation catalog, CLI, HTTP/oRPC, and the Web resource detail page. `resources.configure-source`
is active for core aggregate mutation, application command handling, operation catalog, CLI,
HTTP/oRPC, and the Web resource detail source profile form. `resources.configure-runtime` is active
for core aggregate mutation, application command handling, operation catalog, CLI, HTTP/oRPC, and
the Web resource detail runtime profile form. `resources.configure-network` is active for
application command handling, operation catalog, CLI, HTTP/oRPC, and the Web resource detail profile
form for reverse-proxy network profile changes. Direct-port exposure remains follow-up work
governed by the same specs.

`resources.archive` updates resource lifecycle status and optional safe reason.

`resources.delete` deletes or tombstones only after guards prove no retained blockers exist.

No governed command mutates deployments, runtime instances, proxy routes, domain bindings,
certificates, source links, environment variables, dependency resources, or logs.

## Completed Code Round: `resources.archive`

`resources.archive` is implemented with:

1. Add Resource lifecycle value objects and aggregate transition:
   - `ResourceLifecycleStatus` with `active` and `archived`;
   - `ArchivedAt`;
   - optional `ArchiveReason`;
   - aggregate method named for the lifecycle transition, not a generic update.
2. Persist lifecycle status, archive timestamp, and optional reason through the Resource repository
   and PostgreSQL/PGlite adapter.
3. Expose lifecycle state through `resources.show` as `lifecycle.status = "archived"` for
   retained resources.
4. Add `ArchiveResourceCommand`, schema, handler, use case, token registration, and
   `resource-archived` publication.
5. Add archived-resource guards to:
   - `resources.configure-source`;
   - `resources.configure-runtime`;
   - `resources.configure-network`;
   - `resources.configure-health`;
   - `deployments.create`.
6. Add `CORE_OPERATIONS.md` and `operation-catalog.ts` rows in the same Code Round that exposes
   the public command.
7. Add HTTP/oRPC route `POST /api/resources/{resourceId}/archive` and CLI subcommand
   `appaloft resource archive <resourceId> [--reason ...]`.
8. Add a Web resource detail archive action with confirmation. The action must dispatch
   `resources.archive`, refetch `resources.show`, and must not stop runtime or delete retained
   state.
9. Cover matrix rows `RES-PROFILE-SHOW-003`, `RES-PROFILE-SOURCE-005`,
   `RES-PROFILE-RUNTIME-005`, `RES-PROFILE-NETWORK-006`, `RES-PROFILE-HEALTH-001`,
   `RES-PROFILE-ARCHIVE-001` through `RES-PROFILE-ARCHIVE-005`, and the archive portions of
   `RES-PROFILE-ENTRY-003` through `RES-PROFILE-ENTRY-005`.

## Completed Code Round: `resources.delete`

`resources.delete` is implemented with:

1. Extend Resource lifecycle value objects and aggregate transition:
   - `ResourceLifecycleStatus` with `active`, `archived`, and `deleted`;
   - `DeletedAt`;
   - aggregate method named for the terminal delete transition, not a generic update.
2. Add `DeleteResourceCommand`, schema, handler, use case, token registration, and
   `resource-deleted` publication.
3. Add an authoritative deletion blocker read/application port that can detect:
   - deployment history;
   - runtime instances;
   - domain bindings;
   - certificates;
   - source links;
   - dependency bindings;
   - terminal sessions;
   - runtime-log retention;
   - audit-retention requirements;
   - generated access routes, server-applied routes, and proxy routes.
4. Persist deleted lifecycle/tombstone state through the Resource repository and
   PostgreSQL/PGlite adapter. Normal `resources.show`, `resources.list`, and navigation reads must
   omit deleted resources.
5. Add `CORE_OPERATIONS.md` and `operation-catalog.ts` rows in the same Code Round that exposes
   the public command.
6. Add HTTP/oRPC route `DELETE /api/resources/{resourceId}` using `DeleteResourceCommandInput`.
7. Add CLI subcommand `appaloft resource delete <resourceId> --confirm-slug <slug> [--json]`.
8. Add a Web resource detail delete action visible only for archived resources. The action must
   require typed slug confirmation, dispatch `resources.delete`, refetch or invalidate resource
   list/detail state, and must not stop runtime or delete retained blocker state.
9. Cover matrix rows `RES-PROFILE-DELETE-001` through `RES-PROFILE-DELETE-009` and
   `RES-PROFILE-ENTRY-006` through `RES-PROFILE-ENTRY-008`.

## Read-Side State Changes

`resources.show` uses a dedicated query service shape rather than relying on `resources.list` as a
full detail substitute. Durable source/runtime/network/health profile fields come from the
`Resource` aggregate. Deployment and access data remain contextual read-side summaries.

The read model must expose:

- resource identity and lifecycle;
- source profile in display-safe form;
- runtime profile in display-safe form;
- network profile;
- health policy summary;
- optional latest deployment context;
- optional access summary;
- safe diagnostics.

## Error And neverthrow Boundaries

Command factories return `Result<Command, DomainError>`.

Command handlers/use cases return `Promise<Result<{ id: string }, DomainError>>`.

`resources.show` handler/query service returns `Promise<Result<ResourceDetail, DomainError>>`.

Expected errors must use [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md) and must
not throw for validation, not found, conflict, archived-resource guard, deletion blocker, or
aggregate invariant failures.

Repository or event publication failures before safe command success must return
`err(DomainError)` with `code = infra_error`.

## Minimal Deliverable

The minimal Code Round deliverable is:

- one query slice for `resources.show`;
- command slices for source/runtime/network/archive/delete;
- event publication or outbox recording for each mutation command;
- PostgreSQL/PGlite persistence updates and migrations where needed;
- operation catalog and `CORE_OPERATIONS.md` implemented rows;
- HTTP/oRPC routes;
- CLI subcommands;
- Web resource detail sections dispatching one operation per form/action;
- tests covering command/query use cases, structured errors, event publication, transport dispatch,
  CLI dispatch, and one browser-level Web profile mutation flow.

## Non-Goals

This plan does not implement:

- generic `resources.update`;
- redeploy/restart/rollback/cancel;
- runtime stop or cleanup;
- source link retargeting;
- default access policy editing;
- custom domain binding or certificate lifecycle;
- runtime target scaling/sizing/orchestrator configuration;
- audit-only deleted resource query.

## Current Implementation Notes And Migration Gaps

The repository already has resource create/list, profile fields persisted through creation, and
health configuration. This plan starts from those pieces and adds post-create profile lifecycle
operations without changing deployment command boundaries.

Direct-port user-facing configuration remains blocked until placement conflict guards, adapter
behavior, and tests are implemented in the same Code Round.

`resources.configure-source`, `resources.configure-runtime`, `resources.configure-network`,
`resources.configure-health`, `resources.archive`, `resources.delete`, and `deployments.create`
archived-resource blocking is active through Resource lifecycle state. Duplicate configured-event
consumer idempotency remains future read-model projection work.

`resources.delete` uses deleted/tombstone lifecycle state, omits deleted resources from normal
read models, exposes HTTP/oRPC, CLI, and Web entrypoints, and publishes `resource-deleted` on the
first archived-to-deleted transition. The v1 PG blocker reader covers deployments, domain
bindings, certificates, provider runtime-log retention, and audit logs whose `aggregate_id` is the
resource id; blocker kinds without durable PG tables remain explicit extension points on
`ResourceDeletionBlockerReader`.

The next specified blocker closure is source links. The dedicated
[Source Link Durable Persistence Implementation Plan](./source-link-durable-persistence-plan.md)
defines the `source_links` PG/PGlite table, PG `SourceLinkStore`, and `source-link` delete blocker
coverage needed before that blocker kind can be treated as implemented for `resources.delete`.

# Server-Applied Route Durable Persistence Implementation Plan

## Scope

This plan covers the PostgreSQL/PGlite persistence slice for server-applied route desired and
applied state.

It does not add a new public operation. Repository config deploys continue to normalize
`access.domains[]` through the existing config workflow, and route realization continues to run as
the internal edge proxy provider workflow.

## Governing Specs

- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Edge Proxy Provider And Route Realization](../workflows/edge-proxy-provider-and-route-realization.md)
- [resources.delete Command Spec](../commands/resources.delete.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](../testing/edge-proxy-provider-and-route-configuration-test-matrix.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Resource Profile Lifecycle Test Matrix](../testing/resource-profile-lifecycle-test-matrix.md)

## ADR Decision

No new ADR is required for this slice. ADR-024 already governs server-applied route state in
SSH/PGlite workflows, ADR-025 governs selected state owner/control-plane mode, and ADR-019 governs
provider-owned route realization. This plan narrows the durable persistence mechanism and deletion
blocker closure for an existing internal capability.

## Implemented Code Round Target

The Code Round makes server-applied route state durable in the selected PostgreSQL-compatible state
backend.

The coherent slice is:

1. Promote desired-state writes to an application-level server-applied route state port:
   - the port must expose an intention-revealing `upsertDesired` operation;
   - `read`, `markApplied`, and `markFailed` remain separate operations;
   - the shared port lives at the application boundary, not in the CLI adapter.
2. Add a `server_applied_route_states` migration in `packages/persistence/pg`:
   - `route_set_id` primary key;
   - required `project_id`, `environment_id`, `resource_id`, and `server_id`;
   - optional `destination_id`;
   - optional `source_fingerprint`;
   - provider-neutral `domains` JSON;
   - `status`;
   - `updated_at`;
   - optional safe `last_applied` and `last_failure` JSON;
   - safe JSON `metadata`.
3. Add indexes for:
   - exact route target lookup by project/environment/resource/server/destination;
   - default-destination fallback lookup where `destination_id` is null;
   - reverse resource lookup by `resource_id` for delete blockers;
   - server-scoped diagnostics or adoption reads.
4. Add a PG `ServerAppliedRouteStateStore` adapter in `packages/persistence/pg`.
5. Register the PG adapter in shell composition whenever the selected database backend is
   PostgreSQL/PGlite, including SSH remote PGlite mirrors.
6. Keep the CLI file-backed route state store for adapter-level remote-state transfer and explicit
   legacy wiring, but do not make it the shell runtime's authoritative state store when a selected
   PostgreSQL/PGlite backend is open.
7. Extend `PgResourceDeletionBlockerReader` so rows in `server_applied_route_states` whose
   `resource_id` matches the resource report a `server-applied-route` blocker.
8. Do not add API/oRPC, Web, or CLI route-state mutation surfaces; this slice is persistence and
   blocker closure for existing config and route realization workflows.

## Data Contract

`server_applied_route_states` is application state in the selected Appaloft state backend. It is not
a `Resource` aggregate field, a `DomainBinding`, a `Certificate`, or committed repository config.

The durable row owns the provider-neutral desired/applied route set for one trusted
project/environment/resource/server/destination target. Exact destination-scoped state wins when a
row exists. When first-run config bootstrap stored desired state before an explicit destination id
was available, readers must fall back to the default-destination row for the same
project/environment/resource/server.

The `domains` JSON must preserve only provider-neutral route intent:

- host;
- path prefix;
- TLS mode;
- optional canonical redirect target host;
- optional redirect status.

Provider-specific files, labels, ACME storage, reload commands, private keys, DNS provider
credentials, target credentials, and raw certificate material must never be stored in this table.

The table must not cascade-delete resources. Any desired, applied, failed, or stale route state that
still references a resource is a `server-applied-route` deletion blocker until a future explicit
cleanup or unlink behavior removes the route state.

## Tests

Automated coverage:

- `SERVER-APPLIED-ROUTE-STATE-001`: PG store upserts desired serve and redirect route state and
  reads the same provider-neutral domains, status, target, and timestamp.
- `SERVER-APPLIED-ROUTE-STATE-002`: exact destination-scoped lookup wins over default-destination
  state, and default-destination state is used only when no exact row exists.
- `SERVER-APPLIED-ROUTE-STATE-003`: `markApplied` and `markFailed` persist safe status details and
  reject mismatched route-set targets with a structured route-state conflict.
- `SERVER-APPLIED-ROUTE-STATE-004`: `resources.delete` rejects an archived resource when PG route
  state still references the resource and reports `server-applied-route` through the existing
  blocker flow.
- `SERVER-APPLIED-ROUTE-STATE-005`: migration shape supports exact lookup, fallback lookup,
  reverse resource lookup, and no unsafe cascade from resource deletion to route state.

The PG tests use PGlite integration coverage so migrations, Kysely queries, fallback lookup, and
blocker reads are exercised without a required external PostgreSQL URL.

## Current Implementation Notes And Migration Gaps

The PG/PGlite persistence slice is implemented in `packages/persistence/pg`: migration
`020_server_applied_route_states` creates the durable table, `PgServerAppliedRouteStateStore`
implements the application port, shell composition uses that store for command execution, and
`PgResourceDeletionBlockerReader` reports `server-applied-route` blockers from durable PG state.

CLI file-backed SSH route state storage remains available for adapter-level remote-state mechanics
and explicit legacy wiring, but it is not the shell runtime's authoritative server-applied route
store when a selected PostgreSQL/PGlite backend is open.

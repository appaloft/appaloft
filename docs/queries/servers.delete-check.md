# servers.delete-check Query Spec

## Metadata

- Operation key: `servers.delete-check`
- Query class: `CheckServerDeleteSafetyQuery`
- Input schema: `CheckServerDeleteSafetyQueryInput`
- Handler: `CheckServerDeleteSafetyQueryHandler`
- Query service: `CheckServerDeleteSafetyQueryService`
- Domain / bounded context: Runtime topology / DeploymentTarget delete safety
- Current status: active query
- Source classification: normative contract

## Normative Contract

`servers.delete-check` is the source-of-truth query for previewing whether a server can be safely
deleted before a future destructive `servers.delete` command exists.

The query is read-only. It must not delete the server, stop workloads, remove proxy routes, unbind
domains, revoke certificates, detach credentials, cancel deployments, close terminal sessions,
delete logs, or repair server state.

```ts
type CheckServerDeleteSafetyResult = Result<ServerDeleteSafety, DomainError>;
```

The query contract is:

- validation failure returns `err(DomainError)`;
- missing or invisible server returns `err(DomainError)`;
- success returns `ok(ServerDeleteSafety)`;
- `eligible = true` only when the server is inactive and no blocker is found;
- `eligible = false` returns typed blocker reasons safe for CLI/API/Web display.

## Global References

This query inherits:

- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [Deployment Target Lifecycle Test Matrix](../testing/deployment-target-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Input Model

```ts
type CheckServerDeleteSafetyQueryInput = {
  serverId: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Deployment target/server whose deletion eligibility is being previewed. |

The input must not accept confirmation text, force flags, cascade options, provider-native ids,
runtime cleanup options, credential secrets, or route cleanup options.

## Output Model

```ts
type ServerDeleteSafety = {
  schemaVersion: "servers.delete-check/v1";
  serverId: string;
  lifecycleStatus: "active" | "inactive";
  eligible: boolean;
  blockers: ServerDeleteBlocker[];
  checkedAt: string;
};

type ServerDeleteBlocker = {
  kind: ServerDeleteBlockerKind;
  relatedEntityId?: string;
  relatedEntityType?: string;
  count?: number;
};
```

Canonical blocker kinds:

```ts
type ServerDeleteBlockerKind =
  | "active-server"
  | "deployment-history"
  | "active-deployment"
  | "resource-placement"
  | "domain-binding"
  | "certificate"
  | "credential"
  | "source-link"
  | "server-applied-route"
  | "default-access-policy"
  | "terminal-session"
  | "runtime-task"
  | "runtime-log-retention"
  | "audit-retention";
```

Blockers are intentionally conservative. A blocker exists when a retained record, state, or
external-facing route would make deletion ambiguous or unsafe:

- `active-server`: the server is still active and must be deactivated first.
- `deployment-history` and `active-deployment`: deployment attempts or non-terminal deployments
  reference the server.
- `resource-placement`: resources, latest placements, or destination state still point at the
  server.
- `domain-binding` and `certificate`: durable domain/TLS state references the server directly or
  through a server-owned domain binding.
- `credential`: server credential relationship or credential usage visibility still depends on the
  server.
- `source-link`, `server-applied-route`, `default-access-policy`, or `runtime-task`: source,
  route, policy, or runtime state still targets the server.
- `terminal-session`, `runtime-log-retention`, and `audit-retention`: operator support context
  still depends on the server identity.

The blocker payload must include only safe blocker kinds, ids, entity types, and counts. It must
not include logs, route provider config, private keys, SSH command output, certificate material,
environment secret values, or provider credentials.

## Error Contract

All whole-query failures use [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `query-validation` | No | `serverId` shape is invalid. |
| `not_found` | `server-read` | No | Server does not exist or is not visible. |
| `infra_error` | `server-delete-check-read` | Conditional | Delete blocker checks could not be safely assembled. |

Blockers are not query errors. A server with blockers returns `ok({ eligible: false, blockers })`.
A future destructive `servers.delete` command must convert the same blockers into
`server_delete_blocked`.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Server detail shows a read-only delete-safety panel before destructive delete UI exists. | Active / read-only |
| CLI | `appaloft server delete-check <serverId> [--json]`; `appaloft server delete <serverId> --check` may be added as an alias later. | Active |
| oRPC / HTTP | `GET /api/servers/{serverId}/delete-check` using the query schema. | Active |
| Repository config files | Not applicable. Repository config cannot request destructive control-plane lifecycle deletion. | Not applicable |
| Automation / MCP | Future query/tool over the same operation key. | Future |
| Public docs | Existing `server.deployment-target` anchor covers deactivation and delete safety. | Active |

## Current Implementation Notes And Migration Gaps

The first active slice implements a preview/check query, not actual server deletion. Web server
detail shows the read-only safety result and blocker count; destructive delete controls remain
future work.

The PG blocker reader covers inactive gating, retained deployments, non-terminal deployments,
domain bindings, certificates tied through domain bindings, server-applied routes, source links
with the selected `server_id`, server credential attachment, provider runtime logs through
deployments, audit logs whose `aggregate_id` is the server id, and deployment-target default access
policy overrides. Terminal session and external runtime-task blocker detection remain extension
points until durable tables exist.

Actual `servers.delete`, typed confirmation, tombstone persistence, and `server-deleted` event
remain future work.

## Open Questions

- None for the preview/check boundary.

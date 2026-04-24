# servers.configure-edge-proxy Command Spec

## Metadata

- Operation key: `servers.configure-edge-proxy`
- Command class: `ConfigureServerEdgeProxyCommand`
- Input schema: `ConfigureServerEdgeProxyCommandInput`
- Handler: `ConfigureServerEdgeProxyCommandHandler`
- Use case: `ConfigureServerEdgeProxyUseCase`
- Domain / bounded context: Runtime topology / DeploymentTarget lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`servers.configure-edge-proxy` is the source-of-truth command for changing the desired edge proxy
kind of an active deployment target/server.

Command success means future server list/detail reads expose the new edge proxy kind and status,
and future generated/default access or custom-domain route admission uses the new proxy intent.
It does not change the server id, host, port, provider key, credential relationship, lifecycle
status, destination ids, deployment history, domain history, route snapshots, logs, audit records,
or provider-owned runtime artifacts.

```ts
type ConfigureServerEdgeProxyResult = Result<
  {
    id: string;
    edgeProxy: {
      kind: "none" | "traefik" | "caddy";
      status: "disabled" | "pending" | "starting" | "ready" | "failed";
    };
  },
  DomainError
>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id, edgeProxy })`;
- accepted success persists the new current `DeploymentTarget.edgeProxy.kind`;
- accepted success resets the current edge proxy status summary to the initial status for the new
  kind: `disabled` for `none`, `pending` for provider-backed kinds;
- accepted success publishes or records `server-edge-proxy-configured` only when the normalized
  kind changes;
- configuring the same normalized kind is idempotent and must not reset status, erase the current
  summary, or publish a duplicate event;
- active servers may be configured;
- inactive servers are rejected because inactive targets must not receive new deployment,
  scheduling, or proxy target configuration work;
- deleted server tombstones are immutable through the ordinary configure entrypoint and return
  `not_found` from normal command admission.

## Global References

This command inherits:

- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [server-edge-proxy-configured Event Spec](../events/server-edge-proxy-configured.md)
- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [Server Bootstrap And Proxy Workflow](../workflows/server-bootstrap-and-proxy.md)
- [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md)
- [Deployment Target Lifecycle Test Matrix](../testing/deployment-target-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

No new ADR is required for this slice. The behavior is an intention-revealing mutation of
DeploymentTarget edge proxy intent governed by ADR-004, ADR-017, ADR-019, and ADR-026. It does not
create a new aggregate, provider boundary, async lifecycle, route cleanup rule, or deployment
admission surface.

## Purpose

Configure whether a server should be considered proxy-backed for future generated access and
custom-domain route realization.

It is not:

- a generic server update command;
- a connectivity test or repair command;
- a synchronous proxy bootstrap command;
- a provider SDK configuration command;
- a route, domain, certificate, credential, destination, deployment, terminal, log, or audit
  cleanup command;
- a provider-owned artifact deletion or migration command.

## Input Model

```ts
type ConfigureServerEdgeProxyCommandInput = {
  serverId: string;
  proxyKind: "none" | "traefik" | "caddy";
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Required | Active deployment target/server whose edge proxy intent is configured. |
| `proxyKind` | Required | Desired edge proxy kind. Must reuse the existing `EdgeProxyKindValue` rules. |
| `idempotencyKey` | Optional | Deduplicates retries for the same configure request where supported. |

The command must reuse the existing `EdgeProxyKindValue` / `edgeProxyKinds` rules. Supported values
are:

```text
none
traefik
caddy
```

The command must not introduce a parallel string bag, free-form provider name, provider SDK type,
image name, or product-specific configuration object.

## Proxy Kind Semantics

`none` means future generated/default access or custom-domain proxy routing must not treat this
server as a proxy-backed target. The command must not delete historical route snapshots,
deployment history, domain history, audit records, provider-owned proxy containers, provider-owned
networks, or provider-owned files. Explicit cleanup or artifact removal requires a separate future
operation/spec.

`traefik` and `caddy` mean future proxy-backed route realization should resolve provider-owned
edge proxy intent for that kind through the provider registry/runtime provider boundary. The command
records desired intent only. It does not render labels, write proxy config, create containers,
restart proxy infrastructure, or verify proxy readiness.

When the kind changes from `none` to a provider-backed kind, the server's current proxy status
becomes `pending`. The command does not synchronously request bootstrap. The accepted follow-up
paths are:

- explicit `servers.bootstrap-proxy` / `appaloft server proxy repair <serverId>`;
- a later deployment/runtime ensure path that idempotently ensures provider-owned proxy
  infrastructure when proxy-backed access is required.

When the kind changes from one provider-backed kind to another, the status also becomes `pending`.
Any previously ready/failed status summary was for the prior provider intent and must not be
treated as readiness for the new kind.

## Server Lifecycle State

Allowed lifecycle states:

```text
active -> active with new edge proxy intent
```

Disallowed ordinary configure states:

```text
inactive -> server_inactive
deleted -> not_found from normal command admission
```

Inactive servers remain readable but must not receive new deployment, scheduling, or proxy target
configuration work. Because this command changes future proxy target eligibility, inactive servers
are rejected instead of accepting a side-effect-free save.

Configure must preserve all non-proxy lifecycle fields:

- `lifecycleStatus`;
- `deactivatedAt`;
- `deactivationReason`;
- `deletedAt` when a tombstone is resolved internally;
- credential state;
- host, port, provider key, target kind, and created timestamp.

## Admission Flow

The command must:

1. Validate command input.
2. Normalize `proxyKind` through `EdgeProxyKindValue`.
3. Resolve `serverId` through the write-side server repository.
4. Reject missing or invisible servers with `not_found`.
5. Treat resolvable deleted tombstones as ordinary-command `not_found`.
6. Reject inactive servers with `server_inactive`, `phase = server-lifecycle-guard`.
7. Return idempotent `ok({ id, edgeProxy })` without an event when the normalized kind is unchanged.
8. Persist the new edge proxy intent and initial current status for that kind.
9. Publish or record `server-edge-proxy-configured` after the new intent is durable.
10. Return `ok({ id, edgeProxy })`.

## Read Model Rules

After success:

- `servers.list` returns the new edge proxy kind/status;
- `servers.show` returns the new edge proxy kind/status;
- target-selection, generated access planning, and durable domain admission must use the new
  write-side proxy intent rather than stale read-model values;
- historical deployment, domain, route, log, audit, and support records remain keyed by the same
  server id and do not require migration.

## Error Contract

All errors use [Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | `serverId`, `proxyKind`, or `idempotencyKey` shape is invalid. |
| `not_found` | `server-admission` | No | Server does not exist, is not visible, or is a deleted tombstone hidden from ordinary configure. |
| `server_inactive` | `server-lifecycle-guard` | No | Server is inactive and cannot receive new proxy target configuration work. |
| `invariant_violation` | `server-lifecycle-guard` | No | DeploymentTarget rejects the proxy intent transition. |
| `infra_error` | `server-persistence` | Conditional | Configured server state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | `server-edge-proxy-configured` could not be recorded before command success. |

Unsupported or unavailable concrete provider behavior during later bootstrap or route realization
belongs to the server bootstrap / edge proxy provider error contracts, not to this command, unless
the configure implementation introduces a provider registry admission check in a later Spec Round.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Server detail should expose a select/radio control for active servers using `none`, `traefik`, and `caddy`; inactive/deleted servers show read-only status. | Active when implemented |
| CLI | `appaloft server proxy configure <serverId> --kind none\|traefik\|caddy [--json]`. | Active |
| oRPC / HTTP | `POST /api/servers/{serverId}/edge-proxy/configuration` using the command schema. | Active |
| Repository config files | Not applicable. Repository config cannot change deployment target identity or server-owned proxy intent. | Not applicable |
| Automation / MCP | Future command/tool over the same operation key. | Future |
| Public docs | Existing `server.proxy-readiness` anchor covers proxy intent and readiness semantics; `server.deployment-target` explains server identity preservation. | Active |

## Events

Canonical event spec:

- [server-edge-proxy-configured](../events/server-edge-proxy-configured.md): server desired edge
  proxy kind changed.

## Current Implementation Notes And Migration Gaps

The intended first active implementation exposes API/oRPC and CLI closure and updates list/show
read-model visibility. Web server detail may expose the owner-scoped proxy kind selector if the
existing detail page can carry it without broad redesign; otherwise the Web action is recorded as a
migration gap while read-only proxy status remains visible.

The current code still uses `proxyKind` as provider-selection migration data. This command reuses
that existing value object/enum seam and does not introduce provider-specific SDK types.

## Open Questions

- None for intent-only edge proxy configuration.

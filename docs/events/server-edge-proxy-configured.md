# server-edge-proxy-configured Event Spec

## Metadata

- Event name: `server-edge-proxy-configured`
- Publisher: `servers.configure-edge-proxy`
- Aggregate owner: DeploymentTarget / server
- Current status: active event for server edge proxy intent changes

## Normative Contract

`server-edge-proxy-configured` records that a deployment target/server desired edge proxy kind
changed.

The event is a user-visible lifecycle/configuration fact for future route eligibility and
read-model display. It must be published or recorded only after the new server edge proxy intent is
durably persisted.

The event does not imply proxy infrastructure was installed, repaired, removed, restarted, or
verified. It does not imply any change to server id, host, port, provider, credential, lifecycle
status, destination, deployment history, domain history, route snapshots, logs, audit records, or
provider-owned runtime state.

## Payload

```ts
type ServerEdgeProxyConfiguredEventPayload = {
  serverId: string;
  previousKind: "none" | "traefik" | "caddy";
  previousStatus: "pending" | "starting" | "ready" | "failed" | "disabled";
  kind: "none" | "traefik" | "caddy";
  status: "disabled" | "pending";
  configuredAt: string;
  correlationId?: string;
  causationId?: string;
};
```

| Field | Meaning |
| --- | --- |
| `serverId` | Deployment target/server whose edge proxy intent changed. |
| `previousKind` | Previous desired edge proxy kind. |
| `previousStatus` | Previous current proxy status summary for the old kind. |
| `kind` | New desired edge proxy kind. |
| `status` | New current proxy status summary for the new kind. |
| `configuredAt` | Timestamp captured by the command clock after admission. |

Payloads must not include private keys, SSH command output, provider credentials, environment
secret values, certificate material, provider-native proxy configs, route provider config, or log
excerpts.

## Publication And Idempotency

The event is emitted only when the normalized desired edge proxy kind changes.

Repeated `servers.configure-edge-proxy` calls with the same normalized kind are idempotent command
successes and must not publish duplicate `server-edge-proxy-configured` events.

Consumers must handle duplicate event delivery idempotently by server id and durable configured
state. Duplicate delivery must not duplicate audit records, notifications, route realization, proxy
bootstrap attempts, cache invalidations, or read-model writes.

## Read Model Semantics

Consumers may update server list/detail projections, generated access eligibility summaries,
target-selection displays, audit trails, and cache entries. Historical records that carry only
server ids or route snapshots do not need migration.

For `kind = "none"`, future generated/default access and custom-domain proxy target selection must
treat the server as not proxy-backed. Historical route snapshots and provider-owned artifacts are
not deleted by this event.

For provider-backed kinds, the server becomes an eligible proxy-intent target only after later
readiness/route gates are satisfied. This event by itself is not proxy readiness.

## Consumers

Consumers may refresh server proxy status and invalidate non-authoritative caches. They must not:

- start `servers.bootstrap-proxy` automatically;
- render or apply proxy route configuration;
- delete proxy containers, networks, files, labels, route snapshots, domains, certificates, logs,
  or audit state;
- mutate credentials, resources, deployments, destinations, domains, certificates, terminal
  sessions, logs, audit retention, or runtime state.

## Error Handling

Producer failures before command success use `phase = event-publication` in
[Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md).

Consumer failures use `phase = event-consumption` and must not reinterpret the original command
result.

## Current Implementation Notes And Migration Gaps

The first implementation may publish this event through the existing in-memory event bus after the
server aggregate is persisted. Durable outbox/inbox, audit projection, and target-selection cache
invalidation remain broader platform gaps.

## Open Questions

- None.

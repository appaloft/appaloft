# Execution Sandbox Lifecycle Events

## Contract

Execution Sandbox events are durable business or provider-attempt facts. Acceptance events prove
that desired state was persisted; observed events prove only the named provider outcome. No event
proves that an external application consumed it, and process stdout/stderr is carried by bounded
process streams rather than domain events.

Every event contains `eventId`, `occurredAt`, `correlationId`, tenant-safe owner scope,
`sandboxId`, optional `attemptId`, lifecycle revision and safe structured details. It never contains
resolved secrets, raw environment values, command text, file content, host/provider credentials,
host addresses, provider object names or provider raw payloads.

## Event Kinds

| Event | Meaning | Drives |
| --- | --- | --- |
| `sandbox-requested` | Create intent and admitted policy were persisted. | Provisioning worker/reconciler, audit, read models. |
| `sandbox-provisioning-started` | One exact provider attempt acquired execution ownership. | Progress streams and stale-attempt observation. |
| `sandbox-ready` | The provider reported an operable runtime with realized capability/isolation evidence. | Exec/file/port admission, usage observation. |
| `sandbox-pause-requested` / `sandbox-paused` | Pause intent was accepted / provider compute was released while preserving identity. | Lifecycle read model and resume admission. |
| `sandbox-resume-requested` / `sandbox-resumed` | Resume intent was accepted / the same Sandbox became ready again. | Lifecycle read model and capability admission. |
| `sandbox-network-policy-updated` | A new admitted policy revision was persisted. | Provider policy reconciliation and audit. |
| `sandbox-termination-requested` / `sandbox-terminated` | Permanent cleanup was accepted / exact owned provider state was removed or proven absent. | Access revocation, retention and audit. |
| `sandbox-expired` | TTL or idle policy terminally expired the Sandbox through the termination boundary. | Exact provider cleanup and retention. |
| `sandbox-failed` | A create/lifecycle attempt reached a structured terminal failure. | Safe diagnostics and explicit retry/reconciliation. |
| `sandbox-snapshot-requested` / `sandbox-snapshot-ready` / `sandbox-snapshot-failed` | Snapshot intent was accepted / reusable state became available / capture failed. | Snapshot read model, retention and create-from-snapshot admission. |

## Delivery And Reconciliation

- Long-running provider work uses durable attempt claim, heartbeat, completion and retry semantics.
- Replayed events are ordered by a Sandbox-local sequence; consumers deduplicate by `eventId`.
- A stale heartbeat is an observation, not permission to delete provider state. Reconciliation must
  first resolve the exact Appaloft ownership handle and compare desired/observed state.
- Retry creates a new attempt id and keeps causal links to the accepted command and previous
  attempt. Terminal aggregate transitions remain idempotent.

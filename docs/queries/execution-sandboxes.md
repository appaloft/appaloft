# Execution Sandbox Queries

## Normative Contract

Execution Sandbox queries are tenant-scoped, bounded and mutation-free. They return safe desired
and observed state without resolved secrets, raw provider credentials, host addresses, container
ids, Kubernetes object names, host process ids, command secret values or unbounded output.

## Queries

| Operation | Result |
| --- | --- |
| `sandbox-templates.list` | Bounded template summaries visible to the current tenant. |
| `sandbox-templates.show` | One template definition and override policy. |
| `sandboxes.list` | Bounded Sandbox summaries filtered by safe status/scope/label selectors. |
| `sandboxes.show` | One desired/observed lifecycle descriptor, policy summary, expiry, placement capability and safe failure summary. |
| `sandboxes.stream-events` | Bounded replay plus follow stream for lifecycle/provider attempt events; no process output. |
| `sandbox-processes.list` | Bounded safe process summaries for one Sandbox. |
| `sandbox-processes.show` | One process descriptor with state, times and terminal exit result. |
| `sandbox-processes.stream-events` | Bounded process stdout/stderr/status stream with cancellation/reconnect semantics. |
| `sandbox-files.list` | Bounded directory entries below the workspace root. |
| `sandbox-files.read` | Bounded binary response or signed download resource for one confined file. |
| `sandbox-ports.list` | Active/revoked safe access descriptors for one Sandbox. |
| `sandbox-snapshots.list` | Bounded retained Snapshot summaries. |
| `sandbox-snapshots.show` | One Snapshot capability, source, lifecycle and retention descriptor. |

## Safe Sandbox Read Model

The Sandbox read model includes:

- `sandboxId`, tenant-visible owner scope and labels;
- desired and observed status;
- requested and realized isolation levels;
- safe provider key/server id/region when policy allows readback;
- requested resource limits and provider-observed usage summary;
- template/image digest or snapshot source reference without registry credentials;
- network policy mode, allowlist summary and credential-grant ids/hosts without secret values;
- absolute expiry, idle expiry, last activity and lifecycle timestamps;
- current provider attempt id/status and structured safe error;
- capability flags and counts for processes, ports and snapshots.

Raw stdout/stderr, file content and process command text are excluded from lifecycle list/show.

## Consistency

Create and lifecycle commands provide read-your-own-write for desired state. Provider-observed state
may be eventually consistent and is identified by observed time and attempt id. Stream replay uses
bounded cursors; an expired cursor returns a typed gap that directs the caller to `sandboxes.show`.

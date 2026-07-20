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
| `sandbox-processes.list` | Bounded safe process summaries for one Sandbox. |
| `sandbox-processes.show` | One process descriptor with state and terminal exit result when observed. |
| `sandbox-files.list` | Bounded directory entries below the workspace root. |
| `sandbox-files.read` | Bounded binary response or signed download resource for one confined file. |
| `sandbox-ports.list` | Active/revoked safe access descriptors for one Sandbox. |
| `sandbox-snapshots.list` | Bounded retained Snapshot summaries. |
| `sandbox-snapshots.show` | One Snapshot capability, source, lifecycle and retention descriptor. |

## Safe Sandbox Read Model

The Sandbox read model includes:

- `sandboxId`, tenant ownership and status;
- requested and realized isolation levels;
- safe provider key and requested resource limits;
- template/image digest or snapshot source reference without registry credentials;
- network policy mode and normalized allowlist summary;
- absolute expiry and lifecycle timestamps;
- current provider attempt count/handle state and structured safe error.

Raw stdout/stderr, file content and process command text are excluded from lifecycle list/show.

## Consistency

Create and lifecycle commands provide read-your-own-write for desired state. Provider-observed state
may be eventually consistent. Callers poll bounded list/show/process queries; live event replay is a
governed compatible follow-up and is not claimed by the current API.

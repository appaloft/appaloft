# Execution Sandbox Commands

## Normative Contract

Execution Sandbox commands are intention-revealing write operations over Sandbox,
SandboxTemplate, SandboxSnapshot or provider-owned runtime capabilities. They dispatch through the
CommandBus, require tenant/auth context, return typed `Result` values and never expose host/provider
credentials or resolved secret values.

## Commands

| Operation | Intent | Owner | Accepted result |
| --- | --- | --- | --- |
| `sandbox-templates.create` | Create a reusable admitted starting definition. | SandboxTemplate | Safe template descriptor. |
| `sandbox-templates.delete` | Retire an unused template after delete safety checks. | SandboxTemplate | Deleted template id. |
| `sandboxes.create` | Request and perform the first reconciliation for a Sandbox. | Sandbox | Ready/failed descriptor; accepted intent was persisted before provider mutation. |
| `sandboxes.pause` | Preserve one Sandbox identity while releasing supported compute. | Sandbox | Pausing/paused descriptor plus attempt id. |
| `sandboxes.resume` | Resume the same paused Sandbox. | Sandbox | Resuming/ready descriptor plus attempt id. |
| `sandboxes.terminate` | Permanently revoke runtime access and clean up exact provider state. | Sandbox | Terminating/terminated descriptor plus attempt id. |
| `sandboxes.network-policy.configure` | Replace the admitted egress policy when the provider supports it. | Sandbox | Updated descriptor; unsupported policies fail before provider mutation. |
| `sandboxes.exec` | Execute foreground argv or start a background process. | Sandbox runtime capability | Bounded frames or safe process descriptor. |
| `sandbox-processes.terminate` | Signal/terminate one Sandbox-owned background process. | Provider runtime capability | Safe process terminal descriptor. |
| `sandbox-files.write` | Write binary content below the workspace root. | Provider filesystem capability | Path, size, digest and modified time. |
| `sandbox-files.remove` | Remove one confined file or directory under explicit recursive policy. | Provider filesystem capability | Removed path descriptor. |
| `sandbox-ports.expose` | Create controlled access to one Sandbox port. | Sandbox/provider access capability | Safe exposure descriptor. |
| `sandbox-ports.revoke` | Revoke one exact port exposure. | Sandbox/provider access capability | Revoked exposure id. |
| `sandbox-snapshots.create` | Capture reusable provider state from one Sandbox. | SandboxSnapshot | Requested/capturing snapshot descriptor plus attempt id. |
| `sandbox-snapshots.delete` | Delete one retained Snapshot after dependent-create safety checks. | SandboxSnapshot | Deleted snapshot id. |

## Create Input

`sandboxes.create` accepts:

- exactly one discriminated source: image, template id or snapshot id;
- optional provider key selected inside the tenant context;
- requested isolation minimum;
- vCPU, memory, disk and process limits;
- optional absolute TTL;
- validated network policy.

Provider-specific fields, raw Docker/Kubernetes/VM settings, SSH credentials and tenant ids are not
accepted through the public command.

## Execution Input And Stream

- `argv` is a non-empty string array. The adapter executes tokens without implicit shell joining.
- `cwd` is a confined workspace-relative path.
- `stdinBase64` is bounded binary input at the transport boundary.
- `timeoutMs` is required to remain within admitted Sandbox policy.
- foreground mode returns bounded typed frames: `stdout`, `stderr`, then exactly one `exit` or
  `error` terminal frame; this is not a live attach/stream contract;
- background mode returns a safe process id and readback operations own later observation.

## Lifecycle Rules

- Create persists the requested Sandbox and attempt before provider mutation.
- Pause requires `ready` and a provider pause capability.
- Resume requires `paused` and preserves the Sandbox id.
- Terminate is idempotent for terminating/terminated/expired state.
- Expiration is a system command using the same aggregate transition and exact provider cleanup.
- Failed provider attempts persist failed/retryable status; retries use new attempt ids.
- Terminated and expired Sandboxes reject exec/files/ports/snapshot operations.

## Error Contract

See [Execution Sandbox Errors](../errors/execution-sandboxes.md). All command errors include a
stable code, category, `details.phase`, retriable flag and safe related ids/state when applicable.

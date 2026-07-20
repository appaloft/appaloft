# Execution Sandbox Workflow

## Goal

Provision and operate one isolated task-scoped environment through a provider-neutral Appaloft
handle, then reclaim all Appaloft-owned runtime state safely.

## Actors

- external application or AI agent using the TypeScript SDK/HTTP/MCP;
- operator using CLI/Web;
- Appaloft command/query application layer;
- sandbox provider adapter and runtime worker;
- expiry/reconciliation scheduler;
- injected authorization, quota, audit, usage and credential-broker policies.

## Lifecycle

```text
sandbox-templates.create (optional)
  -> sandboxes.create
  -> sandboxes.show / sandboxes.stream-events
  -> ready
  -> sandbox-files.* / sandboxes.exec / sandbox-processes.* / sandbox-ports.*
  -> optional sandboxes.pause -> sandboxes.resume
  -> optional sandbox-snapshots.create
  -> sandboxes.terminate or policy expiry
  -> provider cleanup reconciliation
```

## Create Progression

1. Transport authenticates and derives tenant context; callers do not submit tenant ids.
2. Command schema validates source, limits, expiry, isolation, network and credential grant refs.
3. Authz, entitlement/quota and provider capability admission run before external mutation.
4. The Sandbox aggregate accepts `request provisioning`; repository persists desired state and a
   new attempt id.
5. Provider worker creates the exact isolated runtime and returns a safe provider handle plus
   realized capability evidence.
6. Application persistence transitions to `ready` or `failed`; events/read model update after the
   persistence boundary.
7. Audit records safe metadata and usage attribution records neutral usage intent after accepted
   work. Neither record is the Sandbox command decision.

## Runtime Interaction

- Foreground exec streams output and terminal result without persisting raw output in aggregate,
  audit or ordinary lifecycle read models.
- Background exec returns a process id and provider readback powers later list/show/events/terminate.
- File operations resolve paths below the provider workspace root after lexical and provider-level
  canonical-path checks.
- Port exposure is admitted by visibility, port range, protocol and expiry, then returns an
  Appaloft access descriptor. Provider/private addresses remain internal.
- Network policy and credential grant updates are revisioned and applied atomically or fail without
  advertising the new revision.

## Pause, Snapshot And Restore

- Pause is one-to-one: the same Sandbox id becomes paused and can resume.
- Snapshot is one-to-many: capture creates an independent Snapshot id; new create commands may use
  it as source.
- Providers declare filesystem-only or filesystem-plus-memory support. Appaloft never upgrades the
  claim beyond returned evidence.
- Active streams/connections may be interrupted by pause/snapshot and clients must reconnect from
  stream cursors/read models.

## Expiry And Cleanup

- Absolute TTL and idle expiry dispatch the same aggregate-owned expiration transition.
- Terminate/expire revokes access before provider cleanup when possible.
- Cleanup identifies exact Appaloft ownership labels/handles and is idempotent.
- Reconciliation compares desired terminal state with provider observation and retries scoped
  cleanup; it never uses broad provider deletion filters.
- Cleanup failure remains observable and retriable; it does not rewrite the historical accepted
  command result.

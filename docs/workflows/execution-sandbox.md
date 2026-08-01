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

- Every provider process boundary supplies a writable workspace-scoped `HOME` plus XDG
  data/config/state/cache directories below the confined workspace root. This applies uniformly to
  foreground/background exec, initialization, managed terminals, Agent harnesses, and resumed
  work. A read-only container root or host/global account home is never an implicit fallback.
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
- Compute-released recovery declares provider-local, provider-family or portable compatibility.
  Cross-provider resume requires a compatible family or portable recovery; incompatibility fails
  before target effects.
- A provider may request placement reconciliation for a ready runtime. Maintenance performs the
  move through the same pause/resume lifecycle only when compute is released and recovery is
  portable. Failed cutover leaves the Sandbox paused with its source recovery package for retry.
- Snapshot is one-to-many: capture creates an independent Snapshot id; new create commands may use
  it as source.
- An injected lifecycle policy may schedule reusable captures, retain a bounded number, expire exact
  handles, and require or best-effort capture a fresh Snapshot before termination or expiry.
- Snapshot reason is `manual`, `scheduled`, or `pre-termination`. A fresh manual Snapshot can
  satisfy the policy interval or destructive recovery gate and avoids redundant copies.
- Portable reusable Snapshots remain after successful restore. Cross-provider create requires
  portable recovery or an equal declared Snapshot recovery family.
- Providers declare filesystem-only or filesystem-plus-memory support. Appaloft never upgrades the
  claim beyond returned evidence.
- Active streams/connections may be interrupted by pause/snapshot and clients must reconnect from
  stream cursors/read models.
- Shared recovery handles never expose the configured store root. Packages are digest checked and
  removed only after successful target readiness or explicit termination.
- Reusable portable Snapshot packages are removed only by exact Snapshot deletion/retention, not by
  restore or by terminating a Sandbox created from them.

## Expiry And Cleanup

- Absolute TTL and idle expiry dispatch the same aggregate-owned expiration transition.
- Required pre-expiry Snapshot policy obtains a fresh ready recovery point before destructive
  provider cleanup; failure preserves the runtime or paused recovery for retry.
- Terminate/expire revokes access before provider cleanup when possible.
- Cleanup identifies exact Appaloft ownership labels/handles and is idempotent.
- Reconciliation compares desired terminal state with provider observation and retries scoped
  cleanup; it never uses broad provider deletion filters.
- Cleanup failure remains observable and retriable; it does not rewrite the historical accepted
  command result.

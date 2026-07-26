# ADR-097: Workspace Hibernation And Recovery

- Status: Accepted
- Date: 2026-07-26

## Context

Execution Sandbox already exposes `sandboxes.pause`, `sandboxes.resume` and reusable
`SandboxSnapshot` operations. The existing model correctly keeps pause/resume on one Sandbox
identity and keeps a Snapshot as an independent source for later Sandboxes, but the provider
capability is only a boolean. That boolean cannot distinguish:

- a provider that freezes a still-allocated runtime;
- a provider that releases compute and retains provider-local recovery state;
- a provider whose recovery state is portable to another compatible placement.

The distinction matters for Agent Workspace. A terminal or native Agent attach capability can be
reissued after a runtime is recreated, but an arbitrary PTY process, in-memory Agent state or
published port cannot be promised after compute has been released. Docker image snapshots stored
only on one registered Server also cannot truthfully support cross-server migration.

Hosted products may decide idle thresholds, tenant entitlements and registered Server placement,
but those policies must consume a public, provider-neutral lifecycle instead of defining another
Cloud Workspace aggregate.

## Decision

### Pause capability is truthful and graded

`SandboxProvider.capabilities.pause` is a declared mode:

- `false`: pause is unsupported;
- `process-frozen`: the provider keeps the runtime allocation and process memory;
- `compute-released`: the provider removes the active runtime allocation and returns a recovery
  handle from which the same Sandbox identity can be resumed.

The application service asks the provider to perform its declared mode and persists the observed
mode with the paused Sandbox. A provider must not advertise `compute-released` unless its active
runtime no longer consumes the admitted CPU and memory allocation after pause succeeds.

`sandboxes.pause` and `sandboxes.resume` remain the public operation names. This is an additive
clarification of their existing identity semantics, not a second hibernate aggregate or operation
family.

### Recovery preserves durable workspace state, not arbitrary live processes

A compute-released pause must preserve `/workspace` and documented Agent persistent paths below
that root. Resume recreates the runtime under the same `SandboxId`, resource limits, isolation and
network policy. The provider may return a new opaque provider handle.

After compute-released pause:

- old terminal, native attach and port capabilities are invalid;
- callers open or issue new capabilities after resume;
- filesystem-backed Pi/OpenCode session state may be resumed by its harness;
- arbitrary processes, PTY memory and unpersisted model streams are not restored.

`process-frozen` may preserve process memory, but public callers must inspect the observed pause
mode before relying on that continuity.

### Auto-suspend is maintenance over observed activity

Sandbox records a safe `lastActivityAt`. Successful Sandbox process, file, credential-broker and
port operations touch activity. The maintenance runner also excludes Sandboxes that currently own
an active managed Terminal Session. A maintenance runner may receive an explicit idle threshold and
pause only ready, idle Sandboxes whose provider advertises `compute-released`.

The threshold is policy input. Community may configure one locally; Cloud or Enterprise may derive
it from tenant entitlement. The public aggregate does not own pricing, billing or a Cloud plan.

### Quota is an admission port

Creation consults an optional `SandboxQuotaPolicy` before persisting the Sandbox. The policy sees
the tenant-scoped active usage summary and requested resource limits, and either admits or returns
a typed quota conflict. Public Appaloft includes a static limit policy suitable for self-hosted
operators. Hosted entitlement and metering remain private adapters.

Paused compute-released Sandboxes continue to consume a Sandbox slot and durable disk allowance,
but contribute zero admitted CPU, memory and process allocation until resume.

Quota rejection occurs before provider effects and before a Sandbox row is created.

### Placement is an injected policy; migration is capability-gated

Compatible providers are enumerated and an optional `SandboxPlacementPolicy` selects one by public
provider key and safe capacity inputs. Provider topology, SSH credentials, host addresses and
commercial scheduling policy remain outside public state.

Recovery state declares portability:

- `provider-local`: resumable only by the exact provider key;
- `provider-family`: resumable by providers that declare the same recovery family;
- `portable`: backed by an external portable recovery store and consumable by any compatible
  provider that supports its format.

V1 Docker hibernation is `provider-local`. A request to resume it on another registered Server must
fail before changing placement. Cross-server migration is enabled only after a provider supplies a
portable or provider-family recovery contract and the target proves compatibility.

### Provider-local recovery is cleaned up exactly

Terminate and expiry must delete either the live runtime or the paused recovery handle. Successful
resume removes one-shot hibernation recovery state after the replacement runtime is ready.
Maintenance and orphan reconciliation must never interpret a provider-local recovery image as a
portable Snapshot.

## Consequences

- Existing callers retain `pause/resume`, but descriptors gain observed suspension and activity
  metadata.
- Docker can deliver compute-released same-server hibernation without claiming cross-server
  migration.
- Old terminal/native attach/preview URLs are intentionally invalid after hibernation; clients
  reconnect through the existing operation families.
- Hosted placement, quota and idle policy remain private adapters over public ports.
- A later portable recovery provider can add real registered Server migration without changing
  Sandbox identity or adding a Cloud-only Workspace model.

## Rejected Alternatives

### Treat `docker pause` as hibernation

Rejected because the container retains CPU/memory allocation and cannot satisfy the product claim
that idle workspaces release compute.

### Reuse `SandboxSnapshot` as hidden same-identity pause state

Rejected because Snapshot is an independent reusable aggregate with one-to-many restore semantics.
Hibernation recovery is subordinate, one-shot lifecycle state of the original Sandbox.

### Promise tmux or TUI process restoration

Rejected because arbitrary process memory cannot be reconstructed after compute release. Harness
native session persistence and reconnect are supported separately.

### Move hibernation into Cloud

Rejected because lifecycle, recovery capability, quota admission port and placement extension point
are neutral Execution Sandbox behavior used by Community, Cloud and third-party providers.

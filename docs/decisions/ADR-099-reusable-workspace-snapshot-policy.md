# ADR-099: Reusable Workspace Snapshot Policy

- Status: Accepted
- Date: 2026-07-26

## Context

ADR-097 separates same-Sandbox hibernation recovery from reusable `SandboxSnapshot`, and ADR-098
allows a one-shot recovery package to move across compatible providers. Neither decision defines
when reusable snapshots should be captured, how many should be retained, what happens before
termination or expiry, or how a reusable snapshot moves away from its source placement.

Agent Workspace needs a recovery point that survives ordinary compute release and planned Server
drain without claiming to preserve arbitrary PTY memory. Hosted composition may choose defaults
from organization policy, while Community and third-party compositions need the same neutral
lifecycle contract.

## Decision

### Snapshot policy is an injected lifecycle policy

Execution Sandbox accepts an optional `SandboxSnapshotLifecyclePolicy`. The policy resolves a
bounded, tenant-scoped decision for one Sandbox:

- scheduled capture interval;
- reusable snapshot TTL;
- maximum retained ready snapshots;
- pre-termination behavior: `disabled`, `best-effort`, or `required`;
- pre-expiry behavior: `disabled`, `best-effort`, or `required`.

The policy receives safe Sandbox and retained-snapshot usage facts. It does not receive provider
credentials, host paths, pricing plans, or raw Agent output. Public Appaloft includes a static
policy implementation. Hosted entitlement, quota and plan resolution remain composition adapters.

### Scheduled capture is maintenance, not a second scheduler aggregate

The existing Sandbox maintenance runner evaluates due captures. It skips non-ready Sandboxes,
Sandboxes with protected terminal sessions, and Sandboxes that already have an active capture.
A recent ready snapshot satisfies the interval regardless of whether it was manual, scheduled, or
pre-termination, avoiding redundant copies.

Maintenance reports captured, pruned and failed snapshot ids separately from Sandbox suspension,
migration and expiry results.

### Retention is exact and reusable

Snapshots record a neutral reason: `manual`, `scheduled`, or `pre-termination`. TTL expiry and
maximum-count rotation call the existing exact `sandbox-snapshots.delete` lifecycle internally.
Rotation considers only the source Sandbox and tenant, removes oldest eligible ready/failed
snapshots first, and never scans provider storage by prefix.

A retained snapshot stays one-to-many. Restoring it does not consume or delete the snapshot
package. Only explicit deletion or policy retention removes it.

### Termination and expiry have an explicit recovery gate

Before destructive provider cleanup, `required` policy must obtain or reuse a ready snapshot that
is not older than the Sandbox's last observed activity. Failure leaves the Sandbox and provider
runtime intact and returns a typed retryable error.

`best-effort` records the failed Snapshot attempt and continues cleanup. `disabled` preserves the
existing termination behavior. A retry reuses the already-fresh ready pre-termination snapshot
instead of creating duplicates.

A paused compute-released Sandbox may be resumed through its existing recovery lifecycle before a
required pre-termination capture. This reissues no user capability by itself and does not promise
PTY process restoration.

### Portable reusable snapshots declare compatibility

Snapshot capture records recovery portability and an optional recovery family. A create from a
different provider key is admitted only when:

- the snapshot is `portable`; or
- it is `provider-family` and the target declares the same snapshot recovery family.

The shared-filesystem Docker implementation writes an immutable, digest-checked package outside
the source compute allocation. Its opaque handle contains no absolute path or store credential.
Restore verifies digest, snapshot ownership and source Sandbox ownership before provisioning.
Unlike hibernation packages, reusable snapshot packages remain after successful restore.

## Consequences

- Workspaces can receive periodic and delete-time recovery points without adding a Cloud-only
  Workspace snapshot aggregate.
- A scheduled snapshot is filesystem recovery evidence, not a claim that a live Agent process or
  model stream can resume.
- Planned Server drain can restore a reusable snapshot on a compatible placement.
- Required delete protection may intentionally delay termination when durable recovery cannot be
  proven.
- Snapshot bytes continue to count as durable storage even when Sandbox compute is released.

## Rejected Alternatives

### Reuse the one-shot hibernation package as a reusable Snapshot

Rejected because it is subordinate to one Sandbox identity and must be consumed or deleted by that
Sandbox lifecycle.

### Always snapshot before every terminate

Rejected because operators need explicit cost, retention and failure policy, and some workloads do
not require delete-time recovery.

### Put schedule and retention only in Cloud

Rejected because snapshot lifecycle and exact cleanup are neutral provider/application behavior.
Cloud may choose policy values but must not own separate snapshot semantics.

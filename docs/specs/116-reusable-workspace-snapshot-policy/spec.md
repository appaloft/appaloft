# Reusable Workspace Snapshot Policy

## Status

Accepted for Code Round.

## Goal

Deliver the third fifth-stage Agent Workspace lifecycle slice: policy-driven reusable snapshots,
exact retention rotation, delete-time recovery gates, and compatible cross-provider restore without
claiming arbitrary process continuity.

## Scope

- neutral lifecycle policy and static implementation;
- scheduled capture through existing Sandbox maintenance;
- snapshot reason, TTL and per-Sandbox retained-count rotation;
- required/best-effort pre-termination and pre-expiry capture;
- portable reusable Docker snapshot packages;
- compatible cross-provider Snapshot provisioning;
- hosted policy composition over the public port.

## Out Of Scope

- preserving arbitrary PTY or process memory;
- application-consistent database backup protocols inside a Workspace;
- creating NFS/object-storage infrastructure;
- provider pricing or organization entitlement in public state;
- restoring bytes that never reached a completed snapshot or recovery package.

## Requirements

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| SNAP-POL-001 | Policy resolution | A composition installs a lifecycle policy | Sandbox maintenance or destructive cleanup evaluates it | Only bounded schedule, TTL, retention and pre-cleanup decisions enter public application behavior. |
| SNAP-POL-002 | Scheduled capture | A ready unprotected Sandbox has no fresh ready Snapshot | Its interval is due | Maintenance creates one reusable `scheduled` Snapshot and reports it. |
| SNAP-POL-003 | Capture fencing | A Snapshot capture is already active or an active terminal protects the Sandbox | Maintenance runs | No overlapping scheduled capture starts. |
| SNAP-POL-004 | Retention rotation | Retained Snapshot count or TTL exceeds policy | Maintenance runs | Exact oldest eligible Snapshot handles are deleted and unrelated Snapshots remain. |
| SNAP-POL-005 | Required pre-termination capture | Policy requires a recovery point and no Snapshot covers latest activity | Termination is requested | A ready `pre-termination` Snapshot is persisted before provider cleanup; capture failure leaves the runtime intact. |
| SNAP-POL-006 | Retry idempotency | A fresh pre-termination Snapshot already exists | Termination is retried | The existing Snapshot is reused and no duplicate capture is created. |
| SNAP-POL-007 | Best-effort cleanup | Policy is best-effort and capture fails | Termination or expiry continues | Failed Snapshot evidence remains queryable and exact runtime cleanup proceeds. |
| SNAP-POL-008 | Paused recovery gate | A compute-released Sandbox is paused and policy requires a pre-termination Snapshot | Termination is requested | Existing resume semantics recreate the runtime before capture; resume/capture failure leaves recoverable state intact. |
| SNAP-PORT-001 | Portable capture | Docker shared recovery storage is configured | Snapshot capture succeeds | An immutable digest-addressed package exists outside source compute and Snapshot records provider-family compatibility. |
| SNAP-PORT-002 | One-to-many restore | Two compatible providers share a recovery family | Multiple Sandboxes are created from one Snapshot | Every Sandbox receives the captured workspace bytes and the package remains retained. |
| SNAP-PORT-003 | Compatibility gate | Target provider is local-only or has a different family | Cross-provider create is requested | Admission fails before target provider effects. |
| SNAP-PORT-004 | Integrity gate | Package digest or ownership is invalid | Restore is attempted | Restore fails closed and the retained package is unchanged. |
| SNAP-PORT-005 | Exact deletion | A portable reusable Snapshot is deleted | Provider cleanup runs | Only its validated package and local cache are removed; unrelated packages and the store root remain. |

## Acceptance

- core/application tests cover policy decisions, capture fencing, retention and destructive gates;
- persistence tests prove reason/portability fields and per-Sandbox bounded Snapshot queries;
- Docker tests and a real Docker smoke prove retained one-to-many cross-provider restore;
- Server runner tests report capture/prune counts and protect active terminal sessions;
- hosted integration tests prove policy configuration and portable registered-Server routing;
- public descriptors expose reason and portability but no store root, Server id, host or credential.

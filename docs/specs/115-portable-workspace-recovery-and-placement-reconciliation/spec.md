# Portable Workspace Recovery And Placement Reconciliation

## Status

Accepted for Code Round.

## Goal

Deliver the second fifth-stage Agent Workspace lifecycle slice: integrity-checked recovery packages
outside source compute, successful cross-provider-family restore under one Sandbox identity, and
maintenance-driven relocation when a provider reports that its current placement must move.

## Scope

- shared recovery store identity and provider-family compatibility;
- Docker shared-filesystem recovery package capture, restore and exact cleanup;
- provider-neutral relocation observation;
- maintenance pause/resume relocation with retry-safe source retention;
- hosted placement drain composition over the public hooks.

## Out Of Scope

- restoring arbitrary process or PTY memory;
- simultaneous multi-writer Agent input;
- automatic creation or mounting of NFS/object-storage infrastructure;
- provider-specific region or placement scoring in public state;
- reusable Snapshot semantics for hibernation packages.

## Requirements

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| PORT-REC-001 | External recovery capture | A ready Docker Sandbox uses a configured shared recovery store | Pause succeeds | The live container is removed, an integrity-addressed package exists below the configured root, the local hibernation image is removed and the Sandbox records provider-family recovery. |
| PORT-REC-002 | Cross-provider restore | Two providers share format and store identity | Resume targets the second provider | The same SandboxId becomes ready on the target and workspace bytes survive. |
| PORT-REC-003 | Compatibility gate | Providers have different store ids or recovery families | Cross-provider resume is requested | Recovery fails before target effects and source recovery remains intact. |
| PORT-REC-004 | Integrity gate | A recovery package is missing, corrupt or owned by another Sandbox | Resume is attempted | Restore fails closed and no target runtime is committed ready. |
| PORT-REC-005 | Exact cleanup | A portable recovery is restored or terminated | Cleanup runs | Only the exact package derived from the validated handle is removed; the shared root and unrelated packages remain. |
| PORT-MOVE-001 | Relocation observation | A provider owns a ready runtime | It evaluates placement | It returns only a boolean relocation requirement and exposes no topology or credential. |
| PORT-MOVE-002 | Maintenance relocation | A ready Sandbox requires relocation and supports compute-released portable recovery | Maintenance runs | It pauses and resumes through the existing lifecycle, preserves SandboxId and reports the migrated Sandbox. |
| PORT-MOVE-003 | Failed cutover | Pause succeeds but target restore fails | Maintenance completes | The Sandbox remains paused with source recovery intact and the failure is reported for retry. |
| PORT-MOVE-004 | Capability reissue | Relocation succeeds | A user reconnects | Old terminal/native attach/port capabilities remain invalid and new capabilities can be issued. |
| PORT-MOVE-005 | Nested provider handle persistence | A composition wraps an opaque portable recovery handle with safe placement metadata | Pause or resume succeeds | The bounded nested handle is persisted atomically; composition overhead does not strand recovery state after source compute is released. |

## Acceptance

- application tests prove compatible success, incompatible rejection and failed-cutover retry;
- Docker adapter tests prove handle validation, digest verification and exact path cleanup;
- a real two-provider Docker smoke restores workspace bytes through one shared recovery root;
- integration tests prove an inactive placement requests relocation and the replacement binding
  points to a different active placement;
- core tests accept bounded nested provider/recovery handles while rejecting oversized values;
- no public descriptor contains store root, Server id, host, credential or signed URL.

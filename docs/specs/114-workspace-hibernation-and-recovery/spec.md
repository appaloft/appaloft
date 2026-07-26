# Workspace Hibernation And Recovery

## Status

Accepted for Code Round.

## Goal

Deliver the first truthful fifth-stage Agent Workspace lifecycle slice: compute-releasing
pause/resume on one Sandbox identity, explicit continuity metadata, idle auto-suspend, quota
admission and policy-driven provider placement, while failing closed for unsupported cross-server
migration.

## Scope

- public Sandbox lifecycle and provider capability contracts;
- same-provider compute-released hibernation and recovery;
- safe activity observation and maintenance-driven idle suspension;
- tenant-scoped admission quota port and static self-hosted policy;
- provider placement policy port;
- recovery portability metadata and migration compatibility checks;
- Docker and hermetic provider implementations;
- API/SDK/CLI/Web descriptors generated from the existing operation families.

## Out Of Scope

- billing, pricing, Cloud plan names or hosted entitlement rules;
- a second Workspace aggregate or Cloud-only lifecycle operation;
- transparent restoration of arbitrary PTY/process memory;
- a portable object-storage recovery implementation;
- automatic cross-server data transfer;
- simultaneous multi-writer Agent input;
- rebuilding vendor Agent TUIs.

## Domain Ownership

`Sandbox` remains the lifecycle aggregate. Compute-released recovery state is subordinate to that
Sandbox and is not a reusable `SandboxSnapshot`. Agent Workspace continues to be a convenience
workflow whose `workspaceId` equals `sandboxId`.

## Requirements

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| HIB-SPEC-001 | Truthful pause capability | A provider supports pause | It registers | It declares `process-frozen` or `compute-released`, never a boolean success claim with ambiguous resource continuity. |
| HIB-SPEC-002 | Same-identity hibernation | A ready Sandbox uses a compute-released provider | Pause succeeds | Status becomes paused, the active allocation is gone, recovery metadata is persisted under the same SandboxId and observed mode is returned. |
| HIB-SPEC-003 | Same-identity restore | A compute-released Sandbox is paused | Resume succeeds | The runtime is recreated with the same limits/isolation/network intent, the SandboxId is unchanged, a new provider handle may be stored and one-shot recovery state is cleaned. |
| HIB-SPEC-004 | Capability reissue | A runtime was compute-released | A caller resumes it | Old terminal/native-attach/port capabilities are invalid and the caller opens new capabilities through existing operations. |
| HIB-SPEC-005 | Process continuity truth | A caller inspects a paused Sandbox | The mode is `compute-released` | The descriptor does not promise arbitrary PTY/process restoration; only durable workspace/Agent paths are recoverable. |
| HIB-SPEC-006 | Idle observation | A successful runtime operation occurs | The operation completes | `lastActivityAt` advances without leaking command, file contents, credentials or model output. |
| HIB-SPEC-007 | Auto-suspend | A ready Sandbox without an active managed Terminal Session is older than an explicit idle threshold and its provider releases compute | Maintenance runs | It is paused and reported as suspended; protected, non-idle or process-frozen Sandboxes remain running. |
| HIB-SPEC-008 | Quota admission | A quota policy is installed | Creation would exceed a tenant limit | Creation fails before persistence and before provider effects with a typed quota conflict. |
| HIB-SPEC-009 | Placement policy | Several providers satisfy isolation/network/recovery requirements | Creation or eligible recovery is admitted | The injected policy selects from safe provider keys; host topology and credentials do not enter public state. |
| HIB-SPEC-010 | Portability gate | Paused recovery is provider-local | A different provider is requested | Recovery/migration fails before changing provider placement or deleting source recovery state. |
| HIB-SPEC-011 | Exact cleanup | A Sandbox is paused with one-shot recovery state | It terminates or expires | The provider deletes the owned recovery state and no active runtime or stale exposure remains. |
| HIB-SPEC-012 | Snapshot separation | A Sandbox hibernates and also creates reusable snapshots | Callers list/show both | Hibernation recovery is not listed as a `SandboxSnapshot`; reusable snapshot identity and retention stay unchanged. |

## V1 Product Contract

V1 supports same-registered-Server hibernation for Docker. It provides a migration compatibility
boundary but does not claim that Docker recovery images can move between registered Servers.
Portable cross-server recovery requires a later provider backed by an external recovery store.

Pi and OpenCode durable state below `/workspace` can survive compute release. The user returns to
the same Workspace, opens a new terminal or native attach capability, and lets the harness resume
its filesystem-backed session. A live terminal process itself does not survive.

## Acceptance

- stable rows in `workspace-hibernation-and-recovery-test-matrix.md` pass;
- Docker provider evidence proves the container is removed after pause and recreated after resume;
- workspace bytes survive resume under the same SandboxId;
- auto-suspend ignores process-frozen providers;
- quota denial leaves no Sandbox row or provider effect;
- provider-local recovery rejects a different provider key without deleting the source handle;
- root operation names remain `sandboxes.pause` and `sandboxes.resume`;
- public docs never claim cross-server migration for provider-local Docker recovery.

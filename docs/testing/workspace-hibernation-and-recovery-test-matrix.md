# Workspace Hibernation And Recovery Test Matrix

| ID | Layer | Scenario | Expected evidence |
| --- | --- | --- | --- |
| HIB-CORE-001 | Core | Pause records observed `process-frozen` or `compute-released` mode | Same SandboxId remains paused and descriptor state is truthful. |
| HIB-CORE-002 | Core | Runtime activity is touched monotonically | `lastActivityAt` advances and contains no operation payload. |
| HIB-APP-001 | Application | Compute-released pause returns a recovery handle | Active handle is replaced atomically by subordinate recovery metadata. |
| HIB-APP-002 | Application | Resume recreates the same Sandbox | Original limits/isolation/network intent is supplied and a new live handle is persisted. |
| HIB-APP-003 | Application | Resume fails | Sandbox remains paused and source recovery metadata is retained for retry. |
| HIB-APP-004 | Application | Idle maintenance encounters compute-released, process-frozen and active-terminal Sandboxes | Only the eligible unprotected idle Sandbox is auto-suspended. |
| HIB-APP-005 | Application | Concurrent or completed resume is retried | Retries share one provider operation and return the same ready Sandbox identity. |
| HIB-QUOTA-001 | Application | Requested limits exceed static tenant quota | Typed conflict occurs before repository save or provider provision. |
| HIB-QUOTA-002 | Application | Existing active usage plus request reaches but does not exceed quota | Creation is admitted exactly at the boundary. |
| HIB-PLACE-001 | Application | Placement policy selects one compatible provider | Persisted provider key equals the admitted selection. |
| HIB-PLACE-002 | Application | Policy returns an unknown or incompatible provider | Creation fails before persistence. |
| HIB-MIGRATE-001 | Application | Provider-local paused recovery is resumed on another provider | Typed portability conflict occurs and source recovery remains intact. |
| HIB-DOCKER-001 | Runtime adapter | Docker compute-released pause | Workspace is captured, live container and exposures are removed, and owned provider-local recovery image remains. |
| HIB-DOCKER-002 | Runtime adapter | Docker resume | Container is recreated with the same limits/policy, workspace bytes survive and one-shot recovery image is removed. |
| HIB-DOCKER-003 | Runtime adapter | Terminate a paused Docker Sandbox | Owned recovery image is removed idempotently. |
| HIB-CAP-001 | Integration | Terminal/native attach/port capability existed before hibernation | Old capability is unusable; a newly issued capability works after resume. |
| HIB-SNAPSHOT-001 | Integration | Hibernation and reusable Snapshot coexist | Hibernation recovery never appears in Snapshot list/show and Snapshot retention is unchanged. |

Portable cross-placement recovery and drain reconciliation continue in
[Portable Workspace Recovery Test Matrix](./portable-workspace-recovery-test-matrix.md).

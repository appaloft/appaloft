# Discovery: Workspace Control Recovery And Cleanup Evidence

## Status

- Round: Grill / Discovery
- Owner decision: confirmed as part of the active `R1 Appaloft Workspace Alpha` objective
- Proposed scope: public Workspace control presentation over existing Sandbox, Snapshot, Runtime
  and Preview readback plus existing Snapshot commands
- Code changes: blocked until this discovery, Spec, plan, tasks and Test Matrix are accepted

## Business Outcome

An authenticated developer can stay inside `appaloft workspace`, understand the selected
Workspace's isolation and recovery limits, create or delete an exact reusable Snapshot, observe
pause/resume recovery continuity, and verify bounded cleanup evidence after termination. The TUI
does not invent a recovery lifecycle or claim host-wide zero residue from presentation-local state.

## Existing Capabilities

- `ShowSandboxQuery` already returns requested/realized isolation, provision attempts and an
  optional suspension descriptor with mode, portability and recovery family.
- `ListSandboxSnapshotsQuery`, `CreateSandboxSnapshotCommand` and
  `DeleteSandboxSnapshotCommand` already own reusable recovery points.
- `ListSandboxAgentRuntimesQuery` and `ListSandboxPortsQuery` already expose bounded Workspace-owned
  runtime and Preview state.
- `PauseSandboxCommand`, `ResumeSandboxCommand` and runtime-first Workspace termination already own
  lifecycle mutation and exact provider cleanup.
- The Workspace control TUI refreshes lifecycle truth, but currently drops recovery fields and has
  no Snapshot action or explicit bounded cleanup summary.

## Confirmed Decisions

| Question | Decision | Rationale |
| --- | --- | --- |
| Product location | Public Appaloft | Sandbox recovery, Snapshot and Workspace-owned cleanup evidence are neutral Community capabilities. |
| Operation model | Reuse existing commands and queries only | The TUI is presentation; it must not create a recovery aggregate, provider probe or cleanup operation. |
| Entry | Add an `s` Recovery palette beside lifecycle `a` and delivery `d` | Snapshot/recovery choices remain distinct from ordinary lifecycle and external delivery. |
| Readback | Render requested/realized isolation, attempt count, suspension mode/portability/family and bounded Snapshot summaries | These are the existing safe capability and recovery facts users need before acting. |
| Snapshot list | Query the bounded global Snapshot list and retain only records whose `sourceSandboxId` exactly matches the selected Workspace | The existing query has no Sandbox filter; exact parent-side filtering avoids a new operation while preserving tenant bounds. |
| Snapshot creation | Require an explicit filesystem or filesystem+memory choice and a fixed 24-hour, 7-day or 30-day retention preset | No unbounded or silently stronger recovery point is created from the TUI. |
| Snapshot deletion | Select an exact ready/failed Snapshot from the latest detail and require confirmation | Deletion is external state mutation and dependent-create safety remains application-owned. |
| Cleanup evidence | Show active Runtime and Preview counts from existing bounded queries; after terminal Workspace status, mark cleanup `clear` only when both are zero | This is useful exact Workspace-owned evidence, but not a host-wide zero-residual proof. |
| Terminal identity | Snapshot create/delete never detaches or restarts the active Agent Session | Recovery-point management is independent of native Agent interaction. |
| Failures | Preserve stable code, phase and retryability and keep the palette recoverable | Provider bodies, host handles, credentials and Agent output remain excluded. |
| Headless parity | Existing Sandbox show/snapshot/list/delete and Workspace lifecycle commands remain canonical equivalents | TUI availability never becomes the only recovery path. |

## Candidate Journey

1. Select a Workspace and read isolation, suspension and existing Snapshot evidence.
2. Press `s`, choose an explicit recovery capability and bounded retention, then confirm creation.
3. Continue the same native Agent Session while the parent dispatches the existing Snapshot command.
4. Pause or resume through the existing lifecycle palette and inspect refreshed continuity evidence.
5. Delete an exact obsolete Snapshot only after confirmation.
6. Terminate through the existing runtime-first path and inspect terminal status plus zero active
   Runtime/Preview counts.
7. Use headless queries or provider acceptance evidence when host-wide zero residue must be proven.

## Rejected Alternatives

- Adding a TUI-owned recovery status, cleanup ledger or Snapshot database.
- Claiming host-wide zero residue from a terminal Workspace status alone.
- Calling a provider directly or exposing provider handles, SSH details or raw errors.
- Automatically creating a Snapshot on palette open, pause or TUI exit.
- Offering unbounded retention or guessing filesystem+memory support.
- Deleting every Snapshot as part of Workspace termination.

## Public/Private Boundary

Public owns the presentation protocol, existing public operation dispatch, bounded safe readback and
docs. Cloud may inject its existing authz, placement, Snapshot policy, credential custody, quota,
provider and audit ports. Public imports no Cloud package and Cloud adds no parallel recovery or
cleanup state.

## Open Questions

No question remains that changes ownership or this first implementation slice. Provider-specific
host cleanup proof and real registered-VPS zero-residual acceptance remain separate acceptance
evidence over the same public operations.

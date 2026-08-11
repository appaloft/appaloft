# Workspace Control Recovery And Cleanup Evidence

## Status

- Round: Spec
- Artifact state: proposed for public review
- Code changes: blocked until accepted and linked from a ready public Ticket
- Compatibility: additive presentation over existing public operations
- Governing decision: accepted ADR-107 presentation boundary; no new ADR is required

## Business Outcome

An authenticated developer can inspect and manage bounded Workspace recovery evidence inside
`appaloft workspace` without losing the native Agent session or mistaking presentation-local state
for provider-wide cleanup proof.

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-TUI-RECOVERY-001 | Safe recovery detail | a Workspace detail is selected | detail loads or refreshes | requested/realized isolation, provision attempts and optional suspension mode/portability/recovery family come only from `ShowSandboxQuery`. |
| WS-TUI-RECOVERY-002 | Exact Snapshot readback | tenant-visible Snapshots exist | detail loads or refreshes | a bounded `ListSandboxSnapshotsQuery` result is filtered by exact `sourceSandboxId`; only safe Snapshot id, capability, reason, portability, family, status and retention fields render. |
| WS-TUI-RECOVERY-003 | Bounded Recovery palette | selected detail is current and no mutation is busy | the user presses `s` | create plus status-valid exact delete actions render without mutation or internal-id input. |
| WS-TUI-RECOVERY-004 | Confirmed Snapshot creation | the Workspace is non-terminal | capability and fixed retention are explicitly selected and confirmed | one existing `CreateSandboxSnapshotCommand` executes with an exact expiry followed by authoritative detail readback. |
| WS-TUI-RECOVERY-005 | Confirmed Snapshot deletion | an exact Snapshot from selected detail is deletable | deletion is selected | cancel emits nothing; confirm dispatches one existing `DeleteSandboxSnapshotCommand`, and application safety checks remain authoritative. |
| WS-TUI-RECOVERY-006 | Same Agent Session | an Agent terminal is active | Snapshot create/delete succeeds or fails | Terminal Session/process identity remains unchanged and no detach/restart occurs. |
| WS-TUI-RECOVERY-007 | Bounded cleanup evidence | Runtime and Preview queries complete | detail renders | active Runtime and Preview counts are derived from the latest bounded query results; terminal Workspace status is `clear` only when both counts are zero, otherwise `residual`, and non-terminal status is `not-applicable`. |
| WS-TUI-RECOVERY-008 | No false zero-residual claim | bounded cleanup evidence is `clear` | the result is presented | copy states that this proves only Workspace-owned queried surfaces; host/provider zero residue requires external acceptance evidence. |
| WS-TUI-RECOVERY-009 | Busy/readback discipline | a recovery mutation is in flight or succeeds | input or refresh occurs | duplicate submit is blocked; success clears form state and refreshes existing authoritative queries. |
| WS-TUI-RECOVERY-010 | Structured failure | validation, authz, provider, Snapshot mutation or readback fails | the failure is presented | stable code/phase/retryability survive without credential, provider handle/body, URL query or Agent output leakage; the palette remains recoverable. |
| WS-TUI-RECOVERY-011 | Headless parity | TTY is absent, structured output is requested or a subcommand is used | recovery is inspected or managed | existing Sandbox show/snapshot and Workspace lifecycle commands remain unchanged and renderer assets are not required. |
| WS-TUI-RECOVERY-012 | Discoverability | Workspace help/docs are read | recovery controls are resolved | both locales explain `s`, bounded retention, continuity fields, cleanup evidence limits and headless equivalents at the stable Workspace control anchor. |

## Recovery Presentation Contract

- The Bun parent maps and validates every safe descriptor. The Rust renderer receives bounded DTOs
  and never imports application/domain packages.
- Snapshot list input is fixed at `limit = 100`, `offset = 0`; the parent keeps only exact matching
  `sourceSandboxId` values and never exposes records from other Workspaces.
- Create accepts `filesystem` or `filesystem-memory` and a fixed TTL of 1, 7 or 30 days. The parent
  calculates `expiresAt` from its injected clock.
- Delete targets an exact Snapshot id in the latest selected detail. Stale/absent targets fail
  before command dispatch.
- Status-valid delete actions exclude `deleting` and `deleted`; the application may still reject a
  stale action or dependent recovery source.
- Snapshot actions require explicit confirmation and keep the active Agent terminal attached.

## Cleanup Evidence Contract

- Active Runtime means a listed Runtime whose status is not `terminated`.
- Every `ListSandboxPortsQuery` item is an active Preview exposure because revoke removes the exact
  exposure from the provider/query surface.
- Terminal Workspace status means `terminated` or `expired`.
- Cleanup is `clear` only for a terminal Workspace with zero active Runtimes and zero active Preview
  exposures. It is `residual` for a terminal Workspace with either count non-zero and
  `not-applicable` otherwise.
- The TUI labels this as bounded Workspace-owned evidence. It must not claim that Docker artifacts,
  provider processes, SSH state, credentials or host files are absent.

## Public Surfaces

- Workspace control renderer message/event protocol for recovery detail, Recovery palette, bounded
  create form, confirmation, busy state and cleanup summary.
- Existing public Sandbox/Snapshot/Runtime/Port commands and queries only; no operation catalog,
  HTTP/oRPC, SDK, MCP, persistence, event or aggregate addition.
- Existing headless commands remain canonical machine-readable equivalents.

## Domain Ownership

- Sandbox owns requested/realized isolation, lifecycle, suspension and provider cleanup intent.
- SandboxSnapshot owns recovery capability, source, portability, lifecycle and retention.
- SandboxAgentRuntime and Sandbox Port queries own their exact bounded residual surfaces.
- Terminal Session/Agent adapters own native Agent process and interaction.
- The CLI adapter owns only mapping, bounded presentation and existing operation dispatch.

## Non-Goals

- New recovery, cleanup, provider-probe or zero-residual operations.
- Provider-wide cleanup attestation from the TUI.
- Automatic Snapshot creation/deletion on pause, terminate or TUI exit.
- Restore-to-new-Workspace, clone/fork or cross-provider move actions.
- Credential-grant display or revocation.
- Cloud-only recovery semantics or private TUI state.

## Compatibility And Migration

- Additive interactive behavior; existing command parsing and machine output remain unchanged.
- Renderer protocol changes ship with the matching CLI artifact and are not a public remote API.
- Existing Sandbox, Snapshot, Runtime and Port descriptors remain unchanged; presentation maps only
  existing safe fields.

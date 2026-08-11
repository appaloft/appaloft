# Discovery: Workspace Control Lifecycle Actions

## Status

- Round: Grill complete
- Owner confirmation: 2026-08-11
- Governing outcome: R1 Workspace control must manage an existing Workspace without requiring an
  internal id or leaving the TUI.
- Recommended slice: capability-derived pause, resume and terminate actions over existing public
  operations.

## Business Outcome

An authenticated developer can select an existing Workspace in `appaloft workspace`, inspect the
actions valid for its current public lifecycle state, pause or resume it, and deliberately terminate
it with an explicit confirmation. The result is immediately read back through the same public
queries used by headless CLI commands.

## Confirmed Decisions

| Question | Decision |
| --- | --- |
| Ownership | Public CLI presentation; Workspace lifecycle remains Sandbox-owned. |
| Mutation truth | Reuse `PauseSandboxCommand`, `ResumeSandboxCommand`, `TerminateSandboxAgentRuntimeCommand` and `TerminateSandboxCommand`. |
| Parity | TUI termination preserves the existing `workspace terminate` runtime-first orchestration. |
| Availability | Derive actions from the public Workspace status, never from provider or Agent names. |
| Destructive safety | Pause/resume execute after selection; terminate requires a separate explicit confirmation state. |
| Readback | Every accepted action refreshes bounded list and selected detail from public queries. |
| Failure | Keep the action palette open or recoverable and render only stable safe error metadata. |
| Scope | Lifecycle actions only. Preview creation/delivery is a later R1 slice because it requires source-artifact and approval inputs. |

## Rejected Alternatives

- Adding a TUI-only lifecycle endpoint, command or local state store.
- Calling provider adapters directly from the renderer.
- Hiding a destructive terminate behind a single key press.
- Treating an optimistic local status as lifecycle truth.
- Combining Preview/Promotion input design into this bounded slice.

## Public/Private Boundary

All behavior is neutral and public. Cloud may inject existing authorization and operation
implementations, but it owns no action semantics, renderer branch or Workspace status.


# Workspace Control Lifecycle Actions

## Status

- Round: Spec
- Artifact state: owner-confirmed discovery; awaiting public Spec acceptance
- Code changes allowed: no until this Spec is accepted and a public Ticket is ready
- Compatibility: additive presentation over existing public operations

## Business Outcome

An authenticated developer manages the selected Workspace's lifecycle from the control TUI with
the same operation truth, safety and readback as the headless Workspace commands.

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-TUI-ACTION-001 | Capability-derived palette | a Workspace detail is selected | the user opens actions | only lifecycle actions valid for its public status are shown. |
| WS-TUI-ACTION-002 | Pause | status is `ready` | pause is selected | `PauseSandboxCommand` executes once and list/detail are read back. |
| WS-TUI-ACTION-003 | Resume | status is `paused` | resume is selected | `ResumeSandboxCommand` executes once and list/detail are read back. |
| WS-TUI-ACTION-004 | Confirmed terminate | status is non-terminal | terminate is selected | no command runs until an explicit second confirmation. |
| WS-TUI-ACTION-005 | Termination parity | terminate is confirmed | orchestration runs | active Agent runtimes terminate before `TerminateSandboxCommand`, matching headless `workspace terminate`. |
| WS-TUI-ACTION-006 | Attachment safety | a live Agent terminal is attached | pause or terminate is accepted | the viewport detaches before lifecycle mutation and never invents Session state. |
| WS-TUI-ACTION-007 | Readback and selection | an action succeeds | bounded refresh completes | the list and surviving selected detail come from existing public queries; terminal Workspaces expose no further mutation. |
| WS-TUI-ACTION-008 | Structured failure | validation, authz, command or readback fails | the result is presented | stable code/phase/retryability are shown without secret, provider or Agent output leakage. |
| WS-TUI-ACTION-009 | Headless compatibility | TTY is absent or a subcommand/structured mode is used | CLI runs | existing pause/resume/terminate behavior is unchanged and renderer code is not required. |

## Public Surfaces

- TUI event/message protocol: action availability, palette navigation, execute request,
  confirmation/cancel, busy/result refresh.
- Existing operations only; no operation-catalog, API/oRPC, SDK, persistence or event additions.
- Existing headless commands remain canonical machine-readable equivalents.

## Lifecycle Availability

| Workspace status | Actions |
| --- | --- |
| `ready` | pause, terminate |
| `paused` | resume, terminate |
| `requested`, `provisioning`, `pausing`, `resuming`, `failed` | terminate |
| `terminating`, `terminated`, `expired` | none |

The application layer remains authoritative and may reject a stale action. Presentation-derived
availability is guidance, not mutation admission.

## Non-Goals

- New Workspace operations or lifecycle states.
- Preview creation, source-artifact selection, Promotion approval or deployment actions.
- Server enrollment, Workspace creation wizard or profile editing.
- Provider-specific action branches.
- TUI-owned optimistic lifecycle state.


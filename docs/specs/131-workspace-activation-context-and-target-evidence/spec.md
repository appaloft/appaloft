# Workspace Activation Context And Target Evidence

## Status

- Round: Spec complete
- Artifact state: accepted; Ticket/Code authorized
- Compatibility: additive public minor surface

## Business outcome

The same `workspaces.open` workflow can safely ensure missing public activation context and explain
which class of execution target was selected, without exposing topology or changing Workspace
lifecycle ownership.

## Acceptance criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| WS-ACT-CONTEXT-001 | Binding/default Profile is missing | Optional initializer runs once after source validation, canonical public state is re-read, and default implementation retains existing fail-closed errors. |
| WS-ACT-CONTEXT-002 | Existing or conflicting context | Active state is reused; initializer never overwrites it; conflict fails before placement. |
| WS-ACT-TARGET-003 | Placement succeeds | Reservation includes validated class/source/reason evidence with no infrastructure identity or credential. |
| WS-ACT-LOCAL-004 | Local composition | Evidence is `local/explicit` and no remote policy is consulted. |
| WS-ACT-RESUME-005 | Preferred Workspace resumes | Persisted evidence is returned unchanged and placement is not re-run. |
| WS-ACT-LEGACY-006 | Existing entry lacks evidence | Readback reports `legacy-unclassified`; it never guesses managed/BYOS/local. |
| WS-ACT-SAFE-007 | Result/error/audit is observed | Server id/host, provider handle, capacity probe and credentials are absent. |
| WS-ACT-PARITY-008 | CLI/API/SDK/TUI consume result | All surfaces use the same operation/result schema and reason vocabulary. |

## Ownership

- Project owns default Profile; Repository Binding owns repository association.
- Sandbox remains Workspace identity and lifecycle owner.
- Workspace open entry owns activation coordination and persisted safe selection evidence.
- Downstream compositions own target policy, eligibility, inventory and credentials.

## Public surfaces

- Existing `workspaces.open` result gains additive `activation` and `targetSelection` evidence.
- `appaloft code` command input remains unchanged.
- Workspace status/TUI may render class/source/reason only.
- Public Workspace docs gain activation and safe target readback guidance.

## Non-goals

- Target-policy command, managed fleet model, entitlement or billing in public core.
- Server id/provider key as target ownership.
- Automatic fallback or relocation.

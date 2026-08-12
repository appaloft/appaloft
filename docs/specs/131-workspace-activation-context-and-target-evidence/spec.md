# Workspace Activation Context And Target Evidence

## Status

- Round: Post-Implementation Sync complete; delivery PR/CI pending
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
| WS-ACT-AUDIT-009 | Workspace activation is audited | `workspaces.open` records the exact created or resumed Workspace aggregate without exposing target topology or credentials. |

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

## Error contract

- Without an initializer, missing Binding/default Profile keeps the existing
  `workspace_open_repository_not_bound` / `workspace_open_profile_required` behavior.
- Invalid initializer evidence returns `workspace_activation_context_evidence_invalid`.
- State that is still unavailable after initialization returns
  `workspace_activation_context_conflict` with the canonical re-read cause code.
- Invalid or legacy evidence on a new reservation returns
  `workspace_target_selection_evidence_invalid`; the reservation is released before returning.
- Downstream compositions own entitlement/admission errors and must emit them before their
  initializer mutates public context.

## Documentation impact

User-facing additive change. The existing bilingual anchor
`/docs/agents/workspaces/#agent-workspace-open`, SDK example, Workspace control TUI guidance,
operation spec, docs registry and traceability map are updated. Existing rows require only the
nullable migration and explicit `legacy-unclassified` readback; no user-authored migration is
required.

## Verification evidence

- Focused matrix tests pass across application, Postgres migration/repository, HTTP/oRPC, SDK,
  CLI presentation, docs registry and Rust TUI seams.
- Public lint passes with warnings only; affected package typechecks and `cargo fmt --check` pass.
- Full public build passes all 6 tasks, including 125 documentation pages in both locales and the
  Web production build.
- The local full test run reached 1302 pass / 3 skip with one unrelated architecture filesystem
  scan exceeding its fixed 5-second timeout under load. The same unchanged assertion passes alone
  with a 20-second runner timeout in 6.99 seconds. Delivery CI must still pass the canonical test
  gate before merge.

## Non-goals

- Target-policy command, managed fleet model, entitlement or billing in public core.
- Server id/provider key as target ownership.
- Automatic fallback or relocation.

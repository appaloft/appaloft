# Discovery: Workspace Code Activation

## Business Outcome

A developer in a clean, pushed Git repository can run `appaloft code` to open or resume the
configured Agent Workspace and enter the Agent's native interface without learning Workspace ids
or a resource-oriented command tree.

## Existing Evidence

- ADR-094 owns the public Agent Workspace entry workflow without a Workspace aggregate.
- ADR-103 and Spec 120 own local Git preflight, Profile-aware `workspaces.open`, create-or-resume,
  capability-driven attach, reconnect and exact cleanup.
- The CLI target resolver already selects local dispatch when no trusted remote control-plane
  target is active and uses `--control-plane-profile` for explicit remote selection.
- Pi uses managed Terminal PTY; OpenCode and compatible Agents may use native attach. Agent names do
  not select behavior.
- Public Workspace documentation already owns the stable `agent-workspace-open` help anchor.

## Owner-Confirmed Decisions

The owner confirmed the following product direction on 2026-08-10:

| Topic | Decision |
| --- | --- |
| Primary entry | Add canonical `appaloft code [path]`; keep `appaloft workspace open` and all headless subcommands. |
| Operation truth | Delegate exactly to `workspaces.open`; add no aggregate, lifecycle, API or catalog operation. |
| First target | Prove local control-plane dispatch and native Agent attach first; registered VPS and hosted composition reuse the same operation later. |
| Profile selection | Reuse explicit `--profile` or Project default Agent Workspace Profile; add no second preference store. |
| Agent UI | Preserve Pi/OpenCode/Claude Code/Codex native PTY and vendor session semantics. |
| Control TUI | Appaloft may later own an outer Workspace control TUI, but not a universal Agent chat UI. |
| Framework | Spike OpenTUI imperative first; use a separate Rust/Ratatui frontend if hard terminal or release packaging gates fail. |
| Platforms | Initial production behavior targets macOS and Linux; Windows requires separate acceptance. |

## Recommended Slice

The first Code Round should add only this actor-visible slice:

```text
clean pushed repository
  -> appaloft code [path]
  -> existing control-plane target resolution
  -> existing local Git preflight
  -> workspaces.open
  -> existing managed-terminal or native attach
  -> repeat appaloft code to reconnect
```

## Rejected Alternatives

- A new Workspace or Agent Session aggregate.
- A new API/SDK operation named after the CLI command.
- A new local Agent Profile preference file.
- TUI-owned lifecycle mutations or terminal scraping.
- Bundling `--keep-awake`, exit-triggered removal, registered VPS enrollment or a production control
  TUI into the first activation slice.

## Open Questions Resolved By Spec

- First-slice flags are `--profile`, `--new` and `--no-attach`; lifecycle flags are deferred.
- `--profile` means Agent Workspace Profile; control-plane selection remains
  `--control-plane-profile`.
- Missing Repository Binding, Project default Profile or capability returns the existing typed
  setup/recovery error; the first slice does not add an interactive setup wizard.
- No new event, persistence table, read model or public operation is required.

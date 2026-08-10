# Workspace Code Activation

## Status

- Round: Post-Implementation Sync complete
- Artifact state: implemented and verified by public Ticket [#1022](https://github.com/appaloft/appaloft/issues/1022)
- Code changes allowed: delivered through the accepted Spec and ready public Ticket
- Compatibility: additive public CLI capability; expected minor release impact

## Business Outcome

An authenticated developer with a configured Repository Binding and Agent Workspace Profile can
enter a clean, pushed local Git repository and run:

```bash
appaloft code
```

Appaloft opens or resumes the same Profile-aware Workspace governed by `workspaces.open`, enters the
Agent-owned interface when attach is supported, and preserves exact reconnect, error and cleanup
semantics without exposing internal ids or credentials.

## Ubiquitous Language

| Term | Meaning | Compatibility |
| --- | --- | --- |
| Workspace Code Activation | Task-oriented CLI presentation that resolves local repository context and dispatches `workspaces.open`. | New canonical task entry. |
| Agent Workspace | Existing public workflow whose identity and lifecycle remain the underlying Sandbox. | Unchanged. |
| Agent Workspace Profile | Existing installed Profile selected explicitly or through the Project default. | `--profile` keeps existing meaning. |
| Control-Plane Target | Existing local, self-hosted or Cloud CLI dispatch target. | Selected by existing resolver and `--control-plane-profile`. |
| Native Agent Interface | Agent-owned managed-terminal TUI or declared native attach client. | Unchanged; never parsed into Appaloft conversation state. |
| Workspace Control TUI | Future Appaloft-owned presentation over public operations and native Agent PTY. | Deferred; no production behavior in this slice. |

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-CODE-CLI-001 | Canonical activation command | The current directory is a Git worktree | `appaloft code` runs | Path defaults to `.`, and the CLI enters Workspace Code Activation without requiring an internal id. |
| WS-CODE-PARITY-002 | Exact workflow delegation | A path and equivalent Profile/new/attach choices are supplied | `appaloft code` dispatches | It constructs the same local Git context and `workspaces.open` input as `appaloft workspace open`; no new business operation or client-side lifecycle composition exists. |
| WS-CODE-LOCAL-003 | Local-direct target | No trusted remote profile, URL, token or adoption marker is selected | activation resolves its target | Existing control-plane resolution chooses local dispatch without remote handshake, SSH state sync or implicit target registration. |
| WS-CODE-PREFLIGHT-004 | Preserve source safety | The worktree is dirty, detached, missing/mismatched upstream or not pushed | activation runs | Existing Git preflight fails before business mutation with the same typed error and safe recovery guidance. |
| WS-CODE-PROFILE-005 | Preserve Profile truth | An explicit Agent Workspace Profile or Project default exists | activation preflights | Existing exact enabled Profile resolution is used; missing, ambiguous, stale, disabled or unauthorized state fails before Sandbox effects; no second preference store is written. |
| WS-CODE-ATTACH-006 | Enter native Agent interface | The resolved Adapter supports managed-terminal or approved native attach | activation succeeds | The CLI uses the existing capability-derived handoff and enters the Agent-owned PTY/client without name branching or terminal scraping. |
| WS-CODE-RESUME-007 | Reconnect idempotently | A matching preferred Workspace and attach session exist | `appaloft code` runs again | Existing `workspaces.open` coordination resumes the same Workspace/Runtime and bounded Terminal replay; no duplicate Sandbox is created. |
| WS-CODE-OPTIONS-008 | Preserve first-slice options | The developer supplies `--profile`, `--new` or `--no-attach` | activation runs | Each option has exactly the existing `workspace open` meaning; unsupported combinations fail before mutation. |
| WS-CODE-ERROR-009 | Preserve structured evidence | Pre-effect or post-identity failure occurs | activation returns | Existing error code, category, phase, retryability, ids and recovery/terminate evidence pass through without secret, raw host or credential disclosure. |
| WS-CODE-COMPAT-010 | Keep scriptable Workspace CLI | Existing users or automation call `appaloft workspace open` or another Workspace subcommand | the new entry ships | Existing commands, options and machine-readable behavior remain supported without warning or semantic change. |
| WS-CODE-PACKAGE-011 | Ship through supported CLI artifacts | The CLI release is built for supported macOS/Linux targets | the artifact is executed | `appaloft code --help` and a no-mutation validation path start from the packaged artifact without runtime composition for help. |
| WS-CODE-DOCS-012 | Public help is discoverable | A developer reads CLI or Workspace help | the new command is documented | The existing localized `agent-workspace-open` anchor explains `appaloft code`, its compatibility command, prerequisites, options and safe failure guidance. |

## Public Surfaces

- CLI: add `appaloft code [path] [--profile <name-or-id>] [--new] [--no-attach]`.
- API/oRPC: no new route or schema; `workspaces.open` remains canonical.
- SDK: no new method; `appaloft.workspaces.open(...)` remains canonical.
- Web/Console: no new behavior in this slice.
- Config/persistence: no new field, preference file, table or migration.
- Events/read models: no new event or read model.
- Future tool/MCP: use `workspaces.open`; do not mirror the CLI presentation name as an operation.
- Public docs/help: reuse `/docs/agents/workspaces/#agent-workspace-open` and its English locale.

## Domain Ownership

- Bounded context: existing Workspace application workflow over Sandbox and Agent Runtime.
- Lifecycle owner: Sandbox; `workspaceId` remains exactly `sandboxId`.
- Runtime and attach owner: SandboxAgentRuntime plus Terminal Session/native attach capability.
- CLI presentation owner: CLI adapter; it may inspect local Git but owns no business lifecycle.
- Downstream hosted composition: may inject authz, placement, credential custody and gateway behavior
  through existing ports without changing this public contract.

## Non-Goals

- New Workspace, Session, Server, Host or Machine aggregates.
- New API, SDK, MCP or operation-catalog entry named `code`.
- Interactive Repository Binding/Profile/Server enrollment wizard.
- `--keep-awake`, `--rm` or other lifecycle-policy shortcuts.
- Production Workspace control TUI.
- Universal Agent conversation UI, terminal-output parsing or hidden-reasoning interpretation.
- Windows support in the first production slice.

## Deferred Gaps

- Registered VPS and hosted target acceptance reuse this command after the local-direct slice.
- The control TUI requires the framework spike in `research.md` and a separate behavior Spec before
  production implementation.
- Lifecycle shortcuts require their own acceptance and cleanup semantics.

## Open Questions

No question remains that changes first-slice ownership, command shape, lifecycle or persistence.
The local-direct slice is implemented; registered VPS acceptance and a future control TUI remain
separate behavior rounds.

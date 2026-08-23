# Occupancy Agent Identity

## Status

- Round: Spec
- Discovery: [discovery.md](./discovery.md)
- Governing decision: [ADR-125](../../decisions/ADR-125-occupancy-agent-and-project-binding.md)
- Compatibility: public minor. Existing `repo@sha` display names remain valid
  selectors until those Sandboxes are replaced. New occupy does not create them.

## Requirements

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-AGENT-NAME-001 | Git occupy persists a kebab Agent name | logged in + Server + git origin | `workspaces.open` / `code --no-attach` creates a Sandbox | `SandboxDisplayName` is adjective-noun kebab, not `repo@sha`. Occupancy still records `repositoryIdentity` + `commitSha`. |
| WS-AGENT-NAME-002 | Folder occupy may keep the directory name | `folder.local/cwd/<dir>` | create | display name may be that directory. |
| WS-AGENT-NAME-003 | Explicit name wins | caller supplies a valid `name` | create | that name is stored. |
| WS-AGENT-BANNER-004 | Banner leads with the Agent | occupy succeeds | attach or `--no-attach` | stdout has `Remote · agent <name> · <repositoryIdentity>@<sha> · <server>` and may append ` · <projectId>`. It does not say `my sandbox`. |
| WS-AGENT-BIND-005 | Binding rebinds the default Project | identity already bound to Project A | `repository-bindings.bind` to Project B | default Binding now points at B; no `repository_binding_project_conflict`. |
| WS-AGENT-EXIT-006 | Session end is not destroy | TTY `code` disconnects | process exits | Agent Sandbox remains non-terminal. Pause/terminate stay explicit. |

## Non-goals

- Railway `ca` home (prompt, New Session, Target Project picker).
- Many active Binding rows per identity.
- Moving Resource source persistence in this slice.
- Renaming the `workspace` command.

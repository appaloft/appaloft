# ADR-127: Occupancy Agent Is First-Class Identity

Status: Accepted

Date: 2026-08-24

## Context

ADR-094 made `Agent Workspace` a workflow over `Sandbox` and refused a second
lifecycle aggregate. ADR-125 then said the user-facing occupancy object is an
**Agent**, while storage identity remains `sandboxId`. That left two languages
on one id: engineers say Sandbox, the TUI says Cloud Agent.

Owner review (2026-08-24) rejected that collapse. A Sandbox is the isolated
execution environment (disk, isolation, pause/resume/terminate). An Agent is
what a person names, lists, reopens, and talks about. Inventing a kebab name
in the CLI from `cwd + harness` is not an Agent.

## Decision

1. **Agent** is the first-class user-facing occupancy identity. CLI/TUI/help
   say `agent <display-name>`. They do not say the Agent *is* the Sandbox.
2. **Sandbox** is the Agent's current execution environment. Pause, resume,
   terminate, files, and ports stay Sandbox operations. The Agent points at
   one current `sandboxId`; it does not grow a parallel lifecycle.
3. Occupy persists an `OccupancyAgent` (`agt_*`) plus the kebab
   `SandboxDisplayName`. Resume reuses that Agent id and name and may retarget
   `sandboxId`. `--new` retires the previous Agent and creates a new `agt_*`.
4. Before occupy returns, chrome may say `Waking the agent` without a handle.
   After occupy succeeds, chrome uses `WorkspaceOpenResult.name` and may show
   `agentId`.
5. CLI must not hash folder paths or harness keys to invent a name. The
   persisted occupy name *is* the Agent handle.
6. ADR-094 still forbids a Cloud-only Workspace aggregate and a second
   pause/terminate state machine. ADR-125 language (`agent <name>` on the
   banner) stands. This ADR supersedes the reading that "Agent = Sandbox".

## Consequences

- Occupy progress and connecting steps use `WorkspaceOpenResult.name`.
- Local `occupancyAgentDisplayName({ folder, harness })` is deleted.
- Spec 146 keeps WS-AGENT-NAME-001–003 and adds WS-AGENT-ID-008–010:
  occupy creates `agt_*`, resume retargets the same Agent, `--new` allocates
  a new Agent. CLI does not invent a fourth generator.

## Rejected Alternatives

- Keeping CLI-hashed names as "stable enough".
- Adding `agt_*` plus Sandbox pause/terminate on the same ticket.
- Renaming the Sandbox aggregate to Agent.

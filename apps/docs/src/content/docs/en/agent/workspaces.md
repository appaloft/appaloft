---
title: "Agent Workspace"
description: "Create, reconnect to, and preview a Pi or OpenCode remote development environment through one public entrypoint."
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["remote development", "OpenCode", "Pi", "workspace"]
relatedOperations: [sandboxes.create, sandboxes.agents.harnesses.list, sandboxes.agents.runtimes.create, sandboxes.agents.runtimes.attach, sandboxes.agent-tasks.create, terminal-sessions.open, sandbox-ports.expose]
sidebar: { label: "Agent Workspace", order: 0 }
---

> Maturity: **Public alpha**. The Workspace CLI, SDK, and underlying operations belong to Public
> Appaloft. Concrete Sandbox providers, templates, gateways, and public URL support depend on the
> deployment configuration.

# Create an Agent Workspace [#agent-workspace]

Agent Workspace is a public workflow, not a Cloud-only resource. It composes one Sandbox and one Pi
or OpenCode Runtime. The `workspaceId` is the `sandboxId`, so there is no second lifecycle or
database record.

```bash
appaloft workspace create \
  --harness opencode \
  --sandbox-template sbt_opencode \
  --repo https://github.com/acme/web.git \
  --branch feature/login \
  --isolation gvisor \
  --cpu-millis 2000 \
  --memory-bytes 2147483648 \
  --disk-bytes 10737418240 \
  --max-processes 128
```

Use `--harness pi` for Pi. The default harness templates are
`aht_opencode_managed_v1` and `aht_pi_managed_v1`; an operator must register matching pinned-version
Sandbox templates in the runtime.

`appaloft workspace harness list` returns the adapters actually registered by the deployment,
including admitted Sandbox Template, interaction, session recovery, persistent paths, healthcheck,
and task capabilities. The Console creation flow reads this public catalog instead of branching on
agent names.

The SDK exposes the same convenience composition:

```ts
const workspace = await appaloft.workspaces.create({
  sandbox: sandboxInput,
  harness: "opencode",
});

console.log(workspace.workspaceId, workspace.agent.runtimeId);
```

If Runtime creation fails after the Sandbox is ready, the SDK throws
`AppaloftWorkspaceCreateError` with the created `workspaceId`/`sandboxId`. The caller can retry
Runtime creation or explicitly terminate that Sandbox.

## Reconnect after disconnecting

```bash
appaloft workspace connect <workspaceId>
appaloft workspace connect <workspaceId> --session-id <terminalSessionId>
```

Appaloft owns the Terminal Session PTY. A client disconnect only detaches. While the Session TTL and
Sandbox remain active, reconnecting with the same `terminalSessionId` replays bounded output and
resumes the same process. Reopening the Workspace detail in Console also discovers and reconnects the
latest active Sandbox Session. A template may include tmux, but Appaloft does not require it for
Workspace reconnection.

An OpenCode Runtime starts `opencode serve` inside the Sandbox provider's private network namespace
without publishing a host port and places HOME/XDG data below `/workspace`, so OpenCode session data
follows the persistent Workspace filesystem. Native remote attach requires an authenticated,
scoped gateway supplied by the deployment. Do not publish the OpenCode server port directly.

```bash
appaloft workspace attach <workspaceId>
```

This command refreshes the remote OpenCode server and model capability, issues a revocable private
access descriptor for at most one hour and returns the local `opencode attach` handoff. Providers
without a secure gateway report attach as unavailable.

## Temporary development preview

```bash
appaloft workspace preview <workspaceId> \
  --port 3000 \
  --visibility private \
  --expires-at 2026-07-24T12:00:00.000Z
```

This dispatches the public Sandbox Port operation. URL, TLS, auth, and routing are provider/gateway
adapter responsibilities. The address must stop working when the exposure expires, is revoked, or
the Sandbox is cleaned up. This is a live development preview, not an immutable Promotion Candidate
Preview.

Different team members use different Sandboxes, so files, processes, Terminal Sessions, and port
exposures have independent identities. Both can listen on internal port 3000 without colliding.

## Lifecycle

```bash
appaloft workspace list
appaloft workspace show <workspaceId>
appaloft workspace pause <workspaceId>
appaloft workspace resume <workspaceId>
appaloft workspace terminate <workspaceId>
```

`workspace list` is a composed Sandbox inventory view. Every item includes `agentRuntimes`; an empty
array identifies a partial Workspace that can be retried or cleaned up, not hidden state in a second
Workspace table.

Pause/resume preserves the Sandbox identity. Terminate removes the Sandbox and its owned runtime
state. `workspace create --repo/--ref/--branch` can materialize Git source through an argv-safe
workflow. A failure returns the already-created Workspace identity for retry or cleanup. This
entrypoint currently accepts only HTTPS locators without a username, password, or token. Credentials
for a private repository must come from a trusted deployment source integration or template and
must never be embedded in the URL.

## Run, review, and deliver a task

```bash
appaloft workspace task run <workspaceId> \
  --runtime-id <runtimeId> \
  --task "Fix issue #123 and run tests" \
  --check-arg bun \
  --check-arg test

appaloft workspace task show <workspaceId> <taskRunId>
appaloft workspace task resume <workspaceId> <taskRunId>
appaloft workspace task approve <workspaceId> <taskRunId>
appaloft workspace task deliver <workspaceId> <taskRunId> \
  --branch fix/issue-123 \
  --commit-message "fix: resolve issue 123" \
  --pull-request-title "Fix issue 123"
```

The server persists and resumes Task Runs. Disconnecting does not cancel the agent. Finalization
runs explicit argv checks, stores bounded and redacted Git status/stat/patch, and can start a
Development Preview or create an immutable Source Artifact/Candidate Preview. Approval and source
delivery require an external user or trusted CLI actor; a Sandbox runtime identity cannot approve
itself. The server resolves GitHub delivery credentials through integration auth and injects them
only through bounded stdin to the Git/GitHub CLI child process; they never enter Task state, argv, or
logs.

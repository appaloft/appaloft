---
title: "Agent Workspace"
description: "Create, reconnect to, and preview a Pi or OpenCode remote development environment through one public entrypoint."
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["remote development", "OpenCode", "Pi", "workspace"]
relatedOperations: [sandboxes.create, sandboxes.agents.runtimes.create, terminal-sessions.open, sandbox-ports.expose]
sidebar: { label: "Agent Workspace", order: 0 }
---

> Maturity: **Public alpha**. The Workspace CLI, SDK, and underlying operations belong to Public
> Appaloft. Concrete Sandbox providers, templates, gateways, and public URL support depend on the
> deployment configuration.

# Create an Agent Workspace

Agent Workspace is a public workflow, not a Cloud-only resource. It composes one Sandbox and one Pi
or OpenCode Runtime. The `workspaceId` is the `sandboxId`, so there is no second lifecycle or
database record.

```bash
appaloft workspace create \
  --harness opencode \
  --sandbox-template sbt_opencode \
  --isolation gvisor \
  --cpu-millis 2000 \
  --memory-bytes 2147483648 \
  --disk-bytes 10737418240 \
  --max-processes 128
```

Use `--harness pi` for Pi. The default harness templates are
`aht_opencode_managed_v1` and `aht_pi_managed_v1`; an operator must register matching pinned-version
Sandbox templates in the runtime.

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
appaloft workspace terminal <workspaceId> --attach
```

Appaloft owns the Terminal Session PTY. A client disconnect only detaches. While the Session TTL and
Sandbox remain active, a later attach replays bounded output and resumes the same process. A template
may include tmux, but Appaloft does not require it for Workspace reconnection.

An OpenCode Runtime starts a loopback-only `opencode serve` process inside the Sandbox and places
HOME/XDG data below `/workspace`, so OpenCode session data follows the persistent Workspace
filesystem. Native remote attach requires an authenticated, scoped gateway supplied by the
deployment. Do not publish the OpenCode server port directly.

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
state. Git clone/source materialization is not hidden inside Workspace create yet; the first version
requires a template or caller to prepare `/workspace` explicitly.

---
title: "Manage Agent Adapters"
description: "Validate, install, and manage tenant-isolated declarative Agent Adapters."
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["Agent Adapter", "adapter manifest", "Codex", "OpenCode", "Pi"]
relatedOperations: [agent-adapters.validate, agent-adapters.install, agent-adapters.list, agent-adapters.show, agent-adapters.disable, agent-adapters.uninstall]
sidebar: { label: "Agent Adapters", order: 1 }
---

# Manage Agent Adapters [#agent-adapter-installations]

An Agent Adapter is a declarative, immutable Agent integration definition. It describes the required
Sandbox template, runtimes, capabilities, interaction modes, persistent paths, and credential types.
Appaloft does not load code from a manifest and does not accept shell command strings.

Each installation belongs to the current organization. Two organizations can install the same
definition digest without seeing or operating each other's installation. Organization members can
read installations; organization administrators can validate, install, disable, and uninstall them.

## Prepare a manifest

This manifest shows a minimal Codex terminal/headless adapter. Replace the template id, version,
digest, and runtime version range with values admitted by the current Appaloft instance.

```json
{
  "schemaVersion": "appaloft.agent-adapter/v1",
  "id": "codex",
  "displayName": "Codex",
  "version": "1.0.0",
  "kind": "declarative",
  "requirements": {
    "adapterApi": "^1.0.0",
    "sandboxTemplate": {
      "id": "agent-workspace",
      "version": "^1.0.0",
      "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    },
    "runtimes": [{ "id": "codex", "version": "^1.0.0" }],
    "capabilities": {
      "required": ["managed-terminal", "headless"],
      "optional": []
    }
  },
  "interactionModes": [
    {
      "id": "terminal",
      "transport": "terminal",
      "command": ["codex"],
      "eventFidelity": "raw-pty",
      "sessionRecovery": "process-lifetime"
    },
    {
      "id": "headless",
      "transport": "headless",
      "command": ["codex", "exec"],
      "taskInput": "append-argument",
      "eventFidelity": "line-events",
      "sessionRecovery": "managed-run-lineage"
    }
  ],
  "persistentPaths": ["/workspace/.codex"],
  "healthcheck": { "kind": "process" },
  "credentials": []
}
```

Validation returns the canonical digest and compatibility result without persisting data or starting
an Agent:

```bash
appaloft agent-adapter validate ./codex.agent-adapter.json
appaloft agent-adapter install ./codex.agent-adapter.json
appaloft agent-adapter list
appaloft agent-adapter show <installation-id>
```

You can also paste, validate, and install a manifest from “Organization settings → Agent Adapters”
in the Web Console.

## Disable and uninstall

Disabling blocks new Workspaces from resolving the installation while preserving recovery references
held by existing Workspaces:

```bash
appaloft agent-adapter disable <installation-id>
```

Uninstall succeeds only when there are no active Workspace references. The server returns a conflict
and keeps the installation when references remain:

```bash
appaloft agent-adapter uninstall <installation-id>
```

Uninstall removes only the current organization's installation. It does not delete an immutable
definition shared by another organization or terminate existing Sandbox or Agent processes.

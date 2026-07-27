---
title: "Manage Agent Adapters"
description: "Validate, install, and manage tenant-isolated Agent Adapters and Workspace Profiles."
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["Agent Adapter", "adapter manifest", "Codex", "OpenCode", "Pi"]
relatedOperations: [agent-adapters.validate, agent-adapters.install, agent-adapters.list, agent-adapters.show, agent-adapters.disable, agent-adapters.uninstall, agent-workspace-profiles.validate, agent-workspace-profiles.install, agent-workspace-profiles.list, agent-workspace-profiles.show, agent-workspace-profiles.compile, agent-workspace-profiles.disable, agent-workspace-profiles.uninstall]
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

## Install a Workspace Profile

A Workspace Profile composes one exact Adapter definition, Sandbox template, runtime limits,
initialization commands, default ports, and suggested checks into a reusable entry point. It never
runs an installer during validation and does not introduce another Workspace aggregate. Before
Workspace creation, Appaloft compiles the Profile and pins the resolved Adapter digest, Sandbox
template digest, Harness, and capability snapshot to the Runtime.

```json
{
  "schemaVersion": "appaloft.agent-workspace-profile/v1",
  "id": "codex-standard",
  "displayName": "Codex Standard",
  "version": "1.0.0",
  "adapter": {
    "id": "codex",
    "version": "1.0.0",
    "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "interactiveModeId": "terminal",
    "taskModeId": "headless"
  },
  "harnessTemplateId": "aht_codex_declarative_v1",
  "sandbox": {
    "template": {
      "id": "agent-workspace",
      "version": "1.0.0",
      "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    },
    "requestedIsolation": "container-trusted",
    "limits": {
      "cpuMillis": 2000,
      "memoryBytes": 4294967296,
      "diskBytes": 21474836480,
      "maxProcesses": 128
    },
    "networkPolicy": { "mode": "deny" }
  },
  "workingDirectory": "/workspace",
  "initialization": [{ "id": "verify-codex", "argv": ["codex", "--version"] }],
  "defaultPorts": [],
  "persistentPaths": ["/workspace/.codex"],
  "suggestedChecks": []
}
```

```bash
appaloft agent-workspace-profile validate ./codex.profile.json
appaloft agent-workspace-profile install ./codex.profile.json
appaloft agent-workspace-profile list
appaloft agent-workspace-profile compile <installation-id>
```

Organization administrators can perform the same lifecycle actions in “Organization settings →
Workspace Profiles.” Developers select an enabled Profile on the Workspaces page before creating a
Workspace. Unavailable capabilities keep the affected control disabled instead of silently
degrading after creation.

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

Workspace Profiles use the same disable and active-reference fencing semantics:

```bash
appaloft agent-workspace-profile disable <installation-id>
appaloft agent-workspace-profile uninstall <installation-id>
```

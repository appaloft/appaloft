# Discovery: Agent Adapter SDK And Workspace Profiles

## Existing Evidence

- `SandboxAgentHarness` is an in-process TypeScript execution port.
- Pi and OpenCode are registered by composition and already expose neutral capability descriptors.
- Sandbox Template, Workspace/Task/Collaboration, Terminal, Port, hibernation, recovery, and
  reusable Snapshot contracts already exist.
- There is no distributable manifest, compatibility validator, installation model, Profile, or
  third-party conformance suite.

## Owner-Confirmed Decisions

| Topic | Decision |
| --- | --- |
| V1 promise | Public Adapter SDK plus Agent Workspace Profile; provider ecosystems follow later. |
| Trust | Declarative manifests are remotely installable; Trusted Code Adapters load only at instance deployment. |
| Distribution | Canonical JSON manifest is local-first and package-neutral; npm is only an initial carrier. |
| Compatibility | Schema major, Adapter API semver, template/runtime requirements, and capabilities negotiate explicitly and fail closed. |
| Profile | `AgentWorkspaceProfile` composes existing operations and is not an aggregate. |
| Credentials | Requirement/reference/grant only; no plaintext in durable or observable surfaces. |
| Interaction | The agent owns its TUI; Appaloft derives entrypoints from capabilities. |
| Events | Raw PTY, bounded stdout/stderr, or validated structured events only. |
| Tenancy | Definitions are digest-addressed; installations are tenant-scoped. |
| Acceptance | Codex CLI is the first external Adapter; deterministic fixtures remain the CI authority. |
| Non-goals | Marketplace, uploaded control-plane code, provider SDK ecosystem, billing, and auto-update. |

The owner confirmed shared understanding on 2026-07-26 and authorized Spec, tickets, and Code.

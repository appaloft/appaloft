# ADR-100: Agent Adapter Distribution And Workspace Profile Boundary

Status: Accepted

Date: 2026-07-26

## Context

Appaloft already runs Pi and OpenCode through the in-process `SandboxAgentHarness` port and exposes
harness capabilities through the public catalog. Third-party authors cannot yet distribute,
validate, install, version, or safely compose an agent integration. Treating arbitrary uploaded
JavaScript as a plugin would grant control-plane code execution. Creating a new Workspace Template
aggregate would duplicate Sandbox lifecycle and conflict with existing Sandbox Template and
Blueprint language.

## Decision

1. `Agent Adapter` is the distributable integration layer. `SandboxAgentHarness` remains the
   runtime execution port. Installing an Adapter resolves one or more Harnesses without renaming
   existing Runtime records or operation families.
2. The canonical portable manifest is `appaloft.agent-adapter/v1`. It declares identity, version,
   Adapter API semver range, interaction modes, capabilities, Sandbox Template/runtime
   requirements, command specifications, persistent paths, health checks, event fidelity, and
   credential requirements.
3. A Declarative Adapter may execute only validated argv-based commands inside the selected
   Sandbox. It cannot contain a control-plane module entrypoint.
4. A Trusted Code Adapter may implement the TypeScript Harness SDK, but only instance operators may
   load it at deployment composition time. Remote public operations never download or execute code.
5. `appaloft.agent-workspace-profile/v1` is a portable composition document, not an aggregate. It
   references exact Adapter and Sandbox Template versions/digests and may declare a working
   directory, repository preparation, initialization, default ports, persistent paths, and
   suggested checks. It compiles into existing Sandbox/Runtime/Terminal/Port operations.
6. Definitions are immutable and digest-addressed. Tenant-scoped installations own approval,
   enabled state, and availability. A Workspace records the resolved definition digest,
   installation id, Harness key, and capability snapshot.
7. Adapter/Profile installation lifecycle is public and neutral. V1 operations cover validate,
   install, list, show, disable, and safe uninstall. Active references prevent destructive
   uninstall; disabling prevents new use without terminating existing Workspaces.
8. Manifest schema major, Adapter API range, required capabilities, runtime versions, and template
   digests are checked explicitly. Unsupported required behavior fails closed; missing optional
   behavior only removes the corresponding client affordance.
9. Adapter credentials use requirement/reference/grant semantics. Secret values do not enter
   manifests, argv, logs, snapshots, Task state, events, or audit payloads.
10. Appaloft exposes capability-derived Terminal, Background Task, Native Attach, and Headless
    entrypoints. It does not implement a vendor-neutral TUI or infer structured progress from
    arbitrary terminal output.
11. Event fidelity is explicit: raw PTY bytes, bounded/redacted stdout/stderr, or schema-validated
    structured events.

## Consequences

- Pi and OpenCode remain trusted reference adapters without becoming domain types.
- Codex CLI can prove third-party declarative compatibility while using its own TUI.
- npm may be the first package transport, but manifests and domain contracts remain package-neutral
  and local-first.
- Cloud and Enterprise can add approval, tenant policy, audit, curated availability, and credential
  brokerage without changing the public schema or lifecycle.
- Marketplace, automatic updates, uploaded control-plane code, multi-language Trusted Code SDKs,
  and MCP/Secret/Preview/Git/Server Provider SDKs are later slices.

## Verification

Governed by
[Agent Adapter SDK And Workspace Profiles Test Matrix](../testing/agent-adapter-sdk-and-workspace-profile-test-matrix.md).

## Profile-Aware Open Extension

[ADR-102](./ADR-102-profile-aware-workspace-open-and-attach.md) assigns named Credential Connection
references to tenant Profile installation configuration and makes attach selection depend on the
pinned Adapter capability snapshot. It does not move tenant data or credentials into portable
definitions.

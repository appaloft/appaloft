# Agent Adapter SDK And Workspace Profiles

## Status

Accepted for Code Round.

## Goal

Let an Adapter author package and validate a CLI/TUI agent integration, let an instance or tenant
administrator install and approve its declarative definition, and let a developer create an Agent
Workspace from a version-pinned Profile without granting uploaded code control-plane execution.

## Requirements

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| ADAPTER-MANIFEST-001 | Canonical manifest | An author supplies `appaloft.agent-adapter/v1` JSON | It is validated | A normalized definition and stable digest are returned without executing commands or modules. |
| ADAPTER-MANIFEST-002 | Compatibility gate | Schema/API/runtime/template requirements are unsupported | Validation or install runs | A typed failure occurs before registry or Sandbox effects. |
| ADAPTER-TRUST-003 | Declarative trust boundary | A remote manifest declares code entrypoints or unbounded execution | Install runs | It is rejected; only bounded argv inside Sandbox is accepted. |
| ADAPTER-CAP-004 | Capability negotiation | Required and optional capabilities are declared | A client resolves the Adapter | Required gaps fail closed; optional gaps remove only unsupported affordances. |
| ADAPTER-EVENT-005 | Event fidelity | A mode declares terminal, line, or structured events | Output is observed | Raw PTY is not parsed; lines are bounded/redacted; structured events require schema validation. |
| ADAPTER-CRED-006 | Credential requirements | An Adapter needs model or forge access | A Profile/Workspace binds requirement ids to secret references | Every required requirement resolves exactly once; unknown, duplicate, raw-value and ambiguous stdin bindings fail closed, and only reference/grant metadata crosses the boundary. |
| ADAPTER-INSTALL-007 | Tenant installation | A valid definition is installed | list/show resolves current tenant | Immutable definition metadata and tenant installation state are returned without cross-tenant leakage. |
| ADAPTER-DISABLE-008 | Safe disable/uninstall | Existing Workspaces reference an installation | Admin disables or uninstalls | Disable blocks new use; uninstall fails until active references clear. |
| PROFILE-MANIFEST-009 | Canonical Profile | An author supplies `appaloft.agent-workspace-profile/v1` | It is validated | Exact Adapter/Template references and bounded setup/defaults compile without creating an aggregate. |
| PROFILE-PIN-010 | Resolved Workspace snapshot | An approved Profile creates a Workspace | Definitions later change | The Workspace continues with its pinned digest, Harness key, and capability snapshot. |
| ADAPTER-SURFACE-011 | Public entrypoint parity | Definitions/installations are managed | CLI/API/SDK/Web/MCP metadata are generated | All active operations use the same command/query schemas and tenant context. |
| ADAPTER-CODEX-012 | External compatibility | Codex declarative Adapter/Profile pass conformance | An opt-in runtime smoke runs | Codex uses its own TUI/headless mode through existing Workspace lifecycle and exact cleanup. |
| ADAPTER-RUNTIME-013 | Runtime startup acceptance | A declarative Adapter declares a bounded `start` argv and process or HTTP healthcheck | Runtime creation runs | The exact start child launches through the scoped credential grant, the Runtime becomes ready only after the child and declared healthcheck are ready, and a failed or unhealthy child is terminated and revoked without a ready Runtime or marker. |
| ADAPTER-NATIVE-014 | Native attach server contract | An Adapter declares a native-attach interaction | Manifest validation or Profile compilation runs | A bounded Runtime start command and HTTP healthcheck matching the exact attach server port are required before Sandbox effects; absent or inconsistent declarations fail closed. |

## Non-goals

- a public Adapter marketplace, ratings, monetization, or automatic updates;
- remote installation of Trusted Code Adapter modules;
- a universal Appaloft Agent TUI;
- heuristic parsing of arbitrary TUI output;
- Python/Go Trusted Code SDKs;
- third-party MCP, Secret, Preview, Git, or Server Provider SDKs;
- vendor-specific Workspace aggregates or operation families.

## Compatibility

Existing Pi/OpenCode Harness registrations, Runtime records, `harnessKey`, catalog queries, and
Workspace/Task/Collaboration operations remain valid. Adapter is additive distribution language
over the existing Harness port.

The optional declarative `start` field is an additive V1 manifest capability. Existing terminal
and headless Adapters without a long-running Runtime remain valid. Previously accepted
native-attach manifests without a start command were nonfunctional; they now fail validation until
the missing bounded start and matching HTTP healthcheck are declared.

[Spec 120](../120-profile-aware-workspace-open-and-attach/spec.md) adds installation-owned named
Credential Connection mappings, exact Profile selector resolution, Project defaults, immutable
creation pins and capability-driven auto attach. Portable Profile definitions remain tenant- and
secret-free.

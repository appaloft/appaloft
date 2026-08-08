# Discovery: Remote MCP Access For Agent Workspaces

## Outcome

An Adapter author declares the remote tools an Agent needs, an administrator binds an installed
Workspace Profile to a named remote MCP connection, and a developer opens the Workspace. The Agent
uses its own native client against a short-lived Appaloft gateway capability; no upstream endpoint or
credential enters the manifest, Runtime arguments, logs, snapshots, or public domain state.

## Confirmed decisions

| Topic | Decision |
| --- | --- |
| Transport | V1 accepts HTTPS MCP Streamable HTTP only. |
| Manifest | Adapter declares requirement id, purpose, required flag, and optional requested tool names. |
| Binding | Profile installation stores one opaque connection reference per MCP requirement. |
| Runtime | A provider-neutral issuer returns a bounded gateway capability for exact Runtime/run scope. |
| Agent UX | OpenCode uses built-in remote MCP configuration. Pi uses one reviewed, pinned Sandbox-template extension because Pi intentionally has no built-in MCP client. Both retain their own TUI. |
| Tool policy | Hosting policy may narrow requested tools. Write access is explicit; names/descriptions are not safety classifiers. |
| Security | No raw endpoint, header, credential, stdio command, or tenant code in public manifests or Runtime snapshots. |
| Cleanup | Completion, cancellation, Runtime replacement, and Workspace termination revoke the exact grant. |
| Ownership | Public owns requirement/binding/issuer/lifecycle. Hosted products own connection registry, secret custody, authz, audit, gateway, and commercial policy. |

The owner confirmed this slice and the recommended Stage 6 ordering on 2026-08-08 and 2026-08-09.

## Non-goals

- A public remote MCP Marketplace or hosted connection registry.
- Legacy SSE-only or stdio transport.
- Arbitrary per-connection headers in a public manifest.
- Tool discovery that silently expands an allowlist.
- Dynamic or user-selected Pi extension installation at Workspace launch.
- Model connection, Preview/Git/Server provider SDK, billing, or HA changes.

## Open questions

None that blocks V1.

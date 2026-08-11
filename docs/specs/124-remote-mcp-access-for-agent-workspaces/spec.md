# Remote MCP Access For Agent Workspaces

## Status

- Round: Spec
- Maturity: Public Alpha contract; hosted implementation remains opt-in
- Governing decision: [ADR-106](../../decisions/ADR-106-remote-mcp-connection-for-agent-workspaces.md)

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| MCP requirement | Adapter-declared need for one remote MCP server and optionally named tools. |
| MCP connection reference | Opaque host-owned reference bound to one Profile requirement. |
| MCP access capability | Short-lived gateway URL/token/server alias/effective tool set for exact Runtime scope. |
| MCP access issuer | Public port implemented by a hosting composition; it never returns upstream credentials. |

## Acceptance criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| MCP-ACCESS-MANIFEST-001 | Validate requirement | A declarative Adapter declares remote MCP | Validation runs | Unique ids, bounded purpose/tool names, HTTPS Streamable HTTP intent, and no endpoint/header/command/secret fields are accepted. |
| MCP-ACCESS-BIND-002 | Compile exact binding | Installed Profile has one reference for each required MCP requirement | Profile compiles | Plan pins requirement id, connection reference, purpose, required flag, and requested tools only. |
| MCP-ACCESS-BIND-003 | Missing/ambiguous binding | Required reference is absent, duplicated, stale, or unknown | Configure/compile/open runs | It fails before Sandbox, capability, or child effects with a stable safe issue. |
| MCP-ACCESS-ISSUE-004 | Issue scoped access | Compiled binding and exact Workspace/Runtime/run scope exist | Harness starts | Issuer returns only bounded gateway metadata and effective tools; upstream endpoint/credential are absent. |
| MCP-ACCESS-HARNESS-005 | Native Agent experience | Pi or OpenCode receives capabilities | Runtime launches | Harness renders native MCP client configuration and the user continues in the Agent's own TUI/native client. Pi's explicit CLI tool allowlist contains the conservative built-ins plus only deterministic names derived from the issued capability's effective tools. |
| MCP-ACCESS-POLICY-006 | Host narrows tools | Adapter requests tools outside host policy | Access is issued or tool is invoked | Effective access is the intersection; no unlisted tool becomes callable. |
| MCP-ACCESS-REVOKE-007 | Exact cleanup | Runtime completes, cancels, is replaced, or Workspace terminates | Cleanup reconciles repeatedly | Exact MCP grants are revoked idempotently; sibling Runtime and durable Workspace data remain. |
| MCP-ACCESS-REDACT-008 | Secret-safe evidence | Any validation, issue, proxy, or cleanup branch fails | Error/event/read model is returned | No upstream URL, token, header, credential, tool arguments, or raw response body is retained. |
| MCP-ACCESS-CONFORMANCE-009 | Third-party harness | A conforming Adapter declares MCP requirements | Conformance suite runs | Binding cardinality, issuer scope, native config, policy narrowing, revoke, and redaction are proven without a live provider. |

## Contract shape

The Adapter manifest adds `mcpServers[]` with `id`, `required`, `purpose`, and optional
`requestedTools[]`. It cannot contain transport commands, endpoint URLs, headers, or credentials.

Profile installations configure `mcpConnections[]` as `{ requirementId, connectionReference }`.
Compilation produces immutable `mcpBindings[]` with the declared requirement metadata and exact
reference. Workspace/Runtime state contains only this safe binding snapshot.

The issuer input contains tenant-safe execution context plus Sandbox, Workspace, Runtime, optional
run id, requirement id, connection reference, and requested tools. The result contains only:

- `serverName`;
- `transport = streamable-http`;
- Appaloft gateway `url`;
- short-lived bearer `token`;
- `expiresAt`;
- `effectiveTools`.

OpenCode receives its supported remote MCP object through the ephemeral native configuration already
owned by the harness. Pi intentionally has no built-in MCP client, so its harness loads exactly one
reviewed, version-pinned MCP extension from the immutable Sandbox template using the Pi CLI's explicit
`--extension` option while extension discovery remains disabled. The extension reads an ephemeral
Appaloft MCP configuration from process environment; it is not downloaded, installed, or persisted at
Workspace launch time. Because Pi applies `--tools` to extension-registered tools as well as built-ins,
the harness derives each local tool name from the issued `serverName` and `effectiveTools`, sanitizes and
bounds it to the same extension contract, and appends only those exact names to the existing built-in
allowlist. Gateway URLs, bearer tokens, and upstream credentials never enter argv.

## Lifecycle and failure semantics

- Required bindings resolve before Sandbox child launch.
- Capability issue is idempotent for one exact Runtime scope.
- Expired or revoked capability is not refreshed implicitly after the Profile binding is disabled.
- Cleanup is exact and may repeat after process loss.
- Public events and projections record safe ids/state only, never credential material or MCP payloads.

## Non-goals

- Hosting the upstream MCP server;
- connection CRUD, organization roles, audit storage, vault, billing, Marketplace, or gateway policy;
- stdio, arbitrary headers, legacy SSE-only transport, or uploaded code;
- dynamically installing or accepting user-selected Pi extensions;
- a generic Appaloft-built Agent chat/TUI.

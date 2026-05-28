# Appaloft As MCP Transport Spec

- Scope: public MCP tool, resource, prompt, and stdio transport package for Appaloft.
- Status: Active transport slice.
- Governing ADR: [ADR-080](../../decisions/ADR-080-appaloft-as-mcp-transport-boundary.md).

## Summary

Appaloft-as-MCP exposes the same Appaloft operation catalog to MCP clients. It is a transport and
agent integration surface, not a new business model. Tools dispatch through the application command
and query buses, resources expose read-only context, and prompts describe safe operation sequences.

The public skill remains the concise AI-facing protocol. MCP provides machine-callable tools for
agents configured with an Appaloft server.

## Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| APPALOFT-MCP-001 | Tool descriptors cover the catalog | The operation catalog contains command and query entries | MCP descriptors are generated | Every entry has one tool descriptor with operation key, kind, domain, CLI/API metadata, and generated input schema availability. |
| APPALOFT-MCP-002 | Tool calls dispatch through shared buses | A MCP client calls a tool mapped to an operation key | The MCP package handles the call | The package creates the catalog message by `messageName` and calls `CommandBus.execute` or `QueryBus.execute` with `entrypoint: "mcp"`. |
| APPALOFT-MCP-003 | Schema errors do not dispatch | A MCP client supplies invalid input | The message factory rejects the input | The tool call returns the same result error and neither bus is called. |
| APPALOFT-MCP-004 | Missing tools are explicit | A MCP client calls an unknown tool name | The MCP tool server handles the call | The response is a stable non-retryable `mcp_tool_not_registered` error. |
| APPALOFT-MCP-005 | Resources expose read-only context | A MCP client lists and reads resources | The MCP server responds | It provides operation catalog, skill, deploy protocol, MCP tool guide, and public docs pointer resources without exposing secrets or mutable state. |
| APPALOFT-MCP-006 | Prompts expose workflows, not hidden operations | A MCP client lists prompts | The MCP server responds | Prompts cover first deploy, recovery, resource configuration, runtime observation, and static artifact publishing, and each prompt instructs agents to use existing tools. |
| APPALOFT-MCP-007 | Stdio JSON-RPC adapter is packageable | A MCP host starts the package over stdio | It sends `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, and `prompts/get` requests | The server returns MCP-shaped responses from the same in-process contracts. |
| APPALOFT-MCP-008 | Skill and MCP stay connected but separate | A user asks an agent to use `/appaloft` style help | The Appaloft skill is loaded and MCP is available | The skill chooses MCP as the active callable surface, but still follows the same safe deploy/observe/recover protocol and existing operation boundaries. |
| APPALOFT-MCP-009 | Protocol-level missing tools are invalid calls | A MCP client calls `tools/call` with an unknown tool name | The JSON-RPC adapter validates the request | It returns JSON-RPC `-32602` instead of reporting a tool execution result. |
| APPALOFT-MCP-010 | Tool metadata carries host safety hints | MCP descriptors are listed | The host reads tool metadata | Descriptors include title and annotations for read-only queries, destructive commands, idempotent queries, and external-system operations, and successful tool calls return structured content plus text. |

## Public Boundary

Public MCP concepts:

- `ToolContract`
- `ToolDescriptor`
- `createOperationToolHandlers`
- `createAppaloftMcpToolServer`
- `createAppaloftMcpResources`
- `createAppaloftMcpPrompts`
- `createAppaloftMcpServer`
- `handleAppaloftMcpJsonRpcRequest`
- `runAppaloftMcpStdioServer`

Non-goals:

- no hosted gateway or marketplace integration;
- no Cloud/private policy, billing, quota, or entitlement strategy;
- no new operation such as `quick-deploy.create`;
- no direct repository/provider/runtime/database mutation;
- no autonomous background agent runtime;
- no release publishing in this slice.

## Competitor Notes

- Supabase-style skills are intentionally concise and use references/progressive disclosure rather
  than listing every product behavior in `SKILL.md`. Appaloft should keep one full product skill
  because deploy, observe, recover, configure, and administer are one deployment-platform trigger
  domain today.
- MCP specification guidance separates tools, resources, and prompts. Appaloft tools are callable
  operations, resources are read-only context, and prompts are workflow starters. The 2025-06-18
  tools shape also supports annotations and structured content, so Appaloft should surface those
  hints instead of relying only on prose descriptions.
- Cloudflare-style MCP uses a broad API server for very large API coverage and product-specific
  servers where domain workflow matters; both patterns still back calls with existing service
  boundaries. Appaloft can stay one MCP server because the operation catalog already names
  product-level commands and queries.
- Vercel and GitHub-style MCP surfaces split or filter tools by product area such as teams,
  projects, deployments, logs, domains, repositories, issues, pull requests, and actions. This
  supports Appaloft using one catalog-derived server with future toolset filtering, not many skills
  today.
- Dokploy, Coolify, CapRover, and Dokku-style OSS PaaS automation generally wraps existing app,
  deploy, log, environment, domain, database, and service lifecycle APIs; Appaloft should follow
  that pattern by wrapping the operation catalog.

## Migration Gaps

- Release packaging and hosted gateway configuration remain follow-up work.
- Existing public docs that still describe MCP as only a future transport should be updated in the
  same round.

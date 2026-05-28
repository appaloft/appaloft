# @appaloft/ai-mcp

Workspace MCP transport library and contract source for Appaloft operations.

This package is a transport layer over the application operation catalog. It does not add
MCP-only business operations, call providers directly, or bypass command/query buses.

## Runtime Entrypoints

From the Appaloft CLI/runtime:

```bash
appaloft mcp stdio
```

This is the current user-facing run path. It starts a stdio JSON-RPC MCP server and composes the
real Appaloft runtime.

`@appaloft/ai-mcp` is private workspace source for now because it depends on internal workspace
packages. Publishing a standalone package/bin such as `appaloft-mcp` is a separate release task.

## Release Status

This package is ready for source review as the public MCP transport boundary, but it is not yet a
standalone distribution artifact. Before publishing `appaloft-mcp`, validate the bin from a packed
artifact, remove workspace-only blockers, add public skill discovery metadata, and document the
published install path only after it can compose a real Appaloft runtime.

## Tool Contract

- One MCP tool maps to one `operationCatalog` key.
- Tool names replace `.` and `-` with `_`, for example `deployments_plan`,
  `deployments_create`, and `resources_configure_source`.
- Input JSON schemas are generated from the same Zod operation input schemas used by CLI and
  HTTP/API.
- MCP annotations mark read-only queries, destructive commands, idempotent queries, and
  external-system operations.
- Tool call results include JSON text plus `structuredContent` for hosts that support structured
  results.
- Tool calls create the catalog message by `messageName` and dispatch through `CommandBus.execute`
  or `QueryBus.execute` with `entrypoint: "mcp"`.

## Resources And Prompts

Resources are read-only context:

- `appaloft://operation-catalog`
- `appaloft://tools/high-value`
- `appaloft://skill/appaloft`
- `appaloft://skill/deploy-protocol`
- `appaloft://tools/mcp-guide`
- `appaloft://docs/agent`

Prompts are workflow starters over existing tools:

- `appaloft-first-deploy`
- `appaloft-recover-deployment`
- `appaloft-configure-resource`
- `appaloft-observe-runtime`
- `appaloft-publish-static-artifact`

## Library API

- `toolContracts`, `toolContractsByOperationKey`, `toolDescriptorsByName`
- `createOperationToolHandlers(...)`
- `createAppaloftMcpToolServer(...)`
- `createAppaloftMcpResources()`
- `createAppaloftMcpPrompts()`
- `createAppaloftMcpServer(...)`
- `handleAppaloftMcpJsonRpcRequest(...)`
- `runAppaloftMcpStdioServer(...)`

Filtered compatibility wrappers remain available:

- `createRuntimeUsageMcpToolServer(...)`
- `createRuntimeMonitoringMcpToolServer(...)`

## Boundary

Auth, tenant context, operation guards, confirmations, redaction, structured errors, and runtime
composition stay in the existing application/shell boundary. MCP tools should be small, explicit
operation calls. Destructive operations must still use their existing schema-level confirmation and
delete-safety patterns.

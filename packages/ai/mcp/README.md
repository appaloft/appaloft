# @appaloft/ai-mcp

Workspace MCP transport library and contract source for Appaloft operations.

This package is a transport layer over the application operation catalog. It does not add
MCP-only business operations, call providers directly, or bypass command/query buses.

## Runtime Entrypoints

From the Appaloft CLI/runtime:

```bash
appaloft mcp stdio
```

This starts a stdio JSON-RPC MCP server and composes the real Appaloft runtime.

For local remote-HTTP clients:

```bash
appaloft mcp serve --host 127.0.0.1 --port 3939
```

This starts an HTTP JSON-RPC MCP endpoint at `/mcp`. It is intentionally bound to localhost by
default. Use an explicit host only when a trusted reverse proxy or private network is providing the
security boundary.

For a standalone package launcher:

```bash
npx @appaloft/mcp
npx @appaloft/mcp serve --host 127.0.0.1 --port 3939
```

The standalone `@appaloft/mcp` package exposes the `appaloft-mcp` launcher and delegates to the same
Appaloft CLI/runtime instead of shipping a second business implementation.

## Release Status

This package is the public MCP transport boundary. `@appaloft/ai-mcp` remains workspace source, and
the publishable user-facing launcher package is `@appaloft/mcp`. Release validation must pack and
execute the launcher artifact before publish. Public skill discovery metadata remains a separate
release task.

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
- `handleAppaloftMcpHttpRequest(...)`
- `createAppaloftMcpHttpFetchHandler(...)`
- `startAppaloftMcpHttpServer(...)`
- `runAppaloftMcpStdioServer(...)`

Filtered compatibility wrappers remain available:

- `createRuntimeUsageMcpToolServer(...)`
- `createRuntimeMonitoringMcpToolServer(...)`

## Boundary

Auth, tenant context, operation guards, confirmations, redaction, structured errors, and runtime
composition stay in the existing application/shell boundary. MCP tools should be small, explicit
operation calls. Destructive operations must still use their existing schema-level confirmation and
delete-safety patterns.

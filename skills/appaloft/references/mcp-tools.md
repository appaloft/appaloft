# MCP Tools

Use this reference when an MCP host exposes Appaloft tools or when the user asks how to configure
Appaloft MCP. The skill remains the procedural guide; MCP is the callable transport.

## Setup

Use the same Appaloft runtime as the CLI for stdio:

```bash
appaloft mcp stdio
```

This starts a stdio MCP server and composes the real Appaloft command/query buses. It does not
deploy anything until the MCP client calls a tool.

For local remote-HTTP clients:

```bash
appaloft mcp serve --host 127.0.0.1 --port 3939
```

This serves MCP JSON-RPC over HTTP at `/mcp`. Keep the default localhost bind unless a trusted
reverse proxy or private network supplies the security boundary.

For a dedicated package command:

```bash
npx @appaloft/mcp
npx @appaloft/mcp serve --host 127.0.0.1 --port 3939
```

The standalone `@appaloft/mcp` package exposes the `appaloft-mcp` launcher and delegates to the
Appaloft CLI/runtime. It does not define another operation list or bypass the application buses.

## Tool Naming

Each MCP tool maps one-to-one to an operation catalog key:

- `deployments.create` -> `deployments_create`
- `deployments.plan` -> `deployments_plan`
- `resources.configure-source` -> `resources_configure_source`
- `runtime-monitoring.samples.list` -> `runtime_monitoring_samples_list`
- `system.doctor` -> `system_doctor`

Do not look for agent-only tools such as `quick_deploy_create`. If a behavior is not in
`packages/application/src/operation-catalog.ts`, it is not an Appaloft MCP operation.

Tool responses include JSON text for older clients and structured content for hosts that support
MCP structured results. Tool annotations mark read-only queries, destructive commands, idempotent
queries, and the fact that deployment operations can touch external systems.

## Resources

The public server exposes read-only context resources:

- `appaloft://operation-catalog`
- `appaloft://tools/high-value`
- `appaloft://skill/appaloft`
- `appaloft://skill/deploy-protocol`
- `appaloft://tools/mcp-guide`
- `appaloft://docs/agent`

Use them for tool discovery and workflow context. Do not treat resources as mutable state or policy.

## Prompts

The public server exposes prompts for common workflows:

- `appaloft-first-deploy`
- `appaloft-recover-deployment`
- `appaloft-configure-resource`
- `appaloft-observe-runtime`
- `appaloft-publish-static-artifact`

Prompts sequence existing tools only. They do not create new operations.

## Safety

- Preserve the same secret rules as CLI/API/Web: never read or print `.env`, private keys, tokens,
  SSH material, cookies, raw connection strings, or unmasked logs.
- For destructive operations, inspect readback or delete-safety tools first and pass exact
  confirmation fields when the operation schema requires them.
- Keep auth, tenant context, operation guards, redaction, confirmations, and structured errors in
  the Appaloft application/runtime boundary.
- Prefer small explicit tool calls and return URL/access state first, then ids, status, logs,
  diagnostics, recovery readiness, and the next safe action.

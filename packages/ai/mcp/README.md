# @appaloft/ai-mcp

AI and MCP-facing tool contract package.

Responsibilities:

- tool schemas generated from the application operation catalog
- CLI and API mapping metadata without a parallel hand-maintained operation list
- MCP-facing tool registration and dispatch over explicit operation handlers

Each exported tool contract maps to exactly one `operationCatalog` key. Tool names use the
operation key with `.` and `-` converted to `_`, for example `deployments_plan` and
`resources_configure_source`.

Runtime usage and runtime monitoring tools can be packaged with
`createRuntimeUsageMcpToolServer(...)` and `createRuntimeMonitoringMcpToolServer(...)`. Each server
lists the registered tool contracts and dispatches calls by tool name through the shared application
command/query buses.

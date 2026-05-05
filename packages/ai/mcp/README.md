# @appaloft/ai-mcp

AI and MCP-facing tool contract package.

Responsibilities:

- tool schemas generated from the application operation catalog
- CLI and API mapping metadata without a parallel hand-maintained operation list
- future MCP server handler surface

Each exported tool contract maps to exactly one `operationCatalog` key. Tool names use the
operation key with `.` and `-` converted to `_`, for example `deployments_plan` and
`resources_configure_source`.

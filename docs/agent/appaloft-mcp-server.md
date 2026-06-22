# Appaloft MCP Server

> GOVERNING DOCUMENT
>
> This is the canonical public Appaloft MCP transport document. It makes MCP a first-class
> callable tool surface beside CLI, HTTP/API, Web, SDK metadata, and the Appaloft skill.

## Purpose

The Appaloft MCP server exposes the existing Appaloft operation catalog to MCP clients. It is a
transport surface, not a new business model. Each MCP tool maps to one operation key, uses the same
input schema as the command/query message, and dispatches through the shared command/query buses.

The Appaloft skill remains the procedural AI entrypoint. MCP provides machine-callable tools when a
host has Appaloft MCP configured. A user phrase such as `/appaloft help me deploy this repo` should
load the skill first; if MCP tools are available, the skill uses them as the active callable
surface.

## Run

Use the Appaloft runtime for stdio:

```bash
appaloft mcp stdio
```

This starts a stdio JSON-RPC MCP server. Starting the server does not deploy, create resources,
call APIs, or mutate runtime state. Mutation starts only when an MCP client calls an Appaloft
operation tool.

Use the Appaloft runtime for a local HTTP endpoint:

```bash
appaloft mcp serve --host 127.0.0.1 --port 3939
```

This serves MCP JSON-RPC over HTTP at `/mcp`. It defaults to localhost; expose it beyond localhost
only behind a trusted reverse proxy or private network boundary.

Use the standalone launcher when an MCP host expects a dedicated package command:

```bash
npx @appaloft/mcp
npx @appaloft/mcp serve --host 127.0.0.1 --port 3939
```

The `@appaloft/mcp` package exposes the `appaloft-mcp` launcher and delegates to the same Appaloft
runtime. It does not ship a second operation list or business implementation.

## Remote Auth

Remote HTTP MCP clients should authenticate with the same product auth contract as the HTTP/API
surface. For browser handoff, run:

```bash
appaloft auth mcp login
```

The command creates a short-lived browser authorization session, requests bearer credential
material, verifies current organization context, and writes a redacted local `mcp` profile by
default. It does not print raw bearer material. Noninteractive automation can still use
`APPALOFT_TOKEN` or `appaloft auth token login --stdin` through a trusted local secret channel.

## Tool Contract

- Tool names are derived from operation keys: `deployments.create` becomes `deployments_create`.
- Tool descriptors are generated from `packages/application/src/operation-catalog.ts`.
- Input JSON schemas are generated from operation Zod schemas.
- Commands dispatch through `CommandBus.execute`; queries dispatch through `QueryBus.execute`.
- `ExecutionContext.entrypoint` is `mcp`.
- Tool descriptors include MCP annotations for read-only queries, destructive commands, idempotent
  queries, and external-system operations.
- Tool results include JSON text plus structured content for MCP clients that support it.
- Missing tools are rejected by the JSON-RPC adapter as invalid `tools/call` parameters; lower-level
  tool server compatibility wrappers still expose a stable non-retryable `mcp_tool_not_registered`
  error.
- Schema errors return the same operation parsing result and do not dispatch.

## Resources

The server exposes read-only resources:

- `appaloft://operation-catalog`
- `appaloft://tools/high-value`
- `appaloft://skill/appaloft`
- `appaloft://skill/deploy-protocol`
- `appaloft://tools/mcp-guide`
- `appaloft://docs/agent`

Resources are context only. They do not own policy, background work, tenant selection, or mutable
state.

## Prompts

The server exposes workflow prompts:

- `appaloft-first-deploy`
- `appaloft-recover-deployment`
- `appaloft-configure-resource`
- `appaloft-observe-runtime`
- `appaloft-publish-static-artifact`

Prompts sequence existing tools. They do not add operations such as `quick-deploy.create`.

## Boundary

- Do not call repositories, use cases, providers, Docker, SSH, proxy state, or database state
  directly from MCP.
- Do not expose raw secrets, private keys, token values, cookies, database URLs, raw logs, or
  provider credentials.
- Auth, tenant context, operation guards, confirmations, redaction, and structured errors remain in
  the existing application/runtime boundary.
- Destructive operations must still use their delete-safety and exact confirmation schemas.

## Source

- MCP package: `packages/ai/mcp`
- Shell runtime entry: `apps/shell/src/run.ts`
- Standalone launcher package: `packages/npm/mcp`
- Skill reference: `skills/appaloft/references/mcp-tools.md`
- Governing ADR: `docs/decisions/ADR-080-appaloft-as-mcp-transport-boundary.md`
- Feature spec: `docs/specs/090-appaloft-as-mcp-transport/spec.md`

---
title: "Appaloft MCP server"
description: "Let MCP clients call real Appaloft deployment, configuration, observation, and recovery tools from the operation catalog."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "mcp"
  - "mcp server"
  - "appaloft mcp"
  - "AI tools"
relatedOperations:
  - deployments.create
  - deployments.plan
  - resources.configure-source
  - resources.diagnostic-summary
  - system.doctor
sidebar:
  label: "MCP server"
  order: 2
---

<h2 id="appaloft-mcp-server">Appaloft MCP server</h2>

The Appaloft MCP server is the callable tool entrypoint for Appaloft. It exposes the existing
operation catalog to MCP clients without creating a separate AI-only product model. The skill owns
workflow judgment; MCP executes precise command/query tool calls when configured.

Start the stdio server:

```bash
appaloft mcp stdio
```

Starting the server does not deploy apps, create resources, or mutate state. State changes only
happen when an MCP client calls a concrete Appaloft operation tool.

Start a local HTTP endpoint:

```bash
appaloft mcp serve --host 127.0.0.1 --port 3939
```

This exposes HTTP JSON-RPC MCP at `/mcp`. It binds to localhost by default; expose it on another
host only behind a trusted reverse proxy or private network boundary.

Use the standalone launcher:

```bash
npx appaloft-mcp
npx appaloft-mcp serve --host 127.0.0.1 --port 3939
```

`appaloft-mcp` delegates to the same Appaloft runtime. It does not maintain a second operation list
or business implementation.

<h2 id="appaloft-mcp-tools">Tool Model</h2>

Each tool maps to one operation key:

- `deployments.create` -> `deployments_create`
- `deployments.plan` -> `deployments_plan`
- `resources.configure-source` -> `resources_configure_source`
- `runtime-monitoring.samples.list` -> `runtime_monitoring_samples_list`
- `system.doctor` -> `system_doctor`

Tool descriptors come from `packages/application/src/operation-catalog.ts`, and input JSON schemas
come from the same command/query Zod schemas. Commands dispatch through `CommandBus.execute`,
queries dispatch through `QueryBus.execute`, and calls use `entrypoint: "mcp"`.

Tool descriptors include MCP annotations for read-only queries, destructive commands, idempotent
queries, and operations that may touch external systems. Tool responses include JSON text and
structured content, supporting both older clients and hosts that understand structured results.

There is no `quick_deploy_create` agent-only tool. If a behavior is not in the operation catalog, it
is not an Appaloft MCP operation.

<h2 id="appaloft-mcp-resources">Resources And Prompts</h2>

Read-only resources:

- `appaloft://operation-catalog`
- `appaloft://tools/high-value`
- `appaloft://skill/appaloft`
- `appaloft://skill/deploy-protocol`
- `appaloft://tools/mcp-guide`
- `appaloft://docs/agent`

Prompts:

- `appaloft-first-deploy`
- `appaloft-recover-deployment`
- `appaloft-configure-resource`
- `appaloft-observe-runtime`
- `appaloft-publish-static-artifact`

Resources and prompts provide context and workflow starters only. They do not own write-side
policy, tenant selection, background work, or hidden state.

<h2 id="appaloft-mcp-safety">Safety Boundary</h2>

- Do not bypass Appaloft by calling repositories, use cases, provider SDKs, Docker, SSH, proxies, or
  databases directly.
- Do not read or output `.env`, private keys, tokens, cookies, database URLs, cloud credentials,
  raw secrets, or unmasked logs.
- Auth, tenant context, operation guards, confirmation fields, redaction, and structured errors stay
  in the existing runtime boundary.
- Delete and destructive operations must still use their schema-level delete-safety and exact
  confirmation fields.

<h2 id="appaloft-mcp-skill">Relationship To The Skill</h2>

The Appaloft Skill is the agent workflow protocol: it identifies intent, chooses CLI/API/Web/MCP,
sequences existing operations, and shapes the final response. MCP is the callable tool layer. When
a host has Appaloft MCP tools configured, the skill can prefer tool calls.

When a user says `/appaloft help me deploy this repo`, `/appaloft` is the host's skill invocation
phrase, not an Appaloft CLI command. Load the skill, then choose MCP, CLI, HTTP/API, or Web based on
the active session.

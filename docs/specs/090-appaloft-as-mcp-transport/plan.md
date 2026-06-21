# Appaloft As MCP Transport Plan

## Architecture

- Keep MCP in `packages/ai/mcp` as a transport package.
- Generate tool descriptors and JSON schemas from `operationCatalog`.
- Build an operation message registry from `@appaloft/application` exports keyed by
  `operationCatalog.messageName`.
- Create dynamic handlers for all catalog entries; commands dispatch through `CommandBus`, queries
  dispatch through `QueryBus`.
- Keep specialized runtime usage/monitoring server exports as compatibility wrappers over the
  generated handlers.
- Add read-only resource descriptors for operation catalog, skill, deploy protocol, MCP guide, and
  docs pointers.
- Add prompt descriptors for first deploy, recovery, resource configuration, runtime observation,
  and static artifact publishing.
- Add a minimal MCP JSON-RPC stdio adapter without introducing a second business protocol.
- Add a minimal HTTP JSON-RPC MCP adapter for self-hosted or reverse-proxied `/mcp` endpoints.
- Add a standalone `appaloft-mcp` launcher package that delegates to the same Appaloft runtime.
- Let shell/server composition provide real buses and context; `@appaloft/ai-mcp` stays independent
  from persistence and runtime composition.

## Test Strategy

- Descriptor tests prove every catalog entry has a MCP tool and serializable contract.
- Dynamic dispatch tests prove representative command, query, no-input query, and invalid input
  paths create messages and call the correct bus.
- Coverage tests prove every descriptor has a registered handler.
- Resource/prompt tests prove stable ids, read-only content, and workflow guidance.
- Protocol tests prove `initialize`, `tools/list`, `tools/call`, `resources/list`,
  `resources/read`, `prompts/list`, `prompts/get`, and unknown-method errors.
- HTTP adapter tests prove `/mcp` metadata, JSON-RPC dispatch, product-session authorization, and
  `entrypoint: "mcp"` context propagation.
- Docs registry tests prove public docs and source-of-truth references exist.

## Release Preparation

This slice is source-, docs-, and launcher-ready for review. Supported user-facing entrypoints are:

- `appaloft mcp stdio`
- `appaloft mcp serve --host 127.0.0.1 --port 3939`
- `npx appaloft-mcp`
- `npx appaloft-mcp serve --host 127.0.0.1 --port 3939`

Before publishing a release, validate the `appaloft-mcp` bin from a packed release artifact, not
only from source. Keep hosted gateway policy, audit, and entitlement outside public Appaloft.

## Follow-Up Rounds

- Add public skill discovery metadata such as `.well-known/agent-skills` or an equivalent public
  index.
- Add hosted/private gateway policy outside public Appaloft.
- Add SSE streaming, resumable sessions, and a separately scalable gateway service only when a
  concrete MCP host or production load requires it.

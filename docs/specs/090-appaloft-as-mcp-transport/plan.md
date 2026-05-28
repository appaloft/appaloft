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
- Docs registry tests prove public docs and source-of-truth references exist.

## Release Preparation

This slice is source- and docs-ready for review, but it is not a publishing action. The first
supported user-facing entrypoint remains `appaloft mcp stdio` through the Appaloft runtime.

Before publishing a standalone MCP package or binary, run a separate release round that:

- removes the workspace-only/private package blockers from `@appaloft/ai-mcp`;
- validates the `appaloft-mcp` bin from a packed release artifact, not only from source;
- adds skill discovery metadata such as `.well-known/agent-skills` or an equivalent public index;
- documents the install path only after the published package can compose a real Appaloft runtime;
- keeps hosted gateway policy, audit, and entitlement outside public Appaloft.

## Follow-Up Rounds

- Package/release the MCP server entrypoint for external install once release process is ready.
- Add hosted/private gateway policy outside public Appaloft.
- Add HTTP/SSE MCP transport only if a concrete host requires it.

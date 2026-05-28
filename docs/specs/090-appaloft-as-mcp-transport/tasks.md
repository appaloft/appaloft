# Appaloft As MCP Transport Tasks

## Source Of Truth

- [x] Add ADR-080 for the public Appaloft-as-MCP transport boundary.
- [x] Add spec, plan, and tasks artifacts.
- [x] Update previous skill/docs language from future-only MCP to active MCP package language.

## Implementation

- [x] Add `mcp` as an application execution entrypoint.
- [x] Generate JSON-schema-backed MCP tool descriptors from operation schemas.
- [x] Add operation message registry and generated handlers for every operation catalog entry.
- [x] Keep runtime usage/monitoring exports as filtered compatibility wrappers.
- [x] Add MCP resources for operation catalog, skill, deploy protocol, MCP guide, and public docs.
- [x] Add MCP prompts for deploy, recover, configure, observe, and static artifact publish.
- [x] Add MCP tool annotations, structured tool results, and protocol-level unknown-tool errors.
- [x] Add MCP JSON-RPC request handler and stdio runner.
- [x] Add package exports and package docs for future install/release.

## Documentation

- [x] Update Appaloft skill source and references for active MCP usage.
- [x] Add public docs page for the Appaloft MCP server in zh-CN and en-US.
- [x] Add docs registry topic and tests for the MCP docs page.
- [x] Update core operations and business operation map language.

## Verification

- [x] Add `APPALOFT-MCP-001` through `APPALOFT-MCP-010` tests.
- [x] Run focused MCP and docs registry tests.
- [x] Add Appaloft skill eval validation coverage for MCP setup, tool/resource/prompt boundaries,
  and operation-catalog-backed deploy/recover usage.
- [ ] Run `git diff --check`.

## Release Preparation

- [x] Document the current supported MCP run path as `appaloft mcp stdio`.
- [x] Keep standalone `appaloft-mcp` package/bin publishing deferred until release packaging is wired.
- [x] Record pre-publish checks for packed artifact validation and discovery metadata.
- [ ] Run release build or package validation from a clean checkout after this PR merges.
- [ ] Add `.well-known/agent-skills` or equivalent public discovery index in a dedicated release round.

## Deferred

- [ ] Release publishing for a downloadable package.
- [ ] Hosted MCP gateway and private policy wrapper.
- [ ] HTTP/SSE MCP transport if a concrete MCP host requires it.

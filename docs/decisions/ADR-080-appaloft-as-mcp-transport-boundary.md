# ADR-080: Appaloft As MCP Transport Boundary

Status: Accepted

## Context

Appaloft already exposes product operations through the operation catalog, CLI, HTTP/API, Web, and
SDK metadata. The repository also has an installable Appaloft skill for AI agents, but the MCP
package only generated descriptors plus a few runtime usage and monitoring handlers.

AI-native deployment platforms and adjacent products converge on the same pattern:

- skills stay small and procedural, with detailed references loaded only when needed;
- MCP tools expose existing product APIs instead of inventing agent-only workflows;
- broad APIs may be exposed through generated tools, while prompts/resources provide workflow
  context;
- MCP hosts benefit from protocol-native metadata such as tool titles, read-only/destructive/
  idempotent annotations, and structured tool results, rather than relying only on prose
  descriptions;
- destructive operations stay explicit, redacted, and authorization-bound;
- open-source PaaS MCP servers commonly wrap existing app/project/deploy/log/environment APIs as
  tools instead of creating a second product model.

The comparison set for this decision includes Supabase `agent-skills`, Cloudflare and Vercel MCP
documentation, MCP specification guidance for tools/resources/prompts, and deployment-platform
surfaces from Netlify/Railway-style MCP servers plus Dokploy, Coolify, CapRover, and Dokku
automation APIs. The architectural signal is consistent: keep natural-language agent guidance
concise, expose callable tools over already accepted product operations, and avoid dumping raw
provider/runtime APIs into the model without product-level operation names.

Appaloft needs a public, neutral MCP boundary now. It must be complete enough to package and run,
but it must not add business semantics outside the application operation catalog.

## Decision

Public Appaloft exposes Appaloft-as-MCP as a first-class transport over the existing operation
catalog:

- `@appaloft/ai-mcp` owns MCP tool descriptors, operation dispatch, resources, prompts, and a
  minimal stdio JSON-RPC server adapter.
- Every MCP tool maps one-to-one to an `operationCatalog` key.
- MCP tool names are derived from operation keys by replacing `.` and `-` with `_`.
- MCP tool input schemas are generated from the same operation input Zod schema when one exists.
- MCP tool descriptors include protocol-native annotations for read-only queries, destructive
  commands, idempotent queries, and external-system operations.
- MCP tool results include structured content for modern clients while retaining serialized JSON
  text for compatibility.
- MCP tool calls create the operation catalog message by `messageName` and dispatch through the
  shared `CommandBus` or `QueryBus`.
- MCP must not call repositories, use cases, provider SDKs, runtime adapters, Docker, SSH, or
  database state directly.
- MCP resources are read-only context surfaces, such as the operation catalog, skill protocol, MCP
  tool guide, and public docs pointers.
- MCP prompts are reusable workflow starters that sequence existing operations; prompts do not own
  write-side policy or hidden workflow state.
- `mcp` is an explicit `ExecutionContext.entrypoint`.
- The Appaloft skill remains one full product skill with deploy/observe/recover/configure/admin
  subprotocols; Appaloft should not split into many public skills until a separate trigger domain
  appears.
- Auth, tenant, confirmation, and product-session policy remain outside the tool descriptor shape
  and are enforced by the same application buses, guards, and runtime composition as other
  transports.

This decision does not add a hosted MCP gateway, marketplace gateway policy, remote tool proxy,
agent runtime, new business operation, or Cloud/private deployment strategy.

## Consequences

- Adding or changing an Appaloft business operation requires catalog/message/schema alignment once;
  CLI, HTTP/API, SDK, skill references, and MCP can derive metadata from that source.
- Tests can assert that every catalog entry has a descriptor and handler without maintaining a
  parallel hand-written list.
- MCP clients can call the same command/query boundary as CLI and HTTP/API, preserving operation
  guards, structured errors, redaction rules, and tenant context. Unknown `tools/call` names are
  rejected as invalid JSON-RPC parameters at the protocol adapter, while lower-level compatibility
  wrappers keep the stable `mcp_tool_not_registered` result error.
- The skill can stay concise because detailed operation coverage lives in references and MCP
  resources.
- Product docs can describe AI entrypoints clearly: skill for procedural agent behavior, MCP for
  machine-callable tools, and prompts/resources for workflow context.

## Migration Gaps

- Existing docs and specs that say MCP is only future/optional should be updated to say the public
  MCP package is active when configured, while hosted gateway and release packaging remain follow-up
  work.
- The current MCP package must be rebuilt from partial runtime handlers to complete
  operation-catalog-backed dispatch, resources, prompts, protocol tests, and package docs.
- Public docs should add an Appaloft MCP server page and link it from the skill pages.

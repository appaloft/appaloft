# AI-Native Skill, Blueprint, And MCP Roadmap

## Status

This document records product direction and source-of-truth constraints for AI-native work. The pre-v1 agent deploy skill is now a required planning track governed by [Appaloft Agent Deploy Skill](../specs/072-appaloft-agent-deploy-skill/spec.md). Later Blueprint, MCP, gateway, and AgentOps tracks remain future planning only until their own Spec Rounds. This document does not authorize Code Round work and does not replace accepted ADRs, command/query specs, workflow specs, or the operation catalog.

`Blueprint` is the canonical language for the portable topology concept previously explored with Resource Template / Workload Profile wording. `Template` remains a loose compatibility alias only when users or historical docs use it.

## Source Of Truth

Future work under this roadmap must start from:

- [Product Roadmap](../PRODUCT_ROADMAP.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [Architecture](../ARCHITECTURE.md)
- [Blueprint Format And Local Registry Boundary](../decisions/ADR-065-blueprint-format-and-local-registry-boundary.md)
- [Plugins](../PLUGINS.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Product Direction

Appaloft remains Bring Your Own Server and user-owned infrastructure first.

The long-term positioning is:

> Appaloft is the self-hosted control plane for deploying applications, tool servers, and AI-native workloads on user-owned infrastructure.

For traditional deployment, BYOS is about cost, control, and portability. For AI-native workloads, BYOS also means keeping tools, secrets, internal data, and agent actions under the user's control.

## Existing Foundation To Preserve

Future skill, Blueprint, MCP, and AI-native work must fit the existing Appaloft model:

- `Resource` is the project/environment-scoped deployable unit. Applications, services, workers, static sites, databases, and Compose stacks already live under this language.
- `Resource` profile state already owns source, runtime, network, access, health, variables, storage attachment, dependency binding, auto-deploy, runtime control, logs, health, diagnostics, and deployment history surfaces.
- `Workload`, `SourceSpec`, `BuildSpec`, `RuntimeSpec`, `RuntimePlan`, and `EnvironmentSnapshot` are the planning and snapshot language for deployment.
- `ResourceInstance` and `ResourceBinding` are the dependency-resource and binding language for managed or imported backing services such as Postgres and Redis.
- `Provider`, `Strategy`, `Integration`, and `Plugin` are distinct extension concepts and must not be collapsed into one Blueprint mechanism.
- CLI, HTTP/oRPC, Web, automation, and future MCP entrypoints must dispatch the same application commands and queries from `operation-catalog.ts`.

## Blueprint Definition

Blueprint is a portable, versioned, instantiable application or service topology definition. It is not a Deployment, not a Project, not a Resource, and not a Catalog Listing.

A Blueprint may describe:

- one or more components such as service, worker, static site, scheduled task, MCP server, or future accepted component types;
- environment profiles such as preview and production;
- runtime source such as image, Git, local folder, archive, static output, binary, Compose, or future accepted strategy inputs;
- ports, route intent, health checks, environment variables, secret placeholders, volumes, storage, and dependency/resource binding requirements;
- generated outputs such as URLs, connection hints, docs links, or optional client configuration hints.

MVP direction is file-first and JSON-first. A copied `*.blueprint.json` file should be enough to define a local Blueprint. Optional YAML authoring can exist later if it maps to the same JSON Schema validation model. A database may index imports, installations, or local registry read models, but it is not required to define the Blueprint itself.

Concept model:

```text
BlueprintDefinition
  has many immutable BlueprintVersion

BlueprintVersion
  contains components, parameters, secrets, profiles, resource requirements

BlueprintInstantiation
  takes BlueprintVersion + user inputs + target environment/profile
  produces Resource profile changes / ResourceDesiredState / WorkloadSpec / RuntimeProfile / ResourceBinding intent / RouteIntent

Deployment
  deploys the instantiated desired state
```

## Core Principle

For v1 usability, an agent deploy skill comes before MCP.

The skill is not a transport and not a new business operation. It is an agent-readable deployment protocol over existing CLI/API/Web behavior: inspect source, exclude secrets, choose or create context, plan, deploy, observe, and return URL plus diagnostics. MCP remains the later formal tool transport generated from the operation catalog.

MCP servers are deployable Resources or dependency-backed workloads with AI-tool capabilities, not a separate deployment engine.

GitHub MCP servers, Postgres MCP servers, Sentry MCP servers, filesystem MCP servers, PocketBase, Teable, n8n, Open WebUI, Qdrant, LiteLLM, custom Docker images, custom Compose bundles, static apps, binaries, and future Kubernetes or Helm deployments should share Appaloft's lower-level Resource, Workload, Deployment, RuntimePlan, EnvironmentSnapshot, Provider, Strategy, and runtime target machinery wherever possible.

MCP-specific behavior belongs above the deployment foundation as metadata, capabilities, generated outputs, safe defaults, docs links, gateway compatibility, policy, audit, and future approval features.

## Layered Roadmap

Version labels are intentionally tentative. The current product roadmap reserves `0.10.0` for self-hosted auth and organization bootstrap, then moves toward `1.0.0-rc` and `1.0.0`. The Agent Deploy Skill is pre-v1 because it is the simplest AI-native user affordance. Blueprint, MCP, gateway, and AgentOps tracks are post-`1.0.0` by default unless maintainers deliberately insert another pre-GA minor line.

| Order | Default target | If pulled before GA | Track | State |
| --- | --- | --- | --- | --- |
| 0 | Pre-1.0 GA readiness | Required before GA | Appaloft Agent Deploy Skill | Spec Round accepted candidate |
| 1 | Post-1.0 Track 1 | Explicit pre-GA pull-forward only | Blueprint Format And Local Registry Foundation | Future Spec Round |
| 2 | Post-1.0 Track 2 | Explicit pre-GA pull-forward only | Blueprint Instantiation And Deployment Planning | Future Spec Round |
| 3 | Post-1.0 Track 3 | Explicit pre-GA pull-forward only | Blueprint Catalog / Registry | Future Spec Round |
| 4 | Post-1.0 Track 4 | Explicit pre-GA pull-forward only | AI Tool Server / MCP Capability | Future Spec Round |
| 5 | Post-1.0 Track 5 | Explicit pre-GA pull-forward only | Appaloft-as-MCP Interface Planning | Future Spec Round |
| 6 | Post-1.0 Track 6 | Explicit pre-GA pull-forward only | Curated AI Tool Server Blueprints | Future Spec Round |
| 7 | Post-1.0 Track 7 | Explicit pre-GA pull-forward only | MCP Gateway / Tool Gateway | Future Spec Round |
| 8 | Later AI-native tracks | Post-1.0+ | Observability, AgentOps, cost governance, eval hooks, model gateway, agent runtime | Future discovery |

### Track 0: Appaloft Skill

Goal: ship a v1-ready full Appaloft skill before requiring MCP, with deploy as the first high-frequency subprotocol.

Planning rules:

- The skill explains how coding agents use existing CLI/API/Web behavior, repository config, and future MCP/tool boundaries across the complete operation catalog.
- It uses the standard skill-manager path `npx skills add appaloft/appaloft` for Codex-compatible skill hosts. Appaloft does not provide a separate npm skill installer; deploy remains a subprotocol inside the full skill.
- It must point to stable public docs anchors and reuse operation-catalog language without exposing internal DDD/CQRS terminology.
- It must include every CLI transport entrypoint, operation keys, safe source inspection, secret/cache exclusion, local static output handling, context selection/creation, plan/deploy/observe sequencing, URL-first outcome output, and recovery guidance.
- It must not add new commands, hidden API endpoints, hosted artifact storage, or MCP-only semantics.
- It may later link to MCP tools after Appaloft-as-MCP is productized, but MCP is not required for the v1 skill path.

Source of truth:

- [Appaloft Agent Deploy Skill](../specs/072-appaloft-agent-deploy-skill/spec.md)
- [URL-First Deployment Entry Experience](../specs/071-url-first-deployment-entry-experience/spec.md)

### Track 1: Blueprint Format And Local Registry Foundation

Goal: define a runtime-agnostic, product-neutral Blueprint layer for known software packages and reusable service topologies.

Planning rules:

- Blueprints describe deployable topology intent, not a Docker Compose file format.
- Compose is one possible source or runtime target, not the Blueprint model itself.
- A BlueprintVersion may resolve into existing Resource source/runtime/network/access/health profile fields, Resource variables/secrets, storage attachments, dependency-resource relationships, generated outputs, docs links, and deployment plan inputs.
- A BlueprintVersion may target image, Git, local folder, Compose, archive, binary, static, future Kubernetes/Helm, future provider-specific, or any accepted Appaloft runtime/provider/strategy path.
- Future specs must define `BlueprintDefinition`, `BlueprintVersion`, `BlueprintComponent`, `BlueprintParameter`, `BlueprintSecretPlaceholder`, `BlueprintEnvironmentProfile`, `BlueprintResourceRequirement`, and `BlueprintInstantiation`.

Potential fields to evaluate:

- id, name, category, description, version, compatibility range;
- source type and source locator;
- supported runtime/provider/strategy mappings;
- required inputs, defaults, validation, and safe examples;
- environment variables and secret requirements;
- ports, volumes, health checks, storage, and dependency bindings;
- generated outputs such as URLs, connection hints, and client config;
- capability declarations, including optional `mcp/tool-server`;
- documentation/help links and public docs anchors;
- trust/source model, license, signing, and provenance.

Non-goal: do not create per-product aggregates such as `GitHubMcpResource`, `PocketBaseResource`, `TeableResource`, or `N8nResource` unless a future ADR proves that a product category owns real domain invariants that Appaloft's existing concepts cannot express.

### Track 2: Blueprint Instantiation And Deployment Planning

Goal: define how selected BlueprintVersions resolve user inputs into existing Appaloft operations and deployment plans.

Planning rules:

- Blueprint instantiation must compile into existing application commands and queries instead of bypassing the application layer.
- Instantiation should reuse `resources.create`, `resources.configure-*`, `resources.set-variable`, `resources.import-variables`, storage/dependency operations, `deployments.plan`, and `deployments.create` where those operations already express the intent.
- Dry-run/preview should prefer `deployments.plan` or a future accepted planning query rather than creating deployment attempts.
- Environment snapshots, dependency binding snapshots, rollback candidates, runtime secret handling, and async acceptance rules must remain governed by existing deployment specs.
- Future specs must decide how validation errors, unsupported runtime/provider/strategy mappings, generated plans, rollback compatibility, and migration gaps are surfaced.

### Track 3: Blueprint Catalog / Registry

Goal: define discovery and distribution for BlueprintDefinitions and BlueprintVersions.

Possible sources:

- local Blueprint files;
- repository folders;
- Git-based Blueprint sources;
- neutral built-in examples;
- plugin-provided Blueprint packs, if a future ADR accepts that boundary.

Planning rules:

- Community/open-source Appaloft should support the generic Blueprint protocol, manual/local Blueprints, custom Docker/Compose/Git/local/static resources according to supported deployment methods, and possibly a small neutral example set.
- Curated or remote catalogs must not be required for local Community use. Local/manual Blueprints remain a valid BYOS path.
- Registry/catalog records may index BlueprintDefinitions and BlueprintVersions, but they do not become the portable Blueprint definition.

Trust questions to specify later:

- validation and schema versioning;
- source trust, signing, provenance, and license metadata;
- version pinning and compatibility with Appaloft versions;
- how Blueprint updates affect existing Resources and deployment history;
- whether catalogs are application records, plugin manifests, repository config, or external registry metadata.

### Track 4: AI Tool Server / MCP Capability

Goal: add MCP/tool-server semantics as a capability over the generic Blueprint foundation.

Planning rules:

- MCP is not a deployment primitive and not a separate deployment path.
- Initial MCP support should be metadata, generated outputs, docs, and safe defaults on top of Resource/Workload/RuntimePlan behavior.
- MCP capability metadata may include capability such as `mcp/tool-server`, transport mode, endpoint output, generated client configuration output, optional tool discovery, secret/env requirements, gateway compatibility, and docs links for clients such as Cursor, Claude Desktop, ChatGPT, or other MCP clients.
- Advanced gateway, audit, approval, and AgentOps behavior is not required for this track.

### Track 5: Appaloft-as-MCP Interface Planning

Goal: expose Appaloft's own existing business operations as MCP tools for AI clients and coding agents.

This is separate from deploying user-selected MCP servers as Resources.

Planning rules:

- Appaloft-as-MCP must call the same application layer and operation catalog as CLI, HTTP/oRPC, and Web.
- Tool handlers must dispatch command/query messages and reuse input schemas. They must not call repositories, use cases, or aggregate state directly.
- Start with read-only and diagnostic operations such as list projects/environments/resources/deployments, inspect deployment status, stream/read deployment events, read logs, and summarize diagnostics.
- Mutation tools must map to explicit accepted commands with existing async lifecycle semantics, neverthrow errors, operation ids, correlation ids, and stable result shapes.
- No MCP-specific command may bypass `CORE_OPERATIONS.md` or `operation-catalog.ts`.

### Track 6: Curated AI Tool Server Blueprints

Goal: offer curated Blueprint examples for common MCP and AI app stack components after the generic foundation exists.

Candidate Blueprints:

- GitHub MCP server;
- Postgres MCP server;
- Sentry MCP server;
- filesystem MCP server;
- custom MCP server from Docker image or Compose bundle;
- LiteLLM;
- Open WebUI;
- Ollama or vLLM;
- vector databases;
- workflow/RAG/eval services.

Planning rules:

- Curated examples are optional catalog content; the generic open Blueprint format and local registry remain the foundation.
- Blueprint outputs may include generated client config for Cursor, Claude Desktop, ChatGPT, or other MCP clients when appropriate.
- Secret handling, health checks, docs links, diagnostics, and safe redaction are required planning topics before any Blueprint becomes curated.
- Early versions should remain Blueprints over existing deployable Resources and dependency resources unless a future ADR justifies a new aggregate.

### Track 7: MCP Gateway / Tool Gateway

Goal: add a later governance layer in front of user-owned MCP servers.

Possible shape:

```text
client/agent -> Appaloft Gateway -> MCP server Resource
```

Possible responsibilities:

- client credentials and identity mapping;
- API keys or Appaloft user/session mapping;
- tool allow/deny policy;
- dangerous action policy;
- rate limits;
- audit logs;
- redacted request/response records;
- correlation ids;
- optional human approval;
- replay/debug support.

Planning rules:

- Gateway is a governance layer above installed MCP server Blueprints, not the initial Blueprint system.
- Gateway audit must define redaction policy before any raw tool request/response body is stored.
- Gateway should bridge toward AgentOps and observability, not pretend to be a general Agent Runtime.

## Longer-Term AI-Native Themes

These themes are direction, not near-term commitments: AI-native observability, AgentOps, AI cost governance, eval and quality gates, model gateway, and agent runtime. Each needs its own source-of-truth and test gates before Code Round.

## Community Boundary

Community/open-source Appaloft should support:

- open Blueprint format;
- manual/custom Blueprints;
- local/file-based Blueprint registry;
- import/export/copy of `*.blueprint.json` and optional `*.blueprint.yaml`;
- custom Docker/Compose/Git/static resources according to existing supported methods;
- possibly a small number of neutral examples;
- no requirement to ship remote catalogs, curated MCP examples, advanced MCP Gateway, advanced AI observability, AgentOps, or cost governance.

## Non-Goals

- Do not model every Blueprint category as a new aggregate.
- Do not create special domain objects such as `GitHubMcpResource`, `PocketBaseResource`, `TeableResource`, or `N8nResource` unless a future ADR proves a need.
- Do not build a general Agent Runtime before Blueprint/tool-server/gateway foundations exist.
- Do not build AI observability before there is a clear event/tool-call/gateway data source.
- Do not make MCP support depend on Web console behavior.
- Do not add MCP-specific domain commands that bypass the operation catalog.
- Do not leak MCP SDK types into the core domain.
- Do not leak observability vendor SDK types into the core domain.
- Do not store raw sensitive MCP request/response bodies without an explicit redaction policy.
- Do not turn Blueprint installation into a second deployment engine outside the existing application layer.
- Do not define Blueprints as Docker Compose-only services.
- Do not make model inference hosting a near-term core requirement.
- Do not make cost governance, eval, AgentOps, or model gateway blocking dependencies for initial Blueprint/MCP work.

## Open Questions

- What is the minimum Blueprint schema that can cover PocketBase, Teable, n8n, Open WebUI, and MCP servers without becoming AI-specific?
- Should Blueprints live as plugin manifests, system plugin files, catalog entries, repository config, or a separate registry concept?
- How should Blueprint instantiation compile into existing commands and deployment plans?
- How should one Blueprint support multiple runtimes or strategies such as image, Compose, Git build, local folder, static, binary, and future Kubernetes/Helm?
- Should MCP be represented as a capability flag, component type, plugin capability, output generator, or some combination?
- Which MCP transports should be planned first?
- Which MCP clients should generated configuration target first?
- Where should tool-call audit logs live: deployment logs, gateway read model, audit bounded context, observability pipeline, or future AgentOps context?
- What is the minimum viable observability event model for deployment events, resource health, tool calls, gateway decisions, and future agent traces?
- Should Appaloft align future observability with OpenTelemetry concepts, its own operation catalog/event model, or both?
- How should MCP client identity map to Appaloft users, API keys, organizations, and self-hosted anonymous mode?
- How should secrets be stored and masked across self-hosted, hosted-control-plane, and local/CLI modes?
- Should gateway policies be core control-plane capability, plugin capability, or layered across both?
- How should future cost events be correlated with projects, resources, clients, tools, agents, and deployments?
- What is the boundary between gateway audit logs, general observability, and AgentOps?

## Required Future Spec Gates

Before any Code Round under this roadmap:

1. Position the selected behavior in [Business Operation Map](../BUSINESS_OPERATION_MAP.md).
2. Decide whether an ADR is needed for canonical language, command/query boundary, durable state, public tool/MCP contract, gateway/audit/security policy, or registry boundary.
3. Update local command/query/workflow/error/testing specs for any accepted public operation.
4. Update [Core Operations](../CORE_OPERATIONS.md) and `operation-catalog.ts` in the same change as any new public command/query.
5. Preserve CLI, HTTP/oRPC, Web, automation, and future MCP parity over the same operation schema.
6. Record public docs/help anchors or an explicit not-user-facing reason.
7. Keep runtime/provider/strategy specifics in adapters, providers, integrations, plugins, or registry/catalog infrastructure, not in `packages/core`.

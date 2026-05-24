# ADR-065: Blueprint Format And Local Registry Boundary

Status: Proposed

## Context

Appaloft has used planning terms such as Resource Template, Workload Profile, catalog, and registry for future reusable deployment patterns. Those names are too narrow for the product concept we need. The target concept is not a text template, code scaffold, starter project, Docker Compose shortcut, or catalog listing. It is a portable topology definition that can be instantiated into Appaloft's existing Resource, Workload, ResourceBinding, RuntimePlan, EnvironmentSnapshot, route intent, and Deployment planning model.

Community Appaloft must keep this capability open, neutral, and local-first. Users should be able to copy a portable manifest such as `pocketbase.blueprint.json` into their own Appaloft instance and import or create a local Blueprint without depending on a hosted catalog.

## Decision

- The canonical domain language is `Blueprint`. Historical `Template` wording is a compatibility or user-slang alias only and should not be used as the normative name for this concept.
- Blueprint is a portable, versioned, instantiable application or service topology definition. It is not a Deployment, not a Project, not a Resource, and not a Catalog Listing.
- Community Appaloft owns an open Blueprint format, a local/file-based Blueprint registry boundary, and file import/export/copy semantics for `*.blueprint.json` and optional `*.blueprint.yaml`.
- The MVP direction is file-first and JSON-first. JSON is the canonical validation and machine-processing shape. YAML may be a human-friendly authoring format only when it maps cleanly to the same JSON Schema model.
- A database is not required to define a Blueprint. Persistence may index imported files, installed instances, read models, or local registry metadata, but the portable manifest remains a valid definition source.
- Blueprint instantiation takes a BlueprintVersion plus user inputs and a target environment/profile, then produces existing Appaloft desired-state concepts such as Resource profile changes, ResourceDesiredState, WorkloadSpec, RuntimeProfile, ResourceBinding intent, route intent, StaticArtifactIntent when applicable, and Deployment planning input.
- Runtime/provider-specific rendering remains behind existing adapters, providers, plugins, and runtime target backends. Blueprint definitions must not expose Docker, Swarm, Kubernetes, DNS, object storage, or other provider-specific details as the public contract when a portable Appaloft concept exists.
- A local registry or catalog entry may reference a BlueprintVersion, but discovery metadata is not the Blueprint itself.
- `McpServerBlueprint` means a deployable Blueprint that includes an MCP server component. `McpToolListing` or gateway registration is a separate tool interface concept. Installing a server Blueprint may later produce gateway integration metadata, but gateway calls must still dispatch through accepted Appaloft command/query paths.

## Consequences

- Future specs and code must use `Blueprint`, `BlueprintDefinition`, `BlueprintVersion`, `BlueprintComponent`, `BlueprintParameter`, `BlueprintSecretPlaceholder`, `BlueprintEnvironmentProfile`, `BlueprintResourceRequirement`, and `BlueprintInstantiation` when modeling this capability.
- Existing documents that talk about Resource Templates or Template Catalogs should be migrated to Blueprint language unless they are describing command skeleton files, config string interpolation, or unrelated template mechanics.
- Community can ship neutral built-in Blueprint files and local registry/import/export behavior without requiring any hosted catalog.
- Blueprint installation must compile into existing Appaloft application operations and deployment planning. It must not become a second deployment engine.
- The v1 neutral implementation may start as a package-level capability: schema, JSON/YAML loader, validator, local/file registry port, install-plan compiler, sample manifests, and tests. CLI/API/import execution can follow in a later operation spec.
- The neutral resource requirement vocabulary can include mainstream dependency kinds such as `mysql`, `clickhouse`, and `opensearch` when they are expressed only as portable Blueprint dependencies, not as Cloud marketplace, provider, billing, or managed-service promises.
- Future import/export commands, persisted registry indexes, real install execution, and MCP integration work need their own Spec Round and test matrix before Code Round.

## Alternatives Considered

- Continue calling the concept Template: rejected because it implies scaffolding or text substitution and hides the topology/instantiation semantics.
- Make the registry database-first: rejected because portable file copy/import/export is required for local-first Community use.
- Treat catalog/listing metadata as the Blueprint: rejected because discovery metadata, trust metadata, and local registry records are separate from the portable definition.
- Model MCP tools as Blueprints: rejected. A Blueprint may deploy an MCP server; tool listing, gateway authorization, audit, and calls are separate interface concerns.

# Plan: Source Binding And Auto Deploy

## Governing Sources

- ADRs: ADR-010, ADR-012, ADR-014, ADR-016, ADR-024, ADR-025, ADR-026, ADR-028, ADR-029, ADR-037
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Candidate local specs:
  - `docs/commands/resources.configure-auto-deploy.md`
  - `docs/commands/source-events.ingest.md`
  - `docs/queries/source-events.list.md`
  - `docs/queries/source-events.show.md`
  - `docs/errors/source-events.md`
- Global contracts:
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
  - `docs/architecture/async-lifecycle-and-acceptance.md`
- Existing local specs:
  - `docs/commands/resources.configure-source.md`
  - `docs/commands/deployments.create.md`
  - `docs/commands/source-links.relink.md`
  - `docs/workflows/deployment-config-file-bootstrap.md`
  - `docs/testing/source-link-state-test-matrix.md`
  - `docs/testing/deployment-config-file-test-matrix.md`

## Architecture Approach

### Core

- Add Resource-owned auto-deploy policy value objects only after Code Round settles policy fields.
- Keep policy separate from `ResourceSourceBinding`; source binding says where deployment source
  comes from, auto-deploy policy says which source events may create deployment attempts.
- Keep source event identity, ref selector, event kind, delivery id, and signature result as explicit
  value objects if they enter core state.

### Application

- Add candidate command/query slices:
  - `ConfigureResourceAutoDeployCommand`;
  - `IngestSourceEventCommand`;
  - `ListSourceEventsQuery`;
  - `ShowSourceEventQuery`.
- `IngestSourceEventUseCase` must depend on ports for signature verification, policy read model or
  repository lookup, source event persistence, deployment command dispatch, and mutation
  coordination.
- Application logic, not provider transport adapters, owns policy matching and dedupe decisions.
- Deployment creation must dispatch the existing `CreateDeploymentCommand` or use an internal
  application service that preserves the same command schema and async acceptance semantics.

### Persistence And Read Models

- Add source event tables/read models for normalized safe facts, delivery status, ignored reasons,
  matched policies, and created deployment ids.
- Scope first source event list/show read models by project and resource; global operator rollups
  remain future.
- Add Resource auto-deploy policy persistence through the owning Resource aggregate or a
  Resource-owned configuration table only if an ADR/spec explicitly chooses that shape.
- Dedupe must be durable across process restarts.

### Entrypoints

- CLI:
  - configure Resource auto-deploy policy;
  - list/show recent source events;
  - optionally test generic signed webhook payloads locally.
- HTTP/oRPC:
  - policy command/query routes;
  - provider/generic event ingestion route using shared input schema after transport-specific
    signature extraction.
- Web:
  - Resource settings affordance for enable/disable and selector display;
  - Resource/deployment detail link to source event that triggered deployment.
- Public docs/help:
  - task-oriented setup guide for push auto-deploy;
  - generic signed deploy webhook guide;
  - duplicate delivery, ignored event, and manual retry explanation.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: not releasing in this round.
- Compatibility impact: `pre-1.0-policy`, additive operation surface and webhook endpoint.
- Release notes: required when Code Round activates policy or ingestion endpoints.

## Test Strategy

Minimum stable test ids for Code Round:

- `SRC-AUTO-POLICY-001`: configure policy for Resource with source binding.
- `SRC-AUTO-POLICY-002`: reject policy for Resource without compatible source binding.
- `SRC-AUTO-EVENT-001`: matching verified push creates deployment.
- `SRC-AUTO-EVENT-002`: duplicate delivery does not create duplicate deployment.
- `SRC-AUTO-EVENT-003`: non-matching ref is ignored with safe reason.
- `SRC-AUTO-EVENT-004`: invalid generic signature rejects before policy matching.
- `SRC-AUTO-ENTRY-001`: CLI, HTTP/oRPC, Web, and future MCP/tool schemas map to the same
  operations.

## Risks And Migration Gaps

- Durable process state and delivery retry semantics overlap with Phase 8 outbox/inbox work. ADR-037
  permits a Phase 7 durable source-event record plus synchronous dispatch baseline, but automatic
  retry remains deferred.
- Generic signed webhooks start with Resource-scoped secret references; reusable webhook credentials
  remain future.
- GitHub App webhook ingestion and product-grade PR preview are adjacent but separate roadmap items.
- Auto-deploy must not bypass `deployments.create` admission, resource-runtime coordination,
  environment snapshotting, or deployment recovery semantics.

## Code Round Readiness

Resource-owned auto-deploy policy domain behavior, inactive `resources.configure-auto-deploy`
application command handling, Resource repository persistence, inactive source-event command/query
handling, and durable source-event dedupe/read models are implemented and bound to
`SRC-AUTO-POLICY-001`, `SRC-AUTO-POLICY-002`, `SRC-AUTO-POLICY-003`, `SRC-AUTO-EVENT-002`,
`SRC-AUTO-QUERY-001`, and `SRC-AUTO-QUERY-002` core/application/PGlite tests.

The broader feature remains before activation. Before CLI/HTTP/Web exposure, implement the
provider-neutral verification/normalization ports, deployment dispatch through existing deployment
admission, and decide the first adapter slice for provider Git versus generic signed webhook
ingestion.

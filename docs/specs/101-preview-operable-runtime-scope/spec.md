# Preview Operable Runtime Scope

## Status

- Round: Spec -> Test-First -> Code
- Artifact state: Active
- Behavior id: `101-preview-operable-runtime-scope`
- Governing decision: [ADR-086](../../decisions/ADR-086-preview-operable-runtime-scope.md)

## Business Outcome

Users, operators, and AI agents can treat a product-grade preview as a temporary service runtime
scope. The same service operations used for a Resource, such as logs, health, diagnostics, runtime
control, terminal access, dependency readback, and safe dependency inspection, can target a preview
without inventing a parallel preview command model.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Preview Operable Runtime Scope | A temporary service-operation target resolved from a Preview Environment to its parent Resource and preview runtime context. | Preview lifecycle / runtime operation | preview scope |
| Preview Selector | Transport input such as `previewEnvironmentId` or CLI `--preview` that selects a Preview Operable Runtime Scope. | CLI/API/MCP/Web | preview id |
| Parent Resource | The Resource from which the Preview Environment is derived. | Workspace / Resource operation | source Resource |
| Preview Runtime Context | The deployment/runtime evidence that belongs to the selected Preview Environment. | Release orchestration / runtime observation | preview deployment context |
| Safe Dependency Query | A bounded read-only dependency operation that never exposes raw connection material and runs through provider-neutral Appaloft adapters. | Dependency resource operation | dependency query |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| PREVIEW-OPS-SPEC-001 | Preview scope is positioned as Resource-derived | A developer updates preview operability behavior | They read source-of-truth docs | The ADR, operation map, feature spec, and test matrix state that preview operability resolves through PreviewEnvironment -> parent Resource -> preview runtime context, not through transport/provider shortcuts. |
| PREVIEW-OPS-OBS-001 | Runtime logs target preview scope | A Preview Environment has a parent Resource and observable preview deployment | User requests resource logs with a preview selector | Appaloft resolves the preview to the parent Resource plus preview deployment/runtime context and dispatches `resources.runtime-logs` without falling back to production/latest non-preview runtime. |
| PREVIEW-OPS-OBS-002 | Health and diagnostics target preview scope | A Preview Environment has runtime/proxy/deployment evidence | User requests health or diagnostic summary with a preview selector | Appaloft resolves the same preview context and returns read-only health/diagnostic output with preview metadata and no raw secrets. |
| PREVIEW-OPS-CTRL-001 | Runtime restart targets preview scope | A Preview Environment has retained runtime metadata | User requests runtime restart with a preview selector | Appaloft dispatches the existing Resource runtime control command for the preview runtime context, records safe preview metadata, and does not create a deployment attempt. |
| PREVIEW-OPS-TERM-001 | Terminal opens for preview scope | A Preview Environment has safe runtime or workspace metadata | User opens a terminal with a preview selector | Appaloft opens `terminal-sessions.open` against the parent Resource and preview deployment context; terminal output/input is not persisted. |
| PREVIEW-OPS-DEP-001 | Dependency bindings are readable for preview scope | A preview deployment has dependency binding snapshot/provenance | User lists dependency bindings with a preview selector | Appaloft returns only bindings associated with the preview Resource/runtime context and masks all connection material. |
| PREVIEW-OPS-DEP-002 | Dependency inspect is safe and bounded | A preview dependency binding points to a ready dependency resource | User inspects the dependency through preview scope | Appaloft returns kind, readiness, masked endpoint, version/shape when available, and allowed safe-query capabilities without raw URLs/passwords. |
| PREVIEW-OPS-QUERY-001 | Postgres safe query is read-only | A preview Postgres dependency is ready | User runs a safe query through preview scope | Appaloft enforces read-only policy, timeout, row/byte limits, redaction, and structured errors for disallowed SQL. |
| PREVIEW-OPS-QUERY-002 | Redis safe query is allowlisted | A preview Redis dependency is ready | User runs a safe Redis command through preview scope | Appaloft allows only bounded read commands and rejects mutation/admin commands before adapter execution. |
| PREVIEW-OPS-MCP-001 | MCP mirrors preview-capable operations | Operation catalog entries accept preview selectors | MCP descriptors are generated | Preview-capable operation tools use the same schemas, query tools remain read-only/idempotent, and no preview-only MCP mutation bypasses command/query buses. |

## Domain Ownership

- Bounded contexts: Release orchestration owns PreviewEnvironment identity; Resource/runtime
  operation contexts own logs, health, diagnostics, runtime control, and terminal operation;
  Dependency Resources own dependency readback and safe query policies.
- Aggregate/resource owner: PreviewEnvironment provides scope resolution; Resource remains the
  service-operation owner; DependencyResource remains the dependency operation owner.
- Upstream/downstream contexts: Runtime adapters, terminal gateways, dependency adapters, CLI,
  HTTP/oRPC, Web, SDK metadata, and MCP consume the resolved scope through application ports.

## Public Surfaces

- API/oRPC: preview-capable resource/dependency operation schemas accept `previewEnvironmentId`.
- CLI: preview-capable commands add `--preview <previewEnvironmentId>` without creating a
  separate preview command namespace.
- Web/UI: preview detail exposes operational tabs backed by the same oRPC operations.
- Config: no committed config field is added by this behavior.
- Events: no new domain event is required for read-only preview observation. Runtime control and
  terminal audit keep existing event/audit boundaries with safe preview metadata when available.
- Public docs/help: product-grade preview docs and operation help explain preview operation
  inheritance and exclusions.
- MCP/tools: operation-catalog descriptors and handlers mirror the same schemas.

## Non-Goals

- No preview policy mutation through preview runtime operation commands.
- No automatic inheritance of billing, organization, project/environment/resource/server admin,
  domain, certificate, retention, or provider-account operations.
- No raw connection string, password, token, SSH key, terminal output, or unbounded query result in
  logs, errors, read models, MCP results, or public docs.
- No direct Docker/SSH/database/Redis/provider calls from CLI, Web, HTTP, or MCP transports.

## Open Questions

1. Should CLI expose only `--preview <id>` first, or also a generic `--scope preview:<id>` alias in
   the same release?
2. Should safe dependency query result samples be retained for audit as hashes/counts only, or not
   retained at all in the first implementation?

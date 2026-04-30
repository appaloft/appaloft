# Plan: Deployment Plan Preview

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-010, ADR-012, ADR-014, ADR-016, ADR-021, ADR-023, ADR-034
- Global contracts: `docs/errors/model.md`,
  `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs: `deployments.create`, `deployments.show`, `resources.show`,
  `resources.proxy-configuration.preview`, `workload-framework-detection-and-planning`
- Test matrices: `deployment-plan-preview`, `workload-framework-detection-and-planning`,
  `deployments.create`, `quick-deploy`, `public-documentation`
- Implementation plans: `deployment-plan-preview`, `deployment-runtime-substrate-plan`

## Architecture Approach

### Query Placement

Add `deployments.plan` as a Release orchestration read query. The vertical slice should include:

- schema: `DeploymentPlanQueryInput` and preview DTOs;
- query: `DeploymentPlanQuery`;
- handler: `DeploymentPlanQueryHandler`;
- query service: `DeploymentPlanQueryService`;
- reusable application policy/service for plan preview assembly.

The query service should reuse the same runtime planning boundary that `deployments.create` uses
for source inspection, planner selection, artifact intent, command specs, network, health, and
target capability checks. It must stop before attempt creation and runtime execution.

### Repository/Read-Model Impact

The first Code Round should not require a persistence migration because the plan preview is
ephemeral and read-only.

The query needs read access to:

- project/environment/resource/server/destination context;
- current Resource source/runtime/network/health/access profile;
- target/destination/provider summary;
- existing access/proxy planning summary when available.

If the implementation cannot build a safe access summary from existing read models, return an
`accessPlanUnavailable` warning instead of creating new state.

### Event/CQRS Impact

`deployments.plan` is a Query. It emits no deployment lifecycle events and creates no async process
state.

The handler dispatch path must be the normal QueryBus path for CLI, HTTP/oRPC, Web, and future
MCP/tools. Web components and CLI renderers may format the result, but must not own planner rules.

### Entrypoint Impact

Planned surfaces:

- HTTP/oRPC query route over the shared schema.
- CLI `appaloft deployments plan ...` with human and JSON output.
- Web read-only affordance in Quick Deploy or Resource detail.
- Future MCP/tool descriptor mapped to `deployments.plan`.
- Public docs/help anchor `deployment-plan-preview`.

### Operation Catalog Impact

Code Round must update `docs/CORE_OPERATIONS.md` and
`packages/application/src/operation-catalog.ts` in the same change that exposes the operation.

## Roadmap And Compatibility

- Roadmap target: Phase 5 First-Deploy Engine And Framework Breadth.
- Version target: future `0.7.0` only when the rest of Phase 5 is checked.
- Compatibility impact: `pre-1.0-policy`; new public query, CLI command, HTTP/oRPC route, Web
  output, i18n keys, and docs/help anchor.
- Release notes: required when active because users gain a new pre-deploy inspection operation.

## Testing Strategy

Dedicated stable ids live in
`docs/testing/deployment-plan-preview-test-matrix.md`.

Minimum Code Round automation:

- application query tests for ready plan, unsupported framework, missing static output, missing
  start command, Dockerfile, Compose, prebuilt image, and custom-command paths;
- contract tests proving no deployment attempt or events are created;
- HTTP/oRPC route/client contract tests for the shared query schema;
- CLI tests for human and JSON output;
- Web component or browser-level tests proving the preview is read-only and links remediation to
  resource profile commands;
- operation catalog/docs registry coverage for public docs/help.

## Public Docs/Help Outcome

Docs Round target:

- Public page: Deploy or Start page that explains previewing a deployment plan before execution.
- Stable anchor: `deployment-plan-preview`.
- Help registry topic: `deployments.plan`.
- Public docs must explain what the user sees before deploying:
  detected framework/runtime evidence, planner/support tier, artifact kind, commands, internal port,
  health/access plan, warnings, unsupported reasons, and next configuration actions.

## Risks And Migration Gaps

- The preview may duplicate parts of runtime planning until `deployments.create` and
  `deployments.plan` share a single application service.
- Access route planning may be partial in the first Code Round.
- Current acceptance-first migration gaps in `deployments.create` remain out of scope.
- Draft-profile preview before resource persistence is deferred to a future Quick Deploy/spec
  round.

## Post-Implementation Notes

The first active Code Round is complete for application query, operation catalog, HTTP/oRPC, CLI,
Resource deployment Web affordance, public docs/help, i18n, and targeted entrypoint/docs tests.
Full fixture-level query behavior tests and side-effect assertions remain a migration gap tracked in
the implementation plan.

## Code Round Readiness

Ready for Code Round after:

- operation map positions `deployments.plan` as an active-query target;
- local query/error/test/implementation docs exist;
- stable matrix ids cover required success, blocked, artifact, and entrypoint parity cases;
- no ADR-required boundary change is discovered.

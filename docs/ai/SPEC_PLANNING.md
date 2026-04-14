# Documentation Planning For Command/Event/Async/Error Evolution

> Analysis date: 2026-04-13.

## Recommended Documentation Tree

Current core source-of-truth files to keep:

```text
docs/
  ARCHITECTURE.md
  CORE_OPERATIONS.md
  DOMAIN_MODEL.md
  PRODUCT_ROADMAP.md
  TESTING.md
```

Recommended next structure:

```text
docs/
  architecture/
    command-event-async-error.md
    cqrs-process-boundaries.md
  domain/
    contexts.md
    aggregates.md
    state-machines.md
  commands/
    _TEMPLATE.md
    deployments.create.md
    servers.register.md
    ...
  events/
    _TEMPLATE.md
    deployment_target.registered.md
    deployment.finished.md
    ...
  errors/
    _TEMPLATE.md
    error-catalog.md
    mappings.md
  workflows/
    _TEMPLATE.md
    quick-deploy.web.md
    deploy.interactive-cli.md
    server-edge-proxy-bootstrap.md
  testing/
    SPEC_DRIVEN_TESTING.md
    command-matrix-template.md
    event-flow-matrix-template.md
  ai/
    README.md
    CURRENT_STATE.md
    SPEC_PLANNING.md
    GAP_ANALYSIS.md
    EXAMPLE_SPECS.md
```

This round creates the AI planning files and templates first. Concrete command/event files should
be added gradually, starting with high-risk flows.

## File Responsibilities

Architecture files:

- Explain system goals, package boundaries, dependency direction, CQRS constraints, async
  consistency choices, process-manager boundaries, and error model principles.
- Do not duplicate every command. Link to command/event specs instead.

Domain files:

- Explain bounded contexts, aggregate ownership, entity/value-object rules, state machines, and
  consistency boundaries.
- Keep compatibility naming explicit, especially `DeploymentTarget` vs `Server`.

Command specs:

- Define one business operation per file.
- Act as the contract for Web, CLI, HTTP/oRPC, and future MCP.
- Include input model, preconditions, sync/async steps, emitted events, returned result, errors,
  idempotency, and tests.
- Reference `CORE_OPERATIONS.md` and `operation-catalog.ts`.

Event specs:

- Define one event per file.
- Distinguish domain, application, integration, technical, and progress-stream events.
- Include publisher, consumer, payload, state progression, retry, idempotency, observability, and
  failure behavior.

Workflow specs:

- Describe input collection and multi-step UX flows such as Web QuickDeploy and CLI interactive
  deploy.
- Must end by naming the commands actually dispatched.
- Must not redefine business rules that belong in command specs.

Error specs:

- Define the error taxonomy, stable codes, structures, mappings to HTTP/CLI/UI/logs, and
  assertions.
- Document synchronous command rejection separately from asynchronous processing failure.

Testing specs:

- Map command/event/error specs to test layers.
- Define matrix formats and naming conventions.
- Require assertions over state, event, error code/type/phase, and idempotency rather than only
  function calls.

AI files:

- Capture reverse-engineered reality and migration guidance for future agents.
- Should be updated when major architecture decisions change or when a new current-state gap is
  discovered.

## First Concrete Specs To Add

High priority:

- `docs/commands/deployments.create.md`
- `docs/events/deployment.finished.md`
- `docs/events/deployment_target.registered.md`
- `docs/workflows/server-edge-proxy-bootstrap.md`
- `docs/workflows/quick-deploy.web.md`
- `docs/errors/error-catalog.md`

Medium priority:

- `docs/commands/deployments.cancel.md`
- `docs/commands/deployments.redeploy-resource.md`
- `docs/commands/deployments.rollback.md`
- `docs/commands/servers.register.md`
- `docs/events/deployment.started.md`
- `docs/events/deployment_target.edge_proxy_bootstrap_failed.md`

Low priority for now:

- Concrete specs for foundational but not yet public aggregates such as `Release`,
  `ResourceBinding`, `ProviderConnection`, and `PluginInstallation`, unless a feature starts using
  them.

## Documentation Update Rule

When adding or changing a business capability:

1. Update `docs/CORE_OPERATIONS.md`.
2. Update `packages/application/src/operation-catalog.ts`.
3. Add or update the relevant command spec.
4. Add or update event specs for any domain/application events emitted or consumed.
5. Add or update workflow specs for UI/CLI input collection if the entry flow changes.
6. Add or update error catalog entries and expected error mappings.
7. Add or update tests to match the spec.

If a capability is intentionally legacy or transitional, document it as `Legacy compatibility` in
the command or workflow spec rather than hiding the inconsistency.

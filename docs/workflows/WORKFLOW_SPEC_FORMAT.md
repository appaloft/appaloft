# Workflow Spec Format

## Normative Contract

Workflow specs describe user-facing or system-facing orchestration that crosses commands, events,
queries, providers, or external actor responsibilities.

Every new or materially changed workflow spec must use this document as the default structure.
[Routing, Domain Binding, And TLS](./routing-domain-and-tls.md) is the reference example for the
complete format.

A workflow spec must not invent hidden domain semantics. It must identify the explicit commands,
events, queries, and provider boundaries that do the durable work.

## Required Structure

Workflow specs should use these sections in this order unless a section is not applicable and the
spec says why.

1. `Normative Contract`
   - Define what the workflow is and is not.
   - State whether it is a first-class workflow, an entry workflow, a process-manager continuation,
     or a compatibility path.
2. `Global References`
   - Link governing ADRs, global error/async contracts, command specs, event specs, query specs,
     related workflow specs, and the test matrix.
3. `End-To-End Workflow`
   - Explain the route from initial intent or trigger to observable completion.
   - Include `Actor Responsibilities`.
   - Include a Mermaid `Success Path`.
   - Include a Mermaid `Failure Branches` diagram.
   - Include `Test Strategy`.
4. `Synchronous Admission` or `Synchronous Admission And Preflight`
   - List validation and admission gates that can reject before durable async work.
   - State which boundary owns each rejection.
5. `Async Work`
   - List process-manager, provider, runtime, scheduler, worker, and event-consumption work.
   - State which durable state/read models make async work observable.
6. `State Model`
   - List workflow-local state separately from aggregate/read-model state.
   - Do not introduce an aggregate unless an ADR accepts that boundary.
7. `Event / State Mapping`
   - Map commands, events, provider callbacks, scheduler ticks, and read-model projections to state
     transitions.
8. `Failure Visibility`
   - Describe how admission errors, async failures, provider failures, retry state, and diagnostic
     data are exposed.
9. Workflow-specific sections
   - Add operation sequence, entry differences, idempotency, partial failure, rollback,
     provider-specific notes, or security sections where relevant.
10. `Current Implementation Notes And Migration Gaps`
    - Keep temporary implementation divergence here.
    - Do not weaken normative sections to match incomplete code.
11. `Open Questions`
    - List unresolved design choices that are not required for the current slice.

## Actor Responsibilities

Every end-to-end workflow must identify at least:

- the initiating user, operator, automation, scheduler, or event source;
- Appaloft entry/application responsibilities;
- provider, runtime, database, VCS, DNS, certificate authority, or other third-party
  responsibilities when present;
- the observable success signal for each actor;
- the failure branch owned by each actor.

Use this table shape:

```md
| Actor | Responsibilities | Success Signal | Failure Branch |
| --- | --- | --- | --- |
| User/operator | | | |
| Appaloft | | | |
| External provider | | | |
```

## Mermaid Diagrams

Every workflow spec must include at least one success-path Mermaid diagram and one failure-branch
Mermaid diagram.

Use `sequenceDiagram` when actor handoffs matter. Use `flowchart TD` when branching and retry paths
matter. Quote node labels that include punctuation or command names.

The diagrams are normative enough to drive test discovery, but the adjacent text and test matrix
remain the source of detailed assertion semantics.

## Test Coverage Rules

Every workflow spec must have a matching `docs/testing/<workflow-name>-test-matrix.md` unless it is
explicitly a reference-only background document.

The test matrix must:

- assign stable test ids to success paths, failure branches, entry differences, and async/retry
  paths;
- name the strongest expected automation level for each row, such as unit, integration,
  e2e-preferred, browser e2e, provider contract, composition integration, or opt-in external e2e;
- state when a real external dependency is replaced by a fake, local adapter, or injected provider;
- document any opt-in tests that require Docker, SSH, public network access, real DNS, real CAs, or
  other mutable third-party systems;
- keep `Current Implementation Notes And Migration Gaps` synchronized with the executable tests.

Executable tests should include the matrix id in the test name whenever possible, for example:

```ts
test("[WORKFLOW-EXAMPLE-001] accepts the happy path through the CLI", async () => {
  // ...
});
```

If a matrix row is covered only by a broader test, the matrix notes must say so. If it is not yet
implemented, the gap must be explicit.

## Entry Surface Rules

Workflow specs must keep Web, CLI, API, automation, and future MCP entrypoints aligned:

- Web and CLI may collect input differently, but writes must dispatch explicit commands or accepted
  workflow events.
- API and automation must not rely on hidden prompts.
- Entry-specific local validation must not replace command-level validation.
- Transport input parameters must reuse command/query schemas rather than redefining parallel
  transport-only input shapes.

## External Dependency Rules

Third-party concepts belong behind provider, integration, persistence, or adapter ports:

- core/application specs define required behavior and interfaces;
- provider/integration packages own vendor vocabulary and SDK details;
- tests prefer fakes or injected clients for deterministic coverage;
- live external tests must be opt-in and must not be the only coverage for a required scenario.

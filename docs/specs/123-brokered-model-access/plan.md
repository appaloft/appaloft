# Plan: Brokered Model Access

## Governing sources

- ADR-094, ADR-100, ADR-103 and ADR-105
- Spec 117 and Spec 120
- `docs/testing/brokered-model-access-test-matrix.md`

## Architecture

1. Define one provider-neutral model access input/descriptor contract shared by reference harnesses.
2. Extend `SandboxAgentHarness.execute` with the Runtime's resolved credential bindings.
3. Make the Runtime application service pass the persisted immutable bindings to the Harness on
   every launch/run, without resolving secret values.
4. Make Pi and OpenCode select exactly one `model-api` binding and pass it to the model access issuer.
5. Fail before provider process launch when the binding is missing, ambiguous or structurally stale.
6. Preserve existing Workspace/Profile operations and generated surface parity.

## CQRS and persistence

- No new command, query, aggregate, event or table.
- Profile configuration and compilation remain the mutation boundary for named references.
- Runtime records already persist the resolved safe binding snapshot; the Code Round only carries
  that state across the existing execution port.

## Testing strategy

- Application tests prove immutable binding propagation and absence of secret resolution.
- Pi/OpenCode harness tests prove exact selection, missing/ambiguous failure and capability-only
  child configuration.
- Existing operation-catalog/HTTP/SDK/MCP parity tests prove that no parallel entrypoint appears.
- Hosted rotation/revoke/audit and real-provider behavior belong to the companion Cloud matrix.

## Compatibility and rollout

- Add the execution input additively and update every built-in/test harness implementation.
- Harnesses without a model requirement remain unaffected.
- A model-required harness that cannot consume brokered access fails closed rather than receiving a
  raw provider key.

## Risks

- Treating all credential bindings as model access would allow confused-deputy selection; selection
  must require `kind = model-api` and exact cardinality.
- Capability tokens and safe Connection references remain sensitive metadata and must stay out of
  durable public events and snapshots unless already part of an explicitly ephemeral descriptor.

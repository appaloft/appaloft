# Round Artifacts

Use this reference before any non-trivial behavior round.

## Contents

- Artifact state model
- Appaloft artifact graph
- Behavior dossier
- Change intent
- Incremental vs complete readiness
- Update vs new behavior

## Artifact State Model

Classify every artifact in the current behavior dossier:

| State | Meaning |
| --- | --- |
| `done` | Required artifact exists and is sufficient for the current round. |
| `ready` | Dependencies are done, and this artifact can be created or reconciled now. |
| `blocked` | Missing dependency, unresolved decision, absent behavior-map position, or user permission boundary prevents work. |
| `not-applicable` | Surface does not apply for a named domain reason. |
| `deferred-gap` | Surface is intentionally deferred and named in migration gaps or implementation notes. |

Do not treat a file's existence as `done` if its content does not answer the behavior question. Mark it `ready` or `blocked` and explain why.

## Appaloft Artifact Graph

Use this graph as the default dependency order. A later artifact can be `not-applicable`, but it must not be silently skipped.

1. **Behavior identity and operation-map position**
   - Behavior name, command/query name, aggregate/resource owner, and `docs/BUSINESS_OPERATION_MAP.md` state.
   - New or absent behaviors are blocked for implementation until positioned.

2. **ADR/global-contract decision**
   - Relevant accepted ADRs and global contracts.
   - ADR need/no-need decision for command boundary, ownership, lifecycle, readiness, retry, durable state, route/domain/TLS, and async acceptance semantics.

3. **Local behavior specs**
   - Command/query spec.
   - Workflow spec.
   - Event spec when events are emitted or consumed.
   - Error spec when error codes, categories, or phases change.
   - Query/read-model spec when observable state changes.

4. **Public docs outcome**
   - Public page or stable anchor.
   - Existing anchor reuse.
   - Not-user-facing reason.
   - Explicit docs migration gap.

5. **Test matrix**
   - Stable matrix ids for happy path, validation, lifecycle transitions, workflow branches, error mapping, emitted events, read/query observability, and Web/API/CLI entrypoints where applicable.
   - Preferred automation level for each row.

6. **Implementation plan**
   - Existing implementation plan, new plan, or explicit small-scope rationale.
   - Cross-module ownership and smallest coherent behavior slice.

7. **Automated tests**
   - Test file names.
   - Test names include matrix ids.
   - Required CLI or HTTP/oRPC e2e/acceptance row exists for every new or changed command, unless explicitly excepted by the matrix.

8. **Code, read model, and entrypoints**
   - Core/application/persistence/read model/event/error changes.
   - CLI, HTTP/oRPC, Web, repository config, and future MCP/tool entrypoint state.
   - Operation catalog and `docs/CORE_OPERATIONS.md` sync for new business capabilities.

9. **Post-Implementation Sync report**
   - Verification result across Completeness, Correctness, and Coherence.
   - Ready/not-ready decision.
   - Remaining gaps and next behavior recommendation when relevant.

## Behavior Dossier

Create or refresh this compact dossier before edits:

```markdown
## Behavior Dossier

- Behavior:
- Operation/catalog name:
- Operation-map position/state:
- Current round:
- Execution mode: incremental readiness | complete readiness
- Code changes allowed:
- Public/user-visible:
- Governed ADRs:
- Global contracts:
- Command/query specs:
- Event specs:
- Workflow specs:
- Error specs:
- Testing specs/test matrix ids:
- Implementation plan:
- Public docs page/stable anchor:
- Core/application modules:
- Persistence/read model modules:
- Runtime/provider/integration modules:
- Web entrypoints:
- HTTP/API/oRPC entrypoints:
- CLI entrypoints:
- Repository config fields:
- Future MCP/tool surfaces:
- Remaining migration gaps:
- Open questions:
```

For lightweight questions, keep the dossier internal. For non-trivial edits, share enough of it for the user to understand the round and blockers.

## Change Intent

Use change intent to keep brownfield edits focused. It is a planning aid, not a competing source of truth.

```markdown
## Change Intent

### ADDED
- Requirement:
- Scenario:
- Matrix row:
- Entrypoint:
- Public docs anchor:

### MODIFIED
- Requirement:
- Scenario:
- Matrix row:
- Entrypoint:
- Public docs anchor:

### REMOVED
- Requirement:
- Scenario:
- Matrix row:
- Entrypoint:
- Public docs anchor:
- Reason:
- Migration:

### RENAMED
- From:
- To:
- Affected docs/code/tests:
```

Apply accepted intent directly to Appaloft's normative docs, code, and tests. Do not leave a permanent delta-spec layer beside source-of-truth docs.

## Incremental vs Complete Readiness

Use **incremental readiness** when:

- the user asks to continue one step at a time;
- requirements are still being discovered;
- a behavior-map, ADR, public-docs, or test-matrix decision needs review;
- the next artifact can be completed independently and safely.

Incremental mode creates or reconciles exactly one ready artifact, refreshes the dossier, and stops.

Use **complete readiness** when:

- the behavior is clear;
- the user asks to prepare the behavior for implementation or finish readiness;
- all next artifacts are governance/spec/test/doc artifacts, not unauthorized business code.

Complete mode may create every ready governance artifact needed to reach the next permission boundary. It must not cross into Code Round unless the user explicitly allowed implementation.

## Update vs New Behavior

Update the same behavior when:

- intent remains the same;
- operation/catalog entry remains the same;
- scope narrows or implementation learning refines the same target;
- original behavior cannot honestly be called complete without the change.

Start or ask about a new behavior when:

- intent changes;
- operation boundary changes;
- ownership scope changes;
- the original behavior can be completed independently;
- the additional work would require a separate ADR, public docs page, or operation catalog entry.

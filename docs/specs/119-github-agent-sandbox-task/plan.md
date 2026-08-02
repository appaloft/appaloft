# Plan: GitHub-Driven Agent Sandbox Tasks

## Governing Sources

- `docs/DOMAIN_MODEL.md`
- `docs/BUSINESS_OPERATION_MAP.md`
- ADR-091, ADR-094, ADR-095, ADR-097, ADR-100, and ADR-102
- `docs/specs/119-github-agent-sandbox-task/spec.md`
- `docs/testing/github-agent-sandbox-task-test-matrix.md`

## Public Architecture

1. Extend GitHub verification/normalization for the supported events using numeric provider ids,
   strict action schemas, bounded comment content, and an explicit safe command grammar.
2. Extend SourceEvent kinds and the existing atomic dedupe inbox instead of adding a GitHub-only
   delivery store.
3. Add `RepositoryBinding` and `ProjectAutomationRule` aggregates with selection/mutation specs,
   repositories, read models, operations, events, and persistence.
4. Add `AgentProfile` as a tenant configuration aggregate that references exact existing Adapter
   and Agent Workspace Profile installations. Extend `Connection` with the `agent` category and
   typed non-secret credential metadata/auth modes.
5. Add neutral ports for numeric actor identity, ordered authorization resolution, repository
   permission, native credential enrollment/resolution, GitHub feedback/delivery, and Task-thread
   process state.
6. Evolve Agent Task persistence from one Run to a stable Task id plus `activeRunId` and bounded
   ordered lineage. Add recoverable stop, steer, resume, native session reference, truthful
   fallback context, and cleanup readback.
7. Compose GitHub triggers into existing Workspace create/recover, Agent Task, Preview, Git
   delivery, durable work, and retention operations. No new Workspace/Preview/Deployment model.
8. Expose all management and Task-detail operations through the operation catalog, HTTP/oRPC,
   generated SDK, CLI, MCP metadata where applicable, and public Web.
9. Add provider-neutral GitHub feedback ports and GitHub adapters that upsert reaction/comment,
   Check, Review, PR, and annotations using persisted external ids and stable idempotency keys.
   Keep the status comment and Check ids on the current thread/Task binding so distinct
   `status`/`steer`/`stop`/`resume` deliveries and a process restart reuse the same bounded feedback
   objects without merging per-command acknowledgement reactions.
10. Register the public `GitHubAgentAutomationStore` in the public server composition and expose
    neutral seams for generic GitHub signature verification, immutable accepted hydrated
    trigger/execution context,
    repository materialization, Workspace Profile preview plans, and bounded Task/Review/PR
    projection. Hosted runtimes resolve and compose these seams instead of reimplementing them.
11. Keep reservation, Sandbox creation, source materialization, initialization, runtime creation,
    recovery evidence, and preferred-Workspace state inside `AgentWorkspaceOpenService`. Per-task
    credentials plus their explicit owner/Agent-Profile/use/untrusted/server-pool admission scope, requested
    placement, expiry, an optional immutable public-compiled Profile plan, and source materializers
    are operation inputs, not a reason for downstream runtimes to recreate the lifecycle.
12. Use `AgentCredentialEnrollmentPort` as the single neutral native enrollment contract. Hosted
    composition may supply authorization and encrypted custody, but must not introduce a second
    begin/complete/cancel port.
13. Resolve an exact GitHub source pin through the public integration before authorization for
    compute-starting intents. Hydrate PR-top-level comments before fork policy and require the
    resolved SHA during repository materialization; never use ambient `HEAD` as lifecycle truth.
14. Persist optional organization identity in Sandbox Agent durable-work safe input and reconstruct
    the same resolved tenant scope in the worker.
15. Before a persisted credential-bound Runtime executes after restart, replay the existing
    idempotent process-credential admission port from the Runtime's persisted Profile pin and
    credential bindings; do not add a second admission repository or hosted lifecycle model.
16. Reuse the Execution Sandbox workspace-scoped process-home contract for every GitHub Agent
    process. Provider exec/terminal boundaries and native Adapter probes must agree on writable
    HOME/XDG paths so compute-released resume does not depend on root/global state.
17. Fence runtime activity bookkeeping from Sandbox lifecycle transitions. Re-read the authoritative
    Sandbox after the provider call and never save a stale ready aggregate over pause, resume,
    termination, or reconciliation state.
18. Keep native Agent state bounded inside the Workspace-scoped HOME/XDG contract. Disable
    redundant OpenCode snapshots because Appaloft already owns authoritative Git Diff, Task
    evidence, and Sandbox recovery; preserve the native session store and provider/model protocol.

## Migration

- Preserve existing one-run Agent Task state by interpreting the old run as the first and active
  lineage entry.
- Add database tables/columns with tenant scope and unique constraints for repository binding,
  rule execution key, SourceEvent delivery dedupe, thread current-task pointer, and Task lineage.
- Keep secret material outside migrations; credential state stores only references and safe
  metadata.
- Make older SourceEvent kinds and source deployment dispatch behavior unchanged.
- Downstream/hosted migrations must not add delivery-outcome, review-execution, thread-task,
  Workspace, Task, Preview, Deployment, or Agent-session truth already owned by public persistence.

## Test Strategy

- Begin with signature, event schema, command grammar, domain invariant, and secret rejection tests.
- Add concurrent delivery and head/rule uniqueness persistence tests.
- Add actor/permission/fork/credential fail-closed contract tests with zero-effect spies.
- Add Task lineage, native resume/fallback, Workspace composition, feedback, Git delivery, Preview,
  retention, and provider-readback cleanup tests.
- Add Sandbox Agent Run failure tests proving the existing Run state persists one stable code and
  bounded redacted summary, survives Postgres round-trip, remains backward compatible with older
  rows, and projects through the existing Agent Task failure field.
- Prove transport parity across catalog, HTTP/oRPC, SDK, CLI, and Web.
- Add `GH-AUTO-BOUNDARY-021` contract/composition tests for dependency registration, immutable
  accepted execution context, neutral materialization/projection seams, and absence of private
  imports or parallel hosted persistence.
- Add Workspace open tests proving task-scoped credential references and a supplied source
  materializer still pass through public preflight, placement, open-entry, recovery, and runtime
  ownership without duplicate effects.
- Add source-resolution tests proving Issue default-branch pins and PR-top-level fork identity are
  resolved before authorization, and that checkout refuses an absent exact pin before credential
  materialization.
- Add a restart regression proving durable work retains organization scope and that a new
  process-credential adapter instance is re-admitted from the existing Runtime record before
  launch, while revoked/cross-scope credentials remain fail closed.
- Add `SBX-RUNTIME-005` and `GH-AUTO-RUNTIME-HOME-024` regressions proving Docker exec/terminal and
  OpenCode native version/server/task processes use the same workspace-scoped HOME/XDG contract,
  including after compute-released resume.
- Add a deterministic late-activity/pause concurrency regression for `GH-AUTO-LIFECYCLE-025` and
  prove the paused recovery handle remains authoritative.
- Run public lint, typecheck, test, and build before public delivery.

## Risks

- Webhook redelivery races require database uniqueness and atomic claim, not an in-memory check.
- Comment text is untrusted prompt input and must never influence credential selection.
- Native credential material requires process-specific injection and must not leak into tests,
  Preview, output, Git evidence, or snapshots.
- GitHub line annotations can become invalid when the head changes; delivery must re-read head SHA.
- Existing Task state is compatibility-sensitive; migration and recovery tests must cover old state.
- Cleanup success requires provider readback and durable retry, not optimistic state mutation.
- Late runtime activity can race pause/resume/terminate; full stale aggregate persistence would
  destroy the current recovery handle, so activity bookkeeping must re-read lifecycle truth.
- A read-only runtime root makes any missing process-home boundary fail as an Agent startup error;
  provider and Adapter tests must assert the rendered environment rather than relying on a base
  image's pre-created root files.

## Delivery Order

1. Complete public artifacts and public tickets.
2. Implement and verify public vertical slices.
3. Commit, push, open, review, and merge the public PR.
4. Resolve the final public `main` SHA.
5. Pin that SHA in Cloud and implement hosted composition.
6. Run a read-only Public/Private Boundary Review Round; hosted Code or merge remains blocked until
   its evidence-based gate is `PASS`.

## Delivery Status

- Public contracts, operations, persistence, adapters, surfaces, and the final existing-Check
  convergence correction are merged through public #953 / PR #954 at
  `7cdd99ca83554bf76184d209199f60a75b3a4679`.
- Downstream hosted composition must still supply and prove tenancy, authorization, credential
  custody, native-provider execution, registered-Server placement, Preview delivery, and exact
  provider cleanup through an explicit opt-in acceptance. Public deterministic tests do not replace
  that evidence.

# ADR-102: GitHub Agent Task Trigger And Composition Boundary

## Status

Accepted on 2026-07-28.

## Context

Appaloft already owns neutral Workspace, execution Sandbox, Agent Runtime/Run, Agent Task,
Preview, Git delivery, SourceEvent, Connection, Adapter, Profile, and durable-work operations.
GitHub-driven Agent work needs installation/repository/project resolution, actor authorization,
automation rules, credential admission, thread continuity, feedback, and exact cleanup. Modeling
those concerns as a new GitHub Workspace or GitHub Task would duplicate existing lifecycle truth.

The integration also handles hostile input. GitHub username is mutable, comments can contain
secrets or prompt injection, deliveries are retried concurrently, pull-request heads change, and
fork code can exfiltrate credentials.

## Decision

1. GitHub remains a trigger and feedback adapter. A normalized GitHub event dispatches the existing
   Agent Task process manager, which composes existing Workspace/Sandbox/Preview/Git operations.
2. `RepositoryBinding` maps numeric provider repository identity and source installation Connection
   to a Project. It is not `SourceLink`, which remains deployment/resource source context.
3. `ProjectAutomationRule` is an independent aggregate with complete event, actor, execution,
   Preview, and PR delivery policy.
4. `AgentProfile` references exact installed Agent Adapter and Agent Workspace Profile definitions,
   a typed Agent Connection, and execution defaults. It does not replace either referenced object.
5. Agent credentials reuse the `Connection` lifecycle with an `agent` category. Public state stores
   only owner/scope/status/expiry/revocation and opaque encrypted references.
6. SourceEvent is the verified delivery inbox and atomic delivery-id dedupe authority. A separate
   unique execution key prevents duplicate review for repository/PR/head/rule.
7. GitHub-thread-to-Task linkage is application process state/read model, not an aggregate. A thread
   has one current controllable Task pointer and retained history.
8. The Agent Task process manager keeps its first Run id as stable Task id and gains active Run,
   bounded lineage, recoverable stop, steer, native session reference, resume, and truthful
   fallback Run behavior.
9. Numeric external identity, organization membership, repository permission, rule, profile,
   server, and credential decisions complete before compute or secret grants. Denials are audited
   safely and have no runtime effects.
10. Feedback is bounded and upserted. Raw Agent output remains in the common Task event stream.
11. Agent credentials are process-scoped and never enter repository code, tests, Preview, Git
    evidence, snapshots, logs, argv, or comments.
12. Cleanup uses existing lifecycle operations and requires provider readback before success.
13. The public server composition registers the authoritative `GitHubAgentAutomationStore`.
    Downstream runtimes resolve it and must not persist a second delivery outcome, review execution,
    or GitHub thread-to-Task pointer.
14. A successful automation outcome carries the normalized intent, the hydrated trigger/source
    snapshot, and complete immutable allowed execution snapshot required by durable finalization.
    Downstream runtimes must not reparse or rehydrate the trigger or reconstruct authorization from
    mutable Rule/Profile state.
15. GitHub signature verification, Repository-to-Workspace materialization, Workspace Profile
    Preview plans, and bounded Task/Review/PR projection are neutral public seams. Hosted
    composition supplies installation credentials, tenancy, custody, authorization, durable
    scheduling, and audit only.
16. A dedicated read-only Public/Private Boundary Review Round blocks downstream Code and merge
    when lifecycle truth, idempotency truth, neutral contracts, or persistence are duplicated.
17. Task-scoped credential references, requested placement, Workspace expiry, and a neutral source
    materializer are inputs to the public Workspace open operation. Credential admission also
    receives an explicit owner, Agent Profile, interactive/automation use, untrusted-code flag, and
    Server-pool scope so hosted custody can validate the lease without bypassing public preflight. A caller may
    pass one immutable plan already produced by the public Profile compiler; open validates its
    installation pin and remains the owner of admission and all runtime effects. These inputs do not
    authorize a hosted runtime to recreate reservation, Sandbox, initialization, runtime, recovery,
    or preferred Workspace lifecycle logic.
18. Native Agent enrollment has one public `AgentCredentialEnrollmentPort`. Hosted implementations
    may provide tenant authorization and encrypted custody, but must implement that port rather than
    publish a parallel enrollment lifecycle.
19. Compute-starting GitHub intents resolve an exact provider source pin before authorization.
    PR-top-level comments are hydrated to a numeric head repository and fork decision before any
    credential lease or compute; Issue tasks resolve the repository default branch to an exact
    commit. Checkout fails closed when that resolved pin is absent and never falls back to `HEAD`.
20. Durable Sandbox Agent work preserves the complete resolved tenant scope needed by credential
    custody, including an optional organization id. Before a persisted Runtime executes a Run after
    process restart, the public Runtime service idempotently replays credential admission from the
    persisted Profile pin and credential bindings. Hosted adapters revalidate current custody and
    repopulate process-local grant state; they must not require a parallel Runtime, Task, or
    credential-admission lifecycle table.
21. Control deliveries for one GitHub repository thread reuse the public `MutationCoordinator`
    before re-reading and mutating the current Task pointer. The tenant-qualified thread scope
    serializes `status`, `steer`, `stop`, and `resume` across concurrent webhook requests while
    unrelated threads remain independent. This adds no GitHub-specific lease table and no new Task,
    Workspace, Sandbox, Agent session, or Git delivery model.

## Consequences

- Public contracts remain useful to Community and other hosted compositions.
- Hosted products can inject tenancy, authz, identity linkage, credential custody, automation
  identity, audit, and entitlement through ports.
- Existing one-Run Task callers require an additive migration but retain stable ids.
- More durable process state and uniqueness constraints are required.
- Native session support remains capability-driven; fallback is visible rather than pretending
  native context survived.
- Hosted implementations become smaller composition adapters and cannot trade short-term wiring
  convenience for a second source of domain or delivery truth.
- Restart-safe credential execution remains rooted in the existing public Runtime record while
  hosted custody can fail closed when the owner scope, connection status, or binding changed.
- Concurrent controls cannot apply a stale thread Task snapshot after a slower prior control
  completes; durable composition supplies the existing heartbeat/fencing mutation coordinator.

## Alternatives Rejected

- A GitHub-specific Task/Workspace/Preview/Deployment model.
- Embedding rules directly in Project or GitHub adapter configuration.
- Reusing SourceLink as the repository-to-Project binding.
- A second credential store or comment-selected credential ids.
- Username-based identity, project-creator automation, root/global HOME sharing, force-push,
  auto-merge, or arbitrary fork execution.

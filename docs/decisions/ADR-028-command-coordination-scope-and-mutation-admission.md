# ADR-028: Command Coordination Scope And Mutation Admission

## Status

Accepted

## Context

Pure CLI, GitHub Actions, and future control-plane modes all mutate Appaloft state and runtime
topology across process boundaries.

Today, SSH `ssh-pglite` mode protects the remote Appaloft state root with one coarse mutation lock.
That protects consistency, but it conflates two different concerns:

- low-level state-root safety for schema migration, mirror/sync, and durable state file updates;
- business-operation coordination for commands such as `deployments.create`,
  `deployments.cleanup-preview`, and `source-links.relink`.

That conflation leaks implementation detail into user-visible failures such as "server has a lock"
even when the real business meaning is "this resource or preview is already being mutated."

Appaloft already has `CommandBus`, but the bus is process-local dispatch. It does not provide
cross-process, cross-runner, or cross-machine queueing or exclusivity on its own.

## Decision

Appaloft distinguishes two coordination layers:

1. **State-root coordination**
   - owned by the selected state backend adapter;
   - protects remote/local Appaloft state preparation, schema migration, sync/mirror upload and
     download, and other state-root maintenance work;
   - may still use coarse locking or leases because the subject is the state root itself;
   - in SSH `ssh-pglite` mode, may also include end-of-command remote revision conflict recovery so
     the state adapter can safely retry a final mirror upload against a fresher remote snapshot;
   - remains infrastructure coordination and does not define end-user command semantics.

2. **Operation coordination**
   - owned by an application-facing mutation coordination port;
   - coordinates business mutation commands by a logical operation scope instead of by the whole
     server or the whole state root;
   - defines user-visible waiting, serialization, and timeout semantics for command admission.

v1 operation coordination is **admission-time bounded waiting**, not durable queued acceptance.
Commands do not create a queued attempt record before acceptance in this ADR. A request may wait for
its coordination scope, then either:

- acquire coordination and continue normal command admission; or
- fail with a retriable coordination timeout/error before acceptance.

Accepted command semantics from the async lifecycle contract remain unchanged.

## Coordination Port

Application/shell composition must treat command coordination as an injected port, separate from
`CommandBus` dispatch:

```ts
interface MutationCoordinator {
  runExclusive<T>(input: {
    policy: CoordinationPolicy;
    scope: CoordinationScope;
    owner: CoordinationOwner;
    work: () => Promise<Result<T>>;
  }): Promise<Result<T>>;
}
```

The implementation source of truth for policies must be an explicit registry adjacent to operation
catalog metadata or another explicit coordination-policy module. Coordination policy must not rely
only on decorator metadata.

Decorators may exist later as a thin convenience layer, but they must not be the sole normative or
implementation source of policy because:

- policy resolution depends on resolved business context such as resource, preview fingerprint, and
  server/destination scope;
- policy must remain reviewable and spec-synchronized in one explicit registry;
- multiple entrypoints and providers must resolve the same policy deterministically.

## Coordination Scope Kinds

The logical scope kind is part of the contract. v1 defines:

| Scope kind | Meaning |
| --- | --- |
| `resource-runtime` | Mutation for one resolved deployable runtime owner, typically the selected resource plus target placement context. |
| `preview-lifecycle` | Mutation for one preview fingerprint and its linked runtime/route cleanup scope. |
| `source-link` | Mutation for one normalized source fingerprint link record. |
| `state-root-maintenance` | Low-level backend maintenance over a state root; infrastructure-only and not the primary user-facing coordination model. |

## Coordination Policies

v1 command coordination policies are:

| Operation | Scope kind | Logical key input | Coordination mode |
| --- | --- | --- | --- |
| `deployments.create` | `resource-runtime` | resolved resource plus selected target placement context | `supersede-active` |
| `deployments.cleanup-preview` | `preview-lifecycle` | preview source fingerprint plus linked runtime/route cleanup context | `serialize-with-bounded-wait` |
| `source-links.relink` | `source-link` | normalized source fingerprint | `serialize-with-bounded-wait` |

`supersede-active` means the command may take ownership from one older same-scope active attempt
according to the command's own workflow rules, rather than blindly rejecting every later request.

`serialize-with-bounded-wait` means only one mutation for the same logical scope may execute at a
time; later requests wait for a bounded interval and then fail with a retriable coordination error
if they still cannot acquire the scope.

Different logical scopes must not be serialized only because they share a server or state root,
unless a lower state-root-maintenance operation is currently running.

## SSH `ssh-pglite` Finalization Contract

SSH `ssh-pglite` mode executes commands against a local mirror of the selected remote Appaloft
state root and then synchronizes that mirror back to the remote host.

That final synchronization is a state-root concern, not an operation-coordination concern. v1
therefore distinguishes:

- logical command admission, which waits on `resource-runtime`, `preview-lifecycle`, or
  `source-link` scopes according to the policy table above; and
- final mirror commit, which may still observe that the remote state root changed while the command
  was running.

When the final mirror upload detects a remote revision change, the SSH state adapter should:

1. reacquire brief state-root maintenance coordination;
2. download a fresh remote snapshot;
3. compute the local command's row-level changes relative to the command's original base snapshot;
4. replay non-overlapping row changes onto the fresh remote snapshot; and
5. retry the final upload against the newer remote revision.

The adapter must fail instead of silently overwriting when the command and the refreshed remote
snapshot both changed the same authoritative row incompatibly.

This recovery path exists to avoid unnecessary user-visible failure for different logical scopes
that happened to mutate disjoint rows during the same wall-clock window. It does not turn
`ssh-pglite` into a general remote queue or a substitute for durable control-plane coordination.

## Provider Boundary

The mutation coordinator is a provider-backed boundary.

Allowed implementation shapes include:

- SSH/local state adapters that use leased records or another durable scope-coordination strategy in
  the selected state backend;
- PostgreSQL/control-plane adapters that use a queue table, advisory locks, or equivalent durable
  coordination state;
- future always-on control planes that map the same port to Redis, SQS, Kafka, or another remote
  queue/coordination system.

RxJS or other in-process stream libraries are not sufficient as the primary coordination mechanism
for this boundary because they do not coordinate across independent CLI processes, Actions runners,
or machines.

## Error And UX Contract

When operation coordination cannot be acquired within the policy window, the public command error
should describe the logical coordination scope rather than only a raw backend lock path.

Command specs may still expose low-level backend failures such as `remote-state-lock` for
state-root coordination. Those remain infrastructure failures. End-user waiting/timeout semantics
for command admission belong to operation coordination.

The shared error model should carry safe details such as:

- `coordinationScopeKind`
- `coordinationScope`
- `coordinationMode`
- `waitedSeconds`
- `retryAfterSeconds` when known

## Consequences

- `CommandBus` remains process-local dispatch and does not become the cross-process coordination
  primitive.
- SSH `ssh-pglite` mode may continue using coarse state-root coordination for schema/sync safety,
  while command coordination uses logical admission scopes and final mirror synchronization may
  still perform state-root revision conflict recovery.
- `deployments.create` keeps acceptance-first semantics; this ADR does not introduce accepted queued
  deployment requests.
- Preview deploy/cleanup and source-link relink should report scope-specific waiting semantics
  rather than only "server lock" failures.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [deployments.create Error Spec](../errors/deployments.create.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [deployments.cleanup-preview Command Spec](../commands/deployments.cleanup-preview.md)
- [deployments.cleanup-preview Test Matrix](../testing/deployments.cleanup-preview-test-matrix.md)
- [source-links.relink Command Spec](../commands/source-links.relink.md)
- [Source Link State Test Matrix](../testing/source-link-state-test-matrix.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [GitHub Action PR Preview Deploy Workflow](../workflows/github-action-pr-preview-deploy.md)
- [Error Model](../errors/model.md)

## Migration Notes

Current implementation now separates brief SSH remote state-root maintenance from logical command
coordination for `deployments.create`, `deployments.cleanup-preview`, and `source-links.relink`.
When a command had to wait for a logical scope in SSH `ssh-pglite` mode, shell refreshes the local
mirror from the remote host before continuing command work.

Current implementation also retries final SSH mirror upload after `remote_state_revision_conflict`
by downloading a fresh remote snapshot and replaying non-overlapping PG/PGlite row changes before a
second upload attempt. Overlapping row edits still fail with a structured infrastructure merge
conflict rather than being overwritten silently.

The first implementation slice after this ADR should:

1. keep state-root safety intact;
2. move user-visible command waiting semantics toward scope-based coordination; and
3. place command coordination policy in an explicit registry or equivalent explicit metadata module,
   not only in decorators.

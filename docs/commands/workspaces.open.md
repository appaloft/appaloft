# workspaces.open Application Command Spec

## Metadata

- Operation key: `workspaces.open`
- Command class: `OpenAgentWorkspaceCommand`
- Owner: application workflow over existing public aggregates
- Status: active public command

## Contract

`workspaces.open` performs atomic Profile-aware create-or-resume coordination. It does not create a
Workspace aggregate; successful `workspaceId` is the underlying `SandboxId`.

The CLI resolves local Git context before constructing this command. The operation receives only a
credential-free repository locator, canonical identity, ref, branch, immutable commit, optional
Profile selector, `forceNew`, and attach intent. It never receives a local path or file content.

Before Sandbox effects it resolves, in order:

1. canonical Repository identity and immutable repository ref/commit equality;
2. exact Repository Binding and visible Project plus explicit Profile or Project default Profile;
3. only when Binding/default Profile is missing, an optional activation-context initializer after
   repository source/identity validation; canonical repositories are re-read and conflicting state
   fails closed; downstream compositions must perform their own entitlement/admission check before
   the initializer creates context;
4. enabled immutable Profile/Adapter definitions and Sandbox Template;
5. installation-owned named Credential Connections;
6. Adapter capabilities required by the request;
7. a consumable admission/placement reservation with validated target-selection evidence.

The workflow then coordinates tenant + subject + Project + Repository Identity + branch. A
matching preferred Workspace is resumed/reconnected; `forceNew` creates a distinct Sandbox and
advances the preference. An explicit Profile selector resumes the latest non-terminal Workspace
pinned to that resolved Profile within the same coordinates, while an omitted selector uses the
global preference and keeps that Workspace's pinned Profile even if the Project default later
changed. An explicit selector that does not match the preferred pin fail-closes. Source mismatch
fails and requires a new Workspace.

```ts
type OpenAgentWorkspaceCommandInput = {
  repository: string;
  repositoryIdentity: string;
  ref: string;
  branch: string;
  commitSha: string;
  profile?: string;
  forceNew?: boolean;
  attach?: boolean;
  targetServerId?: string;
};
```

The result contains safe Workspace/Runtime/Profile/source descriptors, activation context evidence,
persisted target-selection evidence and a capability-derived attach handoff. Each activation item
reports `created` or `reused`. Target evidence reports class (`managed`, `registered-server`,
`local`, or legacy `legacy-unclassified`), source (`platform-default`, `saved-policy`, `explicit`, or
legacy `legacy`) and a stable reason. Create/resume and Workspace status return the same evidence;
resume never re-runs placement. Partial failure after Sandbox identity contains exact phase, ids,
retryability, recovery, and terminate evidence. Public evidence never returns Server id/host, raw
provider addresses or handles, capacity probes, SSH material, credentials, or long-lived attach
capabilities.

## Attach

- `managed-terminal`: reuse the current valid Agent TUI Terminal Session or launch the exact
  process-granted child, then return the session for immediate transport bridging.
- `native-attach`: issue short-lived revocable access and return validated argv; direct local spawn
  additionally requires approved `local-client-exec`.
- unsupported: fail with a capability error and no fabricated attach.

## Entrypoints

| Surface | Mapping |
| --- | --- |
| CLI | Durable `appaloft workspace open [path]`, Profile-aware `workspace create`, and default `appaloft code` occupancy (ADR-118 / ADR-119). `code` supplies remote SHA + optional `targetServerId`. A positional git remote occupies that repo without a local clone. Laptop Git fail-closed is not used. |
| SDK | `appaloft.workspaces.open(...)`; Profile-aware `workspaces.create(...)` |
| oRPC / HTTP | Catalog-backed application command |
| Console | Workspace create/resume entry |
| Remote CLI | Same application message; local Git preflight remains local |

## References

- [ADR-094](../decisions/ADR-094-agent-workspace-entry-workflow.md)
- [ADR-100](../decisions/ADR-100-agent-adapter-distribution-and-workspace-profile-boundary.md)
- [ADR-103](../decisions/ADR-103-profile-aware-workspace-open-and-attach.md)
- [ADR-107](../decisions/ADR-107-task-oriented-workspace-activation-presentation.md)
- [ADR-109](../decisions/ADR-109-workspace-activation-context-and-target-evidence.md)
- [ADR-116](../decisions/ADR-116-instant-local-scratch-session-boundary.md)
- [ADR-118](../decisions/ADR-118-remote-code-occupancy.md)
- [Spec 120](../specs/120-profile-aware-workspace-open-and-attach/spec.md)
- [Spec 125](../specs/125-workspace-code-activation/spec.md)
- [Spec 131](../specs/131-workspace-activation-context-and-target-evidence/spec.md)
- [Spec 138](../specs/138-instant-local-scratch/spec.md)
- [Workflow](../workflows/agent-workspace.md)
- [Profile-Aware Open Test Matrix](../testing/profile-aware-workspace-open-test-matrix.md)
- [Workspace Code Activation Test Matrix](../testing/workspace-code-activation-test-matrix.md)
- [Instant Local Scratch Test Matrix](../testing/instant-local-scratch-test-matrix.md)
- [Workspace Activation Target Evidence Test Matrix](../testing/workspace-activation-target-evidence-test-matrix.md)

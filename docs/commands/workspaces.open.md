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

1. exact Repository Binding and visible Project;
2. explicit Profile installation/id/name or Project default installation;
3. enabled immutable Profile/Adapter definitions and Sandbox Template;
4. installation-owned named Credential Connections;
5. Adapter capabilities required by the request;
6. immutable repository ref/commit equality;
7. authorization plus a consumable admission/placement reservation.

The workflow then coordinates tenant + subject + Project + Repository Identity + branch. A
matching preferred Workspace is resumed/reconnected; `forceNew` creates a distinct Sandbox and
advances the preference. An explicit Profile selector resumes the latest non-terminal Workspace
pinned to that resolved Profile within the same coordinates, while an omitted selector uses the
global preference. Source mismatch fails and requires a new Workspace.

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
};
```

The result contains safe Workspace/Runtime/Profile/source descriptors and a capability-derived
attach handoff. Partial failure after Sandbox identity contains exact phase, ids, retryability,
recovery, and terminate evidence. It never returns secret values, raw provider addresses, SSH
material, or long-lived attach credentials.

## Attach

- `managed-terminal`: reuse the current valid Agent TUI Terminal Session or launch the exact
  process-granted child, then return the session for immediate transport bridging.
- `native-attach`: issue short-lived revocable access and return validated argv; direct local spawn
  additionally requires approved `local-client-exec`.
- unsupported: fail with a capability error and no fabricated attach.

## Entrypoints

| Surface | Mapping |
| --- | --- |
| CLI | `appaloft workspace open [path]` and Profile-aware `workspace create` |
| SDK | `appaloft.workspaces.open(...)`; Profile-aware `workspaces.create(...)` |
| oRPC / HTTP | Catalog-backed application command |
| Console | Workspace create/resume entry |
| Remote CLI | Same application message; local Git preflight remains local |

## References

- [ADR-094](../decisions/ADR-094-agent-workspace-entry-workflow.md)
- [ADR-100](../decisions/ADR-100-agent-adapter-distribution-and-workspace-profile-boundary.md)
- [ADR-103](../decisions/ADR-103-profile-aware-workspace-open-and-attach.md)
- [Spec 120](../specs/120-profile-aware-workspace-open-and-attach/spec.md)
- [Workflow](../workflows/agent-workspace.md)
- [Test Matrix](../testing/profile-aware-workspace-open-test-matrix.md)

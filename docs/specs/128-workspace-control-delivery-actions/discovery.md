# Discovery: Workspace Control Delivery Actions

## Status

- Round: Grill / Discovery
- Owner decision: confirmed as part of the active `R1 Appaloft Workspace Alpha` objective
- Proposed scope: public Workspace control presentation over existing Preview, Agent Task,
  Promotion and Deployment Proof operations
- Code changes: accepted Spec 128 and public issue #1034 govern the active Code Round

## Business Outcome

An authenticated developer can stay inside `appaloft workspace`, expose or revoke a bounded
Workspace Preview, approve and deliver an existing Agent Task to a Git branch or GitHub pull
request, accept or retry an existing Sandbox Promotion, and read the resulting Deployment Proof.
The TUI remains a presentation over existing public operation truth and does not become a second
delivery application layer.

## Existing Capabilities

- `ExposeSandboxPortCommand`, `RevokeSandboxPortCommand` and `ListSandboxPortsQuery` own
  development Preview exposure and cleanup.
- `ApproveAgentTaskRunCommand` and `DeliverAgentTaskRunCommand` own checked Agent Task approval,
  Git branch/commit and optional GitHub pull-request delivery.
- `AcceptSandboxPromotionCommand`, `RetrySandboxPromotionCommand` and
  `ListSandboxPromotionsQuery` own application Promotion lifecycle.
- `DeploymentProofQuery` owns observed deployment verification. A completed Promotion descriptor
  is not a substitute for querying this proof.
- The Workspace control TUI already renders bounded Preview, Task and Promotion summaries, but it
  has no delivery action or form protocol.

## Confirmed Decisions

| Question | Decision | Rationale |
| --- | --- | --- |
| Product location | Public Appaloft | Preview, Task, Git delivery, Promotion and proof are neutral Community capabilities. |
| Operation model | Reuse existing commands and queries only | R1 needs composition, not a TUI-owned delivery lifecycle. |
| Entry | Add a `d` delivery palette beside the existing `a` lifecycle palette | Keeps destructive lifecycle and external delivery choices visibly distinct. |
| Item selection | Build bounded actions from the selected detail's exact Preview, Task and Promotion identities | Avoids asking users for internal ids while preserving exact operation targets. |
| Preview defaults | `private` visibility and a bounded TTL preset; public visibility requires an explicit user choice | Preview creation must not silently widen access or become unbounded. |
| External writes | Task deliver and Promotion accept/retry require a visible summary plus explicit confirmation | These actions can push Git, create a PR or deploy application state. |
| Task delivery input | Bounded branch, commit message, remote and optional GitHub PR title/body/base fields | Reuses the existing headless contract without hidden repository assumptions. |
| Promotion input | Reuse the exact descriptor `artifactDigest`; generate a fresh idempotency key in the Bun parent | The user selects an existing reviewed plan rather than retyping integrity metadata. |
| Proof | Query `DeploymentProofQuery` for a Promotion with deployment/resource ids and display stable verdict plus bounded mismatch/unavailable counts | Do not infer verification from a completed-looking status. |
| Credentials | No credential or secret field exists in the delivery form | Existing runtime/control-plane credential custody remains authoritative. |
| Failures | Preserve stable code, phase and retryability only | Provider bodies, Git credentials, URLs with query values and Agent output remain excluded. |
| Headless parity | Existing `workspace preview`, `workspace task`, `sandbox promote` and `deployment proof` commands remain canonical equivalents | TUI availability never becomes the only way to deliver. |

## Candidate Journey

1. Select a Workspace and inspect exact Runtime, Preview, Task and Promotion summaries.
2. Press `d` and expose a private TTL Preview or revoke an existing exposure.
3. Approve an `awaiting-approval` Agent Task after its checks and Diff are visible.
4. Fill bounded delivery fields, review the external-write summary and confirm Git/PR delivery.
5. Alternatively accept or retry an existing reviewed Promotion using its exact digest.
6. Refresh existing queries; if a Promotion has a deployment id, read its real Deployment Proof.
7. Revoke Preview or use existing lifecycle cleanup without leaving a TUI-owned optimistic state.

## Rejected Alternatives

- Shelling out from the renderer to existing CLI commands.
- Storing form drafts, delivery state, proof or credentials in a TUI database.
- Inferring PR creation or deployment success from terminal text.
- Automatically choosing public Preview visibility, a repository base branch or a Promotion target.
- Reimplementing GitHub, Promotion or Deployment Proof orchestration in the Rust sidecar.
- Treating an existing completed Promotion status as authoritative Deployment Proof.

## Public/Private Boundary

Public owns the renderer protocol, bounded forms, action availability, existing operation dispatch,
readback and docs. Cloud may inject its existing authz, credential custody, placement, quota,
gateway and audit ports. Public imports no Cloud package and Cloud adds no parallel delivery state.

## Open Questions

No question remains that changes ownership or the first implementation slice. Visual styling and
additional delivery providers may evolve after R1 without changing the existing operation boundary.

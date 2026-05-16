# Plan: URL-First Deployment Entry Experience

## Source-Of-Truth Alignment

- Existing ADRs are sufficient for the first user-layer slice:
  - ADR-010 keeps Quick Deploy as an entry workflow over explicit operations.
  - ADR-014 keeps deployment admission ids-only and Resource-profile driven.
  - ADR-017 keeps generated access and durable domains separate from deployment input.
  - ADR-021 and ADR-023 keep Docker/OCI and runtime target execution behind adapter boundaries.
- No new ADR is required unless the implementation adds hosted artifact storage/routing, a durable
  workflow command, new domain/TLS side effects, or new deployment admission fields.

## Bounded Context And Package Impact

- Workspace / Workload Delivery:
  - No aggregate boundary change is required for the user-layer slice.
  - Existing Resource source/runtime/network profile ownership remains canonical.
- Application:
  - Shared Quick Deploy workflow helpers may add URL-first result composition and upload-like
    static source normalization before dispatching existing commands.
- Runtime adapters:
  - BYOS local artifact materialization may copy a local static output/source bundle to the selected
    runtime workspace before Docker/OCI static-server packaging.
  - Any cloud-hosted artifact store is out of scope and must receive separate governance.
- CLI:
  - UX: `appaloft deploy ./dist --as static-site` maps to existing static Resource profile fields.
  - Completion output should lead with URL/access state and follow with Resource/Deployment ids,
    logs, diagnostics, and recovery hints.
- Web:
  - Quick Deploy should offer a concise "source or static output" entry and progressive detail
    disclosure after the URL is available.
- MCP/tools:
  - Generated descriptors or tool docs should provide an agent-safe sequence over existing
    operation keys.
- Agent skill:
  - The v1 Agent Deploy Skill packages the URL-first flow into an installable skill before the MCP
    product surface is required.

## Operation Catalog Impact

- No new operation catalog entry for Quick Deploy.
- Existing operations remain the implementation path:
  - `projects.*`, `servers.*`, `credentials.*`, and `environments.*` as needed for context.
  - `resources.create` or `resources.configure-*` for Resource profile state.
  - `deployments.create` for deployment admission.
  - `deployments.stream-events`, `deployments.logs`, `resources.health`, and
    `resources.diagnostic-summary` for observation.
  - `deployments.recovery-readiness`, `deployments.retry`, `deployments.redeploy`, and
    `deployments.rollback` for recovery when active and applicable.

## Public Documentation Outcome

- Planned anchors:
  - `/docs/start/first-deployment/#start-first-deployment-path` for URL-first completion.
  - `/docs/deploy/sources/#deployment-source-kind` for local folder and static-output source
    guidance.
  - A future stable anchor for agent-safe deploy protocol when MCP/tool documentation is expanded.
- Until implementation begins, this feature artifact records the planned docs outcome; public docs
  should not claim the upload-like entry is available.

## Test Strategy

- Extend Quick Deploy matrix rows for URL-first completion, local static output source, no implicit
  hosted artifact serving, and agent-safe output shape.
- Prefer shared workflow tests before Web/CLI UI tests.
- Add CLI snapshot/contract tests for outcome-first result copy when CLI implementation changes.
- Add Web tests only when the Quick Deploy UI actually changes.
- Add MCP/tool descriptor tests when generated agent guidance changes.

## Implementation Order

1. Shared workflow/result contract for URL-first output.
2. Agent Deploy Skill public docs/artifact with safe protocol and outcome packet.
3. CLI local static output entry normalization.
4. Web Quick Deploy source/static-output affordance.
5. Public docs/help anchors once the behavior is implemented.
6. Generated MCP/tool guidance once tool descriptors expose the entry workflow guidance.

## Open Questions

- Whether local artifact materialization should preserve a deployment-local archive for rollback
  diagnostics, and where that archive lives for local-shell versus generic-SSH targets.
- Whether hosted artifact storage/routing belongs in Appaloft Cloud before or after GA.

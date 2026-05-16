# Tasks: URL-First Deployment Entry Experience

## Spec Round

- [x] Position the behavior as user-layer Quick Deploy/first-deploy entry work, not a new business
  operation.
- [x] Record categorized product lessons without changing Appaloft's BYOS deployment boundary.
- [x] Record no-ADR-needed rationale for the first user-layer slice.
- [x] Add roadmap and operation-map references for the planned user-layer behavior.

## Testing Round

- [x] Add Quick Deploy matrix rows for:
  - `URL-FIRST-001`: URL-first completion;
  - `URL-FIRST-002`: local static output as source;
  - `URL-FIRST-003`: no implicit hosted cloud;
  - `URL-FIRST-004`: agent-safe deploy protocol;
  - `URL-FIRST-005`: outcome-first completion output.
- [x] Add CLI contract coverage for local static output entry normalization.
- [x] Add Web Quick Deploy behavior coverage through shared outcome-contract usage.
- [x] Add docs registry coverage for agent guidance before MCP descriptors exist.

## Code Round

- [x] Implement the shared URL-first completion result shape.
- [x] Implement CLI local static output normalization over existing Resource/Deployment operations.
- [x] Implement Web Quick Deploy progressive disclosure for source/static-output entry.
- [x] Keep `deployments.create` ids-only and avoid a `quick-deploy.create` operation.
- [x] Keep hosted artifact storage/routing out of scope unless a new ADR/spec is accepted.

## Docs Round

- [x] Publish or link the v1 Agent Deploy Skill governed by
  [Appaloft Agent Deploy Skill](../072-appaloft-agent-deploy-skill/spec.md).
- [x] Update public first-deployment docs after URL-first completion behavior is implemented.
- [x] Update public source docs after local static output entry behavior is implemented.
- [x] Add agent-safe deploy protocol docs through the v1 Agent Deploy Skill before MCP/tool
  guidance is required.
- [x] Keep translated anchor ids stable across locales.

## Verification

- [x] Run focused Quick Deploy workflow tests.
- [x] Run focused CLI entry tests.
- [x] Run focused Web Quick Deploy tests if Web changed.
- [x] Run generated docs/tool descriptor tests if docs registry or MCP metadata changed.

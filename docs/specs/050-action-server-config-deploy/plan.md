# Plan: Action Server Config Deploy

## Governing Sources

- Domain model: [Domain Model](../../DOMAIN_MODEL.md)
- Decisions/ADRs:
  [ADR-010](../../decisions/ADR-010-quick-deploy-workflow-boundary.md),
  [ADR-014](../../decisions/ADR-014-deployment-admission-uses-resource-profile.md),
  [ADR-024](../../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md),
  [ADR-025](../../decisions/ADR-025-control-plane-modes-and-action-execution.md),
  [ADR-028](../../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- Local specs:
  [Repository Deployment Config File Bootstrap](../../workflows/deployment-config-file-bootstrap.md),
  [Control-Plane Mode Selection And Adoption](../../workflows/control-plane-mode-selection-and-adoption.md),
  [Action Server Config Deploy Workflow](../../workflows/action-server-config-deploy.md),
  [Quick Deploy](../../workflows/quick-deploy.md)
- Test matrix:
  [Control-Plane Modes Test Matrix](../../testing/control-plane-modes-test-matrix.md),
  [Deployment Config File Test Matrix](../../testing/deployment-config-file-test-matrix.md)

## Architecture Approach

- Domain/application placement: keep source package validation and server-side config bootstrap in
  application/workflow services over existing commands. Do not put package/config fields on
  `Deployment` admission.
- Command/query placement: final deployment remains `CreateDeploymentCommand`. Profile changes
  must dispatch existing intention-revealing resource/environment commands before deployment.
- API placement: implement the dedicated
  `POST /api/action/deployments/from-config-package` workflow endpoint from the Action Server
  Config Deploy spec. Keep `/api/action/deployments/from-source-link` as the existing trigger-only
  endpoint.
- Source package placement: define a safe manifest first, then choose package transport. Transport
  adapters must validate size, checksum, path boundaries, config path, and source root before
  handing source material to workload planners.
- Repository/specification impact: source package metadata may need persistence/read-model rows for
  diagnostics and cleanup. Raw package content should be stored as bounded artifact data, not as
  business read-model text.
- Event/CQRS/read-model impact: accepted config deploy may need source package accepted/rejected
  and config bootstrap diagnostics. These must be observable without overloading deployment status.
- Entrypoint impact: GitHub Action gets explicit server config deploy/package behavior while pure
  SSH mode and source-link trigger mode keep current behavior.
- Public docs impact: update docs only when the Code Round can prove a working closed loop.

## Roadmap And Compatibility

- Roadmap target: pulled-forward `0.9.x` self-hosted Action console iteration.
- Version target: next available `0.9.x` after the current open sync PRs.
- Compatibility impact: `pre-1.0-policy`; additive endpoint/action behavior. Existing pure SSH
  workflows and existing self-hosted source-link trigger workflows remain valid.
- Release notes: must call out that server config deploy shifts config/source execution from the
  runner to the self-hosted server and still requires explicit server mode selection.

## Testing Strategy

- Matrix ids: `CONTROL-PLANE-HANDSHAKE-013` through `CONTROL-PLANE-HANDSHAKE-017`,
  `CONTROL-PLANE-HANDSHAKE-021`, `CONFIG-FILE-ENTRY-028`, and `CONFIG-FILE-ENTRY-029`.
- Test-first rows:
  - wrapper rejects server config deploy when handshake lacks the required feature;
  - wrapper does not invoke CLI/SSH/state-backend in server config mode;
  - HTTP route validates package manifest and rejects identity/secret config fields before
    mutation;
  - application target resolution succeeds without ids from existing source-link state or complete
    deploy-token scope;
  - unresolved targets and explicit id conflicts fail before config/profile/route/deployment
    mutation with actionable structured errors;
  - server-side config bootstrap dispatches resource/environment commands before ids-only
    deployment;
  - preview server config deploy uses preview-scoped source fingerprints.
  - preview server config deploy forwards partial project/environment/server placement hints and
    lets server-side preview policy resolve the complete preview resource target.
- Contract/integration: start with hermetic wrapper tests and HTTP route tests using fake command
  bus/source package adapter/source link repository.
- Acceptance/e2e: add a self-hosted PGlite server smoke only after source package storage and
  cleanup are bounded.

## Risks And Governed Follow-Ups

- The package transport choice can create security and storage risks. The active server-github-fetch
  slice avoids direct package upload; future package transport must fail closed until size,
  checksum, path, and cleanup rules exist.
- Server-side GitHub fetch may require GitHub integration auth that differs from Action-provided
  source archives. That choice should not leak provider SDK concepts into core/application.
- Product-grade preview policy is a separate workflow. Do not imply preview scheduler, comments,
  checks, or managed domain cleanup from this Action server config deploy slice.
- Adoption marker/import remains separate. This slice does not make `auto` mode active and does not
  prevent direct SSH mode unless adoption has happened.

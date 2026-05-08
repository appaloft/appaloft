# Tasks: Action Server Config Deploy

## Spec Round

- [x] Confirm ADR-010, ADR-014, ADR-024, ADR-025, and ADR-028 govern the boundary without a new ADR
  for this Spec Round.
- [x] Position the behavior as the next self-hosted Action server API slice under the existing
  Headless CI deploy workflow.
- [x] Create spec, plan, and task artifacts.
- [x] Add control-plane and deployment-config test matrix rows for the future Code Round.
- [x] Update workflow/core-operation/roadmap notes without marking the behavior implemented.

## Test-First

- [x] `CONTROL-PLANE-HANDSHAKE-013`: wrapper requires source package/server config feature support
  before mutation.
- [x] `CONTROL-PLANE-HANDSHAKE-014`: wrapper server config mode does not invoke CLI, SSH, or
  state-backend mutation.
- [x] `CONTROL-PLANE-HANDSHAKE-015`: HTTP server config endpoint validates package manifest and
  rejects unsafe config/source paths before mutation.
- [x] `CONTROL-PLANE-HANDSHAKE-016`: server-side config bootstrap rejects identity/secret fields in
  committed config before source-link/resource/route/deployment mutation.
- [ ] `CONTROL-PLANE-HANDSHAKE-017`: server-side config bootstrap applies accepted config through
  explicit commands before ids-only deployment.
- [ ] `CONFIG-FILE-ENTRY-028`: Action server config deploy keeps committed config non-secret and
  uses trusted source/preview context for identity.

## Source Of Truth

- [x] Add command/workflow spec for the dedicated server config deploy API contract.
- [ ] Define source package manifest fields, limits, checksum rules, storage lifecycle, and cleanup
  behavior.
- [ ] Define source package/config bootstrap errors and public help anchors.
- [ ] Update operation catalog only if a new user-visible operation key is activated.

## Implementation

- [x] Add wrapper inputs and dry-run traces for server config deploy/package behavior.
- [x] Add API route or RPC endpoint for Action server config deploy.
- [x] Add source package manifest validation and a hermetic fake source package adapter.
- [x] Wire the self-hosted console composition to a GitHub `server-github-fetch` config reader for
  reading the selected repository config from trusted package metadata.
- [x] Reuse repository config parser/validator on the server side and keep identity/secret
  rejection identical to pure CLI config deploy.
- [ ] Orchestrate server-side config bootstrap through existing resource/environment commands and
  ids-only `CreateDeploymentCommand`. Current implementation accepts the existing-resource/no-profile
  slice, resolves existing source-link context for no-profile requests, bootstraps source-link
  context from complete trusted ids, applies runtime/network/health profile fields through explicit
  resource commands, and rejects unsupported source/access/env/secret profile application before
  mutation.
- [ ] Add safe source package diagnostics/read-model output if needed for Web and support.

## Entrypoints And Docs

- [ ] Update deploy-action README/action metadata after wrapper behavior exists.
- [ ] Update public docs only after the server config closed loop is verified.
- [ ] Update Web console links/diagnostics only if the Code Round adds source package read models.

## Verification

- [ ] Run targeted wrapper tests.
- [x] Run targeted HTTP/orpc tests.
- [ ] Run targeted deployment config parser tests.
- [x] Run `bun run lint`.
- [x] Run typecheck for changed packages.

## Post-Implementation Sync

- [ ] Reconcile spec, plan, tasks, durable workflow docs, test matrices, public docs, and code.
- [ ] Record any remaining migration gap explicitly instead of weakening the normative contract.

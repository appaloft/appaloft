# Tasks: Agent Adapter SDK And Workspace Profiles

## Test First

- [x] `ADAPTER-MANIFEST-001/002/003`: schema, digest, compatibility, and trust-boundary tests.
- [x] `ADAPTER-CAP-004/ADAPTER-EVENT-005/ADAPTER-CRED-006`: descriptor conformance tests.
- [ ] `ADAPTER-INSTALL-007/008`: tenant lifecycle and reference-fencing tests.
- [ ] `PROFILE-MANIFEST-009/PROFILE-PIN-010`: Profile validation/compile/pinning tests.
- [ ] `ADAPTER-SURFACE-011`: operation/transport/SDK parity tests.
- [ ] `ADAPTER-CODEX-012`: deterministic fixture and opt-in Codex smoke.

## Source Of Truth

- [x] Complete Discovery, ADR-100, Spec 117, Plan, Tasks, Domain/Operation/Roadmap positioning, and
  Test Matrix.
- [x] Create and link public #821 and vertical #822-#825 GitHub issues.

## Implementation

- [x] Implement manifest schemas, canonicalization, digest, validator, and conformance API.
- [ ] Implement definition/installation lifecycle and persistence.
- [ ] Implement Profile validation, installation, compile, and resolved Workspace pinning.
- [ ] Implement Declarative Harness resolver and fixture/Codex adapters.
- [ ] Add operation catalog, CLI, HTTP/oRPC, SDK, MCP metadata, and Web surfaces.

## Verification And Sync

- [ ] Run focused tests and public lint/typecheck/test/build.
- [ ] Run local Docker conformance smoke and explicit real Codex smoke.
- [ ] Synchronize operations, docs, migration gaps, tasks, and issue evidence.

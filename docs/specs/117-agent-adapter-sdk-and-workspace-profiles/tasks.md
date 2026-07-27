# Tasks: Agent Adapter SDK And Workspace Profiles

## Test First

- [x] `ADAPTER-MANIFEST-001/002/003`: schema, digest, compatibility, and trust-boundary tests.
- [x] `ADAPTER-CAP-004/ADAPTER-EVENT-005/ADAPTER-CRED-006`: descriptor conformance tests.
- [x] `ADAPTER-INSTALL-007/008`: tenant lifecycle and reference-fencing tests.
- [x] `PROFILE-MANIFEST-009/PROFILE-PIN-010`: Profile validation/compile/pinning tests.
- [x] `ADAPTER-SURFACE-011`: operation/transport/SDK parity tests.
- [ ] `ADAPTER-CODEX-012`: deterministic fixture and opt-in Codex smoke.

## Source Of Truth

- [x] Complete Discovery, ADR-100, Spec 117, Plan, Tasks, Domain/Operation/Roadmap positioning, and
  Test Matrix.
- [x] Create and link public #821 and vertical #822-#825 GitHub issues.

## Implementation

- [x] Implement manifest schemas, canonicalization, digest, validator, and conformance API.
- [x] Implement required/optional credential requirement-to-reference binding resolution.
- [x] Implement definition/installation lifecycle and persistence.
- [x] Implement Profile validation, installation, compile, and resolved Workspace pinning.
- [x] Implement Declarative Harness resolver from the selected Adapter interaction modes.
- [ ] Implement deterministic fixture and run the real Codex adapter smoke.
- [x] Add the Adapter installation operation catalog, CLI, HTTP/oRPC, SDK, MCP metadata, and Web
  surfaces.
- [x] Add Profile lifecycle and compile operations to the catalog, CLI, HTTP/oRPC, SDK, and Web
  surfaces; let Workspace creation select and persist the resolved Profile pin.

## Verification And Sync

- [x] Run focused Profile compiler, lifecycle, persistence, Runtime pin, transport, CLI, SDK, and Web
  tests.
- [x] Run the final public lint/typecheck/test/build gate after documentation sync.
- [ ] Run local Docker conformance smoke and explicit real Codex smoke.
- [x] Synchronize the Adapter and Profile operation catalogs, public user docs, migration, tasks,
  SDK guidance, CLI skill reference, and automated test evidence.

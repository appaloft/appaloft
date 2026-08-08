# Tasks: Agent Adapter SDK And Workspace Profiles

## Test First

- [x] `ADAPTER-MANIFEST-001/002/003`: schema, digest, compatibility, and trust-boundary tests.
- [x] `ADAPTER-CAP-004/ADAPTER-EVENT-005/ADAPTER-CRED-006`: descriptor conformance tests.
- [x] `ADAPTER-INSTALL-007/008`: tenant lifecycle and reference-fencing tests.
- [x] `PROFILE-MANIFEST-009/PROFILE-PIN-010`: Profile validation/compile/pinning tests.
- [x] `ADAPTER-SURFACE-011`: operation/transport/SDK parity tests.
- [x] `ADAPTER-CRED-006/PROFILE-PIN-010`: Workspace credential-reference input, pinned Runtime
  persistence, exact-scope grant launch/revoke, and public operation/SDK parity tests.
- [ ] `ADAPTER-CODEX-012`: deterministic fixture and opt-in Codex smoke.
- [x] `ADAPTER-RUNTIME-013`: application/runtime tests prove Runtime start uses the scoped
  child launch, waits for process/HTTP readiness, writes its marker only after acceptance, and
  terminates/revokes exact failed startup.
- [x] `ADAPTER-NATIVE-014`: schema/compiler tests reject native attach without a bounded
  start command or with a mismatched/non-HTTP healthcheck before Sandbox effects.

## Source Of Truth

- [x] Complete Discovery, ADR-100, Spec 117, Plan, Tasks, Domain/Operation/Roadmap positioning, and
  Test Matrix.
- [x] Create and link public #821 and vertical #822-#825 GitHub issues.
- [x] Track fail-closed declarative Runtime startup and native-attach server acceptance under public
  [#1013](https://github.com/appaloft/appaloft/issues/1013).

## Implementation

- [x] Implement manifest schemas, canonicalization, digest, validator, and conformance API.
- [x] Implement required/optional credential requirement-to-reference binding resolution.
- [x] Implement definition/installation lifecycle and persistence.
- [x] Implement Profile validation, installation, compile, and resolved Workspace pinning.
- [x] Implement Declarative Harness resolver from the selected Adapter interaction modes.
- [x] Implement the neutral process credential grant port for declarative managed-terminal and
  headless child launches, including completion/cancellation/Runtime/Sandbox cleanup revocation.
- [ ] Implement deterministic fixture and run the real Codex adapter smoke.
- [x] Compile and execute declarative Runtime start with bounded readiness and exact failure cleanup.
- [x] Enforce native-attach start/healthcheck/server-port compatibility.
- [x] Add the Adapter installation operation catalog, CLI, HTTP/oRPC, SDK, MCP metadata, and Web
  surfaces.
- [x] Add Profile lifecycle and compile operations to the catalog, CLI, HTTP/oRPC, SDK, and Web
  surfaces; let Workspace creation select and persist the resolved Profile pin.

## Verification And Sync

- [x] Run focused Profile compiler, lifecycle, persistence, Runtime pin, transport, CLI, SDK, and Web
  tests.
- [x] Run the final public lint/typecheck/test/build gate after documentation sync.
- [ ] Run local Docker conformance smoke and explicit real Codex smoke.
- [ ] Rerun the authorized dual-target hosted Pi/OpenCode Workspace smoke and record exact cleanup.
- [x] Synchronize the Adapter and Profile operation catalogs, public user docs, migration, tasks,
  SDK guidance, CLI skill reference, and automated test evidence.
- [x] Link public #834 evidence and synchronize credential-grant operation, persistence, SDK, and
  lifecycle cleanup contracts after the implementation gate passes.

# Tasks: Workspace Collaboration

## Test-First

- [x] Add aggregate invariant tests for participants, Lanes, final owner and close lifecycle.
- [x] Add concurrent writer acquisition, renewal, release, transfer and stale-generation tests.
- [x] Add Source Artifact ownership/digest and handoff lifecycle tests.
- [x] Add observer/writer managed Terminal Session attachment tests.
- [x] Add native attach writer policy tests.
- [x] Add operation catalog, HTTP/oRPC, CLI, SDK and Public Console contract tests.
- [x] Add Cloud authz/admission and organization-isolation tests.

## Implementation

- [x] Add public Workspace Collaboration aggregate, values, events and repository port.
- [x] Add application service, command/query messages, handlers and safe descriptors.
- [x] Add in-memory and PostgreSQL repositories plus migration.
- [x] Add writer/observer Terminal Session attachment capabilities and fencing.
- [x] Add native attach collaboration guard.
- [x] Add canonical operations and generated transport/SDK surfaces.
- [x] Add CLI collaboration commands and Public Console collaboration views.
- [x] Add Cloud operation policy, admission scopes and audit integration.

## Docs And Sync

- [x] Update domain model, operation map, workflow docs and roadmap/PRD.
- [x] Add Workspace Collaboration test matrix and bind every scenario id.
- [x] Reconcile public/private boundary and Cloud composition docs.

## Verification

- [x] Run focused core/application/runtime/persistence/CLI/SDK/Web tests.
- [x] Run full public lint, typecheck, test, build and docs registry.
- [x] Run dependent Cloud lint, typecheck, test and composed Console checks.
- [x] Run dual-repository delivery audit; keep real registered-Server multi-Workspace smoke as a
      separately reported hosted-release gate.

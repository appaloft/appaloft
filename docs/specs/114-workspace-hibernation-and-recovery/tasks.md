# Workspace Hibernation And Recovery Tasks

## Sync And Spec

- [x] Accept ADR-097.
- [x] Define stable requirements and V1 non-claims.
- [x] Align ADR-091, domain model, workflow, operation map and roadmap.
- [x] Add the stable test matrix.

## Public Implementation

- [x] Grade pause and recovery portability capabilities.
- [x] Persist activity and observed suspension metadata.
- [x] Add quota admission and placement policy ports.
- [x] Implement maintenance-driven idle auto-suspend.
- [x] Implement Docker compute-released same-provider hibernation.
- [x] Fail closed on incompatible recovery placement.
- [x] Propagate safe descriptors through transports, generated SDK, CLI and Web.

## Verification

- [x] Pass core/application/provider targeted tests.
- [x] Pass Docker real-provider hibernate/restore smoke.
- [x] Pass public lint, typecheck, test and build.
- [x] Pass hosted composed integration checks.
- [x] Record registered Server acceptance and exact cleanup evidence.

# Tasks: JVM Framework Planner Contract And Spring Boot Tested Catalog

## Spec Round

- [x] Confirm PR #141 is merged and base this work on latest `main`.
- [x] Locate the behavior in `docs/BUSINESS_OPERATION_MAP.md` as workload framework
  detection/planning plus `deployments.plan`.
- [x] Read ADR-010, ADR-012, ADR-014, ADR-016, ADR-021, and ADR-023.
- [x] Record no-new-ADR rationale in the feature spec.
- [x] Create `docs/specs/016-jvm-framework-planner-contract-and-spring-boot-catalog/spec.md`.
- [x] Create `docs/specs/016-jvm-framework-planner-contract-and-spring-boot-catalog/plan.md`.
- [x] Create this task checklist.
- [x] Sync workflow/query/runtime-substrate docs with JVM planner contract boundaries.

## Test-First

- [x] Add stable JVM matrix ids for Spring Boot Maven with wrapper, Maven without wrapper, Gradle
  with wrapper, Gradle Kotlin DSL, generic JVM explicit fallback, generic deterministic jar
  fallback, build tool precedence, runnable jar discovery, actuator health, missing build tool,
  ambiguous Maven/Gradle evidence, missing runnable jar, missing production start, and
  internal-port behavior.
- [x] Bind existing and new fixture planner tests to the new JVM matrix ids.
- [x] Add `deployments.plan` catalog contract rows for ready JVM/Spring preview and blocked
  unsupported/ambiguous/missing JVM preview.
- [x] Add executable contract test coverage for `deployments.plan/v1` JVM catalog output shape.

## Implementation

- [x] Consolidate or refine reusable planner contract types/services only where tests reveal a
  catalog contract gap.
- [x] Add or update JVM/Spring fixture projects for Maven wrapper, Maven no wrapper, Gradle
  wrapper, Gradle Kotlin DSL, explicit fallback, deterministic generic jar, and blocked JVM
  evidence.
- [x] Ensure generated Dockerfile evidence includes JVM build tool, build/package command, start
  command, base image, artifact kind, health metadata, and internal HTTP verification metadata.
- [x] Ensure `deployments.create` remains ids-only and no JVM planner fields are accepted by
  deployment admission.

## Entrypoints And Docs

- [x] Update roadmap and implementation notes to mark Spring Boot tested catalog closure without
  claiming full real Docker/SSH fixture coverage.
- [x] Update `deployments.plan` query/test matrix status for JVM preview parity.
- [x] Record public docs/help outcome for this behavior.

## Verification

- [x] Run targeted runtime fixture tests.
- [x] Run targeted filesystem fixture tests.
- [x] Run targeted contracts test for deployment plan preview schema.
- [x] Run targeted typecheck or document why it was not run.

## Post-Implementation Sync

- [x] Reconcile feature artifact, roadmap, operation map, workflow docs, implementation plan, test
  matrices, public docs/help gaps, and executable test bindings.

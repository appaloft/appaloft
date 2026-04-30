# JVM Framework Planner Contract And Spring Boot Tested Catalog

## Status

- Round: Spec Round -> Test-First Round -> Code Round -> Post-Implementation Sync
- Artifact state: JVM/Spring Boot catalog hardening implemented; Post-Implementation Sync complete
- Roadmap target: Phase 5 First-Deploy Engine And Framework Breadth (`0.7.0` gate)
- Compatibility impact: `pre-1.0-policy`; hardens public preview output and planner diagnostics
  without adding deployment admission fields

## Business Outcome

Operators deploying JVM web services can see a stable, explainable workload plan before runtime
execution. Appaloft should identify JVM runtime evidence, Spring Boot framework evidence, selected
build tool, selected planner, Docker/OCI artifact intent, install/build/package/start command
specs, required port behavior, health defaults, and the fix path before `deployments.create`
starts.

This work reuses the framework planner contract established by the JavaScript/TypeScript and
Python catalog closures. The outcome is catalog confidence and a reusable family-planner pattern
for later Quarkus, Micronaut, Go, Ruby, PHP, .NET, Rust, and Elixir planners, not broader runtime
execution.

The deployment boundary remains:

```text
Resource profile -> detect -> plan -> deployments.plan preview
Resource profile -> detect -> plan -> deployments.create execution
```

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| JVM planner contract | Family-specific planner contract covering JVM evidence, build tool, runnable artifact, commands, artifact intent, port, health, and unsupported reasons. | Workload planning | JVM catalog contract |
| Spring Boot evidence | Maven/Gradle dependencies, plugins, wrapper files, and deterministic jar metadata that identify a Spring Boot web service. | Source inspection | Spring evidence |
| Build tool evidence | Detected or explicit JVM build tool choice that changes package/build/start rendering. | Source inspection | package manager evidence |
| Runnable jar evidence | Deterministic jar path or artifact naming rule used for `java -jar`. | Workload planning | jar artifact |
| Planner key | Stable selected planner id such as `spring-boot`, `generic-jvm`, or `generic-java`. | Workload planning | selected planner |
| Explicit fallback command | User/resource-profile supplied install/build/start command that makes a JVM source containerizable when framework or jar evidence is missing or unsafe. | Resource runtime profile | custom command fallback |
| Unsupported reason | Stable blocked reason describing missing, ambiguous, or unsupported JVM evidence and the fix path. | Deployment plan preview / errors | remediation reason |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| FPC-JVM-SPEC-001 | Stable JVM planner output | A supported JVM fixture has runtime, build tool, framework or generic jar evidence, command, network, and health evidence | Planner resolves it | Output includes planner key, support tier inputs, base image policy, build/package/start command specs, artifact kind, internal port behavior, health defaults, and safe diagnostics. |
| FPC-JVM-SPEC-002 | Spring Boot Maven with wrapper | A Spring Boot Maven fixture has `pom.xml`, `mvnw`, Spring Boot dependency/plugin evidence, `.java-version`, and deterministic jar output | Planner resolves it | Output uses wrapper build/package commands, `spring-boot` planner metadata, Java base image policy, workspace image artifact intent, `java -jar` start command, and resource-owned internal port. |
| FPC-JVM-SPEC-003 | Spring Boot Maven without wrapper | A Spring Boot Maven fixture has `pom.xml` and Spring Boot evidence but no wrapper | Planner resolves it | Output uses system Maven commands, records missing wrapper as non-fatal evidence, and uses the same Spring Boot artifact/start contract. |
| FPC-JVM-SPEC-004 | Spring Boot Gradle with wrapper | A Spring Boot Gradle fixture has `build.gradle`, `gradlew`, Spring Boot plugin/dependency evidence, and deterministic `build/libs/*.jar` output | Planner resolves it | Output uses wrapper Gradle commands, `spring-boot` planner metadata, Java base image policy, workspace image artifact intent, and deterministic `java -jar` start command. |
| FPC-JVM-SPEC-005 | Spring Boot Gradle Kotlin DSL | A Spring Boot Gradle Kotlin DSL fixture has `build.gradle.kts`, Gradle wrapper evidence, and Spring Boot plugin/dependency evidence | Planner resolves it | Output selects Gradle, records Kotlin DSL build file evidence, emits Gradle build/package commands, and uses the same Spring Boot artifact/start contract. |
| FPC-JVM-SPEC-006 | Generic JVM explicit fallback | A JVM source lacks supported framework evidence but resource runtime profile supplies explicit install/build/start commands | Planner resolves it | Output uses generic JVM/custom command fallback, keeps commands in resource runtime profile, and does not add framework/base-image fields to `deployments.create`. |
| FPC-JVM-SPEC-007 | Generic deterministic jar fallback | A JVM source has Maven or Gradle evidence plus exactly one deterministic runnable jar path | Planner resolves it | Output selects generic JVM planner behavior, packages a Docker/OCI image, and starts the jar with `java -jar` without pretending the framework is Spring Boot. |
| FPC-JVM-SPEC-008 | Unsupported or missing JVM evidence | JVM evidence has ambiguous Maven/Gradle roots, missing build tool, missing runnable jar, missing production start, unsupported framework, or missing internal port | Plan preview or deployment planning runs | Appaloft returns structured blocked reasons or `validation_error` without guessing, and points users to resource runtime/network configuration or explicit fallback commands. |
| FPC-JVM-SPEC-009 | Preview parity | Web, CLI, HTTP/oRPC, and future tool surfaces ask for a JVM deployment plan | They call `deployments.plan` | They receive the same `deployments.plan/v1` shape and do not reimplement JVM planner business logic. |

## Domain Ownership

- Bounded context: Release orchestration with workload-delivery planning input.
- Resource owns reusable source, runtime, network, health, and access profile fields.
- Deployment owns only admitted attempts and immutable snapshots after `deployments.create`.
- Runtime adapters own filesystem inspection, Maven/Gradle manifest parsing, Spring Boot evidence
  parsing, generated Dockerfile assets, rendered shell, Docker/Compose/SSH details, and opt-in real
  smoke execution.
- `deployments.plan` is the read-only preview operation for the same `detect -> plan` contract.

## Public Surfaces

- API/oRPC: `deployments.plan` returns the stable preview shape for JVM planner output.
- CLI: `appaloft deployments plan ...` renders the same evidence, artifact, command, network,
  health, warning, and unsupported reason data.
- Web/UI: Resource deployment preview uses the typed client result and does not hide JVM planner
  rules in Svelte.
- Config/headless: repository config and CLI draft fields map to resource profile fields before
  ids-only deployment admission.
- Events: not applicable; this behavior adds no new deployment lifecycle events.
- Public docs/help: existing deployment plan preview and resource source/runtime anchors describe
  preview and profile fix paths. No new page is required unless Code Round changes public copy,
  help anchors, or output fields beyond existing `deployments.plan/v1`.

## ADR Need Decision

No new ADR is required for this Spec Round. The behavior fits existing accepted decisions:

- ADR-010 keeps Quick Deploy as entry workflow input collection over explicit operations.
- ADR-012 places source/runtime/profile evidence on the Resource side and keeps deployment
  snapshots immutable.
- ADR-014 keeps `deployments.create` ids-only and forbids framework, package, base-image, and
  runtime preset fields on deployment admission.
- ADR-016 keeps retry, redeploy, rollback, cancel, reattach, and manual health-check commands out
  of the active deployment write surface.
- ADR-021 requires every v1 plan to produce, pull, or reference Docker/OCI image artifacts or a
  Compose project.
- ADR-023 keeps runtime target capabilities and orchestrator-specific rendering behind runtime
  target backends.

A new ADR is required before Appaloft accepts non-Docker JVM runtime substrates, public base-image
override fields, provider-specific buildpack/runtime preset fields, public JVM framework-specific
deployment commands, or new recovery write commands.

## Non-Goals

- Do not add `deployments.retry`, `deployments.redeploy`, `deployments.rollback`,
  `deployments.cancel`, or manual health-check commands.
- Do not change `deployments.create` from ids-only admission.
- Do not add source, runtime, network, framework, package name, Java version, Maven/Gradle field,
  jar path, base image, buildpack, JDK SDK, Spring SDK, Maven SDK, Gradle SDK, or provider SDK
  fields to `deployments.create`.
- Do not add non-Docker runtime substrate support.
- Do not execute Maven, Gradle, Java, Spring Boot, or application code during admission-time
  detection.
- Do not make buildpack-style detection the only Spring Boot support path. Buildpack-style
  detection may become an adapter-owned accelerator only after explicit planner output remains
  deterministic.
- Do not claim every JVM fixture has full real Docker/SSH smoke; headless Docker/OCI readiness is
  the catalog closure layer, with representative opt-in Docker smoke tracked separately.

## Open Questions

- None for Spring Boot tested catalog closure. Quarkus and Micronaut remain follow-up JVM planner
  rows that should reuse this contract rather than introduce new deployment inputs.

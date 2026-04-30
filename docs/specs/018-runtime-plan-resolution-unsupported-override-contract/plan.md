# Plan: Runtime Plan Resolution Unsupported/Override Contract

## Governing Sources

- Repository rules: `AGENTS.md`
- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-012, ADR-014, ADR-015, ADR-016, ADR-021, ADR-023, ADR-024, ADR-025
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Global contracts: `docs/errors/model.md`,
  `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs: `docs/workflows/workload-framework-detection-and-planning.md`,
  `docs/queries/deployments.plan.md`, `docs/commands/deployments.create.md`
- Test matrix: `docs/testing/workload-framework-detection-and-planning-test-matrix.md`,
  `docs/testing/deployment-plan-preview-test-matrix.md`
- Implementation plan: `docs/implementation/deployment-runtime-substrate-plan.md`
- Prior feature artifacts:
  `docs/specs/013-deployment-plan-preview/*`,
  `docs/specs/014-framework-planner-contract-and-js-ts-catalog/*`,
  `docs/specs/015-python-framework-planner-contract-and-asgi-wsgi-catalog/*`,
  `docs/specs/016-jvm-framework-planner-contract-and-spring-boot-catalog/*`,
  `docs/specs/017-buildpack-accelerator-contract-and-preview-guardrails/*`

## ADR Need Decision

No new ADR is required for this behavior.

Rationale:

- ADR-012 and ADR-014 already place source/runtime/network/health/profile ownership on Resource
  and keep `deployments.create` ids-only.
- ADR-015 already requires `ResourceNetworkProfile.internalPort` before inbound deployment
  admission unless it is deterministically inferred and persisted.
- ADR-016 keeps retry, redeploy, rollback, cancel, and manual health commands out of scope.
- ADR-021 already requires Docker/OCI-backed workload plans and makes detection/planning part of
  the deployment model.
- ADR-023 keeps runtime target capability checks and provider-specific rendering outside public
  deployment input.
- ADR-024 and ADR-025 keep repository config, source links, state ownership, and control-plane mode
  separate from deployment admission.

A new ADR is required before Appaloft changes the deployment admission command, accepts public
framework/buildpack/orchestrator fields, changes the Docker/OCI substrate, or makes a concrete
buildpack/runtime provider the canonical support path for mainstream frameworks.

## Architecture Approach

- Domain/application placement: keep the shared support tier, blocked reason, fix path, and
  override path as provider-neutral workload-planning contract values. Add core value objects only
  if implementation needs stable domain validation.
- Planner service placement: consolidate existing family/buildpack blocked-preview mapping behind
  runtime plan resolution helpers so each future family planner returns the same contract.
- Repository/specification/visitor impact: none; this is preview/planning contract hardening and
  does not add persistence shape.
- CQRS/read-model impact: `deployments.plan` remains a read-only query. `deployments.create`
  should reject matching unsupported/ambiguous/missing profile cases before attempt acceptance.
- Entrypoint impact: API/oRPC, CLI, Web, repository config/headless, and future MCP/tool metadata
  consume the same `deployments.plan/v1` shape and resource profile vocabulary.
- Runtime adapter impact: hermetic fake resolver or existing fake planner fixtures may prove the
  contract. Real Docker/buildpack/pack/lifecycle execution is out of scope.
- Public docs/help impact: update public help only if Code Round changes visible preview copy or
  introduces new anchors.

## Runtime Plan Resolution Contract

The implementation should expose one shared blocked-preview model:

- support tier: `first-class`, `explicit-custom`, `container-native`, `buildpack-accelerated`,
  `unsupported`, `ambiguous`, `requires-override`;
- blocked reason fields: `phase`, `reasonCode`, `message`, `evidence`, `fixPath`,
  `overridePath`, and optional `affectedProfileField`;
- shared reason codes:
  `unsupported-framework`, `unsupported-runtime-family`, `ambiguous-framework-evidence`,
  `ambiguous-build-tool`, `missing-build-tool`, `missing-start-intent`, `missing-build-intent`,
  `missing-internal-port`, `missing-source-root`, `missing-artifact-output`,
  `unsupported-runtime-target`, and `unsupported-container-native-profile`;
- family-specific reason codes can be represented as evidence/details but should map to the shared
  code in preview/readiness output.

## Roadmap And Compatibility

- Roadmap target: Phase 5 `0.7.0` gate.
- Version target: pre-`1.0.0`; no release version is changed by this feature artifact.
- Compatibility impact: additive/hardening under pre-`1.0-policy`. Public preview output gains
  stable reason/remediation shape; deployment write input remains unchanged.
- Release note: mention that unsupported/ambiguous/missing planner evidence now fails before
  execution with stable fix/override guidance once implementation lands.

## Testing Strategy

- Matrix ids: add `WF-PLAN-FAIL-001` through `WF-PLAN-FAIL-012` and
  `DPP-PLAN-FAIL-001` through `DPP-PLAN-FAIL-006`.
- Test-first rows:
  - blocked unsupported framework/runtime family;
  - ambiguous framework evidence;
  - ambiguous build tool;
  - missing build tool;
  - missing start/build intent with explicit override repair;
  - missing internal port for serverful/SSR;
  - static default port 80;
  - missing source root/base directory;
  - missing artifact output;
  - unsupported runtime target;
  - unsupported container-native profile;
  - buildpack candidate cannot override explicit planner/custom/container-native profile.
- Acceptance/e2e: contract/integration tests are sufficient for this round; no real Docker,
  buildpack lifecycle, SSH, or package installation is required.
- Test names must include the matrix ids they prove.

## Risks And Migration Gaps

- Existing family-specific reason codes may still appear in tests and preview output. The Code
  Round should either map them to the shared codes or record a precise migration gap.
- Some Web/CLI renderers may show only existing `unsupportedReasons` fields. They must not hide the
  new fix/override contract when the typed client exposes it.
- Future MCP/tool descriptor parity remains a migration gap until tool surfaces are active, but
  the metadata shape must be specified now.

## Post-Implementation Notes

The Code Round extended the `deployments.plan/v1` schema and application DTOs with optional
`reasonCode`, safe `evidence`, `fixPath`, `overridePath`, and `affectedProfileField` fields while
keeping existing `unsupportedReasons` compatibility. Expected runtime-plan validation failures in
`deployments.plan` now return a blocked preview instead of a whole-query error when the context is
otherwise readable. Contract tests use hermetic preview payloads for the shared reason/fix/override
shape and do not wire real Docker, buildpack, SSH, package installation, or framework CLI
execution.
